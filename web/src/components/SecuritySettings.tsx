import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { AuditEntry, SessionInfo } from '../api/types';
import { fmt } from '../lib/dates';
import { useAuth, useReauth } from './AuthGate';
import { TOUR_KEY } from './Tour';
import { ErrorText, Field } from './ui';

const ACTION: Record<string, string> = {
  'auth.setup': 'Acesso criado', 'auth.login': 'Entrou', 'auth.login_failed': 'Tentativa de login recusada', 'auth.logout': 'Saiu', 'auth.session_revoked': 'Dispositivo desconectado',
  'auth.password_changed': 'Senha alterada', 'auth.reauth_failed': 'Confirmação de senha recusada', 'finance.tx_created': 'Movimentação criada', 'finance.tx_updated': 'Movimentação alterada',
  'finance.tx_deleted': 'Movimentação excluída', 'finance.account_created': 'Conta criada', 'finance.account_updated': 'Conta alterada', 'finance.account_deleted': 'Conta excluída',
  'finance.budget_set': 'Limite definido', 'finance.recurring_created': 'Recorrência criada', 'finance.demo_loaded': 'Demonstração carregada', 'finance.demo_removed': 'Demonstração removida',
  'agent.action_approved': 'Você aprovou uma ação do assistente', 'privacy.export': 'Dados exportados', 'privacy.finance_deleted': 'Dados financeiros apagados',
};
const device = (ua: string) => {
  const os = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Aparelho';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${br} em ${os}`;
};

export function SecuritySettings() {
  const { user, logout } = useAuth();
  const { guard } = useReauth();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api.get<SessionInfo[]>('/auth/sessions') });
  const audit = useQuery({ queryKey: ['audit'], queryFn: () => api.get<AuditEntry[]>('/auth/audit') });
  const revoke = useAction((id: string) => api.del(`/auth/sessions/${id}`));
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [perr, setPerr] = useState<Error | null>(null);
  const change = useAction(() => api.post('/auth/password', { current: cur, next }), () => { setCur(''); setNext(''); setAgain(''); setMsg('Senha alterada. Os outros aparelhos foram desconectados.'); });
  const exp = useAction(() => guard(() => api.download('/privacy/export', `ninshiki-meus-dados-${new Date().toISOString().slice(0, 10)}.json`)));
  const [typed, setTyped] = useState('');
  const wipe = useAction(async () => guard(async () => { await fetch('/api/privacy/everything', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: typed }) }).then(async (r) => { if (!r.ok) throw new Error((await r.json()).error ?? 'Falha ao apagar.'); }); }), () => window.location.reload());

  function askDeleteFinance() {
    const t = prompt('Isto apaga TODAS as suas contas, movimentações, orçamentos, metas e recorrências. Não dá para desfazer.\n\nDigite EXCLUIR para confirmar:');
    if (t === null) return;
    void guard(async () => { const r = await fetch('/api/privacy/finance', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: t }) }); if (!r.ok) { const b = await r.json().catch(() => ({})); const e = new Error(b.error ?? 'Falha ao apagar.') as Error & { code?: string; status?: number }; e.code = b.code; throw Object.assign(e, { status: r.status }); } })
      .then(() => window.location.reload()).catch((e) => setMsg((e as Error).message));
  }

  return (
    <div className="settings-stack">
      <section className="panel">
        <h2>Sua conta</h2>
        <p className="muted">{user.name} · {user.email}</p>
        <div className="form-actions">
          <button className="btn" onClick={logout}>Sair deste aparelho</button>
          <button className="btn ghost" onClick={() => { localStorage.removeItem(TOUR_KEY); window.location.reload(); }}>Rever o tour guiado</button>
        </div>
      </section>

      <section className="panel">
        <h2>Dispositivos conectados</h2>
        <p className="muted">Se não reconhece algum, desconecte-o e troque a senha.</p>
        {sessions.isLoading && <p className="muted" role="status">Carregando…</p>}
        <ErrorText error={sessions.error ?? revoke.error} />
        <ul className="session-list">
          {(sessions.data ?? []).map((s) => (
            <li key={s.id}>
              <div><b>{device(s.userAgent)}</b>{s.current && <em className="chip ok">este aparelho</em>}<span>IP {s.ip || '—'} · ativo {fmt(new Date(s.lastSeenAt), "d MMM, HH:mm")} · entrou {fmt(new Date(s.createdAt), 'd MMM')}</span></div>
              {!s.current && <button className="btn small danger" disabled={revoke.isPending} onClick={() => revoke.mutate(s.id)}>Desconectar</button>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Trocar senha</h2>
        <form className="pw-form" onSubmit={(e) => { e.preventDefault(); setMsg(null); setPerr(null); if (next !== again) return setPerr(new Error('As senhas novas não são iguais.')); change.mutate(undefined); }}>
          <Field label="Senha atual"><input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></Field>
          <Field label="Nova senha (mínimo de 10 caracteres)"><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={10} required /></Field>
          <Field label="Repita a nova senha"><input type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" required /></Field>
          <ErrorText error={perr ?? change.error} />
          {msg && <p className="ok-note" role="status">{msg}</p>}
          <button className="btn primary" disabled={change.isPending}>Trocar senha</button>
        </form>
      </section>

      <section className="panel">
        <h2>Histórico de segurança</h2>
        <p className="muted">Registro do que aconteceu na sua conta. Nunca guarda senhas, tokens nem valores financeiros.</p>
        <ul className="audit-list">
          {(audit.data ?? []).slice(0, 25).map((a) => (
            <li key={a.id}><span>{ACTION[a.action] ?? a.action}</span><em>{fmt(new Date(a.createdAt), "d MMM, HH:mm")}</em></li>
          ))}
          {audit.data?.length === 0 && <li className="empty">Nada registrado ainda.</li>}
        </ul>
      </section>

      <section className="panel">
        <h2>Seus dados (LGPD)</h2>
        <p className="muted">Você pode levar seus dados ou apagá-los. Ambas as ações pedem sua senha de novo. Números de conta ficam criptografados no servidor e nenhuma senha bancária é solicitada ou guardada.</p>
        <div className="row-gap">
          <button className="btn" disabled={exp.isPending} onClick={() => exp.mutate(undefined)}>{exp.isPending ? 'Gerando…' : 'Exportar meus dados (JSON)'}</button>
          <button className="btn danger" onClick={askDeleteFinance}>Apagar dados financeiros</button>
        </div>
        <ErrorText error={exp.error} />
        <details className="danger-zone">
          <summary>Apagar tudo e reiniciar o Ninshiki</summary>
          <p>Remove usuário, rotina, agenda, kanban, documentos, conversas e finanças, e os arquivos enviados. Não dá para desfazer.</p>
          <Field label="Digite EXCLUIR TUDO para liberar o botão"><input value={typed} onChange={(e) => setTyped(e.target.value)} /></Field>
          <button className="btn danger" disabled={typed !== 'EXCLUIR TUDO' || wipe.isPending} onClick={() => wipe.mutate(undefined)}>Apagar tudo</button>
          <ErrorText error={wipe.error} />
        </details>
      </section>
    </div>
  );
}
