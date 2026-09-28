import assert from 'node:assert/strict';
import { test } from 'node:test';
import { config, features, productionProblems } from '../src/config';

const prod = { ...config, isProduction: true, databaseUrl: 'postgres://app:S3nh4Forte@db:5432/app', allowedOrigins: ['https://app.exemplo.com'] };
const feats = { ...features, dataEncryptionKey: Buffer.alloc(32, 7).toString('base64'), pluggyClientId: undefined, pluggyClientSecret: undefined };

test('produção: configuração correta não tem problemas; desenvolvimento nunca bloqueia', () => {
  assert.deepEqual(productionProblems(prod, feats), []);
  assert.deepEqual(productionProblems({ ...config, isProduction: false }, { ...features, dataEncryptionKey: undefined }), []);
});

test('produção: recusa senha padrão do banco, chave ausente/curta, origem vazia e webhook fraco', () => {
  assert.equal(productionProblems({ ...prod, databaseUrl: 'postgres://ninshiki:ninshiki@db:5432/ninshiki' }, feats).length, 1);
  assert.equal(productionProblems(prod, { ...feats, dataEncryptionKey: undefined }).length, 1);
  assert.equal(productionProblems(prod, { ...feats, dataEncryptionKey: Buffer.alloc(8).toString('base64') }).length, 1);
  assert.equal(productionProblems({ ...prod, allowedOrigins: [] }, feats).length, 1);
  assert.equal(productionProblems(prod, { ...feats, pluggyClientId: 'x', pluggyWebhookSecret: 'curto' }).length, 1);
});
