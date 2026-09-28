import { useQuery } from '@tanstack/react-query';
import { addHours } from 'date-fns';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { NotifyChannel, Reminder, Repeat } from '../api/types';
import { fmt, parseTs, ts } from '../lib/dates';
import { CHANNEL_LABEL, REPEAT_LABEL } from '../lib/labels';
import { ChannelChecks } from './ChannelChecks';
import { Icon } from './Icon';
import { ErrorText } from './ui';

/** Lembretes avulsos ("me lembre de…"). Os avisos chegam no sino do app e, se escolhido, no celular ou no WhatsApp. */
export function RemindersPanel() {
  const list = useQuery({ queryKey: ['reminders'], queryFn: () => api.get<Reminder[]>('/reminders') });
  const [title, setTitle] = useState('');
  const [at, setAt] = useState(() => ts(addHours(new Date(), 1)));
  const [repeat, setRepeat] = useState<Repeat>('none');
  const [channels, setChannels] = useState<NotifyChannel[]>([]);

  const create = useAction(
    (payload: Record<string, unknown>) => api.post('/reminders', payload),
    () => { setTitle(''); setAt(ts(addHours(new Date(), 1))); },
  );
  const remove = useAction((id: string) => api.del(`/reminders/${id}`));

  const items = list.data ?? [];
  return (
    <div className="routine-panel">
      <header className="routine-head">
        <div>
          <h2>Lembretes</h2>
          <p className="muted small">Avisos avulsos, únicos ou repetidos.</p>
        </div>
      </header>

      <form className="reminder-form" onSubmit={(e) => { e.preventDefault(); create.mutate({ title: title.trim(), at, repeat, channels }); }}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Me lembre de…" aria-label="O que lembrar" required />
        <div className="row">
          <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Quando" required />
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} aria-label="Repetir">
            {(Object.keys(REPEAT_LABEL) as Repeat[]).map((r) => <option key={r} value={r}>{REPEAT_LABEL[r]}</option>)}
          </select>
        </div>
        <ChannelChecks value={channels} onChange={setChannels} />
        <button className="btn primary" type="submit" disabled={create.isPending || !title.trim() || !at}><Icon name="plus" size={14} /> Criar lembrete</button>
        <ErrorText error={create.error ?? remove.error} />
      </form>

      {items.length === 0 && <p className="empty">Nenhum lembrete ainda. Você também pode pedir ao agente: “me lembre de ligar para o banco amanhã às 10h”.</p>}
      <ul className="reminder-list">
        {items.map((r) => (
          <li key={r.id} className={r.status === 'done' ? 'done' : ''}>
            <div>
              <strong>{r.title}</strong>
              <span className="muted small">
                {r.status === 'done' ? 'Já avisado · ' : ''}{fmt(parseTs(r.remindAt), "d MMM, HH:mm")}
                {r.repeat !== 'none' ? ` · ${REPEAT_LABEL[r.repeat].toLowerCase()}` : ''}
                {r.channels.length ? ` · ${r.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}` : ''}
              </span>
            </div>
            <button className="icon-btn" aria-label={`Apagar lembrete ${r.title}`} onClick={() => remove.mutate(r.id)}><Icon name="trash" size={16} /></button>
          </li>
        ))}
      </ul>
    </div>
  );
}
