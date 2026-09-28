const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
const int = (v: string | undefined, fallback: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback; };

const DEV_DATABASE_URL = 'postgres://ninshiki:ninshiki@localhost:5432/ninshiki';
const isProduction = process.env.NODE_ENV === 'production';

export const config = {
  isProduction,
  databaseUrl: clean(process.env.DATABASE_URL) ?? DEV_DATABASE_URL,
  dbPoolMax: int(process.env.DB_POOL_MAX, 10),
  port: Number(process.env.PORT ?? 3000),
  logLevel: clean(process.env.LOG_LEVEL) ?? 'info',
  // Quantos proxies confiáveis existem na frente da API (0 = nenhum). Necessário para o IP real (limite de tentativas, auditoria).
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? (isProduction ? 1 : 0)),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
  timezone: clean(process.env.APP_TIMEZONE) ?? 'America/Sao_Paulo',
  anthropicApiKey: clean(process.env.ANTHROPIC_API_KEY),
  openaiApiKey: clean(process.env.OPENAI_API_KEY),
};

// Recursos opcionais (lembretes por celular/WhatsApp e armazenamento de arquivos).
export const features = {
  filesDir: clean(process.env.FILES_DIR) ?? './data/files',
  pluggyClientId: clean(process.env.PLUGGY_CLIENT_ID), // Open Finance real (opcional); sem isso só há a demonstração
  pluggyClientSecret: clean(process.env.PLUGGY_CLIENT_SECRET),
  pluggyWebhook: clean(process.env.PLUGGY_WEBHOOK_URL),
  pluggyWebhookSecret: clean(process.env.PLUGGY_WEBHOOK_SECRET),
  pluggyScript: clean(process.env.PLUGGY_CONNECT_SCRIPT),
  dataEncryptionKey: clean(process.env.DATA_ENCRYPTION_KEY), // 32 bytes em base64: criptografa números de conta e tokens
  vapidPublicKey: clean(process.env.VAPID_PUBLIC_KEY),
  vapidPrivateKey: clean(process.env.VAPID_PRIVATE_KEY),
  vapidSubject: clean(process.env.VAPID_SUBJECT) ?? 'mailto:voce@example.com',
  twilioSid: clean(process.env.TWILIO_ACCOUNT_SID),
  twilioToken: clean(process.env.TWILIO_AUTH_TOKEN),
  twilioWhatsappFrom: clean(process.env.TWILIO_WHATSAPP_FROM), // ex.: +14155238886 (sandbox)
};

/**
 * Em produção o servidor se recusa a iniciar com configuração insegura, em vez de subir "quase certo".
 * Devolve a lista de problemas (vazia = ok) para poder ser testada sem derrubar o processo.
 */
export function productionProblems(c: typeof config = config, f: typeof features = features): string[] {
  if (!c.isProduction) return [];
  const problems: string[] = [];
  if (/\/\/ninshiki:ninshiki@/.test(c.databaseUrl)) problems.push('DATABASE_URL usa a senha padrão de desenvolvimento.');
  if (!f.dataEncryptionKey) problems.push('DATA_ENCRYPTION_KEY é obrigatória (openssl rand -base64 32); em produção a chave não pode ficar em arquivo ao lado dos dados.');
  else if (Buffer.from(f.dataEncryptionKey, 'base64').length !== 32) problems.push('DATA_ENCRYPTION_KEY precisa ter 32 bytes em base64.');
  if ((f.pluggyClientId || f.pluggyClientSecret) && (f.pluggyWebhookSecret ?? '').length < 24) problems.push('PLUGGY_WEBHOOK_SECRET precisa ter pelo menos 24 caracteres quando o Open Finance está ativo.');
  if (c.allowedOrigins.length === 0) problems.push('ALLOWED_ORIGINS deve listar a URL pública do app (ex.: https://app.exemplo.com).');
  return problems;
}
