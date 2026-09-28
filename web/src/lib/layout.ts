import type { CalendarEvent } from '../api/types';

/** Minutos desde 00:00 de um horário 'YYYY-MM-DDTHH:mm'. */
export const minutesOf = (t: string) => Number(t.slice(11, 13)) * 60 + Number(t.slice(14, 16));

/**
 * Distribui intervalos [s, e) que se sobrepõem em faixas lado a lado, para nunca desenhar dois por cima do outro
 * (o texto ficaria ilegível). Usado por eventos, atividades de horário fixo e objetivos — cada grupo em faixas
 * próprias, já que cada um evita os outros grupos por outro caminho (ver TimeGrid.tsx).
 */
export function assignLanes<T extends { s: number; e: number }>(items: T[]): (T & { lane: number; lanes: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || b.e - a.e);
  const out: (T & { lane: number; lanes: number })[] = [];
  let cluster: (T & { lane: number })[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const flush = () => { cluster.forEach((c) => out.push({ ...c, lanes: laneEnds.length })); cluster = []; laneEnds = []; clusterEnd = 0; };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(it.e); } else laneEnds[lane] = it.e;
    cluster.push({ ...it, lane });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
  return out;
}

export interface Placed { ev: CalendarEvent; s: number; e: number; lane: number; lanes: number }

/**
 * Recorta os eventos ao dia [dayStart, dayEnd) e distribui os que se sobrepõem em faixas lado a lado.
 * dayStart/dayEnd no formato 'YYYY-MM-DDTHH:mm' (comparáveis como texto).
 */
export function layoutDay(dayStart: string, dayEnd: string, events: CalendarEvent[]): Placed[] {
  const items = events
    .filter((ev) => ev.end > dayStart && ev.start < dayEnd)
    .map((ev) => ({ ev, s: ev.start < dayStart ? 0 : minutesOf(ev.start), e: ev.end >= dayEnd ? 1440 : minutesOf(ev.end) }));
  return assignLanes(items);
}
