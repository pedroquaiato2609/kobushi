import type { Activity, ActivityKind, Level, Period, TimeBlock } from '../api/types';
import { effectiveBlocks } from './schedule';

export const KIND_LABEL: Record<ActivityKind, string> = { obligation: 'Obrigação', goal: 'Objetivo', special: 'Objetivo especial (meditação)' };
export const KIND_GROUP: Record<ActivityKind, string> = { obligation: 'Obrigações', goal: 'Objetivos', special: 'Meditação' };
export const PERIOD_LABEL: Record<Period, string> = { morning: 'Manhã', afternoon: 'Tarde', night: 'Noite' };
export const LEVEL_LABEL: Record<Level, string> = { min: 'Mínimo', ideal: 'Ideal', max: 'Máximo' };
export const LEVELS: Level[] = ['min', 'ideal', 'max'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** "07:30–11:30, 13:30–17:30" */
export const blocksLabel = (blocks: TimeBlock[]): string => blocks.map((b) => `${b.startTime}${b.endTime ? `–${b.endTime}` : ''}`).join(', ');

/** Resumo do horário; quando há exceção por dia, agrupa os dias que compartilham o mesmo horário (ex.: "Seg–Sex 07:30–11:30, 13:30–17:30 · Sáb, Dom 09:00–10:00"). */
export function timeLabel(a: Pick<Activity, 'timeMode' | 'period' | 'weekdays' | 'blocks' | 'weekdayBlocks'>): string {
  if (a.timeMode === 'fixed') {
    const base = blocksLabel(a.blocks);
    if (a.weekdayBlocks.length === 0) return base;
    const groups: { days: number[]; time: string }[] = [];
    for (const d of [...a.weekdays].sort((x, y) => x - y)) {
      const t = blocksLabel(effectiveBlocks(a, d));
      const last = groups[groups.length - 1];
      if (last && last.time === t) last.days.push(d); else groups.push({ days: [d], time: t });
    }
    return groups.map((g) => `${g.days.length > 2 ? `${WEEKDAY_SHORT[g.days[0]]}–${WEEKDAY_SHORT[g.days[g.days.length - 1]]}` : g.days.map((d) => WEEKDAY_SHORT[d]).join(', ')} ${g.time}`).join(' · ');
  }
  if (a.timeMode === 'period') return a.period ? PERIOD_LABEL[a.period] : 'Período';
  return 'Horário livre';
}

export const RESOURCE_LABEL: Record<string, string> = {
  activity: 'Atividades', execution: 'Execução diária e estatísticas', event: 'Agenda', reminder: 'Lembretes',
  board: 'Quadros e colunas', card: 'Cards', review: 'Revisão diária', meditation: 'Meditação',
  document: 'Documentos', profile: 'Perfil e informações pessoais', finance: 'Finanças (sempre pede sua confirmação para gravar)', assistant: 'Sugestões do assistente', gym: 'Academia (treinos e exercícios)',
  reading: 'Leitura (livros e sessões de leitura)',
  study: 'Estudos (notas e planos de estudo)',
};
export const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando aprovação', executed: 'Executada', denied: 'Negada', rejected: 'Rejeitada', error: 'Erro',
};
export const humanizeTool = (name: string) => name.replace(/_/g, ' ');

// Frases das ações do agente no chat: "Consultou a rotina do dia", "Criando um card…"
const VERBS = {
  read: ['Consultou', 'Consultando', 'consultar'],
  create: ['Criou', 'Criando', 'criar'],
  update: ['Atualizou', 'Atualizando', 'atualizar'],
  delete: ['Apagou', 'Apagando', 'apagar'],
} as const;
export type ToolPhase = 'run' | 'ok' | 'error' | 'pending' | 'ask';

export function toolPhrase(row: { action: keyof typeof VERBS; label: string } | undefined, name: string, phase: ToolPhase): string {
  if (!row) return humanizeTool(name);
  const [past, ing, inf] = VERBS[row.action];
  switch (phase) {
    case 'run': return `${ing} ${row.label}…`;
    case 'ok': return `${past} ${row.label}`;
    case 'error': return `Não consegui ${inf} ${row.label}`;
    case 'pending': return `Aguardando sua aprovação para ${inf} ${row.label}`;
    default: return `Quer ${inf} ${row.label}`;
  }
}

export const CHANNEL_LABEL = { push: 'Notificação no celular', whatsapp: 'WhatsApp' } as const;
export const REPEAT_LABEL = { none: 'Não repetir', daily: 'Todo dia', weekly: 'Toda semana' } as const;
export const LEVEL_PROFILE = {
  general: { name: 'Geral', hint: 'A IA vê em toda conversa. Ex.: nome, alergias, preferências.' },
  private: { name: 'Privado', hint: 'A IA só lê se você aprovar cada vez. Ex.: plano de saúde, endereço.' },
  secret: { name: 'Secreto', hint: 'Criptografado; exige a senha do cofre. Ex.: senhas, documentos.' },
} as const;

/** "Apagar um card" — nome curto da ferramenta, para listas e históricos. */
export function toolTitle(row: { action: keyof typeof VERBS; label: string } | undefined, name: string): string {
  if (!row) return humanizeTool(name);
  const inf = VERBS[row.action][2];
  return `${inf.charAt(0).toUpperCase()}${inf.slice(1)} ${row.label}`;
}
