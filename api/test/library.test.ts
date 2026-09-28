import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DocumentService, descendantIds } from '../src/application/library';
import type { Doc, Folder } from '../src/domain/entities';

const folder = (id: string, parentId: string | null, agentVisible = true): Folder => ({ id, parentId, name: id, agentVisible, createdAt: new Date() });

test('descendantIds percorre subpastas', () => {
  const all = [folder('a', null), folder('b', 'a'), folder('c', 'b'), folder('x', null)];
  assert.deepEqual(descendantIds(all, 'a').sort(), ['a', 'b', 'c']);
});

function service() {
  const folders = [folder('pub', null), folder('saude', null, false), folder('exames', 'saude')];
  const docs: Doc[] = [];
  const removed: string[] = [];
  const svc = new DocumentService(
    { list: async () => folders, get: async (id: string) => folders.find((f) => f.id === id) ?? null, create: async () => folders[0], rename: async () => folders[0], setAgentVisible: async () => folders[0], delete: async () => true } as any,
    {
      list: async () => docs.map((d) => ({ ...d, excerpt: d.content.slice(0, 20) })),
      get: async (id: string) => docs.find((d) => d.id === id) ?? null,
      create: async (d: any) => { const doc = { id: `d${docs.length}`, summary: '', mime: null, sizeBytes: null, storageName: null, createdAt: new Date(), updatedAt: new Date(), ...d }; docs.push(doc); return doc; },
      update: async (id: string, patch: any) => { const d = docs.find((x) => x.id === id)!; Object.entries(patch).forEach(([k, v]) => { if (v !== undefined) (d as any)[k] = v; }); return d; },
      delete: async () => true,
      storageNamesIn: async () => ['file-1'],
    } as any,
    { save: async () => {}, remove: async (n: string) => { removed.push(n); }, path: (n: string) => `/x/${n}` },
    async (_mime, name) => (name.endsWith('.txt') ? 'texto extraído' : ''),
  );
  return { svc, docs, removed };
}

test('pasta oculta esconde documentos (e subpastas) do agente, mas não do usuário', async () => {
  const { svc } = service();
  await svc.create({ title: 'Público', kind: 'note', content: 'a', folderId: 'pub' });
  await svc.create({ title: 'Exame de sangue', kind: 'note', content: 'b', folderId: 'exames' });
  assert.equal((await svc.list()).length, 2);
  assert.deepEqual((await svc.list({ agent: true })).map((d) => d.title), ['Público']);
  await assert.rejects(svc.get('d1', { agent: true }), /não encontrado/);
  await assert.rejects(svc.create({ title: 'x', kind: 'note', folderId: 'exames' }, { agent: true }), /Pasta/);
  assert.equal((await svc.get('d1')).title, 'Exame de sangue');
});

test('update: appendContent acrescenta em nova linha e arquivos enviados não têm o conteúdo alterado', async () => {
  const { svc } = service();
  const list = await svc.create({ title: 'Compras', kind: 'list', content: '- [ ] ovos\n', folderId: null });
  const updated = await svc.update(list.id, { appendContent: '- [ ] leite' });
  assert.equal(updated.content, '- [ ] ovos\n- [ ] leite');

  const file = await svc.upload({ filename: 'exame.txt', mime: 'text/plain', data: Buffer.from('x') });
  assert.equal(file.content, 'texto extraído');
  await assert.rejects(svc.update(file.id, { content: 'outro' }), /não pode ser alterado/);
  assert.equal((await svc.update(file.id, { summary: 'Resumo' })).summary, 'Resumo');
});

test('nota (kind note): conteúdo é sanitizado ao criar e ao atualizar — o mesmo editor rico de Estudos', async () => {
  const { svc } = service();
  const n = await svc.create({ title: 'Ideias', kind: 'note', content: '<p>ok</p><script>alert(1)</script>', folderId: null });
  assert.ok(!n.content.includes('<script'));
  const updated = await svc.update(n.id, { content: '<img src="x" onerror="alert(2)">' });
  assert.ok(!updated.content.includes('onerror'));
});

test('nota (kind note): appendContent vira parágrafo HTML e é acrescentado ao final (não string bruta)', async () => {
  const { svc } = service();
  const n = await svc.create({ title: 'Ideias', kind: 'note', content: '<p>primeiro</p>', folderId: null });
  const updated = await svc.update(n.id, { appendContent: 'segundo parágrafo' });
  assert.equal(updated.content, '<p>primeiro</p><p>segundo parágrafo</p>');
});

test('lista (kind list): appendContent continua texto simples (uma linha por item), sem virar HTML', async () => {
  const { svc } = service();
  const list = await svc.create({ title: 'Compras', kind: 'list', content: '- [ ] ovos', folderId: null });
  const updated = await svc.update(list.id, { appendContent: '- [ ] leite' });
  assert.equal(updated.content, '- [ ] ovos\n- [ ] leite');
  assert.ok(!updated.content.includes('<p>'));
});

test('apagar pasta remove os arquivos em disco dos documentos dentro dela', async () => {
  const { svc, removed } = service();
  await svc.deleteFolder('pub');
  assert.deepEqual(removed, ['file-1']);
});
