import type { z } from 'zod';
import type { PermissionMode, Resource, ToolAction } from '../domain/constants';

/** Quem está pedindo. Toda ferramenta que mexe em dados por usuário (finanças) usa o userId daqui, nunca um argumento do modelo. */
export interface ToolContext { userId: string }

export interface ToolDefinition {
  name: string;
  resource: Resource;
  action: ToolAction;
  label: string;
  description: string;
  schema: z.ZodType;
  /** Substitui o padrão (exclusão pergunta, o resto permite). */
  defaultMode?: PermissionMode;
  /** Ferramentas de interface: sempre permitidas e fora da tela de permissões. */
  internal?: boolean;
  /** Só é oferecida ao modelo quando a conversa é sobre este assunto (poupa tokens em cada chamada). */
  group?: 'finance' | 'gym' | 'reading' | 'study';
  /** Nunca executa sem o "sim" do usuário: o modo "permitir" é rebaixado para "perguntar" (só "negar" é permitido). */
  requiresConfirmation?: boolean;
  /**
   * Passo antes da execução: resolve nomes em ids, valida e gera o resumo mostrado na confirmação. O que sai daqui é
   * exatamente o que será executado se o usuário aprovar. Erros voltam ao modelo (para ele perguntar o que faltou).
   */
  prepare?(args: any, ctx: ToolContext): Promise<{ args: Record<string, unknown>; summary: string[] }>;
  run(args: any, ctx: ToolContext): Promise<unknown>;
}

export function tool<S extends z.ZodType>(def: {
  name: string; resource: Resource; action: ToolAction; label: string; description: string; schema: S;
  defaultMode?: PermissionMode; internal?: boolean; group?: 'finance' | 'gym' | 'reading' | 'study'; requiresConfirmation?: boolean;
  prepare?: (args: z.infer<S>, ctx: ToolContext) => Promise<{ args: Record<string, unknown>; summary: string[] }>;
  run: (args: any, ctx: ToolContext) => Promise<unknown>;
}): ToolDefinition {
  return def as ToolDefinition;
}
