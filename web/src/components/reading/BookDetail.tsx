import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Book, BookOverview, BookStatus } from '../../api/types';
import { askAssistant } from '../../lib/chatPrompt';
import { FORMAT_LABEL, STATUS_LABEL, STATUS_ORDER, fmtDateFull, fmtDaysToFinish, progressPct } from '../../lib/reading';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { RichEditor } from '../RichEditor';
import { ErrorText, Modal } from '../ui';
import { BookCover } from './shared';

function Stars({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="rd-stars" role="group" aria-label="Avaliação">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={`rd-star${value !== null && n <= value ? ' on' : ''}`} aria-pressed={value !== null && n <= value}
          onClick={() => onChange(value === n ? null : n)} title={`${n} estrela${n > 1 ? 's' : ''}`}>
          <Icon name="star" size={20} />
        </button>
      ))}
    </div>
  );
}

export function BookDetail({ bookId, onClose, onEdit }: { bookId: string; onClose: () => void; onEdit: (b: Book) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const overview = useQuery({ queryKey: ['reading', 'book', bookId], queryFn: () => api.get<BookOverview>(`/reading/books/${bookId}`) });
  const b = overview.data;

  const [pages, setPages] = useState('');
  const [minutes, setMinutes] = useState('');
  const [sessionNote, setSessionNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  useEffect(() => { if (b) setNotes(b.notes); }, [b?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const logSession = useAction((p: object) => api.post(`/reading/books/${bookId}/sessions`, p), () => { setPages(''); setMinutes(''); setSessionNote(''); });
  const setStatus = useAction((status: BookStatus) => api.patch(`/reading/books/${bookId}`, { status }));
  const setRating = useAction((rating: number | null) => api.patch(`/reading/books/${bookId}`, { rating }));
  const saveNotes = useAction((content: string) => api.patch(`/reading/books/${bookId}`, { notes: content }));
  const removeSession = useAction((id: string) => api.del(`/reading/sessions/${id}`));
  const remove = useAction(() => api.del(`/reading/books/${bookId}`), onClose);

  // Capa: tirar uma foto (câmera traseira no celular) ou enviar uma imagem, quando a busca não trouxe uma boa.
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [coverErr, setCoverErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadCover = async (f: File) => {
    setCoverErr(null); setUploading(true);
    try {
      const body = new FormData(); body.append('file', f);
      const res = await fetch(`/api/reading/books/${bookId}/cover-image`, { method: 'POST', body });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? 'Não consegui enviar a imagem.');
      await qc.invalidateQueries({ queryKey: ['reading'] });
    } catch (e) { setCoverErr((e as Error).message); }
    finally { setUploading(false); }
  };
  const removeCover = useAction(() => api.del(`/reading/books/${bookId}/cover-image`));

  if (!b) return overview.isLoading ? null : <Modal title="Livro" onClose={onClose}><p className="hint">Não encontrado.</p></Modal>;

  const pct = progressPct(b);
  const pace = fmtDaysToFinish(b.daysToFinish);
  const canLog = pages.trim() !== '' || minutes.trim() !== '';

  return (
    <Modal title={b.title} onClose={onClose} wide
      footer={<>
        <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm(`Apagar "${b.title}" e todo o histórico de leitura dele?`)) remove.mutate(undefined); }}>Apagar</button>
        <span className="spacer" />
        <button type="button" className="btn" onClick={() => onEdit(b)}><Icon name="edit" size={15} /> Editar</button>
      </>}>
      <div className="gx-detail">
        <div className="gx-detail-visual">
          <BookCover book={b} size="lg" />
          <div className="rd-cover-actions">
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = ''; }} />
            <input ref={galleryInput} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCover(f); e.target.value = ''; }} />
            <button type="button" className="btn small" disabled={uploading} onClick={() => cameraInput.current?.click()}><Icon name="camera" size={14} /> Tirar foto</button>
            <button type="button" className="btn small ghost" disabled={uploading} onClick={() => galleryInput.current?.click()}><Icon name="upload" size={14} /> Enviar imagem</button>
            {b.coverUrl?.includes('/cover-image') && <button type="button" className="btn small ghost" disabled={removeCover.isPending} onClick={() => removeCover.mutate(undefined)}>Remover foto</button>}
          </div>
          {coverErr && <p className="error" role="alert">{coverErr}</p>}
          {b.author && <p className="rd-author">{b.author}</p>}
          <p className="hint">{FORMAT_LABEL[b.format]}{b.publisher ? ` · ${b.publisher}` : ''}</p>
          <div className="rd-status-picker" role="group" aria-label="Status">
            {STATUS_ORDER.map((s) => <button key={s} type="button" className="chip-toggle" aria-pressed={b.status === s} disabled={setStatus.isPending} onClick={() => setStatus.mutate(s)}>{STATUS_LABEL[s]}</button>)}
          </div>
          {b.status === 'lido' && (
            <div className="rd-rating-block">
              <span className="field-label">Sua avaliação</span>
              <Stars value={b.rating} onChange={(v) => setRating.mutate(v)} />
            </div>
          )}
          <button
            type="button" className="btn"
            onClick={() => askAssistant(navigate, `Estou lendo/li "${b.title}"${b.author ? ` de ${b.author}` : ''}. Use as ferramentas de leitura para ver meu histórico e me recomende o que ler a seguir, ou me dê um resumo/discussão sobre esse livro.`)}
          ><Icon name="sparkles" size={16} /> Pedir à IA</button>
        </div>

        <div className="gx-detail-info">
          {b.totalPages && (
            <div className="rd-progress">
              <div className="rd-progress-bar"><div style={{ width: `${pct ?? 0}%` }} /></div>
              <p className="hint">{b.currentPage} de {b.totalPages} páginas ({pct}%){pace ? ` · ${pace}` : ''}</p>
            </div>
          )}

          <h4 className="gx-h4">Registrar leitura</h4>
          {/* div, não <form>: já estamos dentro do <form> do Modal, e HTML não permite form aninhado (Enter/submit ficariam imprevisíveis). */}
          <div className="rd-log-form">
            <div className="rd-log-row">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} />
              <input value={pages} onChange={(e) => setPages(e.target.value.replace(/\D/g, ''))} placeholder="páginas" inputMode="numeric" aria-label="Páginas lidas" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canLog) logSession.mutate({ date, pages: pages ? Number(pages) : null, minutes: minutes ? Number(minutes) : null, note: sessionNote }); } }} />
              <input value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ''))} placeholder="minutos" inputMode="numeric" aria-label="Minutos lidos" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (canLog) logSession.mutate({ date, pages: pages ? Number(pages) : null, minutes: minutes ? Number(minutes) : null, note: sessionNote }); } }} />
              <button type="button" className="btn primary small" disabled={!canLog || logSession.isPending} onClick={() => logSession.mutate({ date, pages: pages ? Number(pages) : null, minutes: minutes ? Number(minutes) : null, note: sessionNote })}><Icon name="plus" size={14} /> Registrar</button>
            </div>
            <input className="rd-log-note" value={sessionNote} onChange={(e) => setSessionNote(e.target.value)} placeholder="Nota da sessão (opcional)" />
          </div>
          <ErrorText error={logSession.error} />

          {b.recentSessions.length > 0 && (
            <>
              <h4 className="gx-h4">Sessões recentes {b.pagesPerDay > 0 && <span className="hint">· ritmo médio {b.pagesPerDay} páginas/dia</span>}</h4>
              <ul className="rd-sessions">
                {b.recentSessions.map((s) => (
                  <li key={s.id}>
                    <b>{fmtDateFull(s.date)}</b>
                    <span>{[s.pages ? `${s.pages} páginas` : null, s.minutes ? `${s.minutes} min` : null].filter(Boolean).join(' · ') || '—'}</span>
                    {s.note && <small>{s.note}</small>}
                    <button type="button" className="icon-btn" aria-label="Apagar sessão" onClick={() => removeSession.mutate(s.id)}><Icon name="trash" size={14} /></button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <h4 className="gx-h4">Anotações</h4>
          <div className="study-content-field"><RichEditor content={notes} onChange={setNotes} onBlur={() => saveNotes.mutate(notes)} /></div>
          <ErrorText error={saveNotes.error} />
        </div>
      </div>
    </Modal>
  );
}
