import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advanceDue, balances, budgetStatus, cardInvoices, cashFlow, monthSummary, patrimony, totals, upcoming } from '../src/application/finance/analytics';
import { computeInsights } from '../src/application/finance/insights';
import type { FinAccount, FinCategory, FinData, FinRecurring, FinTransaction } from '../src/application/finance/types';
import { brl, toCents } from '../src/domain/money';

const U = 'u1';
let n = 0;
const acc = (over: Partial<FinAccount> = {}): FinAccount => ({ id: `a${++n}`, userId: U, name: 'Conta', kind: 'checking', institution: '', numberMask: null, initialBalanceCents: 0, creditLimitCents: null, closingDay: null, dueDay: null, invoiceRemindDays: null, invoiceRemindChannels: [], source: 'manual', archived: false, createdAt: new Date(), ...over });
const cat = (id: string, name: string, over: Partial<FinCategory> = {}): FinCategory => ({ id, userId: U, name, parentId: null, kind: 'expense', color: '#fff', ...over });
const tx = (over: Partial<FinTransaction>): FinTransaction => ({ id: `t${++n}`, userId: U, accountId: 'chk', kind: 'expense', amountCents: 1000, occurredOn: '2026-09-10', description: '', merchant: '', categoryId: null, status: 'confirmed', transferAccountId: null, recurringId: null, note: '', linkActivityId: null, linkCardId: null, remindDaysBefore: null, remindChannels: [], documentId: null, source: 'manual', externalId: null, createdAt: new Date(), updatedAt: new Date(), ...over });
const data = (over: Partial<FinData>): FinData => ({ today: '2026-09-21', accounts: [], categories: [], txs: [], budgets: [], goals: [], recurring: [], ...over });

test('dinheiro: centavos inteiros e formatação em reais', () => {
  assert.equal(toCents(85), 8500);
  assert.equal(toCents(19.99), 1999);
  assert.equal(toCents(0.1 + 0.2), 30); // sem erro de ponto flutuante
  assert.match(brl(123456), /1\.234,56/);
});

test('saldos: receitas, despesas, transferências; pendentes e futuras não entram no saldo', () => {
  const chk = acc({ id: 'chk', initialBalanceCents: 100000 });
  const sav = acc({ id: 'sav', kind: 'savings' });
  const d = data({ accounts: [chk, sav], txs: [
    tx({ kind: 'income', amountCents: 500000, occurredOn: '2026-09-05' }),
    tx({ kind: 'expense', amountCents: 8500, occurredOn: '2026-09-06' }),
    tx({ kind: 'transfer', accountId: 'chk', transferAccountId: 'sav', amountCents: 100000, occurredOn: '2026-09-07' }),
    tx({ kind: 'expense', amountCents: 20000, status: 'pending' }),           // pendente
    tx({ kind: 'expense', amountCents: 30000, occurredOn: '2026-09-30' }),    // futura
  ] });
  const b = balances(d);
  assert.equal(b.get('chk')!.balanceCents, 100000 + 500000 - 8500 - 100000);
  assert.equal(b.get('sav')!.balanceCents, 100000);
  assert.equal(b.get('chk')!.pendingCents, -50000);
  assert.equal(totals(d).netCents, b.get('chk')!.balanceCents + 100000); // a transferência não cria nem destrói dinheiro
});

test('resumo do mês: transferências e pendentes ficam de fora; subcategorias entram na categoria-mãe', () => {
  const cats = [cat('food', 'Alimentação'), cat('mkt', 'Mercado', { parentId: 'food' }), cat('sal', 'Salário', { kind: 'income' })];
  const d = data({ accounts: [acc({ id: 'chk' }), acc({ id: 'sav' })], categories: cats, txs: [
    tx({ kind: 'income', amountCents: 400000, categoryId: 'sal' }),
    tx({ amountCents: 30000, categoryId: 'mkt' }), tx({ amountCents: 5000, categoryId: 'food' }), tx({ amountCents: 2000 }),
    tx({ kind: 'transfer', transferAccountId: 'sav', amountCents: 99999 }), tx({ amountCents: 7000, status: 'pending' }),
  ] });
  const s = monthSummary(d, '2026-09');
  assert.equal(s.incomeCents, 400000); assert.equal(s.expenseCents, 37000); assert.equal(s.pendingExpenseCents, 7000);
  assert.deepEqual(s.byCategory.map((c) => [c.name, c.cents]), [['Alimentação', 35000], ['Sem categoria', 2000]]);
  assert.deepEqual(s.byCategory[0].children.map((c) => [c.name, c.cents]), [['Mercado', 30000]]);
  assert.equal(cashFlow(d, '2026-09', 3).length, 3);
});

