import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  activityCreateSchema, activityUpdateSchema, dateRangeSchema, dateStr, dateTimeRangeSchema, eventCreateSchema,
  eventUpdateSchema, executionClearSchema, executionSetSchema, id, meditationCreateSchema, reviewSaveSchema,
} from '../../application/schemas';
import { createProvider } from '../../agent/providers';
import type { Container } from '../../container';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);
const pdate = (req: FastifyRequest) => dateStr.parse((req.params as { date: string }).date);

/** Atividades, rotina do dia, agenda, revisão, meditação e estatísticas. */
export function coreRoutes(app: FastifyInstance, c: Container) {
  // Atividades
  app.get('/activities', async () => c.activities.list());
  app.post('/activities', async (req, reply) => reply.code(201).send(await c.activities.create(activityCreateSchema.parse(req.body))));
  app.patch('/activities/:id', async (req) => c.activities.update(pid(req), activityUpdateSchema.parse(req.body)));
  // Pede à IA o melhor horário de início dentro da janela do objetivo (período + "depois das"/"antes das").
  app.post('/activities/:id/suggest-time', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const settings = await c.agent.settingsRepo.get();
    const ask = async (system: string, user: string) => (await createProvider(settings.provider).chat({ model: settings.model, tools: [], maxTokens: 300, system, messages: [{ role: 'user', content: user }] })).text;
    return c.scheduling.suggest(pid(req), ask);
  });
  app.delete('/activities/:id', async (req, reply) => { await c.activities.remove(pid(req)); return reply.code(204).send(); });

  // Rotina do dia e execuções (mínimo / ideal / máximo)
  app.get('/day', async (req) => c.executions.dayPlan(z.object({ date: dateStr }).parse(req.query).date));
  app.put('/executions', async (req) => {
    const b = executionSetSchema.parse(req.body);
    return c.executions.set(b.activityId, b.date, b.level, b.note);
  });
  app.delete('/executions', async (req, reply) => {
    const q = executionClearSchema.parse(req.query);
    await c.executions.clear(q.activityId, q.date);
    return reply.code(204).send();
  });

  // Agenda (from/to em hora local: YYYY-MM-DDTHH:mm)
  app.get('/events', async (req) => {
    const q = dateTimeRangeSchema.parse(req.query);
    return c.events.list(q.from, q.to);
  });
  app.post('/events', async (req, reply) => reply.code(201).send(await c.events.create(eventCreateSchema.parse(req.body))));
  app.patch('/events/:id', async (req) => c.events.update(pid(req), eventUpdateSchema.parse(req.body)));
  app.delete('/events/:id', async (req, reply) => { await c.events.remove(pid(req)); return reply.code(204).send(); });

  // Revisão diária
  app.get('/reviews', async (req) => {
    const q = dateRangeSchema.parse(req.query);
    return c.reviews.list(q.from, q.to);
  });
  app.get('/reviews/:date', async (req) => {
    const date = pdate(req);
    return { date, review: await c.reviews.get(date) };
  });
  app.put('/reviews/:date', async (req) => c.reviews.save(pdate(req), reviewSaveSchema.parse(req.body)));

  // Meditação
  app.get('/meditations', async (req) => {
    const q = dateRangeSchema.parse(req.query);
    return c.meditation.list(q.from, q.to);
  });
  app.post('/meditations', async (req, reply) => reply.code(201).send(await c.meditation.log(meditationCreateSchema.parse(req.body))));
  app.delete('/meditations/:id', async (req, reply) => { await c.meditation.remove(pid(req)); return reply.code(204).send(); });

  // Dashboard
  app.get('/stats', async (req) => {
    const q = dateRangeSchema.parse(req.query);
    return c.stats.range(q.from, q.to);
  });
}
