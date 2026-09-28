import type { ExecutionRepository } from '../../application/ports';
import type { Level } from '../../domain/constants';
import type { DayPlanItem, Execution } from '../../domain/entities';
import type { Db } from '../db/pool';
import { mapRow, mapRows } from '../db/util';
import { toActivity } from './activityRepository';

export class PgExecutionRepository implements ExecutionRepository {
  constructor(private db: Db) {}

  async dayPlan(date: string, weekday: number): Promise<DayPlanItem[]> {
    const { rows } = await this.db.query(
      `SELECT a.*, e.level AS exec_level, e.note AS exec_note
         FROM activities a
         LEFT JOIN activity_executions e ON e.activity_id = a.id AND e.date = $1
        WHERE a.active AND $2 = ANY (a.weekdays)
        ORDER BY CASE a.kind WHEN 'obligation' THEN 0 WHEN 'goal' THEN 1 ELSE 2 END,
                 a.start_time NULLS LAST,
                 CASE a.period WHEN 'morning' THEN 0 WHEN 'afternoon' THEN 1 WHEN 'night' THEN 2 ELSE 3 END,
                 a.created_at`,
      [date, weekday],
    );
    return rows.map(({ exec_level, exec_note, ...row }) => ({
      ...toActivity(row),
      executionLevel: (exec_level ?? null) as Level | null,
      executionNote: (exec_note ?? '') as string,
    }));
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
