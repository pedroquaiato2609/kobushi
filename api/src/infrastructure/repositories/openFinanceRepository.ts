import type { OfConnection, OpenFinanceRepository } from '../../application/openFinance/types';
import type { Db } from '../db/pool';
import { mapRow, mapRows } from '../db/util';

const PATCH_COLS = { status: 'status', institution: 'institution', consentExpiresAt: 'consent_expires_at', lastSyncAt: 'last_sync_at', lastError: 'last_error', revokedAt: 'revoked_at' } as const;

export class PgOpenFinanceRepository implements OpenFinanceRepository {
  constructor(private db: Db) {}
  async list(userId: string) { const { rows } = await this.db.query('SELECT * FROM of_connections WHERE user_id = $1 ORDER BY created_at', [userId]); return mapRows<OfConnection>(rows); }
  async listAllActive() { const { rows } = await this.db.query(`SELECT * FROM of_connections WHERE status <> 'revoked'`); return mapRows<OfConnection>(rows); }
  async get(userId: string, id: string) { const { rows } = await this.db.query('SELECT * FROM of_connections WHERE id = $1 AND user_id = $2', [id, userId]); return mapRow<OfConnection>(rows[0]); }
  async create(userId: string, d: Pick<OfConnection, 'provider' | 'institution' | 'itemEnc' | 'consentExpiresAt'>) {
    const { rows } = await this.db.query('INSERT INTO of_connections (user_id, provider, institution, item_enc, consent_expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *', [userId, d.provider, d.institution, d.itemEnc, d.consentExpiresAt]);
    return mapRow<OfConnection>(rows[0]) as OfConnection;
  }
  async update(userId: string, id: string, patch: Parameters<OpenFinanceRepository['update']>[2]) {
    const keys = (Object.keys(patch) as (keyof typeof PATCH_COLS)[]).filter((k) => PATCH_COLS[k] && (patch as Record<string, unknown>)[k] !== undefined);
    if (!keys.length) return this.get(userId, id);
    const { rows } = await this.db.query(`UPDATE of_connections SET ${keys.map((k, i) => `${PATCH_COLS[k]} = $${i + 3}`).join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId, ...keys.map((k) => (patch as Record<string, unknown>)[k])]);
    return mapRow<OfConnection>(rows[0]);
  }
  async delete(userId: string, id: string) { const r = await this.db.query('DELETE FROM of_connections WHERE id = $1 AND user_id = $2', [id, userId]); return (r.rowCount ?? 0) > 0; }

  async seenMany(userId: string, keys: { accountId: string; externalId: string }[]) {
    const out = new Map<string, string | null>();
    if (!keys.length) return out;
    const { rows } = await this.db.query(
      'SELECT account_id, external_id, tx_id FROM of_seen WHERE user_id = $1 AND account_id = ANY($2::uuid[]) AND external_id = ANY($3::text[])',
      [userId, [...new Set(keys.map((k) => k.accountId))], [...new Set(keys.map((k) => k.externalId))]],
    );
    for (const r of rows) out.set(`${r.account_id}|${r.external_id}`, (r.tx_id as string | null) ?? null);
    return out;
  }
  async seenAdd(userId: string, accountId: string, externalId: string, txId: string | null) {
    await this.db.query('INSERT INTO of_seen (user_id, account_id, external_id, tx_id) VALUES ($1,$2,$3,$4) ON CONFLICT (account_id, external_id) DO UPDATE SET tx_id = COALESCE(EXCLUDED.tx_id, of_seen.tx_id)', [userId, accountId, externalId, txId]);
  }
}
