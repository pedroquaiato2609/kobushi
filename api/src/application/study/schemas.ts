import { z } from 'zod';
import { id } from '../schemas';

const LINKED_TYPES = ['book', 'workout', 'activity'] as const;
const tag = z.string().trim().min(1).max(30);

export const folderCreateSchema = z.object({ name: z.string().trim().min(1).max(120) });
export const folderUpdateSchema = folderCreateSchema;

// Mesma regra dos outros módulos: nada de .default() aqui (noteUpdateSchema vem de .partial()) e nada de
// .refine() (o schema também vira o JSON Schema da ferramenta do assistente). "linkedType e linkedId sempre
// os dois juntos, nunca só um" é validado no serviço.
export const noteCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().max(300_000).optional(), // HTML do editor; imagens embutidas são <img src="URL">, não base64, então fica compacto
  linkedType: z.enum(LINKED_TYPES).nullable().optional(),
  linkedId: id.nullable().optional(),
  folderId: id.nullable().optional(),
  pinned: z.boolean().optional(),
  tags: z.array(tag).max(15).optional(),
  linkedNoteIds: z.array(id).max(30).optional().describe('ids de outras notas de estudo que esta nota referencia'),
});
export const noteUpdateSchema = noteCreateSchema.partial();

export const lessonSchema = z.object({
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  done: z.boolean().optional(),
});
export const planCreateSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  lessons: z.array(lessonSchema).min(1).max(100),
});
export const planUpdateSchema = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  lessons: z.array(lessonSchema).max(100).optional(),
});
