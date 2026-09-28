import { ProviderError } from '../../domain/errors';
import { fetchWithRetry, httpError } from './retry';
import { parseArgs, readSse } from './sse';
import type { ChatMessage, ChatRequest, ChatResponse, LLMProvider } from './types';

/** Converte o formato neutro para Chat Completions. */
export function toOpenAiMessages(system: string, messages: ChatMessage[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    else {
      const msg: Record<string, unknown> = { role: 'assistant', content: m.content || null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }));
      }
      out.push(msg);
    }
  }
  return out;
}

export class OpenAiProvider implements LLMProvider {
  readonly name = 'openai' as const;
  constructor(private apiKey: string) {}

  private post(req: ChatRequest, stream: boolean) {
    const body: Record<string, unknown> = { model: req.model, messages: toOpenAiMessages(req.system, req.messages) };
    if (stream) body.stream = true;
    if (req.tools.length) {
      body.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
    }
    return fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify(body),
    });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await fetchWithRetry(() => this.post(req, false), { onWait: req.onWait });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw httpError('OpenAI', res, data);

    const message = data.choices?.[0]?.message ?? {};
    const toolCalls = (message.tool_calls ?? []).map((c: any) => ({
      id: c.id as string, name: c.function?.name as string, args: parseArgs(c.function?.arguments ?? ''),
    }));
    return { text: (message.content as string | null) ?? '', toolCalls };
  }

  async stream(req: ChatRequest, onText: (delta: string) => void): Promise<ChatResponse> {
    const res = await fetchWithRetry(() => this.post(req, true), { onWait: req.onWait });
    if (!res.ok) throw httpError('OpenAI', res, await res.json().catch(() => null));

    let text = '';
    const calls = new Map<number, { id: string; name: string; args: string }>();
    for await (const { data } of readSse(res)) {
      if (data === '[DONE]') break;
      let ev: any;
      try { ev = JSON.parse(data); } catch { continue; }
      if (ev.error) throw new ProviderError(`OpenAI: ${ev.error.message ?? 'erro no streaming'}`);
      const delta = ev.choices?.[0]?.delta;
      if (!delta) continue;
      if (delta.content) { text += delta.content; onText(delta.content); }
      for (const tc of delta.tool_calls ?? []) {
        const cur = calls.get(tc.index) ?? { id: '', name: '', args: '' };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name += tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        calls.set(tc.index, cur);
      }
    }
    const toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => ({ id: c.id, name: c.name, args: parseArgs(c.args) }));
    return { text, toolCalls };
  }
}
