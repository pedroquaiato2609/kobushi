import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Book, BookStatus } from '../api/types';
import { BookDetail } from '../components/reading/BookDetail';
import { BookModal } from '../components/reading/BookModal';
import { BookCover, useBooks, useReadingOverview } from '../components/reading/shared';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { askAssistant } from '../lib/chatPrompt';
import { STATUS_LABEL, STATUS_ORDER, progressPct } from '../lib/reading';

const FILTERS: (BookStatus | 'todos')[] = ['todos', ...STATUS_ORDER];

export default function ReadingPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<BookStatus | 'todos'>('todos');
  const books = useBooks(filter === 'todos' ? undefined : filter);
  const overview = useReadingOverview();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [edit, setEdit] = useState<Book | null>(null);

  const list = useMemo(() => books.data ?? [], [books.data]);
  const o = overview.data;

  return (
    <div className="page reading">
      <PageHeader title="Leitura" subtitle="Sua estante: o que você está lendo, o que quer ler e o que já terminou.">
        <button type="button" className="btn" onClick={() => askAssistant(navigate, 'Quero adicionar um livro à minha estante. Pergunte o ISBN (ou o título) e cadastre para mim. Use as ferramentas de leitura.')}><Icon name="sparkles" size={16} /> Pedir à IA</button>
        <button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Adicionar livro</button>
      </PageHeader>

      {o && o.totalBooks > 0 && (
        <div className="rd-overview">
          <div><b>{o.reading.length}</b><span>lendo agora</span></div>
          <div><b>{o.pagesThisMonth}</b><span>páginas este mês</span></div>
          <div><b>{o.finishedThisYear}</b><span>terminados em {new Date().getFullYear()}</span></div>
          <div><b>{o.streak}</b><span>{o.streak === 1 ? 'dia seguido lendo' : 'dias seguidos lendo'}</span></div>
        </div>
      )}

      <div className="rd-filters" role="group" aria-label="Filtrar por status">
        {FILTERS.map((f) => <button key={f} type="button" className="chip-toggle" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'todos' ? 'Todos' : STATUS_LABEL[f]}</button>)}
      </div>

      {books.isSuccess && list.length === 0 && (
        <div className="gx-empty-card">
          <Icon name="book" size={28} /><h3>{filter === 'todos' ? 'Sua estante está vazia' : `Nada em "${STATUS_LABEL[filter as BookStatus] ?? filter}"`}</h3>
          {filter === 'todos' && (
            <>
              <p>Adicione um livro pelo ISBN (a capa e os dados vêm sozinhos) ou à mão, e acompanhe o progresso página a página.</p>
              <div className="gx-finished-actions">
                <button type="button" className="btn primary" onClick={() => setAdding(true)}><Icon name="plus" size={16} /> Adicionar livro</button>
                <button type="button" className="btn" onClick={() => askAssistant(navigate, 'Quero adicionar um livro à minha estante. Pergunte o ISBN (ou o título) e cadastre para mim. Use as ferramentas de leitura.')}><Icon name="sparkles" size={16} /> Pedir à IA</button>
              </div>
            </>
          )}
        </div>
      )}

      <ul className="rd-grid">
        {list.map((b) => {
          const pct = progressPct(b);
          return (
            <li key={b.id}>
              <button type="button" className="rd-book-card" onClick={() => setOpen(b.id)}>
                <BookCover book={b} size="md" />
                <b>{b.title}</b>
                {b.author && <small>{b.author}</small>}
                {pct !== null && b.status === 'lendo' && <span className="rd-mini-bar"><i style={{ width: `${pct}%` }} /></span>}
                {b.status !== 'lendo' && <span className={`gx-badge rd-status-${b.status}`}>{STATUS_LABEL[b.status]}</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {adding && <BookModal onClose={() => setAdding(false)} onSaved={(b) => setOpen(b.id)} />}
      {open && <BookDetail bookId={open} onClose={() => setOpen(null)} onEdit={(b) => { setOpen(null); setEdit(b); }} />}
      {edit && <BookModal book={edit} onClose={() => setEdit(null)} onSaved={(b) => setOpen(b.id)} />}
    </div>
  );
}
