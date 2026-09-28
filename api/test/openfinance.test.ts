import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FieldCrypto } from '../src/application/fieldCrypto';
import { balances } from '../src/application/finance/analytics';
import { FinanceService } from '../src/application/finance/service';
import type { FinTransaction } from '../src/application/finance/types';
import { DemoOpenFinanceProvider } from '../src/application/openFinance/demoProvider';
import { planImport, seenKey, type BatchItem } from '../src/application/openFinance/import';
import { OpenFinanceService } from '../src/application/openFinance/service';
import { ProviderAuthError, type OfConnection, type OpenFinanceProvider, type OpenFinanceRepository } from '../src/application/openFinance/types';
import { PluggyProvider } from '../src/infrastructure/openFinance/pluggyProvider';

const TODAY = '2026-09-21';
const tx = (over: Partial<FinTransaction>): FinTransaction => ({ id: 't', userId: 'u', accountId: 'A', kind: 'expense', amountCents: 1000, occurredOn: TODAY, description: '', merchant: '', categoryId: null, status: 'confirmed', transferAccountId: null, recurringId: null, note: '', linkActivityId: null, linkCardId: null, remindDaysBefore: null, remindChannels: [], documentId: null, source: 'manual', externalId: null, createdAt: new Date(), updatedAt: new Date(), ...over });
const rt = (id: string, accountId: string, over: Partial<BatchItem['tx']> = {}): BatchItem => ({ accountId, tx: { id, accountId, date: TODAY, amountCents: 5000, direction: 'out', description: 'X', pending: false, ...over } });

// ============================================================ planejador (puro)
test('importação: par único de saída+entrada vira UMA transferência; ambíguo não é juntado', () => {
  const ok = planImport({ batch: [rt('o1', 'CHK', { amountCents: 80000 }), rt('i1', 'SAV', { direction: 'in', amountCents: 80000, date: '2026-09-22' })], seen: new Map(), existing: [] });
  assert.equal(ok.creates.length, 1); assert.equal(ok.creates[0].kind, 'transfer');
  assert.deepEqual([ok.creates[0].accountId, ok.creates[0].transferAccountId], ['CHK', 'SAV']);
  assert.equal(ok.creates[0].seen.length, 2); assert.equal(ok.stats.transfers, 1);
  // duas entradas possíveis para a mesma saída: não arrisca
  const amb = planImport({ batch: [rt('o1', 'CHK', { amountCents: 500 }), rt('i1', 'SAV', { direction: 'in', amountCents: 500 }), rt('i2', 'CC', { direction: 'in', amountCents: 500 })], seen: new Map(), existing: [] });
  assert.equal(amb.stats.transfers, 0); assert.equal(amb.creates.length, 3);
  // mesma conta nunca é transferência
  const same = planImport({ batch: [rt('o1', 'CHK', { amountCents: 500 }), rt('i1', 'CHK', { direction: 'in', amountCents: 500 })], seen: new Map(), existing: [] });
  assert.equal(same.stats.transfers, 0);
  // 3 dias de diferença: não é o mesmo movimento
  const far = planImport({ batch: [rt('o1', 'CHK'), rt('i1', 'SAV', { direction: 'in', date: '2026-09-25' })], seen: new Map(), existing: [] });
  assert.equal(far.stats.transfers, 0);
});

