import type { ReviewRepository } from '../../application/ports';
import type { DailyReview, ReviewFields } from '../../domain/entities';
import type { Db } from '../db/pool';
import { mapRow, mapRows } from '../db/util';

export class PgReviewRepository implements ReviewRepository {
  constructor(private db: Db) {}

  async get(date: string) {
    const { rows } = await this.db.query('SELECT * FROM daily_reviews WHERE date = $1', [date]);
    return mapRow<DailyReview>(rows[0]);
  }

  async upsert(date: string, f: ReviewFields) {
    const { rows } = await this.db.query(
      `INSERT INTO daily_reviews (date, responsibilities, goals, state, learned)
       VALUES ($1, COALESCE($2, ''), COALESCE($3, ''), COALESCE($4, ''), COALESCE($5, ''))
       ON CONFLICT (date) DO UPDATE SET
         responsibilities = COALESCE($2, daily_reviews.responsibilities),
         goals = COALESCE($3, daily_reviews.goals),
         state = COALESCE($4, daily_reviews.state),
         learned = COALESCE($5, daily_reviews.learned),
         updated_at = now()
       RETURNING *`,
      [date, f.responsibilities ?? null, f.goals ?? null, f.state ?? null, f.learned ?? null],
    );
    return mapRow<DailyReview>(rows[0]) as DailyReview;
  }

  async list(from: string, to: string) {
    const { rows } = await this.db.query('SELECT * FROM daily_reviews WHERE date BETWEEN $1 AND $2 ORDER BY date DESC', [from, to]);
    return mapRows<DailyReview>(rows);
  }
}
