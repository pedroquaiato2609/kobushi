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
