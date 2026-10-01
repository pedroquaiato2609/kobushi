import type { Crud, FinanceRepository, NewAccount, NewBudget, NewCategory, NewGoal, NewRecurring, NewTransaction, TxFilter } from '../../application/finance/ports';
import type { FinAccount, FinBudget, FinCategory, FinGoal, FinRecurring, FinTransaction } from '../../application/finance/types';
import { withTx, type Db } from '../db/pool';
import { mapRow, snake } from '../db/util';

/**
 * CRUD genérico das tabelas fin_*. Os nomes de coluna vêm de listas fixas no código (nunca do usuário)
 * e TODA consulta filtra por user_id: um usuário nunca alcança linhas de outro.
 */
class PgCrud<T, N extends object> implements Crud<T, N> {
  constructor(
    protected db: Db, protected table: string, private fields: readonly string[],
    private opts: { order: string; touch?: boolean; map?: (row: Record<string, any>) => T },
  ) {}

  protected map(row: Record<string, any>): T { return this.opts.map ? this.opts.map(row) : (mapRow<T>(row) as T); }

  async list(userId: string) {
    const { rows } = await this.db.query(`SELECT * FROM ${this.table} WHERE user_id = $1 ORDER BY ${this.opts.order}`, [userId]);
    return rows.map((r) => this.map(r));
  }
  async get(userId: string, id: string) {
    const { rows } = await this.db.query(`SELECT * FROM ${this.table} WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? this.map(rows[0]) : null;
  }
  async create(userId: string, data: N) {
    const d = data as Record<string, unknown>;
    const cols = this.fields.filter((f) => d[f] !== undefined);
    const { rows } = await this.db.query(
      `INSERT INTO ${this.table} (user_id, ${cols.map(snake).join(', ')}) VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(', ')}) RETURNING *`,
      [userId, ...cols.map((c) => d[c])],
    );
    return this.map(rows[0]);
  }
  async update(userId: string, id: string, patch: Partial<N>) {
    const p = patch as Record<string, unknown>;
    const keys = this.fields.filter((f) => p[f] !== undefined);
    if (keys.length === 0) return this.get(userId, id);
    const sets = keys.map((k, i) => `${snake(k)} = $${i + 3}`);
    if (this.opts.touch) sets.push('updated_at = now()');
    const { rows } = await this.db.query(`UPDATE ${this.table} SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, [id, userId, ...keys.map((k) => p[k])]);
    return rows[0] ? this.map(rows[0]) : null;
  }
  async delete(userId: string, id: string) {
    const res = await this.db.query(`DELETE FROM ${this.table} WHERE id = $1 AND user_id = $2`, [id, userId]);
    return (res.rowCount ?? 0) > 0;
  }
}

// O número da conta (criptografado) nunca sai do banco: só a máscara.
const toAccount = (r: Record<string, any>): FinAccount => {
  const a = mapRow<any>(r);
  const { numberEnc, numberLast4, ...rest } = a;
  return { ...rest, numberMask: numberLast4 ? `••••${numberLast4}` : null, invoiceRemindChannels: rest.invoiceRemindChannels ?? [] } as FinAccount;
};

