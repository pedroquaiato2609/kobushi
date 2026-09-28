export interface User { id: string; email: string; name: string; createdAt: Date }
export interface UserRow extends User { passwordHash: string }
export interface UserRepository {
  count(): Promise<number>;
  list(): Promise<User[]>;
  findByEmail(email: string): Promise<UserRow | null>;
  get(id: string): Promise<UserRow | null>;
  create(d: { email: string; name: string; passwordHash: string }): Promise<UserRow>;
  setPassword(id: string, hash: string): Promise<void>;
}

export interface SessionRow {
  id: string; userId: string; userAgent: string; ip: string;
  createdAt: Date; lastSeenAt: Date; expiresAt: Date; revokedAt: Date | null; reauthUntil: Date | null;
}
export interface SessionRepository {
  create(d: { userId: string; tokenHash: string; userAgent: string; ip: string; expiresAt: Date }): Promise<SessionRow>;
  findByTokenHash(hash: string): Promise<SessionRow | null>;
  touch(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void>;
  listActive(userId: string, now: Date): Promise<SessionRow[]>;
  revoke(userId: string, id: string, now: Date): Promise<boolean>;
  revokeOthers(userId: string, keepId: string, now: Date): Promise<void>;
  setReauth(id: string, until: Date | null): Promise<void>;
}

export interface AuditEntry { id: number; userId: string | null; action: string; target: string; detail: Record<string, unknown>; ip: string; createdAt: Date }
export interface AuditRepository {
  add(e: { userId: string | null; action: string; target: string; detail: Record<string, unknown>; ip: string }): Promise<void>;
  list(userId: string, limit: number): Promise<AuditEntry[]>;
}
