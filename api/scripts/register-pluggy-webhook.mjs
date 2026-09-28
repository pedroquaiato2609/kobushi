import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Runs inside the API container. Credentials never appear in CLI arguments/output.
const endpoint = process.argv[2];
const target = new URL(endpoint);
if (target.protocol !== 'https:' || target.pathname !== '/webhooks/pluggy' || target.search || target.username || target.password) throw new Error('Use a URL HTTPS terminada em /webhooks/pluggy.');
const secret = process.env.PLUGGY_WEBHOOK_SECRET;
if (!secret || secret.length < 32) throw new Error('Configure PLUGGY_WEBHOOK_SECRET com pelo menos 32 caracteres.');
async function request(path, init = {}) {
  const response = await fetch(`https://api.pluggy.ai${path}`, { ...init, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Pluggy ${path}: HTTP ${response.status}`);
  return response.json();
}
const { apiKey } = await request('/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET }) });
const headers = { 'content-type': 'application/json', 'X-API-KEY': apiKey };
const statePath = join(process.env.FILES_DIR || './data/files', 'pluggy-webhook-registration.json');
let previous;
try { previous = JSON.parse(await readFile(statePath, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const list = await request('/webhooks', { headers });
const hooks = Array.isArray(list) ? list : list.results;
if (!Array.isArray(hooks)) throw new Error('Resposta de listagem inesperada.');
const own = hooks.find((h) => h.id === previous?.id) || hooks.find((h) => h.url === endpoint && h.event === 'all');
const payload = { url: endpoint, event: 'all', headers: { 'X-Webhook-Secret': secret } };
const registered = await request(own ? `/webhooks/${encodeURIComponent(own.id)}` : '/webhooks', { method: own ? 'PATCH' : 'POST', headers, body: JSON.stringify(payload) });
await writeFile(statePath, JSON.stringify({ id: registered.id, url: endpoint }, null, 2));
const verified = await request(`/webhooks/${encodeURIComponent(registered.id)}`, { headers });
console.log(JSON.stringify({ registered: true, url: verified.url, event: verified.event, enabled: !verified.disabledAt, authenticationHeaderConfigured: verified.headers?.['X-Webhook-Secret'] === secret }));
