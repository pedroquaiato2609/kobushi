import type { LinkedType } from '../../api/types';
import { Field } from '../ui';
import { LINKED_LABEL, useActivitiesForLink, useBooksForLink, useWorkoutsForLink } from './shared';

/** Atrelar uma nota a um livro (Leitura), um treino (Academia) ou uma atividade da rotina — ou a nenhum. */
export function LinkPicker({ linkedType, linkedId, onChange }: {
  linkedType: LinkedType | null; linkedId: string | null; onChange: (type: LinkedType | null, id: string | null) => void;
}) {
  const books = useBooksForLink();
  const workouts = useWorkoutsForLink();
  const activities = useActivitiesForLink();
  const options: { id: string; label: string }[] =
    linkedType === 'book' ? (books.data ?? []).map((b) => ({ id: b.id, label: b.title }))
    : linkedType === 'workout' ? (workouts.data ?? []).map((w) => ({ id: w.id, label: w.name }))
    : linkedType === 'activity' ? (activities.data ?? []).map((a) => ({ id: a.id, label: a.name }))
    : [];

  return (
    <div className="rd-modal-row" style={{ gridTemplateColumns: linkedType ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' }}>
      <Field label="Vincular a">
        <select value={linkedType ?? ''} onChange={(e) => onChange(e.target.value ? (e.target.value as LinkedType) : null, null)}>
          <option value="">Nenhum</option>
          <option value="book">Livro</option>
          <option value="workout">Treino</option>
          <option value="activity">Atividade</option>
        </select>
      </Field>
      {linkedType && (
        <Field label={LINKED_LABEL[linkedType]}>
          <select value={linkedId ?? ''} onChange={(e) => onChange(linkedType, e.target.value || null)} required>
            <option value="">Escolha…</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </Field>
      )}
    </div>
  );
}
