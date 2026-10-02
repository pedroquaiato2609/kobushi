// Mirror exato de web/src/lib/schedule.ts (que por sua vez espelha api/src/domain/schedule.ts).
// Só as funções usadas no mobile: janela de horário livre e bloco de deslocamento.
import type { Activity, CommuteDirection, Period, TimeBlock } from '../api/types';

export const PERIOD_WINDOW: Record<Period, readonly [number, number]> = { morning: [360, 720], afternoon: [720, 1080], night: [1080, 1380] };
export const FREE_WINDOW = [360, 1380] as const; // 06:00–23:00

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

type Windowed = Pick<Activity, 'period' | 'notBefore' | 'notAfter' | 'durationMin'>;

/** Janela permitida = período (ou o dia todo) ∩ "depois das" ∩ "antes das". null quando não sobra espaço. */
export function windowFor(a: Windowed): [number, number] | null {
  const [pStart, pEnd] = a.period ? PERIOD_WINDOW[a.period] : FREE_WINDOW;
  const start = Math.max(pStart, a.notBefore ? toMin(a.notBefore) : 0);
  const end = Math.min(pEnd, a.notAfter ? toMin(a.notAfter) : 1440);
  return end - start >= Math.min(a.durationMin, 5) && end > start ? [start, end] : null;
}

type Timed = Pick<Activity, 'blocks' | 'weekdayBlocks'>;

/** Bloco(s) de uma atividade "fixed" NUM dia específico: usa a exceção desse dia, senão os blocos padrão. */
export function effectiveBlocks(a: Timed, weekday: number): TimeBlock[] {
  const override = a.weekdayBlocks.find((w) => w.weekday === weekday);
  return override ? override.blocks : a.blocks;
}

export interface CommuteWindow { startTime: string; endTime: string }

/** Janela do deslocamento NUM dia da semana, derivada do(s) bloco(s) efetivos da atividade âncora nesse dia. */
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
