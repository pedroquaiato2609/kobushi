// Ferramentas financeiras do agente. Regras de ouro:
//  • toda ferramenta que grava dinheiro exige confirmação (travado: não dá para configurar como "permitir");
//  • a confirmação mostra exatamente o que será feito (passo `prepare`), e o que foi mostrado é o que executa;
//  • o userId vem da sessão (ctx), nunca de argumentos do modelo.
import { z } from 'zod';
import { NOTIFY_CHANNELS } from '../domain/constants';
import { ValidationError } from '../domain/errors';
import { brl, toCents } from '../domain/money';
import { dateStr } from '../application/schemas';
import type { FinanceService } from '../application/finance/service';
import type { FinAccount, FinCategory, FinTransaction } from '../application/finance/types';
import type { SuggestionService } from '../application/suggestions';
import { tool, type ToolDefinition } from './toolTypes';

const reais = z.number().positive().max(100_000_000).describe('valor em reais, ex.: 85.5');
const monthStr = z.string().regex(/^\d{4}-\d{2}$/).describe('YYYY-MM');
const channels = z.array(z.enum(NOTIFY_CHANNELS)).describe('push e/ou whatsapp; o sino do app é sempre usado');
const idStr = z.string().min(1).max(64);
const brDate = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const KIND_TEXT = { expense: 'Despesa', income: 'Receita', transfer: 'Transferência' } as const;

const catPath = (cats: FinCategory[], id: string | null) => {
  const c = cats.find((x) => x.id === id);
  if (!c) return 'Sem categoria';
  const p = c.parentId ? cats.find((x) => x.id === c.parentId) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
};
const accName = (accs: FinAccount[], id: string | null) => accs.find((a) => a.id === id)?.name ?? '—';
const isDemo = (source: string) => (source === 'demo' ? true : undefined);