test('importação: concilia com lançamento manual único e preserva o que você escreveu', () => {
  const manual = tx({ id: 'm1', description: 'Meu almoço', categoryId: 'cat-food', amountCents: 4500, occurredOn: '2026-09-19' });
  const plan = planImport({ batch: [rt('b1', 'A', { amountCents: 4500, description: 'REST XPTO 123' })], seen: new Map(), existing: [manual] });
  assert.equal(plan.creates.length, 0); assert.equal(plan.reconciles.length, 1);
  assert.deepEqual(plan.reconciles[0].patch, { externalId: 'b1', status: 'confirmed' }); // só vincula e confirma: descrição e categoria seguem as suas
  // dois manuais candidatos: não adivinha, importa como nova (o insight de duplicidade avisa)
  const two = planImport({ batch: [rt('b1', 'A', { amountCents: 4500 })], seen: new Map(), existing: [manual, tx({ id: 'm2', amountCents: 4500, occurredOn: '2026-09-20' })] });
  assert.equal(two.reconciles.length, 0); assert.equal(two.creates.length, 1);
  // valor diferente, conta diferente ou tipo diferente não conciliam
  for (const other of [tx({ id: 'x', amountCents: 4501 }), tx({ id: 'y', accountId: 'B', amountCents: 4500 }), tx({ id: 'z', kind: 'income', amountCents: 4500 })]) {
    assert.equal(planImport({ batch: [rt('b1', 'A', { amountCents: 4500 })], seen: new Map(), existing: [other] }).reconciles.length, 0);
  }
  // um manual só concilia com um movimento do banco
  const both = planImport({ batch: [rt('b1', 'A', { amountCents: 4500 }), rt('b2', 'A', { amountCents: 4500 })], seen: new Map(), existing: [manual] });
  assert.equal(both.reconciles.length, 1); assert.equal(both.creates.length, 1);
});

test('importação: o que já foi visto não duplica, pendente vira confirmada e o apagado não volta; categoria é aprendida', () => {
  const imported = tx({ id: 'i1', source: 'import', status: 'pending', externalId: 'e1', amountCents: 3000 });
  const seen = new Map<string, string | null>([[seenKey('A', 'e1'), 'i1'], [seenKey('A', 'e2'), null]]);
  const plan = planImport({ batch: [rt('e1', 'A', { amountCents: 3050, pending: false }), rt('e2', 'A'), rt('e3', 'A', { description: 'Padaria Esquina' })], seen, existing: [imported, tx({ id: 'old', merchant: 'Padaria Esquina', categoryId: 'cat-padaria', occurredOn: '2026-08-01' })] });
  assert.deepEqual(plan.updates.map((u) => [u.txId, u.patch.status, u.patch.amountCents]), [['i1', 'confirmed', 3050]]);
  assert.equal(plan.stats.skipped, 1);                                   // e2 foi apagado por você: não volta
  assert.equal(plan.creates.length, 1); assert.equal(plan.creates[0].categoryId, 'cat-padaria');
  // lançamento manual pendente nunca é sobrescrito por dados do banco
  const manualPending = tx({ id: 'mp', status: 'pending', externalId: 'e9', source: 'manual' });
  assert.equal(planImport({ batch: [rt('e9', 'A', { pending: false })], seen: new Map([[seenKey('A', 'e9'), 'mp']]), existing: [manualPending] }).updates.length, 0);
});

