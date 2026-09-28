import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Chave (32 bytes) que criptografa campos sensíveis no banco. Vem de DATA_ENCRYPTION_KEY (base64).
 * Sem ela, uma chave é gerada e guardada em arquivo (permissão 0600) ao lado dos anexos — bom para uso pessoal,
 * mas em produção defina a variável e guarde a chave separada do banco.
 */
export function loadDataKey(envValue: string | undefined, filesDir: string): Buffer {
  if (envValue) {
    const key = Buffer.from(envValue, 'base64');
    if (key.length !== 32) throw new Error('DATA_ENCRYPTION_KEY precisa ser 32 bytes em base64 (gere com: openssl rand -base64 32).');
    return key;
  }
  const file = join(filesDir, '.datakey');
  if (existsSync(file)) return Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  mkdirSync(dirname(file), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  try { chmodSync(file, 0o600); } catch { /* sistemas sem chmod */ }
  console.warn('[segurança] DATA_ENCRYPTION_KEY não definida: gerei uma chave em', file, '— defina a variável em produção.');
  return key;
}
