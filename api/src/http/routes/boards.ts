import type { FastifyInstance, FastifyRequest } from 'fastify';
import { cardCreateSchema, cardMoveSchema, cardUpdateSchema, id, nameSchema } from '../../application/schemas';
import type { Container } from '../../container';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);

/** Kanban: quadros, colunas e cards. */
export function boardRoutes(app: FastifyInstance, c: Container) {
  app.get('/boards', async () => c.boards.listBoards());
  app.post('/boards', async (req, reply) => reply.code(201).send(await c.boards.createBoard(nameSchema.parse(req.body).name)));
  app.get('/boards/:id', async (req) => c.boards.getBoard(pid(req)));
  app.patch('/boards/:id', async (req) => c.boards.renameBoard(pid(req), nameSchema.parse(req.body).name));
  app.delete('/boards/:id', async (req, reply) => { await c.boards.deleteBoard(pid(req)); return reply.code(204).send(); });

  app.post('/boards/:id/columns', async (req, reply) => reply.code(201).send(await c.boards.createColumn(pid(req), nameSchema.parse(req.body).name)));
  app.patch('/columns/:id', async (req) => c.boards.renameColumn(pid(req), nameSchema.parse(req.body).name));
  app.delete('/columns/:id', async (req, reply) => { await c.boards.deleteColumn(pid(req)); return reply.code(204).send(); });

  app.post('/columns/:id/cards', async (req, reply) => reply.code(201).send(await c.boards.createCard(pid(req), cardCreateSchema.parse(req.body))));
  app.patch('/cards/:id', async (req) => c.boards.updateCard(pid(req), cardUpdateSchema.parse(req.body)));
  app.post('/cards/:id/move', async (req) => {
    const b = cardMoveSchema.parse(req.body);
    return c.boards.moveCard(pid(req), b.columnId, b.position);
  });
  app.delete('/cards/:id', async (req, reply) => { await c.boards.deleteCard(pid(req)); return reply.code(204).send(); });
}
