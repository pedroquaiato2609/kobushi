import type { Activity, Execution, Level } from '../api/types';
import { parseYmd, ymd } from './dates';
import { effectiveTime } from './schedule';

export interface Occurrence { activity: Activity; date: string; level: Level | null }

const PERIOD_ORDER = { morning: 0, afternoon: 1, night: 2 } as const;

/** Atividades que se aplicam a um dia, com o nível já registrado. Ordem: horário fixo, período, livre. */
export function occurrencesOn(date: string, activities: Activity[], executions: Execution[]): Occurrence[] {
  const weekday = parseYmd(date).getDay();
  const done = new Map(executions.filter((e) => e.date === date).map((e) => [e.activityId, e.level] as const));
  const rank = (a: Activity) => (a.timeMode === 'fixed' ? 0 : a.timeMode === 'period' ? 1 + PERIOD_ORDER[a.period ?? 'morning'] : 5);
  return activities
    .filter((a) => a.active && a.weekdays.includes(weekday) && ymd(new Date(a.createdAt)) <= date)
    .sort((a, b) => rank(a) - rank(b) || (effectiveTime(a, weekday).startTime ?? '').localeCompare(effectiveTime(b, weekday).startTime ?? '') || a.name.localeCompare(b.name))
    .map((activity) => ({ activity, date, level: done.get(activity.id) ?? null }));
}
