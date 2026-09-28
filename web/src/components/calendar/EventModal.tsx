import { useQuery } from '@tanstack/react-query';
import { addHours } from 'date-fns';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Activity, CalendarEvent, NotifyChannel } from '../../api/types';
import { parseTs, ts } from '../../lib/dates';
import { ChannelChecks } from '../ChannelChecks';
import { useConfirm } from '../ConfirmProvider';
import { ErrorText, Field, Modal } from '../ui';

const REMIND_OPTIONS = [[5, '5 minutos antes'], [10, '10 minutos antes'], [15, '15 minutos antes'], [30, '30 minutos antes'], [60, '1 hora antes'], [120, '2 horas antes'], [1440, '1 dia antes']] as const;

export function EventModal({ event, initialStart, onClose }: { event?: CalendarEvent; initialStart?: Date; onClose: () => void }) {
  const base = initialStart ?? new Date();
  const confirm = useConfirm();
  const [title, setTitle] = useState(event?.title ?? '');
  const [description, setDescription] = useState(event?.description ?? '');
  const [start, setStart] = useState(event?.start ?? ts(base));
  const [end, setEnd] = useState(event?.end ?? ts(addHours(base, 1)));
  const [activityId, setActivityId] = useState(event?.activityId ?? '');
  const [location, setLocation] = useState(event?.location ?? '');
  const [remind, setRemind] = useState<string>(event?.remindMinutes != null ? String(event.remindMinutes) : '');
  const [channels, setChannels] = useState<NotifyChannel[]>(event?.remindChannels ?? []);

  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });

  const save = useAction(
    (payload: Record<string, unknown>) => (event ? api.patch<CalendarEvent>(`/events/${event.id}`, payload) : api.post<CalendarEvent>('/events', payload)),
    onClose,
  );
  const remove = useAction(() => api.del(`/events/${event!.id}`), onClose);

  // ao mover o início para depois do fim, empurra o fim (mantendo 1 h)
  const changeStart = (v: string) => {
    setStart(v);
    if (v && end <= v) setEnd(ts(addHours(parseTs(v), 1)));
  };

  return (
    <Modal
      title={event ? 'Editar evento' : 'Novo evento'}
      onClose={onClose}
      onSubmit={() => save.mutate({
        title: title.trim(), description, start, end, activityId: activityId || null,
        location: location.trim(), remindMinutes: remind === '' ? null : Number(remind), remindChannels: remind === '' ? [] : channels,
      })}
      footer={
        <>
          {event && (
            <button type="button" className="btn danger" disabled={remove.isPending}
              onClick={async () => { if (await confirm(`Apagar "${event.title}"?`)) remove.mutate(undefined); }}>Apagar</button>
          )}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim() || !start || !end}>Salvar</button>
        </>
      }
    >
      <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required /></Field>
      <div className="row">
        <Field label="Início"><input type="datetime-local" value={start} onChange={(e) => changeStart(e.target.value)} required /></Field>
        <Field label="Fim"><input type="datetime-local" value={end} min={start} onChange={(e) => setEnd(e.target.value)} required /></Field>
      </div>
      <Field label="Local (opcional)"><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="ex.: Farmácia, Mercado, Clínica…" /></Field>
      <Field label="Avisar">
        <select value={remind} onChange={(e) => setRemind(e.target.value)}>
          <option value="">Sem aviso</option>
          {REMIND_OPTIONS.map(([m, label]) => <option key={m} value={m}>{label}</option>)}
        </select>
      </Field>
      {remind !== '' && <ChannelChecks value={channels} onChange={setChannels} />}
      <Field label="Atividade relacionada (opcional)">
        <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
          <option value="">Nenhuma</option>
          {(activities.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <Field label="Descrição"><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <ErrorText error={save.error ?? remove.error} />
    </Modal>
  );
}
