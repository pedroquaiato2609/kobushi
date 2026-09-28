import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../api/client';
import type { FinAccount, FinCategory, FinTransaction } from '../../api/types';
import { Icon } from '../Icon';
import { ACCOUNT_KIND, catColor, CategorySelect, catName, dayHeading, DemoChip, dm, Money, StateBox } from './shared';

export interface TxFilters { month: string; accountId: string; categoryId: string; kind: string; status: string; q: string; highlight?: string }

function AccountCard({ a, onEdit, onPay }: { a: FinAccount; onEdit: () => void; onPay: (cents: number) => void }) {
  const inv = a.invoices;
  const due = inv?.closed && inv.closed.remainingCents > 0 ? inv.closed : null;
  return (
    <article className={`acct-card kind-${a.kind}`}>
      <button className="acct-main" onClick={onEdit} aria-label={`Editar ${a.name}`}>
        <span className="acct-kind">{ACCOUNT_KIND[a.kind]}{a.numberMask ? ` · ${a.numberMask}` : ''} <DemoChip source={a.source} />{a.source === 'import' && <span className="chip ok" title="Importada por Open Finance">importada</span>}</span>
        <b className="acct-name">{a.name}</b>
        <Money cents={a.balanceCents ?? 0} className="acct-balance" />
        {a.providerBalanceCents !== null && a.providerBalanceCents !== undefined && a.providerBalanceCents !== a.balanceCents ? <span className="acct-sub warn" title="O saldo informado pela instituição difere do calculado (movimentações ainda não importadas ou pendentes).">saldo no banco: <Money cents={a.providerBalanceCents} /></span> : null}
        {a.pendingCents ? <span className="acct-sub">previsto: <Money cents={(a.balanceCents ?? 0) + a.pendingCents} /></span> : null}
      </button>
      {inv && (
        <div className="acct-invoice">
          <span>Fatura aberta <Money cents={inv.open.totalCents} /> · fecha {dm(inv.open.end)}</span>
          {a.creditLimitCents ? <span>Limite <Money cents={a.creditLimitCents} /></span> : null}
          {due ? <button className="btn small" onClick={() => onPay(due.remainingCents)}>Pagar fatura <Money cents={due.remainingCents} /> · vence {dm(due.due)}</button> : <span className="muted">Nenhuma fatura fechada a pagar</span>}
        </div>
      )}
    </article>
  );
}

