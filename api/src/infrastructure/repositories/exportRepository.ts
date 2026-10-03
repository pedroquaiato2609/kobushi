import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Db } from '../db/pool';
import { withTx } from '../db/pool';

// Listas fixas de tabelas (nunca vindas do usuário). Segredos ficam de fora da exportação: cofre e conteúdo secreto.
const EXPORT: [string, string][] = [
  ['activities', 'SELECT * FROM activities'], ['activityExecutions', 'SELECT * FROM activity_executions'], ['events', 'SELECT * FROM events'],
  ['boards', 'SELECT * FROM boards'], ['boardColumns', 'SELECT * FROM board_columns'], ['cards', 'SELECT * FROM cards'],
  ['dailyReviews', 'SELECT * FROM daily_reviews'], ['meditationSessions', 'SELECT * FROM meditation_sessions'], ['reminders', 'SELECT * FROM reminders'],
  ['folders', 'SELECT * FROM folders'], ['documents', 'SELECT id, folder_id, kind, title, content, file_name, mime_type, size_bytes, created_at, updated_at FROM documents'],
  ['profileItems', `SELECT id, title, level, created_at FROM profile_items`],
  ['conversations', 'SELECT * FROM conversations'], ['messages', 'SELECT id, conversation_id, role, content, created_at FROM messages'],
];
const ERASE = ['agent_actions', 'notification_log', 'notifications', 'push_subscriptions', 'notification_settings', 'reminders', 'documents', 'folders', 'profile_items', 'vault',
  'conversations', 'daily_reviews', 'meditation_sessions', 'events', 'boards', 'activities', 'users'];

export class PgExportRepository {
  constructor(private db: Db, private filesDir: string) {}

  async exportLegacy(): Promise<Record<string, unknown[]>> {
    const out: Record<string, unknown[]> = {};
    for (const [name, sql] of EXPORT) {
      try { out[name] = (await this.db.query(sql)).rows; } catch { out[name] = []; } // tabela/coluna ausente em instalações antigas
    }
    return out;
  }

  /**
   * Apaga TUDO (inclusive usuários e anexos). O app volta à tela de primeiro acesso.
   * Apaga o CONTEÚDO de filesDir, não a pasta em si: em produção e no Docker Compose de desenvolvimento
   * ela é um ponto de montagem (volume), e tentar remover o próprio ponto de montagem falha com
   * EBUSY (ou ENOTEMPTY/EPERM conforme o storage driver) — descoberto ao testar este fluxo de verdade.
   */
  async eraseEverything() {
    await withTx(async (tx) => { await tx.query(`TRUNCATE ${ERASE.join(', ')} RESTART IDENTITY CASCADE`); });
    const entries = await readdir(this.filesDir).catch(() => [] as string[]);
    await Promise.all(entries.map((name) => rm(join(this.filesDir, name), { recursive: true, force: true })));
  }
}
