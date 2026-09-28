import type { FastifyInstance, FastifyRequest } from 'fastify';
import { id, principleCreateSchema, principleFolderSchema, principleReminderSchema, principleUpdateSchema } from '../../application/schemas';
import type { Container } from '../../container';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);

/**
 * Princípios: frases pessoais protegidas pela mesma senha do Cofre (Configurações > Perfil).
 * Sem ferramenta de agente nenhuma — só o próprio usuário lê/escreve aqui.
 */
export function principlesRoutes(app: FastifyInstance, c: Container) {
  app.get('/principles/folders', async () => c.principles.listFolders());
  app.post('/principles/folders', async (req, reply) => reply.code(201).send(await c.principles.createFolder(principleFolderSchema.parse(req.body).name)));
  app.patch('/principles/folders/:id', async (req) => c.principles.renameFolder(pid(req), principleFolderSchema.parse(req.body).name));
  app.delete('/principles/folders/:id', async (req, reply) => { await c.principles.removeFolder(pid(req)); return reply.code(204).send(); });
  app.put('/principles/folders/:id/reminder', async (req) => c.principles.updateFolderReminder(pid(req), principleReminderSchema.parse(req.body)));

  app.get('/principles', async () => c.principles.list());
  app.post('/principles', async (req, reply) => {
    const b = principleCreateSchema.parse(req.body);
    return reply.code(201).send(await c.principles.create({ title: b.title, content: b.content, folderId: b.folderId ?? null }));
  });
  app.get('/principles/:id', async (req) => c.principles.get(pid(req)));
  app.patch('/principles/:id', async (req) => c.principles.update(pid(req), principleUpdateSchema.parse(req.body)));
  app.delete('/principles/:id', async (req, reply) => { await c.principles.remove(pid(req)); return reply.code(204).send(); });
}
