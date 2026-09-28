// Contrato de um provedor de Open Finance. É SOMENTE LEITURA por construção: não existe nenhum método de pagamento,
// transferência ou qualquer movimentação. Adicionar isso exigiria mudar este contrato de propósito.
import type { AccountKind } from '../finance/types';

export type ConnStatus = 'active' | 'updating' | 'error' | 'needs_reconnect' | 'expired' | 'revoked';

export interface RemoteItem {
  id: string; institution: string; status: 'active' | 'updating' | 'error' | 'needs_reconnect' | 'expired';
  consentExpiresAt: string | null; // YYYY-MM-DD
  clientUserId: string | null;     // a quem a conexão pertence, quando o provedor informa
  error?: string;
}
export interface RemoteAccount {
  id: string; kind: AccountKind; name: string; number?: string;
  balanceCents: number; // cartão de crédito: negativo = dívida
  creditLimitCents?: number; closingDay?: number; dueDay?: number;
}
export interface RemoteTx {
  id: string; accountId: string; date: string; amountCents: number; // sempre positivo
  direction: 'in' | 'out'; description: string; pending: boolean;
}
export type ConnectStart = { mode: 'widget'; token: string; script: string; itemId?: string } | { mode: 'instant'; itemId: string };

export interface OpenFinanceProvider {
  readonly name: 'demo' | 'pluggy';
  readonly label: string;
  readonly isDemo: boolean;
  startConnect(input: { userId: string; itemId?: string }): Promise<ConnectStart>;
  getItem(itemId: string): Promise<RemoteItem>;
  listAccounts(itemId: string): Promise<RemoteAccount[]>;
  listTransactions(itemId: string, accountId: string, from: string, to: string): Promise<RemoteTx[]>;
  revoke(itemId: string): Promise<void>;
}

/** A instituição pediu que o usuário refaça o consentimento/login: não adianta tentar de novo sozinho. */
export class ProviderAuthError extends Error {}

export interface OfConnection {
  id: string; userId: string; provider: string; institution: string; itemEnc: string; status: ConnStatus;
  consentGrantedAt: Date; consentExpiresAt: Date | null; lastSyncAt: Date | null; lastError: string | null; createdAt: Date; revokedAt: Date | null;
}
export type PublicConnection = Omit<OfConnection, 'itemEnc'> & { accountCount: number };

export interface OpenFinanceRepository {
  list(userId: string): Promise<OfConnection[]>;
  listAllActive(): Promise<OfConnection[]>;
  get(userId: string, id: string): Promise<OfConnection | null>;
  create(userId: string, d: Pick<OfConnection, 'provider' | 'institution' | 'itemEnc' | 'consentExpiresAt'>): Promise<OfConnection>;
  update(userId: string, id: string, patch: Partial<Pick<OfConnection, 'status' | 'institution' | 'consentExpiresAt' | 'lastSyncAt' | 'lastError' | 'revokedAt'>>): Promise<OfConnection | null>;
  delete(userId: string, id: string): Promise<boolean>;
  seenMany(userId: string, keys: { accountId: string; externalId: string }[]): Promise<Map<string, string | null>>;
  seenAdd(userId: string, accountId: string, externalId: string, txId: string | null): Promise<void>;
}
