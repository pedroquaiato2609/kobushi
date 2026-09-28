import type { z } from 'zod';
import { NotFoundError, ValidationError } from '../../domain/errors';
import { normalizeName } from '../../domain/gym';
import { averagePagesPerDay, estimateDaysToFinish, isValidIsbn, normalizeIsbn, readingStreak } from '../../domain/reading';
import { paragraphsToHtml } from '../../domain/richText';
import type { BookLookup, BookSearch, BookSearchHit } from './bookLookup';
import type { FileStore } from '../library';
import { sanitizeRichHtml } from '../richText';
import type { Book, BookStatus, ReadingRepository, ReadingSession } from './ports';
import type { bookCreateSchema, bookUpdateSchema, sessionCreateSchema } from './schemas';

const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';
// Nunca SVG/HTML: são servidos na mesma origem do app. Sem HEIC/HEIF (padrão de câmera do iPhone): a maioria dos
// navegadores não exibe esse formato num <img>, então a capa apareceria quebrada em tudo que não é Safari —
// pior do que recusar o arquivo com uma mensagem clara.
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

/** Confere os primeiros bytes: o tipo declarado pelo navegador (ou pela câmera do celular) não é confiável. */
const looksLikeImage = (mime: string, d: Buffer) =>
  (mime === 'image/png' && d.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])))
  || (mime === 'image/jpeg' && d.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])))
  || (mime === 'image/webp' && d.subarray(0, 4).toString('latin1') === 'RIFF' && d.subarray(8, 12).toString('latin1') === 'WEBP')
  // AVIF é um contêiner ISO-BMFF (como o MP4): a "assinatura" é a caixa "ftyp" com a marca "avif"/"avis" a partir do byte 4.
  || (mime === 'image/avif' && d.subarray(4, 8).toString('latin1') === 'ftyp' && ['avif', 'avis'].includes(d.subarray(8, 12).toString('latin1')));

export interface BookOverview extends Book {
  pagesPerDay: number; daysToFinish: number | null; recentSessions: ReadingSession[];
}
export interface ReadingOverviewReport {
  reading: Book[]; wantToRead: Book[]; finishedThisYear: number; pagesThisMonth: number; minutesThisMonth: number;
  streak: number; totalBooks: number;
}

export class ReadingService {
  constructor(
    private repo: ReadingRepository, private lookup: BookLookup, private search: BookSearch, private files: FileStore, private timezone: string,
    private now: () => Date = () => new Date(),
    /** Integra com a rotina: registra o nível do dia na atividade "Leitura" (se existir) a partir das páginas lidas hoje. */
    private onSession: (dateStr: string, totalPagesOnDate: number) => Promise<void> = async () => undefined,
  ) {}

  private today() { return this.now().toLocaleDateString('en-CA', { timeZone: this.timezone }); }

  // ---- busca por ISBN ou por título/autor -------------------------------------------
  /**
   * Nunca deixa a busca externa travar o cadastro: se as fontes falharem ou não acharem nada (ISBN raro, fora
   * do ar, limite de uso), o próprio this.lookup (FallbackBookLookup) já tenta a capa direta do Open Library
   * antes de desistir de vez — aqui só falta o usuário completar o resto à mão, em vez de um erro que bloqueia
   * adicionar o livro.
   */
  async lookupIsbn(isbnRaw: string) {
    const isbn = normalizeIsbn(isbnRaw);
    if (!isValidIsbn(isbn)) throw new ValidationError('ISBN inválido — confira os dígitos (10 ou 13 dígitos, ISBN-13 costuma começar com 978).');
    const found = await this.lookup.find(isbn).catch(() => null);
    return { ...(found ?? { title: '', author: '', publisher: '', totalPages: null, coverUrl: null }), isbn };
  }

  /** Busca por título/autor (quando não se tem o ISBN em mãos): devolve candidatos para escolher, nunca lança erro. */
  searchBooks(query: string): Promise<BookSearchHit[]> {
    return this.search.search(query.trim()).catch(() => []);
  }

  // ---- livros -----------------------------------------------------------------------
  listBooks(f: { status?: BookStatus } = {}) { return this.repo.listBooks(f); }
  async getBook(id: string) { const b = await this.repo.getBook(id); if (!b) throw new NotFoundError('Livro'); return b; }

