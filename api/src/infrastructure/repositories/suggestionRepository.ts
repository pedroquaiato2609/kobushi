import type { AssistantSettings, Candidate, Suggestion, SuggestionRepository, SuggestionStatus } from '../../application/suggestions';
import type { Db } from '../db/pool';
import { hhmm, mapRow, mapRows } from '../db/util';

const toSettings = (r: Record<string, any>): AssistantSettings => ({
  proactivity: r.proactivity, types: r.types, maxPerDay: r.max_per_day, quietStart: hhmm(r.quiet_start) as string, quietEnd: hhmm(r.quiet_end) as string,
  dailyReviewTime: hhmm(r.daily_review_time), weeklyReviewTime: hhmm(r.weekly_review_time),
});
const COLS: Record<keyof AssistantSettings, string> = {
  proactivity: 'proactivity', types: 'types', maxPerDay: 'max_per_day', quietStart: 'quiet_start', quietEnd: 'quiet_end', dailyReviewTime: 'daily_review_time', weeklyReviewTime: 'weekly_review_time',
};

export class PgSuggestionRepository implements SuggestionRepository {
  constructor(private db: Db) {}

  async getSettings(userId: string) {
    await this.db.query('INSERT INTO assistant_settings (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
    const { rows } = await this.db.query('SELECT * FROM assistant_settings WHERE user_id = $1', [userId]);
    return toSettings(rows[0]);
  }
  async updateSettings(userId: string, patch: Partial<AssistantSettings>) {
    await this.getSettings(userId);
    const keys = (Object.keys(patch) as (keyof AssistantSettings)[]).filter((k) => patch[k] !== undefined && COLS[k]);
    if (keys.length) {
      await this.db.query(`UPDATE assistant_settings SET ${keys.map((k, i) => `${COLS[k]} = $${i + 2}`).join(', ')} WHERE user_id = $1`, [userId, ...keys.map((k) => patch[k])]);
    }
    return this.getSettings(userId);
  }
  async list(userId: string) {
    const { rows } = await this.db.query('SELECT * FROM suggestions WHERE user_id = $1 ORDER BY created_at DESC', [userId]);
    return mapRows<Suggestion>(rows);
  }
  async create(userId: string, c: Candidate) {
    const { rows } = await this.db.query(
      `INSERT INTO suggestions (user_id, key, type, severity, title, reason, data, actions, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
       ON CONFLICT (user_id, key) DO UPDATE SET key = EXCLUDED.key RETURNING *`,
      [userId, c.key, c.type, c.severity, c.title, c.reason, JSON.stringify(c.data), JSON.stringify(c.actions), c.expiresAt],
    );
    return mapRow<Suggestion>(rows[0]) as Suggestion;
  }
  async setStatus(userId: string, id: string, status: SuggestionStatus, snoozeUntil: Date | null = null) {
    const { rows } = await this.db.query(
      `UPDATE suggestions SET status = $3, snooze_until = $4, resolved_at = CASE WHEN $3 IN ('accepted','dismissed') THEN now() ELSE resolved_at END WHERE id = $1 AND user_id = $2 RETURNING *`,
      [id, userId, status, snoozeUntil],
    );
    return mapRow<Suggestion>(rows[0]);
  }
}