// ============================================================ serviço completo com o provedor de demonstração
function mem<T extends { id: string; userId: string }>() {
  const rows: T[] = []; let n = 0;
  return { rows,
    list: async (u: string) => rows.filter((r) => r.userId === u), get: async (u: string, id: string) => rows.find((r) => r.id === id && r.userId === u) ?? null,
    create: async (u: string, d: any) => { const r = { id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, userId: u, createdAt: new Date(), updatedAt: new Date(), ...d, ...(d.numberLast4 !== undefined ? { numberMask: d.numberLast4 ? `••••${d.numberLast4}` : null } : {}) } as T; rows.push(r); return r; },
    update: async (u: string, id: string, p: any) => { const r = rows.find((x) => x.id === id && x.userId === u); if (!r) return null; for (const [k, v] of Object.entries(p)) if (v !== undefined) (r as any)[k] = v; return r; },
    delete: async (u: string, id: string) => { const i = rows.findIndex((x) => x.id === id && x.userId === u); if (i < 0) return false; rows.splice(i, 1); return true; } };
}
function harness(providerOverride?: OpenFinanceProvider, nowRef = { t: new Date('2026-09-21T12:00:00Z') }) {
  const repo = { accounts: mem<any>(), categories: mem<any>(), transactions: mem<any>(), budgets: mem<any>(), goals: mem<any>(), recurring: mem<any>() } as any;
  repo.transactions.search = async (u: string) => repo.transactions.rows.filter((t: any) => t.userId === u);
  repo.insightStates = { list: async () => [], set: async () => undefined };
  repo.hasDemo = async () => false; repo.purge = async () => undefined;
  const audits: { action: string; detail?: unknown }[] = [];
  const crypto = new FieldCrypto(Buffer.alloc(32, 9));
  const finance = new FinanceService(repo, crypto, { today: () => TODAY, createEvent: async () => ({ id: 'e' }), createCard: async () => ({ id: 'c' }), audit: (_u, action, _t, detail) => { audits.push({ action, detail }); } });
  const conns: OfConnection[] = []; const seen = new Map<string, string | null>(); let n = 0;
  const ofRepo: OpenFinanceRepository = {
    list: async (u) => conns.filter((c) => c.userId === u), listAllActive: async () => conns.filter((c) => c.status !== 'revoked'), get: async (u, id) => conns.find((c) => c.id === id && c.userId === u) ?? null,
    create: async (u, d) => { const c = { id: `conn-${++n}`, userId: u, status: 'active', consentGrantedAt: new Date(), lastSyncAt: null, lastError: null, createdAt: new Date(), revokedAt: null, ...d } as OfConnection; conns.push(c); return c; },
    update: async (u, id, p) => { const c = conns.find((x) => x.id === id && x.userId === u); if (!c) return null; for (const [k, v] of Object.entries(p)) if (v !== undefined) (c as any)[k] = v; return c; },
    delete: async () => true,
    seenMany: async (_u, keys) => new Map(keys.filter((k) => seen.has(`${k.accountId}|${k.externalId}`)).map((k) => [`${k.accountId}|${k.externalId}`, seen.get(`${k.accountId}|${k.externalId}`) ?? null])),
    seenAdd: async (_u, a, e, t) => { seen.set(`${a}|${e}`, t ?? seen.get(`${a}|${e}`) ?? null); },
  };
  const demo = new DemoOpenFinanceProvider(() => TODAY);
  const provider = providerOverride ?? demo;
  const of = new OpenFinanceService({ repo: ofRepo, finance, providers: [provider], primary: provider.name, crypto, users: { list: async () => [{ id: 'u1' }] } as any, audit: (_u, action, _t, detail) => { audits.push({ action, detail }); }, now: () => nowRef.t, today: () => TODAY });
  return { of, finance, repo, conns, audits, demo, seen, nowRef };
}
const U = '00000000-aaaa-4000-8000-000000000001';
async function connectDemo(h: ReturnType<typeof harness>) {
  const start = await h.of.startConnect(U);
  assert.equal(start.mode, 'instant');
  return h.of.completeConnect(U, { itemId: (start as { itemId: string }).itemId, consent: true });
}

test('conectar: exige consentimento explícito; cria contas marcadas como DEMO, ligadas à conexão; item criptografado', async () => {
  const h = harness();
  const start = (await h.of.startConnect(U)) as { itemId: string };
  await assert.rejects(h.of.completeConnect(U, { itemId: start.itemId, consent: false }), /autorizar explicitamente/);
  const conn = await h.of.completeConnect(U, { itemId: start.itemId, consent: true });
  assert.equal(conn.status, 'active'); assert.equal(conn.accountCount, 3); assert.ok(conn.consentExpiresAt);
  assert.ok(!('itemEnc' in conn));                                           // o identificador da conexão nunca sai do servidor
  assert.ok(!h.conns[0].itemEnc.includes(start.itemId));                     // e está criptografado no banco
  const accounts = h.repo.accounts.rows;
  assert.ok(accounts.every((a: any) => a.source === 'demo' && a.connectionId === conn.id && a.externalId));
  assert.ok(h.repo.transactions.rows.every((t: any) => t.source === 'demo'));
  await assert.rejects(h.of.completeConnect(U, { itemId: start.itemId, consent: true }), /já está conectada/);
  assert.ok(!JSON.stringify(h.audits).includes(start.itemId));               // auditoria não guarda o identificador
});

