import type { Db } from './pool';

export const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Converte as chaves snake_case de uma linha em camelCase (só o primeiro nível). */
export function mapRow<T>(row: Record<string, any> | undefined | null): T | null {
  if (!row) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out as T;
}
export const mapRows = <T>(rows: Record<string, any>[]): T[] => rows.map((r) => mapRow<T>(r) as T);

export const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null);
/** 'YYYY-MM-DD HH:mm:ss' -> 'YYYY-MM-DDTHH:mm' */
export const localTs = (v: string) => v.replace(' ', 'T').slice(0, 16);

/**
 * UPDATE dinâmico. `allowed` é a lista branca de campos (camelCase) — nomes de coluna
 * nunca vêm do usuário. Campos `undefined` são ignorados.
 */
export async function updateRow(
  db: Db,
  table: string,
  idColumn: string,
  id: string | number,
  patch: Record<string, unknown>,
  allowed: readonly string[],
  opts: { touch?: boolean } = { touch: true },
): Promise<Record<string, any> | null> {
  const keys = Object.keys(patch).filter((k) => allowed.includes(k) && patch[k] !== undefined);
  if (keys.length === 0) {
    const { rows } = await db.query(`SELECT * FROM ${table} WHERE ${idColumn} = $1`, [id]);
    return rows[0] ?? null;
  }
  const sets = keys.map((k, i) => `${snake(k)} = $${i + 2}`);
  if (opts.touch !== false) sets.push('updated_at = now()');
  const params = [id, ...keys.map((k) => patch[k])];
  const { rows } = await db.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${idColumn} = $1 RETURNING *`, params);
  return rows[0] ?? null;
}
