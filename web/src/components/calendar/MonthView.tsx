import { addDays, eachDayOfInterval, endOfMonth, endOfWeek, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import type { CalendarEvent } from '../../api/types';
import { WEEKDAY_SHORT } from '../../lib/labels';
import { cssVars, eventColor } from '../../lib/colors';
import { parseYmd, ymd } from '../../lib/dates';
import type { Occurrence } from '../../lib/occurrences';
import { LEVEL_LABEL } from '../../lib/labels';

/** O evento aparece em todos os dias que cobre (um fim às 00:00 não conta o último dia). */
function onDay(ev: CalendarEvent, day: string): boolean {
  const first = ev.start.slice(0, 10);
  let last = ev.end.slice(0, 10);
  if (ev.end.slice(11) === '00:00') last = ymd(addDays(parseYmd(last), -1));
  return first <= day && day <= last;
}

const MAX_ROWS = 4;

export function MonthView({ date, events, actsOn, onOpenDay, onEvent }: {
  date: Date; events: CalendarEvent[]; actsOn?: (date: string) => Occurrence[];
  onOpenDay: (d: Date) => void; onEvent: (ev: CalendarEvent) => void;
}) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(date)), end: endOfWeek(endOfMonth(date)) });
  const selected = ymd(date);

  return (
    <div className="month">
      <div className="month-head">{WEEKDAY_SHORT.map((w) => <span key={w}>{w}</span>)}</div>
      <div className="month-grid">
        {days.map((d) => {
          const key = ymd(d);
          const list = events.filter((ev) => onDay(ev, key));
          const acts = actsOn?.(key) ?? [];
          const evShown = list.slice(0, MAX_ROWS);
          const actShown = acts.slice(0, MAX_ROWS - evShown.length);
          const hidden = list.length + acts.length - evShown.length - actShown.length;
          return (
            <div
              key={key} onClick={() => onOpenDay(d)} title="Abrir este dia"
              className={`cell${isSameMonth(d, date) ? '' : ' outside'}${isToday(d) ? ' today' : ''}${key === selected ? ' selected' : ''}`}
            >
              <button type="button" className="cell-num" onClick={(e) => { e.stopPropagation(); onOpenDay(d); }} aria-label={`Abrir dia ${key}`}>{d.getDate()}</button>
              {evShown.map((ev) => (
                <button
                  key={ev.id} type="button" className="cell-ev" style={cssVars({ '--ev': eventColor(ev.activityId ?? ev.title) })}
                  title={`${ev.start.slice(11)}–${ev.end.slice(11)} ${ev.title}${ev.location ? ` · ${ev.location}` : ''}`} onClick={(e) => { e.stopPropagation(); onEvent(ev); }}
                >
                  {ev.title}
                </button>
              ))}
              {actShown.map((o) => (
                <span key={o.activity.id} className={`cell-act ${o.level ?? 'todo'}`} title={`${o.activity.name} — ${o.level ? LEVEL_LABEL[o.level] : 'a fazer'}`}>
                  <i />{o.activity.name}
                </span>
              ))}
              {hidden > 0 && <span className="more">+{hidden} mais</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
