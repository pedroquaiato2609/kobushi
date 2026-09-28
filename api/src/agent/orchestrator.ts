import { config } from '../config';
import { NotFoundError } from '../domain/errors';
import type { ActivityService } from '../application/services';
import type { ProfileService } from '../application/security';
import { fitHistory } from './history';
import { buildSystemPrompt } from './prompt';
import type { AgentAction, AgentSettingsRepository, ConversationRepository, StoredMessage } from './ports';
import type { PermissionPolicy } from './policy';
import { createProvider } from './providers';
import type { ChatMessage } from './providers/types';
import type { ToolRunner } from './runner';
import type { ToolContext, ToolDefinition } from './toolTypes';
import { isFinanceConversation, isGymConversation, isReadingConversation, isStudyConversation } from './toolSelection';

const HISTORY_LIMIT = 60;

/** Eventos emitidos durante um turno (usados pelo streaming HTTP). */
export type AgentEvent =
  | { type: 'user'; message: StoredMessage }
  | { type: 'step' } // nova chamada ao modelo: o texto seguinte é um novo trecho
  | { type: 'text'; delta: string }
  | { type: 'notice'; message: string } // ex.: aguardando o limite do provedor liberar
  | { type: 'tool_start'; id: string; name: string }
  | { type: 'tool_end'; id: string; name: string; status: 'ok' | 'error' | 'pending' }
  | { type: 'done'; messages: StoredMessage[] }
  | { type: 'error'; message: string };

export function outputStatus(output: unknown): 'ok' | 'error' | 'pending' {
  const o = output as { error?: unknown; status?: unknown } | null;
  if (o?.status === 'pending_user_confirmation') return 'pending';
  if (o?.error) return 'error';
  return 'ok';
}

/** Converte o histórico salvo para o formato neutro, garantindo que comece num turno do usuário. */
export function toChatMessages(rows: StoredMessage[]): ChatMessage[] {
  const start = rows.findIndex((r) => r.role === 'user' || r.role === 'note');
  if (start === -1) return [];
  return rows.slice(start).map((r): ChatMessage => {
    switch (r.role) {
      case 'user': return { role: 'user', content: r.content };
      case 'note': return { role: 'user', content: `[Nota do sistema] ${r.content}` };
      case 'assistant': return { role: 'assistant', content: r.content, toolCalls: r.toolCalls ?? undefined };
      default: return { role: 'tool', toolCallId: r.toolCallId ?? '', name: r.toolName ?? '', content: r.content };
    }
  });
}

export class AgentOrchestrator {
  private internal: Set<string>;

  constructor(
    private conversations: ConversationRepository,
    private settingsRepo: AgentSettingsRepository,
    private runner: ToolRunner,
    private policy: PermissionPolicy,
    private tools: ToolDefinition[],
    private activities: ActivityService,
    private profile: ProfileService,
    private pendingSuggestions: (userId: string) => Promise<string[]> = async () => [],
  ) {
    this.internal = new Set(tools.filter((t) => t.internal).map((t) => t.name));
  }

