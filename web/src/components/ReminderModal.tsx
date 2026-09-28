import { addHours } from 'date-fns';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { NotifyChannel, Reminder, Repeat } from '../api/types';
import { ts } from '../lib/dates';
import { REPEAT_LABEL } from '../lib/labels';
import { ChannelChecks } from './ChannelChecks';
import { useConfirm } from './ConfirmProvider';
import { ErrorText, Field, Modal } from './ui';

/** Criar ou editar um lembrete avulso. Mudar a data reativa um lembrete já avisado. */
export function ReminderModal({ reminder, onClose }: { reminder?: Reminder; onClose: () => void }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(reminder?.title ?? '');
  const [body, setBody] = useState(reminder?.body ?? '');
  const [at, setAt] = useState(reminder?.remindAt ?? ts(addHours(new Date(), 1)));
  const [repeat, setRepeat] = useState<Repeat>(reminder?.repeat ?? 'none');
  const [channels, setChannels] = useState<NotifyChannel[]>(reminder?.channels ?? []);

  const save = useAction(
    (payload: Record<string, unknown>) => (reminder ? api.patch(`/reminders/${reminder.id}`, payload) : api.post('/reminders', payload)),
    onClose,
  );
  const remove = useAction(() => api.del(`/reminders/${reminder!.id}`), onClose);

  return (
    <Modal
      title={reminder ? 'Editar lembrete' : 'Novo lembrete'} onClose={onClose}
      onSubmit={() => save.mutate({ title: title.trim(), body, at, repeat, channels })}
      footer={
        <>
          {reminder && <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm(`Apagar "${reminder.title}"?`)) remove.mutate(undefined); }}>Apagar</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim() || !at}>Salvar</button>
        </>
      }
    >
      <Field label="Me lembre de"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: ligar para o banco" autoFocus required /></Field>
      <div className="row">
        <Field label="Quando"><input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} required /></Field>
        <Field label="Repetir">
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
            {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Detalhe (opcional)"><textarea rows={2} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
      <span className="field-label">Onde avisar</span>
      <ChannelChecks value={channels} onChange={setChannels} />
      {reminder?.status === 'done' && <p className="hint">Este lembrete já foi avisado. Salvar com uma nova data o reativa.</p>}
      <ErrorText error={save.error ?? remove.error} />
    </Modal>
  );
}
