import { addDays, isSameDay, isToday } from 'date-fns';
import { useEffect, useRef, type ReactNode } from 'react';
import type { CalendarEvent } from '../../api/types';
import { cssVars, eventColor } from '../../lib/colors';
import { cap, fmt, ymd } from '../../lib/dates';
import { LEVEL_LABEL } from '../../lib/labels';
import { assignLanes, layoutDay, type Placed } from '../../lib/layout';
import type { CommuteOccurrence, Occurrence } from '../../lib/occurrences';
import { effectiveBlocks, placeFlexible, toHHmm, windowFor, type Placement } from '../../lib/schedule';

const HOUR = 48; // px por hora
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const shortDay = (d: Date) => cap(fmt(d, 'EEEE').split('-')[0]).slice(0, 3);
const status = (o: Occurrence) => `${o.activity.name} — ${o.level ? LEVEL_LABEL[o.level] : 'a fazer'}`;

/** Objetivos sem horário fixo: encaixados no período/janela, desviando de obrigações, deslocamentos, eventos e uns dos outros. */
function planGoals(occ: Occurrence[], commuteOcc: CommuteOccurrence[], events: Placed[], weekday: number): { o: Occurrence; p: Placement }[] {
  const busy = [
    ...occ.filter((o) => o.activity.timeMode === 'fixed').flatMap((o) => effectiveBlocks(o.activity, weekday).map((b) => {
      const start = toMin(b.startTime);
      return { start, end: b.endTime ? toMin(b.endTime) : start + 60 };
    })),
    ...commuteOcc.map((c) => ({ start: toMin(c.block.startTime), end: toMin(c.block.endTime) })),
    ...events.map((e) => ({ start: e.s, end: e.e })),
  ];
  const flex = occ.filter((o) => o.activity.timeMode !== 'fixed').flatMap((o) => {
    const window = windowFor(o.activity);
    return window ? [{ id: o.activity.id, window, durationMin: o.activity.durationMin, suggestedStart: o.activity.suggestedStart ? toMin(o.activity.suggestedStart) : null }] : [];
  });
  const plan = placeFlexible(flex, busy);
  return occ.flatMap((o) => { const p = plan.get(o.activity.id); return p ? [{ o, p }] : []; });
}

/**
 * Semana (vários dias): cabeçalho clicável que abre o dia, com bolinhas do progresso da rotina; atividades de horário fixo
 * viram uma faixa fina na lateral da coluna. Dia (um dia): linha de resumo acima (`dayLine`) e faixa suave com o nome.
 * Só os eventos têm blocos cheios: é neles que o olhar deve cair.
 */
