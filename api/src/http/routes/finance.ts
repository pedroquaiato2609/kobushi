import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { NOTIFY_CHANNELS } from '../../domain/constants';
import type { Container } from '../../container';
import { dateStr } from '../../application/schemas';
import { authOf } from '../auth';

const id = z.string().uuid();
const cents = z.number().int().min(0).max(100_000_000_000);
const month = z.string().regex(/^\d{4}-\d{2}$/);
const channels = z.array(z.enum(NOTIFY_CHANNELS));
const nullableId = id.nullable().optional();

const account = z.object({
  name: z.string().min(1).max(80), kind: z.enum(['checking', 'digital', 'savings', 'cash', 'credit_card']), institution: z.string().max(80).optional(),
  number: z.string().max(40).nullable().optional(), initialBalanceCents: z.number().int().min(-100_000_000_000).max(100_000_000_000).optional(),
  creditLimitCents: cents.nullable().optional(), closingDay: z.number().int().min(1).max(31).nullable().optional(), dueDay: z.number().int().min(1).max(31).nullable().optional(),
  invoiceRemindDays: z.number().int().min(0).max(30).nullable().optional(), invoiceRemindChannels: channels.optional(),
});
const tx = z.object({
  accountId: id, kind: z.enum(['income', 'expense', 'transfer']), amountCents: cents.refine((n) => n > 0, 'O valor precisa ser maior que zero.'), occurredOn: dateStr,
  description: z.string().max(200).optional(), merchant: z.string().max(120).optional(), categoryId: nullableId, status: z.enum(['pending', 'confirmed']).optional(),
  transferAccountId: nullableId, note: z.string().max(500).optional(), linkActivityId: nullableId, linkCardId: nullableId,
  remindDaysBefore: z.number().int().min(0).max(30).nullable().optional(), remindChannels: channels.optional(),
});
const goal = z.object({ name: z.string().min(1).max(120), targetCents: cents.refine((n) => n > 0), currentCents: cents.optional(), deadline: dateStr.nullable().optional(), linkedAccountId: nullableId });
const recurring = z.object({
  description: z.string().min(1).max(120), amountCents: cents.refine((n) => n > 0), kind: z.enum(['expense', 'income']), categoryId: nullableId, accountId: nullableId,
  frequency: z.enum(['weekly', 'monthly', 'yearly']), nextDue: dateStr, active: z.boolean().optional(), isSubscription: z.boolean().optional(),
  usage: z.enum(['often', 'sometimes', 'rarely']).nullable().optional(), remindDaysBefore: z.number().int().min(0).max(30).nullable().optional(), remindChannels: channels.optional(),
});

