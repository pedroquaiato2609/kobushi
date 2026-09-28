import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config, features } from '../config';
import { pluggyWebhookRoutes } from './routes/pluggyWebhook';
import Fastify from 'fastify';
import { pool } from '../infrastructure/db/pool';
import { AppError } from '../domain/errors';
import type { Container } from '../container';
import { agentRoutes } from './routes/agent';
import { assistantRoutes } from './routes/assistant';
import { authRoutes, registerAuth } from './auth';
import { financeRoutes } from './routes/finance';
import { gymRoutes } from './routes/gym';
import { openFinanceRoutes } from './routes/openFinance';
import { privacyRoutes } from './routes/privacy';
import { boardRoutes } from './routes/boards';
import { coreRoutes } from './routes/core';
import { libraryRoutes } from './routes/library';
import { lifeRoutes } from './routes/life';
import { principlesRoutes } from './routes/principles';
import { profileRoutes } from './routes/profile';
import { readingRoutes } from './routes/reading';
import { studyRoutes } from './routes/study';

export async function buildApp(container: Container) {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Nunca registrar credenciais em log.
      redact: { paths: ['req.headers.cookie', 'req.headers.authorization', 'req.headers["x-webhook-secret"]', 'res.headers["set-cookie"]'], censor: '[oculto]' },
    },
    trustProxy: config.trustProxyHops > 0 ? (_addr: string, hop: number) => hop < config.trustProxyHops : false, // IP real vindo do proxy reverso, sem confiar em cabeçalhos forjados
    bodyLimit: 1024 * 1024,
    requestTimeout: 0, // SSE do chat e uploads longos: o limite fica no proxy; connectionTimeout cobre conexões mortas
    connectionTimeout: 30_000,
  });

  // A API só devolve JSON/SSE: uma CSP fechada e os demais cabeçalhos endurecem qualquer resposta inesperada.
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
  });
  // Limite geral por IP; login e ações sensíveis têm limites mais duros (rotas abaixo) além do bloqueio por conta em AuthService.
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute', allowList: (req) => req.url.startsWith('/api/health') });
  app.addHook('onSend', async (req, reply) => {
    if (req.url.startsWith('/api/')) reply.header('cache-control', 'no-store'); // dados pessoais/financeiros nunca em cache
  });

  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  // Provider authentication, outside the browser session/CSRF scope.
  pluggyWebhookRoutes(app, features.pluggyWebhookSecret, container.pluggyWebhooks);

  app.setErrorHandler((err: any, req, reply) => {
    if (Array.isArray(err?.issues)) { // ZodError (checado pela forma, não pelo nome da classe)
      const message = err.issues.map((i: any) => `${i.path.join('.') || 'corpo'}: ${i.message}`).join('; ');
      return reply.code(400).send({ error: message });
    }
    if (err instanceof AppError) return reply.code(err.statusCode).send({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    if (err?.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Erro interno do servidor.' });
  });

  await app.register(
    async (api) => {
      registerAuth(api, container); // tudo em /api exige sessão, exceto login/cadastro inicial
      authRoutes(api, container);
      api.get('/health', async () => { await pool.query('SELECT 1'); return { ok: true }; });
      coreRoutes(api, container);
      boardRoutes(api, container);
      agentRoutes(api, container);
      lifeRoutes(api, container);
      profileRoutes(api, container);
      principlesRoutes(api, container);
      libraryRoutes(api, container);
      financeRoutes(api, container);
      gymRoutes(api, container);
      readingRoutes(api, container);
      studyRoutes(api, container);
      assistantRoutes(api, container);
      openFinanceRoutes(api, container);
      privacyRoutes(api, container);
    },
    { prefix: '/api' },
  );

  return app;
}
