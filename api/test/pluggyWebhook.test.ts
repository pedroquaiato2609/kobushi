import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import { pluggyWebhookRoutes } from '../src/http/routes/pluggyWebhook';

test('webhook: requires secret, validates payload, strips untrusted links, acknowledges after persistence', async () => {
  const app = Fastify();
  const events: unknown[] = [];
  pluggyWebhookRoutes(app, 'test-secret', { receive: async (e) => { events.push(e); } });
  const payload = { event: 'transactions/created', eventId: 'e1', itemId: 'i1', createdTransactionsLink: 'http://localhost/private' };
  const send = (headers = {}, body: unknown = payload) => app.inject({ method: 'POST', url: '/webhooks/pluggy', headers, payload: body as any });
  assert.equal((await send()).statusCode, 401);
  assert.equal((await send({ 'x-webhook-secret': 'wrong' })).statusCode, 401);
  assert.equal(events.length, 0);
  assert.equal((await send({ 'x-webhook-secret': 'test-secret' }, { eventId: 'x' })).statusCode, 400);
  assert.equal((await send({ 'x-webhook-secret': 'test-secret' })).statusCode, 202);
  assert.deepEqual(events, [{ event: 'transactions/created', eventId: 'e1', itemId: 'i1' }]);
  assert.equal((await send({ 'x-webhook-secret': 'test-secret' }, { eventId: 'e2', event: 'payment_intent/completed' })).statusCode, 200);
  assert.equal(events.length, 1);
  await app.close();
});

test('webhook does not acknowledge a failed database write', async () => {
  const app = Fastify();
  pluggyWebhookRoutes(app, 'secret', { receive: async () => { throw new Error('database unavailable'); } });
  const r = await app.inject({ method: 'POST', url: '/webhooks/pluggy', headers: { 'x-webhook-secret': 'secret' }, payload: { eventId: 'e', event: 'item/updated', itemId: 'i' } });
  assert.equal(r.statusCode, 500);
  await app.close();
});
