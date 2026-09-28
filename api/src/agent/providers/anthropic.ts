import { ProviderError } from '../../domain/errors';
import { fetchWithRetry, httpError } from './retry';
import { parseArgs, readSse } from './sse';
import type { ChatMessage, ChatRequest, ChatResponse, LLMProvider } from './types';

type Block = Record<string, unknown>;
type AnthropicMessage = { role: 'user' | 'assistant'; content: string | Block[] };

/** Converte o formato neutro para o da Messages API. Resultados de tool viram blocos tool_result num turno "user". */
export function toAnthropicMessages(messages: ChatMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
      if (blocks.length) out.push({ role: 'assistant', content: blocks });
    } else {
      const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
      const prev = out[out.length - 1];
      if (prev && prev.role === 'user' && Array.isArray(prev.content) && prev.content.every((b) => b.type === 'tool_result')) {
        prev.content.push(block); // agrupa resultados consecutivos no mesmo turno
      } else {
        out.push({ role: 'user', content: [block] });
      }
    }
  }
  return out;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic' as const;
  constructor(private apiKey: string) {}

  private body(req: ChatRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
    };
    if (stream) body.stream = true;
    if (req.tools.length) {
      body.tools = req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    }
    return body;
  }

  private post(body: Record<string, unknown>) {
    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await fetchWithRetry(() => this.post(this.body(req, false)), { onWait: req.onWait });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw httpError('Anthropic', res, data);

    let text = '';
    const toolCalls: ChatResponse['toolCalls'] = [];
    for (const block of data.content ?? []) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'tool_use') toolCalls.push({ id: block.id, name: block.name, args: block.input ?? {} });
    }
    return { text, toolCalls };
  }

  async stream(req: ChatRequest, onText: (delta: string) => void): Promise<ChatResponse> {
    const res = await fetchWithRetry(() => this.post(this.body(req, true)), { onWait: req.onWait });
    if (!res.ok) throw httpError('Anthropic', res, await res.json().catch(() => null));

    let text = '';
    const blocks = new Map<number, { type: string; id?: string; name?: string; json: string }>();
    for await (const { data } of readSse(res)) {
      let ev: any;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.type === 'content_block_start') {
        blocks.set(ev.index, { type: ev.content_block.type, id: ev.content_block.id, name: ev.content_block.name, json: '' });
      } else if (ev.type === 'content_block_delta') {
        if (ev.delta?.type === 'text_delta') { text += ev.delta.text; onText(ev.delta.text); }
        else if (ev.delta?.type === 'input_json_delta') { const b = blocks.get(ev.index); if (b) b.json += ev.delta.partial_json ?? ''; }
      } else if (ev.type === 'error') {
        throw new ProviderError(`Anthropic: ${ev.error?.message ?? 'erro no streaming'}`);
      }
    }
    const toolCalls = [...blocks.values()]
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id as string, name: b.name as string, args: parseArgs(b.json) }));
    return { text, toolCalls };
  }
}
