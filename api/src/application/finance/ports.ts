import type { NotifyChannel } from '../../domain/constants';
import type { FinAccount, FinBudget, FinCategory, FinGoal, FinRecurring, FinTransaction, TxKind, TxStatus } from './types';

export interface Crud<T, N> {
  list(userId: string): Promise<T[]>;
  get(userId: string, id: string): Promise<T | null>;
  create(userId: string, data: N): Promise<T>;
  update(userId: string, id: string, patch: Partial<N>): Promise<T | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export type NewAccount = Omit<FinAccount, 'id' | 'userId' | 'createdAt' | 'numberMask'> & { numberEnc: string | null; numberLast4: string | null };
export type NewCategory = Omit<FinCategory, 'id' | 'userId'>;
export type NewTransaction = Omit<FinTransaction, 'id' | 'userId' | 'createdAt' | 'updatedAt'>;
export type NewBudget = Omit<FinBudget, 'id' | 'userId'>;
export type NewGoal = Omit<FinGoal, 'id' | 'userId'>;
export type NewRecurring = Omit<FinRecurring, 'id' | 'userId'>;

export interface TxFilter { month?: string; from?: string; to?: string; accountId?: string; categoryId?: string; kind?: TxKind; status?: TxStatus; query?: string; limit?: number }

export interface FinanceRepository {
  accounts: Crud<FinAccount, NewAccount>;
  categories: Crud<FinCategory, NewCategory>;
  transactions: Crud<FinTransaction, NewTransaction> & { search(userId: string, f: TxFilter): Promise<FinTransaction[]> };
  budgets: Crud<FinBudget, NewBudget>;
  goals: Crud<FinGoal, NewGoal>;
  recurring: Crud<FinRecurring, NewRecurring>;
  insightStates: {
    list(userId: string): Promise<{ key: string; state: 'dismissed' | 'muted'; until: string | null }[]>;
    set(userId: string, key: string, state: 'dismissed' | 'muted', until: string | null): Promise<void>;
  };
  hasDemo(userId: string): Promise<boolean>;
  /** 'demo' remove só o que é de demonstração; 'all' remove todos os dados financeiros do usuário. */
  purge(userId: string, scope: 'demo' | 'all'): Promise<void>;
  exportAll(userId: string): Promise<Record<string, unknown[]>>;
}

export type { NotifyChannel };
