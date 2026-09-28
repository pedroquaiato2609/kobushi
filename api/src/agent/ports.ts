import type { PermissionMode, ProviderName, Resource, SttMode, ToolAction } from '../domain/constants';
import type { ToolCall } from './providers/types';

export interface AgentSettings {
  provider: ProviderName;
  model: string;
  customInstructions: string;
  tone: string;
  language: string;
  includeRoutineContext: boolean;
  maxToolSteps: number;
  sttMode: SttMode;
  sttModel: string;
}
export interface AgentSettingsRepository {
  get(): Promise<AgentSettings>;
  update(patch: Partial<AgentSettings>): Promise<AgentSettings>;
}

export interface PermissionRepository {
  all(): Promise<Record<string, PermissionMode>>;
  setMany(entries: { tool: string; mode: PermissionMode }[]): Promise<void>;
}

export type ActionStatus = 'pending' | 'executed' | 'denied' | 'rejected' | 'error';
export interface AgentAction {
  id: string;
  conversationId: string | null;
  tool: string;
  resource: Resource;
  action: ToolAction;
  args: Record<string, unknown>;
  result: unknown;
  status: ActionStatus;
  summary: string; // resumo legível para a confirmação (linhas separadas por \n)
  createdAt: Date;
  resolvedAt: Date | null;
}
export interface NewAgentAction {
  conversationId: string | null;
  tool: string;
  resource: Resource;
  action: ToolAction;
  args: Record<string, unknown>;
  result: unknown;
  status: ActionStatus;
  summary?: string;
}
export interface AgentActionRepository {
  create(data: NewAgentAction): Promise<AgentAction>;
  get(id: string): Promise<AgentAction | null>;
  resolve(id: string, status: ActionStatus, result: unknown): Promise<AgentAction | null>;
  list(opts: { status?: ActionStatus; limit: number }): Promise<AgentAction[]>;
}

export interface Conversation { id: string; title: string; createdAt: Date; updatedAt: Date }
export type MessageRole = 'user' | 'assistant' | 'tool' | 'note';
export interface StoredMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCall[] | null;
  toolCallId: string | null;
  toolName: string | null;
  createdAt: Date;
}
export type NewMessage = Pick<StoredMessage, 'role' | 'content'> & Partial<Pick<StoredMessage, 'toolCalls' | 'toolCallId' | 'toolName'>>;

export interface ConversationRepository {
  create(title?: string): Promise<Conversation>;
  list(): Promise<Conversation[]>;
  get(id: string): Promise<Conversation | null>;
  rename(id: string, title: string): Promise<void>;
  delete(id: string): Promise<boolean>;
  addMessage(conversationId: string, msg: NewMessage): Promise<StoredMessage>;
  /** Últimas `limit` mensagens, em ordem cronológica. */
  listMessages(conversationId: string, limit?: number): Promise<StoredMessage[]>;
}
