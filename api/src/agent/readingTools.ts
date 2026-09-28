// Ferramentas do assistente para a Leitura. Leituras são livres; adicionar/alterar livros e registrar sessões
// sempre passa pela confirmação do usuário, mostrando exatamente o que será gravado.
import { z } from 'zod';
import type { ReadingService } from '../application/reading/service';
import { bookCreateSchema, sessionCreateSchema } from '../application/reading/schemas';
import { id } from '../application/schemas';
import { textFromHtml } from '../domain/richText';
import { tool, type ToolDefinition } from './toolTypes';

const R = { resource: 'reading' as const, group: 'reading' as const, action: 'read' as const };
const fmtProgress = (currentPage: number, totalPages: number | null) => (totalPages ? `${currentPage}/${totalPages} páginas` : `${currentPage} páginas`);
const STATUS_LABEL: Record<string, string> = { quero_ler: 'quero ler', lendo: 'lendo', pausado: 'pausado', lido: 'lido', abandonado: 'abandonado' };

export function buildReadingTools(rd: ReadingService): ToolDefinition[] {
  return [
    tool({ name: 'reading_list_books', ...R, label: 'a estante de livros',
      description: 'Lista os livros cadastrados (título, autor, status, progresso). Filtre por status quando o usuário perguntar algo específico (ex.: "o que estou lendo").',
      schema: z.object({ status: z.enum(['quero_ler', 'lendo', 'pausado', 'lido', 'abandonado']).optional() }),
      run: async (a) => (await rd.listBooks(a)).map((b) => ({
        id: b.id, titulo: b.title, autor: b.author || undefined, status: STATUS_LABEL[b.status], progresso: fmtProgress(b.currentPage, b.totalPages),
        avaliacao: b.rating ?? undefined, formato: b.format,
      })) }),
    tool({ name: 'reading_book_detail', ...R, label: 'os detalhes de um livro',
      description: 'Progresso, ritmo de leitura (páginas/dia), estimativa de dias para terminar e as últimas sessões de um livro.',
      schema: z.object({ book: z.string().min(1).max(200).describe('título ou id do livro') }),
      run: async ({ book }) => {
        const b = await rd.resolveBook(book);
        const o = await rd.bookOverview(b.id);
        return {
          titulo: o.title, autor: o.author || undefined, status: STATUS_LABEL[o.status], progresso: fmtProgress(o.currentPage, o.totalPages),
          paginasPorDia: o.pagesPerDay, diasParaTerminar: o.daysToFinish ?? undefined,
          anotacoes: o.notes ? textFromHtml(o.notes) || undefined : undefined,
          ultimasSessoes: o.recentSessions.map((s) => ({ data: s.date, paginas: s.pages ?? undefined, minutos: s.minutes ?? undefined, nota: s.note || undefined })),
        };
      } }),
    tool({ name: 'reading_overview', ...R, label: 'o panorama da leitura',
      description: 'Resumo: livros sendo lidos agora, fila de "quero ler", livros terminados este ano, páginas/minutos lidos este mês e a sequência de dias seguidos lendo.',
      schema: z.object({}),
      run: async () => {
        const o = await rd.overview();
        return {
          lendoAgora: o.reading.map((b) => ({ titulo: b.title, progresso: fmtProgress(b.currentPage, b.totalPages) })),
          filaQueroLer: o.wantToRead.map((b) => b.title),
          terminadosEsteAno: o.finishedThisYear, paginasEsteMes: o.pagesThisMonth, minutosEsteMes: o.minutesThisMonth,
          sequenciaDias: o.streak, totalDeLivros: o.totalBooks,
        };
      } }),

    tool({ name: 'reading_add_book', resource: 'reading', group: 'reading', action: 'create', label: 'um livro', defaultMode: 'confirm',
      description: 'Adiciona um livro à estante. Se o usuário der o ISBN, use reading_lookup_isbn ANTES para preencher título/autor/páginas/capa automaticamente — não invente esses dados. Sem ISBN, cadastre com o que o usuário informou (título é obrigatório, o resto pode ficar em branco e ser completado depois).',
      schema: bookCreateSchema,
      prepare: async (a) => ({ args: a, summary: [
        `Livro: ${a.title}`, ...(a.author ? [`Autor: ${a.author}`] : []), ...(a.totalPages ? [`${a.totalPages} páginas`] : []),
        `Status: ${STATUS_LABEL[a.status ?? 'quero_ler']}`,
      ] }),
      run: async (a) => { const b = await rd.createBook(bookCreateSchema.parse(a)); return { ok: true, id: b.id, titulo: b.title }; } }),
    tool({ name: 'reading_lookup_isbn', resource: 'reading', group: 'reading', action: 'read',
      label: 'dados de um livro pelo ISBN',
      description: 'Busca título, autor, número de páginas e capa a partir do ISBN (10 ou 13 dígitos), num serviço público. Use antes de reading_add_book quando o usuário der um ISBN.',
      schema: z.object({ isbn: z.string().min(8).max(20) }),
      run: async ({ isbn }) => {
        const r = await rd.lookupIsbn(isbn);
        return r.title ? { encontrado: true, ...r } : { encontrado: false, isbn: r.isbn, capa: r.coverUrl, aviso: 'Não achei metadados para esse ISBN; a capa pode existir mesmo assim. Peça o título ao usuário.' };
      } }),
    tool({ name: 'reading_search_books', resource: 'reading', group: 'reading', action: 'read',
      label: 'livros por título/autor',
      description: 'Busca livros por título e/ou autor (quando o usuário não sabe o ISBN), devolvendo candidatos com capa. Mostre as opções e confirme qual é antes de usar reading_add_book — nunca escolha sozinho quando houver mais de um resultado parecido.',
      schema: z.object({ q: z.string().min(2).max(200).describe('título e/ou autor, ex.: "duna frank herbert"') }),
      run: async ({ q }) => {
        const hits = await rd.searchBooks(q);
        return hits.slice(0, 8).map((h) => ({ titulo: h.title, autor: h.author || undefined, isbn: h.isbn ?? undefined, ano: h.year ?? undefined, capa: h.coverUrl ?? undefined, paginas: h.totalPages ?? undefined }));
      } }),
    tool({ name: 'reading_update_book', resource: 'reading', group: 'reading', action: 'update', label: 'um livro', defaultMode: 'confirm',
      description: 'Altera um livro (status, página atual, avaliação 1-5). Consulte reading_list_books para o id, ou informe o título em vez do id. Para anotações, use reading_add_note (acrescenta ao final; não reescreve a nota inteira).',
      schema: z.object({
        book: z.string().min(1).max(200).describe('título ou id do livro'),
        status: z.enum(['quero_ler', 'lendo', 'pausado', 'lido', 'abandonado']).optional(),
        currentPage: z.number().int().min(0).max(20000).optional(),
        rating: z.number().int().min(1).max(5).nullable().optional(),
      }),
      prepare: async (a) => {
        const b = await rd.resolveBook(a.book);
        return { args: { id: b.id, status: a.status, currentPage: a.currentPage, rating: a.rating },
          summary: [`Alterar "${b.title}"`, ...(a.status ? [`Status: ${STATUS_LABEL[a.status]}`] : []), ...(a.currentPage !== undefined ? [`Página atual: ${a.currentPage}`] : []), ...(a.rating !== undefined && a.rating !== null ? [`Avaliação: ${a.rating}/5`] : [])] };
      },
      run: async (a) => { const { id: bid, ...patch } = a as { id: string } & Record<string, unknown>; const b = await rd.updateBook(bid, patch); return { ok: true, id: b.id }; } }),
    tool({ name: 'reading_add_note', resource: 'reading', group: 'reading', action: 'update', label: 'uma anotação', defaultMode: 'confirm',
      description: 'Acrescenta um parágrafo ao final das anotações do livro (não apaga nem reescreve o que já existe). Use quando o usuário pedir para anotar/guardar algo sobre o livro numa conversa.',
      schema: z.object({
        book: z.string().min(1).max(200).describe('título ou id do livro'),
        content: z.string().min(1).max(2000),
      }),
      prepare: async (a) => {
        const b = await rd.resolveBook(a.book);
        return { args: { id: b.id, content: a.content }, summary: [`Anotar em "${b.title}"`, a.content] };
      },
      run: async (a) => { const { id: bid, content } = a as { id: string; content: string }; await rd.addNote(bid, content); return { ok: true }; } }),
    tool({ name: 'reading_log_session', resource: 'reading', group: 'reading', action: 'create', label: 'uma sessão de leitura', defaultMode: 'confirm',
      description: 'Registra que o usuário leu um livro num dia: páginas e/ou minutos (pelo menos um dos dois). Atualiza o progresso do livro automaticamente e, se existir uma atividade de rotina chamada "Leitura", marca o dia dela.',
      schema: z.object({ book: z.string().min(1).max(200).describe('título ou id do livro'), ...sessionCreateSchema.shape }),
      prepare: async (a) => {
        const b = await rd.resolveBook(a.book);
        return { args: { id: b.id, date: a.date, pages: a.pages, minutes: a.minutes, note: a.note },
          summary: [`"${b.title}"`, [a.pages ? `${a.pages} páginas` : null, a.minutes ? `${a.minutes} min` : null].filter(Boolean).join(' · ') || '—', `Data: ${a.date}`] };
      },
      run: async (a) => { const { id: bid, ...rest } = a as { id: string } & z.infer<typeof sessionCreateSchema>; const s = await rd.logSession(bid, sessionCreateSchema.parse(rest)); return { ok: true, id: s.id }; } }),
  ];
}
