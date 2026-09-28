import { ProviderError } from '../../domain/errors';

const RETRYABLE = new Set([429, 500, 502, 503, 529]);
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Segundos sugeridos pela API para tentar de novo (cabeçalho retry-after ou "try again in 5.1s" na mensagem). */
export function waitSeconds(res: Response, message: string): number {
  const header = Number(res.headers.get('retry-after'));
  if (header > 0) return header;
  const m = /try again in ([\d.]+)\s*(ms|s)\b/i.exec(message);
  if (m) return m[2].toLowerCase() === 'ms' ? Number(m[1]) / 1000 : Number(m[1]);
  return 3;
}

/**
 * Faz a requisição e, se o provedor limitar a taxa (429) ou estiver instável, espera o tempo pedido e tenta de novo,
 * avisando por onWait. Não insiste quando o problema é cota esgotada (não passa sozinho) nem quando a espera é longa.
 */
export async function fetchWithRetry(
  send: () => Promise<Response>,
  opts: { maxAttempts?: number; maxWaitSec?: number; onWait?: (seconds: number) => void; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Response> {
  const attempts = opts.maxAttempts ?? 4;
  for (let attempt = 1; ; attempt++) {
    const res = await send();
    if (res.ok || !RETRYABLE.has(res.status) || attempt >= attempts) return res;

    const raw = await res.clone().text().catch(() => '');
    if (/insufficient_quota|exceeded your current quota|credit balance/i.test(raw)) return res;
    let message = raw;
    try { message = JSON.parse(raw)?.error?.message ?? raw; } catch { /* corpo não é JSON */ }

    const wait = waitSeconds(res, message) + 0.5;
    if (wait > (opts.maxWaitSec ?? 20)) return res;
    opts.onWait?.(Math.ceil(wait));
    await (opts.sleep ?? defaultSleep)(wait * 1000);
  }
}

/** Erro legível: limite de taxa vira uma orientação em português; o resto mantém a mensagem da API. */
export function httpError(provider: string, res: Response, data: any): ProviderError {
  const detail: string = data?.error?.message ?? res.statusText ?? `erro ${res.status}`;
  if (res.status === 429 && !/quota|credit/i.test(detail)) {
    const kind = /token/i.test(detail) ? 'de tokens por minuto' : 'de requisições';
    return new ProviderError(
      `A ${provider} atingiu o limite ${kind} da sua conta. Esperei e tentei de novo, mas ainda não liberou. `
      + `Aguarde alguns segundos e envie de novo, ou escolha um modelo com limite maior em Configurações. (${detail.slice(0, 140)})`,
    );
  }
  return new ProviderError(`${provider}: ${detail}`);
}
