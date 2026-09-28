import { config, productionProblems } from './config';
import { createContainer } from './container';
import { buildApp } from './http/app';
import { migrate } from './infrastructure/db/migrate';
import { pool } from './infrastructure/db/pool';

// Em produção, configuração insegura impede o início (falha rápida e explícita).
const problems = productionProblems();
if (problems.length) {
  console.error('[config] Configuração inválida para produção:\n - ' + problems.join('\n - '));
  process.exit(1);
}

await migrate();

const container = createContainer();
// Catálogo de exercícios: cria o que falta e corrige a classificação/textos do que já existe (nunca toca nos do usuário).
const catalogSync = await container.gym.syncCatalog();
if (catalogSync.created) console.log(`[seed] ${catalogSync.created} exercícios pré-cadastrados criados`);
if (catalogSync.updated) console.log(`[seed] ${catalogSync.updated} exercícios pré-cadastrados atualizados`);
const app = await buildApp(container);
await app.listen({ port: config.port, host: '0.0.0.0' });
container.scheduler.start(); // avisos de atividades, eventos e lembretes

// Desligamento gracioso: para de aceitar conexões, termina as em andamento e fecha o banco.
let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'encerrando');
  const force = setTimeout(() => process.exit(1), 15_000);
  force.unref();
  try {
    container.scheduler.stop();
    await app.close();
    await pool.end();
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'falha ao encerrar');
    process.exit(1);
  }
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => app.log.error({ reason }, 'promessa rejeitada sem tratamento'));
