// Contratos de entrada dos casos de uso. São compartilhados pela API HTTP e pelas tools do agente:
// uma única definição, dois consumidores.
// Regra: nada de .default() aqui — defaults são aplicados nos serviços, senão um PATCH
// parcial sobrescreveria campos com valores padrão.
import { z } from 'zod';
import { ACTIVITY_KINDS, LEVELS, NOTIFY_CHANNELS, PERIODS, REPEATS, TIME_MODES } from '../domain/constants';

export const id = z.string().regex(/^[0-9a-fA-F-]{36}$/, 'id inválido');
export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use o formato YYYY-MM-DD').describe('YYYY-MM-DD');
export const dateTimeStr = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'use o formato YYYY-MM-DDTHH:mm (hora local)').describe('YYYY-MM-DDTHH:mm, hora local');
export const timeStr = z.string().regex(/^\d{2}:\d{2}$/, 'use o formato HH:mm').describe('HH:mm');
const score = z.number().int().min(0).max(10);
const channels = z.array(z.enum(NOTIFY_CHANNELS)).describe('canais extras de lembrete: push (celular) e/ou whatsapp; a caixa de entrada do app é sempre usada');

export const rangeSchema = z.object({ from: dateStr, to: dateStr });
export const dateRangeSchema = rangeSchema;
export const dateTimeRangeSchema = z.object({ from: dateTimeStr, to: dateTimeStr });

// Atividades ------------------------------------------------------------
export const timeBlockSchema = z.object({ startTime: timeStr, endTime: timeStr.nullable().optional() });
export const weekdayBlocksSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  blocks: z.array(timeBlockSchema).min(1).max(6),
});
export const activityCreateSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.enum(ACTIVITY_KINDS).describe('obligation = obrigação; goal = objetivo; special = objetivo especial (meditação)'),
  timeMode: z.enum(TIME_MODES).optional().describe('fixed = horário definido; period = período definido; free = horário livre'),
  period: z.enum(PERIODS).nullable().optional().describe('obrigatório se timeMode = period'),
  blocks: z.array(timeBlockSchema).max(6).optional().describe('obrigatório (≥1) se timeMode = fixed: bloco(s) de horário padrão do dia (ex.: manhã e tarde). É o padrão dos dias sem exceção em weekdayBlocks'),
  weekdayBlocks: z.array(weekdayBlocksSchema).max(7).optional().describe('só para timeMode = fixed: bloco(s) diferentes em dias específicos (ex.: academia só de manhã no fim de semana). Cada weekday só pode aparecer uma vez; dias fora daqui usam "blocks"'),
  notBefore: timeStr.nullable().optional().describe('"depois das": horário mínimo de início (só para objetivos sem horário definido)'),
  notAfter: timeStr.nullable().optional().describe('"antes das": horário em que a atividade deve terminar (só para objetivos sem horário definido)'),
  durationMin: z.number().int().min(5).max(480).optional().describe('duração em minutos (padrão 60)'),
  purpose: z.string().max(500).optional().describe('finalidade da atividade'),
  principle: z.string().max(500).optional().describe('princípio comportamental: como quero me comportar ao realizar'),
  minDesc: z.string().max(200).optional().describe('descrição do nível mínimo (ex: "5 páginas")'),
  idealDesc: z.string().max(200).optional(),
  maxDesc: z.string().max(200).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional().describe('dias da semana (0 = domingo). Padrão: todos'),
  active: z.boolean().optional(),
  remindTime: timeStr.nullable().optional().describe('horário do lembrete diário (HH:mm); null desliga'),
  remindChannels: channels.optional(),
});
export const activityUpdateSchema = activityCreateSchema.partial();

// Execuções -------------------------------------------------------------
export const executionSetSchema = z.object({
  activityId: id,
  date: dateStr,
  level: z.enum(LEVELS).describe('min = mínimo; ideal; max = máximo'),
  note: z.string().max(500).optional(),
});
export const executionClearSchema = z.object({ activityId: id, date: dateStr });

// Agenda ----------------------------------------------------------------
export const eventCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  start: dateTimeStr,
  end: dateTimeStr,
  activityId: id.nullable().optional(),
  location: z.string().max(200).optional().describe('local do compromisso (ex.: Farmácia Central, Mercado)'),
  remindMinutes: z.number().int().min(0).max(10080).nullable().optional().describe('avisar X minutos antes; null desliga'),
  remindChannels: channels.optional(),
});
export const eventUpdateSchema = eventCreateSchema.partial();

