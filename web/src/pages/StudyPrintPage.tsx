import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { StudyNote } from '../api/types';

/**
 * "Baixar PDF": uma página limpa (sem menu/sidebar), com o conteúdo formatado, que dispara a impressão do
 * navegador assim que carrega — o usuário escolhe "Salvar como PDF" no diálogo. Sem gerar PDF no servidor.
 */
export default function StudyPrintPage() {
  const { id } = useParams<{ id: string }>();
  const note = useQuery({ queryKey: ['study', 'notes', id, 'print'], queryFn: () => api.get<StudyNote>(`/study/notes/${id}`), enabled: Boolean(id) });

  useEffect(() => {
    if (note.data) {
      document.title = note.data.title;
      const t = setTimeout(() => window.print(), 300); // dá tempo das imagens carregarem
      return () => clearTimeout(t);
    }
  }, [note.data]);

  if (note.isLoading) return <p className="study-print-loading">Carregando…</p>;
  if (!note.data) return <p className="study-print-loading">Nota não encontrada.</p>;

  return (
    <article className="study-print">
      <h1>{note.data.title}</h1>
      <p className="study-print-date">{new Date(note.data.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      {/* eslint-disable-next-line react/no-danger -- HTML já sanitizado no servidor ao salvar (sanitizeNoteHtml) */}
      <div className="rich-content" dangerouslySetInnerHTML={{ __html: note.data.content }} />
    </article>
  );
}
