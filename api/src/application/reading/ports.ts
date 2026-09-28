export type BookFormat = 'fisico' | 'ebook' | 'audiobook';
export type BookStatus = 'quero_ler' | 'lendo' | 'pausado' | 'lido' | 'abandonado';

export interface Book {
  id: string; title: string; author: string; isbn: string | null; coverUrl: string | null; publisher: string;
  format: BookFormat; status: BookStatus; totalPages: number | null; currentPage: number; rating: number | null;
  notes: string; startedAt: string | null; finishedAt: string | null; archived: boolean; createdAt: Date; updatedAt: Date;
}
export interface BookInput {
  title: string; author: string; isbn: string | null; coverUrl: string | null; publisher: string;
  format: BookFormat; status: BookStatus; totalPages: number | null; startedAt: string | null;
}

export interface ReadingSession { id: string; bookId: string; date: string; pages: number | null; minutes: number | null; note: string; createdAt: Date }
export interface SessionInput { date: string; pages: number | null; minutes: number | null; note: string }
export interface BookImage { storage: string; mime: string }

export interface ReadingRepository {
  listBooks(f: { status?: BookStatus; includeArchived?: boolean }): Promise<Book[]>;
  getBook(id: string): Promise<Book | null>;
  createBook(d: BookInput): Promise<Book>;
  updateBook(id: string, patch: Partial<BookInput & { currentPage: number; rating: number | null; notes: string; startedAt: string | null; finishedAt: string | null; archived: boolean }>): Promise<Book | null>;
  deleteBook(id: string): Promise<boolean>;
  /** Capa enviada pelo usuário (foto/upload) — separada de coverUrl, que é o que é exibido (externo ou esta imagem servida pela API). */
  coverImageOf(id: string): Promise<BookImage | null>;
  setCoverImage(id: string, img: BookImage | null): Promise<void>;

  listSessions(bookId: string, limit?: number): Promise<ReadingSession[]>;
  createSession(bookId: string, d: SessionInput): Promise<ReadingSession>;
  deleteSession(id: string): Promise<ReadingSession | null>;
  /** Sessões de todos os livros num período (para ritmo, sequência e o resumo do painel). */
  sessionsInRange(from: string, to: string): Promise<ReadingSession[]>;
  /** Total de páginas lidas numa data específica, somando todos os livros — usado para integrar com a rotina. */
  pagesOnDate(date: string): Promise<number>;
  /** Datas (últimos N dias) com pelo menos uma sessão registrada — base da sequência. */
  sessionDates(sinceDays: number): Promise<string[]>;
}
