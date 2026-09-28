export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Lê a mensagem de erro do servidor e, se a sessão caiu, avisa o app para voltar à tela de entrada. */
async function fail(res: Response): Promise<never> {
  let message = res.statusText || `Erro ${res.status}`;
  let code: string | undefined;
  try { const body = await res.json(); message = body.error ?? message; code = body.code; } catch { /* corpo não é JSON */ }
  if (res.status === 401 && code === 'unauthenticated') window.dispatchEvent(new Event('ninshiki:unauthenticated'));
  throw new ApiError(res.status, message, code);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return fail(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

/** POST que devolve Server-Sent Events; chama onEvent para cada evento assim que chega. */
async function streamPost<E>(path: string, body: unknown, onEvent: (e: E) => void): Promise<void> {
  const res = await fetch(`/api${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) return fail(res);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (let i = buffer.indexOf('\n\n'); i !== -1; i = buffer.indexOf('\n\n')) {
      const line = buffer.slice(0, i).split('\n').find((l) => l.startsWith('data:'));
      buffer = buffer.slice(i + 2);
      if (line) onEvent(JSON.parse(line.slice(5).trim()) as E);
    }
  }
}

export const api = {
  stream: streamPost,
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string) => request<T>('DELETE', path),

  /** Baixa uma resposta como arquivo (ex.: exportação dos dados). */
  async download(path: string, filename: string): Promise<void> {
    const res = await fetch(`/api${path}`);
    if (!res.ok) return fail(res);
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async uploadFile(file: File, folderId?: string): Promise<unknown> {
    const form = new FormData();
    form.append('file', file, file.name);
    const query = new URLSearchParams({ name: file.name });
    if (folderId) query.set('folderId', folderId);
    const res = await fetch(`/api/documents/upload?${query}`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'Falha no envio do arquivo.');
    return data;
  },

  async uploadAudio(blob: Blob): Promise<{ text: string }> {
    const form = new FormData();
    form.append('audio', blob, 'audio');
    const res = await fetch('/api/voice/transcribe', { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? 'Falha na transcrição.');
    return data;
  },
};
