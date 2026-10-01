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

// ---- detecção automática de categoria a partir da descrição/estabelecimento -----------------
// Heurística por palavra-chave (não é IA): serve de ponto de partida, o usuário sempre pode trocar.
// Cada dica tenta "names" em ordem (subcategoria primeiro, depois a categoria-mãe) e usa a primeira
// que existir de fato na lista do usuário — assim funciona mesmo que ele tenha renomeado/apagado uma.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const hasWord = (haystack: string, word: string) => ` ${haystack} `.includes(` ${norm(word)} `);

interface CatHint { kind: 'expense' | 'income'; names: string[]; words: string[] }
const CATEGORY_HINTS: CatHint[] = [
  { kind: 'expense', names: ['Delivery', 'Alimentação'], words: ['ifood', 'rappi', 'uber eats', 'delivery'] },
  { kind: 'expense', names: ['Mercado', 'Alimentação'], words: ['mercado', 'supermercado', 'hortifruti', 'atacadao', 'carrefour', 'pao de acucar', 'assai', 'sacolao'] },
  { kind: 'expense', names: ['Restaurantes', 'Alimentação'], words: ['restaurante', 'lanchonete', 'padaria', 'pizzaria', 'churrascaria', 'cafeteria', 'cafe', 'lanche', 'bar', 'boteco'] },
  { kind: 'expense', names: ['Aplicativos', 'Transporte'], words: ['uber', '99pop', '99 taxi', 'taxi', 'cabify', 'indriver'] },
  { kind: 'expense', names: ['Combustível', 'Transporte'], words: ['posto', 'gasolina', 'combustivel', 'etanol', 'alcool', 'shell', 'ipiranga', 'petrobras', 'br mania'] },
  { kind: 'expense', names: ['Transporte público', 'Transporte'], words: ['metro', 'onibus', 'bilhete unico', 'trem', 'cptm', 'brt'] },
  { kind: 'expense', names: ['Farmácia', 'Saúde'], words: ['farmacia', 'drogaria', 'droga raia', 'drogasil', 'pacheco'] },
  { kind: 'expense', names: ['Consultas e exames', 'Saúde'], words: ['consulta', 'exame', 'clinica', 'hospital', 'laboratorio', 'dentista', 'medico', 'psicologo'] },
  { kind: 'expense', names: ['Aluguel e financiamento', 'Moradia'], words: ['aluguel', 'financiamento', 'imobiliaria'] },
  { kind: 'expense', names: ['Contas da casa', 'Moradia'], words: ['energia', 'luz', 'agua', 'condominio', 'internet', 'telefone', 'enel', 'sabesp', 'cemig', 'vivo', 'claro', 'net', 'gas de cozinha', 'copel', 'light'] },
  { kind: 'expense', names: ['Manutenção', 'Moradia'], words: ['reforma', 'manutencao', 'encanador', 'eletricista', 'chaveiro', 'diarista'] },
  { kind: 'expense', names: ['Viagens', 'Lazer'], words: ['hotel', 'pousada', 'airbnb', 'passagem', 'latam', 'booking', 'decolar', 'hostel'] },
  { kind: 'expense', names: ['Passeios', 'Lazer'], words: ['cinema', 'show', 'ingresso', 'parque', 'teatro', 'balada'] },
  { kind: 'expense', names: ['Educação'], words: ['curso', 'faculdade', 'escola', 'udemy', 'mensalidade', 'alura'] },
  { kind: 'expense', names: ['Assinaturas'], words: ['netflix', 'spotify', 'amazon prime', 'disney plus', 'hbo max', 'youtube premium', 'icloud', 'assinatura', 'deezer'] },
  { kind: 'expense', names: ['Compras'], words: ['shopping', 'magazine luiza', 'amazon', 'mercado livre', 'shopee', 'americanas', 'aliexpress', 'loja'] },
  { kind: 'expense', names: ['Impostos e taxas'], words: ['imposto', 'iptu', 'ipva', 'tarifa', 'darf', 'taxa'] },
  { kind: 'income', names: ['Salário'], words: ['salario', 'holerite', 'folha de pagamento'] },
  { kind: 'income', names: ['Rendimentos'], words: ['rendimento', 'dividendo', 'juros', 'cdb', 'tesouro direto'] },
  { kind: 'income', names: ['Outras receitas'], words: ['reembolso', 'venda', 'estorno'] },
];

/** Tenta adivinhar a categoria a partir da descrição/estabelecimento; null = não achou nada parecido. */
export function suggestCategoryId(text: string, categories: FinCategory[], kind: 'expense' | 'income'): string | null {
  const hay = norm(text);
  if (!hay) return null;
  for (const hint of CATEGORY_HINTS) {
    if (hint.kind !== kind || !hint.words.some((w) => hasWord(hay, w))) continue;
    for (const name of hint.names) {
      const c = categories.find((x) => x.kind === kind && norm(x.name) === norm(name));
      if (c) return c.id;
    }
  }
  return null;
}

export const CATEGORY_PALETTE = ['#F2B84B', '#5B8CFF', '#34C38F', '#E5657A', '#A78BFA', '#22B8CF', '#F08C5A', '#7C6CF0', '#8C94AD', '#FF6B9D', '#4ADE80', '#6B7391'];

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
