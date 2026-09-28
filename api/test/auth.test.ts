import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuditService, AuthService, hashToken } from '../src/application/auth';
import type { AuditEntry, SessionRow, UserRow } from '../src/application/authPorts';
import { AppError } from '../src/domain/errors';
import { originAllowed } from '../src/http/auth';

function setup(start = new Date('2026-09-21T12:00:00Z')) {
  let clock = start;
  const users: UserRow[] = []; const sessions: (SessionRow & { tokenHash: string })[] = []; const audits: AuditEntry[] = [];
  let seq = 0;
  const userRepo = {
    count: async () => users.length, list: async () => users,
    findByEmail: async (e: string) => users.find((u) => u.email === e) ?? null, get: async (id: string) => users.find((u) => u.id === id) ?? null,
    create: async (d: any) => { const u = { id: `u${++seq}`, createdAt: new Date(), ...d }; users.push(u); return u; },
    setPassword: async (id: string, h: string) => { users.find((u) => u.id === id)!.passwordHash = h; },
  };
  const sessionRepo = {
    create: async (d: any) => { const s = { id: `s${++seq}`, createdAt: clock, lastSeenAt: clock, revokedAt: null, reauthUntil: null, ...d }; sessions.push(s); return s; },
    findByTokenHash: async (h: string) => sessions.find((s) => s.tokenHash === h) ?? null,
    touch: async (id: string, seen: Date, exp: Date) => { const s = sessions.find((x) => x.id === id)!; s.lastSeenAt = seen; s.expiresAt = exp; },
    listActive: async (uid: string, now: Date) => sessions.filter((s) => s.userId === uid && !s.revokedAt && s.expiresAt > now),
    revoke: async (uid: string, id: string, now: Date) => { const s = sessions.find((x) => x.id === id && x.userId === uid && !x.revokedAt); if (s) s.revokedAt = now; return !!s; },
    revokeOthers: async (uid: string, keep: string, now: Date) => { sessions.forEach((s) => { if (s.userId === uid && s.id !== keep && !s.revokedAt) s.revokedAt = now; }); },
    setReauth: async (id: string, until: Date | null) => { sessions.find((s) => s.id === id)!.reauthUntil = until; },
  };
  const auditRepo = { add: async (e: any) => { audits.push({ id: audits.length + 1, createdAt: clock, ...e }); }, list: async () => audits };
  const auth = new AuthService(userRepo as any, sessionRepo as any, auditRepo as any, () => clock);
  return { auth, users, sessions, audits, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); } };
}
const meta = { ip: '1.2.3.4', userAgent: 'test' };
const PW = 'uma-senha-longa-e-boa';

test('primeiro acesso cria o dono; depois o cadastro fecha; senha fraca é recusada', async () => {
  const { auth, users } = setup();
  await assert.rejects(auth.setup({ name: 'Ana', email: 'ana@x.com', password: 'curta' }, meta), /10 caracteres/);
  await assert.rejects(auth.setup({ name: 'Ana', email: 'ana@x.com', password: '1234567890' }, meta), /fácil demais/);
  const out = await auth.setup({ name: 'Ana', email: 'ANA@x.com', password: PW }, meta);
  assert.equal(users[0].email, 'ana@x.com');
  assert.notEqual(users[0].passwordHash, PW); assert.ok(users[0].passwordHash.startsWith('scrypt$'));
  assert.ok(out.token.length >= 40);
  await assert.rejects(auth.setup({ name: 'Eve', email: 'eve@x.com', password: PW }, meta), (e: AppError) => e.statusCode === 403);
});

test('sessão: só o hash do token fica guardado; revogada ou expirada deixa de valer', async () => {
  const { auth, sessions, advance } = setup();
  const { token } = await auth.setup({ name: 'Ana', email: 'a@x.com', password: PW }, meta);
  assert.equal(sessions[0].tokenHash, hashToken(token)); assert.notEqual(sessions[0].tokenHash, token);
  const ctx = await auth.authenticate(token);
  assert.equal(ctx?.user.email, 'a@x.com'); assert.equal((ctx?.user as any).passwordHash, undefined); // nunca expõe o hash da senha
  assert.equal(await auth.authenticate('token-errado'), null); assert.equal(await auth.authenticate(undefined), null);
  await auth.logout(ctx!, meta.ip);
  assert.equal(await auth.authenticate(token), null);
  const again = await auth.login('a@x.com', PW, meta);
  advance(15 * 86_400_000); // 15 dias sem usar
  assert.equal(await auth.authenticate(again.token), null);
});