class PgTransactions extends PgCrud<FinTransaction, NewTransaction> {
  async search(userId: string, f: TxFilter) {
    const where = ['user_id = $1'];
    const params: unknown[] = [userId];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (f.month) add(`to_char(occurred_on, 'YYYY-MM') = ?`, f.month);
    if (f.from) add('occurred_on >= ?', f.from);
    if (f.to) add('occurred_on <= ?', f.to);
    if (f.accountId) { params.push(f.accountId); where.push(`(account_id = $${params.length} OR transfer_account_id = $${params.length})`); }
    if (f.categoryId) { params.push(f.categoryId); where.push(`(category_id = $${params.length} OR category_id IN (SELECT id FROM fin_categories WHERE parent_id = $${params.length}))`); }
    if (f.kind) add('kind = ?', f.kind);
    if (f.status) add('status = ?', f.status);
    if (f.query) {
      params.push(`%${f.query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      where.push(`(description ILIKE $${params.length} OR merchant ILIKE $${params.length})`);
    }
    params.push(Math.min(f.limit ?? 200, 100_000));
    const { rows } = await this.db.query(`SELECT * FROM fin_transactions WHERE ${where.join(' AND ')} ORDER BY occurred_on DESC, created_at DESC LIMIT $${params.length}`, params);
    return rows.map((r) => this.map(r));
  }
}

const ACCOUNT_FIELDS = ['name', 'kind', 'institution', 'numberEnc', 'numberLast4', 'initialBalanceCents', 'creditLimitCents', 'closingDay', 'dueDay', 'invoiceRemindDays', 'invoiceRemindChannels', 'source', 'archived', 'connectionId', 'externalId', 'providerBalanceCents', 'providerBalanceAt'] as const;
const TX_FIELDS = ['accountId', 'kind', 'amountCents', 'occurredOn', 'description', 'merchant', 'categoryId', 'status', 'transferAccountId', 'recurringId', 'note', 'linkActivityId', 'linkCardId', 'remindDaysBefore', 'remindChannels', 'documentId', 'source', 'externalId'] as const;
const RECURRING_FIELDS = ['description', 'amountCents', 'kind', 'categoryId', 'accountId', 'frequency', 'nextDue', 'active', 'isSubscription', 'usage', 'remindDaysBefore', 'remindChannels', 'source', 'discountPct'] as const;
const EXPORT_TABLES: [string, string][] = [
  ['accounts', 'id, name, kind, institution, number_last4, initial_balance_cents, credit_limit_cents, closing_day, due_day, source, archived, provider_balance_cents, provider_balance_at, created_at'],
  ['categories', '*'], ['transactions', '*'], ['budgets', '*'], ['goals', '*'], ['recurring', '*'],
];
const TABLE_OF: Record<string, string> = { accounts: 'fin_accounts', categories: 'fin_categories', transactions: 'fin_transactions', budgets: 'fin_budgets', goals: 'fin_goals', recurring: 'fin_recurring' };

export class PgFinanceRepository implements FinanceRepository {
  accounts: Crud<FinAccount, NewAccount>;
  categories: Crud<FinCategory, NewCategory>;
  transactions: PgTransactions;
  budgets: Crud<FinBudget, NewBudget>;
  goals: Crud<FinGoal, NewGoal>;
  recurring: Crud<FinRecurring, NewRecurring>;

  constructor(private db: Db) {
    this.accounts = new PgCrud<FinAccount, NewAccount>(db, 'fin_accounts', ACCOUNT_FIELDS, { order: 'created_at', map: toAccount });
    this.categories = new PgCrud<FinCategory, NewCategory>(db, 'fin_categories', ['name', 'parentId', 'kind', 'color'], { order: 'lower(name)' });
    this.transactions = new PgTransactions(db, 'fin_transactions', TX_FIELDS, { order: 'occurred_on DESC', touch: true });
    this.budgets = new PgCrud<FinBudget, NewBudget>(db, 'fin_budgets', ['categoryId', 'limitCents', 'source'], { order: 'created_at' });
    this.goals = new PgCrud<FinGoal, NewGoal>(db, 'fin_goals', ['name', 'targetCents', 'currentCents', 'deadline', 'linkedAccountId', 'kanbanCardId', 'source'], { order: 'created_at' });
    this.recurring = new PgCrud<FinRecurring, NewRecurring>(db, 'fin_recurring', RECURRING_FIELDS, { order: 'next_due' });
  }

  insightStates = {
    list: async (userId: string) => {
      const { rows } = await this.db.query('SELECT key, state, until FROM fin_insight_states WHERE user_id = $1', [userId]);
      return rows.map((r) => ({ key: r.key as string, state: r.state as 'dismissed' | 'muted', until: (r.until as string | null) ?? null }));
    },
    set: async (userId: string, key: string, state: 'dismissed' | 'muted', until: string | null) => {
      await this.db.query(
        'INSERT INTO fin_insight_states (user_id, key, state, until) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, key) DO UPDATE SET state = EXCLUDED.state, until = EXCLUDED.until',
        [userId, key, state, until],
      );
    },
  };

  async hasDemo(userId: string) {
    const { rows } = await this.db.query(
      `SELECT (EXISTS (SELECT 1 FROM fin_accounts WHERE user_id = $1 AND source = 'demo') OR EXISTS (SELECT 1 FROM fin_transactions WHERE user_id = $1 AND source = 'demo')) AS has`, [userId],
    );
    return rows[0].has as boolean;
  }

  async purge(userId: string, scope: 'demo' | 'all') {
    await withTx(async (tx) => {
      if (scope === 'demo') {
        await tx.query(`DELETE FROM fin_transactions WHERE user_id = $1 AND source = 'demo'`, [userId]);
        await tx.query(`DELETE FROM of_connections WHERE user_id = $1 AND provider = 'demo'`, [userId]);
        await tx.query(`DELETE FROM fin_recurring WHERE user_id = $1 AND source = 'demo'`, [userId]);
        await tx.query(`DELETE FROM fin_budgets WHERE user_id = $1 AND source = 'demo'`, [userId]);
        await tx.query(`DELETE FROM fin_goals WHERE user_id = $1 AND source = 'demo'`, [userId]);
        await tx.query(`DELETE FROM fin_accounts WHERE user_id = $1 AND source = 'demo'`, [userId]);
        return;
      }
      await tx.query('DELETE FROM of_connections WHERE user_id = $1', [userId]); // (of_seen sai junto com as contas)
      for (const t of ['fin_insight_states', 'fin_transactions', 'fin_recurring', 'fin_budgets', 'fin_goals', 'fin_accounts', 'fin_categories']) {
        await tx.query(`DELETE FROM ${t} WHERE user_id = $1`, [userId]);
      }
    });
  }

  async exportAll(userId: string) {
    const out: Record<string, unknown[]> = {};
    for (const [name, cols] of EXPORT_TABLES) {
      const { rows } = await this.db.query(`SELECT ${cols} FROM ${TABLE_OF[name]} WHERE user_id = $1`, [userId]);
      out[name] = rows.map((r) => { const { user_id, number_enc, ...rest } = r; return rest; });
    }
    return out;
  }
}
