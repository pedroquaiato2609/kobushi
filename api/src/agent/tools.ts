// Registro de tools do agente. Cada tool é um adaptador fino sobre um caso de uso (application/).
// Para dar uma nova capacidade ao agente: crie o caso de uso, adicione uma tool aqui — ela aparece
// sozinha na tela de permissões (padrão: exclusão pergunta; o resto é permitido).
//
// `label` é o objeto da frase mostrada no chat: "Consultou {label}", "Criou {label}"...
import { z } from 'zod';
import type { FinanceService } from '../application/finance/service';
import type { SuggestionService } from '../application/suggestions';
import type { GymService } from '../application/gym/service';
import type { ReadingService } from '../application/reading/service';
import type { StudyService } from '../application/study/service';
import { buildFinanceTools } from './financeTools';
import { buildGymTools } from './gymTools';
import { buildReadingTools } from './readingTools';
import { buildStudyTools } from './studyTools';
import { tool, type ToolDefinition } from './toolTypes';
import { addDays } from '../domain/dates';
import { paragraphsToHtml, textFromHtml } from '../domain/richText';
import type { PermissionMode, Resource, ToolAction } from '../domain/constants';
import type { DocumentService } from '../application/library';
import type { ReminderService } from '../application/notifications';
import type { ProfileService } from '../application/security';
import type {
  ActivityService, BoardService, CommuteService, EventService, ExecutionService, MeditationService, ReviewService, StatsService,
} from '../application/services';
import {
  activityCreateSchema, activityUpdateSchema, cardCreateSchema, cardMoveSchema, cardUpdateSchema, commuteCreateSchema,
  commuteUpdateSchema, dateStr, docCreateSchema, docUpdateSchema, eventCreateSchema, eventUpdateSchema, executionClearSchema,
  executionSetSchema, folderCreateSchema, id, meditationCreateSchema, nameSchema, rangeSchema, reminderCreateSchema, reviewSaveSchema,
} from '../application/schemas';

export interface ToolServices {
  activities: ActivityService;
  executions: ExecutionService;
  events: EventService;
  boards: BoardService;
  reviews: ReviewService;
  meditation: MeditationService;
  stats: StatsService;
  reminders: ReminderService;
  commutes: CommuteService;
  documents: DocumentService;
  profile: ProfileService;
  finance: FinanceService;
  suggestions: SuggestionService;
  gym: GymService;
  reading: ReadingService;
  study: StudyService;
}

export type { ToolContext, ToolDefinition } from './toolTypes';

const idArgs = z.object({ id });
const deleted = { deleted: true };
const DOC_READ_LIMIT = 30_000;
const AGENT = { agent: true } as const;

