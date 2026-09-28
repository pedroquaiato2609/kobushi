// Regras puras do módulo Leitura (sem banco): validação de ISBN, ritmo de leitura, previsão de término e sequência.

/** Remove tudo que não é dígito/X e maiúsculiza; aceita ISBN-10 ou ISBN-13 com ou sem hífens/espaços. */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9Xx]/g, '').toUpperCase();
}

/** Dígito verificador dos dois formatos, pelo algoritmo oficial — recusa ISBN digitado errado antes de gastar uma busca externa. */
export function isValidIsbn(raw: string): boolean {
  const s = normalizeIsbn(raw);
  if (s.length === 10) {
    if (!/^\d{9}[\dX]$/.test(s)) return false;
    const sum = [...s].reduce((acc, c, i) => acc + (c === 'X' ? 10 : Number(c)) * (10 - i), 0);
    return sum % 11 === 0;
  }
  if (s.length === 13) {
    if (!/^\d{13}$/.test(s)) return false;
    const sum = [...s].reduce((acc, c, i) => acc + Number(c) * (i % 2 === 0 ? 1 : 3), 0);
    return sum % 10 === 0;
  }
  return false;
}

export interface SessionLike { date: string; pages: number | null; minutes: number | null }

/** Páginas por dia lido, considerando só os dias em que algo foi de fato registrado (não o calendário todo). */
export function averagePagesPerDay(sessions: SessionLike[]): number {
  const byDay = new Map<string, number>();
  for (const s of sessions) if (s.pages) byDay.set(s.date, (byDay.get(s.date) ?? 0) + s.pages);
  const days = [...byDay.values()];
  return days.length ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : 0;
}

/** Dias restantes no ritmo atual (null = sem páginas restantes, sem total definido, ou sem ritmo para estimar). */
export function estimateDaysToFinish(currentPage: number, totalPages: number | null, pagesPerDay: number): number | null {
  if (!totalPages || pagesPerDay <= 0) return null;
  const remaining = totalPages - currentPage;
  return remaining <= 0 ? 0 : Math.ceil(remaining / pagesPerDay);
}

/**
 * Sequência de dias seguidos com pelo menos uma sessão registrada, terminando hoje ou ontem (como as demais
 * sequências do app: um dia sem registro ainda em andamento não quebra a sequência até acabar o dia).
 */
export function readingStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  let cursor = set.has(today) ? today : yesterday.toISOString().slice(0, 10);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    const d = new Date(`${cursor}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    cursor = d.toISOString().slice(0, 10);
  }
  return streak;
}

/**
 * Extrai o primeiro número de um texto livre de meta (ex.: "20 páginas" -> 20). É assim que o nível
 * mínimo/ideal/máximo da atividade de rotina "Leitura" (texto livre) vira um limiar comparável com páginas lidas.
 */
export function pagesGoalOf(desc: string): number | null {
  const m = desc.match(/\d+/);
  return m ? Number(m[0]) : null;
}