test('patrimônio: evolução mensal acumulada, com dívida de cartão', () => {
  const d = data({ accounts: [acc({ id: 'chk', initialBalanceCents: 100000 }), acc({ id: 'cc', kind: 'credit_card' })], txs: [
    tx({ kind: 'income', amountCents: 200000, occurredOn: '2026-07-10' }),
    tx({ accountId: 'cc', amountCents: 50000, occurredOn: '2026-08-15' }),
  ] });
  const p = patrimony(d, '2026-09', 3);
  assert.deepEqual(p.map((x) => x.netCents), [300000, 250000, 250000]);
});

test('fatura do cartão: ciclo, vencimento e pagamento por transferência', () => {
  const cc = acc({ id: 'cc', kind: 'credit_card', closingDay: 10, dueDay: 20 });
  const d = data({ today: '2026-09-21', accounts: [cc, acc({ id: 'chk' })], txs: [
    tx({ accountId: 'cc', amountCents: 30000, occurredOn: '2026-08-15' }),   // fatura que fechou em 10/09
    tx({ accountId: 'cc', amountCents: 20000, occurredOn: '2026-09-09' }),   // idem
    tx({ accountId: 'cc', amountCents: 8000, occurredOn: '2026-09-15' }),    // fatura aberta (fecha 10/10)
    tx({ kind: 'transfer', accountId: 'chk', transferAccountId: 'cc', amountCents: 20000, occurredOn: '2026-09-20' }), // pagamento parcial
  ] });
  const inv = cardInvoices(cc, d)!;
  assert.equal(inv.closed!.totalCents, 50000); assert.equal(inv.closed!.due, '2026-09-20');
  assert.equal(inv.closed!.paidCents, 20000); assert.equal(inv.closed!.remainingCents, 30000);
  assert.equal(inv.open.totalCents, 8000); assert.equal(inv.open.end, '2026-10-10'); assert.equal(inv.open.due, '2026-10-20');
  assert.ok(upcoming(d, 40).some((u) => u.kind === 'invoice' && u.cents === 30000 && u.overdue)); // vencida e não paga inteira
  // vencimento antes do fechamento cai no mês seguinte
  const cc2 = acc({ id: 'cc2', kind: 'credit_card', closingDay: 25, dueDay: 5 });
  assert.equal(cardInvoices(cc2, data({ today: '2026-09-21', txs: [] }))!.open.due, '2026-10-05');
});

test('orçamentos: ok, risco (no ritmo atual estoura) e estourado', () => {
  const cats = [cat('leisure', 'Lazer'), cat('food', 'Alimentação')];
  const d = data({ today: '2026-09-15', categories: cats, accounts: [acc({ id: 'chk' })],
    budgets: [{ id: 'b1', userId: U, categoryId: 'leisure', limitCents: 60000 }, { id: 'b2', userId: U, categoryId: 'food', limitCents: 100000 }, { id: 'b3', userId: U, categoryId: null, limitCents: 50000 }],
    txs: [tx({ categoryId: 'leisure', amountCents: 40000 }), tx({ categoryId: 'food', amountCents: 20000 }), tx({ categoryId: 'food', amountCents: 40000, occurredOn: '2026-08-10' })] });
  const st = Object.fromEntries(budgetStatus(d, '2026-09').map((b) => [b.name, b]));
  assert.equal(st['Lazer'].state, 'risk');           // 40k em 15 dias -> projeta 80k > 60k
  assert.equal(st['Alimentação'].state, 'ok');
  assert.equal(st['Orçamento geral'].state, 'exceeded'); // 60k gastos no mês > 50k
  assert.equal(st['Orçamento geral'].spentCents, 60000);
});

