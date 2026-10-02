const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => toISO(new Date());
export const dm = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/** Soma (ou subtrai, com n negativo) dias a uma data 'YYYY-MM-DD', sem fuso (meio-dia UTC evita pular de dia no DST). */
export function addDaysIso(date: string, n: number): string {
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)) + n);
  return toISO(d);
}

const WEEKDAY_NAMES = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTH_NAMES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Segunda-feira, 2 de outubro" — usado nos cabeçalhos de dia da Agenda/Lembretes. */
export function dayHeading(date: string): string {
  const d = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return `${cap(WEEKDAY_NAMES[d.getDay()])}, ${d.getDate()} de ${MONTH_NAMES[d.getMonth()]}`;
}
