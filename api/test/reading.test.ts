import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BookLookup, BookLookupResult, BookSearch } from '../src/application/reading/bookLookup';
import { FallbackBookLookup } from '../src/application/reading/bookLookup';
import { ReadingService } from '../src/application/reading/service';
import type { Book, ReadingRepository, ReadingSession } from '../src/application/reading/ports';
import { bookUpdateSchema } from '../src/application/reading/schemas';
import {
  averagePagesPerDay, estimateDaysToFinish, isValidIsbn, normalizeIsbn, pagesGoalOf, readingStreak,
} from '../src/domain/reading';

// ---- domínio (funções puras) -----------------------------------------------------------

test('ISBN: normaliza (tira hífen/espaço) e valida o dígito verificador dos dois formatos', () => {
  assert.equal(normalizeIsbn('978-0-13-468599-1'), '9780134685991');
  assert.equal(normalizeIsbn('0-306-40615-2'), '0306406152');
  assert.ok(isValidIsbn('9780134685991')); // ISBN-13 válido
  assert.ok(isValidIsbn('0-306-40615-2')); // ISBN-10 válido, com hífens
  assert.ok(!isValidIsbn('9780134685992')); // dígito verificador errado
  assert.ok(!isValidIsbn('123')); // tamanho errado
  assert.ok(!isValidIsbn('abcdefghij'));
});

test('ritmo: páginas/dia é a média só dos dias em que algo foi lido, e a previsão usa o restante ÷ ritmo', () => {
  const s = (date: string, pages: number): { date: string; pages: number; minutes: null } => ({ date, pages, minutes: null });
  assert.equal(averagePagesPerDay([s('2026-01-01', 20), s('2026-01-02', 30), s('2026-01-02', 10)]), 30); // dia 2: 30+10=40 -> média (20+40)/2=30
  assert.equal(averagePagesPerDay([]), 0);
  assert.equal(estimateDaysToFinish(50, 300, 25), 10); // faltam 250, a 25/dia
  assert.equal(estimateDaysToFinish(300, 300, 25), 0); // já terminou
  assert.equal(estimateDaysToFinish(50, null, 25), null); // sem total de páginas, sem previsão
  assert.equal(estimateDaysToFinish(50, 300, 0), null); // sem ritmo, sem previsão
});

test('sequência: dias seguidos com sessão, terminando hoje ou ontem (um dia sem registro ainda não quebra até acabar)', () => {
  assert.equal(readingStreak(['2026-01-05', '2026-01-04', '2026-01-03'], '2026-01-05'), 3);
  assert.equal(readingStreak(['2026-01-04', '2026-01-03'], '2026-01-05'), 2); // nada hoje ainda, mas ontem sim: conta
  assert.equal(readingStreak(['2026-01-02'], '2026-01-05'), 0); // quebrou há mais de 1 dia
  assert.equal(readingStreak([], '2026-01-05'), 0);
});

test('pagesGoalOf: extrai o primeiro número de uma meta em texto livre da atividade de rotina', () => {
  assert.equal(pagesGoalOf('20 páginas'), 20);
  assert.equal(pagesGoalOf('1 capítulo'), 1);
  assert.equal(pagesGoalOf('sem número aqui'), null);
});

// ---- serviço (repositório em memória) ----------------------------------------------------

function memReading() {
  const books: Book[] = [];
  const sessions: ReadingSession[] = [];
  const covers = new Map<string, { storage: string; mime: string }>();
  let n = 0;
  const repo: ReadingRepository = {
    listBooks: async (f) => books.filter((b) => !b.archived && (!f.status || b.status === f.status)),
    getBook: async (id) => books.find((b) => b.id === id) ?? null,
    createBook: async (d) => {
      const b: Book = { id: `b${++n}`, currentPage: 0, rating: null, notes: '', finishedAt: null, archived: false, createdAt: new Date(), updatedAt: new Date(), ...d };
      books.push(b); return b;
    },
    updateBook: async (id, patch) => {
      const b = books.find((x) => x.id === id); if (!b) return null;
      Object.assign(b, patch, { updatedAt: new Date() }); return b;
    },
    deleteBook: async (id) => { const i = books.findIndex((b) => b.id === id); if (i < 0) return false; books.splice(i, 1); return true; },
    listSessions: async (bookId, limit = 200) => sessions.filter((s) => s.bookId === bookId).slice(0, limit),
    createSession: async (bookId, d) => { const s: ReadingSession = { id: `s${sessions.length + 1}`, bookId, createdAt: new Date(), ...d }; sessions.push(s); return s; },
    deleteSession: async (id) => { const i = sessions.findIndex((s) => s.id === id); if (i < 0) return null; return sessions.splice(i, 1)[0]; },
    sessionsInRange: async (from, to) => sessions.filter((s) => s.date >= from && s.date <= to),
    pagesOnDate: async (date) => sessions.filter((s) => s.date === date).reduce((n, s) => n + (s.pages ?? 0), 0),
    sessionDates: async () => [...new Set(sessions.map((s) => s.date))].sort(),
    coverImageOf: async (id) => covers.get(id) ?? null,
    setCoverImage: async (id, img) => { if (img) covers.set(id, img); else covers.delete(id); },
  };
  return { repo, books, sessions, covers };
}

