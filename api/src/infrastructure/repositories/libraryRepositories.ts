import type { DocumentRepository, FolderRepository } from '../../application/ports';
import type { Doc, DocListItem, Folder, NewDoc } from '../../domain/entities';
import type { Db } from '../db/pool';
import { mapRow, mapRows, updateRow } from '../db/util';

export class PgFolderRepository implements FolderRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query('SELECT * FROM folders ORDER BY lower(name)');
    return mapRows<Folder>(rows);
  }
  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM folders WHERE id = $1', [id]);
    return mapRow<Folder>(rows[0]);
  }
  async create(name: string, parentId: string | null) {
    const { rows } = await this.db.query('INSERT INTO folders (name, parent_id) VALUES ($1, $2) RETURNING *', [name, parentId]);
    return mapRow<Folder>(rows[0]) as Folder;
  }
  async rename(id: string, name: string) {
    const { rows } = await this.db.query('UPDATE folders SET name = $2 WHERE id = $1 RETURNING *', [id, name]);
    return mapRow<Folder>(rows[0]);
  }
  async setAgentVisible(id: string, visible: boolean) {
    const { rows } = await this.db.query('UPDATE folders SET agent_visible = $2 WHERE id = $1 RETURNING *', [id, visible]);
    return mapRow<Folder>(rows[0]);
  }
  async delete(id: string) {
    const res = await this.db.query('DELETE FROM folders WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}

const toDoc = (r: Record<string, any>): Doc => ({ ...(mapRow<Doc>(r) as Doc), sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes) });

export class PgDocumentRepository implements DocumentRepository {
  constructor(private db: Db) {}

  async list(opts: { folderId?: string; query?: string; limit: number }) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts.folderId === 'root') where.push('folder_id IS NULL');
    else if (opts.folderId) { params.push(opts.folderId); where.push(`folder_id = $${params.length}`); }
    if (opts.query) {
      params.push(`%${opts.query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      where.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
    }
    params.push(opts.limit);
    const { rows } = await this.db.query(
      `SELECT id, folder_id, title, kind, summary, mime, size_bytes, created_at, updated_at,
              left(CASE WHEN kind = 'note' THEN regexp_replace(content, '<[^>]+>', ' ', 'g') ELSE content END, 200) AS excerpt
         FROM documents ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY updated_at DESC LIMIT $${params.length}`,
      params,
    );
    return rows.map((r) => ({ ...(mapRow<DocListItem>(r) as DocListItem), sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes) }));
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM documents WHERE id = $1', [id]);
    return rows[0] ? toDoc(rows[0]) : null;
  }

  async create(d: NewDoc) {
    const { rows } = await this.db.query(
      'INSERT INTO documents (folder_id, title, kind, content, mime, size_bytes, storage_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [d.folderId, d.title, d.kind, d.content, d.mime ?? null, d.sizeBytes ?? null, d.storageName ?? null],
    );
    return toDoc(rows[0]);
  }

  async update(id: string, patch: Partial<Pick<Doc, 'title' | 'content' | 'summary' | 'folderId'>>) {
    const row = await updateRow(this.db, 'documents', 'id', id, patch, ['title', 'content', 'summary', 'folderId']);
    return row ? toDoc(row) : null;
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM documents WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async storageNamesIn(folderIds: string[]) {
    const { rows } = await this.db.query('SELECT storage_name FROM documents WHERE folder_id = ANY($1::uuid[]) AND storage_name IS NOT NULL', [folderIds]);
    return rows.map((r) => r.storage_name as string);
  }
}