export function buildTools(s: ToolServices): ToolDefinition[] {
  return [
    ...buildFinanceTools(s.finance, s.suggestions),
    ...buildGymTools(s.gym),
    ...buildReadingTools(s.reading),
    ...buildStudyTools(s.study),
    // Atividades -----------------------------------------------------------------
    tool({ name: 'list_activities', resource: 'activity', action: 'read', label: 'as atividades',
      description: 'Lista todas as atividades (obrigações, objetivos e meditação), com níveis mínimo/ideal/máximo, princípios e lembretes.',
      schema: z.object({}), run: () => s.activities.list() }),
    tool({ name: 'create_activity', resource: 'activity', action: 'create', label: 'uma atividade',
      description: 'Cria uma atividade da rotina. Obrigação = responsabilidade com outros; objetivo = algo a desenvolver. Pode ter lembrete diário (remindTime).',
      schema: activityCreateSchema, run: (a) => s.activities.create(a) }),
    tool({ name: 'update_activity', resource: 'activity', action: 'update', label: 'uma atividade',
      description: 'Edita uma atividade existente (informe só os campos a alterar), inclusive o lembrete diário.',
      schema: activityUpdateSchema.extend({ id }), run: ({ id, ...patch }) => s.activities.update(id, patch) }),
    tool({ name: 'delete_activity', resource: 'activity', action: 'delete', label: 'uma atividade',
      description: 'Apaga uma atividade e todo o seu histórico de execuções. Para apenas pausar, prefira update_activity com active=false.',
      schema: idArgs, run: async ({ id }) => { await s.activities.remove(id); return deleted; } }),

    // Execução diária ------------------------------------------------------------
    tool({ name: 'get_day_plan', resource: 'execution', action: 'read', label: 'a rotina do dia',
      description: 'Rotina de um dia: atividades aplicáveis àquela data e o nível executado em cada uma.',
      schema: z.object({ date: dateStr }), run: ({ date }) => s.executions.dayPlan(date) }),
    tool({ name: 'set_execution', resource: 'execution', action: 'update', label: 'o registro de uma atividade',
      description: 'Registra o nível executado (min, ideal ou max) de uma atividade em uma data.',
      schema: executionSetSchema, run: (a) => s.executions.set(a.activityId, a.date, a.level, a.note) }),
    tool({ name: 'clear_execution', resource: 'execution', action: 'delete', label: 'o registro de uma atividade',
      description: 'Remove o registro de execução de uma atividade em uma data.',
      schema: executionClearSchema, run: async (a) => { await s.executions.clear(a.activityId, a.date); return deleted; } }),
    tool({ name: 'get_stats', resource: 'execution', action: 'read', label: 'o resumo do período',
      description: 'Resumo de um período: execuções por nível, por atividade, sequência de continuidade e meditação.',
      schema: rangeSchema, run: ({ from, to }) => s.stats.range(from, to) }),

    // Agenda ---------------------------------------------------------------------
    tool({ name: 'list_events', resource: 'event', action: 'read', label: 'a agenda',
      description: 'Lista eventos da agenda entre duas datas (inclusive), com local e lembretes. Use para achar compromissos próximos (ex.: farmácia) antes de sugerir outro.',
      schema: rangeSchema, run: ({ from, to }) => s.events.list(`${from}T00:00`, `${addDays(to, 1)}T00:00`) }),
    tool({ name: 'create_event', resource: 'event', action: 'create', label: 'um evento',
      description: 'Cria um evento na agenda. Horários em hora local, formato YYYY-MM-DDTHH:mm. Informe location quando houver um lugar e remindMinutes para avisar antes.',
      schema: eventCreateSchema, run: (a) => s.events.create(a) }),
    tool({ name: 'update_event', resource: 'event', action: 'update', label: 'um evento',
      description: 'Edita ou reagenda um evento (informe só os campos a alterar).',
      schema: eventUpdateSchema.extend({ id }), run: ({ id, ...patch }) => s.events.update(id, patch) }),
    tool({ name: 'delete_event', resource: 'event', action: 'delete', label: 'um evento',
      description: 'Apaga um evento da agenda.',
      schema: idArgs, run: async ({ id }) => { await s.events.remove(id); return deleted; } }),

    // Lembretes ------------------------------------------------------------------
    tool({ name: 'list_reminders', resource: 'reminder', action: 'read', label: 'os lembretes',
      description: 'Lista os lembretes avulsos (pendentes e concluídos).',
      schema: z.object({}), run: () => s.reminders.list() }),
    tool({ name: 'create_reminder', resource: 'reminder', action: 'create', label: 'um lembrete',
      description: 'Cria um lembrete avulso numa data/hora local, opcionalmente repetido (daily/weekly). Chega na caixa de entrada do app e, se pedido, no celular (push) ou WhatsApp.',
      schema: reminderCreateSchema, run: (a) => s.reminders.create(a) }),
    tool({ name: 'delete_reminder', resource: 'reminder', action: 'delete', label: 'um lembrete',
      description: 'Apaga um lembrete avulso.',
      schema: idArgs, run: async ({ id }) => { await s.reminders.remove(id); return deleted; } }),

    // Deslocamentos ----------------------------------------------------------------
    tool({ name: 'list_commutes', resource: 'commute', action: 'read', label: 'os deslocamentos',
      description: 'Lista os deslocamentos (trechos de transporte recorrentes, ex.: ida à academia), cada um vinculado a uma atividade de horário definido.',
      schema: z.object({}), run: () => s.commutes.list() }),
    tool({ name: 'create_commute', resource: 'commute', action: 'create', label: 'um deslocamento',
      description: 'Cria um deslocamento vinculado a uma atividade existente com horário definido (timeMode = fixed). direction=before termina quando o 1º bloco do dia da atividade começa (ida); after começa quando o último bloco termina (volta).',
      schema: commuteCreateSchema, run: (a) => s.commutes.create(a) }),
    tool({ name: 'update_commute', resource: 'commute', action: 'update', label: 'um deslocamento',
      description: 'Edita um deslocamento existente (informe só os campos a alterar).',
      schema: commuteUpdateSchema.extend({ id }), run: ({ id, ...patch }) => s.commutes.update(id, patch) }),
    tool({ name: 'delete_commute', resource: 'commute', action: 'delete', label: 'um deslocamento',
      description: 'Apaga um deslocamento.',
      schema: idArgs, run: async ({ id }) => { await s.commutes.remove(id); return deleted; } }),

    // Kanban: quadros e colunas ----------------------------------------------------
    tool({ name: 'list_boards', resource: 'board', action: 'read', label: 'os quadros',
      description: 'Lista os quadros kanban.', schema: z.object({}), run: () => s.boards.listBoards() }),
    tool({ name: 'get_board', resource: 'board', action: 'read', label: 'o quadro kanban',
      description: 'Devolve um quadro com colunas e cards. Sem boardId, usa o primeiro quadro.',
      schema: z.object({ boardId: id.optional() }), run: ({ boardId }) => s.boards.getBoard(boardId) }),
    tool({ name: 'create_board', resource: 'board', action: 'create', label: 'um quadro',
      description: 'Cria um quadro kanban.', schema: nameSchema, run: ({ name }) => s.boards.createBoard(name) }),
    tool({ name: 'rename_board', resource: 'board', action: 'update', label: 'um quadro',
      description: 'Renomeia um quadro.', schema: nameSchema.extend({ id }), run: ({ id, name }) => s.boards.renameBoard(id, name) }),
    tool({ name: 'delete_board', resource: 'board', action: 'delete', label: 'um quadro',
      description: 'Apaga um quadro com todas as colunas e cards.',
      schema: idArgs, run: async ({ id }) => { await s.boards.deleteBoard(id); return deleted; } }),
    tool({ name: 'create_column', resource: 'board', action: 'create', label: 'uma coluna',
      description: 'Cria uma coluna no fim de um quadro.',
      schema: nameSchema.extend({ boardId: id }), run: ({ boardId, name }) => s.boards.createColumn(boardId, name) }),
    tool({ name: 'rename_column', resource: 'board', action: 'update', label: 'uma coluna',
      description: 'Renomeia uma coluna.', schema: nameSchema.extend({ id }), run: ({ id, name }) => s.boards.renameColumn(id, name) }),
    tool({ name: 'delete_column', resource: 'board', action: 'delete', label: 'uma coluna',
      description: 'Apaga uma coluna e seus cards.',
      schema: idArgs, run: async ({ id }) => { await s.boards.deleteColumn(id); return deleted; } }),

    // Kanban: cards ------------------------------------------------------------------
    tool({ name: 'create_card', resource: 'card', action: 'create', label: 'um card',
      description: 'Cria um card no fim de uma coluna. Descrição: texto simples, parágrafos separados por linha em branco.',
      schema: cardCreateSchema.extend({ columnId: id }),
      run: ({ columnId, ...card }) => s.boards.createCard(columnId, card.description ? { ...card, description: paragraphsToHtml(card.description) } : card) }),
    tool({ name: 'update_card', resource: 'card', action: 'update', label: 'um card',
      description: 'Edita título, descrição, prazo ou atividade vinculada de um card. Descrição: texto simples, parágrafos separados por linha em branco.',
      schema: cardUpdateSchema.extend({ id }),
      run: ({ id, ...patch }) => s.boards.updateCard(id, patch.description !== undefined ? { ...patch, description: paragraphsToHtml(patch.description) } : patch) }),
    tool({ name: 'move_card', resource: 'card', action: 'update', label: 'um card',
      description: 'Move um card para outra coluna (e opcionalmente uma posição).',
      schema: cardMoveSchema.extend({ id }), run: ({ id, columnId, position }) => s.boards.moveCard(id, columnId, position) }),
    tool({ name: 'delete_card', resource: 'card', action: 'delete', label: 'um card',
      description: 'Apaga um card.',
      schema: idArgs, run: async ({ id }) => { await s.boards.deleteCard(id); return deleted; } }),

    // Revisão diária -------------------------------------------------------------------
    tool({ name: 'get_review', resource: 'review', action: 'read', label: 'a revisão do dia',
      description: 'Lê a revisão diária de uma data (4 perguntas qualitativas).',
      schema: z.object({ date: dateStr }), run: async ({ date }) => ({ date, review: await s.reviews.get(date) }) }),
    tool({ name: 'list_reviews', resource: 'review', action: 'read', label: 'as revisões',
      description: 'Lista revisões diárias de um período.',
      schema: rangeSchema, run: ({ from, to }) => s.reviews.list(from, to) }),
    tool({ name: 'save_review', resource: 'review', action: 'update', label: 'a revisão do dia',
      description: 'Cria ou atualiza a revisão diária de uma data. Campos omitidos são preservados.',
      schema: reviewSaveSchema.extend({ date: dateStr }), run: ({ date, ...fields }) => s.reviews.save(date, fields) }),

    // Meditação ------------------------------------------------------------------------
    tool({ name: 'list_meditations', resource: 'meditation', action: 'read', label: 'as meditações',
      description: 'Lista sessões de meditação (com notas 0-10) de um período.',
      schema: rangeSchema, run: ({ from, to }) => s.meditation.list(from, to) }),
    tool({ name: 'log_meditation', resource: 'meditation', action: 'create', label: 'uma meditação',
      description: 'Registra uma sessão de meditação (duração e notas 0-10 opcionais).',
      schema: meditationCreateSchema, run: (a) => s.meditation.log(a) }),
    tool({ name: 'delete_meditation', resource: 'meditation', action: 'delete', label: 'uma meditação',
      description: 'Apaga o registro de uma sessão de meditação.',
      schema: idArgs, run: async ({ id }) => { await s.meditation.remove(id); return deleted; } }),

    // Documentos -----------------------------------------------------------------------
    tool({ name: 'list_folders', resource: 'document', action: 'read', label: 'as pastas',
      description: 'Lista as pastas de documentos (as ocultas do agente não aparecem).',
      schema: z.object({}), run: async () => {
        const hidden = new Set((await s.documents.listFolders()).filter((f) => !f.agentVisible).map((f) => f.id));
        return (await s.documents.listFolders()).filter((f) => f.agentVisible && !(f.parentId && hidden.has(f.parentId)));
      } }),
    tool({ name: 'create_folder', resource: 'document', action: 'create', label: 'uma pasta',
      description: 'Cria uma pasta de documentos, opcionalmente dentro de outra.',
      schema: folderCreateSchema, run: (a) => s.documents.createFolder(a.name, a.parentId, AGENT) }),
    tool({ name: 'rename_folder', resource: 'document', action: 'update', label: 'uma pasta',
      description: 'Renomeia uma pasta.', schema: nameSchema.extend({ id }), run: ({ id, name }) => s.documents.renameFolder(id, name, AGENT) }),
    tool({ name: 'delete_folder', resource: 'document', action: 'delete', label: 'uma pasta',
      description: 'Apaga uma pasta com todas as subpastas e documentos.',
      schema: idArgs, run: async ({ id }) => { await s.documents.deleteFolder(id, AGENT); return deleted; } }),
    tool({ name: 'list_documents', resource: 'document', action: 'read', label: 'os documentos',
      description: 'Lista/pesquisa documentos (notas, listas e arquivos) com um trecho e o resumo. Filtre por folderId (ou "root" para os sem pasta) e/ou por texto (query).',
      schema: z.object({ folderId: z.union([id, z.literal('root')]).optional(), query: z.string().max(200).optional() }),
      run: async (a) => (await s.documents.list({ ...a, agent: true, limit: 50 })).map((d) => ({
        id: d.id, title: d.title, kind: d.kind, folderId: d.folderId, excerpt: d.excerpt, summary: d.summary,
      })) }),
    tool({ name: 'read_document', resource: 'document', action: 'read', label: 'um documento',
      description: 'Lê o conteúdo completo de um documento (arquivos enviados: o texto extraído). Use para resumir, responder perguntas ou extrair informações.',
      schema: idArgs, run: async ({ id }) => {
        const d = await s.documents.get(id, AGENT);
        const text = d.kind === 'note' ? textFromHtml(d.content) : d.content;
        return {
          id: d.id, title: d.title, kind: d.kind, folderId: d.folderId, summary: d.summary,
          content: text.slice(0, DOC_READ_LIMIT), truncated: text.length > DOC_READ_LIMIT,
          note: d.kind === 'file' && !d.content ? 'Este arquivo não tem texto extraível (ex.: imagem).' : undefined,
        };
      } }),
    tool({ name: 'create_document', resource: 'document', action: 'create', label: 'um documento',
      description: 'Cria uma nota (texto livre, parágrafos separados por linha em branco viram parágrafos formatados) ou uma lista (checklist: uma linha "- [ ] item" por item, "- [x]" para feito), opcionalmente numa pasta.',
      schema: docCreateSchema, run: (a) => s.documents.create(a.kind === 'note' && a.content ? { ...a, content: paragraphsToHtml(a.content) } : a, AGENT) }),
    tool({ name: 'update_document', resource: 'document', action: 'update', label: 'um documento',
      description: 'Edita título, conteúdo (content substitui; appendContent acrescenta), resumo ou pasta de um documento. Para marcar itens de uma lista, reescreva o conteúdo com "- [x]". Notas: escreva texto simples, parágrafos separados por linha em branco.',
      schema: docUpdateSchema.extend({ id }), run: async ({ id, ...patch }) => {
        // content (substituir) precisa virar HTML aqui; appendContent (acrescentar) o próprio serviço converte, pra nota.
        const isNote = patch.content !== undefined && (await s.documents.get(id, AGENT)).kind === 'note';
        return s.documents.update(id, isNote ? { ...patch, content: paragraphsToHtml(patch.content!) } : patch, AGENT);
      } }),
    tool({ name: 'delete_document', resource: 'document', action: 'delete', label: 'um documento',
      description: 'Apaga um documento.',
      schema: idArgs, run: async ({ id }) => { await s.documents.remove(id, AGENT); return deleted; } }),

    // Perfil do usuário -------------------------------------------------------------------
    tool({ name: 'get_profile_info', resource: 'profile', action: 'read', label: 'as informações pessoais',
      description: 'Informações gerais do usuário (já enviadas no início da conversa) e a lista de títulos das informações privadas/secretas (sem o conteúdo).',
      schema: z.object({}), run: () => s.profile.agentOverview() }),
    tool({ name: 'read_profile_item', resource: 'profile', action: 'read', label: 'uma informação protegida', defaultMode: 'confirm',
      description: 'Lê o conteúdo de uma informação privada ou secreta do usuário. Itens secretos só abrem se o cofre estiver desbloqueado. Peça só quando for realmente necessário.',
      schema: idArgs, run: ({ id }) => s.profile.readForAgent(id) }),
    tool({ name: 'save_profile_item', resource: 'profile', action: 'update', label: 'uma informação pessoal',
      description: 'Guarda (ou atualiza, com id) uma informação sobre o usuário, como alergias ou preferências. Nunca use para segredos: só os níveis general e private.',
      schema: z.object({ id: id.optional(), title: z.string().min(1).max(120), content: z.string().max(4000), level: z.enum(['general', 'private']) }),
      run: (a) => s.profile.saveForAgent(a) }),

    // Interface -----------------------------------------------------------------------------
    tool({ name: 'offer_options', resource: 'agent', action: 'read', label: 'opções de resposta', internal: true,
      description: 'Mostra 2 a 4 botões de resposta rápida abaixo da sua mensagem (ex.: propostas que o usuário aceita com um toque). Escreva a mensagem ANTES e não escreva nada depois desta chamada.',
      schema: z.object({ options: z.array(z.string().min(1).max(80)).min(2).max(4).describe('frases curtas, na voz do usuário (ex.: "Sim, monte a lista")') }),
      run: async () => ({ shown: true }) }),
    tool({ name: 'offer_links', resource: 'agent', action: 'read', label: 'atalhos para telas', internal: true,
      description: 'Mostra até 3 botões que abrem uma tela do app (ex.: {"label":"Ver movimentações de alimentação","href":"/financas?tab=movimentacoes&category=…"}). Use para levar o usuário à análise que você mencionou, depois de responder por escrito.',
      schema: z.object({ links: z.array(z.object({ label: z.string().min(1).max(60), href: z.string().max(300).regex(/^\/(?!\/)/) })).min(1).max(3) }),
      run: async () => ({ shown: true }) }),
  ];
}
