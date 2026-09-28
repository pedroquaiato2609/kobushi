import { z } from 'zod';
import { PERMISSION_MODES, PROVIDERS, STT_MODES } from '../domain/constants';

export const settingsUpdateSchema = z.object({
  provider: z.enum(PROVIDERS),
  model: z.string().min(1).max(100),
  customInstructions: z.string().max(4000),
  tone: z.string().max(200),
  language: z.string().min(2).max(10),
  includeRoutineContext: z.boolean(),
  maxToolSteps: z.number().int().min(1).max(20),
  sttMode: z.enum(STT_MODES),
  sttModel: z.string().min(1).max(100),
}).partial();

export const permissionsUpdateSchema = z.object({
  entries: z.array(z.object({ tool: z.string().min(1), mode: z.enum(PERMISSION_MODES) })).min(1),
});

export const sendMessageSchema = z.object({ content: z.string().trim().min(1).max(8000) });
