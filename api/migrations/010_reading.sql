-- Módulo Leitura: livros (com capa/metadados por ISBN), progresso de páginas e sessões de leitura.

CREATE TABLE reading_books (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  author       text NOT NULL DEFAULT '',
  isbn         text,                                    -- ISBN-10 ou ISBN-13, só dígitos/X (sem hífens)
  cover_url    text,                                     -- vem da busca por ISBN; pode ser substituída à mão
  publisher    text NOT NULL DEFAULT '',
  format       text NOT NULL DEFAULT 'fisico' CHECK (format IN ('fisico', 'ebook', 'audiobook')),
  status       text NOT NULL DEFAULT 'quero_ler' CHECK (status IN ('quero_ler', 'lendo', 'pausado', 'lido', 'abandonado')),
  total_pages  integer CHECK (total_pages IS NULL OR total_pages BETWEEN 1 AND 20000),
  current_page integer NOT NULL DEFAULT 0 CHECK (current_page >= 0),
  rating       smallint CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),  -- só faz sentido depois de "lido"
  notes        text NOT NULL DEFAULT '',                 -- resenha/anotações livres
  started_at   date,                                     -- quando passou a "lendo" pela primeira vez
  finished_at  date,                                      -- quando chegou a "lido"
  archived     boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (total_pages IS NULL OR current_page <= total_pages)
);
CREATE INDEX idx_reading_books_status ON reading_books (status) WHERE NOT archived;
CREATE UNIQUE INDEX reading_books_isbn_uq ON reading_books (isbn) WHERE isbn IS NOT NULL;

-- Cada sessão registra páginas e/ou minutos lidos num dia; alimenta o progresso do livro, o ritmo e a sequência.
CREATE TABLE reading_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id    uuid NOT NULL REFERENCES reading_books(id) ON DELETE CASCADE,
  date       date NOT NULL,
  pages      integer CHECK (pages IS NULL OR pages BETWEEN 0 AND 5000),
  minutes    integer CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 1440),
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pages IS NOT NULL OR minutes IS NOT NULL)
);
CREATE INDEX idx_reading_sessions_book ON reading_sessions (book_id, date DESC);
CREATE INDEX idx_reading_sessions_date ON reading_sessions (date DESC);
