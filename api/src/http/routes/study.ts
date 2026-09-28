import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { folderCreateSchema, folderUpdateSchema, noteCreateSchema, noteUpdateSchema, planCreateSchema, planUpdateSchema } from '../../application/study/schemas';
import { id } from '../../application/schemas';
import type { Container } from '../../container';
import { ValidationError } from '../../domain/errors';
import { fileDelivery } from '../fileDelivery';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);
const LINKED_TYPES = ['book', 'workout', 'activity'] as const;

/** Estudos: notas ricas (com imagens embutidas), que podem se atrelar a um livro/treino/atividade, e planos de estudo com aulas marcáveis. */
export function studyRoutes(app: FastifyInstance, c: Container) {
  const s = c.study;

  app.get('/study/folders', async () => s.listFolders());
  app.post('/study/folders', async (req, reply) => reply.code(201).send(await s.createFolder(folderCreateSchema.parse(req.body))));
  app.patch('/study/folders/:id', async (req) => s.renameFolder(pid(req), folderUpdateSchema.parse(req.body)));
  app.delete('/study/folders/:id', async (req, reply) => { await s.removeFolder(pid(req)); return reply.code(204).send(); });

  app.get('/study/tags', async () => s.allTags());

  app.get('/study/notes', async (req) => {
    const q = z.object({
      linkedType: z.enum(LINKED_TYPES).optional(), linkedId: id.optional(), folderId: id.optional(),
      tag: z.string().max(30).optional(), pinned: z.coerce.boolean().optional(), query: z.string().max(200).optional(),
    }).parse(req.query);
    return s.listNotes(q);
  });
  app.post('/study/notes', async (req, reply) => reply.code(201).send(await s.createNote(noteCreateSchema.parse(req.body))));
  app.get('/study/notes/:id', async (req) => s.getNote(pid(req)));
  app.patch('/study/notes/:id', async (req) => s.updateNote(pid(req), noteUpdateSchema.parse(req.body)));
  app.delete('/study/notes/:id', async (req, reply) => { await s.removeNote(pid(req)); return reply.code(204).send(); });

  // Imagem embutida: o editor faz upload ao inserir e recebe a URL pra usar no <img src="...">.
  app.post('/study/images', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 8 * 1024 * 1024, files: 1 } });
    if (!file) throw new ValidationError('Envie a imagem no campo "file".');
    return reply.code(201).send(await s.uploadImage(await file.toBuffer(), file.mimetype));
  });
  app.get('/study/images/:storage', async (req, reply) => {
    const storage = z.string().uuid().parse((req.params as { storage: string }).storage);
    const info = await s.imageInfo(storage);
    const d = fileDelivery(info.mime, 'imagem');
    reply.header('content-type', d.contentType).header('content-security-policy', d.csp).header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=86400');
    return reply.send(createReadStream(info.path));
  });

  app.get('/study/plans', async () => s.listPlans());
  app.post('/study/plans', async (req, reply) => reply.code(201).send(await s.createPlan(planCreateSchema.parse(req.body))));
  app.get('/study/plans/:id', async (req) => s.getPlan(pid(req)));
  app.patch('/study/plans/:id', async (req) => s.updatePlan(pid(req), planUpdateSchema.parse(req.body)));
  app.patch('/study/plans/:id/lessons/:lessonId', async (req) => {
    const { lessonId } = req.params as { lessonId: string };
    const { done } = z.object({ done: z.boolean() }).parse(req.body);
    return s.setLessonDone(pid(req), lessonId, done);
  });
  app.delete('/study/plans/:id', async (req, reply) => { await s.removePlan(pid(req)); return reply.code(204).send(); });
}
