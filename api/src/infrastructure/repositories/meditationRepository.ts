import type { MeditationRepository } from '../../application/ports';
import type { MeditationSession, NewMeditation } from '../../domain/entities';
import type { Db } from '../db/pool';
import { mapRow, mapRows } from '../db/util';

export class PgMeditationRepository implements MeditationRepository {
  constructor(private db: Db) {}

  async list(from: string, to: string) {
    const { rows } = await this.db.query('SELECT * FROM meditation_sessions WHERE date BETWEEN $1 AND $2 ORDER BY date, created_at', [from, to]);
    return mapRows<MeditationSession>(rows);
  }

  async create(d: NewMeditation) {
    const { rows } = await this.db.query(
      `INSERT INTO meditation_sessions (date, duration_min, attention, spatial, sound, imagery, after_state, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [d.date, d.durationMin, d.attention, d.spatial, d.sound, d.imagery, d.afterState, d.note],
    );
    return mapRow<MeditationSession>(rows[0]) as MeditationSession;
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM meditation_sessions WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
