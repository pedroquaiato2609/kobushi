import { z } from 'zod';
import { LEVELS } from '../../domain/constants';
import { EQUIPMENT, EXERCISE_KINDS, MUSCLES } from '../../domain/gym';
import { id } from '../schemas';

const muscle = z.enum(MUSCLES).describe(`músculo específico (anatomia): ${MUSCLES.join(', ')}`);
const kg = z.number().min(0).max(2000).transform((n) => Math.round(n * 100) / 100);

// Regra (igual à de application/schemas.ts): nada de .default() nos campos abaixo — exerciseUpdateSchema e
// workoutUpdateSchema vêm de .partial() destes, e um .default() sobrevive ao .partial(): um PATCH que só manda
// {name} voltaria a gravar equipment="other"/instructions=""/tips="" (ou notes=""/weekdays=[]/items=[] no treino)
// por cima do que já estava salvo, mesmo sem o chamador ter tocado nesses campos. Os padrões do CREATE são
// aplicados no serviço (GymService.createExercise/createWorkout).
export const exerciseCreateSchema = z.object({
  name: z.string().trim().min(2).max(100),
  primaryMuscles: z.array(muscle).min(1).max(4).describe('motor principal do movimento'),
  secondaryMuscles: z.array(muscle).max(6).optional().describe('participa ativamente, mas não é o principal responsável'),
  stabilizerMuscles: z.array(muscle).max(8).optional().describe('não move a articulação-alvo; segura postura/tronco/escápula durante o exercício'),
  equipment: z.enum(EQUIPMENT).optional(),
  kind: z.enum(EXERCISE_KINDS).optional().describe('strength (padrão) = séries×reps×carga; cardio = duração/distância (esteira, bicicleta, escada, remo...)'),
  instructions: z.string().max(1000).optional(),
  tips: z.string().max(600).optional(),
});
export const exerciseUpdateSchema = exerciseCreateSchema.partial();

const levelTarget = z.object({ sets: z.number().int().min(1).max(20), reps: z.number().int().min(1).max(100), weight: kg });
const cardioLevelTarget = z.object({
  durationMin: z.number().min(1).max(600).nullable().optional(),
  distanceKm: z.number().min(0).max(500).nullable().optional(),
}).refine((t) => t.durationMin != null || t.distanceKm != null, 'defina duração e/ou distância');
const anyLevelTarget = z.union([levelTarget, cardioLevelTarget]);
export const targetsSchema = z.object({ min: anyLevelTarget.optional(), ideal: anyLevelTarget.optional(), max: anyLevelTarget.optional() })
  .describe('metas por nível (mesmo princípio do Ninshiki): mínimo, ideal e máximo. Para exercício de musculação: séries, repetições e carga em kg. Para cardio: duração em minutos e/ou distância em km');

export const workoutItemSchema = z.object({
  exerciseId: id,
  restSeconds: z.number().int().min(0).max(900).default(90).describe('descanso entre séries, em segundos'),
  note: z.string().max(300).default(''),
  targets: targetsSchema.default({}),
});
export const workoutCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  notes: z.string().max(1000).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional().describe('dias sugeridos (0 = domingo); vazio = qualquer dia'),
  items: z.array(workoutItemSchema).max(30).optional(),
});
export const workoutUpdateSchema = workoutCreateSchema.partial().extend({ archived: z.boolean().optional() });

const durationSeconds = z.number().int().min(0).max(36000).describe('duração em segundos');
const distanceKm = z.number().min(0).max(500).describe('distância em km');
export const sessionStartSchema = z.object({ workoutId: id.optional(), name: z.string().trim().min(1).max(100).optional() });
export const setCreateSchema = z.object({
  exerciseId: id,
  reps: z.number().int().min(0).max(1000).default(0).describe('musculação: repetições; cardio: deixe 0'),
  weight: kg.optional().default(0).describe('musculação: carga em kg; cardio: deixe 0'),
  durationSeconds: durationSeconds.nullable().optional().describe('cardio: duração da série em segundos'),
  distanceKm: distanceKm.nullable().optional().describe('cardio: distância percorrida em km'),
  level: z.enum(LEVELS).nullable().optional(),
  restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
});
// Detalhes extras de cardio: preenchidos depois de concluir a série (opcional), não mudam nível nem recorde.
export const cardioSetDetailsSchema = z.object({
  caloriesKcal: z.number().int().min(0).max(20000).nullable().optional().describe('calorias gastas na série'),
  avgSpeedKmh: z.number().min(0).max(100).nullable().optional().describe('velocidade média em km/h'),
  maxSpeedKmh: z.number().min(0).max(100).nullable().optional().describe('velocidade máxima em km/h'),
  avgPaceMinKm: z.number().min(0).max(60).nullable().optional().describe('ritmo médio em minutos por km'),
  maxPaceMinKm: z.number().min(0).max(60).nullable().optional().describe('ritmo máximo (mais rápido) em minutos por km'),
  avgHeartRate: z.number().int().min(0).max(300).nullable().optional().describe('frequência cardíaca média, em bpm'),
  maxHeartRate: z.number().int().min(0).max(300).nullable().optional().describe('frequência cardíaca máxima, em bpm'),
});
export const setUpdateSchema = z.object({
  reps: z.number().int().min(0).max(1000).optional(), weight: kg.optional(),
  durationSeconds: durationSeconds.nullable().optional(), distanceKm: distanceKm.nullable().optional(),
  level: z.enum(LEVELS).nullable().optional(), restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
}).merge(cardioSetDetailsSchema);
export const sessionFinishSchema = z.object({ note: z.string().max(1000).optional(), level: z.enum(LEVELS).nullable().optional() });
