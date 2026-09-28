import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PROACTIVITY, SUGGESTION_TYPES } from '../../domain/constants';
import type { Container } from '../../container';
import { authOf } from '../auth';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const lastRefresh = new Map<string, number>();

export function assistantRoutes(app: FastifyInstance, c: Container) {
  const uid = (req: any) => authOf(req).user.id;

  // Lista as sugestões abertas. Procura sinais novos no máximo a cada 5 minutos por usuário.
  app.get('/assistant/suggestions', async (req) => {
    const user = uid(req);
    if (Date.now() - (lastRefresh.get(user) ?? 0) > 5 * 60_000) {
      lastRefresh.set(user, Date.now());
      await c.suggestions.refresh(user).catch((e) => req.log.error(e));
    }
    return c.suggestions.open(user);
  });
  app.post('/assistant/suggestions/:id/resolve', async (req) => {
    const b = z.object({ status: z.enum(['accepted', 'dismissed', 'snoozed']), days: z.number().int().min(1).max(30).optional() }).parse(req.body);
    return c.suggestions.resolve(uid(req), z.string().uuid().parse((req.params as any).id), b.status, b.days ?? 1);
  });
  app.get('/assistant/settings', async (req) => c.suggestions.settings(uid(req)));
  app.put('/assistant/settings', async (req) => {
    const b = z.object({
      proactivity: z.enum(PROACTIVITY).optional(), types: z.array(z.enum(SUGGESTION_TYPES)).optional(), maxPerDay: z.number().int().min(1).max(10).optional(),
      quietStart: hhmm.optional(), quietEnd: hhmm.optional(), dailyReviewTime: hhmm.nullable().optional(), weeklyReviewTime: hhmm.nullable().optional(),
    }).parse(req.body);
    return c.suggestions.updateSettings(uid(req), b);
  });
}
