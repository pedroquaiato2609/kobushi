// Cálculos financeiros puros (sem banco, sem relógio): dado um FinData, devolvem números.
import { addDays } from '../../domain/dates';
import type { FinAccount, FinBudget, FinCategory, FinData, FinRecurring, FinTransaction } from './types';

export const ym = (date: string) => date.slice(0, 7);
export const daysInMonth = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
export const prevMonth = (m: string) => { const y = Number(m.slice(0, 4)); const mo = Number(m.slice(5, 7)); return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`; };
export const nextMonth = (m: string) => { const y = Number(m.slice(0, 4)); const mo = Number(m.slice(5, 7)); return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`; };
export const clampDay = (m: string, day: number) => `${m}-${String(Math.min(day, daysInMonth(m))).padStart(2, '0')}`;
export const lastDay = (m: string) => clampDay(m, 31);
export const dayOf = (date: string) => Number(date.slice(8, 10));
export const monthsBack = (end: string, n: number) => { const out: string[] = []; let m = end; for (let i = 0; i < n; i++) { out.unshift(m); m = prevMonth(m); } return out; };

/** Vale no saldo: confirmada e já ocorrida. Pendentes e datas futuras são "previstas". */
export const isRealized = (t: FinTransaction, today: string) => t.status === 'confirmed' && t.occurredOn <= today;

/** Efeito de uma movimentação no saldo de uma conta. */
export function deltaFor(t: FinTransaction, accountId: string): number {
  if (t.kind === 'income') return t.accountId === accountId ? t.amountCents : 0;
  if (t.kind === 'expense') return t.accountId === accountId ? -t.amountCents : 0;
  if (t.accountId === accountId) return -t.amountCents;
  return t.transferAccountId === accountId ? t.amountCents : 0;
}

export function balances(d: Pick<FinData, 'accounts' | 'txs' | 'today'>) {
  const out = new Map<string, { balanceCents: number; pendingCents: number }>();
  for (const a of d.accounts) out.set(a.id, { balanceCents: a.initialBalanceCents, pendingCents: 0 });
  for (const t of d.txs) {
    const real = isRealized(t, d.today);
    for (const id of [t.accountId, t.transferAccountId]) {
      if (!id || !out.has(id)) continue;
      const cur = out.get(id)!;
      const delta = deltaFor(t, id);
      if (real) cur.balanceCents += delta; else cur.pendingCents += delta;
    }
  }
  return out;
}

export function totals(d: FinData) {
  const b = balances(d);
  let liquid = 0; let cards = 0;
  for (const a of d.accounts) {
    if (a.archived) continue;
    const bal = b.get(a.id)?.balanceCents ?? 0;
    if (a.kind === 'credit_card') cards += bal; else liquid += bal;
  }
  return { liquidCents: liquid, cardDebtCents: cards, netCents: liquid + cards };
}

const catMap = (cats: FinCategory[]) => new Map(cats.map((c) => [c.id, c]));
const topOf = (id: string | null, cats: Map<string, FinCategory>) => { const c = id ? cats.get(id) : undefined; return c?.parentId ? cats.get(c.parentId) ?? c : c; };

export interface CategorySlice { categoryId: string | null; name: string; color: string; cents: number; children: { categoryId: string | null; name: string; cents: number }[] }
export interface MonthSummary {
  month: string; incomeCents: number; expenseCents: number; netCents: number;
  pendingIncomeCents: number; pendingExpenseCents: number; byCategory: CategorySlice[];
}

export function monthSummary(d: FinData, month: string): MonthSummary {
  const cats = catMap(d.categories);
  let income = 0; let expense = 0; let pi = 0; let pe = 0;
  const slices = new Map<string, CategorySlice>();
  for (const t of d.txs) {
    if (t.kind === 'transfer' || ym(t.occurredOn) !== month) continue;
    if (!isRealized(t, d.today)) { if (t.status === 'pending' || t.occurredOn > d.today) { if (t.kind === 'income') pi += t.amountCents; else pe += t.amountCents; } continue; }
    if (t.kind === 'income') { income += t.amountCents; continue; }
    expense += t.amountCents;
    const top = topOf(t.categoryId, cats);
    const key = top?.id ?? 'none';
    const slice = slices.get(key) ?? { categoryId: top?.id ?? null, name: top?.name ?? 'Sem categoria', color: top?.color ?? '#7b849c', cents: 0, children: [] };
    slice.cents += t.amountCents;
    const leaf = t.categoryId ? cats.get(t.categoryId) : undefined;
    if (leaf && leaf.id !== top?.id) {
      const child = slice.children.find((c) => c.categoryId === leaf.id);
      if (child) child.cents += t.amountCents; else slice.children.push({ categoryId: leaf.id, name: leaf.name, cents: t.amountCents });
    }
    slices.set(key, slice);
  }
  const byCategory = [...slices.values()].sort((a, b) => b.cents - a.cents);
  byCategory.forEach((s) => s.children.sort((a, b) => b.cents - a.cents));
  return { month, incomeCents: income, expenseCents: expense, netCents: income - expense, pendingIncomeCents: pi, pendingExpenseCents: pe, byCategory };
}

