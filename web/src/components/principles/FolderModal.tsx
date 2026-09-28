import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { PrincipleFolder } from '../../api/types';
import { ErrorText, Field, Modal } from '../ui';

/** Cria ou renomeia uma pasta de Princípios — popup do próprio app, no lugar do prompt() nativo do navegador. */
export function FolderModal({ folder, onClose, onSaved }: { folder?: PrincipleFolder; onClose: () => void; onSaved?: (f: PrincipleFolder) => void }) {
  const [name, setName] = useState(folder?.name ?? '');
  const save = useAction(
    (n: string) => (folder ? api.patch<PrincipleFolder>(`/principles/folders/${folder.id}`, { name: n }) : api.post<PrincipleFolder>('/principles/folders', { name: n })),
    (f) => { onSaved?.(f); onClose(); },
  );
  const submit = () => { if (name.trim()) save.mutate(name.trim()); };

  return (
    <Modal title={folder ? 'Renomear pasta' : 'Nova pasta'} onClose={onClose} onSubmit={submit}
      footer={<>
        <span className="spacer" />
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="submit" className="btn primary" disabled={save.isPending || !name.trim()}>Salvar</button>
      </>}>
      <Field label="Nome da pasta">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Valores" autoFocus required maxLength={120} />
      </Field>
      <ErrorText error={save.error} />
    </Modal>
  );
}
