import { useQuery } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { useState } from 'react';
import { api } from '../../api/client';
import type { CalendarEvent } from '../../api/types';
import { cssVars, eventColor } from '../../lib/colors';
import { cap, fmt, parseTs, ts } from '../../lib/dates';

/** Próximos 14 dias em cartões coloridos. */
export function UpcomingEvents({ onEvent, onNew }: { onEvent: (ev: CalendarEvent) => void; onNew: () => void }) {
  const [from] = useState(() => ts(new Date()));
  const [to] = useState(() => ts(addDays(new Date(), 14)));
  const events = useQuery({
    queryKey: ['events', 'upcoming', from],
    queryFn: () => api.get<CalendarEvent[]>(`/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });
  const list = (events.data ?? []).slice(0, 8);

  if (events.isLoading) return <p className="muted">Carregando…</p>;
  if (list.length === 0) {
    return (
      <div className="empty">
        <p>Nenhum evento nos próximos 14 dias.</p>
        <button className="btn small" onClick={onNew}>Criar evento</button>
      </div>
    );
  }
  return (
    <div className="ev-cards">
      {list.map((ev) => {
        const start = parseTs(ev.start);
        return (
          <button key={ev.id} className="ev-card" style={cssVars({ '--ev': eventColor(ev.activityId ?? ev.title) })} onClick={() => onEvent(ev)}>
            <span className="ev-day">{fmt(start, 'd')}<small>{fmt(start, 'MMM')}</small></span>
            <span className="ev-info"><b>{ev.title}</b><span>{cap(fmt(start, 'EEEE'))}, {ev.start.slice(11)}–{ev.end.slice(11)}</span></span>
          </button>
        );
      })}
    </div>
  );
}
