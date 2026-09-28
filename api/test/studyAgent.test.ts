import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildStudyTools } from '../src/agent/studyTools';
import { PermissionPolicy } from '../src/agent/policy';
import { ToolRunner } from '../src/agent/runner';
import type { StudyFolder, StudyNote, StudyPlan, StudyRepository } from '../src/application/study/ports';
import { StudyService } from '../src/application/study/service';

let seq = 0;
const fakeUuid = () => `${String(++seq).padStart(8, '0')}-0000-0000-0000-000000000000`; // id.parse() exige formato UUID (36 chars)

function memStudy() {
  const notes: StudyNote[] = [];
  const plans: StudyPlan[] = [];
  const folders: StudyFolder[] = [];
  const links = new Map<string, Set<string>>();
  const repo: StudyRepository = {
    saveImage: async () => undefined,
    imageMime: async () => null,
    listFolders: async () => [...folders],
    createFolder: async (name) => { const f: StudyFolder = { id: fakeUuid(), name, createdAt: new Date() }; folders.push(f); return f; },
    renameFolder: async (id, name) => { const f = folders.find((x) => x.id === id); if (!f) return null; f.name = name; return f; },
    deleteFolder: async (id) => { const i = folders.findIndex((x) => x.id === id); if (i < 0) return false; folders.splice(i, 1); return true; },
    listNotes: async (f) => notes.filter((x) => !x.archived && (!f.linkedType || x.linkedType === f.linkedType) && (!f.linkedId || x.linkedId === f.linkedId)),
    getNote: async (id) => notes.find((x) => x.id === id) ?? null,
    createNote: async (d) => { const x: StudyNote = { id: fakeUuid(), archived: false, createdAt: new Date(), updatedAt: new Date(), ...d }; notes.push(x); return x; },
    updateNote: async (id, patch) => { const x = notes.find((y) => y.id === id); if (!x) return null; Object.assign(x, patch, { updatedAt: new Date() }); return x; },
    deleteNote: async (id) => { const i = notes.findIndex((x) => x.id === id); if (i < 0) return false; notes.splice(i, 1); return true; },
    setNoteLinks: async (from, to) => { links.set(from, new Set(to)); },
    linkedNoteIds: async (from) => [...(links.get(from) ?? [])],
    backlinks: async (to) => notes.filter((x) => links.get(x.id)?.has(to)).map((x) => ({ id: x.id, title: x.title })),
    allTags: async () => [...new Set(notes.flatMap((x) => x.tags))].sort(),
    listPlans: async () => plans.filter((x) => !x.archived),
    getPlan: async (id) => plans.find((x) => x.id === id) ?? null,
    createPlan: async (d) => { const x: StudyPlan = { id: fakeUuid(), archived: false, createdAt: new Date(), updatedAt: new Date(), ...d }; plans.push(x); return x; },
    updatePlan: async (id, patch) => { const x = plans.find((y) => y.id === id); if (!x) return null; Object.assign(x, patch, { updatedAt: new Date() }); return x; },
    deletePlan: async (id) => { const i = plans.findIndex((x) => x.id === id); if (i < 0) return false; plans.splice(i, 1); return true; },
  };
  return { repo, notes, plans, folders };
}
const noFiles = { save: async () => undefined, remove: async () => undefined, path: (n: string) => n };

function harness() {
  const m = memStudy();
  const st = new StudyService(m.repo, noFiles);
  const actions: any[] = [];
  const actionRepo: any = {
    create: async (d: any) => { const a = { id: `a${actions.length + 1}`, createdAt: new Date(), resolvedAt: null, ...d }; actions.push(a); return a; },
    get: async (id: string) => actions.find((a) => a.id === id) ?? null,
    resolve: async (id: string, status: string, result: unknown) => { const a = actions.find((x) => x.id === id); a.status = status; a.result = result; return a; },
  };
  const tools = buildStudyTools(st);
  const runner = new ToolRunner(tools, new PermissionPolicy({ all: async () => ({}), setMany: async () => undefined }), actionRepo, () => ({ type: 'object', properties: {} }));
  return { ...m, st, tools, runner, actions };
}

const ctx = { userId: 'u' };

test('assistente: ferramentas de estudo existem, leituras são livres e escrever pergunta antes', () => {
  const { tools } = harness();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const n of ['study_list_notes', 'study_note_detail', 'study_list_plans', 'study_plan_detail']) assert.equal(byName[n].action, 'read', n);
  for (const n of ['study_create_note', 'study_generate_plan', 'study_set_lesson_done']) assert.equal(byName[n].defaultMode, 'confirm', n);
  assert.ok(tools.every((t) => t.resource === 'study'));
});

test('assistente: cria uma nota (parágrafos separados por linha em branco viram <p>), com confirmação', async () => {
  const { runner, notes, actions } = harness();
  const out: any = await runner.execute({ id: '1', name: 'study_create_note', args: { title: 'Resumo de Vetores', content: 'Primeiro parágrafo.\n\nSegundo parágrafo.' } }, 'c', ctx);
  assert.equal(out.status, 'pending_user_confirmation');
  assert.equal(notes.length, 0);
  await runner.approve(actions[0].id, ctx);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].content, '<p>Primeiro parágrafo.</p><p>Segundo parágrafo.</p>');
});

test('assistente: gera um plano de estudo (várias aulas) e depois marca uma aula concluída', async () => {
  const { runner, plans, actions } = harness();
  const gen: any = await runner.execute({ id: '1', name: 'study_generate_plan', args: {
    subject: 'álgebra linear', title: 'Álgebra Linear do zero',
    lessons: [{ title: 'Vetores', description: 'introdução' }, { title: 'Matrizes' }, { title: 'Autovalores e autovetores' }],
  } }, 'c', ctx);
  assert.equal(gen.status, 'pending_user_confirmation');
  assert.match(gen.resumo.join('\n'), /3 aulas/);
  assert.match(gen.resumo.join('\n'), /1\. Vetores/);
  const created = await runner.approve(actions[0].id, ctx);
  assert.equal(plans.length, 1);
  const planId = plans[0].id;
  const lessonId = plans[0].lessons[0].id;

  const done: any = await runner.execute({ id: '2', name: 'study_set_lesson_done', args: { planId, lessonId, done: true } }, 'c', ctx);
  assert.equal(done.status, 'pending_user_confirmation');
  await runner.approve(actions[1].id, ctx);
  assert.equal(plans[0].lessons[0].done, true);
  assert.equal(plans[0].lessons[1].done, false); // as outras não mudaram
});

test('assistente: poupa tokens — ferramentas de ESCREVER de estudo só vão ao modelo com o contexto certo; as de ler ficam sempre', async () => {
  const { runner } = harness();
  const write = ['study_create_note', 'study_generate_plan', 'study_set_lesson_done'];
  const read = ['study_list_notes', 'study_note_detail', 'study_list_plans', 'study_plan_detail'];

  const outOfContext = await runner.specsForModel({ finance: false, gym: false, reading: false, study: false });
  for (const n of write) assert.ok(!outOfContext.some((s) => s.name === n), `${n} não deveria ir sem contexto de estudos`);
  for (const n of read) assert.ok(outOfContext.some((s) => s.name === n), `${n} deveria ir mesmo sem contexto de estudos`);

  const inContext = await runner.specsForModel({ finance: false, gym: false, reading: false, study: true });
  for (const n of [...write, ...read]) assert.ok(inContext.some((s) => s.name === n), `${n} deveria ir com contexto de estudos`);
});
