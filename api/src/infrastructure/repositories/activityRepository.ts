import type { ActivityRepository } from '../../application/ports';
import type { Activity, NewActivity } from '../../domain/entities';
import type { Db } from '../db/pool';
import { hhmm, mapRow, updateRow } from '../db/util';

const FIELDS = ['name', 'kind', 'timeMode', 'period', 'startTime', 'endTime', 'notBefore', 'notAfter', 'durationMin', 'suggestedStart', 'suggestedReason', 'purpose', 'principle', 'minDesc', 'idealDesc', 'maxDesc', 'weekdays', 'active', 'remindTime', 'remindChannels'] as const;

export const toActivity = (row: Record<string, any>): Activity => {
  const a = mapRow<Activity>(row) as Activity;
  return { ...a, startTime: hhmm(a.startTime), endTime: hhmm(a.endTime), notBefore: hhmm(a.notBefore), notAfter: hhmm(a.notAfter), suggestedStart: hhmm(a.suggestedStart), remindTime: hhmm(a.remindTime) };
};

export class PgActivityRepository implements ActivityRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query('SELECT * FROM activities ORDER BY created_at');
    return rows.map(toActivity);
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM activities WHERE id = $1', [id]);
    return rows[0] ? toActivity(rows[0]) : null;
  }

  async create(d: NewActivity) {
    const { rows } = await this.db.query(
      `INSERT INTO activities (name, kind, time_mode, period, start_time, end_time, not_before, not_after, duration_min, suggested_start, suggested_reason, purpose, principle, min_desc, ideal_desc, max_desc, weekdays, active, remind_time, remind_channels)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [d.name, d.kind, d.timeMode, d.period, d.startTime, d.endTime, d.notBefore, d.notAfter, d.durationMin, d.suggestedStart, d.suggestedReason, d.purpose, d.principle, d.minDesc, d.idealDesc, d.maxDesc, d.weekdays, d.active, d.remindTime, d.remindChannels],
    );
    return toActivity(rows[0]);
  }

  async update(id: string, patch: Partial<NewActivity>) {
    const row = await updateRow(this.db, 'activities', 'id', id, patch, FIELDS);
    return row ? toActivity(row) : null;
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM activities WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