export function buildFinanceTools(fin: FinanceService, suggestions: SuggestionService): ToolDefinition[] {
  const W = { resource: 'finance' as const, group: 'finance' as const, requiresConfirmation: true };
  const R = { resource: 'finance' as const, group: 'finance' as const, action: 'read' as const };

  const describeTx = async (userId: string, t: Pick<FinTransaction, 'kind' | 'amountCents' | 'occurredOn' | 'description' | 'merchant' | 'categoryId' | 'accountId' | 'transferAccountId' | 'status'>) => {
    const { accounts, categories } = await fin.refs(userId);
    const lines = [`${KIND_TEXT[t.kind]} de ${brl(t.amountCents)}${t.description || t.merchant ? ` — ${t.description || t.merchant}` : ''}`];
    if (t.kind === 'transfer') lines.push(`De: ${accName(accounts, t.accountId)} → Para: ${accName(accounts, t.transferAccountId)}`);
    else { lines.push(`Conta: ${accName(accounts, t.accountId)}`); lines.push(`Categoria: ${catPath(categories, t.categoryId)}`); }
    lines.push(`Data: ${brDate(t.occurredOn)} · ${t.status === 'pending' ? 'pendente (a pagar/receber)' : 'confirmada'}`);
    return lines;
  };

  const defaultAccount = async (userId: string) => {
    const { accounts } = await fin.refs(userId);
    const usable = accounts.filter((a) => !a.archived && a.kind !== 'credit_card');
    if (usable.length === 1) return usable[0];
    throw new ValidationError(usable.length ? `Em qual conta? Opções: ${accounts.filter((a) => !a.archived).map((a) => a.name).join(', ')}. Pergunte ao usuário.` : 'O usuário ainda não tem contas cadastradas. Pergunte se quer criar uma (fin_create_account).');
  };

  return [
    tool({ name: 'fin_get_spending_total', ...R, label: 'o total de gastos por estabelecimento',
      description: 'Soma todas as despesas reais por texto do estabelecimento (Uber, iFood etc.), sem limite de linhas. Separa confirmadas e pendentes e exclui demonstrações. Sem período, usa o mês atual.',
      schema: z.object({ query: z.string().trim().min(1).max(100), from: dateStr.optional(), to: dateStr.optional() }),
      run: async (a, ctx) => {
        const r = await fin.spendingTotal(ctx.userId, a.query, a.from, a.to);
        return { ...r, totalConfirmado: brl(r.confirmedCents), totalPendente: brl(r.pendingCents) };
      } }),
    // ---------------------------------------------------------------- leitura
    tool({ name: 'fin_get_overview', ...R, label: 'o panorama financeiro',
      description: 'Panorama do mês: saldos, receitas e despesas, principais categorias, orçamentos, próximos vencimentos e insights. Comece por aqui para perguntas gerais.',
      schema: z.object({ month: monthStr.optional() }),
      run: async ({ month }, ctx) => {
        const o = await fin.overview(ctx.userId, month);
        return {
          aviso: o.hasDemo ? 'HÁ DADOS DE DEMONSTRAÇÃO (não são reais). Diga isso ao usuário ao citar números.' : undefined, mes: o.month,
          saldoEmContas: brl(o.totals.liquidCents), dividaDeCartoes: brl(-o.totals.cardDebtCents), patrimonioLiquido: brl(o.totals.netCents),
          receitasDoMes: brl(o.summary.incomeCents), despesasDoMes: brl(o.summary.expenseCents), resultadoDoMes: brl(o.summary.netCents), aPagarPendentes: brl(o.summary.pendingExpenseCents),
          principaisCategorias: o.summary.byCategory.slice(0, 6).map((c) => ({ categoria: c.name, valor: brl(c.cents) })),
          orcamentos: o.budgets.map((b) => ({ id: b.budget.id, nome: b.name, gasto: brl(b.spentCents), limite: brl(b.budget.limitCents), pct: b.pct, estado: b.state })),
          proximosVencimentos: o.upcoming.slice(0, 6).map((u) => ({ data: brDate(u.date), titulo: u.title, valor: brl(u.cents), atrasado: u.overdue || undefined })),
          insights: o.insights.map((i) => ({ chave: i.key, titulo: i.title })),
        };
      } }),
    tool({ name: 'fin_list_accounts', ...R, label: 'as contas',
      description: 'Contas e cartões com saldo atual, e faturas (aberta e fechada) dos cartões.',
      schema: z.object({}),
      run: async (_a, ctx) => {
        const o = await fin.overview(ctx.userId);
        return o.accounts.map((a) => ({ id: a.id, nome: a.name, tipo: a.kind, instituicao: a.institution || undefined, numero: a.numberMask ?? undefined, saldo: brl(a.balanceCents), demo: isDemo(a.source),
          fatura: a.invoices ? { abertaAte: a.invoices.open.end, aberta: brl(a.invoices.open.totalCents), vencimentoDaAberta: a.invoices.open.due, fechadaAPagar: a.invoices.closed ? brl(a.invoices.closed.remainingCents) : undefined, vencimentoDaFechada: a.invoices.closed?.due } : undefined }));
      } }),
    tool({ name: 'fin_list_transactions', ...R, label: 'as movimentações',
      description: 'Lista/pesquisa movimentações. Filtros por período, conta, categoria (nome), tipo, situação e texto. Máximo 50 por chamada.',
      schema: z.object({ from: dateStr.optional(), to: dateStr.optional(), month: monthStr.optional(), account: z.string().optional(), category: z.string().optional(), kind: z.enum(['income', 'expense', 'transfer']).optional(), status: z.enum(['pending', 'confirmed']).optional(), query: z.string().max(100).optional(), limit: z.number().int().min(1).max(50).optional() }),
      run: async (a, ctx) => {
        const acc = a.account ? await fin.resolveAccount(ctx.userId, a.account) : null;
        const cat = a.category ? await fin.resolveCategory(ctx.userId, a.category) : null;
        const [txs, refs] = await Promise.all([fin.listTransactions(ctx.userId, { from: a.from, to: a.to, month: a.month, accountId: acc?.id, categoryId: cat?.id, kind: a.kind, status: a.status, query: a.query, limit: a.limit ?? 30 }), fin.refs(ctx.userId)]);
        const total = txs.filter((t) => t.kind === 'expense').reduce((n, t) => n + t.amountCents, 0);
        return { quantidade: txs.length, totalDeDespesasNaLista: brl(total), movimentacoes: txs.slice(0, 50).map((t) => ({ id: t.id, data: brDate(t.occurredOn), tipo: t.kind, valor: brl(t.amountCents), descricao: t.description || t.merchant, categoria: catPath(refs.categories, t.categoryId), conta: accName(refs.accounts, t.accountId), situacao: t.status, demo: isDemo(t.source) })) };
      } }),
    tool({ name: 'fin_spending_by_category', ...R, label: 'os gastos por categoria',
      description: 'Quanto foi gasto por categoria (com subcategorias) em um mês. Use para "quanto gastei com alimentação este mês?".',
      schema: z.object({ month: monthStr.optional() }),
      run: async ({ month }, ctx) => {
        const o = await fin.overview(ctx.userId, month);
        return { mes: o.month, totalGasto: brl(o.summary.expenseCents), mesAnterior: brl(o.previousSummary.expenseCents), categorias: o.summary.byCategory.map((c) => ({ categoria: c.name, valor: brl(c.cents), subcategorias: c.children.map((k) => ({ nome: k.name, valor: brl(k.cents) })) })) };
      } }),
    tool({ name: 'fin_list_budgets', ...R, label: 'os orçamentos',
      description: 'Orçamentos mensais com gasto, percentual, projeção e situação (ok, risk, exceeded).',
      schema: z.object({ month: monthStr.optional() }),
      run: async ({ month }, ctx) => (await fin.listBudgetStatus(ctx.userId, month)).map((b) => ({ id: b.budget.id, nome: b.name, gasto: brl(b.spentCents), limite: brl(b.budget.limitCents), pct: b.pct, projecao: brl(b.projectedCents), estado: b.state })) }),
    tool({ name: 'fin_list_upcoming', ...R, label: 'os próximos vencimentos',
      description: 'Contas a pagar/receber, recorrências e faturas de cartão nos próximos dias.',
      schema: z.object({ days: z.number().int().min(1).max(90).optional() }),
      run: async ({ days }, ctx) => (await fin.listUpcoming(ctx.userId, days ?? 30)).map((u) => ({ data: brDate(u.date), tipo: u.kind, titulo: u.title, valor: brl(u.cents), entra: u.direction === 'in' || undefined, atrasado: u.overdue || undefined, id: u.refId })) }),
    tool({ name: 'fin_list_subscriptions', ...R, label: 'as assinaturas',
      description: 'Assinaturas e recorrências. O grau de uso é informado pelo próprio usuário (não há como medir o uso real): quando vazio, diga que não há dado e pergunte.',
      schema: z.object({ onlyRarelyUsed: z.boolean().optional().describe('só as marcadas como pouco usadas') }),
      run: async ({ onlyRarelyUsed }, ctx) => {
        const list = (await fin.listRecurring(ctx.userId)).filter((r) => r.active && r.isSubscription && (!onlyRarelyUsed || r.usage === 'rarely'));
        return { total: brl(list.reduce((n, r) => n + (r.frequency === 'yearly' ? Math.round(r.amountCents / 12) : r.amountCents), 0)) + ' por mês (aprox.)', assinaturas: list.map((r) => ({ id: r.id, nome: r.description, valor: brl(r.amountCents), frequencia: r.frequency, proximoVencimento: brDate(r.nextDue), uso: r.usage ?? 'não informado', demo: isDemo(r.source) })) };
      } }),
    tool({ name: 'fin_get_insights', ...R, label: 'os insights financeiros',
      description: 'Insights calculados sobre os dados reais (categorias em alta, compras fora do padrão, cobranças ausentes ou duplicadas, projeção, orçamentos, renda comprometida), com os dados usados.',
      schema: z.object({}),
      run: async (_a, ctx) => (await fin.insights(ctx.userId)).slice(0, 8).map((i) => ({ chave: i.key, gravidade: i.severity, titulo: i.title, resumo: i.summary, dadosUsados: i.why })) }),
    tool({ name: 'fin_list_categories', ...R, label: 'as categorias',
      description: 'Categorias e subcategorias de despesa e receita.', schema: z.object({}),
      run: async (_a, ctx) => { const { categories } = await fin.refs(ctx.userId); return categories.filter((c) => !c.parentId).map((c) => ({ nome: c.name, tipo: c.kind, sub: categories.filter((k) => k.parentId === c.id).map((k) => k.name) })); } }),

    // ---------------------------------------------------------------- escrita (sempre com confirmação)
    tool({ name: 'fin_create_transaction', ...W, action: 'create', label: 'uma movimentação',
      description: 'Prepara o registro de uma despesa, receita ou transferência. Valor em reais. Se faltar valor, conta ou categoria e não der para deduzir, PERGUNTE antes de chamar. O usuário verá o resumo e confirmará.',
      schema: z.object({ kind: z.enum(['expense', 'income', 'transfer']), amount: reais, description: z.string().max(200).optional(), merchant: z.string().max(120).optional(), category: z.string().max(80).optional().describe('nome da categoria ou subcategoria'), account: z.string().max(80).optional().describe('nome da conta; para transferência, a de origem'), toAccount: z.string().max(80).optional().describe('só em transferência: conta de destino'), date: dateStr.optional().describe('padrão: hoje'), status: z.enum(['confirmed', 'pending']).optional().describe('pending = conta a pagar/receber'), note: z.string().max(300).optional() }),
      prepare: async (a, ctx) => {
        const acc = a.account ? await fin.resolveAccount(ctx.userId, a.account) : await defaultAccount(ctx.userId);
        const dest = a.kind === 'transfer' ? await fin.resolveAccount(ctx.userId, a.toAccount ?? '') : null;
        const cat = a.category && a.kind !== 'transfer' ? await fin.resolveCategory(ctx.userId, a.category, a.kind) : null;
        const args = { accountId: acc.id, transferAccountId: dest?.id ?? null, kind: a.kind, amountCents: toCents(a.amount), occurredOn: a.date ?? fin.today(), description: a.description ?? '', merchant: a.merchant ?? '', categoryId: cat?.id ?? null, status: a.status ?? 'confirmed', note: a.note ?? '' };
        return { args, summary: await describeTx(ctx.userId, args as never) };
      },
      run: async (args, ctx) => { const t = await fin.createTransaction(ctx.userId, args); return { ok: true, id: t.id, texto: `${KIND_TEXT[t.kind]} de ${brl(t.amountCents)} registrada.` }; } }),
    tool({ name: 'fin_update_transaction', ...W, action: 'update', label: 'uma movimentação',
      description: 'Prepara a alteração de uma movimentação (valor, data, descrição, categoria, conta ou situação). Use o id obtido em fin_list_transactions.',
      schema: z.object({ id: idStr, amount: reais.optional(), description: z.string().max(200).optional(), merchant: z.string().max(120).optional(), category: z.string().max(80).optional(), account: z.string().max(80).optional(), date: dateStr.optional(), status: z.enum(['confirmed', 'pending']).optional(), note: z.string().max(300).optional() }),
      prepare: async (a, ctx) => {
        const cur = await fin.getTransaction(ctx.userId, a.id);
        const patch: Record<string, unknown> = {};
        if (a.amount !== undefined) patch.amountCents = toCents(a.amount);
        if (a.description !== undefined) patch.description = a.description;
        if (a.merchant !== undefined) patch.merchant = a.merchant;
        if (a.date) patch.occurredOn = a.date;
        if (a.status) patch.status = a.status;
        if (a.note !== undefined) patch.note = a.note;
        if (a.account) patch.accountId = (await fin.resolveAccount(ctx.userId, a.account)).id;
        if (a.category) patch.categoryId = (await fin.resolveCategory(ctx.userId, a.category, cur.kind === 'income' ? 'income' : 'expense')).id;
        const after = { ...cur, ...patch } as FinTransaction;
        return { args: { id: a.id, patch }, summary: ['Movimentação atual:', ...(await describeTx(ctx.userId, cur)), 'Ficará assim:', ...(await describeTx(ctx.userId, after))] };
      },
      run: async ({ id, patch }, ctx) => { await fin.updateTransaction(ctx.userId, id, patch); return { ok: true }; } }),
    tool({ name: 'fin_delete_transaction', ...W, action: 'delete', label: 'uma movimentação',
      description: 'Prepara a exclusão de uma movimentação. Irreversível.', schema: z.object({ id: idStr }),
      prepare: async (a, ctx) => ({ args: { id: a.id }, summary: ['Apagar (não dá para desfazer):', ...(await describeTx(ctx.userId, await fin.getTransaction(ctx.userId, a.id)))] }),
      run: async ({ id }, ctx) => { await fin.deleteTransaction(ctx.userId, id); return { ok: true, deleted: true }; } }),
    tool({ name: 'fin_set_budget', ...W, action: 'create', label: 'um orçamento',
      description: 'Prepara um limite mensal (por categoria, ou geral se omitida). Se já existir, atualiza o limite. Valor em reais.',
      schema: z.object({ category: z.string().max(80).optional(), limit: reais }),
      prepare: async (a, ctx) => { const cat = a.category ? await fin.resolveCategory(ctx.userId, a.category, 'expense') : null; return { args: { categoryId: cat?.id ?? null, limitCents: toCents(a.limit) }, summary: [`Limite mensal de ${brl(toCents(a.limit))} para ${cat?.name ?? 'todas as despesas (geral)'}`] }; },
      run: async ({ categoryId, limitCents }, ctx) => { await fin.setBudget(ctx.userId, categoryId, limitCents); return { ok: true }; } }),
    tool({ name: 'fin_create_goal', ...W, action: 'create', label: 'uma meta financeira',
      description: 'Prepara uma meta de economia (valor alvo em reais, prazo opcional, valor já guardado opcional).',
      schema: z.object({ name: z.string().min(1).max(120), target: reais, current: z.number().min(0).max(100_000_000).optional(), deadline: dateStr.optional() }),
      prepare: async (a) => ({ args: { name: a.name, targetCents: toCents(a.target), currentCents: toCents(a.current ?? 0), deadline: a.deadline ?? null }, summary: [`Meta: ${a.name}`, `Alvo: ${brl(toCents(a.target))}${a.current ? ` · já guardado ${brl(toCents(a.current))}` : ''}`, a.deadline ? `Prazo: ${brDate(a.deadline)}` : 'Sem prazo']}),
      run: async (args, ctx) => { const g = await fin.createGoal(ctx.userId, args); return { ok: true, id: g.id }; } }),
    tool({ name: 'fin_contribute_goal', ...W, action: 'update', label: 'uma meta financeira',
      description: 'Prepara um aporte (ou retirada, com valor negativo) em uma meta. Valor em reais.',
      schema: z.object({ goalId: idStr, amount: z.number().min(-100_000_000).max(100_000_000) }),
      prepare: async (a, ctx) => { const g = (await fin.listGoals(ctx.userId)).find((x) => x.id === a.goalId); if (!g) throw new ValidationError('Meta não encontrada.'); return { args: { goalId: a.goalId, cents: toCents(a.amount) }, summary: [`${a.amount >= 0 ? 'Guardar' : 'Retirar'} ${brl(Math.abs(toCents(a.amount)))} na meta "${g.name}"`, `Hoje: ${brl(g.currentCents)} de ${brl(g.targetCents)}`] }; },
      run: async ({ goalId, cents }, ctx) => { await fin.contributeToGoal(ctx.userId, goalId, cents); return { ok: true }; } }),
    tool({ name: 'fin_goal_to_kanban', ...W, action: 'create', label: 'um card de meta no kanban',
      description: 'Prepara a criação de um card no Kanban a partir de uma meta financeira.', schema: z.object({ goalId: idStr }),
      prepare: async (a, ctx) => { const g = (await fin.listGoals(ctx.userId)).find((x) => x.id === a.goalId); if (!g) throw new ValidationError('Meta não encontrada.'); return { args: { goalId: a.goalId }, summary: [`Criar no Kanban o card "Meta: ${g.name}"${g.deadline ? ` com prazo ${brDate(g.deadline)}` : ''}`] }; },
      run: async ({ goalId }, ctx) => { await fin.goalToKanban(ctx.userId, goalId); return { ok: true }; } }),
    tool({ name: 'fin_create_recurring', ...W, action: 'create', label: 'uma recorrência',
      description: 'Prepara uma despesa/receita recorrente ou assinatura (valor em reais; nextDue = próxima data).',
      schema: z.object({ description: z.string().min(1).max(120), amount: reais, nextDue: dateStr, kind: z.enum(['expense', 'income']).optional(), frequency: z.enum(['weekly', 'monthly', 'yearly']).optional(), category: z.string().max(80).optional(), account: z.string().max(80).optional(), isSubscription: z.boolean().optional(), remindDaysBefore: z.number().int().min(0).max(30).optional(), remindChannels: channels.optional(), discountPct: z.number().min(0).max(100).optional().describe('Desconto (%) que o usuário disse que tem nesse valor — o amount continua sendo o de tabela.') }),
      prepare: async (a, ctx) => {
        const kind = a.kind ?? 'expense';
        const acc = a.account ? await fin.resolveAccount(ctx.userId, a.account) : await defaultAccount(ctx.userId);
        const cat = a.category ? await fin.resolveCategory(ctx.userId, a.category, kind) : null;
        return { args: { description: a.description, amountCents: toCents(a.amount), kind, categoryId: cat?.id ?? null, accountId: acc.id, frequency: a.frequency ?? 'monthly', nextDue: a.nextDue, isSubscription: a.isSubscription ?? false, usage: null, remindDaysBefore: a.remindDaysBefore ?? null, remindChannels: a.remindChannels ?? [], discountPct: a.discountPct ?? null },
          summary: [`${a.isSubscription ? 'Assinatura' : kind === 'income' ? 'Receita recorrente' : 'Despesa recorrente'}: ${a.description} — ${brl(toCents(a.amount))} (${{ weekly: 'toda semana', monthly: 'todo mês', yearly: 'todo ano' }[a.frequency ?? 'monthly']})`, `Próxima data: ${brDate(a.nextDue)} · Conta: ${acc.name}`, ...(a.discountPct ? [`Com ${a.discountPct}% de desconto`] : []), ...(a.remindDaysBefore !== undefined ? [`Aviso ${a.remindDaysBefore} dia(s) antes`] : [])] };
      },
      run: async (args, ctx) => { const r = await fin.createRecurring(ctx.userId, args); return { ok: true, id: r.id }; } }),
    tool({ name: 'fin_create_account', ...W, action: 'create', label: 'uma conta',
      description: 'Prepara o cadastro de uma conta ou cartão. Cartão de crédito exige dia de fechamento e de vencimento.',
      schema: z.object({ name: z.string().min(1).max(80), kind: z.enum(['checking', 'digital', 'savings', 'cash', 'credit_card']), institution: z.string().max(80).optional(), initialBalance: z.number().min(-100_000_000).max(100_000_000).optional(), closingDay: z.number().int().min(1).max(31).optional(), dueDay: z.number().int().min(1).max(31).optional() }),
      prepare: async (a) => ({ args: { name: a.name, kind: a.kind, institution: a.institution, initialBalanceCents: toCents(a.initialBalance ?? 0), closingDay: a.closingDay ?? null, dueDay: a.dueDay ?? null }, summary: [`Conta: ${a.name} (${a.kind})`, `Saldo inicial: ${brl(toCents(a.initialBalance ?? 0))}`, ...(a.kind === 'credit_card' ? [`Fecha dia ${a.closingDay ?? '?'} · vence dia ${a.dueDay ?? '?'}`] : [])] }),
      run: async (args, ctx) => { const acc = await fin.createAccount(ctx.userId, args); return { ok: true, id: acc.id }; } }),
    tool({ name: 'fin_schedule_payment', ...W, action: 'create', label: 'um pagamento na agenda',
      description: 'Prepara a criação de um evento na agenda para pagar uma conta pendente (na data de vencimento).', schema: z.object({ transactionId: idStr }),
      prepare: async (a, ctx) => ({ args: { transactionId: a.transactionId }, summary: ['Colocar na agenda:', ...(await describeTx(ctx.userId, await fin.getTransaction(ctx.userId, a.transactionId)))] }),
      run: async ({ transactionId }, ctx) => { await fin.schedulePayment(ctx.userId, transactionId); return { ok: true }; } }),

    // ---------------------------------------------------------------- ajustes de aviso e de uso (baixo risco: sem confirmação obrigatória)
    tool({ name: 'fin_set_invoice_reminder', resource: 'finance', group: 'finance', action: 'update', label: 'o aviso da fatura',
      description: 'Configura o aviso de vencimento da fatura de um cartão: N dias antes (0 = no dia).',
      schema: z.object({ account: z.string().max(80), daysBefore: z.number().int().min(0).max(30), channels: channels.optional() }),
      run: async (a, ctx) => { const acc = await fin.resolveAccount(ctx.userId, a.account); if (acc.kind !== 'credit_card') throw new ValidationError('Essa conta não é um cartão de crédito.'); await fin.updateAccount(ctx.userId, acc.id, { invoiceRemindDays: a.daysBefore, invoiceRemindChannels: a.channels ?? [] }); return { ok: true, texto: `Aviso ${a.daysBefore} dia(s) antes do vencimento da fatura de ${acc.name}.` }; } }),
    tool({ name: 'fin_set_subscription_usage', resource: 'finance', group: 'finance', action: 'update', label: 'o uso de uma assinatura',
      description: 'Registra o quanto o usuário diz usar uma assinatura (often, sometimes, rarely). Só use com o que o usuário afirmou.',
      schema: z.object({ id: idStr, usage: z.enum(['often', 'sometimes', 'rarely']) }),
      run: async ({ id, usage }, ctx) => { await fin.setUsage(ctx.userId, id, usage); return { ok: true }; } }),
    tool({ name: 'fin_resolve_insight', resource: 'finance', group: 'finance', action: 'update', label: 'um insight',
      description: 'Ignora (dismiss) ou silencia por 30 dias (mute) um insight, quando o usuário pedir.', schema: z.object({ key: z.string().max(200), mode: z.enum(['dismiss', 'mute']) }),
      run: async ({ key, mode }, ctx) => { await fin.setInsightState(ctx.userId, key, mode === 'dismiss' ? 'dismissed' : 'muted'); return { ok: true }; } }),

    // ---------------------------------------------------------------- assistente proativo
    tool({ name: 'list_suggestions', resource: 'assistant', action: 'read', label: 'as sugestões pendentes',
      description: 'Sugestões proativas abertas (cada uma com o motivo e os dados usados). Mencione no máximo UMA por conversa e só se fizer sentido agora.',
      schema: z.object({}),
      run: async (_a, ctx) => (await suggestions.open(ctx.userId)).map((s) => ({ id: s.id, tipo: s.type, gravidade: s.severity, titulo: s.title, motivo: s.reason, dadosUsados: s.data })) }),
    tool({ name: 'resolve_suggestion', resource: 'assistant', action: 'update', label: 'uma sugestão',
      description: 'Registra a resposta do usuário a uma sugestão: accepted (vai fazer), dismissed (não quer) ou snoozed (lembrar depois, em 1 dia por padrão).',
      schema: z.object({ id: idStr, status: z.enum(['accepted', 'dismissed', 'snoozed']), days: z.number().int().min(1).max(30).optional() }),
      run: async ({ id, status, days }, ctx) => { await suggestions.resolve(ctx.userId, id, status, days ?? 1); return { ok: true }; } }),
  ];
}
