import { createContext, useContext, type ReactNode } from 'react';
import type { AccountKind, FinCategory } from '../../api/types';
import { brl } from '../../lib/money';

// "Modo privacidade": esconde valores na tela (útil em público). Fica só neste navegador.
export const PrivacyCtx = createContext(false);
export function Money({ cents, sign = false, className = '' }: { cents: number; sign?: boolean; className?: string }) {
  const hide = useContext(PrivacyCtx);
  if (hide) return <span className={`money hidden-value ${className}`} aria-label="valor oculto">R$ ••••</span>;
  const text = brl(Math.abs(cents));
  const prefix = sign ? (cents > 0 ? '+ ' : cents < 0 ? '− ' : '') : cents < 0 ? '− ' : '';
  return <span className={`money ${className}`}>{prefix}{text}</span>;
}

export const ACCOUNT_KIND: Record<AccountKind, string> = { checking: 'Conta corrente', digital: 'Conta digital', savings: 'Reserva / poupança', cash: 'Dinheiro', credit_card: 'Cartão de crédito' };
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
export const monthTitle = (m: string) => { const t = monthLabel(m); return t.charAt(0).toUpperCase() + t.slice(1); };
export const monthShort = (m: string) => MONTHS[Number(m.slice(5, 7)) - 1].slice(0, 3);
export const shiftMonth = (m: string, n: number) => { const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
export const dm = (date: string) => `${date.slice(8)}/${date.slice(5, 7)}`;
export const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const dayHeading = (date: string) => `${WEEKDAY[new Date(`${date}T12:00:00`).getDay()]}, ${dm(date)}`;

/** Categorias agrupadas por categoria-mãe. */
export function CategorySelect({ categories, kind, value, onChange, allowNone = true, noneLabel = 'Sem categoria' }: {
  categories: FinCategory[]; kind?: 'expense' | 'income'; value: string; onChange: (v: string) => void; allowNone?: boolean; noneLabel?: string;
}) {
  const list = categories.filter((c) => !kind || c.kind === kind);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">{noneLabel}</option>}
      {list.filter((c) => !c.parentId).map((p) => {
        const kids = list.filter((c) => c.parentId === p.id);
        return kids.length ? (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name} (geral)</option>
            {kids.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </optgroup>
        ) : <option key={p.id} value={p.id}>{p.name}</option>;
      })}
    </select>
  );
}

export const catName = (cats: FinCategory[], id: string | null) => {
  const c = cats.find((x) => x.id === id);
  if (!c) return 'Sem categoria';
  const p = c.parentId ? cats.find((x) => x.id === c.parentId) : null;
  return p ? `${p.name} › ${c.name}` : c.name;
};
export const catColor = (cats: FinCategory[], id: string | null) => {
  const c = cats.find((x) => x.id === id);
  const top = c?.parentId ? cats.find((x) => x.id === c.parentId) ?? c : c;
  return top?.color ?? '#6b7391';
};

export function DemoChip({ source }: { source?: string }) {
  return source === 'demo' ? <span className="chip demo" title="Dado de demonstração: não é real">DEMO</span> : null;
}

export function StateBox({ kind, title, children }: { kind: 'loading' | 'error' | 'empty'; title?: string; children?: ReactNode }) {
  return (
    <div className={`state-box ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {kind === 'loading' && <span className="spinner" aria-hidden />}
      {title && <b>{title}</b>}
      {children && <p>{children}</p>}
    </div>
  );
}
