// Dados de DEMONSTRAÇÃO. Tudo é marcado com source='demo' e nome "[DEMO]": nunca se confunde com dados reais.
import { addDays } from '../../domain/dates';
import { clampDay, dayOf, monthsBack, nextMonth, ym } from './analytics';
import type { NewAccount, NewRecurring, NewTransaction } from './ports';

export const DEMO_PREFIX = '[DEMO]';

export function buildDemo(today: string, cat: (name: string) => string | null) {
  let seed = [...today].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 2147483647, 7);
  const rnd = (min: number, max: number) => { seed = (seed * 48271) % 2147483647; return Math.round(min + (seed / 2147483647) * (max - min)); };
  const month = ym(today);
  const dd = dayOf(today);

  const accounts: (NewAccount & { ref: 'chk' | 'sav' | 'cc' })[] = [
    { ref: 'chk', name: `${DEMO_PREFIX} Conta Corrente`, kind: 'checking', institution: 'Banco Exemplo', numberEnc: null, numberLast4: null, initialBalanceCents: 350000, creditLimitCents: null, closingDay: null, dueDay: null, invoiceRemindDays: null, invoiceRemindChannels: [], source: 'demo', archived: false },
    { ref: 'sav', name: `${DEMO_PREFIX} Reserva`, kind: 'savings', institution: 'Banco Exemplo', numberEnc: null, numberLast4: null, initialBalanceCents: 1200000, creditLimitCents: null, closingDay: null, dueDay: null, invoiceRemindDays: null, invoiceRemindChannels: [], source: 'demo', archived: false },
    { ref: 'cc', name: `${DEMO_PREFIX} Cartão`, kind: 'credit_card', institution: 'Banco Exemplo', numberEnc: null, numberLast4: null, initialBalanceCents: 0, creditLimitCents: 500000, closingDay: 10, dueDay: 20, invoiceRemindDays: 3, invoiceRemindChannels: [], source: 'demo', archived: false },
  ];

  const txs: (Omit<NewTransaction, 'accountId' | 'transferAccountId'> & { account: 'chk' | 'sav' | 'cc'; to?: 'chk' | 'sav' | 'cc' })[] = [];
  const add = (account: 'chk' | 'sav' | 'cc', kind: 'income' | 'expense' | 'transfer', cents: number, date: string, description: string, merchant: string, category: string | null, extra: Partial<NewTransaction> & { to?: 'chk' | 'sav' | 'cc' } = {}) => {
    if (date > today && extra.status !== 'pending') return;
    const { to, ...rest } = extra;
    txs.push({ account, to, kind, amountCents: cents, occurredOn: date, description, merchant, categoryId: category ? cat(category) : null, status: 'confirmed', recurringId: null, note: '', linkActivityId: null, linkCardId: null, remindDaysBefore: null, remindChannels: [], documentId: null, source: 'demo', externalId: null, ...rest });
  };

  for (const m of monthsBack(month, 5)) {
    const cur = m === month;
    const mult = cur ? 1.5 : 1; // mês atual com mercado mais caro: gera o insight de crescimento
    add('chk', 'income', 620000, clampDay(m, 5), 'Salário', 'Empresa Exemplo', 'Salário');
    add('chk', 'transfer', 100000, clampDay(m, 6), 'Aporte na reserva', '', null, { to: 'sav' });
    add('chk', 'expense', 180000, clampDay(m, 8), 'Aluguel', 'Imobiliária Exemplo', 'Aluguel e financiamento');
    add('chk', 'expense', rnd(19000, 24000), clampDay(m, 12), 'Conta de luz', 'Energia Exemplo', 'Contas da casa');
    add('chk', 'expense', 9990, clampDay(m, 14), 'Internet', 'Provedor Exemplo', 'Contas da casa');
    if (!cur || dd < 13) add('cc', 'expense', 12990, clampDay(m, 8), 'Academia Forte', 'Academia Forte', 'Saúde'); // no mês atual "some": gera o insight de cobrança ausente
    add('cc', 'expense', 5590, clampDay(m, 15), 'Streaming Filmes', 'Streaming Filmes', 'Assinaturas');
    add('cc', 'expense', 2190, clampDay(m, 3), 'Streaming Música', 'Streaming Música', 'Assinaturas');
    for (const day of [2, 9, 16, 23]) add(day % 2 ? 'cc' : 'chk', 'expense', Math.round(rnd(16000, 26000) * mult), clampDay(m, day), 'Compras do mês', 'Mercado Central', 'Mercado');
    for (const day of [7, 14, 21, 27]) add('cc', 'expense', rnd(4500, 9500), clampDay(m, day), 'Restaurante', day % 2 ? 'Cantina do Bairro' : 'Pizzaria Exemplo', 'Restaurantes');
    for (const day of [6, 20]) add('chk', 'expense', rnd(14000, 19000), clampDay(m, day), 'Combustível', 'Posto Exemplo', 'Combustível');
    add('cc', 'expense', rnd(4000, 8000), clampDay(m, 18), 'Cinema', 'Cinema Exemplo', 'Passeios');
    if (!cur) for (const day of [11, 24]) add('cc', 'expense', rnd(8000, 15000), clampDay(m, day), 'Compras diversas', 'Loja Central', 'Compras'); // histórico que dá base para detectar a compra fora do padrão
    if (cur) for (let i = 0; i < 9; i++) add('chk', 'expense', rnd(700, 2200), clampDay(m, Math.max(1, Math.min(dd, 1 + i * 2))), 'Padaria', 'Padaria Esquina', 'Restaurantes');
  }
  add('cc', 'expense', 189900, addDays(today, -3), 'Fone e acessórios', 'Loja Eletrônicos', 'Compras');   // fora do padrão
  add('cc', 'expense', 3990, addDays(today, -2), 'Assinatura extra', 'Streaming Extra', 'Assinaturas');  // possível duplicidade
  add('cc', 'expense', 3990, addDays(today, -1), 'Assinatura extra', 'Streaming Extra', 'Assinaturas');
  add('chk', 'expense', 45000, addDays(today, 5), 'Condomínio', 'Condomínio Exemplo', 'Contas da casa', { status: 'pending', remindDaysBefore: 2 });
  add('chk', 'expense', 32000, addDays(today, 12), 'IPTU', 'Prefeitura Exemplo', 'Impostos e taxas', { status: 'pending', remindDaysBefore: 3 });

  const rec = (description: string, cents: number, day: number, extra: Partial<NewRecurring> = {}): NewRecurring => ({
    description, amountCents: cents, kind: 'expense', categoryId: null, accountId: null, frequency: 'monthly',
    nextDue: day >= dd ? clampDay(month, day) : clampDay(nextMonth(month), day),
    active: true, isSubscription: false, usage: null, remindDaysBefore: null, remindChannels: [], source: 'demo', ...extra,
  });
  const recurring = [
    rec('Aluguel', 180000, 8, { categoryId: cat('Aluguel e financiamento') }),
    rec('Internet', 9990, 14, { categoryId: cat('Contas da casa') }),
    rec('Streaming Filmes', 5590, 15, { categoryId: cat('Assinaturas'), isSubscription: true, usage: 'sometimes' }),
    rec('Streaming Música', 2190, 3, { categoryId: cat('Assinaturas'), isSubscription: true, usage: 'often' }),
    rec('Academia Forte', 12990, 8, { categoryId: cat('Saúde'), isSubscription: true, usage: 'rarely' }),
  ];
  return { accounts, txs, recurring, budgets: [{ cat: 'Lazer', cents: 60000 }, { cat: 'Alimentação', cents: 150000 }], goals: [
    { name: `${DEMO_PREFIX} Reserva de emergência`, targetCents: 3000000, currentCents: 1200000, deadline: null },
    { name: `${DEMO_PREFIX} Viagem`, targetCents: 800000, currentCents: 150000, deadline: addDays(today, 180) },
  ] };
}
