import { useEffect, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Activity, Level } from '../api/types';
import { LEVELS, LEVEL_LABEL } from '../lib/labels';

// Pilha dos modais abertos no momento: com um modal dentro de outro (confirmar exclusão, inserir link),
// Esc deve fechar só o de cima, não todos de uma vez.
let modalStack: object[] = [];

/**
 * Diálogo em formulário: Enter envia, Esc fecha. Botões que não enviam devem ter type="button".
 * Sempre via portal pro <body>: alguns fluxos abrem um modal a partir de dentro de outro (confirmar
 * exclusão, inserir link no editor) — sem o portal, o <form> deste modal ficaria aninhado dentro do
 * <form> do modal de fora, o que é HTML inválido e o navegador "conserta" de um jeito imprevisível.
 */
export function Modal({ title, onClose, onSubmit, children, footer, wide = false }: {
  title: string; onClose: () => void; onSubmit?: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    const token = {};
    modalStack.push(token);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === token) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); modalStack = modalStack.filter((t) => t !== token); };
  }, [onClose]);

  // stopPropagation é essencial aqui: eventos de um portal ainda "borbulham" pela árvore React (não pelo
  // DOM) até modais que o envolvem logicamente — sem isso, submeter um modal aninhado (ex.: inserir link
  // dentro da nota) também submetia o modal de fora, salvando e fechando os dois de uma vez.
  const submit = (e: FormEvent) => { e.preventDefault(); e.stopPropagation(); onSubmit?.(); };
  return createPortal(
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </form>
    </div>,
    document.body,
  );
}

export function Field({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={`field ${className}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return <p className="error" role="alert">{(error as Error).message}</p>;
}

/** Seletor de nível (mínimo / ideal / máximo). Tocar no nível já marcado desfaz o registro. */
export function LevelPicker({ activity, value, onChange }: {
  activity: Pick<Activity, 'minDesc' | 'idealDesc' | 'maxDesc'>; value: Level | null; onChange: (level: Level | null) => void;
}) {
  const desc: Record<Level, string> = { min: activity.minDesc, ideal: activity.idealDesc, max: activity.maxDesc };
  return (
    <div className="levels" role="group" aria-label="Nível executado">
      {LEVELS.map((l) => (
        <button
          key={l} type="button" className={`level level-${l}`} aria-pressed={value === l}
          title={desc[l] || LEVEL_LABEL[l]} onClick={() => onChange(value === l ? null : l)}
        >
          <span className="level-name">{LEVEL_LABEL[l]}</span>
          {desc[l] && <span className="level-desc">{desc[l]}</span>}
        </button>
      ))}
    </div>
  );
}
