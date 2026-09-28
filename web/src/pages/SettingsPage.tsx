import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { AgentAction, AgentSettings, AgentStatus, PermissionMode, PermissionRow } from '../api/types';
import { AssistantSettings } from '../components/AssistantSettings';
import { SecuritySettings } from '../components/SecuritySettings';
import { NotificationSettings } from '../components/NotificationSettings';
import { PageHeader } from '../components/PageHeader';
import { ProfileSettings } from '../components/ProfileSettings';
import { ErrorText, Field } from '../components/ui';
import { fmt } from '../lib/dates';
import { RESOURCE_LABEL, STATUS_LABEL, toolTitle } from '../lib/labels';

const MODEL_PRESETS: Record<AgentSettings['provider'], string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4o-mini'],
};
const MODE_LABEL: Record<PermissionMode, string> = { allow: 'Permitir', confirm: 'Perguntar', deny: 'Negar' };
const MODES: PermissionMode[] = ['allow', 'confirm', 'deny'];
// leituras de informações protegidas continuam pedindo aprovação, mesmo nos atalhos
const readMode = (r: PermissionRow): PermissionMode => (r.defaultMode === 'confirm' ? 'confirm' : 'allow');

type Tab = 'agente' | 'assistente' | 'voz' | 'perfil' | 'notificacoes' | 'permissoes' | 'seguranca' | 'historico';
const TABS: { id: Tab; label: string }[] = [
  { id: 'agente', label: 'Agente' },
  { id: 'assistente', label: 'Assistente' },
  { id: 'voz', label: 'Voz' },
  { id: 'perfil', label: 'Perfil' },
  { id: 'notificacoes', label: 'Notificações' },
  { id: 'permissoes', label: 'Permissões' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'historico', label: 'Histórico' },
];
const SUBTITLE: Record<Tab, string> = {
  agente: 'Escolha a IA que conversa com você e como ela deve se comportar.',
  assistente: 'Quando e sobre o quê o assistente pode tomar a iniciativa de sugerir algo.',
  seguranca: 'Sessões, senha, histórico de segurança e seus direitos sobre os dados.',
  voz: 'Como o botão Ditar transforma sua fala em texto.',
  perfil: 'Conte quem você é ao agente, em três níveis de confidencialidade — os secretos ficam sob senha.',
  notificacoes: 'Por onde o Ninshiki te lembra das coisas: sino do app, celular e WhatsApp.',
  permissoes: 'Decida, ferramenta por ferramenta, o que o agente pode fazer sozinho.',
  historico: 'Tudo o que o agente tentou ou fez, com os detalhes.',
};

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('agente');
  const settings = useQuery({ queryKey: ['agent-settings'], queryFn: () => api.get<AgentSettings>('/agent/settings') });
  const status = useQuery({ queryKey: ['agent-status'], queryFn: () => api.get<AgentStatus>('/agent/status') });
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: () => api.get<PermissionRow[]>('/agent/permissions') });
  const actions = useQuery({ queryKey: ['actions'], queryFn: () => api.get<AgentAction[]>('/agent/actions?limit=30') });

  const toolRows = new Map((permissions.data ?? []).map((p) => [p.tool, p] as const));

  return (
    <div className="page settings">
      <PageHeader title="Configurações" subtitle={SUBTITLE[tab]} />
      <div className="tabs inline" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>

      {/* painéis ficam montados (só ocultos) para não perder edições não salvas ao trocar de aba */}
      {settings.data && status.data && <AgentForm initial={settings.data} status={status.data} tab={tab} />}
      <div hidden={tab !== 'assistente'}><AssistantSettings /></div>
      <div hidden={tab !== 'seguranca'}><SecuritySettings /></div>
      <div hidden={tab !== 'perfil'}><ProfileSettings /></div>
      <div hidden={tab !== 'notificacoes'}><NotificationSettings /></div>
      <div hidden={tab !== 'permissoes'}>{permissions.data && <Permissions rows={permissions.data} />}</div>

      <section className="panel" hidden={tab !== 'historico'}>
        <h2>Histórico de ações do agente</h2>
        {(actions.data ?? []).length === 0 && <p className="empty">O agente ainda não executou nenhuma ação.</p>}
        <ul className="actions-log">
          {(actions.data ?? []).map((a) => (
            <li key={a.id}>
              <details>
                <summary>
                  <span className={`status ${a.status}`}>{STATUS_LABEL[a.status]}</span>
                  <strong>{toolTitle(toolRows.get(a.tool), a.tool)}</strong>
                  <span className="muted">{fmt(new Date(a.createdAt), 'd MMM HH:mm')}</span>
                </summary>
                <pre>{JSON.stringify({ args: a.args, result: a.result }, null, 2)}</pre>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function AgentForm({ initial, status, tab }: { initial: AgentSettings; status: AgentStatus; tab: Tab }) {
  const [f, setF] = useState<AgentSettings>(initial);
  const save = useAction(() => api.put<AgentSettings>('/agent/settings', f));
  const set = <K extends keyof AgentSettings>(k: K, v: AgentSettings[K]) => setF((p) => ({ ...p, [k]: v }));

  const changeProvider = (provider: AgentSettings['provider']) =>
    setF((p) => ({ ...p, provider, model: MODEL_PRESETS[provider].includes(p.model) ? p.model : MODEL_PRESETS[provider][0] }));

  const keyOk = status.providers[f.provider];
  const openaiOk = status.providers.openai;

  return (
    <form className="panel" hidden={tab !== 'agente' && tab !== 'voz'} onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
      <div hidden={tab !== 'agente'}>
      <h2>Agente</h2>
      <div className="row">
        <Field label="Provedor de IA">
          <select value={f.provider} onChange={(e) => changeProvider(e.target.value as AgentSettings['provider'])}>
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI</option>
          </select>
        </Field>
        <Field label="Modelo">
          <input list="models" value={f.model} onChange={(e) => set('model', e.target.value)} required />
          <datalist id="models">{MODEL_PRESETS[f.provider].map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
      </div>
      <p className={`key-status ${keyOk ? 'ok' : 'missing'}`}>
        {keyOk ? 'Chave de API configurada.' : `Chave ausente: defina ${f.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} no arquivo .env e rode docker compose restart api.`}
      </p>

      <div className="row">
        <Field label="Idioma das respostas"><input value={f.language} onChange={(e) => set('language', e.target.value)} required /></Field>
        <Field label="Tom"><input value={f.tone} onChange={(e) => set('tone', e.target.value)} placeholder="ex.: direto e acolhedor" /></Field>
      </div>
      <Field label="Instruções permanentes">
        <textarea rows={4} value={f.customInstructions} onChange={(e) => set('customInstructions', e.target.value)}
          placeholder="Ex.: Nunca sugira aumentar a carga em dias de baixa capacidade. Sempre pergunte o motivo antes de mover eventos de trabalho." />
      </Field>
      <div className="row">
        <label className="check">
          <input type="checkbox" checked={f.includeRoutineContext} onChange={(e) => set('includeRoutineContext', e.target.checked)} />
          Enviar minha rotina ao agente em toda mensagem (atividades, níveis e princípios)
        </label>
        <Field label="Máximo de passos por mensagem">
          <input type="number" min={1} max={20} value={f.maxToolSteps} onChange={(e) => set('maxToolSteps', Number(e.target.value))} />
        </Field>
      </div>

      </div>

      <div hidden={tab !== 'voz'}>
      <h2>Ditado por voz</h2>
      <div className="row">
        <Field label="Modo">
          <select value={f.sttMode} onChange={(e) => set('sttMode', e.target.value as AgentSettings['sttMode'])}>
            <option value="server">Servidor — transcrição OpenAI (mais precisa)</option>
            <option value="browser">Navegador — gratuito (Chrome, Edge, Safari)</option>
          </select>
        </Field>
        {f.sttMode === 'server' && (
          <Field label="Modelo de transcrição"><input value={f.sttModel} onChange={(e) => set('sttModel', e.target.value)} /></Field>
        )}
      </div>
      {f.sttMode === 'server' && !openaiOk && (
        <p className="key-status missing">O ditado no modo servidor precisa de OPENAI_API_KEY, mesmo que o chat use Claude.</p>
      )}
      </div>

      <ErrorText error={save.error} />
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={save.isPending}>Salvar configurações</button>
        {save.isSuccess && <span className="muted small">Salvo.</span>}
      </div>
    </form>
  );
}

function Permissions({ rows }: { rows: PermissionRow[] }) {
  const update = useAction((entries: { tool: string; mode: PermissionMode }[]) => api.put('/agent/permissions', { entries }));
  const grouped = Object.keys(RESOURCE_LABEL)
    .map((resource) => ({ resource, list: rows.filter((r) => r.resource === resource) }))
    .filter((g) => g.list.length > 0);

  const preset = (fn: (r: PermissionRow) => PermissionMode) => update.mutate(rows.map((r) => ({ tool: r.tool, mode: fn(r) })));

  return (
    <section className="panel">
      <h2>Permissões do agente</h2>
      <p className="muted">
        Defina, ferramenta por ferramenta, o que o agente pode fazer. <strong>Perguntar</strong> pausa a ação até você aprovar na Home;
        <strong> Negar</strong> esconde a ferramenta do agente. A regra é aplicada pelo servidor, não só pelo prompt.
      </p>
      <div className="presets">
        <button className="btn" onClick={() => preset((r) => r.defaultMode)}>Padrão</button>
        <button className="btn" onClick={() => preset((r) => (r.action === 'read' ? readMode(r) : 'confirm'))}>Perguntar antes de alterar</button>
        <button className="btn" onClick={() => preset((r) => (r.action === 'read' ? readMode(r) : 'deny'))}>Somente leitura</button>
      </div>
      <ErrorText error={update.error} />

      {grouped.map((g) => (
        <div key={g.resource} className="perm-group">
          <h3>{RESOURCE_LABEL[g.resource]}</h3>
          <ul>
            {g.list.map((r) => (
              <li key={r.tool}>
                <div className="perm-text">
                  <b className="perm-title">{toolTitle(r, r.tool)}</b>
                  <span>{r.description}</span>
                </div>
                <div className="seg-control" role="radiogroup" aria-label={`Permissão: ${toolTitle(r, r.tool)}`}>
                  {MODES.map((m) => (
                    <button
                      key={m} type="button" role="radio" aria-checked={r.mode === m} className={`mode-${m}`}
                      disabled={update.isPending || (r.locked === true && m === 'allow')} title={r.locked && m === 'allow' ? 'Ações financeiras sempre pedem a sua confirmação' : undefined} onClick={() => r.mode !== m && update.mutate([{ tool: r.tool, mode: m }])}
                    >{MODE_LABEL[m]}</button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
