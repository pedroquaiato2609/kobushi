// Utilidades puras do módulo Academia (formatação e cronômetros). Sem React, para poderem ser testadas.
import type { GymLevelTarget, GymTargets } from '../api/types';
import type { Level } from '../api/types';

/** 3725 -> "1:02:05"; 65 -> "1:05" */
export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
/** Duração legível: "1 h 05 min", "42 min", "50 s". */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}
/** 72.5 -> "72,5" (vírgula decimal, como no Brasil). */
export const fmtNum = (n: number) => String(n).replace('.', ',');
export const fmtSets = (sets: { reps: number; weight: number }[]) => sets.map((s) => `${s.reps}×${fmtNum(s.weight)}`).join(' · ');
export const fmtKg = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1).replace('.', ',')} kg`;
export const fmtVolume = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} t` : `${Math.round(n)} kg`);
export const fmtTarget = (t?: GymLevelTarget) => (t ? `${t.sets}×${t.reps}${t.weight ? ` · ${fmtKg(t.weight)}` : ''}` : '—');
export const fmtDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
export const fmtDateFull = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Segundos que faltam para o descanso acabar (nunca negativo). */
export const restLeft = (endsAt: number, now: number) => Math.max(0, Math.ceil((endsAt - now) / 1000));

export const estimate1rm = (weight: number, reps: number) => (weight <= 0 || reps <= 0 ? 0 : Math.round((reps === 1 ? weight : weight * (1 + reps / 30)) * 10) / 10);

/** Meta a usar como sugestão de preenchimento: a escolhida, senão a "ideal", senão a primeira definida. */
export function pickTarget(targets: GymTargets, level: Level | null): { level: Level; target: GymLevelTarget } | null {
  const order: Level[] = level ? [level, 'ideal', 'min', 'max'] : ['ideal', 'min', 'max'];
  for (const l of order) if (targets[l]) return { level: l, target: targets[l] as GymLevelTarget };
  return null;
}

export const EQUIPMENT_LABEL: Record<string, string> = { barbell: 'Barra', dumbbell: 'Halteres', machine: 'Máquina', cable: 'Polia', bodyweight: 'Peso do corpo', kettlebell: 'Kettlebell', other: 'Outro' };
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