const stubLookup = (result: BookLookupResult | null): BookLookup => ({ find: async () => result });
const noSearch: BookSearch = { search: async () => [] };
const noFiles = { save: async () => undefined, remove: async () => undefined, path: (n: string) => n };
/** Guarda os bytes de verdade (em memória), para testar o upload/remoção de capa. */
function memFiles() {
  const store = new Map<string, Buffer>();
  return { store, save: async (name: string, data: Buffer) => { store.set(name, data); }, remove: async (name: string) => { store.delete(name); }, path: (name: string) => name };
}

// A capa "de emergência" (direta por ISBN, sem metadados) é responsabilidade do FallbackBookLookup, não do
// ReadingService — ele só repassa o que this.lookup devolver. Por isso essa checagem (que sai na rede de
// verdade) é injetável: aqui um stub, sem tocar a rede; o comportamento real está testado abaixo, em
// "FallbackBookLookup: ...".
const stubCover = async (isbn: string) => `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
const noCover = async () => null;

test('lookupIsbn: recusa ISBN inválido antes de sair buscando; ISBN válido sem resultado em lugar nenhum ainda devolve a capa "de emergência" do Open Library', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  await assert.rejects(rd.lookupIsbn('123'), /ISBN inválido/);
  const r = await rd.lookupIsbn('978-0-13-468599-1'); // stubLookup(null): não achou nada, e o ReadingService não busca capa sozinho
  assert.equal(r.title, '');
  assert.equal(r.coverUrl, null);
  assert.equal(r.isbn, '9780134685991');

  const withFallback = new ReadingService(repo, new FallbackBookLookup([stubLookup(null)], stubCover), noSearch, noFiles, 'America/Sao_Paulo');
  const r2 = await withFallback.lookupIsbn('978-0-13-468599-1');
  assert.match(r2.coverUrl!, /covers\.openlibrary\.org/); // agora sim, via FallbackBookLookup
});

test('lookupIsbn: uma fonte fora do ar (ex.: 429 do Google Books) nunca trava o cadastro — o FallbackBookLookup ainda tenta a capa "de emergência"', async () => {
  const { repo } = memReading();
  const flaky: BookLookup = { find: async () => { throw new Error('Busca do livro falhou (429).'); } };
  const rd = new ReadingService(repo, new FallbackBookLookup([flaky], stubCover), noSearch, noFiles, 'America/Sao_Paulo');
  const r = await rd.lookupIsbn('9780134685991'); // não deve rejeitar
  assert.equal(r.title, '');
  assert.match(r.coverUrl!, /covers\.openlibrary\.org/);
});

test('FallbackBookLookup: pula para a próxima fonte quando uma falha ou não acha, e combina o que cada uma tem', async () => {
  const rateLimited: BookLookup = { find: async () => { throw new Error('429'); } };
  const empty: BookLookup = { find: async () => null };
  const partial: BookLookup = { find: async () => ({ title: 'Duna', author: '', publisher: '', totalPages: null, coverUrl: null }) };
  const withCover: BookLookup = { find: async () => ({ title: '', author: 'Frank Herbert', publisher: '', totalPages: 688, coverUrl: 'https://exemplo/capa.jpg' }) };

  const fb1 = new FallbackBookLookup([rateLimited, partial, withCover], noCover);
  const r1 = await fb1.find('9780134685991');
  assert.equal(r1!.title, 'Duna'); // veio da 2ª fonte (a 1ª falhou)
  assert.equal(r1!.author, 'Frank Herbert'); // veio da 3ª fonte, que a 2ª não tinha
  assert.equal(r1!.coverUrl, 'https://exemplo/capa.jpg');

  const fb2 = new FallbackBookLookup([rateLimited, empty], noCover); // stub sem capa nenhuma: nem a "de emergência" existe
  assert.equal(await fb2.find('9780134685991'), null); // nenhuma fonte achou nada, nem capa: null mesmo
});

test('criar livro: status "lendo" já marca a data de início; ISBN inválido é recusado', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo', () => new Date('2026-03-10T12:00:00Z'));
  const b = await rd.createBook({ title: 'Clean Code', author: 'Robert Martin', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'lendo', totalPages: 400 });
  assert.equal(b.startedAt, '2026-03-10');
  await assert.rejects(rd.createBook({ title: 'X', author: '', isbn: '123', coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null }), /ISBN inválido/);
});

test('progresso: chegar ao total de páginas vira "lido" com data automática; não regride status escolhido à mão', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo', () => new Date('2026-03-15T12:00:00Z'));
  const b = await rd.createBook({ title: 'Duna', author: 'Frank Herbert', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'lendo', totalPages: 100 });
  const mid = await rd.updateBook(b.id, { currentPage: 50 });
  assert.equal(mid.status, 'lendo'); // meio do livro: continua "lendo"
  const done = await rd.updateBook(b.id, { currentPage: 100 });
  assert.equal(done.status, 'lido');
  assert.equal(done.finishedAt, '2026-03-15');
});

test('não deixa a página atual passar do total, nem o total ficar menor que a página já lida', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'Sapiens', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'lendo', totalPages: 100 });
  await rd.updateBook(b.id, { currentPage: 80 });
  await assert.rejects(rd.updateBook(b.id, { currentPage: 120 }), /não pode passar do total/);
  await assert.rejects(rd.updateBook(b.id, { totalPages: 50 }), /não pode ser menor/);
});

test('PATCH parcial: bookUpdateSchema NÃO preenche os campos omitidos com o padrão do create (senão sobrescreveria autor/status já salvos)', () => {
  const parsed = bookUpdateSchema.parse({ rating: 5 });
  assert.equal(parsed.author, undefined);
  assert.equal(parsed.status, undefined);
  assert.equal(parsed.format, undefined);
  assert.equal(parsed.publisher, undefined);
  assert.equal(parsed.rating, 5);
});

test('avaliar um livro (PATCH só com "rating", como o formulário realmente envia) preserva autor e status', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'Clean Code', author: 'Robert C. Martin', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'lido', totalPages: 464 });
  const patch = bookUpdateSchema.parse({ rating: 5 }); // só o que o formulário de avaliação manda, de verdade
  const after = await rd.updateBook(b.id, patch);
  assert.equal(after.rating, 5);
  assert.equal(after.author, 'Robert C. Martin'); // não foi apagado
  assert.equal(after.status, 'lido'); // não voltou para "quero_ler"
});

test('sessão: soma páginas ao progresso (sem passar do total), sai de "quero ler" e integra com a atividade de rotina "Leitura"', async () => {
  const { repo } = memReading();
  const calls: { date: string; total: number }[] = [];
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo', () => new Date(), async (date, total) => { calls.push({ date, total }); });
  const b = await rd.createBook({ title: 'O Hobbit', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: 30 });
  await rd.logSession(b.id, { date: '2026-04-01', pages: 20, minutes: null, note: '' });
  const afterFirst = await rd.getBook(b.id);
  assert.equal(afterFirst.status, 'lendo'); // uma sessão já tira da fila "quero ler"
  assert.equal(afterFirst.currentPage, 20);
  await rd.logSession(b.id, { date: '2026-04-01', pages: 25, minutes: null, note: '' }); // 20+25=45, mas o total é 30
  const afterSecond = await rd.getBook(b.id);
  assert.equal(afterSecond.currentPage, 30);
  assert.equal(afterSecond.status, 'lido');
  assert.deepEqual(calls, [{ date: '2026-04-01', total: 20 }, { date: '2026-04-01', total: 45 }]); // soma bruta do dia, não limitada pelo total do livro
});

test('sessão só de minutos (sem páginas) também sai de "quero ler", mesmo sem mexer no progresso', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'Áudio livro', author: '', isbn: null, coverUrl: null, publisher: '', format: 'audiobook', status: 'quero_ler', totalPages: null });
  await rd.logSession(b.id, { date: '2026-04-01', pages: null, minutes: 40, note: 'ouvindo no trajeto' });
  const after = await rd.getBook(b.id);
  assert.equal(after.status, 'lendo');
  assert.equal(after.currentPage, 0);
});

test('resolver por título: exato (mesmo com outro parecido no acervo), ambíguo e inexistente', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  await rd.createBook({ title: 'Duna', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await rd.createBook({ title: 'Duna Messias', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  const exact = await rd.resolveBook('Duna'); // bate exato num, mesmo o outro contendo "Duna" também
  assert.equal(exact.title, 'Duna');
  await rd.createBook({ title: 'Sobre o Universo', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await rd.createBook({ title: 'Universo Elegante', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await assert.rejects(rd.resolveBook('Universo'), /Mais de um livro.*Sobre o Universo.*Universo Elegante/s); // "Universo" contido nos dois, sem bater exato em nenhum
  await assert.rejects(rd.resolveBook('Livro que não existe'), /Não achei/);
});

test('painel: separa "lendo"/"quero ler", conta terminados no ano e soma páginas/minutos do mês', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo', () => new Date('2026-05-20T12:00:00Z'));
  const reading = await rd.createBook({ title: 'Em andamento', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'lendo', totalPages: 200 });
  await rd.createBook({ title: 'Na fila', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  const finished = await rd.createBook({ title: 'Terminado', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'lendo', totalPages: 10 });
  await rd.updateBook(finished.id, { currentPage: 10 }); // vira "lido" automaticamente, com finishedAt = hoje (2026)
  await rd.logSession(reading.id, { date: '2026-05-19', pages: 15, minutes: 30, note: '' });
  await rd.logSession(reading.id, { date: '2026-04-01', pages: 100, minutes: 0, note: '' }); // mês anterior: fora do resumo do mês
  const o = await rd.overview();
  assert.equal(o.reading.length, 1);
  assert.equal(o.wantToRead.length, 1);
  assert.equal(o.finishedThisYear, 1);
  assert.equal(o.pagesThisMonth, 15);
  assert.equal(o.minutesThisMonth, 30);
  assert.equal(o.totalBooks, 3);
});

// ---- busca por título/autor --------------------------------------------------------------

test('searchBooks: devolve os candidatos da fonte, e nunca lança erro (mesmo se a fonte falhar, devolve lista vazia)', async () => {
  const { repo } = memReading();
  const hits = [{ title: 'Duna', author: 'Frank Herbert', isbn: '9780441013593', coverUrl: 'https://x/capa.jpg', year: '1965', totalPages: 688 }];
  const rd = new ReadingService(repo, stubLookup(null), { search: async (q) => (q === 'duna' ? hits : []) }, noFiles, 'America/Sao_Paulo');
  assert.deepEqual(await rd.searchBooks('duna'), hits);
  assert.deepEqual(await rd.searchBooks('nada a ver'), []);

  const flakySearch = { search: async () => { throw new Error('fora do ar'); } };
  const rd2 = new ReadingService(repo, stubLookup(null), flakySearch, noFiles, 'America/Sao_Paulo');
  assert.deepEqual(await rd2.searchBooks('duna'), []); // não trava a tela de busca
});

test('FallbackBookSearch: usa a 1ª fonte que devolver algo; uma vazia ou fora do ar não impede a próxima', async () => {
  const { FallbackBookSearch } = await import('../src/application/reading/bookLookup');
  const empty: BookSearch = { search: async () => [] };
  const broken: BookSearch = { search: async () => { throw new Error('429'); } };
  const good: BookSearch = { search: async () => [{ title: 'Duna', author: '', isbn: null, coverUrl: null, year: null, totalPages: null }] };
  const fb = new FallbackBookSearch([broken, empty, good]);
  const r = await fb.search('duna');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Duna');
});

// Regressão: a busca em texto livre de algumas fontes (Open Library, sobretudo) às vezes "acha" um livro sem
// nenhuma palavra em comum com o pedido, quando não existe nada parecido de verdade (ex.: pedir "Relatos de um
// gato viajante" e a fonte devolver "Puritanos", sem nada a ver). Isso não pode aparecer como resultado.
test('FallbackBookSearch: descarta resultado sem nenhuma palavra em comum com a busca (ruído de busca em texto livre)', async () => {
  const { FallbackBookSearch } = await import('../src/application/reading/bookLookup');
  const noisy: BookSearch = { search: async () => [{ title: 'Puritanos', author: '', isbn: null, coverUrl: null, year: '2015', totalPages: null }] };
  const fb = new FallbackBookSearch([noisy]);
  assert.deepEqual(await fb.search('Relatos de um gato viajante'), []); // "de"/"um" são stopwords; nenhuma palavra de verdade bate
});

test('FallbackBookSearch: mantém o que tem alguma palavra em comum (mesmo só no autor), e completa a capa que faltou usando o ISBN', async () => {
  const { FallbackBookSearch } = await import('../src/application/reading/bookLookup');
  const src: BookSearch = { search: async () => [
    { title: 'Dune', author: 'Frank Herbert', isbn: '9780441013593', coverUrl: null, year: '1965', totalPages: null }, // capa faltando, mas tem ISBN
    { title: 'Puritanos', author: '', isbn: null, coverUrl: null, year: '2015', totalPages: null }, // sem relação nenhuma: descartado
  ] };
  const fb = new FallbackBookSearch([src], stubCover);
  const r = await fb.search('duna frank herbert');
  assert.equal(r.length, 1);
  assert.equal(r[0].title, 'Dune');
  assert.match(r[0].coverUrl!, /covers\.openlibrary\.org.*9780441013593/);
});

// ---- capa enviada pelo usuário (foto/upload) -----------------------------------------------

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
// caixa "ftyp" com a marca "avif" (ISO-BMFF, mesmo esquema do AVIF de verdade) — tamanho da caixa não importa pra checagem.
const AVIF_MAGIC = Buffer.from([0, 0, 0, 0x1c, ...Buffer.from('ftyp', 'latin1'), ...Buffer.from('avif', 'latin1'), 0, 0, 0, 0]);

test('capa: enviar uma imagem válida grava o arquivo e passa a apontar coverUrl para a rota de servir; remover apaga os dois', async () => {
  const { repo } = memReading();
  const fileStore = memFiles();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, fileStore, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'Com foto', author: '', isbn: null, coverUrl: 'https://externa/antiga.jpg', publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });

  await rd.setCoverImage(b.id, PNG_MAGIC, 'image/png');
  const after = await rd.getBook(b.id);
  assert.match(after.coverUrl!, new RegExp(`^/api/reading/books/${b.id}/cover-image\\?v=`)); // substituiu a URL externa
  assert.equal(fileStore.store.size, 1);
  const info = await rd.coverImageInfo(b.id);
  assert.equal(info.mime, 'image/png');

  await rd.removeCoverImage(b.id);
  const removed = await rd.getBook(b.id);
  assert.equal(removed.coverUrl, null);
  assert.equal(fileStore.store.size, 0); // o arquivo antigo foi apagado do armazenamento
  await assert.rejects(rd.coverImageInfo(b.id), /não encontrad/);
});

test('capa: recusa tipo não permitido, arquivo grande demais e bytes que não batem com o tipo declarado', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, memFiles(), 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await assert.rejects(rd.setCoverImage(b.id, PNG_MAGIC, 'image/svg+xml'), /PNG, JPEG, WebP ou AVIF/);
  await assert.rejects(rd.setCoverImage(b.id, Buffer.from('nao e uma imagem de verdade'), 'image/png'), /não parece ser uma imagem/); // finge ser PNG mas os bytes não batem
  await assert.rejects(rd.setCoverImage(b.id, Buffer.concat([PNG_MAGIC, Buffer.alloc(6 * 1024 * 1024)]), 'image/png'), /até 5 MB/); // magia válida, só grande demais
});

test('capa: aceita AVIF (formato de foto de câmeras/navegadores modernos), com a mesma checagem de bytes', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, memFiles(), 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await rd.setCoverImage(b.id, AVIF_MAGIC, 'image/avif'); // não lança
  const info = await rd.coverImageInfo(b.id);
  assert.equal(info.mime, 'image/avif');
  await assert.rejects(rd.setCoverImage(b.id, PNG_MAGIC, 'image/avif'), /não parece ser uma imagem/); // PNG de verdade, mas dizendo que é AVIF
});

test('substituir a capa (2º upload) apaga o arquivo do upload anterior — não acumula lixo no armazenamento', async () => {
  const { repo } = memReading();
  const fileStore = memFiles();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, fileStore, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await rd.setCoverImage(b.id, PNG_MAGIC, 'image/png');
  assert.equal(fileStore.store.size, 1);
  await rd.setCoverImage(b.id, PNG_MAGIC, 'image/png'); // envia de novo (ex.: tirou outra foto)
  assert.equal(fileStore.store.size, 1); // não acumulou os dois
});

// ---- capa "de emergência" direta por ISBN: só se for de verdade -----------------------------

test('realOpenLibraryCover: só devolve a URL se o tamanho for de uma capa de verdade (a "sem capa" do Open Library é um GIF de 1×1, ~43 bytes); erro de rede também vira null', async () => {
  const { realOpenLibraryCover } = await import('../src/application/reading/bookLookup');
  const original = globalThis.fetch;
  const fakeRes = (contentLength: string | null) => ({ ok: true, headers: { get: (k: string) => (k === 'content-length' ? contentLength : null) } }) as Response;
  try {
    globalThis.fetch = (async () => fakeRes('43')) as typeof fetch; // o GIF de 1×1 "sem capa"
    assert.equal(await realOpenLibraryCover('9780134685991'), null);

    globalThis.fetch = (async () => fakeRes('48680')) as typeof fetch; // uma capa de verdade
    assert.match((await realOpenLibraryCover('9780134685991'))!, /covers\.openlibrary\.org.*9780134685991/);

    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    assert.equal(await realOpenLibraryCover('9780134685991'), null); // fora do ar: null, não lança
  } finally {
    globalThis.fetch = original;
  }
});

// ---- anotações (editor rico, mesmo padrão de Estudos/Documentos) ---------------------------

test('anotações: livro novo começa sem nenhuma anotação', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  assert.equal(b.notes, '');
});

test('anotações: PATCH com o HTML do editor é sanitizado ao salvar', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  const after = await rd.updateBook(b.id, { notes: '<p>Capítulo 3: <strong>ótimo</strong></p><script>alert(1)</script>' });
  assert.match(after.notes, /<strong>ótimo<\/strong>/);
  assert.ok(!after.notes.includes('<script'));
});

test('anotações: reescrever substitui o conteúdo anterior inteiro (o editor manda o documento completo)', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await rd.updateBook(b.id, { notes: '<p>1</p><p>2</p>' });
  const rewritten = await rd.updateBook(b.id, { notes: '<p>2</p><p>1</p>' });
  assert.equal(rewritten.notes, '<p>2</p><p>1</p>');
});

test('addNote (usado pelo assistente): acrescenta um parágrafo ao final, sem apagar o que já tinha', async () => {
  const { repo } = memReading();
  const rd = new ReadingService(repo, stubLookup(null), noSearch, noFiles, 'America/Sao_Paulo');
  const b = await rd.createBook({ title: 'X', author: '', isbn: null, coverUrl: null, publisher: '', format: 'fisico', status: 'quero_ler', totalPages: null });
  await rd.updateBook(b.id, { notes: '<p>já tinha isso</p>' });
  const after = await rd.addNote(b.id, 'Reviravolta incrível no capítulo 10');
  assert.equal(after.notes, '<p>já tinha isso</p><p>Reviravolta incrível no capítulo 10</p>');
});

// Regressão: reabrir "Editar" num livro com foto enviada (coverUrl = caminho relativo da própria rota de servir,
// não uma URL absoluta) e salvar sem mexer na capa mandava esse valor de volta no PATCH — e z.string().url()
// recusava caminho relativo, quebrando com "coverUrl: Invalid URL".
test('editar o livro sem mexer na capa (caminho relativo de uma foto enviada) não quebra o PATCH', () => {
  const relative = bookUpdateSchema.parse({ coverUrl: '/api/reading/books/abc-123/cover-image?v=xyz' });
  assert.equal(relative.coverUrl, '/api/reading/books/abc-123/cover-image?v=xyz');
  const absolute = bookUpdateSchema.parse({ coverUrl: 'https://covers.openlibrary.org/b/isbn/9780134685991-L.jpg' });
  assert.match(absolute.coverUrl!, /^https:\/\//);
  assert.throws(() => bookUpdateSchema.parse({ coverUrl: 'nao e uma url nem um caminho' }));
});
