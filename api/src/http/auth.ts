import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AuthContext } from '../application/auth';
import type { Container } from '../container';
import { config } from '../config';
import { AppError } from '../domain/errors';

// Limite por IP nas rotas que testam senha (força bruta); complementa o bloqueio por conta do AuthService.
const STRICT = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

export const COOKIE = 'ninshiki_session';
const PUBLIC = new Set(['/api/health', '/api/auth/status', '/api/auth/setup', '/api/auth/login']);

export const metaOf = (req: FastifyRequest) => ({ ip: req.ip ?? '', userAgent: String(req.headers['user-agent'] ?? '') });
export const authOf = (req: FastifyRequest): AuthContext => {
  const ctx = (req as any).auth as AuthContext | undefined;
  if (!ctx) throw new AppError('Não autenticado.', 401, 'unauthenticated');
  return ctx;
};

function readCookie(req: FastifyRequest, name: string): string | undefined {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function setSessionCookie(req: FastifyRequest, reply: FastifyReply, token: string, maxAgeSeconds: number) {
  // Em produção o cookie é sempre Secure (o navegador só o envia por HTTPS); em dev, só quando a conexão é HTTPS.
  const secure = config.isProduction || (req as any).protocol === 'https';
  reply.header('set-cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? '; Secure' : ''}`);
}
export const clearSessionCookie = (reply: FastifyReply) => reply.header('set-cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.isProduction ? '; Secure' : ''}`);

/**
 * Tudo em /api exige sessão válida (exceto login/cadastro inicial). Requisições que alteram dados também precisam ter
 * a mesma origem do servidor (defesa extra contra CSRF, além do SameSite=Lax do cookie).
 */
/** Defesa extra contra CSRF: o Origin do navegador precisa ser o próprio servidor (Host) ou o repassado pelo proxy (x-forwarded-host). */
export function originAllowed(origin: string | undefined, headers: Record<string, unknown>, extra: string[] = (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)): boolean {
  if (!origin) return true; // clientes sem Origin (curl, mesma origem em GET) não são um vetor de CSRF de navegador
  let originHost: string;
  try { originHost = new URL(origin).host; } catch { return false; }
  const hosts = [headers['x-forwarded-host'], headers.host].filter(Boolean).map((h) => String(h).split(',')[0].trim());
  return hosts.includes(originHost) || extra.includes(origin);
}

export function registerAuth(api: FastifyInstance, c: Container) {
  api.addHook('onRequest', async (req: FastifyRequest) => {
    const path = req.url.split('?')[0];
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (!originAllowed(origin as string | undefined, req.headers)) throw new AppError('Origem não permitida.', 403);
    }
    if (PUBLIC.has(path)) return;
    const ctx = await c.auth.authenticate(readCookie(req, COOKIE));
    if (!ctx) throw new AppError('Não autenticado.', 401, 'unauthenticated');
    (req as any).auth = ctx;
  });
}

export function authRoutes(api: FastifyInstance, c: Container) {
  api.get('/auth/status', async (req) => {
    const ctx = await c.auth.authenticate(readCookie(req, COOKIE));
    return { needsSetup: await c.auth.needsSetup(), user: ctx?.user ?? null, reauthUntil: ctx?.session.reauthUntil ?? null };
  });
  api.post('/auth/setup', STRICT, async (req, reply) => {
    const b = z.object({ name: z.string().min(1).max(80), email: z.string().email().max(200), password: z.string().min(1).max(200) }).parse(req.body);
    const out = await c.auth.setup(b, metaOf(req));
    setSessionCookie(req, reply, out.token, out.maxAgeSeconds);
    return { user: out.user };
  });
  api.post('/auth/login', STRICT, async (req, reply) => {
    const b = z.object({ email: z.string().max(200), password: z.string().max(200) }).parse(req.body);
    const out = await c.auth.login(b.email, b.password, metaOf(req));
    setSessionCookie(req, reply, out.token, out.maxAgeSeconds);
    return { user: out.user };
  });
  api.post('/auth/logout', async (req, reply) => { await c.auth.logout(authOf(req), req.ip); clearSessionCookie(reply); return reply.code(204).send(); });
  api.get('/auth/sessions', async (req) => c.auth.listSessions(authOf(req)));
  api.delete('/auth/sessions/:id', async (req, reply) => {
    await c.auth.revokeSession(authOf(req), z.string().uuid().parse((req.params as any).id), req.ip);
    return reply.code(204).send();
  });
  api.post('/auth/password', STRICT, async (req, reply) => {
    const b = z.object({ current: z.string().max(200), next: z.string().max(200) }).parse(req.body);
    await c.auth.changePassword(authOf(req), b.current, b.next, req.ip);
    return reply.code(204).send();
  });
  api.post('/auth/reauth', STRICT, async (req) => c.auth.reauth(authOf(req), z.object({ password: z.string().max(200) }).parse(req.body).password, req.ip));
  api.get('/auth/audit', async (req) => c.audit.list(authOf(req).user.id, 100));
}
