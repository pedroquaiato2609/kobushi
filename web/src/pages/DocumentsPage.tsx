import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { DocKind, DocListItem, Doc, Folder } from '../api/types';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { RichEditor } from '../components/RichEditor';
import { TextPromptModal } from '../components/TextPromptModal';
import { ErrorText, Field, Modal } from '../components/ui';
import { fmt } from '../lib/dates';
import { parseList, serializeList } from '../lib/checklist';

type Selection = 'all' | 'root' | string;
const KIND_ICON = { note: 'note', list: 'list', file: 'file' } as const;
const KIND_NAME: Record<DocKind, string> = { note: 'Nota', list: 'Lista', file: 'Arquivo' };

/** Trecho legível para o cartão: listas mostram ✓ nos itens feitos; markdown perde os símbolos. */
const preview = (d: DocListItem) =>
  d.summary
  || d.excerpt.replace(/^\s*[-*] \[[xX]\] /gm, '✓ ').replace(/^\s*[-*] \[ \] /gm, '').replace(/[#*>]/g, '').replace(/\s*\n\s*/g, ' · ').trim()
  || (d.kind === 'file' ? 'Sem texto extraído' : 'Vazio');

const fmtSize = (n: number | null) => (n === null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Pastas em ordem de árvore, com a profundidade de cada uma (para indentar em selects e listas). */
function flatten(folders: Folder[]): { folder: Folder; depth: number }[] {
  const out: { folder: Folder; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const f of folders.filter((x) => x.parentId === parent)) { out.push({ folder: f, depth }); walk(f.id, depth + 1); }
  };
  walk(null, 0);
  return out;
}

type TextPrompt = { title: string; label: string; initialValue?: string; onSubmit: (v: string) => void };

export default function DocumentsPage() {
  const confirm = useConfirm();
  const [sel, setSel] = useState<Selection>('all');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState<TextPrompt | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const folders = useQuery({ queryKey: ['folders'], queryFn: () => api.get<Folder[]>('/folders') });
  const docs = useQuery({
    queryKey: ['documents', sel, q],
    queryFn: () => {
      const p = new URLSearchParams();
      if (sel !== 'all') p.set('folderId', sel);
      if (q.trim()) p.set('query', q.trim());
      return api.get<DocListItem[]>(`/documents?${p}`);
    },
  });

  const tree = flatten(folders.data ?? []);
  const current = (folders.data ?? []).find((f) => f.id === sel);
  const targetFolder = current ? current.id : undefined;

  const createDoc = useAction((kind: 'note' | 'list') => api.post<Doc>('/documents', {
    title: kind === 'note' ? 'Nova nota' : 'Nova lista', kind, content: '', folderId: targetFolder ?? null,
  }), (d) => setOpenId(d.id));
  const createFolder = useAction((v: { name: string; parentId: string | null }) => api.post<Folder>('/folders', v), (f) => setSel(f.id));
  const patchFolder = useAction((v: { id: string; body: Record<string, unknown> }) => api.patch(`/folders/${v.id}`, v.body));
  const deleteFolder = useAction((id: string) => api.del(`/folders/${id}`), () => setSel('all'));

  async function upload(files: FileList | File[]) {
    setUploadError(null);
    for (const file of Array.from(files)) {
      setUploading((n) => n + 1);
      try { await api.uploadFile(file, targetFolder); } catch (e) { setUploadError(`${file.name}: ${(e as Error).message}`); }
      setUploading((n) => n - 1);
    }
    await docs.refetch();
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void upload(e.dataTransfer.files); };

  const promptFolder = (parentId: string | null) => setPrompt({
    title: parentId ? 'Nova subpasta' : 'Nova pasta',
    label: parentId ? 'Nome da subpasta' : 'Nome da pasta',
    onSubmit: (name) => createFolder.mutate({ name, parentId }),
  });

  const list = docs.data ?? [];
  const title = sel === 'all' ? 'Todos os documentos' : sel === 'root' ? 'Sem pasta' : current?.name ?? 'Documentos';

  return (
    <div className="page">
      <PageHeader title="Documentos" subtitle="Seu mini data center pessoal: notas, listas, exames e arquivos, organizados em pastas — e o agente lê, cria, edita e resume." />

      <div className="docs">
        <nav className="panel folders" aria-label="Pastas">
          <div className="panel-head">
            <h2>Pastas</h2>
            <button className="btn round" style={{ width: 32, height: 32 }} onClick={() => promptFolder(null)} aria-label="Nova pasta" title="Nova pasta"><Icon name="plus" size={16} /></button>
          </div>
          <ul>
            <li><button className={`folder${sel === 'all' ? ' active' : ''}`} onClick={() => setSel('all')}><Icon name="folder" size={16} /> Todos</button></li>
            <li><button className={`folder${sel === 'root' ? ' active' : ''}`} onClick={() => setSel('root')}><Icon name="file" size={16} /> Sem pasta</button></li>
            {tree.map(({ folder: f, depth }) => (
              <li key={f.id} style={{ paddingLeft: depth * 14 }}>
                <button className={`folder${sel === f.id ? ' active' : ''}`} onClick={() => setSel(f.id)}>
                  <Icon name="folder" size={16} /> <span className="folder-name">{f.name}</span>
                  {!f.agentVisible && <span title="Oculta do agente" aria-label="Oculta do agente"><Icon name="eyeOff" size={14} /></span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <section className={`panel doc-main${dragging ? ' dragging' : ''}`} aria-label={title}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }} onDrop={onDrop}>
          <div className="doc-head">
            <h2>{title}</h2>
            <div className="doc-actions">
              <button className="btn primary" onClick={() => createDoc.mutate('note')}><Icon name="note" size={16} /> Nova nota</button>
              <button className="btn" onClick={() => createDoc.mutate('list')}><Icon name="list" size={16} /> Nova lista</button>
              <button className="btn" onClick={() => fileInput.current?.click()}><Icon name="upload" size={16} /> Enviar arquivo</button>
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files) void upload(e.target.files); e.target.value = ''; }} />
            </div>
          </div>

          {current && (
            <div className="folder-bar">
              <span className="muted small">{current.agentVisible ? 'O agente pode ver esta pasta.' : 'Oculta do agente: ele não vê nada aqui.'}</span>
              <span className="spacer" />
              <button className="btn small" onClick={() => promptFolder(current.id)}>Subpasta</button>
              <button className="btn small" onClick={() => setPrompt({ title: 'Renomear pasta', label: 'Nome da pasta', initialValue: current.name, onSubmit: (n) => patchFolder.mutate({ id: current.id, body: { name: n } }) })}>Renomear</button>
              <button className="btn small" aria-pressed={!current.agentVisible} onClick={() => patchFolder.mutate({ id: current.id, body: { agentVisible: !current.agentVisible } })}>
                <Icon name={current.agentVisible ? 'eyeOff' : 'eye'} size={14} /> {current.agentVisible ? 'Ocultar do agente' : 'Mostrar ao agente'}
              </button>
              <button className="btn small danger" onClick={async () => { if (await confirm(`Apagar a pasta "${current.name}" com tudo o que há dentro (subpastas e documentos)?`)) deleteFolder.mutate(current.id); }}>Apagar</button>
            </div>
          )}

          <label className="search wide"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no título e no conteúdo" aria-label="Buscar documentos" /></label>
          <ErrorText error={docs.error ?? createDoc.error ?? createFolder.error ?? patchFolder.error ?? deleteFolder.error} />
          {uploadError && <p className="error" role="alert">{uploadError}</p>}
          {uploading > 0 && <p className="muted small">Enviando {uploading} arquivo{uploading > 1 ? 's' : ''}…</p>}

          {!docs.isLoading && list.length === 0 && (
            <div className="empty-block">
              <p>{q ? 'Nada encontrado.' : 'Nada aqui ainda.'}</p>
              {!q && <p className="hint">Crie uma nota, uma lista de compras, ou arraste arquivos (PDF, exames, fotos) para cá. Peça também ao agente: “anote que preciso renovar o passaporte”.</p>}
            </div>
          )}

          <div className="doc-grid">
            {list.map((d) => (
              <button key={d.id} className={`doc-card k-${d.kind}`} onClick={() => setOpenId(d.id)}>
                <span className="doc-ico"><Icon name={KIND_ICON[d.kind]} size={18} /></span>
                <b>{d.title}</b>
                <span className="doc-excerpt">{preview(d)}</span>
                <span className="doc-meta">{KIND_NAME[d.kind]}{d.sizeBytes ? ` · ${fmtSize(d.sizeBytes)}` : ''} · {fmt(new Date(d.updatedAt), 'd MMM')}{d.summary ? ' · resumo' : ''}</span>
              </button>
            ))}
          </div>
          {dragging && <div className="drop-hint">Solte para enviar{current ? ` para “${current.name}”` : ''}</div>}
        </section>
      </div>

      {openId && <DocEditor id={openId} folders={tree} onClose={() => setOpenId(null)} />}
      {prompt && (
        <TextPromptModal title={prompt.title} label={prompt.label} initialValue={prompt.initialValue} onSubmit={prompt.onSubmit} onClose={() => setPrompt(null)} />
      )}
    </div>
  );
}

function DocEditor({ id, folders, onClose }: { id: string; folders: { folder: Folder; depth: number }[]; onClose: () => void }) {
  const doc = useQuery({ queryKey: ['document', id], queryFn: () => api.get<Doc>(`/documents/${id}`) });
  if (doc.error) return <Modal title="Documento" onClose={onClose}><ErrorText error={doc.error} /></Modal>;
  if (!doc.data) return <Modal title="Documento" onClose={onClose}><p className="muted">Carregando…</p></Modal>;
  return <DocForm key={doc.data.id} doc={doc.data} folders={folders} onClose={onClose} />;
}

function DocForm({ doc, folders, onClose }: { doc: Doc; folders: { folder: Folder; depth: number }[]; onClose: () => void }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [title, setTitle] = useState(doc.title);
  const [content, setContent] = useState(doc.content);
  const [folderId, setFolderId] = useState(doc.folderId ?? '');
  const [newItem, setNewItem] = useState('');

  const patch = (body: Record<string, unknown>) => api.patch<Doc>(`/documents/${doc.id}`, body);
  const save = useAction(() => patch({ title: title.trim(), folderId: folderId || null, ...(doc.kind === 'file' ? {} : { content }) }), onClose);
  const quick = useAction((next: string) => patch({ content: next })); // lista: salva a cada toque
  const summarize = useAction(() => api.post<Doc>(`/documents/${doc.id}/summarize`));
  const remove = useAction(() => api.del(`/documents/${doc.id}`), onClose);

  const lines = parseList(content);
  const setLines = (next: typeof lines) => { const c = serializeList(next); setContent(c); quick.mutate(c); };
  const canSummarize = content.trim().length > 0;

  return (
    <Modal
      wide title={doc.kind === 'list' ? 'Lista' : doc.kind === 'file' ? 'Arquivo' : 'Nota'} onClose={onClose} onSubmit={() => save.mutate(undefined)}
      footer={
        <>
          <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm(`Apagar "${doc.title}"?`)) remove.mutate(undefined); }}>Apagar</button>
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
          <button type="submit" className="btn primary" disabled={save.isPending || !title.trim()}>Salvar</button>
        </>
      }
    >
      <div className="row">
        <Field label="Título"><input value={title} onChange={(e) => setTitle(e.target.value)} required /></Field>
        <Field label="Pasta">
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Sem pasta</option>
            {folders.map(({ folder: f, depth }) => <option key={f.id} value={f.id}>{'— '.repeat(depth)}{f.name}</option>)}
          </select>
        </Field>
      </div>

      {doc.kind === 'note' && (
        <Field label="Conteúdo" className="study-content-field">
          <RichEditor content={content} onChange={setContent} />
        </Field>
      )}

      {doc.kind === 'list' && (
        <div className="field">
          <span className="field-label">Itens</span>
          <ul className="checklist">
            {lines.map((l, i) => (
              <li key={i} className={l.checked ? 'done' : ''}>
                {l.checked === null
                  ? <span className="plain">{l.text}</span>
                  : <label><input type="checkbox" checked={l.checked} onChange={() => setLines(lines.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))} /> <span>{l.text}</span></label>}
                <button type="button" className="icon-btn" aria-label={`Remover ${l.text}`} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Icon name="x" size={14} /></button>
              </li>
            ))}
          </ul>
          <div className="add-item">
            <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Adicionar item e apertar Enter"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newItem.trim()) { setLines([...lines, { checked: false, text: newItem.trim() }]); setNewItem(''); } } }} />
          </div>
        </div>
      )}

      {doc.kind === 'file' && (
        <div className="field">
          <div className="file-info">
            <span>{doc.mime ?? 'arquivo'} · {fmtSize(doc.sizeBytes)}</span>
            <a className="btn small" href={`/api/documents/${doc.id}/file`} target="_blank" rel="noreferrer"><Icon name="download" size={14} /> Abrir / baixar</a>
          </div>
          {doc.mime?.startsWith('image/') && <img className="file-preview" src={`/api/documents/${doc.id}/file`} alt={doc.title} />}
          {content ? (
            <details><summary>Texto extraído ({content.length.toLocaleString('pt-BR')} caracteres)</summary><pre className="extracted">{content.slice(0, 6000)}{content.length > 6000 ? '\n…' : ''}</pre></details>
          ) : <p className="hint">Este arquivo não tem texto extraível (por exemplo, uma imagem ou PDF escaneado), então o agente não consegue lê-lo — só guardá-lo.</p>}
        </div>
      )}

      <div className="summary-box">
        <div className="field-row">
          <span className="field-label">Resumo</span>
          <button type="button" className="btn small" disabled={!canSummarize || summarize.isPending} onClick={() => summarize.mutate(undefined)}>
            <Icon name="sparkles" size={14} /> {summarize.isPending ? 'Resumindo…' : doc.summary ? 'Resumir de novo' : 'Resumir com IA'}
          </button>
        </div>
        {doc.summary ? <div className="md-preview"><ReactMarkdown>{doc.summary}</ReactMarkdown></div> : <p className="hint">Um resumo curto aparece nos cartões e ajuda o agente a achar este documento.</p>}
        <button type="button" className="link" onClick={() => { onClose(); navigate('/', { state: { ask: `Sobre o documento "${title}": ` } }); }}>Perguntar ao agente sobre este documento →</button>
      </div>
      <ErrorText error={save.error ?? summarize.error ?? remove.error ?? quick.error} />
    </Modal>
  );
}
