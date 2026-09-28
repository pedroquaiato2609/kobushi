import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planProgress, textFromHtml } from '../src/domain/study';
import { sanitizeNoteHtml, StudyService } from '../src/application/study/service';
import type { Lesson, LinkedType, StudyFolder, StudyNote, StudyPlan, StudyRepository } from '../src/application/study/ports';

// ---- domínio (funções puras) -----------------------------------------------------------

test('planProgress: % de aulas concluídas; 0 quando o plano ainda não tem nenhuma aula', () => {
  assert.equal(planProgress([]), 0);
  assert.equal(planProgress([{ done: true }, { done: false }, { done: false }, { done: false }]), 25);
  assert.equal(planProgress([{ done: true }, { done: true }]), 100);
});

test('textFromHtml: extrai texto simples, com quebra de linha por bloco, sem marcação nem entidades', () => {
  assert.equal(textFromHtml('<p>Olá <strong>mundo</strong></p><p>Segundo parágrafo</p>'), 'Olá mundo\nSegundo parágrafo');
  assert.equal(textFromHtml('<h1>Título</h1><ul><li>um</li><li>dois</li></ul>'), 'Título\num\ndois');
  assert.equal(textFromHtml('<p>A &amp; B &lt;3&gt;</p>'), 'A & B <3>');
  assert.equal(textFromHtml(''), '');
});

// ---- sanitização do HTML da nota (defesa em profundidade, além da correção do TipTap) ------

test('sanitizeNoteHtml: mantém o que o editor produz (parágrafos, formatação, listas, tarefa, imagem, link)', () => {
  const html = '<p><strong>negrito</strong> e <em>itálico</em></p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div>feito</div></li></ul><img src="https://x/img.png" alt="capa"><a href="https://x">link</a>';
  const out = sanitizeNoteHtml(html);
  assert.match(out, /<strong>negrito<\/strong>/);
  assert.match(out, /<em>itálico<\/em>/);
  assert.match(out, /data-type="taskList"/);
  assert.match(out, /<img src="https:\/\/x\/img\.png" alt="capa"\s*\/?>/);
  assert.match(out, /<input type="checkbox" checked/); // a caixinha da tarefa não pode sumir
  assert.match(out, /<a href="https:\/\/x"[^>]*>link<\/a>/);
});

test('sanitizeNoteHtml: derruba script/style/iframe, atributos on*, e esquemas perigosos (javascript:/data: em imagem)', () => {
  assert.ok(!sanitizeNoteHtml('<script>alert(1)</script><p>texto</p>').includes('<script'));
  assert.ok(!sanitizeNoteHtml('<img src="x" onerror="alert(1)">').includes('onerror'));
  assert.ok(!sanitizeNoteHtml('<a href="javascript:alert(1)">clique</a>').includes('javascript:'));
  assert.ok(!sanitizeNoteHtml('<img src="data:image/png;base64,AAAA">').includes('data:'));
  assert.ok(!sanitizeNoteHtml('<iframe src="https://evil"></iframe><p>ok</p>').includes('iframe'));
});

// ---- serviço (repositório em memória) ----------------------------------------------------

