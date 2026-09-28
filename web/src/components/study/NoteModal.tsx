import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { LinkedType, StudyFolder, StudyNoteView } from '../../api/types';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { ErrorText, Field, Modal } from '../ui';
import { LinkPicker } from './LinkPicker';
import { RichEditor } from '../RichEditor';
import { useStudyFolders, useStudyNotes, useStudyTags } from './shared';
import { TagInput } from './TagInput';

/** Cria uma nota nova (título em branco, editor vazio) ou edita uma existente (carrega pelo id). */
export function NoteModal({ noteId, onClose, initialFolderId }: { noteId: string | 'new'; onClose: () => void; initialFolderId?: string | null }) {
  const isNew = noteId === 'new';
  const confirm = useConfirm();
  const existing = useQuery({ queryKey: ['study', 'notes', noteId], queryFn: () => api.get<StudyNoteView>(`/study/notes/${noteId}`), enabled: !isNew });
  const folders = useStudyFolders();
  const tags = useStudyTags();
  const allNotes = useStudyNotes();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [linkedType, setLinkedType] = useState<LinkedType | null>(null);
  const [linkedId, setLinkedId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId ?? null);
  const [pinned, setPinned] = useState(false);
  const [noteTags, setNoteTags] = useState<string[]>([]);
  const [linkedNoteIds, setLinkedNoteIds] = useState<string[]>([]);
  const [backlinks, setBacklinks] = useState<StudyNoteView['backlinks']>([]);
  const [newFolder, setNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loaded, setLoaded] = useState(isNew);
  if (!loaded && existing.data) {
    setTitle(existing.data.title); setContent(existing.data.content);
    setLinkedType(existing.data.linkedType); setLinkedId(existing.data.linkedId);
    setFolderId(existing.data.folderId); setPinned(existing.data.pinned); setNoteTags(existing.data.tags);
    setLinkedNoteIds(existing.data.linkedNoteIds); setBacklinks(existing.data.backlinks);
    setLoaded(true);
  }

  const createFolder = useAction((name: string) => api.post<StudyFolder>('/study/folders', { name }));
  const save = useAction(
    (p: object) => (isNew ? api.post<StudyNoteView>('/study/notes', p) : api.patch<StudyNoteView>(`/study/notes/${noteId}`, p)),
    onClose,
  );
  const remove = useAction(() => api.del(`/study/notes/${noteId}`), onClose);

  const submit = async () => {
    let fid = folderId;
    if (newFolder && newFolderName.trim()) { const f = await createFolder.mutateAsync(newFolderName.trim()); fid = f.id; }
    save.mutate({ title: title.trim(), content, linkedType, linkedId, folderId: fid, pinned, tags: noteTags, linkedNoteIds });
  };

  const otherNotes = (allNotes.data ?? []).filter((n) => n.id !== noteId);

  if (!isNew && !loaded) return <Modal title="Nota" onClose={onClose}><p className="hint">Carregando…</p></Modal>;

  return (
    <Modal title={isNew ? 'Nova nota' : 'Editar nota'} onClose={onClose} onSubmit={submit} wide
      footer={<>
        {!isNew && <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm(`Apagar "${title}"?`)) remove.mutate(undefined); }}>Apagar</button>}
        {!isNew && <a className="btn" href={`/estudos/imprimir/${noteId}`} target="_blank" rel="noopener noreferrer"><Icon name="download" size={15} /> Baixar PDF</a>}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={save.isPending || createFolder.isPending || title.trim().length === 0}>Salvar</button>
      </>}>
      <div className="rd-modal-row">
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título da nota" autoFocus required /></Field>
        <button type="button" className={`icon-btn study-pin-btn${pinned ? ' on' : ''}`} title={pinned ? 'Desafixar' : 'Fixar no topo'} aria-pressed={pinned} onClick={() => setPinned((p) => !p)}>
          <Icon name="star" size={20} />
        </button>
      </div>

      <Field label="Pasta">
        {newFolder ? (
          <div className="inline-field">
            <input value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} placeholder="Nome da pasta" autoFocus />
            <button type="button" className="icon-btn" aria-label="Cancelar nova pasta" onClick={() => { setNewFolder(false); setNewFolderName(''); }}><Icon name="x" size={15} /></button>
          </div>
        ) : (
          <select value={folderId ?? ''} onChange={(e) => (e.target.value === '__new__' ? setNewFolder(true) : setFolderId(e.target.value || null))}>
            <option value="">Sem pasta</option>
            {(folders.data ?? []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value="__new__">+ Nova pasta…</option>
          </select>
        )}
      </Field>
      <LinkPicker linkedType={linkedType} linkedId={linkedId} onChange={(t, id) => { setLinkedType(t); setLinkedId(id); }} />
      <Field label="Tags"><TagInput value={noteTags} onChange={setNoteTags} suggestions={tags.data ?? []} /></Field>

      <Field label="Conteúdo" className="study-content-field">
        <RichEditor content={content} onChange={setContent} />
      </Field>

      <Field label="Notas relacionadas">
        <select multiple className="study-note-links" value={linkedNoteIds} onChange={(e) => setLinkedNoteIds([...e.target.selectedOptions].map((o) => o.value))}>
          {otherNotes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select>
        <p className="hint">Ctrl/Cmd + clique pra escolher mais de uma.</p>
      </Field>
      {backlinks.length > 0 && (
        <p className="hint">Notas que citam esta: {backlinks.map((b) => b.title).join(', ')}</p>
      )}

      <ErrorText error={save.error ?? createFolder.error} />
    </Modal>
  );
}
