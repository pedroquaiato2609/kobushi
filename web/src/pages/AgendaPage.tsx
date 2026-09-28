import { useQuery } from '@tanstack/react-query';
import {
  addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek,
} from 'date-fns';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import type { Activity, CalendarEvent, Execution, Reminder } from '../api/types';
import { EventModal } from '../components/calendar/EventModal';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGrid } from '../components/calendar/TimeGrid';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { cap, fmt, ts, ymd } from '../lib/dates';
import { LEVEL_LABEL, PERIOD_LABEL } from '../lib/labels';
import { occurrencesOn, type Occurrence } from '../lib/occurrences';
import { remindersOnDay } from '../lib/reminders';

type View = 'day' | 'week' | 'month';
const VIEW_LABEL: Record<View, string> = { day: 'Dia', week: 'Semana', month: 'Mês' };
const SHOW_ACTS_KEY = 'ninshiki.agenda.activities';
const isMobile = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 820px)').matches;

/** Resumo no topo da visão de Dia: números do dia, a rotina em fichas e os horários dos avisos. */
function DayLine({ date, events, occ, reminders, activities }: {
  date: Date; events: CalendarEvent[]; occ: Occurrence[]; reminders: Reminder[]; activities: Activity[];
}) {
  const day = ymd(date);
  const today = events.filter((e) => e.start.slice(0, 10) <= day && e.end.slice(0, 10) >= day && !(e.end.slice(0, 10) === day && e.end.slice(11) === '00:00' && e.start.slice(0, 10) < day));
  const done = occ.filter((o) => o.level).length;
  const alerts = remindersOnDay(day, reminders, activities, events);
  const chips = occ.filter((o) => o.activity.timeMode !== 'fixed');
  return (
    <div className="day-line">
      <div className="day-stats">
        <span><b>{today.length}</b> {today.length === 1 ? 'evento' : 'eventos'}</span>
        <span><b>{done}/{occ.length}</b> atividades</span>
        <span><b>{alerts.length}</b> {alerts.length === 1 ? 'aviso' : 'avisos'}</span>
      </div>
      {(chips.length > 0 || alerts.length > 0) && (
        <div className="day-chips">
          {chips.map((o) => (
            <span key={o.activity.id} className={`cell-act ${o.level ?? 'todo'}`} title={`${o.activity.name} — ${o.level ? LEVEL_LABEL[o.level] : 'a fazer'}`}>
              <i />{o.activity.period ? `${PERIOD_LABEL[o.activity.period]} · ` : ''}{o.activity.name}
            </span>
          ))}
          {alerts.map((a) => <span key={a.key} className="rem-chip" title={a.detail || 'Aviso'}><Icon name="bell" size={12} /> {a.at.slice(11)} {a.title}</span>)}
        </div>
      )}
    </div>
  );
}

