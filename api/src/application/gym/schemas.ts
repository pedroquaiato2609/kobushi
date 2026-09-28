import { z } from 'zod';
import { LEVELS } from '../../domain/constants';
import { EQUIPMENT, MUSCLES } from '../../domain/gym';
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
  instructions: z.string().max(1000).optional(),
  tips: z.string().max(600).optional(),
});
export const exerciseUpdateSchema = exerciseCreateSchema.partial();

const levelTarget = z.object({ sets: z.number().int().min(1).max(20), reps: z.number().int().min(1).max(100), weight: kg });
export const targetsSchema = z.object({ min: levelTarget.optional(), ideal: levelTarget.optional(), max: levelTarget.optional() })
  .describe('metas por nível (mesmo princípio do Ninshiki): mínimo, ideal e máximo, cada um com séries, repetições e carga em kg');

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

export const sessionStartSchema = z.object({ workoutId: id.optional(), name: z.string().trim().min(1).max(100).optional() });
export const setCreateSchema = z.object({
  exerciseId: id,
  reps: z.number().int().min(0).max(1000),
  weight: kg,
  level: z.enum(LEVELS).nullable().optional(),
  restSeconds: z.number().int().min(0).max(3600).nullable().optional(),
});
export const setUpdateSchema = z.object({ reps: z.number().int().min(0).max(1000).optional(), weight: kg.optional(), level: z.enum(LEVELS).nullable().optional(), restSeconds: z.number().int().min(0).max(3600).nullable().optional() });
export const sessionFinishSchema = z.object({ note: z.string().max(1000).optional(), level: z.enum(LEVELS).nullable().optional() });