function memStudy() {
  const notes: StudyNote[] = [];
  const plans: StudyPlan[] = [];
  const folders: StudyFolder[] = [];
  const links = new Map<string, Set<string>>(); // fromNote -> Set<toNote>
  const images = new Map<string, string>();
  let n = 0;
  const repo: StudyRepository = {
    saveImage: async (storage, mime) => { images.set(storage, mime); },
    imageMime: async (storage) => images.get(storage) ?? null,
    listFolders: async () => [...folders],
    createFolder: async (name) => { const f: StudyFolder = { id: `f${++n}`, name, createdAt: new Date() }; folders.push(f); return f; },
    renameFolder: async (id, name) => { const f = folders.find((x) => x.id === id); if (!f) return null; f.name = name; return f; },
    deleteFolder: async (id) => { const i = folders.findIndex((x) => x.id === id); if (i < 0) return false; folders.splice(i, 1); return true; },
    listNotes: async (f) => notes.filter((x) => !x.archived
      && (!f.linkedType || x.linkedType === f.linkedType) && (!f.linkedId || x.linkedId === f.linkedId)
      && (!f.folderId || x.folderId === f.folderId) && (!f.tag || x.tags.includes(f.tag)) && (!f.pinned || x.pinned)
      && (!f.query || x.title.toLowerCase().includes(f.query.toLowerCase()) || x.content.toLowerCase().includes(f.query.toLowerCase()))),
    getNote: async (id) => notes.find((x) => x.id === id) ?? null,
    createNote: async (d) => { const x: StudyNote = { id: `n${++n}`, archived: false, createdAt: new Date(), updatedAt: new Date(), ...d }; notes.push(x); return x; },
    updateNote: async (id, patch) => { const x = notes.find((y) => y.id === id); if (!x) return null; Object.assign(x, patch, { updatedAt: new Date() }); return x; },
    deleteNote: async (id) => { const i = notes.findIndex((x) => x.id === id); if (i < 0) return false; notes.splice(i, 1); return true; },
    setNoteLinks: async (from, to) => { links.set(from, new Set(to)); },
    linkedNoteIds: async (from) => [...(links.get(from) ?? [])],
    backlinks: async (to) => notes.filter((x) => links.get(x.id)?.has(to)).map((x) => ({ id: x.id, title: x.title })),
    allTags: async () => [...new Set(notes.flatMap((x) => x.tags))].sort(),
    listPlans: async () => plans.filter((x) => !x.archived),
    getPlan: async (id) => plans.find((x) => x.id === id) ?? null,
    createPlan: async (d) => { const x: StudyPlan = { id: `p${++n}`, archived: false, createdAt: new Date(), updatedAt: new Date(), ...d }; plans.push(x); return x; },
    updatePlan: async (id, patch) => { const x = plans.find((y) => y.id === id); if (!x) return null; Object.assign(x, patch, { updatedAt: new Date() }); return x; },
    deletePlan: async (id) => { const i = plans.findIndex((x) => x.id === id); if (i < 0) return false; plans.splice(i, 1); return true; },
  };
  return { repo, notes, plans, folders, images };
}
const noFiles = { save: async () => undefined, remove: async () => undefined, path: (n: string) => n };
const lesson = (id: string, title: string, done = false): Lesson => ({ id, title, description: '', done });

test('nota: cria com o vínculo (livro/treino/atividade), e recusa vínculo pela metade (tipo sem id, ou id sem tipo)', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const n = await st.createNote({ title: 'Sobre Sapiens', content: '<p>ótimo livro</p>', linkedType: 'book' as LinkedType, linkedId: '11111111-1111-1111-1111-111111111111' });
  assert.equal(n.linkedType, 'book');
  await assert.rejects(st.createNote({ title: 'X', content: '', linkedType: 'book' as LinkedType, linkedId: null }), /vínculo juntos/);
  await assert.rejects(st.createNote({ title: 'X', content: '', linkedType: null, linkedId: '11111111-1111-1111-1111-111111111111' }), /vínculo juntos/);
});

test('nota: o conteúdo é sanitizado ao criar E ao atualizar (não só na resposta HTTP)', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const n = await st.createNote({ title: 'X', content: '<p>ok</p><script>alert(1)</script>', linkedType: null, linkedId: null });
  assert.ok(!n.content.includes('<script'));
  const updated = await st.updateNote(n.id, { content: '<img src="x" onerror="alert(2)">' });
  assert.ok(!updated.content.includes('onerror'));
});

test('nota: apagar o vínculo (mandar os dois null) funciona; trocar só um dos dois continua recusando', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const n = await st.createNote({ title: 'X', content: '', linkedType: 'workout' as LinkedType, linkedId: '11111111-1111-1111-1111-111111111111' });
  const cleared = await st.updateNote(n.id, { linkedType: null, linkedId: null });
  assert.equal(cleared.linkedType, null);
  await assert.rejects(st.updateNote(n.id, { linkedType: 'book' as LinkedType }), /vínculo juntos/); // só o tipo, sem id (nem no patch nem já salvo)
});

// ---- organização: pastas, tags, favoritos, busca, notas linkadas ----------------------------

test('pastas: cria, renomeia, apaga; renomear/apagar pasta inexistente dá NotFoundError', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const f = await st.createFolder({ name: 'Faculdade' });
  assert.equal(f.name, 'Faculdade');
  const renamed = await st.renameFolder(f.id, { name: 'Trabalho' });
  assert.equal(renamed.name, 'Trabalho');
  await st.removeFolder(f.id);
  await assert.rejects(st.renameFolder(f.id, { name: 'X' }), /não encontrad/i);
  await assert.rejects(st.removeFolder(f.id), /não encontrad/i);
});

