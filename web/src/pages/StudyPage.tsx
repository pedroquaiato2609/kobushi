import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { StudyFolder, StudyPlan } from '../api/types';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { LINKED_LABEL, useStudyFolders, useStudyNotes, useStudyPlans, useStudyTags } from '../components/study/shared';
import { NoteModal } from '../components/study/NoteModal';
import { PlanModal } from '../components/study/PlanModal';
import { TextPromptModal } from '../components/TextPromptModal';
import { askAssistant } from '../lib/chatPrompt';

const TABS = [{ id: 'notas', label: 'Notas' }, { id: 'planos', label: 'Planos de estudo' }] as const;
type TabId = (typeof TABS)[number]['id'];
type Selection = 'all' | string;

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

function NotesTab({ onOpen }: { onOpen: (id: string, folderId?: string | null) => void }) {
  const confirm = useConfirm();
  const [sel, setSel] = useState<Selection>('all');
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [prompt, setPrompt] = useState<{ title: string; label: string; initialValue?: string; onSubmit: (v: string) => void } | null>(null);
  const folders = useStudyFolders();
  const tags = useStudyTags();
  const notes = useStudyNotes({ folderId: sel !== 'all' ? sel : undefined, tag: tag ?? undefined, query: q.trim() || undefined });
  const list = notes.data ?? [];
  const current = (folders.data ?? []).find((f) => f.id === sel);

  const createFolder = useAction((name: string) => api.post<StudyFolder>('/study/folders', { name }), (f) => setSel(f.id));
  const renameFolder = useAction((v: { id: string; name: string }) => api.patch(`/study/folders/${v.id}`, { name: v.name }));
  const deleteFolder = useAction((id: string) => api.del(`/study/folders/${id}`), () => setSel('all'));
  const togglePin = useAction((v: { id: string; pinned: boolean }) => api.patch(`/study/notes/${v.id}`, { pinned: v.pinned }));

  const promptFolder = () => setPrompt({ title: 'Nova pasta', label: 'Nome da pasta', onSubmit: (n) => createFolder.mutate(n) });

  return (
    <div className="study-body">
      <nav className="panel folders" aria-label="Pastas">
        <div className="panel-head">
          <h2>Pastas</h2>
          <button className="btn round" style={{ width: 32, height: 32 }} onClick={promptFolder} aria-label="Nova pasta" title="Nova pasta"><Icon name="plus" size={16} /></button>
        </div>
        <ul>
          <li><button className={`folder${sel === 'all' ? ' active' : ''}`} onClick={() => setSel('all')}><Icon name="note" size={16} /> Todas</button></li>
          {(folders.data ?? []).map((f) => (
            <li key={f.id}>
              <button className={`folder${sel === f.id ? ' active' : ''}`} onClick={() => setSel(f.id)}>
                <Icon name="folder" size={16} /> <span className="folder-name">{f.name}</span>
              </button>
            </li>
          ))}
        </ul>
        {tags.data && tags.data.length > 0 && (
          <>
            <div className="panel-head"><h2>Tags</h2></div>
            <div className="study-tag-filters">
              {tags.data.map((t) => (
                <button key={t} type="button" className={`chip-toggle${tag === t ? ' on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>{t}</button>
              ))}
            </div>
          </>
        )}
      </nav>

      <section className="panel study-notes-main">
        <div className="study-notes-toolbar">
          {current && (
            <>
              <span className="muted small">Pasta: <b>{current.name}</b></span>
              <button className="btn small" onClick={() => setPrompt({ title: 'Renomear pasta', label: 'Nome da pasta', initialValue: current.name, onSubmit: (n) => renameFolder.mutate({ id: current.id, name: n }) })}>Renomear</button>
              <button className="btn small danger-text" onClick={async () => { if (await confirm(`Apagar a pasta "${current.name}"? As notas continuam existindo, só perdem a pasta.`)) deleteFolder.mutate(current.id); }}>Apagar pasta</button>
              <span className="spacer" />
            </>
          )}
          <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título ou conteúdo" aria-label="Buscar notas" /></label>
        </div>

        {notes.isSuccess && list.length === 0 && (
          <div className="gx-empty-card">
            <Icon name="note" size={28} /><h3>Nenhuma nota ainda</h3>
            <p>Anotações organizadas como quiser: pastas, tags, favoritas e ligadas entre si. Pode atrelar a um livro, treino ou atividade.</p>
          </div>
        )}
        <ul className="study-note-grid">
          {list.map((n) => (
            <li key={n.id}>
              <div className="study-note-card">
                <button type="button" className="study-note-card-btn" onClick={() => onOpen(n.id, sel !== 'all' ? sel : null)}>
                  <b>{n.title}</b>
                  <div className="study-note-tags">
                    {n.linkedType && <span className="gx-badge">{LINKED_LABEL[n.linkedType]}</span>}
                    {n.tags.map((t) => <span key={t} className="tag-chip small">{t}</span>)}
                  </div>
                  <small>{fmtDate(n.updatedAt)}</small>
                </button>
                <button type="button" className={`icon-btn study-pin-btn${n.pinned ? ' on' : ''}`} title={n.pinned ? 'Desafixar' : 'Fixar no topo'} aria-pressed={n.pinned}
                  onClick={() => togglePin.mutate({ id: n.id, pinned: !n.pinned })}>
                  <Icon name="star" size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      {prompt && (
        <TextPromptModal title={prompt.title} label={prompt.label} initialValue={prompt.initialValue} onSubmit={prompt.onSubmit} onClose={() => setPrompt(null)} />
      )}
    </div>
  );
}

function LessonRow({ plan, lesson }: { plan: StudyPlan; lesson: StudyPlan['lessons'][number] }) {
  const toggle = useAction((done: boolean) => api.patch(`/study/plans/${plan.id}/lessons/${lesson.id}`, { done }));
  return (
    <li className={lesson.done ? 'done' : ''}>
      <label>
        <input type="checkbox" checked={lesson.done} disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
        <span><b>{lesson.title}</b>{lesson.description && <small>{lesson.description}</small>}</span>
      </label>
    </li>
  );
}

function PlansTab() {
  const confirm = useConfirm();
  const plans = useStudyPlans();
  const remove = useAction((id: string) => api.del(`/study/plans/${id}`));
  const list = plans.data ?? [];
  return (
    <>
      {plans.isSuccess && list.length === 0 && (
        <div className="gx-empty-card">
          <Icon name="target" size={28} /><h3>Nenhum plano de estudo ainda</h3>
          <p>Diga um assunto para a IA (ex.: "quero um plano de álgebra linear") e ela organiza as aulas numa sequência, ou monte o seu manualmente.</p>
        </div>
      )}
      <ul className="study-plan-list">
        {list.map((p) => (
          <li key={p.id} className="study-plan-card">
            <div className="study-plan-head">
              <div>
                <h3>{p.title}</h3>
                <p className="hint">{p.subject} · {p.lessons.filter((l) => l.done).length}/{p.lessons.length} aulas</p>
              </div>
              <button type="button" className="icon-btn" aria-label="Apagar plano" onClick={async () => { if (await confirm(`Apagar o plano "${p.title}"?`)) remove.mutate(p.id); }}><Icon name="trash" size={16} /></button>
            </div>
            <div className="rd-progress-bar"><div style={{ width: `${p.progressPct}%` }} /></div>
            <ul className="study-lesson-list">
              {p.lessons.map((l) => <LessonRow key={l.id} plan={p} lesson={l} />)}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function StudyPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'notas';
  const go = (t: TabId) => setParams(t === 'notas' ? {} : { tab: t }, { replace: true });

  const [openNote, setOpenNote] = useState<string | 'new' | null>(null);
  const [newNoteFolder, setNewNoteFolder] = useState<string | null>(null);
  const [openPlan, setOpenPlan] = useState(false);

  return (
    <div className="page study">
      <PageHeader title="Estudos" subtitle="Anotações organizadas (pastas, tags, favoritas e ligadas entre si) e planos de estudo com progresso — tudo podendo se atrelar a um livro, treino ou atividade.">
        <button type="button" className="btn" onClick={() => askAssistant(navigate, 'Quero um plano de estudo sobre um assunto. Pergunte qual é o assunto, meu nível (iniciante/intermediário/avançado) e quanto tempo tenho, e monte as aulas numa sequência lógica. Use as ferramentas de estudo.')}><Icon name="sparkles" size={16} /> Pedir à IA</button>
        {tab === 'notas'
          ? <button type="button" className="btn primary" onClick={() => { setNewNoteFolder(null); setOpenNote('new'); }}><Icon name="plus" size={16} /> Nova nota</button>
          : <button type="button" className="btn primary" onClick={() => setOpenPlan(true)}><Icon name="plus" size={16} /> Novo plano</button>}
      </PageHeader>

      <div className="tabs gx-tabs" role="tablist">
        {TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>{t.label}</button>)}
      </div>

      {tab === 'notas' ? <NotesTab onOpen={(id, folderId) => { setNewNoteFolder(folderId ?? null); setOpenNote(id); }} /> : <PlansTab />}

      {openNote && <NoteModal noteId={openNote} initialFolderId={newNoteFolder} onClose={() => setOpenNote(null)} />}
      {openPlan && <PlanModal onClose={() => setOpenPlan(false)} />}
    </div>
  );
}
