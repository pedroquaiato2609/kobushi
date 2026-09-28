import type { NotifyChannel } from '../../domain/constants';
import type { PrincipleFolder, PrincipleReminder, StoredPrinciple } from '../../domain/entities';
import type { PrincipleRepository } from '../../application/ports';
import type { Db } from '../db/pool';
import { mapRow, updateRow } from '../db/util';

const toFolder = (r: Record<string, any>): PrincipleFolder => {
  const f = mapRow<any>(r);
  const reminder: PrincipleReminder = {
    enabled: f.reminderEnabled,
    times: f.reminderTimes ?? [],
    weekdays: f.reminderWeekdays ?? [],
    channels: (f.reminderChannels ?? []) as NotifyChannel[],
  };
  return { id: f.id, name: f.name, createdAt: f.createdAt, reminder };
};
const toPrinciple = (r: Record<string, any>): StoredPrinciple => {
  const p = mapRow<any>(r);
  return { id: p.id, folderId: p.folderId, title: p.title, content: p.content, archived: p.archived, createdAt: p.createdAt, updatedAt: p.updatedAt };
};

export class PgPrincipleRepository implements PrincipleRepository {
  constructor(private db: Db) {}

  async listFolders() { const { rows } = await this.db.query('SELECT * FROM principle_folders ORDER BY lower(name)'); return rows.map(toFolder); }
  async createFolder(name: string) { const { rows } = await this.db.query('INSERT INTO principle_folders (name) VALUES ($1) RETURNING *', [name]); return toFolder(rows[0]); }
  async renameFolder(id: string, name: string) {
    const { rows } = await this.db.query('UPDATE principle_folders SET name = $2 WHERE id = $1 RETURNING *', [id, name]);
    return rows[0] ? toFolder(rows[0]) : null;
  }
  async deleteFolder(id: string) { const r = await this.db.query('DELETE FROM principle_folders WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }

  async updateFolderReminder(id: string, patch: Partial<PrincipleReminder>) {
    const sets: string[] = []; const params: unknown[] = [id];
    if (patch.enabled !== undefined) { params.push(patch.enabled); sets.push(`reminder_enabled = $${params.length}`); }
    if (patch.times !== undefined) { params.push(patch.times); sets.push(`reminder_times = $${params.length}::text[]`); }
    if (patch.weekdays !== undefined) { params.push(patch.weekdays); sets.push(`reminder_weekdays = $${params.length}::int[]`); }
    if (patch.channels !== undefined) { params.push(patch.channels); sets.push(`reminder_channels = $${params.length}::text[]`); }
    if (sets.length === 0) { const { rows } = await this.db.query('SELECT * FROM principle_folders WHERE id = $1', [id]); return rows[0] ? toFolder(rows[0]) : null; }
    const { rows } = await this.db.query(`UPDATE principle_folders SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, params);
    return rows[0] ? toFolder(rows[0]) : null;
  }

  async list(includeArchived = false) {
    const { rows } = await this.db.query(`SELECT * FROM principles ${includeArchived ? '' : 'WHERE archived = false'} ORDER BY updated_at DESC`);
    return rows.map(toPrinciple);
  }
  async get(id: string) { const { rows } = await this.db.query('SELECT * FROM principles WHERE id = $1', [id]); return rows[0] ? toPrinciple(rows[0]) : null; }
  async create(d: { folderId: string | null; title: string; content: string }) {
    const { rows } = await this.db.query('INSERT INTO principles (folder_id, title, content) VALUES ($1,$2,$3) RETURNING *', [d.folderId, d.title, d.content]);
    return toPrinciple(rows[0]);
  }
  async update(id: string, patch: { folderId?: string | null; title?: string; content?: string; archived?: boolean }) {
    const row = await updateRow(this.db, 'principles', 'id', id, patch, ['folderId', 'title', 'content', 'archived']);
    return row ? toPrinciple(row) : null;
  }
  async delete(id: string) { const r = await this.db.query('DELETE FROM principles WHERE id = $1', [id]); return (r.rowCount ?? 0) > 0; }
  async listForRekey() {
    const { rows } = await this.db.query('SELECT id, title, content FROM principles');
    return rows.map((r) => ({ id: r.id as string, title: r.title as string, content: r.content as string }));
  }
}
