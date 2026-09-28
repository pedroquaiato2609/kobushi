import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { AgentAction, AgentSettings, AgentStatus, ChatMessage, Conversation, PermissionRow, StreamEvent } from '../api/types';
import { useConfirm } from '../components/ConfirmProvider';
import { DayRoutine } from '../components/DayRoutine';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { PageHeader } from '../components/PageHeader';
import { SuggestionsCard } from '../components/SuggestionsCard';
import { ErrorText } from '../components/ui';
import { useDictation } from '../hooks/useDictation';
import { useTypewriter } from '../hooks/useTypewriter';
import { CONVERSATION_KEY, PROMPT_KEY } from '../lib/chatPrompt';
import { fmt } from '../lib/dates';
import { toolPhrase, type ToolPhase } from '../lib/labels';

const SUGGESTIONS = [
  'O que tenho para hoje?',
  'Como faço um bolo de chocolate?',
  'Crie um evento amanhã às 14h: dentista, e me avise 1 hora antes',
  'Me lembre de tomar água todo dia às 15h',
];

type ToolRow = Pick<PermissionRow, 'action' | 'label'>;
type ToolMap = Map<string, ToolRow>;
type LiveItem = { kind: 'text'; text: string } | { kind: 'tool'; id: string; name: string; phase: 'run' | 'ok' | 'error' | 'pending' };
interface Live { user: string; items: LiveItem[]; done: boolean; notice?: string }

function toolStatus(content: string | undefined): 'ok' | 'error' | 'pending' | 'run' {
  if (!content) return 'run';
  try {
    const r = JSON.parse(content);
    if (r?.status === 'pending_user_confirmation') return 'pending';
    if (r?.error) return 'error';
  } catch { /* resultado não é JSON */ }
  return 'ok';
}

/** Mensagens distintas do agente vêm separadas por uma linha "---": cada parte vira um balão. */
const splitBubbles = (text: string) => text.split(/\n\s*-{3,}\s*\n/).map((t) => t.trim()).filter(Boolean);

const ToolChip = ({ tools, name, phase, args }: { tools: ToolMap; name: string; phase: ToolPhase; args?: unknown }) => (
  <span className={`tool-chip ${phase === 'ask' ? 'pending' : phase}`} title={args ? JSON.stringify(args) : undefined}>
    {toolPhrase(tools.get(name), name, phase)}
  </span>
);

const Bubbles = ({ text }: { text: string }) => (
  <>{splitBubbles(text).map((part, i) => <div key={i} className="bubble agent"><ReactMarkdown>{part}</ReactMarkdown></div>)}</>
);

function reduceLive(live: Live | null, ev: StreamEvent): Live | null {
  if (!live) return live;
  const items = [...live.items];
  switch (ev.type) {
    case 'notice': return { ...live, notice: ev.message };
    case 'step': items.push({ kind: 'text', text: '' }); break;
    case 'text': {
      const last = items[items.length - 1];
      if (last?.kind === 'text') items[items.length - 1] = { ...last, text: last.text + ev.delta };
      else items.push({ kind: 'text', text: ev.delta });
      break;
    }
    case 'tool_start': items.push({ kind: 'tool', id: ev.id, name: ev.name, phase: 'run' }); break;
    case 'tool_end': return { ...live, items: items.map((i) => (i.kind === 'tool' && i.id === ev.id ? { ...i, phase: ev.status } : i)) };
    default: return live;
  }
  return { ...live, items, notice: undefined }; // qualquer progresso limpa o aviso de espera
}