test('login: erro genérico e bloqueio após 5 tentativas erradas', async () => {
  const { auth, advance } = setup();
  await auth.setup({ name: 'Ana', email: 'a@x.com', password: PW }, meta);
  const wrongUser = await auth.login('nao@existe.com', 'qualquer-coisa-1', meta).catch((e) => e);
  const wrongPass = await auth.login('a@x.com', 'senha-errada-123', meta).catch((e) => e);
  assert.equal(wrongUser.message, wrongPass.message); // não revela se o e-mail existe
  for (let i = 0; i < 4; i++) await auth.login('a@x.com', 'senha-errada-123', meta).catch(() => undefined);
  const blocked = await auth.login('a@x.com', PW, meta).catch((e) => e); // mesmo com a senha certa, está bloqueado
  assert.equal(blocked.statusCode, 429);
  assert.equal((await auth.login('a@x.com', PW, { ...meta, ip: '9.9.9.9' })).user.email, 'a@x.com'); // outro IP não é afetado
  advance(70_000);
  assert.equal((await auth.login('a@x.com', PW, meta)).user.email, 'a@x.com');
});

test('trocar a senha desconecta os outros aparelhos e mantém este', async () => {
  const { auth } = setup();
  const first = await auth.setup({ name: 'Ana', email: 'a@x.com', password: PW }, meta);
  const second = await auth.login('a@x.com', PW, { ip: '5.5.5.5', userAgent: 'celular' });
  const ctx = (await auth.authenticate(first.token))!;
  await assert.rejects(auth.changePassword(ctx, 'senha-atual-errada', 'nova-senha-muito-boa', meta.ip), /incorreta/);
  await auth.changePassword(ctx, PW, 'nova-senha-muito-boa', meta.ip);
  assert.ok(await auth.authenticate(first.token));
  assert.equal(await auth.authenticate(second.token), null);
  assert.equal((await auth.listSessions(ctx)).length, 1);
});

test('reautenticação: ação crítica exige a senha e a janela expira em 5 minutos', async () => {
  const { auth, advance } = setup();
  const { token } = await auth.setup({ name: 'Ana', email: 'a@x.com', password: PW }, meta);
  const ctx = (await auth.authenticate(token))!;
  assert.throws(() => auth.requireReauth(ctx), (e: AppError) => e.statusCode === 403 && e.code === 'reauth_required');
  await assert.rejects(auth.reauth(ctx, 'errada-errada-1', meta.ip), /incorreta/);
  await auth.reauth(ctx, PW, meta.ip);
  assert.doesNotThrow(() => auth.requireReauth(ctx));
  advance(6 * 60_000);
  assert.throws(() => auth.requireReauth(ctx), /senha/);
});

test('auditoria registra o que aconteceu, sem senha nem token', async () => {
  const { auth, audits } = setup();
  const { token } = await auth.setup({ name: 'Ana', email: 'a@x.com', password: PW }, meta);
  await auth.login('a@x.com', 'errada-errada-1', meta).catch(() => undefined);
  await auth.logout((await auth.authenticate(token))!, meta.ip);
  assert.deepEqual(audits.map((a) => a.action), ['auth.setup', 'auth.login_failed', 'auth.logout']);
  const dump = JSON.stringify(audits);
  assert.ok(!dump.includes(PW) && !dump.includes('errada-errada-1') && !dump.includes(token));
  // auditar nunca derruba a operação que está sendo auditada
  const failing = new AuditService({ add: async () => { throw new Error('banco fora do ar'); }, list: async () => [] });
  await assert.doesNotReject(failing.record('u1', 'x'));
});

test('CSRF: só aceita o Origin do próprio servidor (inclusive atrás do proxy do Vite ou de um túnel)', () => {
  assert.equal(originAllowed('http://localhost:5173', { host: 'localhost:5173' }, []), true);                         // navegador -> Vite (host preservado)
  assert.equal(originAllowed('https://meu.tunel.dev', { host: 'localhost:3000', 'x-forwarded-host': 'meu.tunel.dev' }, []), true); // proxy reverso
  assert.equal(originAllowed('https://site-malicioso.com', { host: 'localhost:5173' }, []), false);
  assert.equal(originAllowed('http://localhost:5173', { host: 'localhost:3000' }, []), false);                        // host reescrito: por isso o Vite usa changeOrigin: false
  assert.equal(originAllowed('http://localhost:5173', { host: 'localhost:3000' }, ['http://localhost:5173']), true);  // liberado por ALLOWED_ORIGINS
  assert.equal(originAllowed('lixo', { host: 'x' }, []), false);
  assert.equal(originAllowed(undefined, { host: 'x' }, []), true);
});
