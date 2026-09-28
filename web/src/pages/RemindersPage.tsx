import { useQuery } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, CalendarEvent, Reminder } from '../api/types';
import { ActivityModal } from '../components/ActivityModal';
import { EventModal } from '../components/calendar/EventModal';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { ReminderModal } from '../components/ReminderModal';
import { ErrorText } from '../components/ui';
import { cap, fmt, parseTs, ts, ymd } from '../lib/dates';
import { CHANNEL_LABEL, REPEAT_LABEL } from '../lib/labels';
import { upcomingReminders, type ReminderItem, type ReminderKind } from '../lib/reminders';

type Filter = 'all' | ReminderKind | 'done';
const FILTERS: [Filter, string][] = [['all', 'Todos'], ['reminder', 'Avulsos'], ['activity', 'Atividades'], ['event', 'Eventos'], ['done', 'Já avisados']];
const KIND_TAG: Record<ReminderKind, string> = { reminder: 'Lembrete', activity: 'Atividade', event: 'Evento' };

function dayHeading(at: string, todayStr: string, tomorrowStr: string) {
  const d = at.slice(0, 10);
  if (d === todayStr) return 'Hoje';
  if (d === tomorrowStr) return 'Amanhã';
  return cap(fmt(parseTs(at), "EEEE, d 'de' MMMM"));
}

const repeatText = (i: ReminderItem) =>
  i.repeat === 'activity' || i.repeat === 'none' ? '' : REPEAT_LABEL[i.repeat].toLowerCase();

export default function RemindersPage() {
  const confirm = useConfirm();
  const now = useMemo(() => new Date(), []);
  const reminders = useQuery({ queryKey: ['reminders'], queryFn: () => api.get<Reminder[]>('/reminders') });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const events = useQuery({
    queryKey: ['events', 'reminders-60d'],
    queryFn: () => api.get<CalendarEvent[]>(`/events?from=${encodeURIComponent(ts(now))}&to=${encodeURIComponent(ts(addDays(now, 60)))}`),
  });

  const [filter, setFilter] = useState<Filter>('all');
  const [editing, setEditing] = useState<{ kind: ReminderKind; item?: ReminderItem } | null>(null);
  const remove = useAction((id: string) => api.del(`/reminders/${id}`));
  const toggleDone = useAction((v: { id: string; done: boolean }) => api.patch(`/reminders/${v.id}`, { done: v.done }));

  const all = useMemo(
    () => upcomingReminders(reminders.data ?? [], activities.data ?? [], events.data ?? [], now),
    [reminders.data, activities.data, events.data, now],
  );
  const list = all.filter((i) => (filter === 'all' ? !i.done : filter === 'done' ? i.done : !i.done && i.kind === filter));

  const todayStr = ymd(now);
  const tomorrowStr = ymd(addDays(now, 1));
  const groups: { title: string; items: ReminderItem[] }[] = [];
  for (const item of list) {
    const title = item.done ? 'Já avisados' : dayHeading(item.at, todayStr, tomorrowStr);
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }

  const pending = all.filter((i) => !i.done);
  const next = pending[0];
  const recurring = pending.filter((i) => i.repeat !== 'none').length;
  const loading = reminders.isLoading || activities.isLoading;

  const open = (i: ReminderItem) => setEditing({ kind: i.kind, item: i });

  return (
    <div className="page">
      <PageHeader title="Lembretes" subtitle="Tudo o que vai te avisar: lembretes avulsos, avisos das atividades e dos eventos, no sino, no celular ou no WhatsApp.">
        <button className="btn primary" onClick={() => setEditing({ kind: 'reminder' })}><Icon name="plus" size={16} /> Novo lembrete</button>
      </PageHeader>

      <div className="stat-tiles">
        <div className="tile wide">
          <b>{next ? next.at.slice(11) : '—'}</b>
          <span>{next ? `próximo aviso · ${dayHeading(next.at, todayStr, tomorrowStr).toLowerCase()} · ${next.title}` : 'nenhum aviso agendado'}</span>
        </div>
        <div className="tile"><b>{pending.length}</b><span>agendados</span></div>
        <div className="tile"><b>{recurring}</b><span>se repetem</span></div>
        <div className="tile"><b>{all.filter((i) => i.done).length}</b><span>já avisados</span></div>
      </div>

      <div className="toolbar">
        <div className="btn-group" role="group" aria-label="Filtrar lembretes">
          {FILTERS.map(([k, label]) => <button key={k} className="btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
      </div>

      <ErrorText error={reminders.error ?? activities.error ?? events.error ?? remove.error ?? toggleDone.error} />
      {!loading && list.length === 0 && (
        <div className="panel empty-block">
          <p>{filter === 'done' ? 'Nenhum lembrete avisado ainda.' : 'Nenhum lembrete por aqui.'}</p>
          {filter !== 'done' && <p className="hint">Crie um aqui, ative o aviso diário em uma atividade, ou peça ao agente: “me lembre de tomar água todo dia às 15h”.</p>}
        </div>
      )}

      {groups.map((g) => (
        <section key={g.title} className="rem-group">
          <h2>{g.title}</h2>
          <ul>
            {g.items.map((i) => (
              <li key={i.key} className={`rem-row k-${i.kind}${i.done ? ' done' : ''}`}>
                <span className="rem-time">{i.at.slice(11)}</span>
                <div className="rem-main">
                  <b>{i.title}</b>
                  <span className="muted small">
                    {i.detail && `${i.detail} · `}
                    {repeatText(i) && `${repeatText(i)} · `}
                    {i.channels.length ? i.channels.map((c) => CHANNEL_LABEL[c]).join(', ') : 'só no sino do app'}
                    {i.done && i.reminder?.lastFiredAt ? ` · avisado ${fmt(parseTs(i.reminder.lastFiredAt), "d MMM 'às' HH:mm")}` : ''}
                  </span>
                </div>
                <span className={`tag k-${i.kind}`}>{KIND_TAG[i.kind]}</span>
                <div className="rem-actions">
                  <button className="btn small" onClick={() => open(i)}>Editar</button>
                  {i.kind === 'reminder' && i.reminder && (
                    <>
                      {i.reminder.status === 'done'
                        ? <button className="btn small" onClick={() => toggleDone.mutate({ id: i.reminder!.id, done: false })}>Reativar</button>
                        : <button className="btn small ghost" onClick={() => toggleDone.mutate({ id: i.reminder!.id, done: true })}>Concluir</button>}
                      <button className="icon-btn" aria-label={`Apagar ${i.title}`} onClick={async () => { if (await confirm(`Apagar "${i.title}"?`)) remove.mutate(i.reminder!.id); }}><Icon name="trash" size={16} /></button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing?.kind === 'reminder' && <ReminderModal reminder={editing.item?.reminder} onClose={() => setEditing(null)} />}
      {editing?.kind === 'activity' && editing.item?.activity && <ActivityModal activity={editing.item.activity} onClose={() => setEditing(null)} />}
      {editing?.kind === 'event' && editing.item?.event && <EventModal event={editing.item.event} onClose={() => setEditing(null)} />}
    </div>
  );
}
