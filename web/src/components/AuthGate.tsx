import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api/client';
import type { AuthStatus, AuthUser } from '../api/types';
import { Logo } from './Logo';
import { ErrorText, Field, Modal } from './ui';

interface AuthValue { user: AuthUser; logout: () => Promise<void> }
const AuthCtx = createContext<AuthValue | null>(null);
export const useAuth = () => { const v = useContext(AuthCtx); if (!v) throw new Error('useAuth fora do AuthGate'); return v; };

/** Tela de entrada (ou de primeiro acesso). Nada do app é carregado enquanto não houver sessão. */
function AuthScreen({ needsSetup, onDone }: { needsSetup: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsSetup && password !== confirm) return setError(new Error('As senhas não são iguais.'));
    setBusy(true);
    try {
      if (needsSetup) await api.post('/auth/setup', { name, email, password });
      else await api.post('/auth/login', { email, password });
      onDone();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={submit} aria-label={needsSetup ? 'Criar acesso' : 'Entrar'}>
        <Logo size={76} animate className="auth-logo" />
        <h1>{needsSetup ? 'Crie seu acesso' : 'Entrar no Ninshiki'}</h1>
        <p className="muted">
          {needsSetup
            ? 'Este é o primeiro acesso. Como o Ninshiki guarda sua rotina e suas finanças, tudo fica atrás de uma senha. Só você poderá entrar.'
            : 'Seus dados ficam protegidos por senha neste servidor.'}
        </p>
        {needsSetup && <Field label="Seu nome"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required /></Field>}
        <Field label="E-mail"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus /></Field>
        <Field label={needsSetup ? 'Senha (mínimo de 10 caracteres)' : 'Senha'}>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsSetup ? 'new-password' : 'current-password'} required minLength={needsSetup ? 10 : undefined} />
        </Field>
        {needsSetup && <Field label="Repita a senha"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required /></Field>}
        <ErrorText error={error} />
        <button className="btn primary block" disabled={busy}>{busy ? 'Aguarde…' : needsSetup ? 'Criar acesso' : 'Entrar'}</button>
        {needsSetup && <p className="hint">Dica: uma frase longa é mais segura (e mais fácil de lembrar) que uma senha curta cheia de símbolos.</p>}
      </form>
    </div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api.get<AuthStatus>('/auth/status') });

  // Sessão expirada ou revogada em outro aparelho: volta para a tela de entrada sem deixar dados na memória.
  useEffect(() => {
    const onLost = () => { qc.clear(); status.refetch(); };
    window.addEventListener('ninshiki:unauthenticated', onLost);
    return () => window.removeEventListener('ninshiki:unauthenticated', onLost);
  });

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear(); // dados financeiros não ficam na memória do navegador depois de sair
    await status.refetch();
  }, [qc, status]);

  if (status.isLoading) return <div className="auth-screen"><p className="muted" role="status">Carregando…</p></div>;
  if (status.error && !(status.error instanceof ApiError && status.error.status === 401)) {
    return <div className="auth-screen"><div className="auth-card"><h1>Sem conexão com o servidor</h1><p className="muted">{(status.error as Error).message}</p><button className="btn" onClick={() => status.refetch()}>Tentar de novo</button></div></div>;
  }
  if (!status.data?.user) {
    return <AuthScreen needsSetup={status.data?.needsSetup ?? false} onDone={async () => { await status.refetch(); }} />;
  }
  return <AuthCtx.Provider value={{ user: status.data.user, logout }}>{children}</AuthCtx.Provider>;
}

// ---- confirmação de senha para ações críticas (exportar, apagar, revogar conexões…)
const ReauthCtx = createContext<{ guard: <T>(fn: () => Promise<T>) => Promise<T> } | null>(null);
export const useReauth = () => { const v = useContext(ReauthCtx); if (!v) throw new Error('useReauth fora do ReauthProvider'); return v; };

export function ReauthProvider({ children }: { children: ReactNode }) {
  const [waiting, setWaiting] = useState<{ resolve: (ok: boolean) => void } | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  /** Executa a ação; se o servidor pedir a senha de novo, pergunta e tenta outra vez. */
  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'reauth_required') throw e;
      const ok = await new Promise<boolean>((resolve) => setWaiting({ resolve }));
      if (!ok) throw new Error('Ação cancelada.');
      return fn();
    }
  }, []);

  const close = (ok: boolean) => { waiting?.resolve(ok); setWaiting(null); setPassword(''); setError(null); };
  async function confirm() {
    setBusy(true); setError(null);
    try { await api.post('/auth/reauth', { password }); close(true); } catch (e) { setError(e); } finally { setBusy(false); }
  }

  return (
    <ReauthCtx.Provider value={{ guard }}>
      {children}
      {waiting && (
        <Modal title="Confirme sua senha" onClose={() => close(false)} onSubmit={confirm}
          footer={<><button className="btn primary" disabled={busy || !password}>Confirmar</button><button type="button" className="btn ghost" onClick={() => close(false)}>Cancelar</button></>}>
          <p className="muted">Esta ação é sensível. Por segurança, digite a senha da sua conta. A confirmação vale por 5 minutos.</p>
          <Field label="Senha"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus /></Field>
          <ErrorText error={error} />
        </Modal>
      )}
    </ReauthCtx.Provider>
  );
}
