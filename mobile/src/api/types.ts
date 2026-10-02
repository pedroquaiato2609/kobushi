// Espelho (só o necessário por enquanto) de web/src/api/types.ts — mesmo formato que a API devolve.
export type AccountKind = 'checking' | 'digital' | 'savings' | 'cash' | 'credit_card';
export type TxKind = 'income' | 'expense' | 'transfer';

export interface FinAccount {
  id: string; name: string; kind: AccountKind; institution: string; numberMask: string | null; initialBalanceCents: number;
  creditLimitCents: number | null; closingDay: number | null; dueDay: number | null; invoiceRemindDays: number | null; source: 'manual' | 'import' | 'demo'; archived: boolean;
  balanceCents?: number; pendingCents?: number;
}
export interface FinGoal { id: string; name: string; targetCents: number; currentCents: number; deadline: string | null; kanbanCardId: string | null; source?: string }
export interface CategorySlice { categoryId: string | null; name: string; color: string; cents: number; children: { categoryId: string | null; name: string; cents: number }[] }
export interface MonthSummary { month: string; incomeCents: number; expenseCents: number; netCents: number; pendingIncomeCents: number; pendingExpenseCents: number; byCategory: CategorySlice[] }
export interface Upcoming { key: string; date: string; kind: 'bill' | 'recurring' | 'invoice'; title: string; cents: number; direction: 'out' | 'in'; overdue: boolean; refId: string; accountId: string | null }
export interface BudgetStatus { budget: { id: string; categoryId: string | null; limitCents: number }; name: string; color: string; spentCents: number; pct: number; projectedCents: number; state: 'ok' | 'risk' | 'exceeded' }
export interface InsightAction { kind: 'open' | 'chat'; label: string; href?: string; prompt?: string }
export interface Insight { key: string; type: string; severity: 'info' | 'attention' | 'high'; title: string; summary: string; why: string[]; actions: InsightAction[] }
export interface FinOverview {
  today: string; month: string; hasDemo: boolean;
  totals: { liquidCents: number; cardDebtCents: number; netCents: number };
  accounts: FinAccount[]; summary: MonthSummary; previousSummary: MonthSummary;
  cashFlow: { month: string; incomeCents: number; expenseCents: number; netCents: number }[];
  patrimony: { month: string; netCents: number }[];
  upcoming: Upcoming[]; budgets: BudgetStatus[]; goals: FinGoal[]; insights: Insight[]; insightCount: number;
  commitment: { incomeCents: number; fixedCents: number; invoicesCents: number; committedCents: number; pct: number; basis: 'salary' | 'average' };
}
