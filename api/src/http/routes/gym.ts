import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  exerciseCreateSchema, exerciseUpdateSchema, sessionFinishSchema, sessionStartSchema, setCreateSchema, setUpdateSchema, workoutCreateSchema, workoutUpdateSchema,
} from '../../application/gym/schemas';
import { id } from '../../application/schemas';
import type { Container } from '../../container';
import { MUSCLES } from '../../domain/gym';
import { ValidationError } from '../../domain/errors';
import { fileDelivery } from '../fileDelivery';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);

/** Academia: exercícios, treinos, sessões de treino (modo treino), séries, recordes e relatórios. */
export function gymRoutes(app: FastifyInstance, c: Container) {
  const g = c.gym;

  // Exercícios
  app.get('/gym/exercises', async (req) => {
    const q = z.object({ q: z.string().max(100).optional(), muscle: z.enum(MUSCLES).optional() }).parse(req.query);
    return g.listExercises(q);
  });
  app.post('/gym/exercises', async (req, reply) => reply.code(201).send(await g.createExercise(exerciseCreateSchema.parse(req.body))));
  app.get('/gym/exercises/:id', async (req) => g.getExercise(pid(req)));
  app.patch('/gym/exercises/:id', async (req) => g.updateExercise(pid(req), exerciseUpdateSchema.parse(req.body)));
  app.delete('/gym/exercises/:id', async (req) => ({ result: await g.removeExercise(pid(req)) }));
  app.get('/gym/exercises/:id/stats', async (req) => g.exerciseStats(pid(req)));

  // Foto de referência do exercício (PNG/JPEG/WebP, até 5 MB)
  app.post('/gym/exercises/:id/image', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
    if (!file) throw new ValidationError('Envie a imagem no campo "file".');
    await g.setImage(pid(req), await file.toBuffer(), file.mimetype);
    return reply.code(204).send();
  });
  app.get('/gym/exercises/:id/image', async (req, reply) => {
    const info = await g.imageInfo(pid(req));
    const d = fileDelivery(info.mime, 'exercicio');
    reply.header('content-type', d.contentType).header('content-security-policy', d.csp).header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=300');
    return reply.send(createReadStream(info.path));
  });
  app.delete('/gym/exercises/:id/image', async (req, reply) => { await g.removeImage(pid(req)); return reply.code(204).send(); });

  // Treinos montados
  app.get('/gym/workouts', async () => g.listWorkouts());
  app.post('/gym/workouts', async (req, reply) => reply.code(201).send(await g.createWorkout(workoutCreateSchema.parse(req.body))));
  app.get('/gym/workouts/:id', async (req) => g.getWorkout(pid(req)));
  app.patch('/gym/workouts/:id', async (req) => g.updateWorkout(pid(req), workoutUpdateSchema.parse(req.body)));
  app.delete('/gym/workouts/:id', async (req, reply) => { await g.removeWorkout(pid(req)); return reply.code(204).send(); });

  // Modo treino
  app.get('/gym/sessions/active', async () => (await g.active()) ?? null);
  app.post('/gym/sessions', async (req, reply) => reply.code(201).send(await g.start(sessionStartSchema.parse(req.body ?? {}))));
  app.get('/gym/sessions', async (req) => {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), offset: z.coerce.number().int().min(0).default(0) }).parse(req.query);
    return g.listSessions(q.limit, q.offset);
  });
  app.get('/gym/sessions/:id', async (req) => g.session(pid(req)));
  app.delete('/gym/sessions/:id', async (req, reply) => { await g.removeSession(pid(req)); return reply.code(204).send(); });
  app.post('/gym/sessions/:id/sets', async (req, reply) => reply.code(201).send(await g.addSet(pid(req), setCreateSchema.parse(req.body))));
  app.post('/gym/sessions/:id/finish', async (req) => g.finish(pid(req), sessionFinishSchema.parse(req.body ?? {})));
  app.patch('/gym/sets/:id', async (req) => g.updateSet(pid(req), setUpdateSchema.parse(req.body)));
  app.delete('/gym/sets/:id', async (req, reply) => { await g.deleteSet(pid(req)); return reply.code(204).send(); });

  // Relatórios
  app.get('/gym/overview', async () => g.overview());
  app.get('/gym/records', async () => g.records());
}
