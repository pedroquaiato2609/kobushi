import type { PermissionMode } from '../domain/constants';
import type { PermissionRepository } from './ports';
import type { ToolDefinition } from './tools';

/** Padrão quando o usuário ainda não configurou a ferramenta. */
export const defaultMode = (tool: Pick<ToolDefinition, 'action' | 'defaultMode' | 'internal' | 'requiresConfirmation'>): PermissionMode =>
  tool.internal ? 'allow' : tool.defaultMode ?? (tool.action === 'delete' || tool.requiresConfirmation ? 'confirm' : 'allow');

/**
 * Decide o que o agente pode fazer. A checagem acontece no backend, no momento da execução —
 * não depende do prompt nem do que o modelo "prometeu".
 */
export class PermissionPolicy {
  constructor(private repo: PermissionRepository) {}

  async modes(tools: ToolDefinition[]): Promise<Record<string, PermissionMode>> {
    const stored = await this.repo.all();
    return Object.fromEntries(tools.map((t) => {
      if (t.group === 'finance' && t.action !== 'read') return [t.name, 'deny' as PermissionMode];
      if (t.internal) return [t.name, 'allow' as PermissionMode];
      const mode = stored[t.name] ?? defaultMode(t);
      // Ferramentas que gravam dinheiro nunca rodam sem confirmação, nem que o usuário tenha configurado "permitir".
      return [t.name, t.requiresConfirmation && mode === 'allow' ? 'confirm' : mode];
    }));
  }

  async modeFor(tool: ToolDefinition): Promise<PermissionMode> {
    return (await this.modes([tool]))[tool.name];
  }
}
