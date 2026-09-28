import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { id, passwordSchema, profileCreateSchema, profileUpdateSchema } from '../../application/schemas';
import type { Container } from '../../container';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);

/** Perfil (geral / privado / secreto) e cofre com senha. */
export function profileRoutes(app: FastifyInstance, c: Container) {
  app.get('/profile', async () => c.profile.list());
  app.post('/profile', async (req, reply) => reply.code(201).send(await c.profile.create(profileCreateSchema.parse(req.body))));
  app.patch('/profile/:id', async (req) => c.profile.update(pid(req), profileUpdateSchema.parse(req.body)));
  app.delete('/profile/:id', async (req, reply) => { await c.profile.remove(pid(req)); return reply.code(204).send(); });

  app.get('/vault/status', async () => c.vault.status());
  app.post('/vault/setup', async (req) => { await c.vault.setup(passwordSchema.parse(req.body).password); return c.vault.status(); });
  app.post('/vault/unlock', async (req) => { await c.vault.unlock(passwordSchema.parse(req.body).password); return c.vault.status(); });
  app.post('/vault/lock', async () => { c.vault.lock(); return c.vault.status(); });
  app.post('/vault/change', async (req) => {
    const b = z.object({ current: z.string().min(1), next: z.string().min(1) }).parse(req.body);
    await c.vault.change(b.current, b.next);
    return c.vault.status();
  });
  app.post('/vault/reset', async (req) => {
    z.object({ confirm: z.literal(true) }).parse(req.body);
    await c.vault.reset();
    return c.vault.status();
  });
}
