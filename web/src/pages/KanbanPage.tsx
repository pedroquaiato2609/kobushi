import { useQuery } from '@tanstack/react-query';
import { useState, type DragEvent } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, Board, BoardFull, Card, Column } from '../api/types';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { RichEditor } from '../components/RichEditor';
import { TextPromptModal } from '../components/TextPromptModal';
import { ErrorText, Field, Modal } from '../components/ui';
import { COLUMN_COLORS, cssVars } from '../lib/colors';
import { fmt, parseYmd } from '../lib/dates';

const BOARD_KEY = 'ninshiki.board';

/** Índice de inserção entre os cards da coluna (sem contar o card arrastado), pela posição do ponteiro. */
function indexFromPointer(container: HTMLElement, y: number, dragId: string): number {
  const els = Array.from(container.querySelectorAll<HTMLElement>('[data-card-id]')).filter((el) => el.dataset.cardId !== dragId);
  let index = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (y > r.top + r.height / 2) index++; else break;
  }
  return index;
}

type TextPrompt = { title: string; label: string; initialValue?: string; onSubmit: (v: string) => void };

export default function KanbanPage() {
  const confirm = useConfirm();
  const [boardId, setBoardId] = useState<string | null>(() => localStorage.getItem(BOARD_KEY));
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ columnId: string; index: number } | null>(null);
  const [editing, setEditing] = useState<Card | null>(null);
  const [prompt, setPrompt] = useState<TextPrompt | null>(null);

  const boards = useQuery({ queryKey: ['boards'], queryFn: () => api.get<Board[]>('/boards') });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const current = boards.data?.find((b) => b.id === boardId) ?? boards.data?.[0] ?? null;
  const board = useQuery({
    queryKey: ['board', current?.id],
    queryFn: () => api.get<BoardFull>(`/boards/${current!.id}`),
    enabled: Boolean(current),
  });

  const pick = (id: string | null) => { setBoardId(id); if (id) localStorage.setItem(BOARD_KEY, id); };

  const createBoard = useAction((name: string) => api.post<Board>('/boards', { name }), (b) => pick(b.id));
  const renameBoard = useAction((name: string) => api.patch(`/boards/${current!.id}`, { name }));
  const deleteBoard = useAction(() => api.del(`/boards/${current!.id}`), () => pick(null));
  const addColumn = useAction((name: string) => api.post(`/boards/${current!.id}/columns`, { name }));
  const renameColumn = useAction((v: { id: string; name: string }) => api.patch(`/columns/${v.id}`, { name: v.name }));
  const deleteColumn = useAction((id: string) => api.del(`/columns/${id}`));
  const addCard = useAction((v: { columnId: string; title: string }) => api.post(`/columns/${v.columnId}/cards`, { title: v.title }));
  const moveCard = useAction((v: { id: string; columnId: string; position: number }) => api.post(`/cards/${v.id}/move`, { columnId: v.columnId, position: v.position }));

  const errors = createBoard.error ?? renameBoard.error ?? deleteBoard.error ?? addColumn.error ?? renameColumn.error ?? deleteColumn.error ?? addCard.error ?? moveCard.error;
  const activityName = (id: string | null) => (id ? activities.data?.find((a) => a.id === id)?.name : undefined);

  const endDrag = () => { setDrag(null); setOver(null); };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (drag && over) moveCard.mutate({ id: drag, columnId: over.columnId, position: over.index });
    endDrag();
  };

  return (
    <div className="page kanban">
      <PageHeader title="Kanban" subtitle="Tarefas e projetos sem hora marcada. Arraste os cards entre as colunas ou toque num card para editar.">
        {boards.data && boards.data.length > 1 && (boards.data.length <= 4 ? (
          <div className="btn-group" role="group" aria-label="Quadro">
            {boards.data.map((b) => <button key={b.id} className="btn" aria-pressed={b.id === current?.id} onClick={() => pick(b.id)}>{b.name}</button>)}
          </div>
        ) : (
          <select aria-label="Quadro" value={current?.id ?? ''} onChange={(e) => pick(e.target.value)}>
            {boards.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        ))}
        <button className="btn" onClick={() => setPrompt({ title: 'Novo quadro', label: 'Nome do quadro', onSubmit: (n) => createBoard.mutate(n) })}><Icon name="plus" size={16} /> Novo quadro</button>
        {current && (
          <>
            <button className="btn ghost" title="Renomear quadro" onClick={() => setPrompt({ title: 'Renomear quadro', label: 'Nome do quadro', initialValue: current.name, onSubmit: (n) => renameBoard.mutate(n) })}><Icon name="edit" size={15} /> <span className="hide-label">Renomear</span></button>
            <button className="btn ghost danger-text" title="Excluir quadro" onClick={async () => { if (await confirm(`Apagar o quadro "${current.name}" com todas as colunas e cards?`)) deleteBoard.mutate(undefined); }}><Icon name="trash" size={15} /> <span className="hide-label">Excluir</span></button>
          </>
        )}
      </PageHeader>
      <ErrorText error={errors} />

      {!current && !boards.isLoading && <p className="empty">Nenhum quadro ainda. Crie o primeiro em “Novo quadro”.</p>}

      {board.data && (
        <div className="columns">
          {board.data.columns.map((col: Column, colIndex: number) => {
            const visible = col.cards;
            let slot = 0; // posição entre os cards não arrastados
            const lineAt = (i: number) => over?.columnId === col.id && over.index === i && drag !== null;
            return (
              <section key={col.id} className="column" aria-label={col.name} style={cssVars({ '--col': COLUMN_COLORS[colIndex % COLUMN_COLORS.length] })}>
                <header className="column-head">
                  <div className="column-title"><i /><h2>{col.name}</h2><span className="count">{col.cards.length}</span></div>
                  <span className="column-tools">
                    <button className="icon-btn" title="Renomear coluna" aria-label={`Renomear coluna ${col.name}`} onClick={() => setPrompt({ title: 'Renomear coluna', label: 'Nome da coluna', initialValue: col.name, onSubmit: (n) => renameColumn.mutate({ id: col.id, name: n }) })}><Icon name="edit" size={15} /></button>
                    <button className="icon-btn" title="Excluir coluna" aria-label={`Excluir coluna ${col.name}`} onClick={async () => { if (await confirm(`Apagar a coluna "${col.name}" e seus ${col.cards.length} card(s)?`)) deleteColumn.mutate(col.id); }}><Icon name="trash" size={15} /></button>
                  </span>
                </header>

                <div
                  className="column-body"
                  onDragOver={(e) => { if (!drag) return; e.preventDefault(); setOver({ columnId: col.id, index: indexFromPointer(e.currentTarget, e.clientY, drag) }); }}
                  onDrop={onDrop}
                >
                  {visible.map((card) => {
                    const isDragged = card.id === drag;
                    const showLine = !isDragged && lineAt(slot);
                    if (!isDragged) slot++;
                    return (
                      <div key={card.id}>
                        {showLine && <div className="drop-line" />}
                        <article
                          className={`card${isDragged ? ' dragging' : ''}`} draggable data-card-id={card.id}
                          onDragStart={(e) => { e.dataTransfer.setData('text/plain', card.id); e.dataTransfer.effectAllowed = 'move'; setDrag(card.id); }}
                          onDragEnd={endDrag}
                        >
                          <button type="button" className="card-main" onClick={() => setEditing(card)}>
                            <span className="card-title">{card.title}</span>
                            {(card.dueDate || card.activityId) && (
                              <span className="card-meta">
                                {card.dueDate && <span>até {fmt(parseYmd(card.dueDate), 'd MMM')}</span>}
                                {activityName(card.activityId) && <span>{activityName(card.activityId)}</span>}
                              </span>
                            )}
                          </button>
                        </article>
                      </div>
                    );
                  })}
                  {lineAt(slot) && <div className="drop-line" />}
                  {col.cards.length === 0 && !drag && <p className="column-empty">Sem cards</p>}
                </div>

                <AddInline label="Adicionar card" placeholder="Título do card" onAdd={(title) => addCard.mutate({ columnId: col.id, title })} />
              </section>
            );
          })}
          <section className="column column-new">
            <AddInline label="Adicionar coluna" placeholder="Nome da coluna" onAdd={(name) => addColumn.mutate(name)} />
          </section>
        </div>
      )}

      {editing && board.data && (
        <CardModal key={editing.id} card={editing} board={board.data} activities={activities.data ?? []} onClose={() => setEditing(null)} />
      )}
      {prompt && (
        <TextPromptModal title={prompt.title} label={prompt.label} initialValue={prompt.initialValue} onSubmit={prompt.onSubmit} onClose={() => setPrompt(null)} />
      )}
    </div>
  );
}