test('recorrência avança por frequência, respeitando fim de mês', () => {
  assert.equal(advanceDue({ frequency: 'monthly', nextDue: '2026-01-31' }), '2026-02-28');
  assert.equal(advanceDue({ frequency: 'weekly', nextDue: '2026-09-21' }), '2026-09-28');
  assert.equal(advanceDue({ frequency: 'yearly', nextDue: '2026-02-28' }), '2027-02-28');
});

test('insights: categoria em alta, fora do padrão e duplicidade, cada um com os dados usados', () => {
  const cats = [cat('food', 'Alimentação'), cat('tech', 'Compras')];
  const txs: FinTransaction[] = [
    tx({ categoryId: 'food', amountCents: 20000, occurredOn: '2026-08-05', merchant: 'Mercado A' }),
    tx({ categoryId: 'food', amountCents: 40000, occurredOn: '2026-09-05', merchant: 'Mercado A' }),
    tx({ categoryId: 'food', amountCents: 15000, occurredOn: '2026-09-12', merchant: 'Mercado B' }),
    ...[1, 2, 3, 4, 5, 6].map((i) => tx({ categoryId: 'tech', amountCents: 5000, occurredOn: `2026-0${i < 4 ? 6 : 7}-${10 + i}` })),
    tx({ categoryId: 'tech', amountCents: 90000, occurredOn: '2026-09-18', merchant: 'Loja X' }),
    tx({ amountCents: 4590, occurredOn: '2026-09-19', merchant: 'Streaming Z' }), tx({ amountCents: 4590, occurredOn: '2026-09-20', merchant: 'Streaming Z' }),
  ];
  const ins = computeInsights(data({ accounts: [acc({ id: 'chk', initialBalanceCents: 1000000 })], categories: cats, txs }));
  const by = (type: string) => ins.filter((i) => i.type === type);
  assert.equal(by('category_growth')[0].title.includes('Alimentação'), true);
  assert.ok(by('category_growth')[0].why.length >= 2);
  assert.equal(by('unusual_purchase')[0].title.includes('Loja X'), true);
  assert.equal(by('duplicate_charge').length, 1);
  assert.ok(ins.every((i) => i.why.length > 0 && i.actions.length > 0)); // nenhum insight sem explicação e sem ação
});

test('insights: cobrança recorrente que não apareceu e projeção negativa', () => {
  const txs = ['2026-06-08', '2026-07-08', '2026-08-08'].map((occurredOn) => tx({ amountCents: 4990, occurredOn, merchant: 'Academia Forte' }));
  const d = data({ today: '2026-09-21', accounts: [acc({ id: 'chk', initialBalanceCents: 30000 })], txs: [...txs, tx({ amountCents: 90000, occurredOn: '2026-09-04' })] });
  const ins = computeInsights(d);
  assert.ok(ins.find((i) => i.type === 'missing_recurring' && i.title.includes('Academia Forte')));
  const proj = ins.find((i) => i.type === 'projection')!;
  assert.equal(proj.severity, 'high'); // saldo baixo e gasto variável alto
  assert.ok(proj.why.some((w) => w.includes('Saldo em contas hoje')));
});

test('insights: renda comprometida usa recorrências ativas e faturas a pagar', () => {
  const rec: FinRecurring = { id: 'r1', userId: U, description: 'Aluguel', amountCents: 250000, kind: 'expense', categoryId: null, accountId: 'chk', frequency: 'monthly', nextDue: '2026-10-05', active: true, isSubscription: false, usage: null, remindDaysBefore: null, remindChannels: [], source: 'manual' };
  const incomes = ['2026-06-05', '2026-07-05', '2026-08-05'].map((occurredOn) => tx({ kind: 'income', amountCents: 400000, occurredOn }));
  const ins = computeInsights(data({ accounts: [acc({ id: 'chk' })], recurring: [rec], txs: incomes }));
  const c = ins.find((i) => i.type === 'income_committed')!;
  assert.match(c.title, /63%/); assert.equal(c.severity, 'info');
});