  /** Um turno completo: mensagem do usuário -> (ferramentas)* -> resposta. Devolve as mensagens criadas. */
  async handleUserMessage(conversationId: string, text: string, emit: (e: AgentEvent) => void = () => undefined, ctx: ToolContext = { userId: '' }): Promise<StoredMessage[]> {
    const conversation = await this.conversations.get(conversationId);
    if (!conversation) throw new NotFoundError('Conversa');

    const settings = await this.settingsRepo.get();
    const provider = createProvider(settings.provider); // falha cedo se faltar a chave

    const created: StoredMessage[] = [];
    const userMessage = await this.conversations.addMessage(conversationId, { role: 'user', content: text });
    created.push(userMessage);
    emit({ type: 'user', message: userMessage });
    if (conversation.title === 'Nova conversa') await this.conversations.rename(conversationId, text.slice(0, 60));

    for (let step = 0; step < settings.maxToolSteps; step++) {
      const history = fitHistory(toChatMessages(await this.conversations.listMessages(conversationId, HISTORY_LIMIT)));
      const finance = isFinanceConversation(history as never);
      const gym = isGymConversation(history as never);
      const reading = isReadingConversation(history as never);
      const study = isStudyConversation(history as never);
      const suggestions = step === 0 && ctx.userId ? await this.pendingSuggestions(ctx.userId).catch(() => []) : [];
      emit({ type: 'step' });
      const reply = await provider.stream({
        model: settings.model,
        system: buildSystemPrompt({
          settings, timezone: config.timezone,
          routine: await this.routineContext(settings.includeRoutineContext),
          profile: await this.profileContext(),
          finance, suggestions,
        }),
        messages: history,
        tools: await this.runner.specsForModel({ finance, gym, reading, study }),
        onWait: (seconds) => emit({ type: 'notice', message: `O limite de uso do provedor foi atingido. Tentando de novo em ${seconds} s…` }),
      }, (delta) => emit({ type: 'text', delta }));

      if (reply.toolCalls.length === 0) {
        if (reply.text.trim() || step === 0) {
          created.push(await this.conversations.addMessage(conversationId, { role: 'assistant', content: reply.text || '(sem resposta)' }));
        }
        return created;
      }

      // Executa todas as chamadas e só então grava assistente + resultados (o histórico nunca fica com tool_use sem tool_result).
      const results = [];
      for (const call of reply.toolCalls) {
        const visible = !this.internal.has(call.name);
        if (visible) emit({ type: 'tool_start', id: call.id, name: call.name });
        const output = await this.runner.execute(call, conversationId, ctx);
        if (visible) emit({ type: 'tool_end', id: call.id, name: call.name, status: outputStatus(output) });
        results.push({ call, output });
      }

      created.push(await this.conversations.addMessage(conversationId, { role: 'assistant', content: reply.text, toolCalls: reply.toolCalls }));
      for (const { call, output } of results) {
        created.push(await this.conversations.addMessage(conversationId, {
          role: 'tool', content: JSON.stringify(output).slice(0, 20_000), toolCallId: call.id, toolName: call.name,
        }));
      }

      // Só botões de resposta rápida: a mensagem já foi escrita, não precisa de outra chamada ao modelo.
      if (reply.toolCalls.every((c) => this.internal.has(c.name))) return created;
    }

    created.push(await this.conversations.addMessage(conversationId, {
      role: 'assistant',
      content: 'Parei porque atingi o limite de passos por mensagem (configurável em Configurações). Diga se devo continuar.',
    }));
    return created;
  }

  /** Aprova uma ação pendente: executa e avisa o agente por uma nota na conversa. */
  async approve(actionId: string, ctx: ToolContext = { userId: '' }): Promise<AgentAction> {
    const action = await this.runner.approve(actionId, ctx);
    await this.note(action, action.status === 'executed'
      ? `O usuário aprovou e a ação "${action.tool}" foi executada. Resultado: ${JSON.stringify(action.result).slice(0, 2000)}`
      : `O usuário aprovou "${action.tool}", mas a execução falhou: ${JSON.stringify(action.result).slice(0, 500)}`);
    return action;
  }

  async reject(actionId: string): Promise<AgentAction> {
    const action = await this.runner.reject(actionId);
    await this.note(action, `O usuário rejeitou a ação "${action.tool}". Ela não foi executada.`);
    return action;
  }

  private async note(action: AgentAction, content: string) {
    if (action.conversationId) await this.conversations.addMessage(action.conversationId, { role: 'note', content });
  }

  private async allowed(toolName: string) {
    const tool = this.tools.find((t) => t.name === toolName);
    return Boolean(tool) && (await this.policy.modeFor(tool as ToolDefinition)) === 'allow';
  }

  /** Inclui a rotina no prompt só se o usuário permite que o agente leia atividades. */
  private async routineContext(enabled: boolean) {
    if (!enabled || !(await this.allowed('list_activities'))) return null;
    return this.activities.list();
  }

  /** Informações gerais do usuário vão no prompt; as protegidas, só os títulos. */
  private async profileContext() {
    if (!(await this.allowed('get_profile_info'))) return null;
    const { general, protectedTitles } = await this.profile.agentOverview();
    return { general, protectedTitles };
  }
}
