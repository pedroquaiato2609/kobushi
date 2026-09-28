import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decrypt, deriveKey, encrypt } from '../src/application/crypto';
import { PrinciplesService, ProfileService, VaultService } from '../src/application/security';
import type { PrincipleRepository, ProfileRepository, VaultRepository } from '../src/application/ports';
import type { StoredPrinciple, StoredProfileItem } from '../src/domain/entities';

test('criptografia: ida e volta, chave errada e adulteração falham', () => {
  const key = deriveKey('senha-forte-1', Buffer.from('salt-salt-salt-16'));
  const payload = encrypt(key, 'CPF 000.000.000-00');
  assert.notEqual(payload.includes('CPF'), true);
  assert.equal(decrypt(key, payload), 'CPF 000.000.000-00');
  assert.throws(() => decrypt(deriveKey('outra', Buffer.from('salt-salt-salt-16')), payload));
  const parts = payload.split('.'); parts[2] = Buffer.from('xxxxxxxxxxxxxxxxxx').toString('base64');
  assert.throws(() => decrypt(key, parts.join('.')));
});

function setup() {
  let vault: { salt: string; verifier: string } | null = null;
  const items: StoredProfileItem[] = [];
  const principleItems: StoredPrinciple[] = [];
  const vaultRepo: VaultRepository = {
    get: async () => vault,
    create: async (salt, verifier) => { vault = { salt, verifier }; },
    rekey: async (salt, verifier, profileUpd, principleUpd) => {
      vault = { salt, verifier };
      for (const u of profileUpd) items.find((i) => i.id === u.id)!.content = u.content;
      for (const u of principleUpd) { const p = principleItems.find((x) => x.id === u.id)!; p.title = u.title; p.content = u.content; }
    },
    reset: async () => {
      vault = null;
      for (let i = items.length - 1; i >= 0; i--) if (items[i].level === 'secret') items.splice(i, 1);
      principleItems.length = 0;
    },
  };
  const profileRepo: ProfileRepository = {
    list: async () => items,
    get: async (id) => items.find((i) => i.id === id) ?? null,
    create: async (d) => { const i = { id: `p${items.length}`, ...d, createdAt: new Date(), updatedAt: new Date() }; items.push(i); return i; },
    update: async (id, patch) => { const i = items.find((x) => x.id === id); if (!i) return null; Object.assign(i, JSON.parse(JSON.stringify(patch))); return i; },
    delete: async (id) => { const n = items.findIndex((i) => i.id === id); if (n < 0) return false; items.splice(n, 1); return true; },
  };
  const principleRepo: PrincipleRepository = {
    listFolders: async () => [], createFolder: async (name) => ({ id: 'f1', name, createdAt: new Date(), reminder: { enabled: false, times: [], weekdays: [0, 1, 2, 3, 4, 5, 6], channels: [] } }),
    renameFolder: async () => null, deleteFolder: async () => false, updateFolderReminder: async () => null,
    list: async () => principleItems,
    get: async (id) => principleItems.find((p) => p.id === id) ?? null,
    create: async (d) => { const p: StoredPrinciple = { id: `pr${principleItems.length}`, folderId: d.folderId, title: d.title, content: d.content, archived: false, createdAt: new Date(), updatedAt: new Date() }; principleItems.push(p); return p; },
    update: async (id, patch) => { const p = principleItems.find((x) => x.id === id); if (!p) return null; Object.assign(p, patch); return p; },
    delete: async (id) => { const n = principleItems.findIndex((p) => p.id === id); if (n < 0) return false; principleItems.splice(n, 1); return true; },
    listForRekey: async () => principleItems.map((p) => ({ id: p.id, title: p.title, content: p.content })),
  };
  let now = 1_000_000;
  const vaultSvc = new VaultService(vaultRepo, profileRepo, principleRepo, { ttlMs: 60_000, now: () => now });
  return {
    vault: vaultSvc, profile: new ProfileService(profileRepo, vaultSvc), principles: new PrinciplesService(principleRepo, vaultSvc),
    items, principleItems, tick: (ms: number) => { now += ms; },
  };
}

test('cofre: configurar, bloquear, desbloquear e expirar', async () => {
  const t = setup();
  await assert.rejects(t.vault.setup('curta'), /8 caracteres/);
  await t.vault.setup('senha-forte-1');
  assert.equal((await t.vault.status()).unlocked, true);
  t.vault.lock();
  await assert.rejects(t.vault.unlock('errada-errada'), /incorreta/);
  await t.vault.unlock('senha-forte-1');
  t.tick(61_000);
  assert.equal((await t.vault.status()).unlocked, false); // expirou sozinho
});

