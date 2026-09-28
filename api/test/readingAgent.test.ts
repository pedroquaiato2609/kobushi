import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildReadingTools } from '../src/agent/readingTools';
import { PermissionPolicy } from '../src/agent/policy';
import { ToolRunner } from '../src/agent/runner';
import type { BookLookup, BookSearch } from '../src/application/reading/bookLookup';
import type { Book, ReadingRepository, ReadingSession } from '../src/application/reading/ports';
import { ReadingService } from '../src/application/reading/service';

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
  return { repo, books, sessions };
}
const noLookup: BookLookup = { find: async () => null };
const noSearch: BookSearch = { search: async () => [] };
const noFiles = { save: async () => undefined, remove: async () => undefined, path: (n: string) => n };

function harness() {
  const m = memReading();
  const rd = new ReadingService(m.repo, noLookup, noSearch, noFiles, 'America/Sao_Paulo');
  const actions: any[] = [];
  const actionRepo: any = {
    create: async (d: any) => { const a = { id: `a${actions.length + 1}`, createdAt: new Date(), resolvedAt: null, ...d }; actions.push(a); return a; },
    get: async (id: string) => actions.find((a) => a.id === id) ?? null,
    resolve: async (id: string, status: string, result: unknown) => { const a = actions.find((x) => x.id === id); a.status = status; a.result = result; return a; },
  };
  const tools = buildReadingTools(rd);
  const runner = new ToolRunner(tools, new PermissionPolicy({ all: async () => ({}), setMany: async () => undefined }), actionRepo, () => ({ type: 'object', properties: {} }));
  return { ...m, rd, tools, runner, actions };
}

const ctx = { userId: 'u' };

test('assistente: ferramentas de leitura existem, leituras são livres e escrever pergunta antes', () => {
  const { tools } = harness();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const n of ['reading_list_books', 'reading_book_detail', 'reading_overview', 'reading_lookup_isbn', 'reading_search_books']) assert.equal(byName[n].action, 'read', n);
  for (const n of ['reading_add_book', 'reading_update_book', 'reading_log_session']) assert.equal(byName[n].defaultMode, 'confirm', n);
  assert.ok(tools.every((t) => t.resource === 'reading'));
});

test('assistente: adiciona um livro (com confirmação) e ele aparece na lista', async () => {
  const { runner, books, actions } = harness();
  const out: any = await runner.execute({ id: '1', name: 'reading_add_book', args: { title: 'Clean Code', author: 'Robert Martin', status: 'lendo', totalPages: 400 } }, 'c', ctx);
  assert.equal(out.status, 'pending_user_confirmation');
  assert.equal(books.length, 0); // nada gravado antes do "sim"
  assert.match(out.resumo.join('\n'), /Clean Code/);
  const done = await runner.approve(actions[0].id, ctx);
  assert.equal(done.status, 'executed');
  assert.equal(books.length, 1);
  const list: any = await runner.execute({ id: '2', name: 'reading_list_books', args: {} }, 'c', ctx);
  assert.equal(list[0].titulo, 'Clean Code');
});

test('assistente: registra uma sessão de leitura por título e atualiza o progresso', async () => {
  const { runner, books, actions } = harness();
  await runner.execute({ id: '1', name: 'reading_add_book', args: { title: 'Duna', status: 'lendo', totalPages: 400 } }, 'c', ctx);
  await runner.approve(actions[0].id, ctx);
  const out: any = await runner.execute({ id: '2', name: 'reading_log_session', args: { book: 'duna', date: '2026-06-01', pages: 40 } }, 'c', ctx);
  assert.equal(out.status, 'pending_user_confirmation');
  assert.match(out.resumo.join('\n'), /Duna/);
  assert.match(out.resumo.join('\n'), /40 páginas/);
  await runner.approve(actions[1].id, ctx);
  assert.equal(books[0].currentPage, 40);
});

test('assistente: título inexistente sugere cadastrar, sem chutar', async () => {
  const { runner } = harness();
  const out: any = await runner.execute({ id: '1', name: 'reading_log_session', args: { book: 'Livro que não existe', date: '2026-06-01', pages: 10 } }, 'c', ctx);
  assert.match(out.error, /reading_add_book/);
});

test('assistente: busca por título/autor devolve candidatos com capa, para o usuário escolher antes de cadastrar', async () => {
  const m = memReading();
  const search: BookSearch = { search: async (q) => (q.includes('duna') ? [{ title: 'Duna', author: 'Frank Herbert', isbn: '9780441013593', coverUrl: 'https://x/capa.jpg', year: '1965', totalPages: 688 }] : []) };
  const rd = new ReadingService(m.repo, noLookup, search, noFiles, 'America/Sao_Paulo');
  const runner = new ToolRunner(buildReadingTools(rd), new PermissionPolicy({ all: async () => ({}), setMany: async () => undefined }), { create: async (d: any) => d } as any, () => ({ type: 'object', properties: {} }));
  const out: any = await runner.execute({ id: '1', name: 'reading_search_books', args: { q: 'duna frank herbert' } }, 'c', ctx);
  assert.equal(out.length, 1);
  assert.equal(out[0].titulo, 'Duna');
  assert.equal(out[0].capa, 'https://x/capa.jpg');
});

test('assistente: reading_add_note acrescenta um parágrafo de anotação (com confirmação), sem apagar o resto', async () => {
  const { runner, repo, actions } = harness();
  await runner.execute({ id: '1', name: 'reading_add_book', args: { title: 'Duna', status: 'lendo' } }, 'c', ctx);
  const created = await runner.approve(actions[0].id, ctx);
  const bookId = (created.result as any).id;
  await repo.updateBook(bookId, { notes: '<p>já tinha</p>' });

  const out: any = await runner.execute({ id: '2', name: 'reading_add_note', args: { book: 'duna', content: 'Uma frase marcante' } }, 'c', ctx);
  assert.equal(out.status, 'pending_user_confirmation');
  assert.match(out.resumo.join('\n'), /Uma frase marcante/);
  await runner.approve(actions[1].id, ctx);

  const book = await repo.getBook(bookId);
  assert.equal(book!.notes, '<p>já tinha</p><p>Uma frase marcante</p>');
});

test('poupa tokens: ferramentas de ESCREVER da leitura só vão ao modelo quando a conversa é sobre livros; as de ler ficam sempre', async () => {
  const { runner } = harness();
  const write = ['reading_add_book', 'reading_update_book', 'reading_log_session', 'reading_add_note'];
  const read = ['reading_list_books', 'reading_book_detail', 'reading_overview', 'reading_lookup_isbn', 'reading_search_books'];

  const outOfContext = await runner.specsForModel({ finance: false, gym: false, reading: false });
  for (const n of write) assert.ok(!outOfContext.some((s) => s.name === n), `${n} não deveria ir sem contexto de leitura`);
  for (const n of read) assert.ok(outOfContext.some((s) => s.name === n), `${n} deveria ir mesmo sem contexto de leitura`);

  const inContext = await runner.specsForModel({ finance: false, gym: false, reading: true });
  for (const n of [...write, ...read]) assert.ok(inContext.some((s) => s.name === n), `${n} deveria ir com contexto de leitura`);
});
