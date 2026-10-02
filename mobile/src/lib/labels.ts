// Espelho (recortado) de web/src/lib/labels.ts.
import type { ActivityKind, CommuteDirection, NotifyChannel, Period, Repeat, TimeBlock, Activity } from '../api/types';
import type { Level } from '../api/types';

export const RESOURCE_LABEL: Record<string, string> = {
  activity: 'Atividades', execution: 'Execução diária', event: 'Agenda', reminder: 'Lembretes', commute: 'Deslocamentos',
  board: 'Quadros e colunas', card: 'Cards', review: 'Revisão diária', meditation: 'Meditação',
  document: 'Documentos', profile: 'Perfil', finance: 'Finanças', assistant: 'Assistente', gym: 'Academia',
  reading: 'Leitura', study: 'Estudos',
};
export const ACTION_LABEL: Record<string, string> = { create: 'Criar', update: 'Atualizar', delete: 'Apagar' };

export const KIND_LABEL: Record<ActivityKind, string> = { obligation: 'Obrigação', goal: 'Objetivo', special: 'Objetivo especial (meditação)' };
export const DIRECTION_LABEL: Record<CommuteDirection, string> = { before: 'Ida (antes da atividade)', after: 'Volta (depois da atividade)' };
export const PERIOD_LABEL: Record<Period, string> = { morning: 'Manhã', afternoon: 'Tarde', night: 'Noite' };
export const LEVEL_LABEL: Record<Level, string> = { min: 'Mínimo', ideal: 'Ideal', max: 'Máximo' };
export const LEVELS: Level[] = ['min', 'ideal', 'max'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const CHANNEL_LABEL: Record<NotifyChannel, string> = { push: 'Notificação no celular', whatsapp: 'WhatsApp' };
export const REPEAT_LABEL: Record<Repeat, string> = { none: 'Não repetir', daily: 'Todo dia', weekly: 'Toda semana' };

export const blocksLabel = (blocks: TimeBlock[]): string => blocks.map((b) => `${b.startTime}${b.endTime ? `–${b.endTime}` : ''}`).join(', ');

export function timeLabel(a: Pick<Activity, 'timeMode' | 'period' | 'weekdays' | 'blocks' | 'weekdayBlocks'>): string {
  if (a.timeMode === 'fixed') return blocksLabel(a.blocks);
  if (a.timeMode === 'period') return a.period ? PERIOD_LABEL[a.period] : 'Período';
  return 'Horário livre';
}