/** Turno em andamento: o texto que chega em blocos é "digitado" aos poucos; ao terminar, entrega para o histórico salvo. */
function LiveTurn({ live, tools, onSettled }: { live: Live; tools: ToolMap; onSettled: () => void }) {
  let lastText = -1;
  live.items.forEach((it, i) => { if (it.kind === 'text') lastText = i; });
  const full = lastText >= 0 ? (live.items[lastText] as { text: string }).text : '';
  const typed = useTypewriter(full, lastText);
  const caughtUp = typed.length >= full.length;

  useEffect(() => { if (live.done && caughtUp) onSettled(); }, [live.done, caughtUp, onSettled]);

  const last = live.items[live.items.length - 1];
  const thinking = !live.done && (!last || last.kind === 'tool' || !last.text);
  return (
    <>
      <div className="bubble user">{live.user}</div>
      <div className="agent-turn">
        <span className="avatar" lang="ja">認</span>
        <div className="agent-body">
          {live.items.map((it, i) => {
            if (it.kind === 'tool') return <div key={i} className="tool-chips"><ToolChip tools={tools} name={it.name} phase={it.phase === 'run' ? 'run' : it.phase} /></div>;
            const text = i === lastText ? typed.replace(/\n\s*-{1,3}\s*$/, '') : it.text;
            return text ? <Bubbles key={i} text={text} /> : null;
          })}
          {live.notice && !live.done && <p className="sys-note" role="status">{live.notice}</p>}
          {thinking && <div className="thinking" aria-label="O agente está pensando"><i /><i /><i /></div>}
        </div>
      </div>
    </>
  );
}