export function cashFlow(d: FinData, endMonth: string, months = 12) {
  return monthsBack(endMonth, months).map((m) => { const s = monthSummary(d, m); return { month: m, incomeCents: s.incomeCents, expenseCents: s.expenseCents, netCents: s.netCents }; });
}

/** Patrimônio líquido (contas + dívidas de cartão) ao fim de cada mês. */
export function patrimony(d: FinData, endMonth: string, months = 12) {
  const base = d.accounts.filter((a) => !a.archived).reduce((n, a) => n + a.initialBalanceCents, 0);
  const ids = new Set(d.accounts.filter((a) => !a.archived).map((a) => a.id));
  return monthsBack(endMonth, months).map((m) => {
    const cutoff = lastDay(m) < d.today ? lastDay(m) : d.today;
    let net = base;
    for (const t of d.txs) {
      if (t.status !== 'confirmed' || t.occurredOn > cutoff) continue;
      for (const id of [t.accountId, t.transferAccountId]) if (id && ids.has(id)) net += deltaFor(t, id);
    }
    return { month: m, netCents: net };
  });
}

export interface Invoice { start: string; end: string; due: string; totalCents: number; paidCents: number; remainingCents: number }
export interface CardInvoices { open: Invoice; closed: Invoice | null }

/** Faturas do cartão: a aberta (em formação) e a fechada mais recente (a pagar). Pagamento = transferência para o cartão. */
export function cardInvoices(a: FinAccount, d: Pick<FinData, 'txs' | 'today'>): CardInvoices | null {
  if (a.kind !== 'credit_card' || !a.closingDay || !a.dueDay) return null;
  const closeOn = (m: string) => clampDay(m, a.closingDay as number);
  const dueFor = (closeMonth: string) => clampDay((a.dueDay as number) > (a.closingDay as number) ? closeMonth : nextMonth(closeMonth), a.dueDay as number);
  const thisMonth = ym(d.today);
  const openCloseMonth = d.today <= closeOn(thisMonth) ? thisMonth : nextMonth(thisMonth);
  const closedCloseMonth = prevMonth(openCloseMonth);
  const build = (closeMonth: string): Invoice => {
    const end = closeOn(closeMonth);
    const start = addDays(closeOn(prevMonth(closeMonth)), 1);
    let total = 0;
    for (const t of d.txs) if (t.kind === 'expense' && t.accountId === a.id && t.occurredOn >= start && t.occurredOn <= end) total += t.amountCents;
    let paid = 0;
    const nextEnd = closeOn(nextMonth(closeMonth));
    for (const t of d.txs) if (t.kind === 'transfer' && t.transferAccountId === a.id && t.status === 'confirmed' && t.occurredOn > end && t.occurredOn <= nextEnd) paid += t.amountCents;
    return { start, end, due: dueFor(closeMonth), totalCents: total, paidCents: paid, remainingCents: Math.max(0, total - paid) };
  };
  const closed = build(closedCloseMonth);
  return { open: build(openCloseMonth), closed: closed.totalCents > 0 ? closed : null };
}

export interface Upcoming { key: string; date: string; kind: 'bill' | 'recurring' | 'invoice'; title: string; cents: number; direction: 'out' | 'in'; overdue: boolean; refId: string; accountId: string | null }

