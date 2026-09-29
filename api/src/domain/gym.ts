// Regras puras do módulo Academia (sem banco): carga estimada, recordes, volume e recuperação muscular.
import type { Level } from './constants';

// Músculos específicos (anatomia), não grupos genéricos. Cobrem os exercícios do catálogo; ver
// application/gym/catalog.ts para a classificação de cada exercício e web/src/lib/muscles.ts para
// o mapeamento de cada músculo à região desenhada no mapa (só uma questão de desenho, não de dado).
export const MUSCLES = [
  'pectoral_major', // peitoral maior
  'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior', // deltoide anterior/lateral/posterior
  'trapezius', // trapézio
  'latissimus_dorsi', // dorsais (latíssimo do dorso)
  'rhomboids', // romboides
  'teres_major', // redondo maior
  'rotator_cuff', // manguito rotador
  'erector_spinae', // eretores da espinha (lombar)
  'biceps_brachii', // bíceps braquial
  'triceps_brachii', // tríceps braquial
  'brachialis', // braquial
  'brachioradialis', // braquiorradial
  'wrist_flexors', 'wrist_extensors', // flexores/extensores do punho
  'rectus_abdominis', // reto abdominal
  'obliques', // oblíquos
  'transverse_abdominis', // transverso do abdômen
  'serratus_anterior', // serrátil anterior
  'gluteus_maximus', 'gluteus_medius', // glúteo máximo/médio
  'hip_adductors', 'hip_flexors', // adutores/flexores do quadril
  'quadriceps', // quadríceps
  'hamstrings', // isquiotibiais
  'gastrocnemius', 'soleus', // gastrocnêmio/sóleo
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = [
  'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'other',
  // cardio: aparelho/local do exercício, mesmo princípio dos de musculação
  'treadmill', 'bike', 'stairs', 'rowing_machine', 'elliptical', 'jump_rope', 'pool',
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

export const EXERCISE_KINDS = ['strength', 'cardio'] as const; // musculação (séries×reps×carga) | cardio (duração/distância)
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];

export interface LevelTarget { sets: number; reps: number; weight: number }
/** Meta de cardio por nível: duração e/ou distância (ao menos um definido). */
export interface CardioTarget { durationMin?: number | null; distanceKm?: number | null }
export type Targets = Partial<Record<Level, LevelTarget>>;
export type CardioTargets = Partial<Record<Level, CardioTarget>>;

export interface SetLike { reps: number; weight: number }
export interface CardioSetLike { durationSeconds: number; distanceKm: number }

/** Carga máxima estimada (1RM) pela fórmula de Epley. Uma repetição vale a própria carga. */
export function estimate1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  const r = reps === 1 ? weight : weight * (1 + reps / 30);
  return Math.round(r * 10) / 10;
}

export const volumeOf = (sets: SetLike[]) => Math.round(sets.reduce((n, s) => n + s.weight * s.reps, 0) * 10) / 10;

export interface Best { weight: number; e1rm: number }
export const bestOf = (sets: SetLike[]): Best => sets.reduce<Best>((b, s) => ({
  weight: s.reps > 0 ? Math.max(b.weight, s.weight) : b.weight,
  e1rm: Math.max(b.e1rm, estimate1rm(s.weight, s.reps)),
}), { weight: 0, e1rm: 0 });

export type PrKind = 'weight' | 'e1rm';

/**
 * Recorde: supera o melhor já registrado do exercício em carga ou em 1RM estimado. A primeira vez que o exercício é feito
 * nunca conta como recorde (não há o que superar) — evita o "recorde" falso de quem está começando o histórico.
 */
export function detectPr(previous: SetLike[], next: SetLike): PrKind[] {
  if (previous.length === 0 || next.reps <= 0 || next.weight <= 0) return [];
  const best = bestOf(previous);
  const out: PrKind[] = [];
  if (next.weight > best.weight) out.push('weight');
  if (estimate1rm(next.weight, next.reps) > best.e1rm) out.push('e1rm');
  return out;
}

/** Nível atingido (mínimo/ideal/máximo) por série, comparando com a meta do dia: o maior nível cuja carga e repetições foram cumpridas. */
export function levelReached(set: SetLike, targets: Targets): Level | null {
  let reached: Level | null = null;
  for (const l of ['min', 'ideal', 'max'] as const) {
    const t = targets[l];
    if (t && set.reps >= t.reps && set.weight >= t.weight) reached = l;
  }
  return reached;
}

/** Mesmo princípio de levelReached, mas para cardio: cumpre a meta do nível quando atinge a duração E/OU a distância definidas nele. */
export function cardioLevelReached(set: CardioSetLike, targets: CardioTargets): Level | null {
  let reached: Level | null = null;
  for (const l of ['min', 'ideal', 'max'] as const) {
    const t = targets[l];
    if (!t || (t.durationMin == null && t.distanceKm == null)) continue;
    const durOk = t.durationMin == null || set.durationSeconds >= t.durationMin * 60;
    const distOk = t.distanceKm == null || set.distanceKm >= t.distanceKm;
    if (durOk && distOk) reached = l;
  }
  return reached;
}

const HOURS_TO_RECOVER = 72;
export interface MuscleRecovery { muscle: Muscle; lastTrainedAt: string | null; hoursSince: number | null; recoveryPct: number; ready: boolean }

/** Recuperação por músculo a partir do último treino em que foi músculo principal (100% depois de 72 h). */
export function recoveryOf(last: Partial<Record<Muscle, string>>, now: Date): MuscleRecovery[] {
  return MUSCLES.map((muscle) => {
    const at = last[muscle] ?? null;
    if (!at) return { muscle, lastTrainedAt: null, hoursSince: null, recoveryPct: 100, ready: true };
    const hoursSince = Math.max(0, (now.getTime() - new Date(at).getTime()) / 3_600_000);
    const recoveryPct = Math.min(100, Math.round((hoursSince / HOURS_TO_RECOVER) * 100));
    return { muscle, lastTrainedAt: at, hoursSince: Math.round(hoursSince), recoveryPct, ready: recoveryPct >= 100 };
  });
}

export const normalizeName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
