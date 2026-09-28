// Formato neutro de mensagens. Cada provedor (Anthropic, OpenAI) converte de/para o seu formato.
import type { ProviderName } from '../../domain/constants';

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ChatRequest {
  model: string;
  system: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  maxTokens?: number;
  /** Chamado quando o provedor limita a taxa e vamos esperar N segundos antes de tentar de novo. */
  onWait?: (seconds: number) => void;
}
export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
}

export interface LLMProvider {
  readonly name: ProviderName;
  /** Resposta completa de uma vez (resumos, tarefas sem interface). */
  chat(req: ChatRequest): Promise<ChatResponse>;
  /** Igual a chat, mas entrega o texto aos poucos em onText (efeito de digitação). */
  stream(req: ChatRequest, onText: (delta: string) => void): Promise<ChatResponse>;
}
