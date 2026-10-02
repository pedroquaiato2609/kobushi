// Espelho de web/src/lib/reading.ts (só o usado nas telas mobile).
import type { Book, BookStatus } from '../api/types';

export const STATUS_LABEL: Record<BookStatus, string> = {
  quero_ler: 'Quero ler', lendo: 'Lendo', pausado: 'Pausado', lido: 'Lido', abandonado: 'Abandonado',
};

export function progressPct(book: Pick<Book, 'currentPage' | 'totalPages'>): number | null {
  if (!book.totalPages || book.totalPages <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((book.currentPage / book.totalPages) * 100)));
}
