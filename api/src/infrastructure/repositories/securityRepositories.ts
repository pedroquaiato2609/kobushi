import type { ProfileRepository, VaultRepository } from '../../application/ports';
import type { ProfileLevel } from '../../domain/constants';
import type { StoredProfileItem } from '../../domain/entities';
import { withTx, type Db } from '../db/pool';
import { mapRow, mapRows, updateRow } from '../db/util';

export class PgVaultRepository implements VaultRepository {
  constructor(private db: Db) {}

  async get() {
    const { rows } = await this.db.query('SELECT salt, verifier FROM vault WHERE id = 1');
    return rows[0] ? { salt: rows[0].salt as string, verifier: rows[0].verifier as string } : null;
  }
  async create(salt: string, verifier: string) {
    await this.db.query('INSERT INTO vault (id, salt, verifier) VALUES (1, $1, $2)', [salt, verifier]);
  }
  async rekey(salt: string, verifier: string, profileItems: { id: string; content: string }[], principleItems: { id: string; title: string; content: string }[]) {
    await withTx(async (tx) => {
      for (const i of profileItems) await tx.query('UPDATE profile_items SET content = $2, updated_at = now() WHERE id = $1', [i.id, i.content]);
      for (const p of principleItems) await tx.query('UPDATE principles SET title = $2, content = $3, updated_at = now() WHERE id = $1', [p.id, p.title, p.content]);
      await tx.query('UPDATE vault SET salt = $1, verifier = $2 WHERE id = 1', [salt, verifier]);
    });
  }
  async reset() {
    await withTx(async (tx) => {
      await tx.query(`DELETE FROM profile_items WHERE level = 'secret'`);
      await tx.query('DELETE FROM principles');
      await tx.query('DELETE FROM vault WHERE id = 1');
    });
  }
}

export class PgProfileRepository implements ProfileRepository {
  constructor(private db: Db) {}

  async list() {
    const { rows } = await this.db.query(`SELECT * FROM profile_items ORDER BY CASE level WHEN 'general' THEN 0 WHEN 'private' THEN 1 ELSE 2 END, created_at`);
    return mapRows<StoredProfileItem>(rows);
  }
  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM profile_items WHERE id = $1', [id]);
    return mapRow<StoredProfileItem>(rows[0]);
  }
  async create(d: { title: string; content: string; level: ProfileLevel }) {
    const { rows } = await this.db.query('INSERT INTO profile_items (title, content, level) VALUES ($1,$2,$3) RETURNING *', [d.title, d.content, d.level]);
    return mapRow<StoredProfileItem>(rows[0]) as StoredProfileItem;
  }
  async update(id: string, patch: { title?: string; content?: string; level?: ProfileLevel }) {
    return mapRow<StoredProfileItem>(await updateRow(this.db, 'profile_items', 'id', id, patch, ['title', 'content', 'level']));
  }
  async delete(id: string) {
    const res = await this.db.query('DELETE FROM profile_items WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }
}
