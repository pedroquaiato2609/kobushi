import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { authApi, loadStoredToken, setToken, setUnauthenticatedHandler, type MeUser } from '../api/client';
import { registerForPushNotifications, unregisterPushNotifications } from '../lib/notifications';

interface AuthApi {
  user: MeUser | null;
  booting: boolean; // ainda checando se já tem sessão salva no aparelho
  busy: boolean; // login em andamento
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthCtx = createContext<AuthApi | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeUser | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearSession = useCallback(async () => {
    setUser(null);
    await setToken(null);
  }, []);

  useEffect(() => {
    setUnauthenticatedHandler(() => { void clearSession(); });
    (async () => {
      const t = await loadStoredToken();
      if (t) {
        try {
          setUser((await authApi.status()).user);
          void registerForPushNotifications(); // não bloqueia o boot — se falhar, só fica sem push
        } catch { await clearSession(); }
      }
      setBooting(false);
    })();
    return () => setUnauthenticatedHandler(null);
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    setBusy(true); setError(null);
    try {
      const out = await authApi.login(email, password);
      await setToken(out.token);
      setUser(out.user);
      void registerForPushNotifications(); // idem: não atrasa o login nem quebra ele se der errado
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não consegui entrar.');
      throw e;
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await unregisterPushNotifications();
    try { await authApi.logout(); } catch { /* mesmo se a chamada falhar, limpa local */ }
    await clearSession();
  }, [clearSession]);

  return <AuthCtx.Provider value={{ user, booting, busy, error, login, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return ctx;
}