export default function AgendaPage() {
  const [view, setView] = useState<View>(() => (isMobile() ? 'day' : 'month'));
  const [backView, setBackView] = useState<View | null>(null); // de onde o usuário veio ao abrir um dia
  const [showActs, setShowActs] = useState(() => localStorage.getItem(SHOW_ACTS_KEY) !== '0');
  const [date, setDate] = useState(() => new Date());
  const [modal, setModal] = useState<{ event?: CalendarEvent; start?: Date } | null>(null);

  const range = useMemo(() => {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(date));
      const end = addDays(endOfWeek(endOfMonth(date)), 1);
      return { start, end, days: [] as Date[] };
    }
    if (view === 'week') {
      const start = startOfWeek(date);
      return { start, end: addDays(start, 7), days: eachDayOfInterval({ start, end: endOfWeek(date) }) };
    }
    const start = startOfDay(date);
    return { start, end: addDays(start, 1), days: [start] };
  }, [view, date]);

  const from = ts(range.start);
  const to = ts(range.end);
  const events = useQuery({
    queryKey: ['events', from, to],
    queryFn: () => api.get<CalendarEvent[]>(`/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const reminders = useQuery({ queryKey: ['reminders'], queryFn: () => api.get<Reminder[]>('/reminders') });
  const execFrom = ymd(range.start);
  const execTo = ymd(addDays(range.end, -1));
  const executions = useQuery({
    queryKey: ['executions', execFrom, execTo],
    queryFn: () => api.get<Execution[]>(`/executions?from=${execFrom}&to=${execTo}`),
  });
  const actsOn = useMemo(
    () => (showActs ? (day: string) => occurrencesOn(day, activities.data ?? [], executions.data ?? []) : undefined),
    [showActs, activities.data, executions.data],
  );
  const toggleActs = () => setShowActs((v) => { localStorage.setItem(SHOW_ACTS_KEY, v ? '0' : '1'); return !v; });

  const changeView = (v: View) => { setView(v); setBackView(null); };
  const step = (dir: 1 | -1) =>
    setDate((d) => (view === 'month' ? addMonths(d, dir) : view === 'week' ? addWeeks(d, dir) : addDays(d, dir)));

  /** Clicar num dia (no mês ou no cabeçalho da semana) entra nele; "Voltar" retorna à visão de origem. */
  const openDay = (d: Date) => {
    if (view !== 'day') setBackView(view);
    setDate(d);
    setView('day');
  };
  const goBack = () => { if (backView) { setView(backView); setBackView(null); } };

  const title =
    view === 'month' ? cap(fmt(date, "MMMM 'de' yyyy"))
    : view === 'week' ? `${fmt(range.start, 'd MMM')} – ${fmt(addDays(range.end, -1), 'd MMM yyyy')}`
    : `${cap(fmt(date, 'EEEE').split('-')[0].slice(0, 3))}, ${fmt(date, "d 'de' MMMM")}`;

  const openNew = () => {
    const start = new Date(date);
    start.setHours(9, 0, 0, 0);
    setModal({ start });
  };

  return (
    <div className="page">
      <PageHeader title="Agenda" subtitle="Eventos e atividades da rotina no mesmo calendário. Toque num dia para entrar nele.">
        <button className="btn primary" onClick={openNew}><Icon name="plus" size={16} /> Novo evento</button>
      </PageHeader>

      <div className="agenda-body">
        <section className="calendar" aria-label="Calendário">
          <div className="cal-toolbar">
            {view === 'day' && backView && (
              <button className="btn" onClick={goBack}><Icon name="left" size={16} /> {backView === 'month' ? 'Mês' : 'Semana'}</button>
            )}
            <div className="nav-arrows">
              <button className="btn round" onClick={() => step(-1)} aria-label="Anterior"><Icon name="left" /></button>
              <button className="btn round" onClick={() => step(1)} aria-label="Próximo"><Icon name="right" /></button>
            </div>
            <button className="btn" onClick={() => setDate(new Date())}>Hoje</button>
            <h2 className="cal-title">{title}</h2>
            <button className="btn" aria-pressed={showActs} onClick={toggleActs} title="Mostrar as atividades da rotina no calendário"><Icon name="target" size={16} /> Atividades</button>
            <div className="btn-group" role="group" aria-label="Visualização">
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <button key={v} className="btn" aria-pressed={view === v} onClick={() => changeView(v)}>{VIEW_LABEL[v]}</button>
              ))}
            </div>
          </div>

          {view === 'month' ? (
            <MonthView date={date} events={events.data ?? []} actsOn={actsOn} onOpenDay={openDay} onEvent={(event) => setModal({ event })} />
          ) : (
            <TimeGrid
              days={range.days} events={events.data ?? []} actsOn={actsOn} selected={date} onOpenDay={openDay}
              onSlot={(start) => setModal({ start })} onEvent={(event) => setModal({ event })}
              dayLine={view === 'day' ? (
                <DayLine date={date} events={events.data ?? []} occ={actsOn?.(ymd(date)) ?? occurrencesOn(ymd(date), activities.data ?? [], executions.data ?? [])}
                  reminders={reminders.data ?? []} activities={activities.data ?? []} />
              ) : undefined}
            />
          )}
          {events.error && <p className="error" role="alert" style={{ padding: '0 18px' }}>{(events.error as Error).message}</p>}
        </section>

      </div>

      {modal && <EventModal key={modal.event?.id ?? 'new'} event={modal.event} initialStart={modal.start} onClose={() => setModal(null)} />}
    </div>
  );
}