  async createBook(input: z.output<typeof bookCreateSchema>) {
    const isbn = input.isbn ? normalizeIsbn(input.isbn) : null;
    if (isbn && !isValidIsbn(isbn)) throw new ValidationError('ISBN inválido — confira os dígitos.');
    try {
      const status = input.status ?? 'quero_ler';
      return await this.repo.createBook({
        title: input.title, author: input.author ?? '', isbn, coverUrl: input.coverUrl ?? null, publisher: input.publisher ?? '',
        format: input.format ?? 'fisico', status, totalPages: input.totalPages ?? null,
        startedAt: status === 'lendo' ? this.today() : null,
      });
    } catch (e) { if (isUniqueViolation(e)) throw new ValidationError('Já existe um livro com esse ISBN.'); throw e; }
  }

  /** Aplica as transições automáticas de status a partir de currentPage/rating, sem sobrescrever o que a pessoa já escolheu explicitamente. */
  private autoStatus(cur: Book, patch: { currentPage?: number; status?: BookStatus }): { status?: BookStatus; startedAt?: string; finishedAt?: string | null } {
    const out: { status?: BookStatus; startedAt?: string; finishedAt?: string | null } = {};
    const nextPage = patch.currentPage ?? cur.currentPage;
    if (patch.status) {
      if (patch.status === 'lendo' && !cur.startedAt) out.startedAt = this.today();
      if (patch.status === 'lido' && !cur.finishedAt) out.finishedAt = this.today();
      if (patch.status !== 'lido' && cur.status === 'lido') out.finishedAt = null; // voltou a ler: não é mais "lido"
      return out;
    }
    // sem status explícito: só o avanço de página decide (nunca regride um status escolhido à mão para trás de "lendo")
    if (patch.currentPage !== undefined && cur.totalPages && nextPage >= cur.totalPages && cur.status !== 'lido') {
      out.status = 'lido'; out.finishedAt = cur.finishedAt ?? this.today();
    } else if (patch.currentPage !== undefined && nextPage > 0 && cur.status === 'quero_ler') {
      out.status = 'lendo'; out.startedAt = cur.startedAt ?? this.today();
    }
    return out;
  }

  async updateBook(id: string, patch: z.output<typeof bookUpdateSchema>) {
    const cur = await this.getBook(id);
    if (patch.totalPages && cur.currentPage > patch.totalPages) throw new ValidationError('O total de páginas não pode ser menor que a página atual.');
    if (patch.currentPage !== undefined && cur.totalPages && patch.currentPage > cur.totalPages) throw new ValidationError('A página atual não pode passar do total de páginas.');
    const isbn = patch.isbn !== undefined ? (patch.isbn ? normalizeIsbn(patch.isbn) : null) : undefined;
    if (isbn && !isValidIsbn(isbn)) throw new ValidationError('ISBN inválido — confira os dígitos.');
    const auto = this.autoStatus(cur, patch);
    const { notes, ...rest } = patch;
    try {
      const row = await this.repo.updateBook(id, { ...rest, ...(isbn !== undefined ? { isbn } : {}), ...(notes !== undefined ? { notes: sanitizeRichHtml(notes) } : {}), ...auto });
      return row as Book;
    } catch (e) { if (isUniqueViolation(e)) throw new ValidationError('Já existe um livro com esse ISBN.'); throw e; }
  }
  async removeBook(id: string) { if (!(await this.repo.deleteBook(id))) throw new NotFoundError('Livro'); }

  /** Acrescenta um parágrafo à nota do livro (usado pelo assistente — ele não reescreve a nota inteira, só acrescenta). */
  async addNote(bookId: string, content: string): Promise<Book> {
    const cur = await this.getBook(bookId);
    const row = await this.repo.updateBook(bookId, { notes: `${cur.notes}${paragraphsToHtml(content)}` });
    return row as Book;
  }

  // ---- capa enviada pelo usuário (foto tirada ou upload) ------------------------------
  async setCoverImage(id: string, data: Buffer, mime: string) {
    await this.getBook(id);
    if (!IMAGE_TYPES.has(mime)) throw new ValidationError('Envie uma imagem PNG, JPEG, WebP ou AVIF.');
    if (!looksLikeImage(mime, data)) throw new ValidationError('O arquivo não parece ser uma imagem válida.');
    if (data.length === 0 || data.length > 5 * 1024 * 1024) throw new ValidationError('A imagem precisa ter até 5 MB.');
    const old = await this.repo.coverImageOf(id);
    const storage = crypto.randomUUID();
    await this.files.save(storage, data);
    await this.repo.setCoverImage(id, { storage, mime });
    await this.repo.updateBook(id, { coverUrl: `/api/reading/books/${id}/cover-image?v=${storage}` });
    if (old) await this.files.remove(old.storage);
  }
  async removeCoverImage(id: string) {
    const old = await this.repo.coverImageOf(id);
    if (!old) return;
    await this.repo.setCoverImage(id, null);
    await this.repo.updateBook(id, { coverUrl: null });
    await this.files.remove(old.storage);
  }
  async coverImageInfo(id: string) {
    const img = await this.repo.coverImageOf(id);
    if (!img) throw new NotFoundError('Capa');
    return { path: this.files.path(img.storage), mime: img.mime };
  }

