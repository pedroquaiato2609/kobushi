import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compactSchema } from '../src/agent/jsonSchema';
import { fitHistory } from '../src/agent/history';
import { OpenAiProvider } from '../src/agent/providers/openai';
import { fetchWithRetry, waitSeconds } from '../src/agent/providers/retry';
import type { ChatMessage } from '../src/agent/providers/types';
import { frame, sseResponse } from './helpers';

const req = { model: 'gpt-4o', system: 's', messages: [{ role: 'user' as const, content: 'oi' }], tools: [] };
const tpm = () => new Response(JSON.stringify({ error: { message: 'Rate limit reached for gpt-4o on tokens per min (TPM): Limit 30000, Used 30000, Requested 2562. Please try again in 5.124s.' } }), { status: 429 });

test('lê a espera sugerida pela API (mensagem em s ou ms, ou cabeçalho)', () => {
  assert.equal(waitSeconds(new Response('', { status: 429 }), 'Please try again in 5.124s.'), 5.124);
  assert.equal(waitSeconds(new Response('', { status: 429 }), 'try again in 250ms'), 0.25);
  assert.equal(waitSeconds(new Response('', { status: 429, headers: { 'retry-after': '7' } }), ''), 7);
});

test('429 por tokens/min: espera, avisa e tenta de novo até dar certo (OpenAI, streaming)', async () => {
  let calls = 0;
  (globalThis as any).fetch = async () => (++calls < 3 ? tpm() : sseResponse([frame({ choices: [{ delta: { content: 'Pronto' } }] }), frame('[DONE]')]));
  const waits: number[] = [];
  const started = Date.now();
  // troca o sleep real por um espião via retry direto; aqui usamos maxWait curto simulando com fetchWithRetry
  const res = await fetchWithRetry(() => (globalThis as any).fetch(), { onWait: (s) => waits.push(s), sleep: async () => {}, maxWaitSec: 20 });
  assert.equal(res.ok, true);
  assert.deepEqual(waits, [6, 6]); // 5.124 + 0.5 arredondado para cima
  assert.equal(calls, 3);
  assert.ok(Date.now() - started < 1000);
});

test('não insiste quando a cota acabou nem quando a espera é longa; a mensagem final orienta em português', async () => {
  (globalThis as any).fetch = async () => new Response(JSON.stringify({ error: { message: 'You exceeded your current quota, please check your plan' } }), { status: 429 });
  let calls = 0;
  const quota = await fetchWithRetry(async () => { calls++; return (globalThis as any).fetch(); }, { sleep: async () => {} });
  assert.equal(quota.status, 429); assert.equal(calls, 1);

  (globalThis as any).fetch = async () => new Response(JSON.stringify({ error: { message: 'Rate limit ... tokens per min ... try again in 45s' } }), { status: 429 });
  const provider = new OpenAiProvider('k');
  await assert.rejects(provider.stream(req, () => {}), /limite de tokens por minuto.*Configurações/s);
});

test('fitHistory: mantém o turno atual, descarta turnos antigos inteiros e encurta resultados antigos', () => {
  const big = 'x'.repeat(5000);
  const msgs: ChatMessage[] = [
    { role: 'user', content: 'antigo 1' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 'list_activities', args: {} }] },
    { role: 'tool', toolCallId: 'a', name: 'list_activities', content: big },
    { role: 'assistant', content: 'resp 1' },
    { role: 'user', content: 'antigo 2 ' + big },
    { role: 'assistant', content: 'resp 2 ' + big },
    { role: 'user', content: 'atual' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'b', name: 'get_board', args: {} }] },
    { role: 'tool', toolCallId: 'b', name: 'get_board', content: big },
  ];
  const out = fitHistory(msgs, { budgetChars: 9000, lastToolChars: 6000, oldToolChars: 600 });
  assert.equal(out[0].role, 'user'); // nunca começa no meio de um turno
  assert.ok(out.some((m) => m.role === 'user' && m.content === 'atual'));
  const tool = out.find((m) => m.role === 'tool' && m.toolCallId === 'b');
  assert.equal(tool && tool.content.length, 5000); // turno atual: resultado inteiro (cabe no limite de 6000)
  assert.equal(out.find((m) => m.role === 'user' && m.content === 'antigo 1'), undefined); // turno mais antigo saiu
  // todo tool_result tem o seu tool_use correspondente
  const uses = new Set(out.flatMap((m) => (m.role === 'assistant' ? (m.toolCalls ?? []).map((c) => c.id) : [])));
  for (const m of out) if (m.role === 'tool') assert.ok(uses.has(m.toolCallId));
});

test('fitHistory: um resultado antigo grande é encurtado sem descartar o turno se couber', () => {
  const msgs: ChatMessage[] = [
    { role: 'user', content: 'a' }, { role: 'assistant', content: '', toolCalls: [{ id: 'a', name: 't', args: {} }] },
    { role: 'tool', toolCallId: 'a', name: 't', content: 'y'.repeat(4000) }, { role: 'user', content: 'b' },
  ];
  const out = fitHistory(msgs);
  const tool = out.find((m) => m.role === 'tool')!;
  assert.ok(tool.content.length < 700 && tool.content.endsWith('[resultado encurtado]'));
});

test('compactSchema remove regex e additionalProperties, mantendo o resto', () => {
  const out = compactSchema({ type: 'object', additionalProperties: false, properties: { id: { type: 'string', pattern: '^[0-9a-f-]{36}$', description: 'x' } }, required: ['id'] });
  assert.deepEqual(out, { type: 'object', properties: { id: { type: 'string', description: 'x' } }, required: ['id'] });
});
