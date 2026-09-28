import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../config';
import { id } from '../../application/schemas';
import { defaultMode } from '../../agent/policy';
import { providerStatus } from '../../agent/providers';
import { authOf } from '../auth';
import { permissionsUpdateSchema, sendMessageSchema, settingsUpdateSchema } from '../../agent/schemas';
import type { Container } from '../../container';
import { AppError, NotFoundError, ValidationError } from '../../domain/errors';

const pid = (req: FastifyRequest) => id.parse((req.params as { id: string }).id);

/** Chat, configuração do agente, permissões, aprovação de ações e ditado por voz. */
export function agentRoutes(app: FastifyInstance, c: Container) {
  const { conversationRepo, settingsRepo, permissionRepo, actionRepo, orchestrator, policy, tools } = c.agent;

  // Conversas ---------------------------------------------------------------
  app.get('/conversations', async () => conversationRepo.list());
  app.post('/conversations', async (_req, reply) => reply.code(201).send(await conversationRepo.create()));
  app.delete('/conversations/:id', async (req, reply) => {
    if (!(await conversationRepo.delete(pid(req)))) throw new NotFoundError('Conversa');
    return reply.code(204).send();
  });
  app.get('/conversations/:id/messages', async (req) => conversationRepo.listMessages(pid(req)));
  app.post('/conversations/:id/messages', async (req) => {
    const { content } = sendMessageSchema.parse(req.body);
    return { messages: await orchestrator.handleUserMessage(pid(req), content, undefined, { userId: authOf(req).user.id }) };
  });

  // Mesmo turno, mas com o texto chegando aos poucos (Server-Sent Events). O turno termina no servidor
  // mesmo que o navegador feche a conexão, então o histórico nunca fica pela metade.
  app.post('/conversations/:id/stream', async (req, reply) => {
    const { content } = sendMessageSchema.parse(req.body);
    const conversationId = pid(req);
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive', 'x-accel-buffering': 'no',
    });
    const send = (event: unknown) => { if (!raw.destroyed) raw.write(`data: ${JSON.stringify(event)}\n\n`); };
    try {
      const messages = await orchestrator.handleUserMessage(conversationId, content, send, { userId: authOf(req).user.id });
      send({ type: 'done', messages });
    } catch (e) {
      if (!(e instanceof AppError)) req.log.error(e);
      send({ type: 'error', message: e instanceof AppError ? e.message : 'Erro interno do servidor.' });
    } finally {
      raw.end();
    }
  });

  // Configuração ---------------------------------------------------------------
  app.get('/agent/status', async () => ({ providers: providerStatus(), timezone: config.timezone }));
  app.get('/agent/settings', async () => settingsRepo.get());
  app.put('/agent/settings', async (req) => settingsRepo.update(settingsUpdateSchema.parse(req.body)));

  app.get('/agent/permissions', async () => {
    const modes = await policy.modes(tools);
    return tools.filter((t) => !t.internal).map((t) => ({
      tool: t.name, resource: t.resource, action: t.action, label: t.label, description: t.description,
      mode: modes[t.name], defaultMode: defaultMode(t), locked: t.requiresConfirmation === true,
    }));
  });
  app.put('/agent/permissions', async (req) => {
    const { entries } = permissionsUpdateSchema.parse(req.body);
    const known = new Set(tools.map((t) => t.name));
    const unknown = entries.find((e) => !known.has(e.tool)); // (ferramentas internas também são aceitas, mas ignoradas)
    if (unknown) throw new ValidationError(`Ferramenta desconhecida: ${unknown.tool}`);
    await permissionRepo.setMany(entries);
    return { ok: true };
  });

  // Ações do agente (log + aprovação) --------------------------------------------------
  app.get('/agent/actions', async (req) => {
    const q = z.object({
      status: z.enum(['pending', 'executed', 'denied', 'rejected', 'error']).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
    }).parse(req.query);
    return actionRepo.list({ status: q.status, limit: q.limit ?? 50 });
  });
  app.post('/agent/actions/:id/approve', async (req) => {
    const ctx = authOf(req);
    const action = await orchestrator.approve(pid(req), { userId: ctx.user.id });
    await c.audit.record(ctx.user.id, 'agent.action_approved', action.tool, { status: action.status }, req.ip);
    return action;
  });
  app.post('/agent/actions/:id/reject', async (req) => orchestrator.reject(pid(req)));

  // Ditado por voz (modo "servidor") ------------------------------------------------------
  app.post('/voice/transcribe', async (req) => {
    const file = await req.file();
    if (!file) throw new ValidationError('Envie o áudio no campo "audio".');
    const audio = await file.toBuffer();
    if (audio.length === 0) throw new ValidationError('Áudio vazio.');
    const settings = await settingsRepo.get();
    const text = await c.stt.transcribe({ audio, mimeType: file.mimetype, language: settings.language, model: settings.sttModel });
    return { text };
  });
}