export function upcoming(d: FinData, windowDays = 30): Upcoming[] {
  const end = addDays(d.today, windowDays);
  const out: Upcoming[] = [];
  for (const t of d.txs) {
    if (t.status !== 'pending' || t.kind === 'transfer') continue;
    if (t.occurredOn > end || t.occurredOn < addDays(d.today, -30)) continue;
    out.push({ key: `t-${t.id}`, date: t.occurredOn, kind: 'bill', title: t.description || t.merchant || 'Movimentação pendente', cents: t.amountCents, direction: t.kind === 'income' ? 'in' : 'out', overdue: t.occurredOn < d.today, refId: t.id, accountId: t.accountId });
  }
  for (const r of d.recurring) {
    if (!r.active) continue;
    // só entra se ainda não existe uma movimentação pendente gerada para essa recorrência
    if (d.txs.some((t) => t.recurringId === r.id && t.status === 'pending')) continue;
    if (r.nextDue <= end && r.nextDue >= addDays(d.today, -30)) out.push({ key: `r-${r.id}`, date: r.nextDue, kind: 'recurring', title: r.description, cents: netRecurringCents(r), direction: r.kind === 'income' ? 'in' : 'out', overdue: r.nextDue < d.today, refId: r.id, accountId: r.accountId });
  }
  for (const a of d.accounts) {
    const inv = cardInvoices(a, d);
    if (!inv || a.archived) continue;
    if (inv.closed && inv.closed.remainingCents > 0 && inv.closed.due >= addDays(d.today, -30) && inv.closed.due <= end) out.push({ key: `i-${a.id}-${inv.closed.due}`, date: inv.closed.due, kind: 'invoice', title: `Fatura ${a.name}`, cents: inv.closed.remainingCents, direction: 'out', overdue: inv.closed.due < d.today, refId: a.id, accountId: a.id });
    if (inv.open.totalCents > 0 && inv.open.due <= end && inv.open.due >= d.today) out.push({ key: `i-${a.id}-${inv.open.due}`, date: inv.open.due, kind: 'invoice', title: `Fatura ${a.name} (em aberto)`, cents: inv.open.totalCents, direction: 'out', overdue: false, refId: a.id, accountId: a.id });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface BudgetStatus { budget: FinBudget; name: string; color: string; spentCents: number; pct: number; projectedCents: number; state: 'ok' | 'risk' | 'exceeded' }

export function budgetStatus(d: FinData, month: string): BudgetStatus[] {
  const cats = catMap(d.categories);
  const dom = ym(d.today) === month ? dayOf(d.today) : daysInMonth(month);
  const dim = daysInMonth(month);
  return d.budgets.map((b) => {
    let spent = 0;
    for (const t of d.txs) {
      if (t.kind !== 'expense' || !isRealized(t, d.today) || ym(t.occurredOn) !== month) continue;
      if (b.categoryId === null || topOf(t.categoryId, cats)?.id === b.categoryId || t.categoryId === b.categoryId) spent += t.amountCents;
    }
    const cat = b.categoryId ? cats.get(b.categoryId) : undefined;
    const projected = ym(d.today) === month && dom >= 3 ? Math.round((spent / dom) * dim) : spent;
    const state: BudgetStatus['state'] = spent >= b.limitCents ? 'exceeded' : projected > b.limitCents && spent >= b.limitCents * 0.5 ? 'risk' : 'ok';
    return { budget: b, name: cat?.name ?? 'Orçamento geral', color: cat?.color ?? '#7C6CF0', spentCents: spent, pct: Math.round((spent / b.limitCents) * 100), projectedCents: projected, state };
  }).sort((a, b) => b.pct - a.pct);
}

/** Próxima data de uma recorrência depois de `from`. */
export function advanceDue(r: Pick<FinRecurring, 'frequency' | 'nextDue'>): string {
  if (r.frequency === 'weekly') return addDays(r.nextDue, 7);
  const y = Number(r.nextDue.slice(0, 4)); const day = dayOf(r.nextDue);
  if (r.frequency === 'yearly') return clampDay(`${y + 1}-${r.nextDue.slice(5, 7)}`, day);
  return clampDay(nextMonth(ym(r.nextDue)), day);
}

/** Valor que será efetivamente lançado numa recorrência (já com o desconto cadastrado, se houver). */
export const netRecurringCents = (r: Pick<FinRecurring, 'amountCents' | 'discountPct'>) =>
  r.discountPct ? Math.round(r.amountCents * (1 - r.discountPct / 100)) : r.amountCents;

/** Valor mensal equivalente de uma recorrência, já líquido de desconto (para "renda comprometida"). */
export const monthlyEquivalent = (r: Pick<FinRecurring, 'frequency' | 'amountCents' | 'discountPct'>) => {
  const net = netRecurringCents(r);
  return r.frequency === 'monthly' ? net : r.frequency === 'weekly' ? Math.round((net * 52) / 12) : Math.round(net / 12);
};

export interface IncomeCommitment { incomeCents: number; fixedCents: number; invoicesCents: number; committedCents: number; pct: number }
/** Quanto da renda média já está comprometido com gastos fixos (recorrências ativas) e faturas fechadas a pagar. */
export function incomeCommitment(d: FinData, month: string): IncomeCommitment {
  const last3 = monthsBack(prevMonth(month), 3).map((m) => monthSummary(d, m).incomeCents).filter((x) => x > 0);
  const incomeCents = last3.length ? Math.round(last3.reduce((a, b) => a + b, 0) / last3.length) : monthSummary(d, month).incomeCents;
  const fixedCents = d.recurring.filter((r) => r.active && r.kind === 'expense').reduce((n, r) => n + monthlyEquivalent(r), 0);
  const invoicesCents = d.accounts.reduce((n, a) => n + (cardInvoices(a, d)?.closed?.remainingCents ?? 0), 0);
  const committedCents = fixedCents + invoicesCents;
  return { incomeCents, fixedCents, invoicesCents, committedCents, pct: incomeCents > 0 ? Math.round((committedCents / incomeCents) * 100) : 0 };
}
