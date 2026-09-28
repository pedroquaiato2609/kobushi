// Utilitários puros para datas 'YYYY-MM-DD' (sem dependência de fuso do servidor).

export function dateInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function todayIn(tz: string, now = new Date()): string {
  return dateInTz(now, tz);
}

/** 'YYYY-MM-DD HH:mm' no fuso informado. */
export function nowLocal(tz: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Ex.: 'GMT-03:00' */
export function tzOffsetLabel(tz: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(now);
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT';
}

/** Hora local no formato usado pela agenda: 'YYYY-MM-DDTHH:mm'. */
export function nowLocalTs(tz: string, now = new Date()): string {
  return nowLocal(tz, now).replace(' ', 'T');
}

export const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Próxima ocorrência (estritamente depois de `now`) de um lembrete que se repete. */
export function nextOccurrence(at: string, repeat: 'daily' | 'weekly', now: string): string {
  const step = repeat === 'daily' ? 1 : 7;
  const time = at.slice(10);
  let day = at.slice(0, 10);
  let next = `${day}${time}`;
  while (next <= now) {
    day = addDays(day, step);
    next = `${day}${time}`;
  }
  return next;
}
