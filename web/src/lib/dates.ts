import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const ymd = (d: Date) => format(d, 'yyyy-MM-dd');
export const parseYmd = (s: string) => parse(s, 'yyyy-MM-dd', new Date());
/** Formato usado pela API para horários: 'YYYY-MM-DDTHH:mm' (hora local). */
export const ts = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");
export const parseTs = (s: string) => parse(s, "yyyy-MM-dd'T'HH:mm", new Date());
export const fmt = (d: Date, pattern: string) => format(d, pattern, { locale: ptBR });

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
