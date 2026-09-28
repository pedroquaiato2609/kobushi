import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { Book, BookStatus, ReadingOverview } from '../../api/types';
import { coverPalette } from '../../lib/reading';

export const useBooks = (status?: BookStatus) => useQuery({
  queryKey: ['reading', 'books', status ?? 'all'],
  queryFn: () => api.get<Book[]>(`/reading/books${status ? `?status=${status}` : ''}`),
});
export const useReadingOverview = () => useQuery({ queryKey: ['reading', 'overview'], queryFn: () => api.get<ReadingOverview>('/reading/overview') });

/** Capa do livro; sem URL (ou se a imagem falhar), cai numa "lombada" colorida com as iniciais do título. */
export function BookCover({ book, size = 'md' }: { book: Pick<Book, 'id' | 'title' | 'coverUrl'>; size?: 'sm' | 'md' | 'lg' }) {
  const [broken, setBroken] = useState(false);
  if (book.coverUrl && !broken) {
    return <img className={`rd-cover ${size}`} src={book.coverUrl} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  const initials = book.title.trim().slice(0, 2).toUpperCase() || '?';
  return (
    <div className={`rd-cover rd-cover-fallback ${size}`} style={{ background: coverPalette(book.id || book.title) }} aria-hidden="true">
      <span>{initials}</span>
    </div>
  );
}
