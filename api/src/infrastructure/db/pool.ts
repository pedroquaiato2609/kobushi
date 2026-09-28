import pg from 'pg';
import { config } from '../../config';

// Tipos que o driver converteria para Date: mantemos como string para evitar problemas de fuso.
pg.types.setTypeParser(20, (v: string) => Number(v)); // bigint    -> number (centavos e ids cabem com folga em 2^53)
pg.types.setTypeParser(1082, (v: string) => v); // date      -> 'YYYY-MM-DD'
pg.types.setTypeParser(1114, (v: string) => v); // timestamp -> 'YYYY-MM-DD HH:mm:ss'

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: config.dbPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000, // consulta travada não segura a conexão para sempre
});
// Sem este listener, uma queda/reinício do banco derrubaria o processo por "unhandled error".
pool.on('error', (err) => console.error('[db] erro em conexão ociosa:', err.message));

/** Interface mínima usada pelos repositórios (Pool e PoolClient a satisfazem). */
export interface Db {
  query(text: string, params?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}

export async function withTx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
