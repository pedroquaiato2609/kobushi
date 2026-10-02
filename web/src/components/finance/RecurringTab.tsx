import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { FinRecurring } from '../../api/types';
import { Icon } from '../Icon';
import { DemoChip, dm, Money, StateBox } from './shared';

const FREQ = { weekly: 'toda semana', monthly: 'todo mês', yearly: 'todo ano' } as const;
const USAGE = { often: 'Uso bastante', sometimes: 'Uso às vezes', rarely: 'Quase não uso' } as const;
// líquido de desconto (se houver) — é o que de fato entra/sai da conta
const netCents = (r: FinRecurring) => (r.discountPct ? Math.round(r.amountCents * (1 - r.discountPct / 100)) : r.amountCents);
const monthly = (r: FinRecurring) => { const net = netCents(r); return r.frequency === 'monthly' ? net : r.frequency === 'weekly' ? Math.round((net * 52) / 12) : Math.round(net / 12); };

function Row({ r, onEdit, usage, toggle }: { r: FinRecurring; onEdit: (r: FinRecurring) => void; usage: ReturnType<typeof useAction<{ id: string; usage: FinRecurring['usage'] }, unknown>>; toggle: ReturnType<typeof useAction<FinRecurring, unknown>> }) {
  return (
    <li className={r.active ? '' : 'off'}>
      <button className="rec-main" onClick={() => onEdit(r)}>
        <b>{r.description} <DemoChip source={r.source} />{r.isSubscription && <em className="chip">assinatura</em>}{r.discountPct ? <em className="chip discount">{r.discountPct}% off</em> : null}</b>
        <span>{FREQ[r.frequency]} · próximo em {dm(r.nextDue)}/{r.nextDue.slice(0, 4)}{r.remindDaysBefore !== null ? ` · avisa ${r.remindDaysBefore}d antes` : ''}</span>
      </button>
      {r.isSubscription && (
        <select aria-label={`Uso de ${r.description}`} value={r.usage ?? ''} onChange={(e) => usage.mutate({ id: r.id, usage: (e.target.value || null) as FinRecurring['usage'] })}>
          <option value="">Uso: não informado</option>
          {Object.entries(USAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      )}
      <Money cents={r.kind === 'income' ? netCents(r) : -netCents(r)} className={r.kind === 'income' ? 'pos' : ''} />
      <button className="btn small ghost" onClick={() => toggle.mutate(r)}>{r.active ? 'Pausar' : 'Reativar'}</button>
    </li>
  );
}

export function RecurringTab({ items, loading, error, onEdit }: { items: FinRecurring[] | undefined; loading: boolean; error: unknown; onEdit: (r: FinRecurring | null, kind?: 'expense' | 'income') => void }) {
  const usage = useAction((v: { id: string; usage: FinRecurring['usage'] }) => api.patch(`/finance/recurring/${v.id}`, { usage: v.usage }));
  const toggle = useAction((r: FinRecurring) => api.patch(`/finance/recurring/${r.id}`, { active: !r.active }));
  if (loading) return <StateBox kind="loading" title="Carregando…" />;
  if (error) return <StateBox kind="error" title="Não consegui carregar">{(error as Error).message}</StateBox>;
  const list = items ?? [];
  const incomes = list.filter((r) => r.kind === 'income');
  const expenses = list.filter((r) => r.kind === 'expense');
  const incomeTotal = incomes.filter((r) => r.active).reduce((n, r) => n + monthly(r), 0);
  const total = expenses.filter((r) => r.active).reduce((n, r) => n + monthly(r), 0);
  const subs = expenses.filter((r) => r.isSubscription && r.active).reduce((n, r) => n + monthly(r), 0);
  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <div><h2>Minha renda</h2><p className="muted small">Salário e outras entradas fixas: <Money cents={incomeTotal} />/mês previstos.</p></div>
          <button className="btn small" onClick={() => onEdit(null, 'income')}><Icon name="plus" size={14} /> Nova renda</button>
        </div>
        {incomes.length === 0 ? (
          <StateBox kind="empty" title="Nenhuma renda cadastrada">Cadastre seu salário (ou outra entrada fixa, tipo freela ou aluguel recebido) pra acompanhar sua renda prevista, confirmar quando cair na conta e ver quanto da sua renda já está comprometido em Finanças &gt; Visão geral.</StateBox>
        ) : (
          <ul className="rec-list">{incomes.map((r) => <Row key={r.id} r={r} onEdit={onEdit} usage={usage} toggle={toggle} />)}</ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>Recorrências e assinaturas</h2><p className="muted small">Gastos fixos: <Money cents={total} />/mês, dos quais assinaturas: <Money cents={subs} />/mês.</p></div>
          <button className="btn small" onClick={() => onEdit(null, 'expense')}><Icon name="plus" size={14} /> Nova</button>
        </div>
        {expenses.length === 0 ? <StateBox kind="empty" title="Nada cadastrado">Cadastre o que se repete (aluguel, internet, assinaturas) para o Ninshiki prever vencimentos, avisar antes e notar cobranças que somem ou duplicam.</StateBox> : (
          <>
            <p className="hint">O Ninshiki não consegue medir o quanto você usa cada assinatura: o campo “uso” é o que <b>você</b> informa.</p>
            <ul className="rec-list">{expenses.map((r) => <Row key={r.id} r={r} onEdit={onEdit} usage={usage} toggle={toggle} />)}</ul>
          </>
        )}
      </section>
    </>
  );
}