export function TransactionsTab({ accounts, categories, filters, setFilters, onEditTx, onNewAccount, onEditAccount, onPay }: {
  accounts: FinAccount[]; categories: FinCategory[]; filters: TxFilters; setFilters: (f: TxFilters) => void;
  onEditTx: (t: FinTransaction) => void; onNewAccount: () => void; onEditAccount: (a: FinAccount) => void; onPay: (card: FinAccount, cents: number) => void;
}) {
  const [showAccounts, setShowAccounts] = useState(true);
  const qs = new URLSearchParams();
  if (filters.month) qs.set('month', filters.month);
  if (filters.accountId) qs.set('accountId', filters.accountId);
  if (filters.categoryId) qs.set('categoryId', filters.categoryId);
  if (filters.kind) qs.set('kind', filters.kind);
  if (filters.status) qs.set('status', filters.status);
  if (filters.q) qs.set('q', filters.q);
  const txs = useQuery({ queryKey: ['fin-tx', qs.toString()], queryFn: () => api.get<FinTransaction[]>(`/finance/transactions?${qs}`) });
  const set = (patch: Partial<TxFilters>) => setFilters({ ...filters, ...patch, highlight: undefined });

  const list = txs.data ?? [];
  const groups = [...new Set(list.map((t) => t.occurredOn))].map((date) => ({ date, items: list.filter((t) => t.occurredOn === date) }));
  const income = list.filter((t) => t.kind === 'income' && t.status === 'confirmed').reduce((n, t) => n + t.amountCents, 0);
  const expense = list.filter((t) => t.kind === 'expense' && t.status === 'confirmed').reduce((n, t) => n + t.amountCents, 0);
  const accName = (id: string | null) => accounts.find((a) => a.id === id)?.name ?? '—';

  return (
    <div className="tx-tab">
      <section>
        <div className="panel-head">
          <h2>Contas e cartões</h2>
          <div className="head-actions">
            <button className="btn small ghost" onClick={() => setShowAccounts((v) => !v)} aria-expanded={showAccounts}>{showAccounts ? 'Recolher' : 'Mostrar'}</button>
            <button className="btn small" onClick={onNewAccount}><Icon name="plus" size={14} /> Nova conta</button>
          </div>
        </div>
        {showAccounts && (
          <div className="acct-strip">
            {accounts.map((a) => <AccountCard key={a.id} a={a} onEdit={() => onEditAccount(a)} onPay={(c) => onPay(a, c)} />)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="tx-filters" role="search">
          <input type="month" aria-label="Mês" value={filters.month} onChange={(e) => set({ month: e.target.value })} />
          <select aria-label="Conta" value={filters.accountId} onChange={(e) => set({ accountId: e.target.value })}><option value="">Todas as contas</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <CategorySelect categories={categories} value={filters.categoryId} onChange={(v) => set({ categoryId: v })} noneLabel="Todas as categorias" />
          <select aria-label="Tipo" value={filters.kind} onChange={(e) => set({ kind: e.target.value })}><option value="">Todos os tipos</option><option value="expense">Despesas</option><option value="income">Receitas</option><option value="transfer">Transferências</option></select>
          <select aria-label="Situação" value={filters.status} onChange={(e) => set({ status: e.target.value })}><option value="">Todas</option><option value="confirmed">Confirmadas</option><option value="pending">Pendentes</option></select>
          <input type="search" placeholder="Buscar…" aria-label="Buscar" value={filters.q} onChange={(e) => set({ q: e.target.value })} />
        </div>

        {txs.isLoading && <StateBox kind="loading" title="Carregando movimentações…" />}
        {txs.error ? <StateBox kind="error" title="Não consegui carregar as movimentações">{(txs.error as Error).message}</StateBox> : null}
        {!txs.isLoading && !txs.error && list.length === 0 && <StateBox kind="empty" title="Nenhuma movimentação encontrada">Ajuste os filtros ou registre uma nova movimentação.</StateBox>}

        {groups.map((g) => (
          <div key={g.date} className="tx-day">
            <h3>{dayHeading(g.date)}</h3>
            <ul>
              {g.items.map((t) => (
                <li key={t.id} className={filters.highlight === t.id ? 'highlight' : ''}>
                  <button className="tx-row" onClick={() => onEditTx(t)}>
                    <i className="tx-dot" style={{ background: t.kind === 'transfer' ? '#5b9dff' : catColor(categories, t.categoryId) }} />
                    <span className="tx-main">
                      <b>{t.description || t.merchant || (t.kind === 'transfer' ? 'Transferência' : 'Sem descrição')}</b>
                      <span>{t.kind === 'transfer' ? `${accName(t.accountId)} → ${accName(t.transferAccountId)}` : `${catName(categories, t.categoryId)} · ${accName(t.accountId)}`}</span>
                    </span>
                    {t.status === 'pending' && <em className="chip pend">pendente</em>}
                    <DemoChip source={t.source} />
                    <Money cents={t.kind === 'income' ? t.amountCents : t.kind === 'expense' ? -t.amountCents : t.amountCents} sign={t.kind !== 'transfer'} className={t.kind === 'income' ? 'pos' : t.kind === 'transfer' ? 'neutral' : ''} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {list.length > 0 && <footer className="tx-total"><span>{list.length} movimentação(ões)</span><span>Receitas <Money cents={income} className="pos" /></span><span>Despesas <Money cents={-expense} /></span></footer>}
      </section>
    </div>
  );
}
