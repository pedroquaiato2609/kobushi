import type { z } from 'zod';
import { compactSchema, formatIssues, toJsonSchema } from './jsonSchema';
import type { AgentAction, AgentActionRepository } from './ports';
import type { PermissionPolicy } from './policy';
import type { ToolCall, ToolSpec } from './providers/types';
import type { ToolContext, ToolDefinition } from './toolTypes';
import { AppError, NotFoundError } from '../domain/errors';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Executa tool calls aplicando permissões e registrando tudo em agent_actions. */
export class ToolRunner {
  private byName: Map<string, ToolDefinition>;

  constructor(
    private tools: ToolDefinition[],
    private policy: PermissionPolicy,
    private actions: AgentActionRepository,
    private jsonSchema: (schema: z.ZodType) => Record<string, unknown> = toJsonSchema,
  ) {
    this.byName = new Map(tools.map((t) => [t.name, t]));
  }

  /**
   * Só as tools não negadas são oferecidas ao modelo (a checagem real acontece de novo na execução). Ferramentas de um
   * assunto (grupo) só entram quando a conversa é sobre aquele assunto — schemas de escrita, em especial, pesam muito
   * e são reenviados do zero a cada passo; ler ficam sempre disponíveis para o agente poder responder de bate-pronto.
   */
  async specsForModel(opts: { finance?: boolean; gym?: boolean; reading?: boolean; study?: boolean } = {}): Promise<ToolSpec[]> {
    const modes = await this.policy.modes(this.tools);
    const inContext: Record<string, boolean | undefined> = { finance: opts.finance, gym: opts.gym, reading: opts.reading, study: opts.study };
    return this.tools
      .filter((t) => modes[t.name] !== 'deny' && (!t.group || t.action === 'read' || inContext[t.group] !== false))
      .map((t) => ({ name: t.name, description: t.description, parameters: compactSchema(this.jsonSchema(t.schema)) }));
  }

  /** Resultado devolvido ao modelo (sempre serializável em JSON). */
  async execute(call: ToolCall, conversationId: string | null, ctx: ToolContext = { userId: '' }): Promise<unknown> {
    const tool = this.byName.get(call.name);
    if (!tool) return { error: `Ferramenta desconhecida: ${call.name}` };

    const parsed = tool.schema.safeParse(call.args);
    if (!parsed.success) return { error: `Argumentos inválidos — ${formatIssues(parsed.error)}` };
    let args = parsed.data as Record<string, unknown>;
    let base = { conversationId, tool: tool.name, resource: tool.resource, action: tool.action, args };

    const mode = await this.policy.modeFor(tool);
    if (mode === 'deny') {
      const result = { error: 'permission_denied', message: 'O usuário não permite que o agente use esta ferramenta.' };
      await this.actions.create({ ...base, status: 'denied', result });
      return result;
    }

    // Prepara a ação: resolve nomes, valida e gera o resumo. O que for mostrado ao usuário é exatamente o que executa.
    let summary: string[] = [];
    if (tool.prepare) {
      try {
        const prepared = await tool.prepare(args, ctx);
        args = prepared.args; summary = prepared.summary;
        base = { ...base, args };
      } catch (e) {
        return { error: errorMessage(e) }; // o modelo usa isso para perguntar o que faltou
      }
    }

    if (mode === 'confirm') {
      const action = await this.actions.create({ ...base, status: 'pending', result: null, summary: summary.join('\n') });
      return {
        status: 'pending_user_confirmation',
        actionId: action.id,
        resumo: summary.length ? summary : undefined,
        message: 'Ação preparada e enviada para aprovação do usuário. NADA foi feito ainda: só acontece se ele aprovar. Diga isso com clareza e resuma o que será feito.',
      };
    }

    try {
      const result = (await tool.run(args, ctx)) ?? { ok: true };
      // O log de ações não guarda valores financeiros (saldos, lançamentos): só registra que a consulta aconteceu.
      await this.actions.create({ ...base, status: 'executed', result: tool.group === 'finance' ? { omitido: 'dados financeiros não são guardados no log de ações' } : result });
      return result;
    } catch (e) {
      const result = { error: errorMessage(e) };
      await this.actions.create({ ...base, status: 'error', result });
      return result;
    }
  }

  /** Executa uma ação que estava pendente de confirmação. */
  async approve(actionId: string, ctx: ToolContext = { userId: '' }): Promise<AgentAction> {
    const action = await this.pending(actionId);
    const tool = this.byName.get(action.tool);
    if (!tool) throw new NotFoundError('Ferramenta');
    if (await this.policy.modeFor(tool) === 'deny') throw new AppError('Esta ferramenta está bloqueada. O acesso financeiro do assistente é somente leitura.', 403);
    try {
      // Ações preparadas já têm os argumentos resolvidos e validados; as demais são validadas de novo.
      const args = tool.prepare ? action.args : tool.schema.parse(action.args);
      const result = (await tool.run(args, ctx)) ?? { ok: true };
      return (await this.actions.resolve(actionId, 'executed', result)) as AgentAction;
    } catch (e) {
      return (await this.actions.resolve(actionId, 'error', { error: errorMessage(e) })) as AgentAction;
    }
  }

  async reject(actionId: string): Promise<AgentAction> {
    await this.pending(actionId);
    return (await this.actions.resolve(actionId, 'rejected', { message: 'Rejeitada pelo usuário.' })) as AgentAction;
  }

  private async pending(actionId: string): Promise<AgentAction> {
    const action = await this.actions.get(actionId);
    if (!action) throw new NotFoundError('Ação');
    if (action.status !== 'pending') throw new AppError('Esta ação já foi resolvida.', 409);
    return action;
  }
}
