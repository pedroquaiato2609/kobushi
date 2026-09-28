import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { StudyPlan } from '../../api/types';
import { Icon } from '../Icon';
import { ErrorText, Field, Modal } from '../ui';

/** Plano de estudo manual: assunto, título e a lista de aulas (título + descrição opcional cada uma). Pra gerar com a IA, use "Pedir à IA" na tela de Estudos. */
export function PlanModal({ onClose }: { onClose: () => void }) {
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [lessons, setLessons] = useState<{ title: string; description: string }[]>([{ title: '', description: '' }]);

  const save = useAction((p: object) => api.post<StudyPlan>('/study/plans', p), onClose);
  const valid = subject.trim() && title.trim() && lessons.some((l) => l.title.trim());
  const submit = () => save.mutate({
    subject: subject.trim(), title: title.trim(),
    lessons: lessons.filter((l) => l.title.trim()).map((l, i) => ({ id: `l${i}-${Date.now()}`, title: l.title.trim(), description: l.description.trim() })),
  });

  const setLesson = (i: number, field: 'title' | 'description', v: string) => setLessons((ls) => ls.map((l, j) => (i === j ? { ...l, [field]: v } : l)));
  const addLesson = () => setLessons((ls) => [...ls, { title: '', description: '' }]);
  const removeLesson = (i: number) => setLessons((ls) => ls.filter((_, j) => j !== i));

  return (
    <Modal title="Novo plano de estudo" onClose={onClose} onSubmit={submit} wide
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={save.isPending || !valid}>Salvar</button></>}>
      <div className="rd-modal-row">
        <Field label="Assunto"><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="ex.: Álgebra Linear" autoFocus required /></Field>
        <Field label="Título do plano"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Álgebra Linear do zero" required /></Field>
      </div>
      <p className="hint">Prefere que a IA monte isso pra você? Feche esta janela e use "Pedir à IA" — ela organiza as aulas numa sequência lógica.</p>
      <h4 className="gx-h4">Aulas</h4>
      <ul className="study-lesson-edit-list">
        {lessons.map((l, i) => (
          <li key={i}>
            <input value={l.title} onChange={(e) => setLesson(i, 'title', e.target.value)} placeholder={`Aula ${i + 1}`} />
            <input value={l.description} onChange={(e) => setLesson(i, 'description', e.target.value)} placeholder="descrição (opcional)" />
            <button type="button" className="icon-btn" aria-label="Remover aula" disabled={lessons.length === 1} onClick={() => removeLesson(i)}><Icon name="trash" size={14} /></button>
          </li>
        ))}
      </ul>
      <button type="button" className="btn small" onClick={addLesson}><Icon name="plus" size={14} /> Adicionar aula</button>
      <ErrorText error={save.error} />
    </Modal>
  );
}
