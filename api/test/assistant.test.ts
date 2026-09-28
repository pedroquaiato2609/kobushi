import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import { PermissionPolicy } from '../src/agent/policy';
import { ToolRunner } from '../src/agent/runner';
import { buildFinanceTools } from '../src/agent/financeTools';
import { FieldCrypto } from '../src/application/fieldCrypto';
import { FinanceService } from '../src/application/finance/service';
import { detect, SuggestionService, type AssistantSettings, type Signals, type Suggestion } from '../src/application/suggestions';

// ============================================================ sugestões proativas
const act = (over: Record<string, unknown>) => ({ id: 'a1', name: 'Atividade', kind: 'goal', timeMode: 'free', startTime: null, endTime: null, period: null, weekdays: [0, 1, 2, 3, 4, 5, 6], active: true, minDesc: '', idealDesc: '', maxDesc: '', principle: '', remindTime: null, remindChannels: [], ...over }) as any;
const ev = (id: string, title: string, start: string, end: string) => ({ id, title, start, end, description: '', location: '', activityId: null, remindMinutes: null, remindChannels: [] }) as any;
const base = (over: Partial<Signals> = {}): Signals => ({ today: '2026-09-21', nowMinutes: 17 * 60, activities: [], executions: [], events: [], reviewDoneToday: true, overdueCards: [], financeInsights: [], ...over });
const keys = (s: Signals) => detect(s).map((c) => c.key);

