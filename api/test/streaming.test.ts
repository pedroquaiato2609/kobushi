import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AnthropicProvider } from '../src/agent/providers/anthropic';
import { OpenAiProvider } from '../src/agent/providers/openai';
import { readSse } from '../src/agent/providers/sse';
import { anthropicStream, frame, sseResponse } from './helpers';

const req = { model: 'm', system: 's', messages: [{ role: 'user' as const, content: 'oi' }], tools: [] };

test('readSse remonta eventos cortados em pedaços arbitrários', async () => {
  const res = sseResponse([frame({ a: 1 }, 'x'), frame({ b: 'ã ç 你好' }), frame('[DONE]')], 5);
  const got: { event: string; data: string }[] = [];
  for await (const e of readSse(res)) got.push(e);
  assert.deepEqual(got.map((g) => g.event), ['x', 'message', 'message']);
  assert.equal(JSON.parse(got[1].data).b, 'ã ç 你好'); // UTF-8 multibyte atravessando o corte
  assert.equal(got[2].data, '[DONE]');
});

test('Anthropic stream: texto em pedaços + tool_use com JSON fragmentado', async () => {
  (globalThis as any).fetch = async () => anthropicStream([
    { type: 'text', text: 'Olá, tudo bem?' },
    { type: 'tool_use', id: 'tu1', name: 'create_event', input: { title: 'Dentista', start: '2026-09-21T14:00' } },
  ]);
  const deltas: string[] = [];
  const out = await new AnthropicProvider('k').stream(req, (d) => deltas.push(d));
  assert.ok(deltas.length > 1);
  assert.equal(out.text, 'Olá, tudo bem?');
  assert.deepEqual(out.toolCalls, [{ id: 'tu1', name: 'create_event', args: { title: 'Dentista', start: '2026-09-21T14:00' } }]);
});

test('OpenAI stream: conteúdo e tool_calls acumulados por índice', async () => {
  const chunk = (delta: unknown) => frame({ choices: [{ delta }] });
  (globalThis as any).fetch = async () => sseResponse([
    chunk({ content: 'Feito' }), chunk({ content: '!' }),
    chunk({ tool_calls: [{ index: 0, id: 'c1', function: { name: 'set_execution', arguments: '{"level"' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: ':"min"}' } }] }),
    chunk({ tool_calls: [{ index: 1, id: 'c2', function: { name: 'get_day_plan', arguments: '{}' } }] }),
    frame('[DONE]'),
  ]);
  const deltas: string[] = [];
  const out = await new OpenAiProvider('k').stream(req, (d) => deltas.push(d));
  assert.deepEqual(deltas, ['Feito', '!']);
  assert.equal(out.text, 'Feito!');
  assert.deepEqual(out.toolCalls, [
    { id: 'c1', name: 'set_execution', args: { level: 'min' } },
    { id: 'c2', name: 'get_day_plan', args: {} },
  ]);
});

test('erro HTTP vira ProviderError com a mensagem da API', async () => {
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ error: { message: 'chave inválida' } }), { status: 401 });
  await assert.rejects(new AnthropicProvider('k').stream(req, () => {}), /chave inválida/);
});