test('importação: transferências viram uma linha só, e o saldo calculado bate com o do banco', async () => {
  const h = harness();
  await connectDemo(h);
  const txs = h.repo.transactions.rows as FinTransaction[];
  assert.ok(!txs.some((t) => t.description === 'TRANSF RECEBIDA'), 'a entrada da transferência não pode virar uma receita separada');
  assert.ok(!txs.some((t) => t.description === 'PAGAMENTO RECEBIDO'));
  const transfers = txs.filter((t) => t.kind === 'transfer');
  assert.ok(transfers.length >= 4);                                          // poupança + pagamentos de fatura
  assert.ok(transfers.some((t) => t.description.includes('PAGAMENTO FATURA')));
  const data = await h.finance.load(U);
  const bal = balances(data);
  for (const a of data.accounts) assert.equal(bal.get(a.id)!.balanceCents, a.providerBalanceCents, `saldo de ${a.name}`);
  const card = data.accounts.find((a) => a.kind === 'credit_card')!;
  assert.ok((bal.get(card.id)!.balanceCents) <= 0);                          // cartão: dívida é negativa
  assert.ok(txs.some((t) => t.status === 'pending'));                        // a compra em processamento entra como pendente
});

test('atualizar de novo: só entra o que é novo; o que você apagou não volta; lançamento manual é conciliado', async () => {
  const h = harness();
  const conn = await connectDemo(h);
  const before = h.repo.transactions.rows.length;
  const chk = h.repo.accounts.rows.find((a: any) => a.kind === 'checking');
  // você apaga uma movimentação importada
  const energy = () => (h.repo.transactions.rows as FinTransaction[]).filter((t) => t.description === 'ENERGIA DEMO').length;
  const victim = (h.repo.transactions.rows as FinTransaction[]).find((t) => t.description === 'ENERGIA DEMO')!;
  const energyBefore = energy();
  await h.finance.deleteTransaction(U, victim.id);
  // e já tinha lançado à mão a padaria que vai aparecer no banco na próxima atualização (R$ 14,00)
  const manual = await h.finance.createTransaction(U, { accountId: chk.id, kind: 'expense', amountCents: 1400, occurredOn: TODAY, description: 'Pão da manhã' });
  const r = await h.of.sync(U, conn.id);
  assert.equal(r.ok, true); assert.equal(r.created, 0); assert.equal(r.reconciled, 1);
  assert.equal(h.repo.transactions.rows.length, before - 1 + 1);            // -1 apagada, +1 manual, nenhuma duplicata
  assert.equal(energy(), energyBefore - 1);                                  // a apagada não voltou; as outras contas de energia continuam
  assert.ok(!(h.repo.transactions.rows as FinTransaction[]).some((t) => t.id === victim.id));
  const kept = await h.finance.getTransaction(U, manual.id);
  assert.equal(kept.description, 'Pão da manhã'); assert.ok(kept.externalId); assert.equal(kept.source, 'manual'); // preservado e vinculado
  const again = await h.of.sync(U, conn.id);                                  // nova atualização: 1 movimentação nova do banco (R$ 15,00)
  assert.equal(again.created, 1);
  const data = await h.finance.load(U);
  assert.equal(balances(data).get(chk.id)!.balanceCents === chk.providerBalanceCents, false); // o saldo do banco mudou; o cálculo é refeito a cada leitura
});

