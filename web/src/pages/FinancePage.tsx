import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { FinAccount, FinCategory, FinGoal, FinOverview, FinRecurring, FinTransaction, Insight } from '../api/types';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { ConnectionsTab } from '../components/finance/ConnectionsTab';
import { InsightsTab } from '../components/finance/InsightsTab';
import { AccountModal, BudgetModal, CategoryModal, ContributeModal, GoalModal, PayInvoiceModal, RecurringModal, TransactionModal } from '../components/finance/modals';
import { OverviewTab } from '../components/finance/OverviewTab';
import { PlanningTab } from '../components/finance/PlanningTab';
import { RecurringTab } from '../components/finance/RecurringTab';
import { PrivacyCtx, StateBox } from '../components/finance/shared';
import { TransactionsTab, type TxFilters } from '../components/finance/TransactionsTab';
import { PageHeader } from '../components/PageHeader';
import { ErrorText } from '../components/ui';

type Tab = 'visao' | 'movimentacoes' | 'orcamentos' | 'recorrentes' | 'insights' | 'conexoes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'visao', label: 'Visão geral' }, { id: 'movimentacoes', label: 'Movimentações' }, { id: 'orcamentos', label: 'Orçamentos e metas' },
  { id: 'recorrentes', label: 'Recorrentes' }, { id: 'insights', label: 'Insights' }, { id: 'conexoes', label: 'Conexões' },
];
const HIDE_KEY = 'ninshiki.fin.hide';
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

type Modal =
  | { type: 'tx'; tx?: FinTransaction | null } | { type: 'account'; account?: FinAccount | null } | { type: 'pay'; card: FinAccount; cents: number }
  | { type: 'budget' } | { type: 'goal'; goal: FinGoal | null } | { type: 'contribute'; goal: FinGoal } | { type: 'recurring'; rec: FinRecurring | null; initialKind?: 'expense' | 'income' }
  | { type: 'category'; category: FinCategory | null };

