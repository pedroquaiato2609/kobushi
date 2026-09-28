// Dinheiro sempre em centavos inteiros (nunca ponto flutuante).
export const toCents = (reais: number) => Math.round(reais * 100);
export const fromCents = (cents: number) => Math.round(cents) / 100;
// (troca o espaço "não separável" do Intl por um espaço comum: facilita comparar textos e não confunde o modelo)
export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/\u00a0/g, ' ');
