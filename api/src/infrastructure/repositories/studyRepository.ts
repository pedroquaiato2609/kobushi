import type { LinkedType, StudyFolder, StudyNote, StudyNoteBacklink, StudyNoteInput, StudyPlan, StudyPlanInput, StudyRepository } from '../../application/study/ports';
import type { Db } from '../db/pool';
import { mapRow, updateRow } from '../db/util';

const toNote = (r: Record<string, any>): StudyNote => {
  const n = mapRow<any>(r);
  return {
    id: n.id, title: n.title, content: n.content, linkedType: n.linkedType, linkedId: n.linkedId,
    folderId: n.folderId, pinned: n.pinned, tags: n.tags ?? [],
    archived: n.archived, createdAt: n.createdAt, updatedAt: n.updatedAt,
  };
};
const toFolder = (r: Record<string, any>): StudyFolder => { const f = mapRow<any>(r); return { id: f.id, name: f.name, createdAt: f.createdAt }; };
const toPlan = (r: Record<string, any>): StudyPlan => {
  const p = mapRow<any>(r);
  return { id: p.id, subject: p.subject, title: p.title, lessons: p.lessons ?? [], archived: p.archived, createdAt: p.createdAt, updatedAt: p.updatedAt };
};
/** Escapa % _ \ pra busca por ILIKE não interpretar entrada do usuário como coringa. */
const likeTerm = (q: string) => `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

export class PgStudyRepository implements StudyRepository {
  constructor(private db: Db) {}

  async saveImage(storage: string, mime: string) { await this.db.query('INSERT INTO study_images (storage, mime) VALUES ($1,$2)', [storage, mime]); }
  async imageMime(storage: string) { const { rows } = await this.db.query('SELECT mime FROM study_images WHERE storage = $1', [storage]); return rows[0]?.mime ?? null; }

  // ---- pastas ------------------------------------------------------------------------
  async listFolders() { const { rows } = await this.db.query('SELECT * FROM study_folders ORDER BY lower(name)'); return rows.map(toFolder); }
  async createFolder(name: string) { const { rows } = await this.db.query('INSERT INTO study_folders (name) VALUES ($1) RETURNING *', [name]); return toFolder(rows[0]); }
  async renameFolder(id: string, name: string) {
    const { rows } = await this.db.query('UPDATE study_folders SET name = $2 WHERE id = $1 RETURNING *', [id, name]);
    return rows[0] ? toFolder(rows[0]) : null;
  }
  async deleteFolder(id: string) { const r = await this.db.query('DELETE FROM study_folders WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }

  // ---- notas -----------------------------------------------------------------------
  async listNotes(f: { linkedType?: LinkedType; linkedId?: string; folderId?: string; tag?: string; pinned?: boolean; query?: string; includeArchived?: boolean }) {
    const where: string[] = []; const params: unknown[] = [];
    if (!f.includeArchived) where.push('archived = false');
    if (f.linkedType) { params.push(f.linkedType); where.push(`linked_type = $${params.length}`); }
    if (f.linkedId) { params.push(f.linkedId); where.push(`linked_id = $${params.length}`); }
    if (f.folderId) { params.push(f.folderId); where.push(`folder_id = $${params.length}`); }
    if (f.tag) { params.push(f.tag); where.push(`$${params.length} = ANY(tags)`); }
    if (f.pinned) where.push('pinned = true');
    if (f.query) { params.push(likeTerm(f.query)); where.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`); }
    const { rows } = await this.db.query(
      `SELECT * FROM study_notes ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY pinned DESC, updated_at DESC`,
      params,
    );
    return rows.map(toNote);
  }
  async getNote(id: string) { const { rows } = await this.db.query('SELECT * FROM study_notes WHERE id = $1', [id]); return rows[0] ? toNote(rows[0]) : null; }
  async createNote(d: StudyNoteInput) {
    const { rows } = await this.db.query(
      'INSERT INTO study_notes (title, content, linked_type, linked_id, folder_id, pinned, tags) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [d.title, d.content, d.linkedType, d.linkedId, d.folderId, d.pinned, d.tags],
    );
    return toNote(rows[0]);
  }
  async updateNote(id: string, patch: Partial<StudyNoteInput & { archived: boolean }>) {
    const row = await updateRow(this.db, 'study_notes', 'id', id, patch, ['title', 'content', 'linkedType', 'linkedId', 'folderId', 'pinned', 'tags', 'archived']);
    return row ? toNote(row) : null;
  }
  async deleteNote(id: string) { const r = await this.db.query('DELETE FROM study_notes WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }

  // ---- links nota-a-nota ---------------------------------------------------------------
  async setNoteLinks(fromNote: string, toNotes: string[]) {
    await this.db.query('DELETE FROM study_note_links WHERE from_note = $1', [fromNote]);
    if (toNotes.length === 0) return;
    const values = toNotes.map((_, i) => `($1, $${i + 2})`).join(', ');
    await this.db.query(`INSERT INTO study_note_links (from_note, to_note) VALUES ${values} ON CONFLICT DO NOTHING`, [fromNote, ...toNotes]);
  }
  async linkedNoteIds(fromNote: string) {
    const { rows } = await this.db.query('SELECT to_note FROM study_note_links WHERE from_note = $1', [fromNote]);
    return rows.map((r) => r.to_note as string);
  }
  async backlinks(toNote: string): Promise<StudyNoteBacklink[]> {
    const { rows } = await this.db.query(
      `SELECT n.id, n.title FROM study_note_links l JOIN study_notes n ON n.id = l.from_note WHERE l.to_note = $1 ORDER BY n.title`,
      [toNote],
    );
    return rows.map((r) => ({ id: r.id as string, title: r.title as string }));
  }
  async allTags() {
    const { rows } = await this.db.query('SELECT DISTINCT unnest(tags) AS tag FROM study_notes ORDER BY 1');
    return rows.map((r) => r.tag as string);
  }

  // ---- planos de estudo ----------------------------------------------------------------
  async listPlans(includeArchived = false) {
    const { rows } = await this.db.query(`SELECT * FROM study_plans ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY updated_at DESC`);
    return rows.map(toPlan);
  }
  async getPlan(id: string) { const { rows } = await this.db.query('SELECT * FROM study_plans WHERE id = $1', [id]); return rows[0] ? toPlan(rows[0]) : null; }
  async createPlan(d: StudyPlanInput) {
    const { rows } = await this.db.query(
      'INSERT INTO study_plans (subject, title, lessons) VALUES ($1,$2,$3::jsonb) RETURNING *',
      [d.subject, d.title, JSON.stringify(d.lessons)],
    );
    return toPlan(rows[0]);
  }
  async updatePlan(id: string, patch: Partial<StudyPlanInput & { archived: boolean }>) {
    const { lessons, ...rest } = patch;
    if (lessons !== undefined) {
      await this.db.query('UPDATE study_plans SET lessons = $2::jsonb, updated_at = now() WHERE id = $1', [id, JSON.stringify(lessons)]);
    }
    const row = await updateRow(this.db, 'study_plans', 'id', id, rest, ['subject', 'title', 'archived']);
    return row ? toPlan(row) : null;
  }
  async deletePlan(id: string) { const r = await this.db.query('DELETE FROM study_plans WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }
}
