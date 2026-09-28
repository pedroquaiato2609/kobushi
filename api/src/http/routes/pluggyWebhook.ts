import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { supportedEvent, webhookSchema, type PluggyEvent } from '../../application/openFinance/webhook';

export function pluggyWebhookRoutes(app: FastifyInstance, secret: string | undefined, queue: { receive(event: PluggyEvent): Promise<void> }) {
  app.post('/webhooks/pluggy', { bodyLimit: 1024 * 1024, onRequest: async (req, reply) => {
    const received = req.headers['x-webhook-secret'];
    if (!secret) return reply.code(503).send({ error: 'Webhook não configurado.' });
    if (typeof received !== 'string' || Buffer.byteLength(received) !== Buffer.byteLength(secret)
      || !timingSafeEqual(Buffer.from(received), Buffer.from(secret))) return reply.code(401).send({ error: 'Não autorizado.' });
  } }, async (req, reply) => {
    const parsed = webhookSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Evento inválido.' });
    if (!supportedEvent(parsed.data.event)) return reply.code(200).send({ received: true, ignored: true });
    if (!parsed.data.itemId) return reply.code(400).send({ error: 'itemId obrigatório.' });
    await queue.receive(parsed.data);
    return reply.code(202).send({ received: true });
  });
}