export default function HomePage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(CONVERSATION_KEY));
  const [input, setInput] = useState('');
  const [live, setLive] = useState<Live | null>(null); // turno em andamento (streaming)
  const location = useLocation();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const today = useRef(new Date()).current;

  const conversations = useQuery({ queryKey: ['conversations'], queryFn: () => api.get<Conversation[]>('/conversations') });
  const settings = useQuery({ queryKey: ['agent-settings'], queryFn: () => api.get<AgentSettings>('/agent/settings') });
  const status = useQuery({ queryKey: ['agent-status'], queryFn: () => api.get<AgentStatus>('/agent/status') });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionRow[]>('/agent/permissions') });
  const pending = useQuery({ queryKey: ['pending'], queryFn: () => api.get<AgentAction[]>('/agent/actions?status=pending') });

  const active = conversations.data?.some((c) => c.id === activeId) ? activeId : null;
  const messages = useQuery({
    queryKey: ['messages', active],
    queryFn: () => api.get<ChatMessage[]>(`/conversations/${active}/messages`),
    enabled: Boolean(active),
  });

  const select = (id: string | null) => {
    setActiveId(id);
    if (id) localStorage.setItem(CONVERSATION_KEY, id); else localStorage.removeItem(CONVERSATION_KEY);
    if (!id) areaRef.current?.focus();
  };

  const dictation = useDictation(settings.data?.sttMode ?? 'server', (text) => setInput((prev) => (prev ? `${prev} ${text}` : text)), settings.data?.language);

  async function send(raw: string, opts: { forceNew?: boolean } = {}) {
    const text = raw.trim();
    if (!text || live !== null) return;
    setError(null);
    setLive({ user: text, items: [], done: false });
    setInput('');
    // forceNew: pedido vindo de outra tela (ou de uma sugestão) — nunca continua a conversa que já estava aberta,
    // mesmo que a Home já estivesse montada (nesse caso `active` no state ainda aponta para a antiga).
    let id = opts.forceNew ? null : active;
    try {
      if (!id) {
        const created = await api.post<Conversation>('/conversations');
        id = created.id;
        select(id);
      }
      await api.stream<StreamEvent>(`/conversations/${id}/stream`, { content: text }, (ev) => {
        if (ev.type === 'error') setError(ev.message);
        else if (ev.type !== 'done' && ev.type !== 'user') setLive((l) => reduceLive(l, ev));
      });
    } catch (e) {
      setError((e as Error).message);
      // se a mensagem não chegou a ser salva, devolve o texto para o campo
      const saved = id ? await api.get<ChatMessage[]>(`/conversations/${id}/messages`).catch(() => [] as ChatMessage[]) : [];
      const wasSaved = saved.some((m) => m.role === 'user' && m.content === text && Date.now() - new Date(m.createdAt).getTime() < 120_000);
      if (!wasSaved) setInput(text);
    } finally {
      setLive((l) => (l ? { ...l, done: true } : l)); // o LiveTurn termina de "digitar" e chama settle()
    }
  }

  // Termina o turno ao vivo: recarrega tudo (o agente pode ter alterado qualquer dado) e mostra o histórico salvo.
  const settle = useCallback(async () => {
    await qc.invalidateQueries();
    setLive(null);
  }, [qc]);

  const removeConversation = useAction(() => api.del(`/conversations/${active}`), () => select(null));
  const approve = useAction((id: string) => api.post(`/agent/actions/${id}/approve`));
  const reject = useAction((id: string) => api.post(`/agent/actions/${id}/reject`));

  const liveSize = live ? live.items.reduce((n, i) => n + (i.kind === 'text' ? i.text.length : 1), 0) : 0;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.data?.length, live?.user, Math.floor(liveSize / 40), pending.data?.length]);
  useEffect(() => { // vindo de Documentos ("Perguntar ao agente"), já deixa a pergunta escrita
    const ask = (location.state as { ask?: string } | null)?.ask;
    if (ask) { setInput(ask); window.history.replaceState({}, ''); areaRef.current?.focus(); }
  }, [location.state]);
  useEffect(() => { // campo cresce com o texto
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(input); }
  };

  const msgs = messages.data ?? [];
  const results = new Map(msgs.filter((m) => m.role === 'tool').map((m) => [m.toolCallId, m.content] as const));
  const missingKey = status.data && settings.data && !status.data.providers[settings.data.provider];
  const tools: ToolMap = new Map((permissions.data ?? []).map((p) => [p.tool, p] as const));
  const empty = msgs.length === 0 && live === null;
  const busy = live !== null;

  // Vindo de uma sugestão ou de um insight: envia a frase preparada, uma única vez.
  const promptSent = useRef(false);
  useEffect(() => {
    if (promptSent.current || !conversations.data || !settings.data || live !== null) return;
    const p = sessionStorage.getItem(PROMPT_KEY);
    if (!p) return;
    promptSent.current = true;
    sessionStorage.removeItem(PROMPT_KEY);
    void send(p, { forceNew: true });
  });

  // botões de resposta rápida do último turno (offer_options), enquanto o usuário ainda não respondeu
  let offers: string[] = [];
  let links: { label: string; href: string }[] = [];
  if (!busy) {
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    for (const m of msgs.slice(lastUser + 1)) {
      for (const c of m.toolCalls ?? []) {
        if (c.name === 'offer_options') offers = ((c.args as { options?: string[] }).options ?? []).slice(0, 4);
        if (c.name === 'offer_links') links = ((c.args as { links?: { label: string; href: string }[] }).links ?? []).filter((l) => l.href.startsWith('/') && !l.href.startsWith('//')).slice(0, 3);
      }
    }
  }

  return (
    <div className="page">
      <PageHeader title="Home" subtitle="Converse com o agente e acompanhe o seu dia. Ele lê e altera tudo o que você vê no app." />

      {missingKey && (
        <div className="banner">
          A chave de API do provedor selecionado ({settings.data!.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'}) não está configurada.
          Adicione-a ao arquivo <code>.env</code> e reinicie com <code>docker compose restart api</code>, ou escolha outro provedor em <Link to="/configuracoes">Configurações</Link>.
        </div>
      )}

      <div className="home">
        <section className="panel convs" aria-label="Conversas">
          <div className="panel-head">
            <h2>Conversas</h2>
            <button className="btn primary round" style={{ width: 32, height: 32 }} onClick={() => select(null)} aria-label="Nova conversa" title="Nova conversa"><Icon name="plus" size={16} /></button>
          </div>
          <ul className="conv-list">
            {(conversations.data ?? []).map((c) => (
              <li key={c.id}>
                <button className={`conv${c.id === active ? ' active' : ''}`} onClick={() => select(c.id)}>
                  <span className="conv-title">{c.title}</span>
                  <span className="conv-date">{fmt(new Date(c.updatedAt), "d MMM, HH:mm")}</span>
                </button>
              </li>
            ))}
          </ul>
          {(conversations.data ?? []).length === 0 && <p className="hint" style={{ padding: '0 8px' }}>Suas conversas aparecem aqui.</p>}
        </section>

        <section className="panel chat-panel" aria-label="Chat com o agente">
          <div className="chat-head">
            <h2>Agente Ninshiki</h2>
            <select className="conv-select" aria-label="Conversa" value={active ?? ''} onChange={(e) => select(e.target.value || null)}>
              <option value="">Nova conversa</option>
              {(conversations.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <span className="muted small">{settings.data?.model}</span>
            {active && (
              <button className="icon-btn" title="Apagar esta conversa" aria-label="Apagar esta conversa"
                onClick={async () => { if (await confirm('Apagar esta conversa?')) removeConversation.mutate(undefined); }}><Icon name="trash" size={16} /></button>
            )}
          </div>

          <SuggestionsCard />

          <div className="thread" aria-live="polite">
            {empty && (
              <div className="empty-chat">
                <Logo size={76} animate className="orb-logo" />
                <h2>O que vamos organizar?</h2>
                <p>Peça em linguagem natural. Eu leio e altero atividades, agenda, lembretes, documentos, kanban e revisões — dentro das permissões que você definir — e sugiro atalhos para você ganhar tempo.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} className="suggestion" onClick={() => { setInput(s); areaRef.current?.focus(); }}><Icon name="sparkles" size={16} />{s}</button>
                  ))}
                </div>
              </div>
            )}

            {msgs.map((m) => {
              if (m.role === 'tool') return null;
              if (m.role === 'note') return <p key={m.id} className="sys-note">{m.content}</p>;
              if (m.role === 'user') return <div key={m.id} className="bubble user">{m.content}</div>;
              const calls = (m.toolCalls ?? []).filter((c) => c.name !== 'offer_options' && c.name !== 'offer_links');
              if (!m.content && calls.length === 0) return null;
              return (
                <div key={m.id} className="agent-turn">
                  <span className="avatar" lang="ja">認</span>
                  <div className="agent-body">
                    {m.content && <Bubbles text={m.content} />}
                    {calls.length > 0 && (
                      <div className="tool-chips">
                        {calls.map((c) => <ToolChip key={c.id} tools={tools} name={c.name} phase={toolStatus(results.get(c.id)) === 'run' ? 'ok' : (toolStatus(results.get(c.id)) as ToolPhase)} args={c.args} />)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {live && <LiveTurn live={live} tools={tools} onSettled={settle} />}

            {links.length > 0 && (
              <div className="offers links" role="group" aria-label="Atalhos">
                {links.map((l) => <button key={l.href} className="offer" onClick={() => navigate(l.href)}>{l.label} <Icon name="right" size={14} /></button>)}
              </div>
            )}
            {offers.length > 0 && (
              <div className="offers" role="group" aria-label="Respostas rápidas">
                {offers.map((o) => <button key={o} className="offer" onClick={() => send(o)}>{o}</button>)}
              </div>
            )}

            {(pending.data ?? []).map((a) => (
              <div key={a.id} className="approval">
                <p><strong>{toolPhrase(tools.get(a.tool), a.tool, 'ask')}?</strong></p>
                {a.summary ? <ul className="approval-summary">{a.summary.split('\n').map((l, i) => <li key={i}>{l}</li>)}</ul> : null}
                <details><summary>Ver detalhes técnicos</summary><pre>{JSON.stringify(a.args, null, 2)}</pre></details>
                <div className="approval-actions">
                  <button className="btn primary" disabled={approve.isPending || reject.isPending} onClick={() => approve.mutate(a.id)}>Aprovar</button>
                  <button className="btn ghost" disabled={approve.isPending || reject.isPending} onClick={() => reject.mutate(a.id)}>Rejeitar</button>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="composer-wrap">
            <ErrorText error={error ? new Error(error) : approve.error ?? reject.error} />
            {dictation.error && <p className="error" role="alert">{dictation.error}</p>}
            <div className="composer">
              <textarea
                ref={areaRef} value={input} rows={1} placeholder="Escreva ou dite o que você precisa…" aria-label="Mensagem"
                onChange={(e) => setInput(e.target.value)} onKeyDown={onKey}
              />
              <div className="composer-actions">
                {dictation.supported && (
                  <button
                    type="button" className={`btn round mic ${dictation.state}`} onClick={dictation.toggle}
                    disabled={dictation.state === 'transcribing'} aria-pressed={dictation.state === 'recording'}
                    title={dictation.state === 'recording' ? 'Parar e inserir o texto' : dictation.state === 'transcribing' ? 'Transcrevendo…' : 'Ditar por voz'}
                    aria-label={dictation.state === 'recording' ? 'Parar ditado' : 'Ditar por voz'}
                  ><Icon name="mic" /></button>
                )}
                <button className="btn primary round" onClick={() => send(input)} disabled={!input.trim() || busy} aria-label="Enviar"><Icon name="send" /></button>
              </div>
            </div>
          </div>
        </section>

        <aside className="panel home-side" aria-label="Rotina de hoje">
          <DayRoutine date={today} />
        </aside>
      </div>
    </div>
  );
}