function AddInline({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  if (!open) return <button className="add-inline" onClick={() => setOpen(true)}>+ {label}</button>;
  const submit = () => { if (value.trim()) onAdd(value.trim()); setValue(''); setOpen(false); };
  return (
    <form className="add-form" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <input autoFocus value={value} placeholder={placeholder} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }} />
      <div className="add-form-actions">
        <button type="submit" className="btn primary" disabled={!value.trim()}>Adicionar</button>
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </form>
  );
}

function CardModal({ card, board, activities, onClose }: { card: Card; board: BoardFull; activities: Activity[]; onClose: () => void }) {
  const confirm = useConfirm();
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [dueDate, setDueDate] = useState(card.dueDate ?? '');
  const [activityId, setActivityId] = useState(card.activityId ?? '');
  const [columnId, setColumnId] = useState(card.columnId);

  const save = useAction(async () => {
    await api.patch(`/cards/${card.id}`, { title: title.trim(), description, dueDate: dueDate || null, activityId: activityId || null });
    if (columnId !== card.columnId) await api.post(`/cards/${card.id}/move`, { columnId }); // vai para o fim da coluna escolhida
  }, onClose);
  const remove = useAction(() => api.del(`/cards/${card.id}`), onClose);

  return (
    <Modal
      title="Card" onClose={onClose} onSubmit={() => save.mutate(undefined)}
      footer={
        <>
          <button type="button" className="btn danger" disabled={remove.isPending}
            onClick={async () => { if (await confirm(`Apagar "${card.title}"?`)) remove.mutate(undefined); }}>Apagar</button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim()}>Salvar</button>
        </>
      }
    >
      <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required /></Field>
      <Field label="Descrição" className="study-content-field"><RichEditor content={description} onChange={setDescription} /></Field>
      <div className="row">
        <Field label="Coluna">
          <select value={columnId} onChange={(e) => setColumnId(e.target.value)}>
            {board.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Prazo"><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
      </div>
      <Field label="Atividade relacionada (opcional)">
        <select value={activityId} onChange={(e) => setActivityId(e.target.value)}>
          <option value="">Nenhuma</option>
          {activities.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      <ErrorText error={save.error ?? remove.error} />
    </Modal>
  );
}
