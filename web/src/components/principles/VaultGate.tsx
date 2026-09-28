import { useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { VaultStatus } from '../../api/types';
import { Icon } from '../Icon';
import { ErrorText, Field } from '../ui';

/**
 * Bloqueia a aba inteira atrás da senha do Cofre (a mesma de Configurações > Perfil > Cofre).
 * Sem cofre configurado ainda, orienta a criar por lá primeiro — não duplica a tela de setup aqui.
 */
export function VaultGate({ vault, children }: { vault: VaultStatus; children: ReactNode }) {
  const [password, setPassword] = useState('');
  const unlock = useAction((p: string) => api.post('/vault/unlock', { password: p }), () => setPassword(''));

  if (!vault.configured) {
    return (
      <div className="gx-empty-card">
        <Icon name="lock" size={28} />
        <h3>O Cofre ainda não foi configurado</h3>
        <p>Princípios usam a mesma senha do Cofre. Configure uma senha em Configurações → Perfil → Cofre, depois volte aqui.</p>
      </div>
    );
  }
  if (!vault.unlocked) {
    return (
      <div className="gx-empty-card vault-gate">
        <Icon name="lock" size={28} />
        <h3>Protegido pela senha do Cofre</h3>
        <p>Digite a senha do Cofre para ver e organizar seus princípios.</p>
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); unlock.mutate(password); }}>
          <Field label="Senha do Cofre"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required /></Field>
          <button type="submit" className="btn primary" disabled={unlock.isPending || !password}>Desbloquear</button>
        </form>
        <ErrorText error={unlock.error} />
      </div>
    );
  }
  return <>{children}</>;
}
