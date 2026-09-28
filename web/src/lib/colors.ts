import type { CSSProperties } from 'react';

/** Paleta dos eventos: cada evento (ou atividade vinculada) ganha sempre a mesma cor. */
export const EVENT_COLORS = ['#7C6CF0', '#0EA5C6', '#4C7DFF', '#E5487A', '#E8843C', '#22A06B'];
export const COLUMN_COLORS = ['#8C94AD', '#7C6CF0', '#34C38F', '#F2B84B', '#F26D85', '#5B9DFF'];

export function eventColor(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return EVENT_COLORS[h % EVENT_COLORS.length];
}

/** Permite passar variáveis CSS (--ev, --col) pelo atributo style. */
export const cssVars = (vars: Record<string, string | number>) => vars as unknown as CSSProperties;
