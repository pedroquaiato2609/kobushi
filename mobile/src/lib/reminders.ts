// Mirror de web/src/lib/reminders.ts (só o necessário pra tela de Lembretes do mobile).
import type { Activity, CalendarEvent, Commute, NotifyChannel, Reminder } from '../api/types';
import { addDaysIso, todayISO } from './dates';
import { commuteBlock, effectiveBlocks, toHHmm, toMin } from './schedule';

export type ReminderKind = 'reminder' | 'activity' | 'event' | 'commute';
export interface ReminderItem {
  key: string; kind: ReminderKind; title: string; detail: string;
  at: string; // 'YYYY-MM-DDTHH:mm' do próximo aviso
  done: boolean; repeat: 'none' | 'daily' | 'weekly' | 'activity';
  channels: NotifyChannel[];
  reminder?: Reminder; activity?: Activity; event?: CalendarEvent; commute?: Commute;
}

const parseYmd = (s: string) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
const weekday = (day: string) => parseYmd(day).getDay();

/** Horário do aviso de uma atividade NUM dia: fixo (remindTime), ou calculado a partir do 1º bloco efetivo do dia. */
export function activityRemindAt(a: Activity, day: string): string | null {
  if (a.remindTime) return `${day}T${a.remindTime}`;
  if (a.remindMinutes == null) return null;
  const first = effectiveBlocks(a, weekday(day))[0];
  return first ? `${day}T${toHHmm(Math.max(0, toMin(first.startTime) - a.remindMinutes))}` : null;
}

/** Horário do aviso de um deslocamento NUM dia: fixo (remindTime), ou calculado a partir do início da janela do dia. */
export function commuteRemindAt(c: Commute, activity: Activity, day: string): string | null {
  if (!c.remindTime && c.remindMinutes == null) return null;
  const block = commuteBlock(activity, weekday(day), c.direction, c.durationMin);
  if (!block) return null;
  if (c.remindTime) return `${day}T${c.remindTime}`;
  return `${day}T${toHHmm(Math.max(0, toMin(block.startTime) - c.remindMinutes!))}`;
}

function eventRemindAt(ev: CalendarEvent): string | null {
  if (ev.remindMinutes === null || ev.remindMinutes === undefined) return null;
  return new Date(new Date(ev.start).getTime() - ev.remindMinutes * 60_000).toISOString().slice(0, 16);
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
const fromCommute = (c: Commute, at: string): ReminderItem => ({
  key: `c-${c.id}`, kind: 'commute', title: c.name, detail: 'Aviso do deslocamento', at, done: false, repeat: 'activity', channels: c.remindChannels, commute: c,
});

/** Próximo aviso de cada lembrete, atividade com aviso, evento com aviso e deslocamento com aviso; pendentes por data, concluídos no fim. */
export function upcomingReminders(reminders: Reminder[], activities: Activity[], events: CalendarEvent[], commutes: Commute[], now: Date): ReminderItem[] {
  const nowTs = now.toISOString().slice(0, 16);
  const today = todayISO();
  const out: ReminderItem[] = reminders.map((r) => fromReminder(r, r.remindAt));
  for (const a of activities) {
    if (!a.active || (!a.remindTime && a.remindMinutes == null)) continue;
    for (let i = 0; i < 8; i++) {
      const day = addDaysIso(today, i);
      if (!a.weekdays.includes(weekday(day))) continue;
      const at = activityRemindAt(a, day);
      if (at && at >= nowTs) { out.push(fromActivity(a, at)); break; }
    }
  }
  for (const e of events) {
    const at = eventRemindAt(e);
    if (at && at >= nowTs) out.push(fromEvent(e, at));
  }
  const activityById = new Map(activities.map((a) => [a.id, a]));
  for (const c of commutes) {
    if (!c.active || (!c.remindTime && c.remindMinutes == null)) continue;
    const act = activityById.get(c.activityId);
    if (!act) continue;
    for (let i = 0; i < 8; i++) {
      const day = addDaysIso(today, i);
      if (!act.active || !act.weekdays.includes(weekday(day))) continue;
      const at = commuteRemindAt(c, act, day);
      if (at && at >= nowTs) { out.push(fromCommute(c, at)); break; }
    }
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || a.at.localeCompare(b.at));
}
