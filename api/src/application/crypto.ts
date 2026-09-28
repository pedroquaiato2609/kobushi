// Criptografia do cofre: chave derivada da senha (scrypt) + AES-256-GCM. Sem dependências externas.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

export const newSalt = () => randomBytes(16);
export const deriveKey = (password: string, salt: Buffer): Buffer => scryptSync(password, salt, 32);

/** Formato: iv.tag.dados (base64). */
export function encrypt(key: Buffer, plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

/** Lança se a chave estiver errada ou o dado for adulterado. */
export function decrypt(key: Buffer, payload: string): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
