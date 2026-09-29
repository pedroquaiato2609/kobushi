// Encaixe dos objetivos sem horário fixo no calendário. Função pura (sem React): espelha api/src/domain/schedule.ts.
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

/**
 * Janela do deslocamento NUM dia da semana, derivada do(s) bloco(s) efetivos da atividade âncora nesse dia.
 * Espelha commuteBlock de api/src/domain/schedule.ts (o teste de paridade garante que não divergem).
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

export interface Busy { start: number; end: number }
export interface FlexItem { id: string; window: [number, number]; durationMin: number; suggestedStart: number | null }
export interface Placement {
  start: number; end: number;
  /** achou um horário livre em algum lugar do dia (mesmo fora do período) — não desenha por cima de nada. */
  fitted: boolean;
  /** o horário achado está dentro do período escolhido (manhã/tarde/noite); false = precisou sair dele. */
  inWindow: boolean;
  /** true = veio da sugestão da IA */
  suggested: boolean;
}

const overlaps = (s: number, e: number, busy: Busy[]) => busy.some((b) => b.start < e && b.end > s);
const DAY_END = 1440;

/** Primeiro horário livre dentro da janela em que cabe a duração (busy ordenado por início). */
function firstFit(window: [number, number], dur: number, busy: Busy[]): number | null {
  let t = window[0];
  for (const b of busy) {
    if (b.end <= t) continue;
    if (b.start >= t + dur) break;
    t = Math.max(t, b.end);
    if (t + dur > window[1]) return null;
  }
  return t + dur <= window[1] ? t : null;
}

/**
 * Posiciona cada objetivo: usa o horário sugerido pela IA se ele cabe livre; senão o primeiro espaço livre da janela
 * (os mais restritos escolhem primeiro). Se não sobra espaço NO PERÍODO, tenta o resto do dia inteiro antes de desistir —
 * sem isso, dois objetivos que não coubessem no mesmo período caíam os dois no mesmo horário de início e ficavam com o
 * texto ilegível, um em cima do outro. Só cai no início da janela (podendo colidir) quando o dia inteiro já está tomado.
 */
export function placeFlexible(items: FlexItem[], busy: Busy[]): Map<string, Placement> {
  const taken = [...busy].sort((a, b) => a.start - b.start);
  const out = new Map<string, Placement>();
  const order = items.map((it, i) => ({ it, i })).sort((a, b) => (a.it.window[1] - a.it.window[0]) - (b.it.window[1] - b.it.window[0]) || a.i - b.i);

  for (const { it } of order) {
    const dur = Math.min(it.durationMin, it.window[1] - it.window[0]);
    const s = it.suggestedStart;
    let start: number | null = null;
    let suggested = false;
    if (s !== null && s >= it.window[0] && s + dur <= it.window[1] && !overlaps(s, s + dur, taken)) { start = s; suggested = true; }
    else start = firstFit(it.window, dur, taken);
    const inWindow = start !== null;

    let usedDur = dur;
    if (start === null) {
      usedDur = Math.min(it.durationMin, DAY_END - it.window[0]);
      start = firstFit([it.window[0], DAY_END], usedDur, taken);
    }
    const fitted = start !== null;
    const at = start ?? it.window[0];
    const end = fitted ? at + usedDur : at + dur;
    out.set(it.id, { start: at, end, fitted, inWindow, suggested });
    if (fitted) { taken.push({ start: at, end }); taken.sort((a, b) => a.start - b.start); }
  }
  return out;
}
