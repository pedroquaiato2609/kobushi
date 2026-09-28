import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrinciplesService, VaultService } from '../src/application/security';
import type { PrincipleRepository, ProfileRepository, VaultRepository } from '../src/application/ports';
import type { PrincipleFolder, StoredPrinciple } from '../src/domain/entities';

function setup() {
  let vault: { salt: string; verifier: string } | null = null;
  const principleItems: StoredPrinciple[] = [];
  const folders: PrincipleFolder[] = [];
  let n = 0;
  const vaultRepo: VaultRepository = {
    get: async () => vault,
    create: async (salt, verifier) => { vault = { salt, verifier }; },
    rekey: async (salt, verifier) => { vault = { salt, verifier }; },
    reset: async () => { vault = null; principleItems.length = 0; },
  };
  const profileRepo: ProfileRepository = {
    list: async () => [], get: async () => null, create: async (d) => ({ id: 'x', ...d, createdAt: new Date(), updatedAt: new Date() }),
    update: async () => null, delete: async () => false,
  };
  const principleRepo: PrincipleRepository = {
    listFolders: async () => folders,
    createFolder: async (name) => {
      const f: PrincipleFolder = { id: `f${++n}`, name, createdAt: new Date(), reminder: { enabled: false, times: [], weekdays: [0, 1, 2, 3, 4, 5, 6], channels: [] } };
      folders.push(f); return f;
    },
    renameFolder: async (id, name) => { const f = folders.find((x) => x.id === id); if (!f) return null; f.name = name; return f; },
    deleteFolder: async (id) => { const i = folders.findIndex((x) => x.id === id); if (i < 0) return false; folders.splice(i, 1); return true; },
    updateFolderReminder: async (id, patch) => { const f = folders.find((x) => x.id === id); if (!f) return null; f.reminder = { ...f.reminder, ...patch }; return f; },
    list: async (includeArchived) => principleItems.filter((p) => includeArchived || !p.archived),
    get: async (id) => principleItems.find((p) => p.id === id) ?? null,
    create: async (d) => { const p: StoredPrinciple = { id: `pr${++n}`, folderId: d.folderId, title: d.title, content: d.content, archived: false, createdAt: new Date(), updatedAt: new Date() }; principleItems.push(p); return p; },
    update: async (id, patch) => { const p = principleItems.find((x) => x.id === id); if (!p) return null; Object.assign(p, patch); p.updatedAt = new Date(); return p; },
    delete: async (id) => { const i = principleItems.findIndex((p) => p.id === id); if (i < 0) return false; principleItems.splice(i, 1); return true; },
    listForRekey: async () => principleItems.map((p) => ({ id: p.id, title: p.title, content: p.content })),
  };
  const vaultSvc = new VaultService(vaultRepo, profileRepo, principleRepo, { ttlMs: 60_000, now: () => Date.now() });
  return { vault: vaultSvc, svc: new PrinciplesService(principleRepo, vaultSvc), principleItems, folders };
}

test('pastas de princípios: cria, renomeia, apaga', async () => {
  const { svc } = setup();
  const f = await svc.createFolder('Sobre trabalho');
  assert.equal(f.name, 'Sobre trabalho');
  const renamed = await svc.renameFolder(f.id, 'Sobre carreira');
  assert.equal(renamed.name, 'Sobre carreira');
  await svc.removeFolder(f.id);
  assert.deepEqual(await svc.listFolders(), []);
  await assert.rejects(svc.renameFolder('inexistente', 'x'), /não encontrad/i);
});

test('princípio: atualizar só a pasta (sem mexer no texto) não exige o cofre desbloqueado', async () => {
  const { vault, svc } = setup();
  await vault.setup('senha-forte-1');
  const p = await svc.create({ folderId: null, title: 'A', content: 'B' });
  const folder = await svc.createFolder('Nova pasta');
  vault.lock();
  // não toca title/content: não precisa da chave, só reorganiza
  const moved = await svc.update(p.id, { folderId: folder.id });
  assert.equal(moved.folderId, folder.id);
  assert.equal(moved.locked, true); // ainda assim não mostra o conteúdo, porque o cofre está bloqueado
});

test('princípio: editar o texto exige o cofre desbloqueado', async () => {
  const { vault, svc } = setup();
  await vault.setup('senha-forte-1');
  const p = await svc.create({ folderId: null, title: 'A', content: 'B' });
  vault.lock();
  await assert.rejects(svc.update(p.id, { content: 'C' }), /bloqueado/);
});

test('lembrete é por pasta: cada categoria tem seu próprio horário/dias/canais', async () => {
  const { svc } = setup();
  const trabalho = await svc.createFolder('Trabalho');
  const saude = await svc.createFolder('Saúde');
  assert.equal(trabalho.reminder.enabled, false);

  const updated = await svc.updateFolderReminder(trabalho.id, { enabled: true, times: ['08:00', '21:00'], weekdays: [1, 3, 5], channels: ['push'] });
  assert.equal(updated.reminder.enabled, true);
  assert.deepEqual(updated.reminder.times, ['08:00', '21:00']);
  assert.deepEqual(updated.reminder.weekdays, [1, 3, 5]);
  assert.deepEqual(updated.reminder.channels, ['push']);

  // outra pasta não é afetada
  const saudeAgain = (await svc.listFolders()).find((f) => f.id === saude.id)!;
  assert.equal(saudeAgain.reminder.enabled, false);

  await assert.rejects(svc.updateFolderReminder('inexistente', { enabled: true }), /não encontrad/i);
});

test('excluir princípio inexistente lança erro claro', async () => {
  const { svc } = setup();
  await assert.rejects(svc.remove('nao-existe'), /não encontrad/i);
});
