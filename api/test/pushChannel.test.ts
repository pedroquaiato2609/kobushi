import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PushChannel } from '../src/infrastructure/notify/pushChannel';
import type { ExpoPushTokenRepository, PushSubscriptionRepository } from '../src/application/ports';

function fakeExpoRepo(tokens: string[]): ExpoPushTokenRepository & { removed: string[] } {
  const removed: string[] = [];
  return {
    removed,
    upsert: async () => {},
    remove: async (t: string) => { removed.push(t); },
    list: async () => tokens.filter((t) => !removed.includes(t)),
  };
}
const noWebPush: PushSubscriptionRepository = { upsert: async () => {}, remove: async () => {}, list: async () => [] };

test('PushChannel.available: true com token Expo mesmo sem VAPID configurado (Web Push)', async () => {
  const channel = new PushChannel(noWebPush, fakeExpoRepo(['ExponentPushToken[abc]']));
  assert.equal(channel.webPushConfigured(), false); // sem VAPID nas env vars de teste
  assert.equal(await channel.available(), true);
});

test('PushChannel.available: false sem nenhum token e sem Web Push', async () => {
  const channel = new PushChannel(noWebPush, fakeExpoRepo([]));
  assert.equal(await channel.available(), false);
});

test('PushChannel.send: manda pro endpoint do Expo com o formato certo', async () => {
  const calls: { url: string; body: any }[] = [];
  const realFetch = global.fetch;
  global.fetch = (async (url: string, init: any) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { json: async () => ({ data: [{ status: 'ok' }] }) } as any;
  }) as any;
  try {
    const expo = fakeExpoRepo(['ExponentPushToken[abc]', 'ExponentPushToken[def]']);
    const channel = new PushChannel(noWebPush, expo);
    await channel.send({ title: 'Oi', body: 'Mensagem', link: '/agenda' });
  } finally {
    global.fetch = realFetch;
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://exp.host/--/api/v2/push/send');
  assert.deepEqual(calls[0].body, [
    { to: 'ExponentPushToken[abc]', title: 'Oi', body: 'Mensagem', data: { url: '/agenda' } },
    { to: 'ExponentPushToken[def]', title: 'Oi', body: 'Mensagem', data: { url: '/agenda' } },
  ]);
});

test('PushChannel.send: token morto (DeviceNotRegistered) é removido, sem derrubar os outros', async () => {
  const realFetch = global.fetch;
  global.fetch = (async () => ({
    json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }, { status: 'ok' }] }),
  })) as any;
  try {
    const expo = fakeExpoRepo(['ExponentPushToken[morto]', 'ExponentPushToken[vivo]']);
    const channel = new PushChannel(noWebPush, expo);
    await channel.send({ title: 'Oi', body: 'Mensagem' });
    assert.deepEqual(expo.removed, ['ExponentPushToken[morto]']);
    assert.deepEqual(await expo.list(), ['ExponentPushToken[vivo]']);
  } finally {
    global.fetch = realFetch;
  }
});

test('PushChannel.send: manda em lotes de até 100 tokens', async () => {
  const calls: any[] = [];
  const realFetch = global.fetch;
  global.fetch = (async (_url: string, init: any) => { calls.push(JSON.parse(init.body)); return { json: async () => ({ data: [] }) } as any; }) as any;
  try {
    const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`);
    const channel = new PushChannel(noWebPush, fakeExpoRepo(tokens));
    await channel.send({ title: 'Oi', body: 'Mensagem' });
  } finally {
    global.fetch = realFetch;
  }
  assert.equal(calls.length, 2);
  assert.equal(calls[0].length, 100);
  assert.equal(calls[1].length, 50);
});
