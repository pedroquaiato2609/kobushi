// Autenticação: usuário + senha (scrypt), sessões por cookie (só o hash do token fica no banco), dispositivos,
// limite de tentativas, reautenticação para ações críticas e auditoria.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { AppError, ValidationError } from '../domain/errors';
import type { AuditRepository, SessionRepository, SessionRow, User, UserRepository } from './authPorts';

export interface RequestMeta { ip: string; userAgent: string }
export interface AuthContext { user: User; session: SessionRow }

const SCRYPT_N = 16384;
const IDLE_MS = 14 * 86_400_000;    // some após 14 dias sem uso
const MAX_MS = 90 * 86_400_000;     // e nunca dura mais de 90 dias
const REAUTH_MS = 5 * 60_000;       // "modo seguro" após confirmar a senha
const TOUCH_EVERY_MS = 5 * 60_000;
const WEAK = new Set(['1234567890', '12345678910', 'password12', 'senha12345', 'qwertyuiop', '0123456789']);

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 });
  return `scrypt$${SCRYPT_N}$${salt.toString('base64')}$${key.toString('base64')}`;
}
export function verifyPassword(password: string, stored: string): boolean {
  const [alg, n, salt, hash] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const key = scryptSync(password, Buffer.from(salt, 'base64'), 64, { N: Number(n), r: 8, p: 1 });
  const expected = Buffer.from(hash, 'base64');
  return key.length === expected.length && timingSafeEqual(key, expected);
}
const DUMMY_HASH = hashPassword('senha-que-nunca-sera-usada'); // gasta o mesmo tempo quando o e-mail não existe

export function checkPasswordStrength(password: string) {
  if (password.length < 10) throw new ValidationError('Use uma senha com pelo menos 10 caracteres.');
  if (WEAK.has(password.toLowerCase()) || /^(.)\1+$/.test(password)) throw new ValidationError('Essa senha é fácil demais de adivinhar. Escolha outra.');
}

export class AuthService {
  private failures = new Map<string, { count: number; blockedUntil: number }>();

  constructor(
    private users: UserRepository, private sessions: SessionRepository, private audit: AuditRepository,
    private now: () => Date = () => new Date(),
  ) {}

  async needsSetup() { return (await this.users.count()) === 0; }

  /** Primeiro acesso: cria o dono do sistema. Depois disso o cadastro fica fechado. */
  async setup(input: { name: string; email: string; password: string }, meta: RequestMeta) {
    if (!(await this.needsSetup())) throw new AppError('O sistema já tem um usuário. Entre com a sua conta.', 403);
    checkPasswordStrength(input.password);
    const user = await this.users.create({ email: input.email.trim().toLowerCase(), name: input.name.trim(), passwordHash: hashPassword(input.password) });
    await this.audit.add({ userId: user.id, action: 'auth.setup', target: 'user', detail: {}, ip: meta.ip });
    return this.openSession(user, meta);
  }

  async login(email: string, password: string, meta: RequestMeta) {
    const key = `${email.trim().toLowerCase()}|${meta.ip}`;
    const now = this.now().getTime();
    if (this.failures.size > 5000) this.pruneFailures(now); // limita a memória sob ataque com muitos e-mails/IPs
    const f = this.failures.get(key);
    if (f && now < f.blockedUntil) throw new AppError(`Muitas tentativas. Tente de novo em ${Math.ceil((f.blockedUntil - now) / 1000)} s.`, 429);

    const row = await this.users.findByEmail(email.trim().toLowerCase());
    const ok = verifyPassword(password, row?.passwordHash ?? DUMMY_HASH) && Boolean(row);
    if (!ok || !row) {
      const count = (f?.count ?? 0) + 1;
      this.failures.set(key, { count, blockedUntil: count >= 5 ? now + Math.min(60_000 * 2 ** (count - 5), 900_000) : 0 });
      await this.audit.add({ userId: row?.id ?? null, action: 'auth.login_failed', target: 'user', detail: {}, ip: meta.ip });
      throw new AppError('E-mail ou senha incorretos.', 401);
    }
    this.failures.delete(key);
    await this.audit.add({ userId: row.id, action: 'auth.login', target: 'session', detail: { userAgent: meta.userAgent.slice(0, 120) }, ip: meta.ip });
    return this.openSession(row, meta);
  }

