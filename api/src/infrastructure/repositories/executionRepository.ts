import type { ExecutionRepository } from '../../application/ports';
import type { Level } from '../../domain/constants';
import type { DayPlanItem, Execution } from '../../domain/entities';
import type { Db } from '../db/pool';
import { hhmm, mapRow, mapRows } from '../db/util';
import { toActivity } from './activityRepository';

const KIND_ORDER = { obligation: 0, goal: 1, special: 2 } as const;
const PERIOD_ORDER = { morning: 0, afternoon: 1, night: 2 } as const;

export class PgExecutionRepository implements ExecutionRepository {
  constructor(private db: Db) {}

  async dayPlan(date: string, weekday: number): Promise<DayPlanItem[]> {
    const { rows } = await this.db.query(
      `SELECT a.*, e.level AS exec_level, e.note AS exec_note
         FROM activities a
         LEFT JOIN activity_executions e ON e.activity_id = a.id AND e.date = $1
        WHERE a.active AND $2 = ANY (a.weekdays)`,
      [date, weekday],
    );
    // Bloco(s) efetivos de cada atividade NESSE dia: os deste weekday se houver exceção, senão os padrão (weekday NULL).
    const { rows: blockRows } = await this.db.query(
      'SELECT * FROM activity_time_blocks WHERE activity_id = ANY($1) AND (weekday IS NULL OR weekday = $2) ORDER BY position',
      [rows.map((r) => r.id), weekday],
    );
    const byActivity = new Map<string, Record<string, any>[]>();
    for (const r of blockRows) { const list = byActivity.get(r.activity_id) ?? []; list.push(r); byActivity.set(r.activity_id, list); }

    const items = rows.map(({ exec_level, exec_note, ...row }) => {
      const all = byActivity.get(row.id) ?? [];
      const dayRows = all.filter((r) => r.weekday === weekday);
      const blocks = (dayRows.length > 0 ? dayRows : all.filter((r) => r.weekday === null))
        .map((r) => ({ startTime: hhmm(r.start_time) as string, endTime: hhmm(r.end_time) }));
      return {
        ...toActivity(row, blocks, []),
        executionLevel: (exec_level ?? null) as Level | null,
        executionNote: (exec_note ?? '') as string,
      };
    });

    items.sort((a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
      || (a.blocks[0]?.startTime ?? '￿').localeCompare(b.blocks[0]?.startTime ?? '￿')
      || (a.period ? PERIOD_ORDER[a.period] : 3) - (b.period ? PERIOD_ORDER[b.period] : 3)
      || a.createdAt.getTime() - b.createdAt.getTime());
    return items;
  }

  async upsert(activityId: string, date: string, level: Level, note?: string): Promise<Execution> {
    const { rows } = await this.db.query(
      `INSERT INTO activity_executions (activity_id, date, level, note)
       VALUES ($1, $2, $3, COALESCE($4, ''))
       ON CONFLICT (activity_id, date)
       DO UPDATE SET level = EXCLUDED.level,
                     note = COALESCE($4, activity_executions.note),
                     updated_at = now()
       RETURNING *`,
      [activityId, date, level, note ?? null],
    );
    return mapRow<Execution>(rows[0]) as Execution;
  }

  async clear(activityId: string, date: string) {
    const res = await this.db.query('DELETE FROM activity_executions WHERE activity_id = $1 AND date = $2', [activityId, date]);
    return (res.rowCount ?? 0) > 0;
  }

  async listRange(from: string, to: string) {
    const { rows } = await this.db.query('SELECT * FROM activity_executions WHERE date BETWEEN $1 AND $2 ORDER BY date', [from, to]);
    return mapRows<Execution>(rows);
  }
}
