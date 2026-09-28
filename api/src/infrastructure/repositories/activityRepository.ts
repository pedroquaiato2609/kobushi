import type { ActivityRepository } from '../../application/ports';
import type { Activity, NewActivity, WeekdayTime } from '../../domain/entities';
import type { Db } from '../db/pool';
import { withTx } from '../db/pool';
import { hhmm, mapRow, updateRow } from '../db/util';

const FIELDS = ['name', 'kind', 'timeMode', 'period', 'startTime', 'endTime', 'notBefore', 'notAfter', 'durationMin', 'suggestedStart', 'suggestedReason', 'purpose', 'principle', 'minDesc', 'idealDesc', 'maxDesc', 'weekdays', 'active', 'remindTime', 'remindChannels'] as const;

export const toActivity = (row: Record<string, any>, weekdayTimes: WeekdayTime[] = []): Activity => {
  const a = mapRow<Activity>(row) as Activity;
  return { ...a, startTime: hhmm(a.startTime), endTime: hhmm(a.endTime), notBefore: hhmm(a.notBefore), notAfter: hhmm(a.notAfter), suggestedStart: hhmm(a.suggestedStart), remindTime: hhmm(a.remindTime), weekdayTimes };
};
const toWeekdayTime = (row: Record<string, any>): WeekdayTime => {
  const w = mapRow<any>(row);
  return { weekday: w.weekday, startTime: hhmm(w.startTime) as string, endTime: hhmm(w.endTime) };
};

/** Regrava do zero as exceções de horário por dia de uma atividade (lista pequena, mais simples que diff). */
async function replaceWeekdayTimes(db: Db, activityId: string, times: WeekdayTime[]) {
  await db.query('DELETE FROM activity_weekday_times WHERE activity_id = $1', [activityId]);
  for (const t of times) {
    await db.query('INSERT INTO activity_weekday_times (activity_id, weekday, start_time, end_time) VALUES ($1,$2,$3,$4)', [activityId, t.weekday, t.startTime, t.endTime]);
  }
}

export class PgActivityRepository implements ActivityRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query('SELECT * FROM activities ORDER BY created_at');
    const { rows: wtRows } = await this.db.query('SELECT * FROM activity_weekday_times WHERE activity_id = ANY($1)', [rows.map((r) => r.id)]);
    const byActivity = new Map<string, WeekdayTime[]>();
    for (const r of wtRows) {
      const list = byActivity.get(r.activity_id) ?? [];
      list.push(toWeekdayTime(r));
      byActivity.set(r.activity_id, list);
    }
    return rows.map((r) => toActivity(r, byActivity.get(r.id) ?? []));
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM activities WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const { rows: wtRows } = await this.db.query('SELECT * FROM activity_weekday_times WHERE activity_id = $1 ORDER BY weekday', [id]);
    return toActivity(rows[0], wtRows.map(toWeekdayTime));
  }

  async create(d: NewActivity) {
    return withTx(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO activities (name, kind, time_mode, period, start_time, end_time, not_before, not_after, duration_min, suggested_start, suggested_reason, purpose, principle, min_desc, ideal_desc, max_desc, weekdays, active, remind_time, remind_channels)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
        [d.name, d.kind, d.timeMode, d.period, d.startTime, d.endTime, d.notBefore, d.notAfter, d.durationMin, d.suggestedStart, d.suggestedReason, d.purpose, d.principle, d.minDesc, d.idealDesc, d.maxDesc, d.weekdays, d.active, d.remindTime, d.remindChannels],
      );
      await replaceWeekdayTimes(tx, rows[0].id, d.weekdayTimes);
      return toActivity(rows[0], d.weekdayTimes);
    });
  }

  async update(id: string, patch: Partial<NewActivity>) {
    return withTx(async (tx) => {
      const row = await updateRow(tx, 'activities', 'id', id, patch, FIELDS);
      if (!row) return null;
      if (patch.weekdayTimes !== undefined) await replaceWeekdayTimes(tx, id, patch.weekdayTimes);
      const { rows: wtRows } = await tx.query('SELECT * FROM activity_weekday_times WHERE activity_id = $1 ORDER BY weekday', [id]);
      return toActivity(row, wtRows.map(toWeekdayTime));
    });
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM activities WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
