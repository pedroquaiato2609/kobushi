import type { EventRepository } from '../../application/ports';
import type { CalendarEvent, NewEvent } from '../../domain/entities';
import type { Db } from '../db/pool';
import { localTs, updateRow } from '../db/util';

const toEvent = (r: Record<string, any>): CalendarEvent => ({
  id: r.id,
  title: r.title,
  description: r.description,
  start: localTs(r.starts_at),
  end: localTs(r.ends_at),
  activityId: r.activity_id,
  location: r.location,
  remindMinutes: r.remind_minutes,
  remindChannels: r.remind_channels ?? [],
  createdAt: r.created_at,
});

export class PgEventRepository implements EventRepository {
  constructor(private db: Db) {}

  async list(from: string, to: string) {
    const { rows } = await this.db.query(
      'SELECT * FROM events WHERE starts_at < $2::timestamp AND ends_at > $1::timestamp ORDER BY starts_at, ends_at',
      [from, to],
    );
    return rows.map(toEvent);
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM events WHERE id = $1', [id]);
    return rows[0] ? toEvent(rows[0]) : null;
  }

  async create(d: NewEvent) {
    const { rows } = await this.db.query(
      'INSERT INTO events (title, description, starts_at, ends_at, activity_id, location, remind_minutes, remind_channels) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [d.title, d.description, d.start, d.end, d.activityId, d.location, d.remindMinutes, d.remindChannels],
    );
    return toEvent(rows[0]);
  }

  async update(id: string, patch: Partial<NewEvent>) {
    // nomes públicos (start/end) -> colunas (starts_at/ends_at)
    const { start, end, ...rest } = patch;
    const row = await updateRow(this.db, 'events', 'id', id, { ...rest, startsAt: start, endsAt: end }, ['title', 'description', 'startsAt', 'endsAt', 'activityId', 'location', 'remindMinutes', 'remindChannels']);
    return row ? toEvent(row) : null;
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM events WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async reminderDue(nowLocal: string) {
    const { rows } = await this.db.query(
      `SELECT * FROM events
        WHERE remind_minutes IS NOT NULL AND starts_at > $1::timestamp
          AND starts_at - make_interval(mins => remind_minutes) <= $1::timestamp`,
      [nowLocal],
    );
    return rows.map(toEvent);
  }
}
