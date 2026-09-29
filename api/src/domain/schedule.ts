// Janelas de horário dos objetivos sem horário fixo. Espelhado em web/src/lib/schedule.ts (o teste garante que não divergem).
import type { CommuteDirection, Period } from './constants';

export const PERIOD_WINDOW: Record<Period, readonly [number, number]> = { morning: [360, 720], afternoon: [720, 1080], night: [1080, 1380] };
export const FREE_WINDOW = [360, 1380] as const; // 06:00–23:00

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export interface Windowed { period: Period | null; notBefore: string | null; notAfter: string | null; durationMin: number }

export interface TimeBlock { startTime: string; endTime: string | null }
export interface Timed { blocks: TimeBlock[]; weekdayBlocks: { weekday: number; blocks: TimeBlock[] }[] }

/** Bloco(s) de uma atividade "fixed" NUM dia específico: usa a exceção desse dia, senão os blocos padrão. */
export function effectiveBlocks(a: Timed, weekday: number): TimeBlock[] {
  const override = a.weekdayBlocks.find((w) => w.weekday === weekday);
  return override ? override.blocks : a.blocks;
}

/** "07:30–11:30, 13:30–17:30" */
export const blocksLabel = (blocks: TimeBlock[]): string => blocks.map((b) => `${b.startTime}${b.endTime ? `–${b.endTime}` : ''}`).join(', ');

/** Janela permitida = período (ou o dia todo) ∩ "depois das" ∩ "antes das". Vazia quando não cabe a duração. */
export function windowFor(a: Windowed): [number, number] | null {
  const [pStart, pEnd] = a.period ? PERIOD_WINDOW[a.period] : FREE_WINDOW;
  const start = Math.max(pStart, a.notBefore ? toMin(a.notBefore) : 0);
  const end = Math.min(pEnd, a.notAfter ? toMin(a.notAfter) : 1440);
  return end - start >= Math.min(a.durationMin, 5) && end > start ? [start, end] : null;
}

export interface CommuteWindow { startTime: string; endTime: string }

/**
 * Janela do deslocamento NUM dia da semana, derivada do(s) bloco(s) efetivos da atividade âncora nesse dia.
 * "before": termina quando o 1º bloco começa (ida). "after": começa quando o último bloco termina (volta) —
 * null se esse bloco não tiver hora de fim (aberto) ou se a atividade não tiver bloco algum nesse dia. O
 * chamador já deve ter checado que a atividade está ativa e que o dia está em activity.weekdays (mesma
 * convenção de effectiveBlocks, que também não se autoverifica).
 */
export function commuteBlock(a: Timed, weekday: number, direction: CommuteDirection, durationMin: number): CommuteWindow | null {
  const blocks = effectiveBlocks(a, weekday);
  if (blocks.length === 0) return null;
  if (direction === 'before') {
    const first = blocks[0];
    return { startTime: toHHmm(Math.max(0, toMin(first.startTime) - durationMin)), endTime: first.startTime };
  }
  const last = blocks[blocks.length - 1];
  if (!last.endTime) return null;
  return { startTime: last.endTime, endTime: toHHmm(Math.min(1440, toMin(last.endTime) + durationMin)) };
}

/** Lê o JSON da IA e confere se o início cabe na janela. Devolve null se a resposta não presta. */
export function parseSuggestion(text: string, window: [number, number], durationMin: number): { start: string; reason: string } | null {
  const raw = /\{[\s\S]*\}/.exec(text)?.[0];
  if (!raw) return null;
  let j: any;
  try { j = JSON.parse(raw); } catch { return null; }
  if (typeof j?.start !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(j.start)) return null;
  const s = toMin(j.start);
  if (s < window[0] || s + Math.min(durationMin, window[1] - window[0]) > window[1]) return null;
  return { start: j.start, reason: String(j.reason ?? '').replace(/\s+/g, ' ').trim().slice(0, 200) };
}
