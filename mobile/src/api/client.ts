import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { API_BASE_URL } from '../config';

// expo-secure-store não existe na versão web (só serve de preview em navegador durante o desenvolvimento;
// o app de verdade é Android nativo) — nesse caso cai pro localStorage, só pra não quebrar o preview.
const storage = Platform.OS === 'web'
  ? {
      getItemAsync: async (k: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k)),
      setItemAsync: async (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); },
      deleteItemAsync: async (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); },
    }
  : SecureStore;

// O backend usa sessão por cookie HttpOnly (feito pro navegador). Apps nativos não têm cookie jar de
// navegador, então aqui a gente guarda o token no armazenamento seguro do aparelho e manda ele de volta
// como um cabeçalho Cookie "feito à mão" — o servidor não liga pra como o cookie chegou, só lê o header.
const TOKEN_KEY = 'ninshiki.session.token';
const COOKIE_NAME = 'ninshiki_session'; // precisa bater com COOKIE em api/src/http/auth.ts

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

let token: string | null = null;
let onUnauthenticated: (() => void) | null = null;

/** Chamado pelo AuthProvider pra reagir quando uma sessão expirada/derrubada é detectada em qualquer chamada. */
export function setUnauthenticatedHandler(fn: (() => void) | null) { onUnauthenticated = fn; }

export async function loadStoredToken(): Promise<string | null> {
  token = await storage.getItemAsync(TOKEN_KEY);
  return token;
}
export async function setToken(t: string | null): Promise<void> {
  token = t;
  if (t) await storage.setItemAsync(TOKEN_KEY, t);
  else await storage.deleteItemAsync(TOKEN_KEY);
}

async function fail(res: Response): Promise<never> {
  let message = res.statusText || `Erro ${res.status}`;
  let code: string | undefined;
  try { const body = await res.json(); message = body.error ?? message; code = body.code; } catch { /* corpo não é JSON */ }
  if (res.status === 401 && code === 'unauthenticated') onUnauthenticated?.();
  throw new ApiError(res.status, message, code);
}

const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Sem isso, uma chamada que trava (rede ruim, servidor que não responde) deixa a tela girando pra
 * sempre, sem erro nenhum pra mostrar — foi exatamente o que aconteceu num aparelho real: a tela ficava
 * "carregando" indefinidamente. Com o timeout, em 15s vira um erro de verdade, com o método e a rota na
 * mensagem, que as telas conseguem mostrar (em vez de ficar girando sem dizer por quê).
 *
 * Usa `Promise.race` em vez de só `AbortController`/`signal`: testado, o `AbortController` sozinho NÃO
 * é suficiente aqui — se o `fetch` do ambiente ignora `signal` (visto no preview web; não dá pra garantir
 * que toda versão de Android trata isso direito também), `controller.abort()` não cancela nada e a
 * chamada trava do mesmo jeito. Com a corrida contra o cronômetro, a tela para de esperar em 15s de
 * qualquer forma — na pior hipótese a requisição de rede continua tentando sozinha em segundo plano,
 * mas o app não fica mais preso esperando por ela.
 */
async function request<T>(method: string, path: string, body?: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}`;
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ApiError(0, `Tempo esgotado (${REQUEST_TIMEOUT_MS / 1000}s): ${method} ${path}`)), REQUEST_TIMEOUT_MS);
  });
  let res: Response;
  try {
    res = await Promise.race([
      fetch(`${API_BASE_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }),
      timeout,
    ]);
  } catch (e) {
    if (e instanceof ApiError) throw e; // já é o erro de timeout acima, com a mensagem certa
    throw new ApiError(0, `Não consegui conectar: ${method} ${path} — ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer!); // o fetch já resolveu/rejeitou — não precisa mais do cronômetro rodando
  }
  if (!res.ok) return fail(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T = void>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

// ---- autenticação (único lugar que manda x-ninshiki-client, pra receber o token no corpo) ----
export interface MeUser { id: string; email: string; name: string; createdAt: string }

export const authApi = {
  status: () => request<{ needsSetup: boolean; user: MeUser | null }>('GET', '/auth/status'),
  login: (email: string, password: string) =>
    request<{ user: MeUser; token: string }>('POST', '/auth/login', { email, password }, { 'x-ninshiki-client': 'mobile' }),
  logout: () => request<void>('POST', '/auth/logout'),
};