test('sinais: obrigação de amanhã sem lembrete aparece só à tarde/noite e explica o motivo', () => {
  const work = act({ id: 'work', name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', startTime: '08:00', endTime: '12:00', weekdays: [1, 2, 3, 4, 5] });
  const c = detect(base({ activities: [work] })).find((x) => x.key === 'remind:work:2026-09-22')!;
  assert.match(c.title, /amanhã às 08:00/); assert.ok(c.reason && c.data.length >= 1); assert.equal(c.actions[0].kind, 'chat');
  assert.deepEqual(keys(base({ nowMinutes: 10 * 60, activities: [work] })), []);                                 // de manhã ainda não faz sentido
  assert.deepEqual(keys(base({ activities: [{ ...work, remindTime: '07:30' }] })), []);                          // já tem lembrete
  assert.deepEqual(keys(base({ activities: [{ ...work, weekdays: [1] }] })), []);                                 // não é dia de trabalho amanhã
});

test('sinais: objetivo adiado 3+ dias seguidos (e só quando a sequência é real)', () => {
  const gym = act({ id: 'gym', name: 'Academia', minDesc: '10 min de alongamento' });
  const ex = (date: string) => ({ activityId: 'gym', date, level: 'ideal', note: '' }) as any;
  const c = detect(base({ activities: [gym], executions: [ex('2026-09-15')] })).find((x) => x.type === 'routine')!;
  assert.match(c.title, /adiado 5 vezes/); assert.match(c.reason, /nível mínimo/);
  assert.equal(detect(base({ activities: [gym], executions: [ex('2026-09-19')] })).filter((x) => x.key.startsWith('postponed')).length, 0); // só 1 dia faltou
  assert.equal(detect(base({ activities: [gym], executions: [ex('2026-09-21')] })).filter((x) => x.key.startsWith('postponed')).length, 0); // já fez hoje
  assert.equal(detect(base({ activities: [{ ...gym, kind: 'obligation' }] })).filter((x) => x.key.startsWith('postponed')).length, 0);      // obrigação não é "adiada"
});

test('sinais: conflito de agenda, agenda concentrada à tarde e revisão do dia', () => {
  const conflict = detect(base({ events: [ev('e1', 'Dentista', '2026-09-22T14:00', '2026-09-22T15:00'), ev('e2', 'Reunião', '2026-09-22T14:30', '2026-09-22T15:30'), ev('e3', 'Jantar', '2026-09-22T19:00', '2026-09-22T20:00')] }));
  assert.equal(conflict.filter((c) => c.key.startsWith('conflict')).length, 1);
  assert.equal(conflict.find((c) => c.key.startsWith('conflict'))!.severity, 'high'); // amanhã: urgente

  const busy = base({ nowMinutes: 8 * 60, events: [ev('e1', 'Aulas', '2026-09-21T13:00', '2026-09-21T17:30')], activities: [act({ id: 'read', name: 'Leitura' })] });
  const conc = detect(busy).find((c) => c.key === 'concentration:2026-09-21')!;
  assert.match(conc.reason, /5h ocupadas|4h ocupadas/); assert.ok(conc.data.some((d) => d.includes('Leitura')));
  assert.equal(detect({ ...busy, activities: [] }).some((c) => c.key.startsWith('concentration')), false); // sem objetivo flexível, não há o que reorganizar

  assert.ok(keys(base({ nowMinutes: 21 * 60, reviewDoneToday: false })).includes('review:2026-09-21'));
  assert.ok(!keys(base({ nowMinutes: 21 * 60, reviewDoneToday: true })).includes('review:2026-09-21'));
  assert.ok(!keys(base({ nowMinutes: 15 * 60, reviewDoneToday: false })).includes('review:2026-09-21'));
});

function suggestionHarness(signals: Signals, settings: Partial<AssistantSettings> = {}) {
  const rows: Suggestion[] = []; let seq = 0;
  let cfg: AssistantSettings = { proactivity: 'normal', types: ['agenda', 'routine', 'review', 'finance'], maxPerDay: 5, quietStart: '22:00', quietEnd: '07:00', dailyReviewTime: null, weeklyReviewTime: null, ...settings };
  const created: string[] = [];
  const service = new SuggestionService(
    {
      getSettings: async () => cfg, updateSettings: async (_u, p) => (cfg = { ...cfg, ...p }), list: async () => rows,
      create: async (_u, c) => { const s = { ...c, id: `s${++seq}`, userId: 'u', status: 'open', snoozeUntil: null, createdAt: new Date('2026-09-21T15:00:00Z'), resolvedAt: null } as Suggestion; rows.push(s); return s; },
      setStatus: async (_u, id, status, until = null) => { const s = rows.find((x) => x.id === id)!; s.status = status; s.snoozeUntil = until; return s; },
    },
    { collect: async () => signals }, async (_u, s) => { created.push(s.key); }, () => new Date('2026-09-21T20:00:00Z'), () => '2026-09-21',
  );
  return { service, rows, created, set: (p: Partial<AssistantSettings>) => (cfg = { ...cfg, ...p }) };
}
const manySignals = () => base({
  activities: [act({ id: 'work', name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', startTime: '08:00', endTime: '12:00', weekdays: [1, 2, 3, 4, 5] }), act({ id: 'gym', name: 'Academia' })],
  events: [ev('e1', 'A', '2026-09-22T14:00', '2026-09-22T15:00'), ev('e2', 'B', '2026-09-22T14:30', '2026-09-22T15:30')],
  nowMinutes: 21 * 60, reviewDoneToday: false,
});

test('moderação: frequência baixa limita o que fica aberto e mostra primeiro o mais urgente', async () => {
  const h = suggestionHarness(manySignals(), { proactivity: 'low', maxPerDay: 5 });
  await h.service.refresh('u');
  const open = await h.service.open('u');
  assert.equal(open.length, 2);                                       // teto de 2 abertas no modo "baixo"
  assert.equal(open[0].severity, 'high');                             // o conflito de amanhã vem antes
  assert.ok(open.every((s) => s.severity !== 'info'));                // "baixo" não mostra sugestões só informativas
  assert.deepEqual(await h.service.refresh('u'), []);                 // repetir a busca não cria nada novo
  const normal = suggestionHarness(manySignals(), { proactivity: 'normal', maxPerDay: 5 });
  await normal.service.refresh('u');
  assert.ok((await normal.service.open('u')).length >= 4);
});

test('moderação: desligado, horário de silêncio, tipos escolhidos e teto diário', async () => {
  const off = suggestionHarness(manySignals(), { proactivity: 'off' });
  assert.deepEqual(await off.service.refresh('u'), []);
  const quiet = suggestionHarness({ ...manySignals(), nowMinutes: 23 * 60 }, {});
  assert.deepEqual(await quiet.service.refresh('u'), []);
  const onlyReview = suggestionHarness(manySignals(), { types: ['review'] });
  await onlyReview.service.refresh('u');
  assert.deepEqual((await onlyReview.service.open('u')).map((s) => s.type), ['review']);
  const capped = suggestionHarness(manySignals(), { maxPerDay: 1 });
  assert.equal((await capped.service.refresh('u')).length, 1);
  assert.equal((await capped.service.refresh('u')).length, 0);
});

test('moderação: o que o usuário dispensou não volta; o adiado volta no prazo', async () => {
  const h = suggestionHarness(manySignals(), { maxPerDay: 10 });
  await h.service.refresh('u');
  const [first, second] = await h.service.open('u');
  await h.service.resolve('u', first.id, 'dismissed');
  await h.service.resolve('u', second.id, 'snoozed', 1);
  assert.ok(!(await h.service.open('u')).some((s) => s.id === first.id || s.id === second.id));
  await h.service.refresh('u');
  assert.equal(h.rows.filter((r) => r.key === first.key).length, 1);   // mesmo sinal, mesma sugestão: nunca duplica
  assert.equal(h.rows.find((r) => r.id === first.id)!.status, 'dismissed');
  h.rows.find((r) => r.id === second.id)!.snoozeUntil = new Date('2026-09-21T10:00:00Z'); // o prazo do adiamento passou
  assert.ok((await h.service.open('u')).some((s) => s.id === second.id));
});

// ============================================================ finanças + ferramentas do agente
function mem<T extends { id: string; userId: string }>() {
  const rows: T[] = []; let n = 0;
  return {
    rows,
    list: async (u: string) => rows.filter((r) => r.userId === u),
    get: async (u: string, id: string) => rows.find((r) => r.id === id && r.userId === u) ?? null,
    create: async (u: string, d: any) => { const r = { id: `id${++n}`, userId: u, createdAt: new Date(), updatedAt: new Date(), ...d, ...(d.numberLast4 !== undefined ? { numberMask: d.numberLast4 ? `••••${d.numberLast4}` : null } : {}) } as T; rows.push(r); return r; },
    update: async (u: string, id: string, p: any) => { const r = rows.find((x) => x.id === id && x.userId === u); if (!r) return null; for (const [k, v] of Object.entries(p)) if (v !== undefined) (r as any)[k] = v; return r; },
    delete: async (u: string, id: string) => { const i = rows.findIndex((x) => x.id === id && x.userId === u); if (i < 0) return false; rows.splice(i, 1); return true; },
  };
}
function financeHarness() {
  const repo = { accounts: mem<any>(), categories: mem<any>(), transactions: mem<any>(), budgets: mem<any>(), goals: mem<any>(), recurring: mem<any>() } as any;
  repo.transactions.search = async (u: string, f: any) => repo.transactions.rows.filter((t: any) => t.userId === u && (!f.accountId || t.accountId === f.accountId)).sort((a: any, b: any) => b.occurredOn.localeCompare(a.occurredOn));
  const states: any[] = [];
  repo.insightStates = { list: async () => states, set: async (_u: string, key: string, state: string, until: string | null) => { states.push({ key, state, until }); } };
  repo.hasDemo = async (u: string) => repo.accounts.rows.some((a: any) => a.userId === u && a.source === 'demo') || repo.transactions.rows.some((t: any) => t.userId === u && t.source === 'demo');
  repo.purge = async (u: string, scope: string) => {
    for (const k of ['transactions', 'recurring', 'budgets', 'goals', 'accounts']) repo[k].rows.splice(0, repo[k].rows.length, ...repo[k].rows.filter((r: any) => r.userId !== u || (scope === 'demo' && r.source !== 'demo')));
    const ids = new Set(repo.accounts.rows.map((a: any) => a.id));
    repo.transactions.rows.splice(0, repo.transactions.rows.length, ...repo.transactions.rows.filter((t: any) => ids.has(t.accountId)));
  };
  const events: any[] = []; const cards: any[] = []; const audits: string[] = [];
  const fin = new FinanceService(repo, new FieldCrypto(Buffer.alloc(32, 7)), {
    today: () => '2026-09-21', createEvent: async (e) => { events.push(e); return { id: 'ev1' }; }, createCard: async (c) => { cards.push(c); return { id: 'card1' }; }, audit: (_u, a) => { audits.push(a); },
  });
  return { fin, repo, events, cards, audits };
}
const A = 'user-a'; const B = 'user-b';
const input = (accountId: string, over: Record<string, unknown> = {}) => ({ accountId, kind: 'expense' as const, amountCents: 8500, occurredOn: '2026-09-20', ...over });

test('finanças: validações de valor, data, transferência e categoria', async () => {
  const { fin } = financeHarness();
  const chk = await fin.createAccount(A, { name: 'Conta', kind: 'checking', number: '12345-6' });
  const sav = await fin.createAccount(A, { name: 'Reserva', kind: 'savings' });
  assert.equal(chk.numberMask, '••••3456'); assert.equal((chk as any).numberEnc, undefined);
  await assert.rejects(fin.createTransaction(A, input(chk.id, { amountCents: 0 })), /maior que zero/);
  await assert.rejects(fin.createTransaction(A, input(chk.id, { amountCents: 10.5 })), /maior que zero/);
  await assert.rejects(fin.createTransaction(A, input(chk.id, { occurredOn: '20/09/2026' })), /data válida/);
  await assert.rejects(fin.createTransaction(A, input('nao-existe')), /conta informada/);
  await assert.rejects(fin.createTransaction(A, input(chk.id, { kind: 'transfer' })), /destino/);
  await assert.rejects(fin.createTransaction(A, input(chk.id, { kind: 'transfer', transferAccountId: chk.id })), /diferente/);
  await assert.rejects(fin.createAccount(A, { name: 'Cartão', kind: 'credit_card' }), /fechamento/);
  const income = (await fin.refs(A)).categories.find((c) => c.name === 'Salário')!;
  await assert.rejects(fin.createTransaction(A, input(chk.id, { categoryId: income.id })), /receita/);
  const ok = await fin.createTransaction(A, input(chk.id, { kind: 'transfer', transferAccountId: sav.id, categoryId: income.id }));
  assert.equal(ok.categoryId, null); // transferência não tem categoria
});

test('finanças: cada usuário só enxerga e altera os próprios dados', async () => {
  const { fin } = financeHarness();
  const a = await fin.createAccount(A, { name: 'Conta A', kind: 'checking' });
  const t = await fin.createTransaction(A, input(a.id));
  assert.equal((await fin.overview(B)).accounts.length, 0);
  await assert.rejects(fin.getTransaction(B, t.id), /não encontrad/);
  await assert.rejects(fin.updateTransaction(B, t.id, { amountCents: 1 }), /não encontrad/);
  await assert.rejects(fin.deleteTransaction(B, t.id), /não encontrad/);
  await assert.rejects(fin.createTransaction(B, input(a.id)), /conta informada/);   // nem usar a conta de outro
  assert.equal((await fin.getTransaction(A, t.id)).amountCents, 8500);
});

test('finanças: nomes ambíguos ou inexistentes viram perguntas úteis, não palpites', async () => {
  const { fin } = financeHarness();
  await fin.createAccount(A, { name: 'Nubank Conta', kind: 'digital', institution: 'Nubank' });
  await fin.createAccount(A, { name: 'Nubank Reserva', kind: 'savings', institution: 'Nubank' });
  await assert.rejects(fin.resolveAccount(A, 'nubank'), /Mais de uma conta.*Nubank Conta, Nubank Reserva/);
  await assert.rejects(fin.resolveAccount(A, 'itaú'), /Não achei.*Nubank Conta/);
  assert.equal((await fin.resolveAccount(A, 'reserva')).name, 'Nubank Reserva');
  assert.equal((await fin.resolveCategory(A, 'combustivel', 'expense')).name, 'Combustível');
  assert.equal((await fin.resolveCategory(A, 'alimentação', 'expense')).parentId, null);
  await assert.rejects(fin.resolveCategory(A, 'xyzzy'), /Não achei a categoria/);
});

test('demonstração: tudo marcado como demo, gera insights explicáveis e some sem tocar nos dados reais', async () => {
  const { fin } = financeHarness();
  const real = await fin.createAccount(A, { name: 'Minha conta real', kind: 'checking', initialBalanceCents: 100000 });
  const realTx = await fin.createTransaction(A, input(real.id));
  await fin.seedDemo(A);
  await assert.rejects(fin.seedDemo(A), /já estão carregados/);
  const o = await fin.overview(A);
  assert.equal(o.hasDemo, true);
  const demoAccounts = o.accounts.filter((a) => a.source === 'demo');
  assert.equal(demoAccounts.length, 3); assert.ok(demoAccounts.every((a) => a.name.startsWith('[DEMO]')));
  const types = (await fin.insights(A)).map((i) => i.type);
  for (const t of ['category_growth', 'unusual_purchase', 'duplicate_charge', 'missing_recurring', 'projection']) assert.ok(types.includes(t as never), `faltou insight ${t}: ${types}`);
  assert.ok(o.upcoming.some((u) => u.title === 'Condomínio')); assert.ok(o.budgets.length >= 2 && o.goals.length >= 2);
  await fin.purgeDemo(A);
  const after = await fin.overview(A);
  assert.equal(after.hasDemo, false); assert.deepEqual(after.accounts.map((a) => a.name), ['Minha conta real']);
  assert.equal((await fin.getTransaction(A, realTx.id)).id, realTx.id);
  assert.equal(after.goals.length, 0);
});

test('recorrências viram pendências uma única vez; pagar fatura é uma transferência; agenda e kanban criados sob demanda', async () => {
  const { fin, events, cards } = financeHarness();
  const chk = await fin.createAccount(A, { name: 'Conta', kind: 'checking', initialBalanceCents: 500000 });
  const cc = await fin.createAccount(A, { name: 'Cartão', kind: 'credit_card', closingDay: 10, dueDay: 20 });
  await fin.createRecurring(A, { description: 'Internet', amountCents: 9990, kind: 'expense', categoryId: null, accountId: chk.id, frequency: 'monthly', nextDue: '2026-09-25', isSubscription: false, usage: null, remindDaysBefore: 2, remindChannels: [] } as never);
  assert.equal(await fin.materializeRecurring(A), 1);
  assert.equal(await fin.materializeRecurring(A), 0);                                   // já gerou; a próxima data avançou para outubro
  const pending = (await fin.listTransactions(A, {})).filter((t) => t.status === 'pending');
  assert.equal(pending.length, 1); assert.equal(pending[0].occurredOn, '2026-09-25'); assert.equal((await fin.listRecurring(A))[0].nextDue, '2026-10-25');
  await fin.schedulePayment(A, pending[0].id);
  assert.deepEqual([events[0].start, events[0].end, events[0].remindMinutes], ['2026-09-25T09:00', '2026-09-25T09:30', 60]);
  const pay = await fin.payInvoice(A, cc.id, chk.id, 30000, '2026-09-20');
  assert.equal(pay.kind, 'transfer'); assert.equal(pay.transferAccountId, cc.id);
  await assert.rejects(fin.payInvoice(A, chk.id, chk.id, 100, '2026-09-20'), /cartão/);
  const goal = await fin.createGoal(A, { name: 'Viagem', targetCents: 800000, deadline: '2027-03-01' });
  await fin.goalToKanban(A, goal.id);
  assert.equal(cards[0].dueDate, '2027-03-01'); assert.match(cards[0].title, /Viagem/);
  await assert.rejects(fin.goalToKanban(A, goal.id), /já virou/);
});

// ---- o agente nunca grava dinheiro sem confirmação
function agentHarness(stored: Record<string, 'allow' | 'confirm' | 'deny'> = {}) {
  const h = financeHarness();
  const actions: any[] = [];
  const actionRepo: any = {
    create: async (d: any) => { const a = { id: `act${actions.length + 1}`, createdAt: new Date(), resolvedAt: null, ...d }; actions.push(a); return a; },
    get: async (id: string) => actions.find((a) => a.id === id) ?? null,
    resolve: async (id: string, status: string, result: unknown) => { const a = actions.find((x) => x.id === id); a.status = status; a.result = result; return a; },
  };
  const tools = buildFinanceTools(h.fin, { open: async () => [], resolve: async () => null } as any);
  const policy = new PermissionPolicy({ all: async () => stored, setMany: async () => undefined });
  const runner = new ToolRunner(tools, policy, actionRepo, () => ({ type: 'object', properties: {} }));
  return { ...h, actions, runner };
}

test('agente financeiro: leitura sempre disponível e gravações bloqueadas mesmo com allow', async () => {
  const { fin, runner, actions } = agentHarness({ fin_create_transaction: 'allow' });
  await fin.createAccount(A, { name: 'Conta', kind: 'checking' });
  const out: any = await runner.execute({ id: '1', name: 'fin_create_transaction', args: { kind: 'expense', amount: 85 } }, 'c', { userId: A });
  assert.equal(out.error, 'permission_denied');
  assert.equal((await fin.listTransactions(A, {})).length, 0);
  const specs = await runner.specsForModel({ finance: false });
  assert.ok(specs.some(s => s.name === 'fin_get_spending_total'));
  assert.ok(!specs.some(s => s.name === 'fin_create_transaction'));
  actions.push({ id: 'old', tool: 'fin_create_transaction', status: 'pending', args: {} });
  await assert.rejects(runner.approve('old', { userId: A }), /bloqueada/);
});

test('gastos: soma mais de 50 lançamentos, separa pendentes, exclui demo e outro usuário', async () => {
  const { fin, runner } = agentHarness();
  const a = await fin.createAccount(A, { name: 'Conta', kind: 'checking' });
  const b = await fin.createAccount(B, { name: 'Outra', kind: 'checking' });
  for (let i = 0; i < 55; i++) await fin.createTransaction(A, input(a.id, { amountCents: 1000, description: 'UBER *TRIP', occurredOn: '2026-09-10' }));
  await fin.createTransaction(A, input(a.id, { amountCents: 2000, description: 'Uber', status: 'pending', occurredOn: '2026-09-10' }));
  await fin.createTransaction(A, input(a.id, { amountCents: 9999, description: 'Uber', source: 'demo', occurredOn: '2026-09-10' }));
  await fin.createTransaction(B, input(b.id, { amountCents: 8888, description: 'Uber', occurredOn: '2026-09-10' }));
  const r: any = await runner.execute({ id: 'q', name: 'fin_get_spending_total', args: { query: 'uber', from: '2026-09-01', to: '2026-09-30' } }, 'c', { userId: A });
  assert.equal(r.confirmedCents, 55000);
  assert.equal(r.pendingCents, 2000);
  assert.equal(r.count, 56);
});

test('log de ações: consulta financeira é registrada sem guardar os valores', async () => {
  const { fin, runner, actions } = agentHarness();
  const a = await fin.createAccount(A, { name: 'Conta', kind: 'checking' });
  await fin.createTransaction(A, input(a.id, { amountCents: 12345, description: 'MERCADO SECRETO', occurredOn: '2026-09-10' }));
  const out: any = await runner.execute({ id: 'z', name: 'fin_list_transactions', args: {} }, 'c', { userId: A });
  assert.ok(JSON.stringify(out).includes('MERCADO SECRETO')); // o modelo recebe o dado
  assert.ok(!JSON.stringify(actions).includes('MERCADO SECRETO')); // o log não
});