  private pruneFailures(now: number) {
    for (const [k, v] of this.failures) if (v.blockedUntil <= now) this.failures.delete(k);
    if (this.failures.size > 5000) this.failures.clear(); // último recurso: melhor perder contadores que estourar a memória
  }

  private async openSession(user: User, meta: RequestMeta) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now().getTime() + IDLE_MS);
    await this.sessions.create({ userId: user.id, tokenHash: hashToken(token), userAgent: meta.userAgent.slice(0, 300), ip: meta.ip, expiresAt });
    return { token, user: publicUser(user), maxAgeSeconds: IDLE_MS / 1000 };
  }

  /** Valida o token do cookie. Devolve null se ausente, inválido, revogado ou expirado. */
  async authenticate(token: string | undefined): Promise<AuthContext | null> {
    if (!token) return null;
    const session = await this.sessions.findByTokenHash(hashToken(token));
    const now = this.now();
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    const user = await this.users.get(session.userId);
    if (!user) return null;
    if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_EVERY_MS) {
      const expiresAt = new Date(Math.min(now.getTime() + IDLE_MS, session.createdAt.getTime() + MAX_MS));
      await this.sessions.touch(session.id, now, expiresAt);
      session.lastSeenAt = now; session.expiresAt = expiresAt;
    }
    return { user: publicUser(user), session };
  }

  async logout(ctx: AuthContext, ip: string) {
    await this.sessions.revoke(ctx.user.id, ctx.session.id, this.now());
    await this.audit.add({ userId: ctx.user.id, action: 'auth.logout', target: 'session', detail: {}, ip });
  }

  async listSessions(ctx: AuthContext) {
    return (await this.sessions.listActive(ctx.user.id, this.now())).map((s) => ({
      id: s.id, userAgent: s.userAgent, ip: maskIp(s.ip), createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === ctx.session.id,
    }));
  }

  async revokeSession(ctx: AuthContext, sessionId: string, ip: string) {
    if (!(await this.sessions.revoke(ctx.user.id, sessionId, this.now()))) throw new AppError('Sessão não encontrada.', 404);
    await this.audit.add({ userId: ctx.user.id, action: 'auth.session_revoked', target: sessionId, detail: {}, ip });
  }

  async changePassword(ctx: AuthContext, current: string, next: string, ip: string) {
    const row = await this.users.get(ctx.user.id);
    if (!row || !verifyPassword(current, row.passwordHash)) throw new AppError('A senha atual está incorreta.', 401);
    checkPasswordStrength(next);
    await this.users.setPassword(ctx.user.id, hashPassword(next));
    await this.sessions.revokeOthers(ctx.user.id, ctx.session.id, this.now()); // desconecta os outros aparelhos
    await this.audit.add({ userId: ctx.user.id, action: 'auth.password_changed', target: 'user', detail: {}, ip });
  }

  /** Confirma a senha e abre uma janela curta em que ações críticas (exportar, apagar, revogar) são permitidas. */
  async reauth(ctx: AuthContext, password: string, ip: string) {
    const row = await this.users.get(ctx.user.id);
    if (!row || !verifyPassword(password, row.passwordHash)) {
      await this.audit.add({ userId: ctx.user.id, action: 'auth.reauth_failed', target: 'session', detail: {}, ip });
      throw new AppError('Senha incorreta.', 401);
    }
    const until = new Date(this.now().getTime() + REAUTH_MS);
    await this.sessions.setReauth(ctx.session.id, until);
    ctx.session.reauthUntil = until;
    return { reauthUntil: until };
  }

  requireReauth(ctx: AuthContext) {
    if (!ctx.session.reauthUntil || ctx.session.reauthUntil <= this.now()) {
      throw new AppError('Confirme a sua senha para continuar.', 403, 'reauth_required');
    }
  }
}

const publicUser = (u: User): User => ({ id: u.id, email: u.email, name: u.name, createdAt: u.createdAt });
const maskIp = (ip: string) => (ip.includes('.') ? ip.replace(/\.\d+$/, '.•••') : ip.replace(/:[0-9a-f]*$/i, ':•••'));

export class AuditService {
  constructor(private repo: AuditRepository) {}
  record(userId: string | null, action: string, target = '', detail: Record<string, unknown> = {}, ip = '') {
    return this.repo.add({ userId, action, target, detail, ip }).catch(() => undefined); // auditar nunca derruba a operação
  }
  list(userId: string, limit = 100) { return this.repo.list(userId, limit); }
}
