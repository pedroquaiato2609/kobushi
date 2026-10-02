// Espelho de web/src/lib/money.ts — dinheiro sempre em centavos inteiros (o servidor também).
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const brlShort = (cents: number) => {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 10_000) return `${Math.round(v / 1000)} mil`;
  if (abs >= 1000) return `${(v / 1000).toFixed(1).replace('.', ',')} mil`;
  return String(Math.round(v));
};

/** "1.234,56" · "85" · "85,5" · "R$ 12,00" → centavos. Devolve null se não der para entender. */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[^\d.,-]/g, '').trim();
  if (!t || !/\d/.test(t)) return null;
  const neg = t.startsWith('-');
  let clean = t.replace(/-/g, '');
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  else if ((clean.match(/\./g) ?? []).length > 1) clean = clean.replace(/\./g, '');
  else if (/\.\d{3}$/.test(clean)) clean = clean.replace('.', ''); // "1.234" = mil, duzentos e trinta e quatro
  const n = Number(clean);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}
export const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? '' : (cents / 100).toFixed(2).replace('.', ','));
