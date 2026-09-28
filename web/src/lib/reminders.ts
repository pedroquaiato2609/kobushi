import { addDays } from 'date-fns';
import type { Activity, CalendarEvent, NotifyChannel, Reminder } from '../api/types';
import { parseTs, parseYmd, ts, ymd } from './dates';
import { effectiveBlocks, toHHmm, toMin } from './schedule';

export type ReminderKind = 'reminder' | 'activity' | 'event';
export interface ReminderItem {
  key: string; kind: ReminderKind; title: string; detail: string;
  at: string; // 'YYYY-MM-DDTHH:mm' do próximo aviso (ou do aviso em questão)
  done: boolean; repeat: 'none' | 'daily' | 'weekly' | 'activity';
  channels: NotifyChannel[];
  reminder?: Reminder; activity?: Activity; event?: CalendarEvent;
}

const weekday = (day: string) => parseYmd(day).getDay();
const createdDay = (a: Activity) => ymd(new Date(a.createdAt));

/** Quando um evento com aviso antecipado deve avisar. */
export function eventRemindAt(ev: CalendarEvent): string | null {
  if (ev.remindMinutes === null || ev.remindMinutes === undefined) return null;
  return ts(new Date(parseTs(ev.start).getTime() - ev.remindMinutes * 60_000));
}

/** Horário do aviso de uma atividade NUM dia: fixo (remindTime), ou calculado a partir do 1º bloco efetivo do dia (remindMinutes). */
export function activityRemindAt(a: Activity, day: string): string | null {
  if (a.remindTime) return `${day}T${a.remindTime}`;
  if (a.remindMinutes == null) return null;
  const first = effectiveBlocks(a, weekday(day))[0];
  return first ? `${day}T${toHHmm(Math.max(0, toMin(first.startTime) - a.remindMinutes))}` : null;
}

const fromReminder = (r: Reminder, at: string): ReminderItem => ({
  key: `r-${r.id}`, kind: 'reminder', title: r.title, detail: r.body, at, done: r.status === 'done', repeat: r.repeat, channels: r.channels, reminder: r,
});
const fromActivity = (a: Activity, at: string): ReminderItem => ({
  key: `a-${a.id}`, kind: 'activity', title: a.name, detail: 'Aviso diário da atividade', at, done: false, repeat: 'activity', channels: a.remindChannels, activity: a,
});
const fromEvent = (e: CalendarEvent, at: string): ReminderItem => ({
  key: `e-${e.id}`, kind: 'event', title: e.title, detail: e.location ? `Aviso antes do evento · ${e.location}` : 'Aviso antes do evento', at, done: false, repeat: 'none', channels: e.remindChannels, event: e,
});

/** Tudo o que vai avisar num dia (para o resumo do dia na agenda). */
export function remindersOnDay(day: string, reminders: Reminder[], activities: Activity[], events: CalendarEvent[]): ReminderItem[] {
  const out: ReminderItem[] = [];
  for (const r of reminders) {
    const d = r.remindAt.slice(0, 10);
    const hit = r.status === 'done' || r.repeat === 'none' ? d === day
      : r.repeat === 'daily' ? day >= d
      : day >= d && weekday(day) === weekday(d);
    if (hit) out.push(fromReminder(r, `${day}${r.remindAt.slice(10)}`));
  }
  for (const a of activities) {
    if (!a.active || !a.weekdays.includes(weekday(day)) || createdDay(a) > day) continue;
    const at = activityRemindAt(a, day);
    if (at) out.push(fromActivity(a, at));
  }
  for (const e of events) {
    const at = eventRemindAt(e);
    if (at && at.slice(0, 10) === day) out.push(fromEvent(e, at));
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

/** Próximo aviso de cada lembrete, atividade com aviso e evento com aviso; pendentes por data, concluídos no fim. */
export function upcomingReminders(reminders: Reminder[], activities: Activity[], events: CalendarEvent[], now: Date): ReminderItem[] {
  const nowTs = ts(now);
  const out: ReminderItem[] = reminders.map((r) => fromReminder(r, r.remindAt));
  for (const a of activities) {
    if (!a.active || (!a.remindTime && a.remindMinutes == null)) continue;
    for (let i = 0; i < 8; i++) {
      const day = ymd(addDays(now, i));
      if (!a.weekdays.includes(weekday(day))) continue;
      const at = activityRemindAt(a, day);
      if (at && at >= nowTs) { out.push(fromActivity(a, at)); break; }
    }
  }
  for (const e of events) {
    const at = eventRemindAt(e);
    if (at && at >= nowTs) out.push(fromEvent(e, at));
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at));
}
