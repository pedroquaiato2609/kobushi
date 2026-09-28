import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { PrincipleFolder } from '../api/types';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { FolderModal } from '../components/principles/FolderModal';
import { PrincipleModal } from '../components/principles/PrincipleModal';
import { ScheduleModal } from '../components/principles/ScheduleModal';
import { usePrincipleFolders, usePrinciples, useVaultStatus } from '../components/principles/shared';
import { VaultGate } from '../components/principles/VaultGate';

type Selection = 'all' | string;

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

function PrinciplesBody() {
  const [sel, setSel] = useState<Selection>('all');
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const [newFolderFor, setNewFolderFor] = useState<string | null>(null);
  const [scheduleFolder, setScheduleFolder] = useState<PrincipleFolder | null>(null);
  const [folderModal, setFolderModal] = useState<'new' | PrincipleFolder | null>(null);

  const confirm = useConfirm();
  const folders = usePrincipleFolders();
  const principles = usePrinciples();
  const current = (folders.data ?? []).find((f) => f.id === sel);

  const deleteFolder = useAction((id: string) => api.del(`/principles/folders/${id}`), () => setSel('all'));

  const list = (principles.data ?? []).filter((p) => sel === 'all' || p.folderId === sel);

  return (
    <div className="study-body">
      <nav className="panel folders" aria-label="Pastas">
        <div className="panel-head">
          <h2>Pastas</h2>
          <button className="btn round" style={{ width: 32, height: 32 }} onClick={() => setFolderModal('new')} aria-label="Nova pasta" title="Nova pasta"><Icon name="plus" size={16} /></button>
        </div>
        <ul>
          <li><button className={`folder${sel === 'all' ? ' active' : ''}`} onClick={() => setSel('all')}><Icon name="shield" size={16} /> Todos</button></li>
          {(folders.data ?? []).map((f) => (
            <li key={f.id} className="folder-row">
              <button className={`folder${sel === f.id ? ' active' : ''}`} onClick={() => setSel(f.id)}>
                <Icon name="folder" size={16} /> <span className="folder-name">{f.name}</span>
              </button>
              <button
                type="button" className={`icon-btn folder-reminder-btn${f.reminder.enabled ? ' on' : ''}`}
                onClick={() => setScheduleFolder(f)}
                aria-label={`Lembrete da pasta ${f.name}`}
                title={f.reminder.enabled ? `Lembrete ativo · ${f.reminder.times.join(', ') || 'sem horário'}` : 'Configurar lembrete desta pasta'}
              >
                <Icon name="bell" size={14} />
              </button>
            </li>
          ))}
        </ul>
        {(folders.data ?? []).length === 0 && <p className="hint" style={{ padding: '0 8px' }}>O lembrete é por pasta: crie uma pasta pra ativar um horário de revisão.</p>}
      </nav>

      <section className="panel study-notes-main">
        <div className="study-notes-toolbar">
          {current && (
            <>
              <span className="muted small">Pasta: <b>{current.name}</b></span>
              <button className="btn small" onClick={() => setFolderModal(current)}>Renomear</button>
              <button className="btn small danger-text" onClick={async () => { if (await confirm(`Apagar a pasta "${current.name}"? Os princípios continuam existindo, só perdem a pasta.`)) deleteFolder.mutate(current.id); }}>Apagar pasta</button>
            </>
          )}
          <span className="spacer" />
          <button type="button" className="btn primary" onClick={() => { setNewFolderFor(sel !== 'all' ? sel : null); setOpenId('new'); }}><Icon name="plus" size={16} /> Novo princípio</button>
        </div>

        {principles.isSuccess && list.length === 0 && (
          <div className="gx-empty-card">
            <Icon name="shield" size={28} /><h3>Nenhum princípio ainda</h3>
            <p>Frases curtas que te lembrem quem você é e quer ser. Só você vê — protegidas pela senha do Cofre.</p>
          </div>
        )}
        <ul className="study-note-grid">
          {list.map((p) => (
            <li key={p.id} className="study-note-card">
              <button type="button" className="study-note-card-btn principle-card-btn" onClick={() => { setNewFolderFor(null); setOpenId(p.id); }}>
                <b>{p.locked ? '●●●●●●' : p.title}</b>
                {!p.locked && p.content && <span className="principle-preview">{p.content}</span>}
                <small>{fmtDate(p.updatedAt)}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {openId && <PrincipleModal principleId={openId} initialFolderId={newFolderFor} onClose={() => setOpenId(null)} />}
      {scheduleFolder && <ScheduleModal folder={scheduleFolder} onClose={() => setScheduleFolder(null)} />}
      {folderModal && (
        <FolderModal
          folder={folderModal === 'new' ? undefined : folderModal}
          onClose={() => setFolderModal(null)}
          onSaved={(f) => { if (folderModal === 'new') setSel(f.id); }}
        />
      )}
    </div>
  );
}

export default function PrincipiosPage() {
  const vault = useVaultStatus();
  return (
    <div className="page study">
      <PageHeader title="Princípios" subtitle="Frases suas, protegidas pela senha do Cofre, organizadas em pastas — com lembrete diário pra revisitar." />
      {vault.data && <VaultGate vault={vault.data}><PrinciplesBody /></VaultGate>}
    </div>
  );
}
