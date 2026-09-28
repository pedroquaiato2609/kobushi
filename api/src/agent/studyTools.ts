// Ferramentas do assistente para Estudos. Criar/alterar nota, gerar plano de estudo e marcar aula sempre
// passam pela confirmação do usuário. O assistente escreve texto simples (não HTML) — vira parágrafos.
import { z } from 'zod';
import type { StudyService } from '../application/study/service';
import { id } from '../application/schemas';
import { textFromHtml } from '../domain/study';
import { paragraphsToHtml } from '../domain/richText';
import { tool, type ToolDefinition } from './toolTypes';

const R = { resource: 'study' as const, group: 'study' as const, action: 'read' as const };
const LINKED_LABEL: Record<string, string> = { book: 'livro', workout: 'treino', activity: 'atividade' };

export function buildStudyTools(st: StudyService): ToolDefinition[] {
  return [
    tool({ name: 'study_list_notes', ...R, label: 'as notas de estudo',
      description: 'Lista as notas de estudo (título e vínculo, se houver). Filtre por vínculo para achar as notas de um livro/treino/atividade específico.',
      schema: z.object({ linkedType: z.enum(['book', 'workout', 'activity']).optional(), linkedId: id.optional() }),
      run: async (a) => (await st.listNotes(a)).map((n) => ({ id: n.id, titulo: n.title, vinculo: n.linkedType ? `${LINKED_LABEL[n.linkedType]} ${n.linkedId}` : undefined, atualizadoEm: n.updatedAt })) }),
    tool({ name: 'study_note_detail', ...R, label: 'o conteúdo de uma nota de estudo',
      description: 'Lê o conteúdo de uma nota de estudo (em texto simples, sem a formatação).',
      schema: z.object({ id }),
      run: async ({ id }) => { const n = await st.getNote(id); return { titulo: n.title, conteudo: textFromHtml(n.content) || undefined, vinculo: n.linkedType ? { tipo: LINKED_LABEL[n.linkedType], id: n.linkedId } : undefined }; } }),
    tool({ name: 'study_create_note', resource: 'study', group: 'study', action: 'create', label: 'uma nota de estudo', defaultMode: 'confirm',
      description: 'Cria uma nota de estudo com título e texto (parágrafos separados por linha em branco viram parágrafos formatados). Pode atrelar a um livro, treino ou atividade (dê o id — consulte a ferramenta correspondente se não souber). O usuário pode depois enriquecer no editor (imagens, formatação).',
      schema: z.object({
        title: z.string().min(1).max(200), content: z.string().max(4000).optional(),
        linkedType: z.enum(['book', 'workout', 'activity']).optional(), linkedId: id.optional(),
      }),
      prepare: async (a) => ({ args: { title: a.title, content: a.content ? paragraphsToHtml(a.content) : '', linkedType: a.linkedType ?? null, linkedId: a.linkedId ?? null },
        summary: [`Nota: ${a.title}`, ...(a.content ? [a.content.slice(0, 200)] : []), ...(a.linkedType ? [`Vinculada a: ${LINKED_LABEL[a.linkedType]}`] : [])] }),
      run: async (a) => { const n = await st.createNote(a as any); return { ok: true, id: n.id, titulo: n.title }; } }),

    tool({ name: 'study_list_plans', ...R, label: 'os planos de estudo',
      description: 'Lista os planos de estudo (assunto, título, progresso e número de aulas).',
      schema: z.object({}),
      run: async () => (await st.listPlans()).map((p) => ({ id: p.id, assunto: p.subject, titulo: p.title, progresso: `${p.progressPct}%`, aulas: p.lessons.length })) }),
    tool({ name: 'study_plan_detail', ...R, label: 'os detalhes de um plano de estudo',
      description: 'Lista as aulas de um plano de estudo, com o que já foi concluído.',
      schema: z.object({ id }),
      run: async ({ id }) => { const p = await st.getPlan(id); return { assunto: p.subject, titulo: p.title, progresso: `${p.progressPct}%`, aulas: p.lessons.map((l) => ({ id: l.id, titulo: l.title, descricao: l.description || undefined, feito: l.done })) }; } }),
    tool({ name: 'study_generate_plan', resource: 'study', group: 'study', action: 'create', label: 'um plano de estudo', defaultMode: 'confirm',
      description: 'Cria um plano de estudo sobre um assunto: você mesmo organiza as aulas/tópicos em uma sequência lógica (do básico ao avançado), cada uma com um título curto e uma descrição de uma frase do que cobre. Pergunte o nível do usuário (iniciante/intermediário/avançado) e quanto tempo ele tem, se não estiver claro, antes de montar. Use entre 5 e 15 aulas — nem de menos (raso demais) nem de mais (perde o foco).',
      schema: z.object({
        subject: z.string().min(1).max(200).describe('o assunto, ex.: "álgebra linear"'),
        title: z.string().min(1).max(200).describe('título do plano, ex.: "Álgebra Linear do zero"'),
        lessons: z.array(z.object({ title: z.string().min(1).max(200), description: z.string().max(300).optional() })).min(3).max(30),
      }),
      prepare: async (a) => ({
        args: { subject: a.subject, title: a.title, lessons: a.lessons.map((l, i) => ({ id: `${Date.now()}-${i}`, title: l.title, description: l.description ?? '', done: false })) },
        summary: [`Plano: ${a.title}`, `Assunto: ${a.subject}`, `${a.lessons.length} aulas:`, ...a.lessons.slice(0, 12).map((l, i) => `${i + 1}. ${l.title}`), ...(a.lessons.length > 12 ? [`… e mais ${a.lessons.length - 12}`] : [])],
      }),
      run: async (a) => { const p = await st.createPlan(a as any); return { ok: true, id: p.id, titulo: p.title, aulas: p.lessons.length }; } }),
    tool({ name: 'study_set_lesson_done', resource: 'study', group: 'study', action: 'update', label: 'uma aula do plano', defaultMode: 'confirm',
      description: 'Marca (ou desmarca) uma aula de um plano de estudo como concluída. Consulte study_plan_detail para os ids.',
      schema: z.object({ planId: id, lessonId: z.string().min(1).max(40), done: z.boolean().default(true) }),
      prepare: async (a) => {
        const p = await st.getPlan(a.planId);
        const lesson = p.lessons.find((l) => l.id === a.lessonId);
        return { args: a, summary: [`"${p.title}"`, `${a.done ? 'Marcar' : 'Desmarcar'}: ${lesson?.title ?? a.lessonId}`] };
      },
      run: async (a) => { const p = await st.setLessonDone(a.planId, a.lessonId, a.done); return { ok: true, progresso: `${p.progressPct}%` }; } }),
  ];
}
