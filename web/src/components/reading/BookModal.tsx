import { useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Book, BookFormat, BookSearchHit, BookStatus, IsbnLookupResult } from '../../api/types';
import { FORMAT_LABEL, STATUS_LABEL } from '../../lib/reading';
import { Icon } from '../Icon';
import { ErrorText, Field, Modal } from '../ui';
import { BookCover } from './shared';

/**
 * Cadastro/edição de um livro. Duas formas de preencher sozinho: buscar por título/autor (mostra candidatos
 * com capa para escolher) ou, com o ISBN em mãos, buscar direto por ele. Os dois só preenchem o formulário —
 * nada é salvo até "Salvar". Sem achar nada em nenhuma fonte, ainda dá para completar tudo à mão.
 */
export function BookModal({ book, onClose, onSaved }: { book?: Book; onClose: () => void; onSaved?: (b: Book) => void }) {
  const [isbn, setIsbn] = useState(book?.isbn ?? '');
  const [title, setTitle] = useState(book?.title ?? '');
  const [author, setAuthor] = useState(book?.author ?? '');
  const [publisher, setPublisher] = useState(book?.publisher ?? '');
  const [format, setFormat] = useState<BookFormat>(book?.format ?? 'fisico');
  const [status, setStatus] = useState<BookStatus>(book?.status ?? 'quero_ler');
  const [totalPages, setTotalPages] = useState(book?.totalPages ? String(book.totalPages) : '');
  const [coverUrl, setCoverUrl] = useState(book?.coverUrl ?? '');

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<BookSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const fillFrom = (r: { title: string; author: string; publisher?: string; totalPages: number | null; coverUrl: string | null; isbn?: string | null }) => {
    if (r.title) setTitle(r.title);
    if (r.author) setAuthor(r.author);
    if (r.publisher) setPublisher(r.publisher);
    if (r.totalPages) setTotalPages(String(r.totalPages));
    if (r.coverUrl) setCoverUrl(r.coverUrl);
    if (r.isbn) setIsbn(r.isbn);
  };

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true); setSearchErr(null); setHits(null);
    try {
      const r = await api.get<BookSearchHit[]>(`/reading/search?q=${encodeURIComponent(query.trim())}`);
      setHits(r);
      if (r.length === 0) setSearchErr('Nada encontrado com esse título. Tente outras palavras, busque pelo ISBN ou preencha à mão.');
    } catch (e) { setSearchErr((e as ApiError).message ?? 'Não consegui buscar agora.'); }
    finally { setSearching(false); }
  };
  const pickHit = (h: BookSearchHit) => { fillFrom(h); setHits(null); setQuery(''); };

  const lookupIsbn = async () => {
    if (isbn.trim().length < 8) return;
    setLooking(true); setLookupErr(null);
    try {
      const r = await api.get<IsbnLookupResult>(`/reading/isbn/${encodeURIComponent(isbn.trim())}`);
      fillFrom(r);
      if (!r.title) setLookupErr('Não achei os dados desse livro, mas a capa pode ter vindo. Preencha o título à mão.');
    } catch (e) { setLookupErr((e as ApiError).message ?? 'Não consegui buscar o livro agora.'); }
    finally { setLooking(false); }
  };

  const save = useAction(
    (p: object) => (book ? api.patch<Book>(`/reading/books/${book.id}`, p) : api.post<Book>('/reading/books', p)),
    (b) => { onSaved?.(b); onClose(); },
  );
  const submit = () => save.mutate({
    title: title.trim(), author: author.trim(), publisher: publisher.trim(), format, status,
    isbn: isbn.trim() || null, coverUrl: coverUrl.trim() || null, totalPages: totalPages ? Number(totalPages) : null,
  });

  return (
    <Modal title={book ? 'Editar livro' : 'Adicionar livro'} onClose={onClose} onSubmit={submit}
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={save.isPending || title.trim().length === 0}>Salvar</button></>}>
      <div className="gx-detail">
        <div className="gx-detail-visual">
          <BookCover book={{ id: book?.id ?? 'novo', title: title || '?', coverUrl: coverUrl || null }} size="lg" />
        </div>
        <div className="gx-detail-info">
          {!book && (
            <Field label="Buscar por título e/ou autor">
              <div className="rd-isbn-row">
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ex.: duna frank herbert" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }} />
                <button type="button" className="btn small" disabled={searching || query.trim().length < 2} onClick={runSearch}>
                  <Icon name="search" size={14} /> {searching ? 'Buscando…' : 'Buscar'}
                </button>
              </div>
              {searchErr && <p className="error" role="alert">{searchErr}</p>}
              {hits && hits.length > 0 && (
                <ul className="gx-pick-list rd-search-hits">
                  {hits.map((h, i) => (
                    <li key={i}>
                      <button type="button" onClick={() => pickHit(h)}>
                        <BookCover book={{ id: h.isbn ?? String(i), title: h.title, coverUrl: h.coverUrl }} size="sm" />
                        <span className="gx-pick-text">
                          <b>{h.title}</b>
                          <span>{[h.author, h.year].filter(Boolean).join(' · ') || '—'}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Field>
          )}
          <Field label="Ou pelo ISBN, se você tiver em mãos">
            <div className="rd-isbn-row">
              <input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="978-..." inputMode="numeric" />
              <button type="button" className="btn small" disabled={looking || isbn.trim().length < 8} onClick={lookupIsbn}>
                <Icon name="search" size={14} /> {looking ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {lookupErr && <p className="error" role="alert">{lookupErr}</p>}
          </Field>
          <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: O Senhor dos Anéis" required /></Field>
          <Field label="Autor"><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="ex.: J.R.R. Tolkien" /></Field>
          <div className="rd-modal-row">
            <Field label="Formato">
              <select value={format} onChange={(e) => setFormat(e.target.value as BookFormat)}>
                {Object.entries(FORMAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={status} onChange={(e) => setStatus(e.target.value as BookStatus)}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Páginas"><input value={totalPages} onChange={(e) => setTotalPages(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="ex.: 320" /></Field>
          </div>
          <Field label="Editora (opcional)"><input value={publisher} onChange={(e) => setPublisher(e.target.value)} /></Field>
          <p className="hint">Sem capa boa nas buscas? Salve o livro e, na tela dele, tire uma foto ou envie uma imagem da capa.</p>
          <ErrorText error={save.error} />
        </div>
      </div>
    </Modal>
  );
}