  /** Aceita id ou título (para o assistente): exato, depois inclusão nos dois sentidos, e erro com sugestões se ambíguo/sem nada parecido. */
  async resolveBook(nameOrId: string): Promise<Book> {
    if (/^[0-9a-f-]{36}$/i.test(nameOrId)) { const b = await this.repo.getBook(nameOrId); if (b) return b; }
    const all = await this.repo.listBooks({});
    const want = normalizeName(nameOrId);
    const exact = all.filter((b) => normalizeName(b.title) === want);
    if (exact.length === 1) return exact[0];
    const partial = all.filter((b) => { const n = normalizeName(b.title); return n.includes(want) || want.includes(n); });
    if (partial.length === 1) return partial[0];
    if (partial.length === 0) throw new ValidationError(`Não achei "${nameOrId}" na estante. Cadastre com reading_add_book (pode ser por ISBN) ou confira o título.`);
    throw new ValidationError(`Mais de um livro combina com "${nameOrId}": ${partial.slice(0, 8).map((b) => b.title).join('; ')}. Pergunte ao usuário qual, uma única vez.`);
  }

  // ---- sessões de leitura -------------------------------------------------------------
  async logSession(bookId: string, input: z.output<typeof sessionCreateSchema>) {
    if (input.pages == null && input.minutes == null) throw new ValidationError('Informe páginas e/ou minutos lidos.');
    const book = await this.getBook(bookId);
    const session = await this.repo.createSession(bookId, { date: input.date, pages: input.pages ?? null, minutes: input.minutes ?? null, note: input.note ?? '' });
    if (input.pages) {
      const nextPage = Math.min(book.currentPage + input.pages, book.totalPages ?? Infinity);
      await this.updateBook(bookId, { currentPage: nextPage });
    } else if (book.status === 'quero_ler') {
      await this.updateBook(bookId, { status: 'lendo' });
    }
    const totalToday = await this.repo.pagesOnDate(input.date);
    await this.onSession(input.date, totalToday).catch(() => undefined); // integrar com a rotina nunca impede de registrar a sessão
    return session;
  }
  listSessions(bookId: string, limit?: number) { return this.repo.listSessions(bookId, limit); }
  async removeSession(id: string) { const s = await this.repo.deleteSession(id); if (!s) throw new NotFoundError('Sessão de leitura'); return s; }

  // ---- painel -----------------------------------------------------------------------
  async bookOverview(id: string): Promise<BookOverview> {
    const book = await this.getBook(id);
    const sessions = await this.repo.listSessions(id);
    const pagesPerDay = averagePagesPerDay(sessions);
    return { ...book, pagesPerDay, daysToFinish: estimateDaysToFinish(book.currentPage, book.totalPages, pagesPerDay), recentSessions: sessions.slice(0, 10) };
  }

  async overview(): Promise<ReadingOverviewReport> {
    const today = this.today();
    const monthStart = `${today.slice(0, 7)}-01`;
    const [books, monthSessions, dates] = await Promise.all([
      this.repo.listBooks({}), this.repo.sessionsInRange(monthStart, today), this.repo.sessionDates(400),
    ]);
    const yearPrefix = today.slice(0, 4);
    return {
      reading: books.filter((b) => b.status === 'lendo'),
      wantToRead: books.filter((b) => b.status === 'quero_ler'),
      finishedThisYear: books.filter((b) => b.finishedAt?.startsWith(yearPrefix)).length,
      pagesThisMonth: monthSessions.reduce((n, s) => n + (s.pages ?? 0), 0),
      minutesThisMonth: monthSessions.reduce((n, s) => n + (s.minutes ?? 0), 0),
      streak: readingStreak(dates, today),
      totalBooks: books.length,
    };
  }
}
