import { z } from 'zod';
import { dateStr } from '../schemas';

const FORMATS = ['fisico', 'ebook', 'audiobook'] as const;
const STATUSES = ['quero_ler', 'lendo', 'pausado', 'lido', 'abandonado'] as const;

// Regra (igual à de application/schemas.ts): nada de .default() aqui. bookUpdateSchema vem de
// bookCreateSchema.partial() — um .default() sobreviveria ao .partial() e um PATCH que omite o campo
// (ex.: só {rating: 5}) voltaria a gravar o valor padrão por cima do que já estava salvo. Os padrões do
// CREATE (status "quero_ler", textos vazios) são aplicados no serviço.
// Aceita URL absoluta (capa vinda de fora, por ISBN/busca) OU um caminho relativo começando com "/" (a própria
// rota de servir a capa enviada pelo usuário, ex. "/reading/books/{id}/cover-image?v=..."). .url() sozinho
// recusava esse segundo caso — reabrir "Editar" num livro com foto enviada e salvar sem mexer na capa quebrava
// com "coverUrl: Invalid URL", porque o valor atual (o caminho relativo) ia direto de volta no PATCH.
const coverUrlSchema = z.string().trim().max(500).regex(/^(https?:\/\/|\/)\S+$/, 'URL da capa inválida').nullable().optional();

export const bookCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().max(200).optional(),
  isbn: z.string().trim().max(20).nullable().optional(),
  coverUrl: coverUrlSchema,
  publisher: z.string().trim().max(150).optional(),
  format: z.enum(FORMATS).optional(),
  status: z.enum(STATUSES).optional(),
  totalPages: z.number().int().min(1).max(20000).nullable().optional(),
});
export const bookUpdateSchema = bookCreateSchema.partial().extend({
  currentPage: z.number().int().min(0).max(20000).optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  notes: z.string().max(300_000).optional(), // HTML do editor rico (mesmo padrão de Estudos/Documentos)
});

// Sem .refine() aqui de propósito: o schema também vira o JSON Schema enviado ao modelo (toJsonSchema não entende
// ZodEffects), então "pelo menos páginas ou minutos" é validado no serviço, não aqui. Sem .default() em "note"
// pelo mesmo motivo do bloco acima (aqui não há .partial(), mas mantém o padrão do módulo).
export const sessionCreateSchema = z.object({
  date: dateStr,
  pages: z.number().int().min(0).max(5000).nullable().optional(),
  minutes: z.number().int().min(0).max(1440).nullable().optional(),
  note: z.string().max(500).optional(),
});

export const isbnLookupSchema = z.object({ isbn: z.string().trim().min(8).max(20) });
export const bookSearchSchema = z.object({ q: z.string().trim().min(2).max(200) });