test('erros: reconexão necessária, falha genérica sem vazar token, e conexão de outro usuário é recusada', async () => {
  const base = new DemoOpenFinanceProvider(() => TODAY);
  let mode: 'ok' | 'auth' | 'boom' = 'ok';
  const flaky: OpenFinanceProvider = Object.assign(Object.create(base), {
    listAccounts: async (id: string) => { if (mode === 'auth') throw new ProviderAuthError('login expirou'); if (mode === 'boom') throw new Error('timeout token=abcdefghijklmnopqrstuvwxyz0123456789'); return base.listAccounts(id); },
  });
  const h = harness(flaky);
  const conn = await connectDemo(h);
  const count = h.repo.transactions.rows.length;
  mode = 'auth';
  const a = await h.of.sync(U, conn.id);
  assert.equal(a.ok, false); assert.equal(h.conns[0].status, 'needs_reconnect');
  mode = 'boom';
  const b = await h.of.sync(U, conn.id);
  assert.equal(h.conns[0].status, 'error'); assert.ok(!b.error!.includes('abcdefghijklmnopqrstuvwxyz')); assert.match(b.error!, /•••/);
  assert.equal(h.repo.transactions.rows.length, count);                       // falha não altera dados
  mode = 'ok';
  assert.equal((await h.of.sync(U, conn.id)).ok, true); assert.equal(h.conns[0].status, 'active'); assert.equal(h.conns[0].lastError, null);

  const foreign: OpenFinanceProvider = Object.assign(Object.create(base), { getItem: async (id: string) => ({ id, institution: 'X', status: 'active', consentExpiresAt: null, clientUserId: 'outro-usuario' }) });
  await assert.rejects(harness(foreign).of.completeConnect(U, { itemId: 'abc', consent: true }), (e: any) => e.statusCode === 403);
});

test('consentimento: revogar mantém ou apaga o que foi importado; expirar e avisar 30 dias antes; atualização periódica a cada 6h', async () => {
  const h = harness();
  const conn = await connectDemo(h);
  // atualização periódica
  const before = h.repo.transactions.rows.length;
  await h.of.syncAll(new Date('2026-09-21T13:00:00Z'));                      // 1h depois: ainda não é hora
  assert.equal(h.repo.transactions.rows.length, before);
  h.nowRef.t = new Date('2026-09-21T19:30:00Z');
  await h.of.syncAll(h.nowRef.t);                                            // 7h depois: atualiza
  assert.equal(h.repo.transactions.rows.length, before + 1);
  // avisos de consentimento
  const sent: string[] = [];
  h.conns[0].consentExpiresAt = new Date('2026-10-05T00:00:00Z');
  await h.of.checkConsents(async (_u, title, _b, key) => { sent.push(`${key}|${title}`); }, new Date('2026-09-21T12:00:00Z'));
  assert.equal(sent.length, 1); assert.match(sent[0], /vence em 14 dia/);
  h.conns[0].consentExpiresAt = new Date('2026-09-20T00:00:00Z');
  await h.of.checkConsents(async () => undefined, new Date('2026-09-21T12:00:00Z'));
  assert.equal(h.conns[0].status, 'expired');
  const renewed = await h.of.renew(U, conn.id);                              // demonstração: renovar estende o prazo e reativa
  assert.equal(renewed.mode, 'done'); assert.equal(h.conns[0].status, 'active');
  // revogar mantendo os dados
  const keep = await h.of.revoke(U, conn.id, false);
  assert.equal(keep.accountsRemoved, 0); assert.equal(h.repo.accounts.rows.length, 3); assert.equal(h.conns[0].status, 'revoked');
  await assert.rejects(h.of.sync(U, conn.id), /revogada/);
  // revogar apagando os dados
  const h2 = harness(); const c2 = await connectDemo(h2);
  const del = await h2.of.revoke(U, c2.id, true);
  assert.equal(del.accountsRemoved, 3); assert.equal(h2.repo.accounts.rows.length, 0);
});

