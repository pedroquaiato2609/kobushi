// Utilidades puras do módulo Leitura (formatação). Sem React, para poderem ser testadas.
import type { Book, BookFormat, BookStatus } from '../api/types';

export const STATUS_LABEL: Record<BookStatus, string> = {
  quero_ler: 'Quero ler', lendo: 'Lendo', pausado: 'Pausado', lido: 'Lido', abandonado: 'Abandonado',
};
export const STATUS_ORDER: BookStatus[] = ['lendo', 'quero_ler', 'pausado', 'lido', 'abandonado'];
export const FORMAT_LABEL: Record<BookFormat, string> = { fisico: 'Físico', ebook: 'E-book', audiobook: 'Audiobook' };

export function progressPct(book: Pick<Book, 'currentPage' | 'totalPages'>): number | null {
  if (!book.totalPages || book.totalPages <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)));
}

export function fmtDaysToFinish(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 0) return 'termina hoje, no ritmo atual';
  if (days === 1) return 'termina amanhã, no ritmo atual';
  return `termina em ~${days} dias, no ritmo atual`;
}

export const fmtDateFull = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/** Placeholder de capa (sem imagem/erro de carregamento): iniciais do título numa "lombada" colorida e estável por id. */
export function coverPalette(seed: string): string {
  const PALETTE = ['#7c6cf0', '#f0765f', '#3fb6a8', '#e0b23c', '#5b8def', '#c95fd0'];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