test('nota: cria com pasta, tags e fixada; listNotes filtra por cada um desses campos', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const folder = await st.createFolder({ name: 'Faculdade' });
  const n1 = await st.createNote({ title: 'Cálculo', content: '', linkedType: null, linkedId: null, folderId: folder.id, tags: ['matemática', 'prova'], pinned: true });
  const n2 = await st.createNote({ title: 'História', content: '', linkedType: null, linkedId: null, folderId: null, tags: ['humanas'], pinned: false });
  assert.deepEqual((await st.listNotes({ folderId: folder.id })).map((n) => n.id), [n1.id]);
  assert.deepEqual((await st.listNotes({ tag: 'humanas' })).map((n) => n.id), [n2.id]);
  assert.deepEqual((await st.listNotes({ pinned: true })).map((n) => n.id), [n1.id]);
  // a ordenação "fixadas primeiro" é feita no SQL (ORDER BY pinned DESC), não no serviço — não faz sentido testar aqui.
});

test('nota: linkedNoteIds cria referências pra outras notas, e a nota referenciada mostra o backlink', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const target = await st.createNote({ title: 'Conceito base', content: '', linkedType: null, linkedId: null });
  const source = await st.createNote({ title: 'Aplicação do conceito', content: '', linkedType: null, linkedId: null, linkedNoteIds: [target.id] });
  assert.deepEqual(source.linkedNoteIds, [target.id]);
  const targetView = await st.getNote(target.id);
  assert.deepEqual(targetView.backlinks, [{ id: source.id, title: source.title }]);

  // atualizar os links substitui o conjunto anterior (não acumula)
  const other = await st.createNote({ title: 'Outro conceito', content: '', linkedType: null, linkedId: null });
  const updated = await st.updateNote(source.id, { linkedNoteIds: [other.id] });
  assert.deepEqual(updated.linkedNoteIds, [other.id]);
  assert.deepEqual((await st.getNote(target.id)).backlinks, []); // não referencia mais o "Conceito base"
});

test('nota: linkedNoteIds nunca inclui a própria nota, mesmo se o chamador mandar isso (autorreferência)', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const n = await st.createNote({ title: 'X', content: '', linkedType: null, linkedId: null });
  const updated = await st.updateNote(n.id, { linkedNoteIds: [n.id] });
  assert.deepEqual(updated.linkedNoteIds, []);
});

test('imagem: envia, registra o mime de verdade, e serve com o mime certo (não um "image/*" genérico)', async () => {
  const { repo, images } = memStudy();
  const st = new StudyService(repo, noFiles);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const r = await st.uploadImage(png, 'image/png');
  assert.match(r.url, /^\/api\/study\/images\//);
  const storage = r.url.split('/').pop()!;
  assert.equal(images.get(storage), 'image/png');
  const info = await st.imageInfo(storage);
  assert.equal(info.mime, 'image/png');
});
test('imagem: recusa tipo não permitido e arquivo grande demais', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  await assert.rejects(st.uploadImage(Buffer.from('x'), 'image/svg+xml'), /PNG, JPEG, WebP, AVIF ou GIF/);
  await assert.rejects(st.uploadImage(Buffer.alloc(9 * 1024 * 1024), 'image/png'), /até 8 MB/);
});

test('plano de estudo: progresso calculado a partir das aulas; marcar uma aula não mexe nas outras', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const p = await st.createPlan({ subject: 'Álgebra Linear', title: 'Álgebra do zero', lessons: [lesson('a', 'Vetores'), lesson('b', 'Matrizes'), lesson('c', 'Autovalores')] });
  assert.equal(p.progressPct, 0);
  const after1 = await st.setLessonDone(p.id, 'a', true);
  assert.equal(after1.progressPct, 33);
  assert.equal(after1.lessons.find((l) => l.id === 'b')!.done, false);
  const after2 = await st.setLessonDone(p.id, 'b', true);
  assert.equal(after2.progressPct, 67);
  const undone = await st.setLessonDone(p.id, 'a', false);
  assert.equal(undone.progressPct, 33);
});

test('plano de estudo: marcar aula inexistente lança erro claro', async () => {
  const { repo } = memStudy();
  const st = new StudyService(repo, noFiles);
  const p = await st.createPlan({ subject: 'X', title: 'X', lessons: [lesson('a', 'Aula 1')] });
  await assert.rejects(st.setLessonDone(p.id, 'nao-existe', true), /não encontrad/);
});
