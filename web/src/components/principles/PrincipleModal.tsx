import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { Principle, PrincipleFolder } from '../../api/types';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { ErrorText, Field, Modal } from '../ui';
import { usePrincipleFolders } from './shared';

/** Cria ou edita um princípio. Título e conteúdo só existem cifrados — por isso não há "prévia" nenhuma antes de abrir. */
export function PrincipleModal({ principleId, initialFolderId, onClose }: { principleId: string | 'new'; initialFolderId?: string | null; onClose: () => void }) {
  const isNew = principleId === 'new';
  const confirm = useConfirm();
  const existing = useQuery({ queryKey: ['principles', principleId], queryFn: () => api.get<Principle>(`/principles/${principleId}`), enabled: !isNew });
  const folders = usePrincipleFolders();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [folderId, setFolderId] = useState<string | null>(initialFolderId ?? null);
  const [newFolder, setNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [loaded, setLoaded] = useState(isNew);
  if (!loaded && existing.data) {
    setTitle(existing.data.title ?? ''); setContent(existing.data.content ?? ''); setFolderId(existing.data.folderId);
    setLoaded(true);
  }

  const createFolder = useAction((name: string) => api.post<PrincipleFolder>('/principles/folders', { name }));
  const save = useAction(
    (p: object) => (isNew ? api.post<Principle>('/principles', p) : api.patch<Principle>(`/principles/${principleId}`, p)),
    onClose,
  );
  const remove = useAction(() => api.del(`/principles/${principleId}`), onClose);

  const submit = async () => {
    let fid = folderId;
    if (newFolder && newFolderName.trim()) { const f = await createFolder.mutateAsync(newFolderName.trim()); fid = f.id; }
    save.mutate({ title: title.trim(), content: content.trim(), folderId: fid });
  };

  if (!isNew && !loaded) return <Modal title="Princípio" onClose={onClose}><p className="hint">Carregando…</p></Modal>;

  return (
    <Modal title={isNew ? 'Novo princípio' : 'Editar princípio'} onClose={onClose} onSubmit={submit}
      footer={<>
        {!isNew && <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm('Apagar este princípio?')) remove.mutate(undefined); }}>Apagar</button>}
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={save.isPending || createFolder.isPending || !title.trim() || !content.trim()}>Salvar</button>
      </>}>
      <Field label="Título curto"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ex.: Sobre integridade" autoFocus required /></Field>
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
      <Field label="O princípio, em suas palavras">
        <textarea rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Uma frase que te lembre quem você é e quer ser…" required />
      </Field>
      <ErrorText error={save.error ?? createFolder.error} />
    </Modal>
  );
}