// Kanban ----------------------------------------------------------------
export const nameSchema = z.object({ name: z.string().min(1).max(120) });
export const cardCreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  dueDate: dateStr.nullable().optional(),
  activityId: id.nullable().optional(),
});
export const cardUpdateSchema = cardCreateSchema.partial();
export const cardMoveSchema = z.object({
  columnId: id,
  position: z.number().int().min(0).optional().describe('índice na coluna de destino; omitido = final'),
});

// Revisão diária e meditação ---------------------------------------------
export const reviewSaveSchema = z.object({
  responsibilities: z.string().max(2000).optional().describe('Cumpri minhas responsabilidades?'),
  goals: z.string().max(2000).optional().describe('Mantive meus objetivos?'),
  state: z.string().max(2000).optional().describe('Como estava meu estado mental, físico e espiritual?'),
  learned: z.string().max(2000).optional().describe('O que aprendi sobre mim hoje?'),
});
export const meditationCreateSchema = z.object({
  date: dateStr,
  durationMin: z.number().int().min(1).max(300),
  attention: score.nullable().optional().describe('facilidade de atenção, 0-10'),
  spatial: score.nullable().optional().describe('qualidade da reconstrução espacial, 0-10'),
  sound: score.nullable().optional().describe('facilidade de localização sonora, 0-10'),
  imagery: score.nullable().optional().describe('riqueza da imagética, 0-10'),
  afterState: score.nullable().optional().describe('estado após a prática, 0-10'),
  note: z.string().max(1000).optional(),
});

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
export type ActivityUpdateInput = z.infer<typeof activityUpdateSchema>;
export type EventCreateInput = z.infer<typeof eventCreateSchema>;
export type EventUpdateInput = z.infer<typeof eventUpdateSchema>;
export type CardCreateInput = z.infer<typeof cardCreateSchema>;
export type CardUpdateInput = z.infer<typeof cardUpdateSchema>;
export type MeditationCreateInput = z.infer<typeof meditationCreateSchema>;

// Lembretes ---------------------------------------------------------------
export const reminderCreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  at: dateTimeStr.describe('quando avisar, hora local (YYYY-MM-DDTHH:mm)'),
  repeat: z.enum(REPEATS).optional().describe('none (padrão), daily ou weekly'),
  channels: channels.optional(),
  activityId: id.nullable().optional(),
});

export const reminderUpdateSchema = reminderCreateSchema.omit({ activityId: true }).partial().extend({
  done: z.boolean().optional().describe('true marca como concluído; false reativa'),
});

// Perfil e cofre -----------------------------------------------------------
export const profileCreateSchema = z.object({
  title: z.string().min(1).max(120),
  content: z.string().max(4000),
  level: z.enum(['general', 'private', 'secret']),
});
export const profileUpdateSchema = profileCreateSchema.partial();
export const passwordSchema = z.object({ password: z.string().min(1).max(200) });

// Princípios (protegidos pela senha do Cofre) -------------------------------
export const principleFolderSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const principleCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(4000),
  folderId: id.nullable().optional(),
});
export const principleUpdateSchema = principleCreateSchema.partial();
/** Lembrete é por pasta/categoria: cada pasta tem seu próprio horário, dias e canais. */
export const principleReminderSchema = z.object({
  enabled: z.boolean().optional(),
  times: z.array(timeStr).max(10).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  channels: channels.optional(),
});

// Documentos ---------------------------------------------------------------
export const folderCreateSchema = z.object({ name: z.string().min(1).max(120), parentId: id.nullable().optional() });
export const docCreateSchema = z.object({
  title: z.string().min(1).max(200),
  kind: z.enum(['note', 'list']).describe('note = texto livre (markdown); list = checklist, uma linha "- [ ] item" por item'),
  content: z.string().max(200_000).optional(),
  folderId: id.nullable().optional(),
});
export const docUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(200_000).optional().describe('substitui todo o conteúdo'),
  appendContent: z.string().max(50_000).optional().describe('acrescenta ao final (em nova linha)'),
  summary: z.string().max(5000).optional(),
  folderId: id.nullable().optional(),
});

export type ReminderCreateInput = z.infer<typeof reminderCreateSchema>;
export type ReminderUpdateInput = z.infer<typeof reminderUpdateSchema>;
export type DocCreateInput = z.infer<typeof docCreateSchema>;
export type DocUpdateInput = z.infer<typeof docUpdateSchema>;
