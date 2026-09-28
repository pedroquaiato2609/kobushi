import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toAnthropicMessages } from '../src/agent/providers/anthropic';
import { toOpenAiMessages } from '../src/agent/providers/openai';
import type { ChatMessage } from '../src/agent/providers/types';

const convo: ChatMessage[] = [
  { role: 'user', content: 'crie dois eventos' },
  { role: 'assistant', content: 'ok', toolCalls: [{ id: 'a', name: 'create_event', args: { title: 'X' } }, { id: 'b', name: 'create_event', args: { title: 'Y' } }] },
  { role: 'tool', toolCallId: 'a', name: 'create_event', content: '{"id":"1"}' },
  { role: 'tool', toolCallId: 'b', name: 'create_event', content: '{"id":"2"}' },
  { role: 'assistant', content: 'feito' },
];

test('Anthropic: tool_use no assistente e resultados agrupados em um único turno user', () => {
  const out = toAnthropicMessages(convo);
  assert.equal(out.length, 4);
  const assistant = out[1].content as any[];
  assert.deepEqual(assistant.map((b) => b.type), ['text', 'tool_use', 'tool_use']);
  const results = out[2];
  assert.equal(results.role, 'user');
  assert.deepEqual((results.content as any[]).map((b) => b.tool_use_id), ['a', 'b']);
});

test('OpenAI: tool_calls com argumentos serializados e mensagens tool separadas', () => {
  const out = toOpenAiMessages('SYS', convo);
  assert.equal(out[0].role, 'system');
  const assistant = out[2] as any;
  assert.equal(assistant.tool_calls.length, 2);
  assert.equal(assistant.tool_calls[0].function.arguments, '{"title":"X"}');
  assert.equal((out[3] as any).tool_call_id, 'a');
  assert.equal(out.length, 6);
});
