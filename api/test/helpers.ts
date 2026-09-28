// Corpos Server-Sent Events simulados para os testes de streaming.
export const frame = (data: unknown, event?: string) => `${event ? `event: ${event}\n` : ''}data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`;

export function sseResponse(frames: string[], chunkSize = 17): Response {
  const all = frames.join('');
  const encoder = new TextEncoder();
  // entrega em pedaços que cortam eventos ao meio, como na rede de verdade
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < all.length; i += chunkSize) controller.enqueue(encoder.encode(all.slice(i, i + chunkSize)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

export type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

/** Converte blocos de resposta no fluxo de eventos da API da Anthropic. */
export function anthropicStream(blocks: Block[]): Response {
  const frames: string[] = [frame({ type: 'message_start', message: {} }, 'message_start')];
  blocks.forEach((b, index) => {
    if (b.type === 'text') {
      frames.push(frame({ type: 'content_block_start', index, content_block: { type: 'text', text: '' } }, 'content_block_start'));
      for (let i = 0; i < b.text.length; i += 4) {
        frames.push(frame({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: b.text.slice(i, i + 4) } }, 'content_block_delta'));
      }
    } else {
      frames.push(frame({ type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.id, name: b.name, input: {} } }, 'content_block_start'));
      const json = JSON.stringify(b.input);
      const mid = Math.floor(json.length / 2);
      for (const part of [json.slice(0, mid), json.slice(mid)]) {
        frames.push(frame({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: part } }, 'content_block_delta'));
      }
    }
    frames.push(frame({ type: 'content_block_stop', index }, 'content_block_stop'));
  });
  frames.push(frame({ type: 'message_stop' }, 'message_stop'));
  return sseResponse(frames);
}
