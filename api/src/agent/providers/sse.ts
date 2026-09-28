/** Lê um corpo Server-Sent Events e devolve cada evento (event + data). */
export async function* readSse(res: Response): AsyncGenerator<{ event: string; data: string }> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const parse = (frame: string) => {
    let event = 'message';
    const data: string[] = [];
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    return data.length ? { event, data: data.join('\n') } : null;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (;;) {
      const m = /\r?\n\r?\n/.exec(buffer);
      if (!m) break;
      const frame = parse(buffer.slice(0, m.index));
      buffer = buffer.slice(m.index + m[0].length);
      if (frame) yield frame;
    }
  }
  const rest = parse(buffer);
  if (rest) yield rest;
}

export const parseArgs = (json: string): Record<string, unknown> => {
  try { return json.trim() ? JSON.parse(json) : {}; } catch { return {}; }
};
