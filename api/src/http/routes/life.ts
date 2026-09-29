import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { commuteCreateSchema, commuteUpdateSchema, dateRangeSchema, id, reminderCreateSchema, reminderUpdateSchema } from '../../application/schemas';
import type { Container } from '../../container';
import { features } from '../../config';
import { AppError } from '../../domain/errors';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);

/** Execuções por período, visão geral das atividades, lembretes, caixa de entrada e canais de notificação. */
export function lifeRoutes(app: FastifyInstance, c: Container) {
  app.get('/executions', async (req) => {
    const q = dateRangeSchema.parse(req.query);
    return c.executions.list(q.from, q.to);
  });
  app.get('/activities/overview', async (req) => {
    const q = z.object({ days: z.coerce.number().int().min(1).max(366).optional() }).parse(req.query);
    return c.stats.activityMatrix(q.days ?? 28);
  });

  // Lembretes avulsos
  app.get('/reminders', async () => c.reminders.list());
  app.post('/reminders', async (req, reply) => reply.code(201).send(await c.reminders.create(reminderCreateSchema.parse(req.body))));
  app.patch('/reminders/:id', async (req) => c.reminders.update(pid(req), reminderUpdateSchema.parse(req.body)));
  app.delete('/reminders/:id', async (req, reply) => { await c.reminders.remove(pid(req)); return reply.code(204).send(); });

  // Deslocamentos
  app.get('/commutes', async () => c.commutes.list());
  app.post('/commutes', async (req, reply) => reply.code(201).send(await c.commutes.create(commuteCreateSchema.parse(req.body))));
  app.patch('/commutes/:id', async (req) => c.commutes.update(pid(req), commuteUpdateSchema.parse(req.body)));
  app.delete('/commutes/:id', async (req, reply) => { await c.commutes.remove(pid(req)); return reply.code(204).send(); });

  // Caixa de entrada
  app.get('/notifications', async (req) => {
    const q = z.object({ unread: z.coerce.boolean().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }).parse(req.query);
    const [items, unread] = await Promise.all([c.inbox.list({ unreadOnly: q.unread, limit: q.limit ?? 30 }), c.inbox.unreadCount()]);
    return { items, unread };
  });
  app.post('/notifications/read-all', async (_req, reply) => { await c.inbox.markAllRead(); return reply.code(204).send(); });
  app.post('/notifications/:id/read', async (req, reply) => { await c.inbox.markRead(pid(req)); return reply.code(204).send(); });
  app.post('/notifications/test', async (req) => {
    const { channel } = z.object({ channel: z.enum(['app', 'push', 'whatsapp']) }).parse(req.body);
    const message = { title: 'Teste do Ninshiki', body: 'Se você recebeu isto, este canal está funcionando.', link: '/' };
    try {
      if (channel === 'app') await c.notifier.notify({ ...message, source: 'test', channels: [] });
      else await c.notifier.sendTo(channel, message);
    } catch (e) {
      throw new AppError((e as Error).message, 400);
    }
    return { ok: true };
  });

  // Celular (Web Push) e WhatsApp
  app.get('/push/key', async () => ({ publicKey: c.channels.push.configured() ? features.vapidPublicKey : null }));
  app.post('/push/subscribe', async (req, reply) => {
    const b = z.object({ endpoint: z.string().url(), keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }) }).parse(req.body);
    await c.pushSubscriptions.upsert({ endpoint: b.endpoint, p256dh: b.keys.p256dh, auth: b.keys.auth });
    return reply.code(204).send();
  });
  app.post('/push/unsubscribe', async (req, reply) => {
    await c.pushSubscriptions.remove(z.object({ endpoint: z.string() }).parse(req.body).endpoint);
    return reply.code(204).send();
  });

  const settingsView = async () => ({
    whatsappTo: (await c.notificationSettings.get()).whatsappTo,
    push: { configured: c.channels.push.configured(), devices: (await c.pushSubscriptions.list()).length },
    whatsapp: { configured: c.channels.whatsapp.configured() },
  });
  app.get('/notification-settings', settingsView);
  app.put('/notification-settings', async (req) => {
    const b = z.object({ whatsappTo: z.string().max(30) }).parse(req.body);
    await c.notificationSettings.update(b);
    return settingsView();
  });
}