export default function FinancePage() {
  const loc = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const params = new URLSearchParams((loc as { search?: string }).search ?? '');
  const tab = (TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'visao') as Tab;
  const [month, setMonth] = useState(params.get('month') ?? thisMonth());
  const [filters, setFilters] = useState<TxFilters>({ month: params.get('month') ?? thisMonth(), accountId: '', categoryId: params.get('category') ?? '', kind: '', status: '', q: params.get('q') ?? '', highlight: params.get('highlight') ?? undefined });
  const [modal, setModal] = useState<Modal | null>(null);
  const [hide, setHide] = useState(() => localStorage.getItem(HIDE_KEY) === '1');
  useEffect(() => { localStorage.setItem(HIDE_KEY, hide ? '1' : '0'); }, [hide]);
  // vindo de um insight ou de um atalho do chat: aplica os filtros da URL
  const search = (loc as { search?: string }).search ?? '';
  useEffect(() => {
    const p = new URLSearchParams(search);
    if (p.get('tab') === 'movimentacoes') setFilters((f) => ({ ...f, month: p.get('month') ?? f.month, categoryId: p.get('category') ?? '', q: p.get('q') ?? '', highlight: p.get('highlight') ?? undefined }));
  }, [search]);

  const overview = useQuery({ queryKey: ['fin-overview', month], queryFn: () => api.get<FinOverview>(`/finance/overview?month=${month}`) });
  const refs = useQuery({ queryKey: ['fin-refs'], queryFn: () => api.get<{ accounts: FinAccount[]; categories: FinCategory[] }>('/finance/refs') });
  const insights = useQuery({ queryKey: ['fin-insights'], queryFn: () => api.get<Insight[]>('/finance/insights'), enabled: tab === 'insights' });
  const recurring = useQuery({ queryKey: ['fin-recurring'], queryFn: () => api.get<FinRecurring[]>('/finance/recurring'), enabled: tab === 'recorrentes' });
  const demo = useAction(() => api.post('/finance/demo'));
  const purge = useAction(() => api.del('/finance/demo'));

  const data = overview.data;
  const accounts = data?.accounts ?? [];
  const categories = refs.data?.categories ?? [];
  const close = () => setModal(null);
  const go = (t: Tab) => navigate(`/financas?tab=${t}`);

  const body = () => {
    if (overview.isLoading || refs.isLoading) return <StateBox kind="loading" title="Carregando suas finanças…" />;
    if (overview.error || !data) return <StateBox kind="error" title="Não consegui carregar as finanças">{(overview.error as Error | undefined)?.message}<br /><button className="btn small" onClick={() => overview.refetch()}>Tentar de novo</button></StateBox>;
    if (tab === 'conexoes') return <ConnectionsTab />;
    if (accounts.length === 0) {
      return (
        <section className="panel fin-welcome">
          <Icon name="wallet" size={32} />
          <h2>Comece pela sua primeira conta</h2>
          <p>Cadastre uma conta ou cartão e registre suas movimentações — à mão ou pedindo ao assistente (“registre R$ 85 de combustível”). Você confirma tudo antes de gravar.</p>
          <p className="muted">Você também pode importar seus dados por Open Finance (somente leitura). Para conhecer as telas, dá para carregar dados de <b>demonstração</b> — eles ficam sempre identificados e podem ser removidos com um clique.</p>
          <div className="row-gap">
            <button className="btn primary" onClick={() => setModal({ type: 'account' })}><Icon name="plus" size={16} /> Criar minha primeira conta</button>
            <button className="btn" onClick={() => go('conexoes')}><Icon name="shield" size={16} /> Conectar uma instituição (Open Finance)</button>
            <button className="btn" disabled={demo.isPending} onClick={() => demo.mutate(undefined)}>{demo.isPending ? 'Carregando…' : 'Explorar com dados de demonstração'}</button>
          </div>
          <ErrorText error={demo.error} />
        </section>
      );
    }
    switch (tab) {
      case 'movimentacoes':
        return <TransactionsTab accounts={accounts} categories={categories} filters={filters} setFilters={setFilters} onEditTx={(tx) => setModal({ type: 'tx', tx })} onNewAccount={() => setModal({ type: 'account' })} onEditAccount={(account) => setModal({ type: 'account', account })} onPay={(card, cents) => setModal({ type: 'pay', card, cents })} />;
      case 'orcamentos':
        return <PlanningTab budgets={data.budgets} goals={data.goals} categories={categories} onBudget={() => setModal({ type: 'budget' })} onGoal={(goal) => setModal({ type: 'goal', goal })} onContribute={(goal) => setModal({ type: 'contribute', goal })} onCategory={(category) => setModal({ type: 'category', category })} />;
      case 'recorrentes':
        return <RecurringTab items={recurring.data} loading={recurring.isLoading} error={recurring.error} onEdit={(rec, kind) => setModal({ type: 'recurring', rec, initialKind: kind })} />;
      case 'insights':
        return <InsightsTab insights={insights.data} loading={insights.isLoading} error={insights.error} />;
      default:
        return <OverviewTab data={data} month={month} setMonth={setMonth} categories={categories} onPayInvoice={(id, cents) => { const card = accounts.find((a) => a.id === id); if (card) setModal({ type: 'pay', card, cents }); }} />;
    }
  };

  return (
    <PrivacyCtx.Provider value={hide}>
      <div className="page finance">
        <PageHeader title="Finanças" subtitle="Contas, cartões, gastos e metas em um só lugar — você confirma tudo o que é gravado.">
          <button className="btn ghost" aria-pressed={hide} onClick={() => setHide((h) => !h)} title="Esconde os valores na tela" aria-label={hide ? 'Mostrar valores' : 'Ocultar valores'}>
            <Icon name={hide ? 'eyeOff' : 'eye'} size={16} /> <span className="hide-label">{hide ? 'Mostrar valores' : 'Ocultar valores'}</span>
          </button>
          {accounts.length > 0 && <button className="btn primary" onClick={() => setModal({ type: 'tx' })}><Icon name="plus" size={16} /> Nova movimentação</button>}
        </PageHeader>

        {data?.hasDemo && (
          <div className="demo-banner" role="status">
            <Icon name="alert" size={18} />
            <p><b>Dados de demonstração.</b> Os valores abaixo (itens marcados com DEMO) são fictícios e não vêm de nenhum banco.</p>
            <button className="btn small" disabled={purge.isPending} onClick={async () => { if (await confirm('Remover todos os dados de demonstração? Seus dados reais não são afetados.')) purge.mutate(undefined); }}>Remover demonstração</button>
          </div>
        )}

        {(accounts.length > 0 || tab === 'conexoes') && (
          <div className="tabs inline" role="tablist">
            {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>{t.label}{t.id === 'insights' && data && data.insightCount > 0 ? <span className="tab-count">{data.insightCount}</span> : null}</button>)}
          </div>
        )}

        {body()}
      </div>

      {modal?.type === 'tx' && <TransactionModal tx={modal.tx} accounts={accounts} categories={categories} onClose={close} />}
      {modal?.type === 'account' && <AccountModal account={modal.account} onClose={close} />}
      {modal?.type === 'pay' && <PayInvoiceModal card={modal.card} accounts={accounts} amountCents={modal.cents} onClose={close} />}
      {modal?.type === 'budget' && <BudgetModal categories={categories} taken={(data?.budgets ?? []).map((b) => b.budget.categoryId)} onClose={close} />}
      {modal?.type === 'goal' && <GoalModal goal={modal.goal} onClose={close} />}
      {modal?.type === 'contribute' && <ContributeModal goal={modal.goal} onClose={close} />}
      {modal?.type === 'recurring' && <RecurringModal rec={modal.rec} accounts={accounts} categories={categories} initialKind={modal.initialKind} onClose={close} />}
      {modal?.type === 'category' && <CategoryModal category={modal.category} categories={categories} onClose={close} />}
    </PrivacyCtx.Provider>
  );
}
