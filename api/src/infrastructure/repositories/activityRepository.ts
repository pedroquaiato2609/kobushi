import type { ActivityRepository } from '../../application/ports';
import type { Activity, NewActivity, TimeBlock, WeekdayBlocks } from '../../domain/entities';
import type { Db } from '../db/pool';
import { withTx } from '../db/pool';
import { hhmm, mapRow, updateRow } from '../db/util';

const FIELDS = ['name', 'kind', 'timeMode', 'period', 'notBefore', 'notAfter', 'durationMin', 'suggestedStart', 'suggestedReason', 'purpose', 'principle', 'minDesc', 'idealDesc', 'maxDesc', 'weekdays', 'active', 'remindTime', 'remindChannels'] as const;

export const toActivity = (row: Record<string, any>, blocks: TimeBlock[] = [], weekdayBlocks: WeekdayBlocks[] = []): Activity => {
  const a = mapRow<Activity>(row) as Activity;
  return { ...a, notBefore: hhmm(a.notBefore), notAfter: hhmm(a.notAfter), suggestedStart: hhmm(a.suggestedStart), remindTime: hhmm(a.remindTime), blocks, weekdayBlocks };
};

/** Junta as linhas de activity_time_blocks (weekday NULL = padrão, senão exceção daquele dia) de UMA atividade. */
export function groupBlocks(rows: Record<string, any>[]): { blocks: TimeBlock[]; weekdayBlocks: WeekdayBlocks[] } {
  const blocks: TimeBlock[] = [];
  const byDay = new Map<number, TimeBlock[]>();
  for (const r of rows.sort((a, b) => a.position - b.position)) {
    const block: TimeBlock = { startTime: hhmm(r.start_time) as string, endTime: hhmm(r.end_time) };
    if (r.weekday === null) blocks.push(block);
    else { const list = byDay.get(r.weekday) ?? []; list.push(block); byDay.set(r.weekday, list); }
  }
  const weekdayBlocks = [...byDay.entries()].sort(([a], [b]) => a - b).map(([weekday, blocks]) => ({ weekday, blocks }));
  return { blocks, weekdayBlocks };
}

/** Regrava do zero os blocos de horário (padrão + exceções por dia) de uma atividade — lista pequena, mais simples que diff. */
async function replaceTimeBlocks(db: Db, activityId: string, blocks: TimeBlock[], weekdayBlocks: WeekdayBlocks[]) {
  await db.query('DELETE FROM activity_time_blocks WHERE activity_id = $1', [activityId]);
  const rows: { weekday: number | null; position: number; startTime: string; endTime: string | null }[] = [
    ...blocks.map((b, i) => ({ weekday: null, position: i, startTime: b.startTime, endTime: b.endTime })),
    ...weekdayBlocks.flatMap((w) => w.blocks.map((b, i) => ({ weekday: w.weekday, position: i, startTime: b.startTime, endTime: b.endTime }))),
  ];
  for (const r of rows) {
    await db.query('INSERT INTO activity_time_blocks (activity_id, weekday, position, start_time, end_time) VALUES ($1,$2,$3,$4,$5)', [activityId, r.weekday, r.position, r.startTime, r.endTime]);
  }
}

export class PgActivityRepository implements ActivityRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query('SELECT * FROM activities ORDER BY created_at');
    const { rows: blockRows } = await this.db.query('SELECT * FROM activity_time_blocks WHERE activity_id = ANY($1)', [rows.map((r) => r.id)]);
    const byActivity = new Map<string, Record<string, any>[]>();
    for (const r of blockRows) { const list = byActivity.get(r.activity_id) ?? []; list.push(r); byActivity.set(r.activity_id, list); }
    return rows.map((r) => { const { blocks, weekdayBlocks } = groupBlocks(byActivity.get(r.id) ?? []); return toActivity(r, blocks, weekdayBlocks); });
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM activities WHERE id = $1', [id]);
    if (!rows[0]) return null;
    const { rows: blockRows } = await this.db.query('SELECT * FROM activity_time_blocks WHERE activity_id = $1', [id]);
    const { blocks, weekdayBlocks } = groupBlocks(blockRows);
    return toActivity(rows[0], blocks, weekdayBlocks);
  }

  async create(d: NewActivity) {
    return withTx(async (tx) => {
      const { rows } = await tx.query(
        `INSERT INTO activities (name, kind, time_mode, period, not_before, not_after, duration_min, suggested_start, suggested_reason, purpose, principle, min_desc, ideal_desc, max_desc, weekdays, active, remind_time, remind_channels)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [d.name, d.kind, d.timeMode, d.period, d.notBefore, d.notAfter, d.durationMin, d.suggestedStart, d.suggestedReason, d.purpose, d.principle, d.minDesc, d.idealDesc, d.maxDesc, d.weekdays, d.active, d.remindTime, d.remindChannels],
      );
      await replaceTimeBlocks(tx, rows[0].id, d.blocks, d.weekdayBlocks);
      return toActivity(rows[0], d.blocks, d.weekdayBlocks);
    });
  }

  async update(id: string, patch: Partial<NewActivity>) {
    return withTx(async (tx) => {
      const row = await updateRow(tx, 'activities', 'id', id, patch, FIELDS);
      if (!row) return null;
      if (patch.blocks !== undefined || patch.weekdayBlocks !== undefined) {
        const current = groupBlocks((await tx.query('SELECT * FROM activity_time_blocks WHERE activity_id = $1', [id])).rows);
        await replaceTimeBlocks(tx, id, patch.blocks ?? current.blocks, patch.weekdayBlocks ?? current.weekdayBlocks);
      }
      const { rows: blockRows } = await tx.query('SELECT * FROM activity_time_blocks WHERE activity_id = $1', [id]);
      const { blocks, weekdayBlocks } = groupBlocks(blockRows);
      return toActivity(row, blocks, weekdayBlocks);
    });
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM activities WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
