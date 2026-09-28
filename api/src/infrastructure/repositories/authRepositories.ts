import type { AuditEntry, AuditRepository, SessionRepository, SessionRow, User, UserRepository, UserRow } from '../../application/authPorts';
import type { Db } from '../db/pool';
import { mapRow, mapRows } from '../db/util';

export class PgUserRepository implements UserRepository {
  constructor(private db: Db) {}
  async count() { const { rows } = await this.db.query('SELECT count(*)::int AS n FROM users'); return rows[0].n as number; }
  async list() { const { rows } = await this.db.query('SELECT id, email, name, created_at FROM users ORDER BY created_at'); return mapRows<User>(rows); }
  async findByEmail(email: string) { const { rows } = await this.db.query('SELECT * FROM users WHERE email = $1', [email]); return mapRow<UserRow>(rows[0]); }
  async get(id: string) { const { rows } = await this.db.query('SELECT * FROM users WHERE id = $1', [id]); return mapRow<UserRow>(rows[0]); }
  async create(d: { email: string; name: string; passwordHash: string }) {
    const { rows } = await this.db.query('INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING *', [d.email, d.name, d.passwordHash]);
    return mapRow<UserRow>(rows[0]) as UserRow;
  }
  async setPassword(id: string, hash: string) { await this.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [id, hash]); }
}

export class PgSessionRepository implements SessionRepository {
  constructor(private db: Db) {}
  async create(d: { userId: string; tokenHash: string; userAgent: string; ip: string; expiresAt: Date }) {
    const { rows } = await this.db.query(
      'INSERT INTO sessions (user_id, token_hash, user_agent, ip, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [d.userId, d.tokenHash, d.userAgent, d.ip, d.expiresAt],
    );
    return mapRow<SessionRow>(rows[0]) as SessionRow;
  }
  async findByTokenHash(hash: string) { const { rows } = await this.db.query('SELECT * FROM sessions WHERE token_hash = $1', [hash]); return mapRow<SessionRow>(rows[0]); }
  async touch(id: string, lastSeenAt: Date, expiresAt: Date) { await this.db.query('UPDATE sessions SET last_seen_at = $2, expires_at = $3 WHERE id = $1', [id, lastSeenAt, expiresAt]); }
  async listActive(userId: string, now: Date) {
    const { rows } = await this.db.query('SELECT * FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2 ORDER BY last_seen_at DESC', [userId, now]);
    return mapRows<SessionRow>(rows);
  }
  async revoke(userId: string, id: string, now: Date) {
    const res = await this.db.query('UPDATE sessions SET revoked_at = $3 WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [id, userId, now]);
    return (res.rowCount ?? 0) > 0;
  }
  async revokeOthers(userId: string, keepId: string, now: Date) {
    await this.db.query('UPDATE sessions SET revoked_at = $3 WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL', [userId, keepId, now]);
  }
  async setReauth(id: string, until: Date | null) { await this.db.query('UPDATE sessions SET reauth_until = $2 WHERE id = $1', [id, until]); }
}

export class PgAuditRepository implements AuditRepository {
  constructor(private db: Db) {}
  async add(e: { userId: string | null; action: string; target: string; detail: Record<string, unknown>; ip: string }) {
    await this.db.query('INSERT INTO audit_log (user_id, action, target, detail, ip) VALUES ($1,$2,$3,$4::jsonb,$5)', [e.userId, e.action, e.target, JSON.stringify(e.detail), e.ip]);
  }
  async list(userId: string, limit: number) {
    const { rows } = await this.db.query('SELECT * FROM audit_log WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
    return mapRows<AuditEntry>(rows);
  }
}
