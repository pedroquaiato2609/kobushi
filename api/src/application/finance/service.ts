// Finanças: regras de negócio (validação, transferências, faturas, orçamentos, metas, recorrências, demonstração, privacidade).
// Todos os métodos recebem o userId: nada é lido nem gravado sem ele.
import { addDays } from '../../domain/dates';
import { AppError, NotFoundError, ValidationError } from '../../domain/errors';
import { brl } from '../../domain/money';
import type { FieldCrypto } from '../fieldCrypto';
import {
  advanceDue, balances, budgetStatus, cardInvoices, cashFlow, monthSummary, patrimony, prevMonth, totals, upcoming, ym,
} from './analytics';
import { DEFAULT_CATEGORIES } from './defaults';
import { buildDemo } from './demo';
import { computeInsights } from './insights';
import type { FinanceRepository, NewAccount, NewRecurring, NewTransaction, TxFilter } from './ports';
import type { AccountKind, FinAccount, FinCategory, FinData, FinTransaction, Insight, TxKind, TxStatus, Usage } from './types';
import type { NotifyChannel } from '../../domain/constants';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string) => DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const cents = (n: number, what = 'O valor') => {
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${what} precisa ser maior que zero.`);
  if (n > 100_000_000_000) throw new ValidationError(`${what} é grande demais.`);
  return n;
};

export interface TxInput {
  accountId: string; kind: TxKind; amountCents: number; occurredOn: string; description?: string; merchant?: string;
  categoryId?: string | null; status?: TxStatus; transferAccountId?: string | null; note?: string;
  linkActivityId?: string | null; linkCardId?: string | null; remindDaysBefore?: number | null; remindChannels?: NotifyChannel[];
  recurringId?: string | null; documentId?: string | null; source?: FinTransaction['source']; externalId?: string | null;
}
export interface AccountInput {
  name: string; kind: AccountKind; institution?: string; number?: string | null; initialBalanceCents?: number; creditLimitCents?: number | null;
  closingDay?: number | null; dueDay?: number | null; invoiceRemindDays?: number | null; invoiceRemindChannels?: NotifyChannel[];
  connectionId?: string | null; externalId?: string | null;
}

export interface FinanceDeps {
  today: () => string;
  createEvent: (e: { title: string; description: string; start: string; end: string; remindMinutes: number | null }) => Promise<{ id: string }>;
  createCard: (c: { title: string; description: string; dueDate: string | null }) => Promise<{ id: string }>;
  audit: (userId: string, action: string, target: string, detail?: Record<string, unknown>) => void;
}

/** Defesa em profundidade: o número criptografado da conta nunca sai do serviço, mesmo que um repositório o devolva. */
const safeAccount = (a: FinAccount): FinAccount => { const { numberEnc, numberLast4, ...rest } = a as FinAccount & { numberEnc?: unknown; numberLast4?: unknown }; return rest as FinAccount; };

export class FinanceService {
  constructor(private repo: FinanceRepository, private crypto: FieldCrypto, private deps: FinanceDeps) {}

  // ---- dados -------------------------------------------------------------------------------
  today() { return this.deps.today(); }
  async spendingTotal(userId: string, query: string, from?: string, to?: string) {
    const end = to ?? this.today();
    const start = from ?? `${end.slice(0, 7)}-01`;
    if (!isDate(start) || !isDate(end) || start > end) throw new ValidationError('Período inválido.');
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const search = normalize(query.trim());
    if (!search) throw new ValidationError('Informe o estabelecimento.');
    const rows = (await this.repo.transactions.list(userId)).filter((t) => t.source !== 'demo' && t.kind === 'expense'
      && t.occurredOn >= start && t.occurredOn <= end && normalize(`${t.description} ${t.merchant}`).includes(search));
    return { from: start, to: end, query, count: rows.length,
      confirmedCents: rows.filter((t) => t.status === 'confirmed').reduce((n, t) => n + t.amountCents, 0),
      pendingCents: rows.filter((t) => t.status === 'pending').reduce((n, t) => n + t.amountCents, 0) };
  }
  /** Contas e categorias (para resolver nomes e montar resumos). */
  async refs(userId: string) {
    await this.ensureCategories(userId);
    const [accounts, categories] = await Promise.all([this.repo.accounts.list(userId).then((l) => l.map(safeAccount)), this.repo.categories.list(userId)]);
    return { accounts, categories };
  }
  async getTransaction(userId: string, id: string) {
    const t = await this.repo.transactions.get(userId, id);
    if (!t) throw new NotFoundError('Movimentação');
    return t;
  }
  async listRecurring(userId: string) { return this.repo.recurring.list(userId); }
  async listBudgetStatus(userId: string, month?: string) { const d = await this.load(userId); return budgetStatus(d, month ?? ym(d.today)); }
  async listUpcoming(userId: string, days = 30) { const d = await this.load(userId); return upcoming(d, days); }
  async listGoals(userId: string) { return this.repo.goals.list(userId); }

  async load(userId: string): Promise<FinData> {
    await this.ensureCategories(userId);
    const [accounts, categories, txs, budgets, goals, recurring] = await Promise.all([
      this.repo.accounts.list(userId).then((l) => l.map(safeAccount)), this.repo.categories.list(userId), this.repo.transactions.search(userId, { limit: 100_000 }),
      this.repo.budgets.list(userId), this.repo.goals.list(userId), this.repo.recurring.list(userId),
    ]);
    return { today: this.deps.today(), accounts, categories, txs, budgets, goals, recurring };
  }

  async ensureCategories(userId: string) {
    if ((await this.repo.categories.list(userId)).length > 0) return;
    for (const c of DEFAULT_CATEGORIES) {
      const parent = await this.repo.categories.create(userId, { name: c.name, color: c.color, kind: c.kind, parentId: null });
      for (const child of c.children ?? []) await this.repo.categories.create(userId, { name: child, color: c.color, kind: c.kind, parentId: parent.id });
    }
  }

  // ---- visão geral -------------------------------------------------------------------------
  async overview(userId: string, month?: string) {
    const d = await this.load(userId);
    const m = month ?? ym(d.today);
    const bal = balances(d);
    const accounts = d.accounts.filter((a) => !a.archived).map((a) => ({
      ...a, balanceCents: bal.get(a.id)?.balanceCents ?? 0, pendingCents: bal.get(a.id)?.pendingCents ?? 0, invoices: cardInvoices(a, d),
    }));
    const insights = await this.filterInsights(userId, computeInsights(d), d.today);
    return {
      today: d.today, month: m, hasDemo: d.accounts.some((a) => a.source === 'demo') || d.txs.some((t) => t.source === 'demo'),
      totals: totals(d), accounts, summary: monthSummary(d, m), previousSummary: monthSummary(d, prevMonth(m)),
      cashFlow: cashFlow(d, m, 12), patrimony: patrimony(d, m, 12), upcoming: upcoming(d, 30),
      budgets: budgetStatus(d, m), goals: d.goals, insights: insights.slice(0, 4), insightCount: insights.length,
    };
  }

  async insights(userId: string): Promise<Insight[]> {
    const d = await this.load(userId);
    return this.filterInsights(userId, computeInsights(d), d.today);
  }
  private async filterInsights(userId: string, all: Insight[], today: string) {
    const states = new Map((await this.repo.insightStates.list(userId)).map((s) => [s.key, s]));
    return all.filter((i) => { const s = states.get(i.key); return !s || (s.state === 'muted' && s.until !== null && s.until < today); });
  }
  async setInsightState(userId: string, key: string, state: 'dismissed' | 'muted', days = 30) {
    await this.repo.insightStates.set(userId, key, state, state === 'muted' ? addDays(this.deps.today(), days) : null);
  }

  // ---- contas ------------------------------------------------------------------------------
  async createAccount(userId: string, i: AccountInput, source: NewAccount['source'] = 'manual'): Promise<FinAccount> {
    if (!i.name.trim()) throw new ValidationError('Dê um nome à conta.');
    if (i.kind === 'credit_card' && (!i.closingDay || !i.dueDay)) throw new ValidationError('Informe o dia de fechamento e o de vencimento da fatura.');
    const digits = (i.number ?? '').replace(/\D/g, '');
    const acc = await this.repo.accounts.create(userId, {
      name: i.name.trim(), kind: i.kind, institution: i.institution?.trim() ?? '', numberEnc: digits ? this.crypto.encrypt(digits) : null, numberLast4: digits ? digits.slice(-4) : null,
      initialBalanceCents: i.initialBalanceCents ?? 0, creditLimitCents: i.creditLimitCents ?? null, closingDay: i.closingDay ?? null, dueDay: i.dueDay ?? null,
      invoiceRemindDays: i.invoiceRemindDays ?? null, invoiceRemindChannels: i.invoiceRemindChannels ?? [], source, archived: false,
      connectionId: i.connectionId ?? null, externalId: i.externalId ?? null,
    });
    this.deps.audit(userId, 'finance.account_created', acc.id, { kind: acc.kind });
    return safeAccount(acc);
  }
  async updateAccount(userId: string, id: string, i: Partial<AccountInput> & { archived?: boolean }) {
    const patch: Partial<NewAccount> = {
      name: i.name?.trim(), kind: i.kind, institution: i.institution?.trim(), initialBalanceCents: i.initialBalanceCents, creditLimitCents: i.creditLimitCents,
      closingDay: i.closingDay, dueDay: i.dueDay, invoiceRemindDays: i.invoiceRemindDays, invoiceRemindChannels: i.invoiceRemindChannels, archived: i.archived,
    };
    if (i.number !== undefined) { const digits = (i.number ?? '').replace(/\D/g, ''); patch.numberEnc = digits ? this.crypto.encrypt(digits) : null; patch.numberLast4 = digits ? digits.slice(-4) : null; }
    const acc = await this.repo.accounts.update(userId, id, patch);
    if (!acc) throw new NotFoundError('Conta');
    this.deps.audit(userId, 'finance.account_updated', id);
    return safeAccount(acc);
  }
  async deleteAccount(userId: string, id: string) {
    if (!(await this.repo.accounts.delete(userId, id))) throw new NotFoundError('Conta');
    this.deps.audit(userId, 'finance.account_deleted', id); // as movimentações da conta são apagadas junto
  }

  // ---- categorias --------------------------------------------------------------------------
  async createCategory(userId: string, i: { name: string; kind: 'expense' | 'income'; parentId?: string | null; color?: string }) {
    if (!i.name.trim()) throw new ValidationError('Dê um nome à categoria.');
    if (i.parentId) { const p = (await this.repo.categories.get(userId, i.parentId)); if (!p || p.parentId) throw new ValidationError('A categoria-mãe não existe (ou já é uma subcategoria).'); if (p.kind !== i.kind) throw new ValidationError('A subcategoria precisa ser do mesmo tipo da categoria-mãe.'); }
    return this.repo.categories.create(userId, { name: i.name.trim(), kind: i.kind, parentId: i.parentId ?? null, color: i.color ?? '#7C6CF0' });
  }
  async updateCategory(userId: string, id: string, i: { name?: string; parentId?: string | null; color?: string }) {
    const current = await this.repo.categories.get(userId, id);
    if (!current) throw new NotFoundError('Categoria');
    if (i.name !== undefined && !i.name.trim()) throw new ValidationError('Dê um nome à categoria.');
    if (i.parentId) {
      if (i.parentId === id) throw new ValidationError('Uma categoria não pode ser a mãe dela mesma.');
      const p = await this.repo.categories.get(userId, i.parentId);
      if (!p || p.parentId) throw new ValidationError('A categoria-mãe não existe (ou já é uma subcategoria).');
      if (p.kind !== current.kind) throw new ValidationError('A subcategoria precisa ser do mesmo tipo da categoria-mãe.');
    }
    const cat = await this.repo.categories.update(userId, id, { name: i.name?.trim(), parentId: 'parentId' in i ? (i.parentId ?? null) : undefined, color: i.color });
    if (!cat) throw new NotFoundError('Categoria');
    return cat;
  }
  async deleteCategory(userId: string, id: string) { if (!(await this.repo.categories.delete(userId, id))) throw new NotFoundError('Categoria'); }

  // ---- movimentações -----------------------------------------------------------------------
  private async checkTx(userId: string, i: TxInput) {
    const account = await this.repo.accounts.get(userId, i.accountId);
    if (!account) throw new ValidationError('A conta informada não existe.');
    cents(i.amountCents);
    if (!isDate(i.occurredOn)) throw new ValidationError('Use uma data válida (AAAA-MM-DD).');
    if (i.kind === 'transfer') {
      if (!i.transferAccountId || i.transferAccountId === i.accountId) throw new ValidationError('Escolha uma conta de destino diferente da conta de origem.');
      if (!(await this.repo.accounts.get(userId, i.transferAccountId))) throw new ValidationError('A conta de destino não existe.');
    }
    if (i.categoryId) {
      const c = await this.repo.categories.get(userId, i.categoryId);
      if (!c) throw new ValidationError('A categoria informada não existe.');
      if (i.kind !== 'transfer' && c.kind !== i.kind) throw new ValidationError(`A categoria "${c.name}" é de ${c.kind === 'income' ? 'receita' : 'despesa'}.`);
    }
  }

  async createTransaction(userId: string, i: TxInput, opts: { audit?: boolean } = {}): Promise<FinTransaction> {
    await this.checkTx(userId, i);
    const data: NewTransaction = {
      accountId: i.accountId, kind: i.kind, amountCents: i.amountCents, occurredOn: i.occurredOn, description: i.description?.trim() ?? '', merchant: i.merchant?.trim() ?? '',
      categoryId: i.kind === 'transfer' ? null : i.categoryId ?? null, status: i.status ?? 'confirmed', transferAccountId: i.kind === 'transfer' ? i.transferAccountId ?? null : null,
      recurringId: i.recurringId ?? null, note: i.note ?? '', linkActivityId: i.linkActivityId ?? null, linkCardId: i.linkCardId ?? null,
      remindDaysBefore: i.remindDaysBefore ?? null, remindChannels: i.remindChannels ?? [], documentId: i.documentId ?? null, source: i.source ?? 'manual', externalId: i.externalId ?? null,
    };
    const tx = await this.repo.transactions.create(userId, data);
    if (opts.audit !== false) this.deps.audit(userId, 'finance.tx_created', tx.id, { kind: tx.kind, source: tx.source });
    return tx;
  }

  async updateTransaction(userId: string, id: string, patch: Partial<TxInput>): Promise<FinTransaction> {
    const cur = await this.repo.transactions.get(userId, id);
    if (!cur) throw new NotFoundError('Movimentação');
    const merged: TxInput = { ...cur, ...patch, categoryId: patch.categoryId === undefined ? cur.categoryId : patch.categoryId };
    await this.checkTx(userId, merged);
    const tx = await this.repo.transactions.update(userId, id, {
      accountId: patch.accountId, kind: patch.kind, amountCents: patch.amountCents, occurredOn: patch.occurredOn, description: patch.description?.trim(), merchant: patch.merchant?.trim(),
      categoryId: merged.kind === 'transfer' ? null : patch.categoryId, status: patch.status, transferAccountId: merged.kind === 'transfer' ? merged.transferAccountId : null,
      note: patch.note, linkActivityId: patch.linkActivityId, linkCardId: patch.linkCardId, remindDaysBefore: patch.remindDaysBefore, remindChannels: patch.remindChannels, documentId: patch.documentId,
    });
    this.deps.audit(userId, 'finance.tx_updated', id);
    return tx as FinTransaction;
  }
  async deleteTransaction(userId: string, id: string) {
    if (!(await this.repo.transactions.delete(userId, id))) throw new NotFoundError('Movimentação');
    this.deps.audit(userId, 'finance.tx_deleted', id);
  }
  listTransactions(userId: string, f: TxFilter) { return this.repo.transactions.search(userId, { ...f, limit: Math.min(f.limit ?? 200, 1000) }); }

  /** Pagar a fatura = transferir da conta de origem para o cartão. */
  async payInvoice(userId: string, cardId: string, fromAccountId: string, amountCents: number, date: string) {
    const card = await this.repo.accounts.get(userId, cardId);
    if (!card || card.kind !== 'credit_card') throw new ValidationError('Escolha um cartão de crédito.');
    return this.createTransaction(userId, { accountId: fromAccountId, transferAccountId: cardId, kind: 'transfer', amountCents, occurredOn: date, description: `Pagamento da fatura ${card.name}` });
  }

  // ---- importação (Open Finance) ------------------------------------------------------------
  /** Aplica uma conciliação/atualização vinda de uma importação (sem auditar cada linha). */
  async applyImportPatch(userId: string, txId: string, patch: { status?: TxStatus; amountCents?: number; occurredOn?: string; externalId?: string }) {
    if (patch.amountCents !== undefined) cents(patch.amountCents);
    return this.repo.transactions.update(userId, txId, patch);
  }
  /** Guarda o saldo informado pela instituição. Se `calibrate`, ajusta o saldo inicial para o saldo calculado bater com ele. */
  async recordProviderBalance(userId: string, accountId: string, balanceCents: number, at: Date, calibrate: boolean) {
    let initial: number | undefined;
    if (calibrate) {
      const d = await this.load(userId);
      const acc = d.accounts.find((a) => a.id === accountId);
      if (acc) initial = acc.initialBalanceCents + (balanceCents - (balances(d).get(accountId)?.balanceCents ?? 0));
    }
    await this.repo.accounts.update(userId, accountId, { providerBalanceCents: balanceCents, providerBalanceAt: at, ...(initial !== undefined ? { initialBalanceCents: initial } : {}) });
  }

  // ---- orçamentos, metas e recorrências -----------------------------------------------------
  async setBudget(userId: string, categoryId: string | null, limitCents: number) {
    cents(limitCents, 'O limite');
    if (categoryId && !(await this.repo.categories.get(userId, categoryId))) throw new ValidationError('A categoria informada não existe.');
    const existing = (await this.repo.budgets.list(userId)).find((b) => b.categoryId === categoryId);
    const out = existing ? await this.repo.budgets.update(userId, existing.id, { limitCents }) : await this.repo.budgets.create(userId, { categoryId, limitCents });
    this.deps.audit(userId, 'finance.budget_set', (out as { id: string }).id);
    return out;
  }
  async deleteBudget(userId: string, id: string) { if (!(await this.repo.budgets.delete(userId, id))) throw new NotFoundError('Orçamento'); }

  async createGoal(userId: string, i: { name: string; targetCents: number; currentCents?: number; deadline?: string | null; linkedAccountId?: string | null }) {
    cents(i.targetCents, 'A meta');
    if (i.deadline && !isDate(i.deadline)) throw new ValidationError('Use uma data válida (AAAA-MM-DD).');
    return this.repo.goals.create(userId, { name: i.name.trim(), targetCents: i.targetCents, currentCents: i.currentCents ?? 0, deadline: i.deadline ?? null, linkedAccountId: i.linkedAccountId ?? null, kanbanCardId: null });
  }
  async updateGoal(userId: string, id: string, patch: { name?: string; targetCents?: number; currentCents?: number; deadline?: string | null }) {
    const g = await this.repo.goals.update(userId, id, patch);
    if (!g) throw new NotFoundError('Meta');
    return g;
  }
  async contributeToGoal(userId: string, id: string, amountCents: number) {
    const g = await this.repo.goals.get(userId, id);
    if (!g) throw new NotFoundError('Meta');
    return this.updateGoal(userId, id, { currentCents: Math.max(0, g.currentCents + amountCents) });
  }
  async deleteGoal(userId: string, id: string) { if (!(await this.repo.goals.delete(userId, id))) throw new NotFoundError('Meta'); }

  async createRecurring(userId: string, i: Omit<NewRecurring, 'source' | 'active'> & { active?: boolean }) {
    cents(i.amountCents);
    if (!isDate(i.nextDue)) throw new ValidationError('Use uma data válida (AAAA-MM-DD).');
    const r = await this.repo.recurring.create(userId, { ...i, active: i.active ?? true, source: 'manual' });
    this.deps.audit(userId, 'finance.recurring_created', r.id);
    return r;
  }
  async updateRecurring(userId: string, id: string, patch: Partial<NewRecurring>) {
    if (patch.amountCents !== undefined) cents(patch.amountCents);
    const r = await this.repo.recurring.update(userId, id, patch);
    if (!r) throw new NotFoundError('Recorrência');
    return r;
  }
  async setUsage(userId: string, id: string, usage: Usage | null) { return this.updateRecurring(userId, id, { usage }); }
  async deleteRecurring(userId: string, id: string) { if (!(await this.repo.recurring.delete(userId, id))) throw new NotFoundError('Recorrência'); }

  /** Transforma recorrências que vencem em até 7 dias em movimentações pendentes (aparecem nos vencimentos e geram aviso). */
  async materializeRecurring(userId: string): Promise<number> {
    const today = this.deps.today();
    let made = 0;
    for (const r of await this.repo.recurring.list(userId)) {
      if (!r.active || !r.accountId || r.nextDue > addDays(today, 7)) continue;
      await this.createTransaction(userId, {
        accountId: r.accountId, kind: r.kind, amountCents: r.amountCents, occurredOn: r.nextDue, description: r.description, merchant: r.description,
        categoryId: r.categoryId, status: 'pending', recurringId: r.id, remindDaysBefore: r.remindDaysBefore, remindChannels: r.remindChannels, source: r.source,
      });
      await this.repo.recurring.update(userId, r.id, { nextDue: advanceDue(r) });
      made++;
    }
    return made;
  }

  // ---- integrações com agenda e kanban -----------------------------------------------------
  async schedulePayment(userId: string, txId: string) {
    const t = await this.repo.transactions.get(userId, txId);
    if (!t) throw new NotFoundError('Movimentação');
    return this.deps.createEvent({
      title: `Pagar: ${t.description || t.merchant || 'conta'}`, description: `${brl(t.amountCents)} — criado a partir das Finanças`,
      start: `${t.occurredOn}T09:00`, end: `${t.occurredOn}T09:30`, remindMinutes: 60,
    });
  }
  async goalToKanban(userId: string, goalId: string) {
    const g = await this.repo.goals.get(userId, goalId);
    if (!g) throw new NotFoundError('Meta');
    if (g.kanbanCardId) throw new AppError('Esta meta já virou um card no Kanban.', 409);
    const card = await this.deps.createCard({ title: `Meta: ${g.name}`, description: `Juntar ${brl(g.targetCents)}. Já guardado: ${brl(g.currentCents)}.`, dueDate: g.deadline });
    await this.repo.goals.update(userId, goalId, { kanbanCardId: card.id });
    return card;
  }

  // ---- referências por nome (usadas pelo agente) --------------------------------------------
  async resolveAccount(userId: string, ref: string): Promise<FinAccount> {
    const all = (await this.repo.accounts.list(userId)).filter((a) => !a.archived);
    const byId = all.find((a) => a.id === ref);
    if (byId) return byId;
    const q = ref.trim().toLowerCase();
    const hits = all.filter((a) => a.name.toLowerCase().includes(q) || a.institution.toLowerCase().includes(q));
    if (hits.length === 1) return hits[0];
    throw new ValidationError(hits.length ? `Mais de uma conta combina com "${ref}": ${hits.map((a) => a.name).join(', ')}. Pergunte ao usuário qual delas.` : `Não achei a conta "${ref}". Contas disponíveis: ${all.map((a) => a.name).join(', ') || 'nenhuma cadastrada'}.`);
  }
  async resolveCategory(userId: string, ref: string, kind?: 'expense' | 'income'): Promise<FinCategory> {
    await this.ensureCategories(userId);
    const all = (await this.repo.categories.list(userId)).filter((c) => !kind || c.kind === kind);
    const byId = all.find((c) => c.id === ref);
    if (byId) return byId;
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const q = norm(ref.trim());
    const exact = all.filter((c) => norm(c.name) === q);
    const hits = exact.length ? exact : all.filter((c) => norm(c.name).includes(q) || q.includes(norm(c.name)));
    if (hits.length >= 1) return hits.sort((a, b) => Number(!!a.parentId) - Number(!!b.parentId) || a.name.length - b.name.length)[0];
    throw new ValidationError(`Não achei a categoria "${ref}". Algumas: ${all.slice(0, 12).map((c) => c.name).join(', ')}.`);
  }

  // ---- demonstração ------------------------------------------------------------------------
  async seedDemo(userId: string) {
    if (await this.repo.hasDemo(userId)) throw new AppError('Os dados de demonstração já estão carregados.', 409);
    await this.ensureCategories(userId);
    const cats = await this.repo.categories.list(userId);
    const cat = (name: string) => cats.find((c) => c.name === name)?.id ?? null;
    const plan = buildDemo(this.deps.today(), cat);
    const ids = new Map<string, string>();
    for (const { ref, ...a } of plan.accounts) ids.set(ref, (await this.repo.accounts.create(userId, a)).id);
    for (const { account, to, ...t } of plan.txs) await this.repo.transactions.create(userId, { ...t, accountId: ids.get(account) as string, transferAccountId: to ? (ids.get(to) as string) : null });
    for (const r of plan.recurring) await this.repo.recurring.create(userId, { ...r, accountId: ids.get('cc') ?? null });
    for (const b of plan.budgets) { const id = cat(b.cat); if (id) await this.repo.budgets.create(userId, { categoryId: id, limitCents: b.cents, source: 'demo' }); }
    for (const g of plan.goals) await this.repo.goals.create(userId, { ...g, linkedAccountId: null, kanbanCardId: null, source: 'demo' });
    this.deps.audit(userId, 'finance.demo_loaded', '');
  }
  async purgeDemo(userId: string) { await this.repo.purge(userId, 'demo'); this.deps.audit(userId, 'finance.demo_removed', ''); }

  // ---- privacidade (LGPD) -------------------------------------------------------------------
  async exportAll(userId: string) { this.deps.audit(userId, 'privacy.export', 'finance'); return this.repo.exportAll(userId); }
  async deleteAll(userId: string) { await this.repo.purge(userId, 'all'); this.deps.audit(userId, 'privacy.finance_deleted', ''); }
}
