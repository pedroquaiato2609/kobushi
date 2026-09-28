import type { ChatMessage } from './providers/types';

const size = (m: ChatMessage) => m.content.length + (m.role === 'assistant' && m.toolCalls ? JSON.stringify(m.toolCalls).length : 0);

/**
 * Limita o que é reenviado ao modelo a cada passo (o limite por minuto dos provedores conta tudo):
 * descarta turnos inteiros mais antigos até caber no orçamento (nunca separa uma chamada de ferramenta do seu resultado)
 * e encurta os resultados de ferramentas — os do turno atual com folga, os antigos bem mais.
 */
export function fitHistory(
  messages: ChatMessage[],
  opts: { budgetChars: number; lastToolChars: number; oldToolChars: number } = { budgetChars: 14_000, lastToolChars: 6_000, oldToolChars: 600 },
): ChatMessage[] {
  const turns: ChatMessage[][] = [];
  for (const m of messages) {
    if (m.role === 'user' || turns.length === 0) turns.push([m]);
    else turns[turns.length - 1].push(m);
  }

  const shrink = (m: ChatMessage, limit: number): ChatMessage =>
    m.role === 'tool' && m.content.length > limit ? { ...m, content: `${m.content.slice(0, limit)} …[resultado encurtado]` } : m;
  const trimmed = turns.map((t, i) => t.map((m) => shrink(m, i === turns.length - 1 ? opts.lastToolChars : opts.oldToolChars)));

  let total = trimmed.reduce((n, t) => n + t.reduce((k, m) => k + size(m), 0), 0);
  while (trimmed.length > 1 && total > opts.budgetChars) {
    total -= trimmed.shift()!.reduce((k, m) => k + size(m), 0);
  }
  return trimmed.flat();
}