test('cofre: 5 erros seguidos bloqueiam novas tentativas por um tempo', async () => {
  const t = setup();
  await t.vault.setup('senha-forte-1');
  t.vault.lock();
  for (let i = 0; i < 5; i++) await assert.rejects(t.vault.unlock('errada-errada'), /incorreta/);
  await assert.rejects(t.vault.unlock('senha-forte-1'), /Muitas tentativas/);
  t.tick(61_000);
  await t.vault.unlock('senha-forte-1');
});

test('perfil: secreto fica criptografado, oculto com cofre bloqueado e o agente nunca o altera', async () => {
  const t = setup();
  await t.vault.setup('senha-forte-1');
  await t.profile.create({ title: 'Nome', content: 'Ana', level: 'general' });
  await t.profile.create({ title: 'Plano de saúde', content: 'Carteirinha 123', level: 'private' });
  const secret = await t.profile.create({ title: 'Senha do banco', content: 'segredo', level: 'secret' });
  assert.equal(t.items.find((i) => i.id === secret.id)!.content.includes('segredo'), false); // criptografado em repouso

  // agente: vê geral completo; do resto, só títulos
  const overview = await t.profile.agentOverview();
  assert.deepEqual(overview.general.map((g) => g.content), ['Ana']);
  assert.deepEqual(overview.protectedTitles.map((p) => p.title), ['Plano de saúde', 'Senha do banco']);
  assert.equal(JSON.stringify(overview).includes('segredo'), false);

  assert.equal((await t.profile.readForAgent(secret.id)).content, 'segredo'); // cofre aberto
  t.vault.lock();
  await assert.rejects(t.profile.readForAgent(secret.id), /bloqueado/);
  assert.equal((await t.profile.list()).find((i) => i.id === secret.id)!.content, null); // UI também não vê

  await t.vault.unlock('senha-forte-1');
  await assert.rejects(t.profile.saveForAgent({ id: secret.id, title: 'x', content: 'y', level: 'general' }), /secretos/);
});

test('trocar a senha regrava os segredos (perfil E princípios); senha antiga deixa de servir', async () => {
  const t = setup();
  await t.vault.setup('senha-forte-1');
  const s = await t.profile.create({ title: 'Cofre', content: 'valor', level: 'secret' });
  const p = await t.principles.create({ folderId: null, title: 'Sobre integridade', content: 'Não minta pra você mesmo.' });
  await t.vault.change('senha-forte-1', 'nova-senha-2');
  t.vault.lock();
  await assert.rejects(t.vault.unlock('senha-forte-1'), /incorreta/);
  await t.vault.unlock('nova-senha-2');
  assert.equal((await t.profile.readForAgent(s.id)).content, 'valor');
  const reloaded = await t.principles.get(p.id);
  assert.equal(reloaded.title, 'Sobre integridade');
  assert.equal(reloaded.content, 'Não minta pra você mesmo.');
});

test('princípios: título e conteúdo cifrados em repouso; cofre bloqueado esconde os dois (nem o título vaza)', async () => {
  const t = setup();
  await t.vault.setup('senha-forte-1');
  const p = await t.principles.create({ folderId: null, title: 'Sobre coragem', content: 'Faça o que teme.' });
  assert.equal(t.principleItems[0].title.includes('coragem'), false); // cifrado em repouso
  assert.equal(t.principleItems[0].content.includes('teme'), false);

  t.vault.lock();
  const locked = await t.principles.get(p.id);
  assert.equal(locked.title, null); // nem o título aparece
  assert.equal(locked.content, null);
  assert.equal(locked.locked, true);
  await assert.rejects(t.principles.create({ folderId: null, title: 'x', content: 'y' }), /bloqueado/);

  await t.vault.unlock('senha-forte-1');
  const unlocked = await t.principles.get(p.id);
  assert.equal(unlocked.title, 'Sobre coragem');
  assert.equal(unlocked.content, 'Faça o que teme.');
});

test('princípios: esquecer a senha (reset) apaga todos os princípios, sem recuperação', async () => {
  const t = setup();
  await t.vault.setup('senha-forte-1');
  await t.principles.create({ folderId: null, title: 'A', content: 'B' });
  await t.vault.reset();
  assert.equal(t.principleItems.length, 0);
});
