import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container';
import { authOf } from '../auth';

const id = z.string().uuid();

export function openFinanceRoutes(app: FastifyInstance, c: Container) {
  const of = c.openFinance;
  const uid = (req: any) => authOf(req).user.id;
  const provider = z.enum(['demo', 'pluggy']).optional();

  app.get('/open-finance', async (req) => of.status(uid(req)));
  app.post('/open-finance/connect', async (req) => of.startConnect(uid(req), provider.parse((req.body as { provider?: string } | undefined)?.provider)));
  // Só registra a conexão com consentimento explícito; a autenticação bancária aconteceu na instituição, não aqui.
  app.post('/open-finance/connections', async (req, reply) => {
    const b = z.object({ itemId: z.string().min(1).max(200), provider, consent: z.literal(true) }).parse(req.body);
    const conn = await of.completeConnect(uid(req), b);
    return reply.code(201).send(conn);
  });
  app.post('/open-finance/connections/:id/sync', async (req) => of.sync(uid(req), id.parse((req.params as any).id)));
  app.post('/open-finance/connections/:id/renew', async (req) => of.renew(uid(req), id.parse((req.params as any).id)));
  app.delete('/open-finance/connections/:id', async (req) => {
    const ctx = authOf(req);
    c.auth.requireReauth(ctx); // revogar e apagar dados importados é uma ação crítica
    const deleteData = z.object({ deleteData: z.coerce.boolean().optional() }).parse(req.query).deleteData ?? false;
    return of.revoke(ctx.user.id, id.parse((req.params as any).id), deleteData);
  });
}