export function financeRoutes(app: FastifyInstance, c: Container) {
  const f = c.finance;
  const uid = (req: any) => authOf(req).user.id;
  const pid = (req: any) => id.parse(req.params.id);

  app.get('/finance/overview', async (req) => f.overview(uid(req), z.object({ month: month.optional() }).parse(req.query).month));
  app.get('/finance/refs', async (req) => f.refs(uid(req)));
  app.get('/finance/insights', async (req) => f.insights(uid(req)));
  app.post('/finance/insights/state', async (req, reply) => {
    const b = z.object({ key: z.string().max(200), state: z.enum(['dismissed', 'muted']), days: z.number().int().min(1).max(365).optional() }).parse(req.body);
    await f.setInsightState(uid(req), b.key, b.state, b.days ?? 30);
    return reply.code(204).send();
  });

  // contas e cartões
  app.post('/finance/accounts', async (req, reply) => reply.code(201).send(await f.createAccount(uid(req), account.parse(req.body))));
  app.patch('/finance/accounts/:id', async (req) => f.updateAccount(uid(req), pid(req), account.partial().extend({ archived: z.boolean().optional() }).parse(req.body)));
  app.delete('/finance/accounts/:id', async (req, reply) => {
    c.auth.requireReauth(authOf(req)); // apaga também as movimentações da conta: pede a senha
    await f.deleteAccount(uid(req), pid(req));
    return reply.code(204).send();
  });
  app.post('/finance/accounts/:id/pay-invoice', async (req, reply) => {
    const b = z.object({ fromAccountId: id, amountCents: cents.refine((n) => n > 0), date: dateStr }).parse(req.body);
    return reply.code(201).send(await f.payInvoice(uid(req), pid(req), b.fromAccountId, b.amountCents, b.date));
  });

  // categorias
  app.post('/finance/categories', async (req, reply) => reply.code(201).send(await f.createCategory(uid(req), z.object({ name: z.string().min(1).max(60), kind: z.enum(['expense', 'income']), parentId: nullableId, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() }).parse(req.body))));
  app.delete('/finance/categories/:id', async (req, reply) => { await f.deleteCategory(uid(req), pid(req)); return reply.code(204).send(); });

  // movimentações
  app.get('/finance/transactions', async (req) => {
    const q = z.object({ month: month.optional(), from: dateStr.optional(), to: dateStr.optional(), accountId: id.optional(), categoryId: id.optional(), kind: z.enum(['income', 'expense', 'transfer']).optional(), status: z.enum(['pending', 'confirmed']).optional(), q: z.string().max(100).optional(), limit: z.coerce.number().int().min(1).max(1000).optional() }).parse(req.query);
    return f.listTransactions(uid(req), { month: q.month, from: q.from, to: q.to, accountId: q.accountId, categoryId: q.categoryId, kind: q.kind, status: q.status, query: q.q, limit: q.limit });
  });
  app.post('/finance/transactions', async (req, reply) => reply.code(201).send(await f.createTransaction(uid(req), tx.parse(req.body))));
  app.patch('/finance/transactions/:id', async (req) => f.updateTransaction(uid(req), pid(req), tx.partial().parse(req.body)));
  app.delete('/finance/transactions/:id', async (req, reply) => { await f.deleteTransaction(uid(req), pid(req)); return reply.code(204).send(); });
  app.post('/finance/transactions/:id/agenda', async (req, reply) => reply.code(201).send(await f.schedulePayment(uid(req), pid(req))));

  // orçamentos
  app.put('/finance/budgets', async (req) => {
    const b = z.object({ categoryId: id.nullable().optional(), limitCents: cents }).parse(req.body);
    return f.setBudget(uid(req), b.categoryId ?? null, b.limitCents);
  });
  app.delete('/finance/budgets/:id', async (req, reply) => { await f.deleteBudget(uid(req), pid(req)); return reply.code(204).send(); });

  // metas
  app.post('/finance/goals', async (req, reply) => reply.code(201).send(await f.createGoal(uid(req), goal.parse(req.body))));
  app.patch('/finance/goals/:id', async (req) => f.updateGoal(uid(req), pid(req), goal.partial().parse(req.body)));
  app.post('/finance/goals/:id/contribute', async (req) => f.contributeToGoal(uid(req), pid(req), z.object({ amountCents: z.number().int().min(-100_000_000_000).max(100_000_000_000) }).parse(req.body).amountCents));
  app.post('/finance/goals/:id/kanban', async (req, reply) => reply.code(201).send(await f.goalToKanban(uid(req), pid(req))));
  app.delete('/finance/goals/:id', async (req, reply) => { await f.deleteGoal(uid(req), pid(req)); return reply.code(204).send(); });

  // recorrências e assinaturas
  app.get('/finance/recurring', async (req) => f.listRecurring(uid(req)));
  app.post('/finance/recurring', async (req, reply) => reply.code(201).send(await f.createRecurring(uid(req), recurring.parse(req.body) as never)));
  app.patch('/finance/recurring/:id', async (req) => f.updateRecurring(uid(req), pid(req), recurring.partial().parse(req.body) as never));
  app.delete('/finance/recurring/:id', async (req, reply) => { await f.deleteRecurring(uid(req), pid(req)); return reply.code(204).send(); });

  // demonstração (sempre identificada; nunca se mistura silenciosamente com dados reais)
  app.post('/finance/demo', async (req, reply) => { await f.seedDemo(uid(req)); return reply.code(201).send({ ok: true }); });
  app.delete('/finance/demo', async (req, reply) => { await f.purgeDemo(uid(req)); return reply.code(204).send(); });
}
