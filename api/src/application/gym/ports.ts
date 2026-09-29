import type { Level } from '../../domain/constants';
import type { CardioTargets, Equipment, ExerciseKind, Muscle, SetLike, Targets } from '../../domain/gym';

export interface Exercise {
  id: string; name: string; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; stabilizerMuscles: Muscle[]; equipment: Equipment;
  kind: ExerciseKind; instructions: string; tips: string; isCustom: boolean; imageMime: string | null; archived: boolean; createdAt: Date;
}
export interface ExerciseInput { name: string; primaryMuscles: Muscle[]; secondaryMuscles: Muscle[]; stabilizerMuscles: Muscle[]; equipment: Equipment; kind: ExerciseKind; instructions: string; tips: string }

export interface WorkoutItem { id: string; exerciseId: string; position: number; restSeconds: number; note: string; targets: Targets | CardioTargets }
export interface WorkoutItemInput { exerciseId: string; restSeconds: number; note: string; targets: Targets | CardioTargets }
export interface Workout { id: string; name: string; notes: string; weekdays: number[]; archived: boolean; items: WorkoutItem[]; createdAt: Date }
export interface WorkoutInput { name: string; notes: string; weekdays: number[] }

export interface GymSession { id: string; workoutId: string | null; name: string; startedAt: Date; endedAt: Date | null; note: string; level: Level | null }

/**
 * Detalhes extras de uma série de cardio, preenchidos depois de concluída (opcional): não entram no nível
 * atingido nem em recordes, são só informação a mais guardada com a série (ex.: vinda de um relógio/app externo).
 */
export interface CardioSetDetails {
  caloriesKcal: number | null; avgSpeedKmh: number | null; maxSpeedKmh: number | null;
  avgPaceMinKm: number | null; maxPaceMinKm: number | null; avgHeartRate: number | null; maxHeartRate: number | null;
}
export interface GymSet extends CardioSetDetails {
  id: string; sessionId: string; exerciseId: string; setNumber: number; reps: number; weight: number;
  durationSeconds: number | null; distanceKm: number | null;
  level: Level | null; restSeconds: number | null; isPr: boolean; createdAt: Date;
}
export interface SetInput {
  exerciseId: string; reps: number; weight: number; durationSeconds?: number | null; distanceKm?: number | null;
  level: Level | null; restSeconds: number | null;
}

/** Série de um exercício em uma data (para histórico e gráficos). */
export interface HistorySet extends SetLike { sessionId: string; date: string; createdAt: Date; isPr: boolean; level: Level | null; durationSeconds: number | null; distanceKm: number | null }

export interface GymRepository {
  // exercícios
  listExercises(f: { q?: string; muscle?: Muscle; includeArchived?: boolean }): Promise<Exercise[]>;
  getExercise(id: string): Promise<Exercise | null>;
  getExercises(ids: string[]): Promise<Exercise[]>;
  createExercise(d: ExerciseInput & { isCustom: boolean }): Promise<Exercise>;
  /** Cria os exercícios do catálogo que ainda não existem e corrige a classificação/textos dos que já existem (por nome). */
  upsertCatalog(items: (ExerciseInput & { name: string })[]): Promise<{ created: number; updated: number }>;
  updateExercise(id: string, patch: Partial<ExerciseInput>): Promise<Exercise | null>;
  removeExercise(id: string): Promise<'deleted' | 'archived' | 'missing'>;
  imageOf(id: string): Promise<{ storage: string; mime: string } | null>;
  setImage(id: string, img: { storage: string; mime: string } | null): Promise<void>;
  // treinos
  listWorkouts(includeArchived?: boolean): Promise<Workout[]>;
  getWorkout(id: string): Promise<Workout | null>;
  createWorkout(w: WorkoutInput, items: WorkoutItemInput[]): Promise<Workout>;
  updateWorkout(id: string, patch: Partial<WorkoutInput & { archived: boolean }>, items?: WorkoutItemInput[]): Promise<Workout | null>;
  deleteWorkout(id: string): Promise<boolean>;
  // sessões e séries
  activeSession(): Promise<GymSession | null>;
  createSession(d: { workoutId: string | null; name: string }): Promise<GymSession>;
  getSession(id: string): Promise<GymSession | null>;
  listSessions(limit: number, offset: number): Promise<GymSession[]>;
  finishSession(id: string, d: { note?: string; level?: Level | null }): Promise<GymSession | null>;
  deleteSession(id: string): Promise<boolean>;
  setsOf(sessionIds: string[]): Promise<GymSet[]>;
  getSet(id: string): Promise<GymSet | null>;
  addSet(sessionId: string, s: SetInput, isPr: boolean): Promise<GymSet>;
  updateSet(id: string, patch: Partial<Pick<SetInput, 'reps' | 'weight' | 'durationSeconds' | 'distanceKm' | 'level' | 'restSeconds'> & CardioSetDetails>, isPr: boolean): Promise<GymSet | null>;
  deleteSet(id: string): Promise<boolean>;
  /** Séries do exercício feitas antes de `before` (ou todas), excluindo `excludeSetId`. */
  previousSets(exerciseId: string, before: Date | null, excludeSetId: string | null): Promise<SetLike[]>;
  history(exerciseId: string, timezone: string, limitSessions: number): Promise<HistorySet[]>;
  lastPerformance(exerciseId: string, excludeSessionId: string | null): Promise<SetLike[]>;
  lastTrainedByMuscle(): Promise<Partial<Record<Muscle, string>>>;
  muscleVolume(sinceDays: number): Promise<{ muscle: Muscle; sets: number; volume: number }[]>;
  weeklyVolume(weeks: number, timezone: string): Promise<{ week: string; sessions: number; sets: number; volume: number }[]>;
  sessionDates(sinceDays: number, timezone: string): Promise<string[]>;
  /** Todas as séries com a data (fuso do app): base do quadro de recordes. */
  allSets(timezone: string): Promise<{ exerciseId: string; reps: number; weight: number; date: string }[]>;
}
