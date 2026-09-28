import { createContext, useContext, useState, type ReactNode } from 'react';
import { Modal } from './ui';

type ConfirmOpts = { confirmLabel?: string; danger?: boolean };
type ConfirmFn = (message: string, opts?: ConfirmOpts) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);
/** Substitui o confirm() nativo do navegador por um popup do próprio app, no mesmo visual dos outros modais. */
export const useConfirm = () => { const v = useContext(ConfirmCtx); if (!v) throw new Error('useConfirm fora do ConfirmProvider'); return v; };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ message: string; opts: ConfirmOpts; resolve: (ok: boolean) => void } | null>(null);

  const confirm: ConfirmFn = (message, opts = {}) => new Promise((resolve) => setState({ message, opts, resolve }));
  const close = (ok: boolean) => { state?.resolve(ok); setState(null); };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title="Confirmar" onClose={() => close(false)} onSubmit={() => close(true)}
          footer={<>
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={() => close(false)}>Cancelar</button>
            <button type="submit" className={`btn ${state.opts.danger === false ? 'primary' : 'danger'}`} autoFocus>{state.opts.confirmLabel ?? 'Apagar'}</button>
          </>}>
          <p>{state.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
