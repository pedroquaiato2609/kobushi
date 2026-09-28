import type {
  ActionStatus, AgentAction, AgentActionRepository, AgentSettings, AgentSettingsRepository, Conversation,
  ConversationRepository, NewAgentAction, NewMessage, PermissionRepository, StoredMessage,
} from '../../agent/ports';
import type { PermissionMode } from '../../domain/constants';
import type { Db } from '../db/pool';
import { mapRow, mapRows, updateRow } from '../db/util';

const SETTINGS_FIELDS = ['provider', 'model', 'customInstructions', 'tone', 'language', 'includeRoutineContext', 'maxToolSteps', 'sttMode', 'sttModel'] as const;

export class PgAgentSettingsRepository implements AgentSettingsRepository {
  constructor(private db: Db) {}

  async get() {
    const { rows } = await this.db.query('SELECT * FROM agent_settings WHERE id = 1');
    return mapRow<AgentSettings>(rows[0]) as AgentSettings;
  }

  async update(patch: Partial<AgentSettings>) {
    const row = await updateRow(this.db, 'agent_settings', 'id', 1, patch, SETTINGS_FIELDS);
    return mapRow<AgentSettings>(row) as AgentSettings;
  }
}

export class PgPermissionRepository implements PermissionRepository {
  constructor(private db: Db) {}

  async all() {
    const { rows } = await this.db.query('SELECT tool, mode FROM agent_permissions');
    return Object.fromEntries(rows.map((r) => [r.tool as string, r.mode as PermissionMode]));
  }

  async setMany(entries: { tool: string; mode: PermissionMode }[]) {
    for (const e of entries) {
      await this.db.query(
        `INSERT INTO agent_permissions (tool, mode) VALUES ($1, $2)
         ON CONFLICT (tool) DO UPDATE SET mode = EXCLUDED.mode, updated_at = now()`,
        [e.tool, e.mode],
      );
    }
  }
}

export class PgAgentActionRepository implements AgentActionRepository {
  constructor(private db: Db) {}

  async create(d: NewAgentAction) {
    const { rows } = await this.db.query(
      `INSERT INTO agent_actions (conversation_id, tool, resource, action, args, result, status, summary, resolved_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::text, $8, CASE WHEN $7::text = 'pending' THEN NULL ELSE now() END)
       RETURNING *`,
      [d.conversationId, d.tool, d.resource, d.action, JSON.stringify(d.args), d.result === null ? null : JSON.stringify(d.result), d.status, d.summary ?? ''],
    );
    return mapRow<AgentAction>(rows[0]) as AgentAction;
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM agent_actions WHERE id = $1', [id]);
    return mapRow<AgentAction>(rows[0]);
  }

  async resolve(id: string, status: ActionStatus, result: unknown) {
    const { rows } = await this.db.query(
      'UPDATE agent_actions SET status = $2, result = $3::jsonb, resolved_at = now() WHERE id = $1 RETURNING *',
      [id, status, JSON.stringify(result ?? null)],
    );
    return mapRow<AgentAction>(rows[0]);
  }

  async list(opts: { status?: ActionStatus; limit: number }) {
    const { rows } = opts.status
      ? await this.db.query('SELECT * FROM agent_actions WHERE status = $1 ORDER BY created_at DESC LIMIT $2', [opts.status, opts.limit])
      : await this.db.query('SELECT * FROM agent_actions ORDER BY created_at DESC LIMIT $1', [opts.limit]);
    return mapRows<AgentAction>(rows);
  }
}

export class PgConversationRepository implements ConversationRepository {
  constructor(private db: Db) {}

  async create(title = 'Nova conversa') {
    const { rows } = await this.db.query('INSERT INTO conversations (title) VALUES ($1) RETURNING *', [title]);
    return mapRow<Conversation>(rows[0]) as Conversation;
  }

  async list() {
    const { rows } = await this.db.query('SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 100');
    return mapRows<Conversation>(rows);
  }

  async get(id: string) {
    const { rows } = await this.db.query('SELECT * FROM conversations WHERE id = $1', [id]);
    return mapRow<Conversation>(rows[0]);
  }

  async rename(id: string, title: string) {
    await this.db.query('UPDATE conversations SET title = $2 WHERE id = $1', [id, title]);
  }

  async delete(id: string) {
    const res = await this.db.query('DELETE FROM conversations WHERE id = $1', [id]);
    return (res.rowCount ?? 0) > 0;
  }

  async addMessage(conversationId: string, m: NewMessage) {
    const { rows } = await this.db.query(
      `INSERT INTO messages (conversation_id, role, content, tool_calls, tool_call_id, tool_name)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6) RETURNING *`,
      [conversationId, m.role, m.content, m.toolCalls ? JSON.stringify(m.toolCalls) : null, m.toolCallId ?? null, m.toolName ?? null],
    );
    await this.db.query('UPDATE conversations SET updated_at = now() WHERE id = $1', [conversationId]);
    return mapRow<StoredMessage>(rows[0]) as StoredMessage;
  }

  async listMessages(conversationId: string, limit = 500) {
    const { rows } = await this.db.query(
      `SELECT * FROM (SELECT * FROM messages WHERE conversation_id = $1 ORDER BY seq DESC LIMIT $2) t ORDER BY seq`,
      [conversationId, limit],
    );
    return mapRows<StoredMessage>(rows);
  }
}
