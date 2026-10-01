import type { NotifyChannel } from '../../domain/constants';

export type AccountKind = 'checking' | 'digital' | 'savings' | 'cash' | 'credit_card';
export type TxKind = 'income' | 'expense' | 'transfer';
export type TxStatus = 'pending' | 'confirmed';
export type FinSource = 'manual' | 'import' | 'demo' | 'receipt';
export type Usage = 'often' | 'sometimes' | 'rarely';

export interface FinAccount {
  id: string; userId: string; name: string; kind: AccountKind; institution: string;
  numberMask: string | null; // só os 4 últimos dígitos; o número inteiro fica criptografado e nunca sai do servidor
  initialBalanceCents: number; creditLimitCents: number | null; closingDay: number | null; dueDay: number | null;
  invoiceRemindDays: number | null; invoiceRemindChannels: NotifyChannel[];
  source: 'manual' | 'import' | 'demo'; archived: boolean; createdAt: Date;
  // Open Finance (opcionais: contas digitadas à mão não têm)
  connectionId?: string | null; externalId?: string | null; providerBalanceCents?: number | null; providerBalanceAt?: Date | null;
}
export interface FinCategory { id: string; userId: string; name: string; parentId: string | null; kind: 'expense' | 'income'; color: string }
export interface FinTransaction {
  id: string; userId: string; accountId: string; kind: TxKind; amountCents: number; occurredOn: string;
  description: string; merchant: string; categoryId: string | null; status: TxStatus; transferAccountId: string | null;
  recurringId: string | null; note: string; linkActivityId: string | null; linkCardId: string | null;
  remindDaysBefore: number | null; remindChannels: NotifyChannel[]; documentId: string | null;
  source: FinSource; externalId: string | null; createdAt: Date; updatedAt: Date;
}
export interface FinBudget { id: string; userId: string; categoryId: string | null; limitCents: number; source?: 'manual' | 'demo' }
export interface FinGoal {
  id: string; userId: string; name: string; targetCents: number; currentCents: number; deadline: string | null;
  linkedAccountId: string | null; kanbanCardId: string | null; source?: 'manual' | 'demo';
}
export interface FinRecurring {
  id: string; userId: string; description: string; amountCents: number; kind: 'expense' | 'income';
  categoryId: string | null; accountId: string | null; frequency: 'weekly' | 'monthly' | 'yearly'; nextDue: string;
  active: boolean; isSubscription: boolean; usage: Usage | null; remindDaysBefore: number | null;
  remindChannels: NotifyChannel[]; source: 'manual' | 'import' | 'demo';
  /** Desconto (%) aplicado na hora de gerar a movimentação — o amountCents continua sendo o valor de tabela. */
  discountPct: number | null;
}

/** Tudo o que os cálculos precisam. `today` é injetado para os cálculos serem determinísticos (e testáveis). */
export interface FinData {
  today: string; // YYYY-MM-DD
  accounts: FinAccount[]; categories: FinCategory[]; txs: FinTransaction[];
  budgets: FinBudget[]; goals: FinGoal[]; recurring: FinRecurring[];
}

export interface InsightAction { kind: 'open' | 'chat'; label: string; href?: string; prompt?: string }
export type InsightType =
  | 'category_growth' | 'unusual_purchase' | 'missing_recurring' | 'duplicate_charge' | 'top_merchants' | 'month_compare'
  | 'small_purchases' | 'projection' | 'budget' | 'income_committed' | 'reserve';
export interface Insight {
  key: string; type: InsightType; severity: 'info' | 'attention' | 'high';
  title: string; summary: string;
  why: string[]; // exatamente os dados usados, em linguagem simples
  actions: InsightAction[];
}
