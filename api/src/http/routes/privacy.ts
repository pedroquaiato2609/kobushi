import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Container } from '../../container';
import { AppError } from '../../domain/errors';
import { authOf, clearSessionCookie } from '../auth';

/** Direitos do titular (LGPD): exportar e apagar os próprios dados. Ambos exigem a senha de novo. */
export function privacyRoutes(app: FastifyInstance, c: Container) {
  app.get('/privacy/export', async (req, reply) => {
    const ctx = authOf(req);
    c.auth.requireReauth(ctx);
    const [finance, legacy, suggestions, assistant, audit] = await Promise.all([
      c.finance.exportAll(ctx.user.id), c.exporter.exportLegacy(), c.suggestionRepo.list(ctx.user.id), c.suggestions.settings(ctx.user.id), c.audit.list(ctx.user.id, 1000),
    ]);
    await c.audit.record(ctx.user.id, 'privacy.export', 'all', {}, req.ip);
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="ninshiki-meus-dados-${new Date().toISOString().slice(0, 10)}.json"`);
    return { exportedAt: new Date().toISOString(), user: ctx.user, note: 'Cofre e informações secretas não são exportados em texto aberto. Anexos ficam na pasta de arquivos do servidor.', finance, ...legacy, suggestions, assistantSettings: assistant, audit };
  });

  app.delete('/privacy/finance', async (req, reply) => {
    const ctx = authOf(req);
    c.auth.requireReauth(ctx);
    if (z.object({ confirm: z.string() }).parse(req.body).confirm !== 'EXCLUIR') throw new AppError('Digite EXCLUIR para confirmar.', 400);
    await c.finance.deleteAll(ctx.user.id);
    return reply.code(204).send();
  });

  app.delete('/privacy/everything', async (req, reply) => {
    const ctx = authOf(req);
    c.auth.requireReauth(ctx);
    if (z.object({ confirm: z.string() }).parse(req.body).confirm !== 'EXCLUIR TUDO') throw new AppError('Digite EXCLUIR TUDO para confirmar.', 400);
    await c.exporter.eraseEverything();
    clearSessionCookie(reply);
    return reply.code(204).send();
  });
}