// ============================================================ adaptador Pluggy (com respostas simuladas)
test('Pluggy: autentica uma vez, envia clientUserId no token de conexão e traduz o formato para o nosso', async () => {
  const calls: { url: string; method: string; body?: any; key?: string }[] = [];
  const fakeFetch = (async (url: string, init: any = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined, key: init.headers?.['X-API-KEY'] });
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
    if (url.endsWith('/auth')) return json({ apiKey: 'KEY-1' });
    if (url.endsWith('/connect_token')) return json({ accessToken: 'CONNECT-TOKEN' });
    if (url.includes('/items/it1') && init.method === 'DELETE') return new Response(null, { status: 204 });
    if (url.includes('/items/it1')) return json({ id: 'it1', status: 'UPDATED', clientUserId: 'user-1', connector: { name: 'Banco Real' }, consentExpiresAt: '2027-03-01T00:00:00Z' });
    if (url.includes('/items/bad')) return json({ id: 'bad', status: 'LOGIN_ERROR' });
    if (url.includes('/accounts?')) return json({ results: [
      { id: 'a1', type: 'BANK', subtype: 'CHECKING_ACCOUNT', name: 'Conta', number: '123-4', balance: 1234.56 },
      { id: 'a2', type: 'CREDIT', subtype: 'CREDIT_CARD', name: 'Cartão', balance: 800, creditData: { creditLimit: 5000, balanceCloseDate: '2026-10-08', balanceDueDate: '2026-10-15' } },
    ] });
    if (url.includes('/v2/transactions?') && !url.includes('after=')) return json({ next: '?accountId=a1&after=cursor%2B%2F%3D', results: [{ id: 't1', description: ' PIX RECEBIDO ', amount: 100.5, date: '2026-09-10T00:00:00Z', type: 'CREDIT', status: 'POSTED' }] });
    if (url.includes('/v2/transactions?')) return json({ next: null, results: [{ id: 't2', description: 'MERCADO', amount: -50, date: '2026-09-11', type: 'DEBIT', status: 'PENDING' }] });
    if (url.includes('/items/gone')) return json({}, 404);
    return json({}, 500);
  }) as unknown as typeof fetch;
  const p = new PluggyProvider({ clientId: 'id', clientSecret: 'secret', fetch: fakeFetch });

  const conn = await p.startConnect({ userId: 'user-1' });
  assert.deepEqual(conn, { mode: 'widget', token: 'CONNECT-TOKEN', script: 'https://cdn.pluggy.ai/pluggy-connect/v2.8.2/pluggy-connect.js' });
  assert.equal(calls.find((c) => c.url.endsWith('/connect_token'))!.body.options.clientUserId, 'user-1');
  const renewal = await p.startConnect({ userId: 'user-1', itemId: 'it1' });
  assert.equal(renewal.mode === 'widget' && renewal.itemId, 'it1');
  assert.equal(calls.filter((c) => c.url.endsWith('/connect_token')).at(-1)!.body.itemId, 'it1');
  const item = await p.getItem('it1');
  assert.deepEqual([item.status, item.institution, item.consentExpiresAt, item.clientUserId], ['active', 'Banco Real', '2027-03-01', 'user-1']);
  assert.equal((await p.getItem('bad')).status, 'needs_reconnect');
  const [chk, card] = await p.listAccounts('it1');
  assert.deepEqual([chk.kind, chk.balanceCents], ['checking', 123456]);
  assert.deepEqual([card.kind, card.balanceCents, card.creditLimitCents, card.closingDay, card.dueDay], ['credit_card', -80000, 500000, 8, 15]); // dívida negativa
  const txs = await p.listTransactions('it1', 'a1', '2026-09-01', '2026-09-21');
  const requests = calls.filter((c) => c.url.includes('/v2/transactions?')).map((c) => new URL(c.url));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].searchParams.get('after'), 'cursor+/=');
  assert.ok(requests.every((u) => u.searchParams.get('accountId') === 'a1' && u.searchParams.get('dateFrom') === '2026-09-01' && u.searchParams.get('dateTo') === '2026-09-21'));
  assert.deepEqual(txs.map((t) => [t.id, t.direction, t.amountCents, t.description, t.pending]), [['t1', 'in', 10050, 'PIX RECEBIDO', false], ['t2', 'out', 5000, 'MERCADO', true]]); // paginou e usou o `type`
  await p.revoke('it1');
  assert.equal(calls.filter((c) => c.url.endsWith('/auth')).length, 1);      // a chave de API foi reaproveitada
  assert.ok(calls.filter((c) => !c.url.endsWith('/auth')).every((c) => c.key === 'KEY-1'));
  await assert.rejects(p.getItem('gone'), ProviderAuthError);
});

