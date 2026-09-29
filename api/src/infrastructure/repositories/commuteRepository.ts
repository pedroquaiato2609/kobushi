import type { CommuteRepository } from '../../application/ports';
import type { Commute, NewCommute } from '../../domain/entities';
import type { Db } from '../db/pool';
import { hhmm, updateRow } from '../db/util';

const toCommute = (r: Record<string, any>): Commute => ({
  id: r.id,
  name: r.name,
  activityId: r.activity_id,
  direction: r.direction,
  durationMin: r.duration_min,
  active: r.active,
  remindTime: hhmm(r.remind_time),
  remindMinutes: r.remind_minutes,
  remindChannels: r.remind_channels ?? [],
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export class PgCommuteRepository implements CommuteRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query('SELECT * FROM commutes ORDER BY name');
    return rows.map(toCommute);
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM commutes WHERE id = $1', [id]);
    return rows[0] ? toCommute(rows[0]) : null;
  }

  async create(d: NewCommute) {
    const { rows } = await this.db.query(
      `INSERT INTO commutes (name, activity_id, direction, duration_min, active, remind_time, remind_minutes, remind_channels)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.name, d.activityId, d.direction, d.durationMin, d.active, d.remindTime, d.remindMinutes, d.remindChannels],
    );
    return toCommute(rows[0]);
  }

  async update(id: string, patch: Partial<NewCommute>) {
    const row = await updateRow(this.db, 'commutes', 'id', id, patch, ['name', 'activityId', 'direction', 'durationMin', 'active', 'remindTime', 'remindMinutes', 'remindChannels']);
    return row ? toCommute(row) : null;
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM commutes WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
