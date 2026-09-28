import type { Book, BookInput, BookStatus, ReadingRepository, ReadingSession, SessionInput } from '../../application/reading/ports';
import type { Db } from '../db/pool';
import { mapRow, updateRow } from '../db/util';

const toBook = (r: Record<string, any>): Book => {
  const b = mapRow<any>(r);
  return {
    id: b.id, title: b.title, author: b.author, isbn: b.isbn, coverUrl: b.coverUrl, publisher: b.publisher,
    format: b.format, status: b.status, totalPages: b.totalPages, currentPage: b.currentPage, rating: b.rating,
    notes: b.notes ?? '', startedAt: b.startedAt, finishedAt: b.finishedAt, archived: b.archived, createdAt: b.createdAt, updatedAt: b.updatedAt,
  };
};
const toSession = (r: Record<string, any>): ReadingSession => {
  const s = mapRow<any>(r);
  return { id: s.id, bookId: s.bookId, date: s.date, pages: s.pages, minutes: s.minutes, note: s.note, createdAt: s.createdAt };
};

export class PgReadingRepository implements ReadingRepository {
  constructor(private db: Db) {}

  async listBooks(f: { status?: BookStatus; includeArchived?: boolean }) {
    const where: string[] = []; const params: unknown[] = [];
    if (!f.includeArchived) where.push('archived = false');
    if (f.status) { params.push(f.status); where.push(`status = $${params.length}`); }
    const { rows } = await this.db.query(
      `SELECT * FROM reading_books ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`, params,
    );
    return rows.map(toBook);
  }
  async getBook(id: string) { const { rows } = await this.db.query('SELECT * FROM reading_books WHERE id = $1', [id]); return rows[0] ? toBook(rows[0]) : null; }
  async createBook(d: BookInput) {
    const { rows } = await this.db.query(
      `INSERT INTO reading_books (title, author, isbn, cover_url, publisher, format, status, total_pages, started_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [d.title, d.author, d.isbn, d.coverUrl, d.publisher, d.format, d.status, d.totalPages, d.startedAt],
    );
    return toBook(rows[0]);
  }
  async updateBook(id: string, patch: Partial<BookInput & { currentPage: number; rating: number | null; notes: string; startedAt: string | null; finishedAt: string | null; archived: boolean }>) {
    const row = await updateRow(this.db, 'reading_books', 'id', id, patch, [
      'title', 'author', 'isbn', 'coverUrl', 'publisher', 'format', 'status', 'totalPages', 'currentPage', 'rating', 'notes', 'startedAt', 'finishedAt', 'archived',
    ]);
    return row ? toBook(row) : null;
  }
  async deleteBook(id: string) { const r = await this.db.query('DELETE FROM reading_books WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }
  async coverImageOf(id: string) {
    const { rows } = await this.db.query('SELECT cover_storage, cover_mime FROM reading_books WHERE id = $1', [id]);
    return rows[0]?.cover_storage ? { storage: rows[0].cover_storage, mime: rows[0].cover_mime } : null;
  }
  async setCoverImage(id: string, img: { storage: string; mime: string } | null) {
    await this.db.query('UPDATE reading_books SET cover_storage = $2, cover_mime = $3, updated_at = now() WHERE id = $1', [id, img?.storage ?? null, img?.mime ?? null]);
  }

  async listSessions(bookId: string, limit = 200) {
    const { rows } = await this.db.query('SELECT * FROM reading_sessions WHERE book_id = $1 ORDER BY date DESC, created_at DESC LIMIT $2', [bookId, limit]);
    return rows.map(toSession);
  }
  async createSession(bookId: string, d: SessionInput) {
    const { rows } = await this.db.query(
      'INSERT INTO reading_sessions (book_id, date, pages, minutes, note) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [bookId, d.date, d.pages, d.minutes, d.note],
    );
    return toSession(rows[0]);
  }
  async deleteSession(id: string) {
    const { rows } = await this.db.query('DELETE FROM reading_sessions WHERE id = $1 RETURNING *', [id]);
    return rows[0] ? toSession(rows[0]) : null;
  }
  async sessionsInRange(from: string, to: string) {
    const { rows } = await this.db.query('SELECT * FROM reading_sessions WHERE date BETWEEN $1 AND $2 ORDER BY date', [from, to]);
    return rows.map(toSession);
  }
  async pagesOnDate(date: string) {
    const { rows } = await this.db.query('SELECT COALESCE(sum(pages), 0)::int AS total FROM reading_sessions WHERE date = $1', [date]);
    return rows[0].total as number;
  }
  async sessionDates(sinceDays: number) {
    const { rows } = await this.db.query(
      `SELECT DISTINCT date AS d FROM reading_sessions WHERE date > current_date - make_interval(days => $1) ORDER BY 1`, [sinceDays],
    );
    return rows.map((r) => r.d as string);
  }
}
