import type { Activity, Commute, Execution, Level } from '../api/types';
import { parseYmd, ymd } from './dates';
import { commuteBlock, effectiveBlocks, type CommuteWindow } from './schedule';

export interface Occurrence { activity: Activity; date: string; level: Level | null }
export interface CommuteOccurrence { commute: Commute; activity: Activity; date: string; block: CommuteWindow }

const PERIOD_ORDER = { morning: 0, afternoon: 1, night: 2 } as const;

/** Atividades que se aplicam a um dia, com o nível já registrado. Ordem: horário fixo, período, livre. */
export function occurrencesOn(date: string, activities: Activity[], executions: Execution[]): Occurrence[] {
  const weekday = parseYmd(date).getDay();
  const done = new Map(executions.filter((e) => e.date === date).map((e) => [e.activityId, e.level] as const));
  const rank = (a: Activity) => (a.timeMode === 'fixed' ? 0 : a.timeMode === 'period' ? 1 + PERIOD_ORDER[a.period ?? 'morning'] : 5);
  return activities
    .filter((a) => a.active && a.weekdays.includes(weekday) && ymd(new Date(a.createdAt)) <= date)
    .sort((a, b) => rank(a) - rank(b) || (effectiveBlocks(a, weekday)[0]?.startTime ?? '').localeCompare(effectiveBlocks(b, weekday)[0]?.startTime ?? '') || a.name.localeCompare(b.name))
    .map((activity) => ({ activity, date, level: done.get(activity.id) ?? null }));
}

/** Deslocamentos que se aplicam a um dia, com a janela já calculada. Sem execução/nível (não são checklist). */
export function commutesOn(date: string, commutes: Commute[], activities: Activity[]): CommuteOccurrence[] {
  const weekday = parseYmd(date).getDay();
  const byId = new Map(activities.map((a) => [a.id, a]));
  return commutes.flatMap((c) => {
    if (!c.active) return [];
    const activity = byId.get(c.activityId);
    if (!activity || !activity.active || activity.timeMode !== 'fixed' || !activity.weekdays.includes(weekday)) return [];
    const block = commuteBlock(activity, weekday, c.direction, c.durationMin);
    return block ? [{ commute: c, activity, date, block }] : [];
  });
}