test('somente leitura: nenhum provedor expõe operação de pagamento ou movimentação de dinheiro', () => {
  for (const proto of [DemoOpenFinanceProvider.prototype, PluggyProvider.prototype]) {
    const methods = Object.getOwnPropertyNames(proto).filter((m) => m !== 'constructor');
    assert.deepEqual(methods.filter((m) => /pay|transfer|send|withdraw|move|initiate|pix/i.test(m)), []);
  }
});

test('Pluggy: estados de coleta, saldo credor do cartão e extrato acima do limite', async () => {
  let pages = 0;
  const p = new PluggyProvider({ clientId: 'id', clientSecret: 'secret', fetch: (async (url: string) => {
    const body = url.endsWith('/auth') ? { apiKey: 'key' }
      : url.includes('/items/') ? { id: 'item', status: url.endsWith('/updating') ? 'UPDATING' : 'OUTDATED' }
      : url.includes('/accounts?') ? { results: [{ id: 'card', type: 'CREDIT', balance: -35 }] }
      : { results: [], next: '?after=' + (++pages) };
    return new Response(JSON.stringify(body));
  }) as typeof fetch });
  assert.equal((await p.getItem('updating')).status, 'updating');
  assert.equal((await p.getItem('outdated')).status, 'error');
  assert.equal((await p.listAccounts('item'))[0].balanceCents, 3500);
  await assert.rejects(p.listTransactions('item', 'card', TODAY, TODAY), /limite de páginas/);
});

test('sincronização aguarda coleta e bloqueia consentimento vencido sem importar', async () => {
  const base = new DemoOpenFinanceProvider(() => TODAY);
  let state: 'active' | 'updating' = 'updating';
  let expired = false;
  let accountReads = 0;
  const provider: OpenFinanceProvider = Object.assign(Object.create(base), {
    getItem: async (id: string) => ({ ...(await base.getItem(id)), status: state, consentExpiresAt: expired ? '2026-09-20' : '2027-09-21' }),
    listAccounts: async (id: string) => { accountReads++; return base.listAccounts(id); },
  });
  const h = harness(provider);
  const c = await connectDemo(h);
  assert.equal(c.status, 'updating');
  assert.equal(accountReads, 0);
  assert.equal(h.conns[0].lastSyncAt, null);
  state = 'active';
  await h.of.syncAll();
  assert.equal(h.conns[0].status, 'active');
  assert.equal(accountReads, 1);
  expired = true;
  assert.equal((await h.of.sync(U, c.id)).status, 'expired');
  assert.equal(accountReads, 1);
});

test('conexão sem vínculo verificável com o usuário é rejeitada', async () => {
  const base = new DemoOpenFinanceProvider(() => TODAY);
  const provider: OpenFinanceProvider = Object.assign(Object.create(base), {
    getItem: async (id: string) => ({ ...(await base.getItem(id)), clientUserId: null }),
  });
  const h = harness(provider);
  await assert.rejects(h.of.completeConnect(U, { itemId: 'unknown', consent: true }), (e: any) => e.statusCode === 403);
  assert.equal(h.conns.length, 0);
});