export function TimeGrid({ days, events, actsOn, commutesOn, selected, dayLine, onOpenDay, onSlot, onEvent }: {
  days: Date[]; events: CalendarEvent[]; actsOn?: (date: string) => Occurrence[]; commutesOn?: (date: string) => CommuteOccurrence[];
  selected: Date; dayLine?: ReactNode;
  onOpenDay: (d: Date) => void; onSlot: (start: Date) => void; onEvent: (ev: CalendarEvent) => void;
}) {
  const single = days.length === 1;
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = 7 * HOUR - 6; }, [days.length]);

  const cols = { gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr))` };
  const now = new Date();
  const nowTop = ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR;

  return (
    <div className={`timegrid ${single ? 'is-day' : 'is-week'}`}>
      {single && dayLine}
      <div className="tg-scroll" ref={scroller}>
        {!single && (
          <div className="tg-top">
            <div className="tg-head" style={cols}>
              <div />
              {days.map((d) => {
                const occ = actsOn?.(ymd(d)) ?? [];
                const done = occ.filter((o) => o.level).length;
                return (
                  <button key={d.toISOString()} type="button" onClick={() => onOpenDay(d)} title={`Abrir ${fmt(d, "EEEE, d 'de' MMMM")}`}
                    className={`tg-day${isToday(d) ? ' today' : ''}${isSameDay(d, selected) ? ' selected' : ''}`}>
                    <span>{shortDay(d)}</span>
                    <b>{fmt(d, 'd')}</b>
                    {occ.length > 0 && (
                      <span className="tg-dots" title={`${done} de ${occ.length} atividades registradas`}>
                        {occ.map((o) => <i key={o.activity.id} className={o.level ?? 'todo'} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="tg-body" style={cols}>
          <div className="tg-hours" aria-hidden="true">
            {Array.from({ length: 24 }, (_, h) => <span key={h} style={{ height: HOUR }}>{h > 0 ? `${String(h).padStart(2, '0')}:00` : ''}</span>)}
          </div>
          {days.map((d) => {
            const dayOcc = actsOn?.(ymd(d)) ?? [];
            const dayCommutes = commutesOn?.(ymd(d)) ?? [];
            const placed = layoutDay(`${ymd(d)}T00:00`, `${ymd(addDays(d, 1))}T00:00`, events);
            const weekday = d.getDay();
            return (
            <div
              key={d.toISOString()} className="tg-col" style={{ height: 24 * HOUR }}
              onClick={(e) => {
                if (e.target !== e.currentTarget) return;
                const start = new Date(d);
                start.setHours(Math.floor(e.nativeEvent.offsetY / HOUR), 0, 0, 0);
                onSlot(start);
              }}
            >
              {isToday(d) && <div className="tg-now" style={{ top: nowTop }} />}
              {assignLanes(dayOcc.filter((o) => o.activity.timeMode === 'fixed').flatMap((o) => effectiveBlocks(o.activity, weekday).map((t, i) => {
                const s = toMin(t.startTime);
                return { o, i, s, e: t.endTime ? toMin(t.endTime) : s + 60, t };
              }))).map(({ o, i, s, e, t, lane, lanes }) => {
                const box = {
                  top: (s / 60) * HOUR, height: Math.max(((e - s) / 60) * HOUR, 22),
                  left: `calc(${(lane / lanes) * 100}%)`, width: `calc(${100 / lanes}%)`,
                };
                return single
                  ? <div key={`${o.activity.id}-${i}`} className={`tg-band ${o.level ?? 'todo'}`} style={box} title={status(o)}><b>{o.activity.name}</b><span>{t.startTime}–{t.endTime ?? ''}</span></div>
                  : <i key={`${o.activity.id}-${i}`} className={`tg-rail ${o.level ?? 'todo'}`} style={{ ...box, left: `calc(${lane * 5}px)`, width: 4 }} title={status(o)} />;
              })}
              {dayCommutes.map((co) => {
                const s = toMin(co.block.startTime), e = toMin(co.block.endTime);
                const box = { top: (s / 60) * HOUR, height: Math.max(((e - s) / 60) * HOUR, 22) };
                return (
                  <div key={co.commute.id} className="tg-commute" style={box} title={`${co.commute.name} · ${co.block.startTime}–${co.block.endTime}`}>
                    <b>{co.commute.name}</b><span>{co.block.startTime}–{co.block.endTime}</span>
                  </div>
                );
              })}
              {/* dia lotado (sem 1 min de folga em lugar nenhum): não desenha, pra não inventar um horário falso que ia cair em cima de outra coisa — o objetivo continua visível na ficha acima */}
              {assignLanes(planGoals(dayOcc, dayCommutes, placed, weekday).filter(({ p }) => p.fitted).map(({ o, p }) => ({ o, p, s: p.start, e: p.end }))).map(({ o, p, s, e, lane, lanes }) => {
                const box = {
                  top: (s / 60) * HOUR, height: Math.max(((e - s) / 60) * HOUR, 22),
                  left: `calc(${(lane / lanes) * 100}%)`, width: `calc(${100 / lanes}%)`,
                };
                const when = `${toHHmm(p.start)}–${toHHmm(p.end)}`;
                const note = p.suggested ? ' · sugerido pela IA'
                  : p.inWindow ? ' · encaixado automaticamente' : ' · sem vaga no período: encaixado mais tarde';
                return (
                  <div key={o.activity.id} className={`tg-goal ${o.level ?? 'todo'}`} style={box} title={`${status(o)} · ${when}${note}`}>
                    <b>{o.activity.name}</b><span>{when}{p.suggested ? ' · IA' : ''}</span>
                  </div>
                );
              })}
              {placed.map((p) => (
                <button
                  key={p.ev.id} type="button" className="tg-event"
                  style={{
                    ...cssVars({ '--ev': eventColor(p.ev.activityId ?? p.ev.title) }),
                    top: (p.s / 60) * HOUR, height: Math.max(((p.e - p.s) / 60) * HOUR, 22),
                    left: `calc(${(p.lane / p.lanes) * 100}% + ${single ? 10 : 6}px)`, width: `calc(${100 / p.lanes}% - ${single ? 14 : 8}px)`,
                  }}
                  onClick={() => onEvent(p.ev)} title={`${p.ev.start.slice(11)}–${p.ev.end.slice(11)} ${p.ev.title}${p.ev.location ? ` · ${p.ev.location}` : ''}`}
                >
                  <b>{p.ev.title}</b>
                  <span>{p.ev.start.slice(11)}–{p.ev.end.slice(11)}{p.ev.location ? ` · ${p.ev.location}` : ''}</span>
                </button>
              ))}
            </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
