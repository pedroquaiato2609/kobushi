import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { bookCreateSchema, bookSearchSchema, bookUpdateSchema, isbnLookupSchema, sessionCreateSchema } from '../../application/reading/schemas';
import { id } from '../../application/schemas';
import type { Container } from '../../container';
import { ValidationError } from '../../domain/errors';
import { fileDelivery } from '../fileDelivery';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);
const STATUSES = ['quero_ler', 'lendo', 'pausado', 'lido', 'abandonado'] as const;

/** Leitura: estante de livros (com capa/metadados por ISBN ou busca por título, ou uma foto enviada), progresso de páginas e sessões de leitura. */
export function readingRoutes(app: FastifyInstance, c: Container) {
  const r = c.reading;

  app.get('/reading/books', async (req) => {
    const q = z.object({ status: z.enum(STATUSES).optional() }).parse(req.query);
    return r.listBooks(q);
  });
  app.get('/reading/isbn/:isbn', async (req) => r.lookupIsbn(isbnLookupSchema.parse({ isbn: (req.params as { isbn: string }).isbn }).isbn));
  app.get('/reading/search', async (req) => r.searchBooks(bookSearchSchema.parse(req.query).q));
  app.post('/reading/books', async (req, reply) => reply.code(201).send(await r.createBook(bookCreateSchema.parse(req.body))));
  app.get('/reading/books/:id', async (req) => r.bookOverview(pid(req)));
  app.patch('/reading/books/:id', async (req) => r.updateBook(pid(req), bookUpdateSchema.parse(req.body)));
  app.delete('/reading/books/:id', async (req, reply) => { await r.removeBook(pid(req)); return reply.code(204).send(); });

  // Capa enviada pelo usuário: foto tirada na hora ou upload de uma imagem (PNG/JPEG/WebP, até 5 MB).
  app.post('/reading/books/:id/cover-image', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
    if (!file) throw new ValidationError('Envie a imagem no campo "file".');
    await r.setCoverImage(pid(req), await file.toBuffer(), file.mimetype);
    return reply.code(204).send();
  });
  app.get('/reading/books/:id/cover-image', async (req, reply) => {
    const info = await r.coverImageInfo(pid(req));
    const d = fileDelivery(info.mime, 'capa');
    reply.header('content-type', d.contentType).header('content-security-policy', d.csp).header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=300');
    return reply.send(createReadStream(info.path));
  });
  app.delete('/reading/books/:id/cover-image', async (req, reply) => { await r.removeCoverImage(pid(req)); return reply.code(204).send(); });

  app.get('/reading/books/:id/sessions', async (req) => r.listSessions(pid(req)));
  app.post('/reading/books/:id/sessions', async (req, reply) => reply.code(201).send(await r.logSession(pid(req), sessionCreateSchema.parse(req.body))));
  app.delete('/reading/sessions/:id', async (req, reply) => { await r.removeSession(pid(req)); return reply.code(204).send(); });

  app.get('/reading/overview', async () => r.overview());
}
