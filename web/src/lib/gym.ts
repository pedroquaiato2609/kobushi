// Utilidades puras do módulo Academia (formatação e cronômetros). Sem React, para poderem ser testadas.
import type { GymCardioSetDetails, GymCardioTarget, GymCardioTargets, GymLevelTarget, GymTargets } from '../api/types';
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
/** "20 min", "5 km", "20 min · 5 km · 10 km/h" */
export const fmtCardioTarget = (t?: GymCardioTarget) =>
  t ? [t.durationMin ? `${t.durationMin} min` : null, t.distanceKm ? `${fmtNum(t.distanceKm)} km` : null, t.speedKmh ? `${fmtNum(t.speedKmh)} km/h` : null].filter(Boolean).join(' · ') || '—' : '—';
/** "18 min · 3,2 km", "45 min" */
export const fmtCardioSet = (s: { durationSeconds: number | null; distanceKm: number | null }) =>
  [s.durationSeconds ? fmtDuration(s.durationSeconds) : null, s.distanceKm ? `${fmtNum(s.distanceKm)} km` : null].filter(Boolean).join(' · ') || '—';
/** 5.5 -> "5:30/km" (ritmo em minutos por km, formatado como min:seg) */
export function fmtPace(minPerKm: number): string {
  const totalSec = Math.round(minPerKm * 60);
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
/** Resumo compacto dos detalhes extras já preenchidos de uma série de cardio (calorias, velocidade, ritmo, FC). */
export function fmtCardioExtras(s: GymCardioSetDetails): string {
  const parts: string[] = [];
  if (s.caloriesKcal) parts.push(`${s.caloriesKcal} kcal`);
  if (s.avgSpeedKmh) parts.push(`${fmtNum(s.avgSpeedKmh)} km/h méd`);
  if (s.maxSpeedKmh) parts.push(`${fmtNum(s.maxSpeedKmh)} km/h máx`);
  if (s.avgPaceMinKm) parts.push(`${fmtPace(s.avgPaceMinKm)} méd`);
  if (s.maxPaceMinKm) parts.push(`${fmtPace(s.maxPaceMinKm)} máx`);
  if (s.avgHeartRate) parts.push(`${s.avgHeartRate} bpm méd`);
  if (s.maxHeartRate) parts.push(`${s.maxHeartRate} bpm máx`);
  return parts.join(' · ');
}
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
/** Mesmo princípio de pickTarget, para metas de cardio (duração/distância). */
export function pickCardioTarget(targets: GymCardioTargets, level: Level | null): { level: Level; target: GymCardioTarget } | null {
  const order: Level[] = level ? [level, 'ideal', 'min', 'max'] : ['ideal', 'min', 'max'];
  for (const l of order) if (targets[l]) return { level: l, target: targets[l] as GymCardioTarget };
  return null;
}

export const EQUIPMENT_LABEL: Record<string, string> = {
  barbell: 'Barra', dumbbell: 'Halteres', machine: 'Máquina', cable: 'Polia', bodyweight: 'Peso do corpo', kettlebell: 'Kettlebell', other: 'Outro',
  treadmill: 'Esteira', bike: 'Bicicleta', stairs: 'Escada/Step', rowing_machine: 'Remo', elliptical: 'Elíptico', jump_rope: 'Corda', pool: 'Natação',
};
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
