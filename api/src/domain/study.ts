// Regras puras do módulo Estudos (sem banco): progresso do plano.
export { textFromHtml } from './richText';

export interface LessonLike { done: boolean }

/** % de aulas concluídas (0 quando o plano ainda não tem nenhuma aula). */
export function planProgress(lessons: LessonLike[]): number {
  if (lessons.length === 0) return 0;
  return Math.round((lessons.filter((l) => l.done).length / lessons.length) * 100);
}
