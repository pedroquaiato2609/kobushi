import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { FinCategory, FinOverview, Upcoming } from '../../api/types';
import { Icon } from '../Icon';
import { CashFlowChart, Donut, PatrimonyChart } from './charts';
import { InsightCard } from './InsightsTab';
import { dm, Money, monthLabel, monthTitle, shiftMonth } from './shared';

const delta = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null);

function Tile({ label, children, sub, tone }: { label: string; children: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' }) {
  return <div className={`fin-tile${tone ? ` ${tone}` : ''}`}><span className="tile-label">{label}</span><b className="tile-value">{children}</b>{sub && <span className="tile-sub">{sub}</span>}</div>;
}

export function OverviewTab({ data, month, setMonth, categories, onPayInvoice }: {
  data: FinOverview; month: string; setMonth: (m: string) => void; categories: FinCategory[]; onPayInvoice: (accountId: string, cents: number) => void;
}) {
  const navigate = useNavigate();
  const s = data.summary;
  const expDelta = delta(s.expenseCents, data.previousSummary.expenseCents);
  const paid = useAction((id: string) => api.patch(`/finance/transactions/${id}`, { status: 'confirmed' }));
  const agenda = useAction((id: string) => api.post(`/finance/transactions/${id}/agenda`));
  const slices = s.byCategory.slice(0, 6);
  const rest = s.byCategory.slice(6).reduce((n, c) => n + c.cents, 0);
  const donut = [...slices.map((c) => ({ name: c.name, cents: c.cents, color: c.color })), ...(rest ? [{ name: 'Outras', cents: rest, color: '#5a6180' }] : [])];
  const isCurrent = month === data.today.slice(0, 7);

  const row = (u: Upcoming) => (
    <li key={u.key} className={u.overdue ? 'overdue' : ''}>
      <span className="due-date">{dm(u.date)}</span>
      <div className="due-main"><b>{u.title}</b><span>{u.kind === 'invoice' ? 'Fatura de cartão' : u.kind === 'recurring' ? 'Recorrente' : u.direction === 'in' ? 'A receber' : 'A pagar'}{u.overdue && <em className="chip late">atrasado</em>}</span></div>
      <Money cents={u.direction === 'in' ? u.cents : -u.cents} className={u.direction === 'in' ? 'pos' : ''} />
      <span className="due-actions">
        {u.kind === 'bill' && <>
          <button className="btn small ghost" title="Marcar como paga/recebida" disabled={paid.isPending} onClick={() => paid.mutate(u.refId)}><Icon name="check" size={14} /> {u.direction === 'in' ? 'Recebida' : 'Paga'}</button>
          {u.direction === 'out' && <button className="btn small ghost" title="Criar evento na agenda" disabled={agenda.isPending} onClick={() => agenda.mutate(u.refId)}><Icon name="calendar" size={14} /> Agenda</button>}
        </>}
        {u.kind === 'invoice' && <button className="btn small" onClick={() => onPayInvoice(u.refId, u.cents)}>Pagar</button>}
      </span>
    </li>
  );

  return (
    <div className="fin-page">
      <div className="fin-tiles">
        <Tile label="Saldo em contas" sub={<>Patrimônio líquido <Money cents={data.totals.netCents} />{data.totals.cardDebtCents < 0 && <> · cartões <Money cents={data.totals.cardDebtCents} /></>}</>}><Money cents={data.totals.liquidCents} /></Tile>
        <Tile label={`Receitas · ${monthLabel(month)}`} sub={s.pendingIncomeCents > 0 ? <>+ <Money cents={s.pendingIncomeCents} /> a receber</> : 'confirmadas'} tone="good"><Money cents={s.incomeCents} /></Tile>
        <Tile label="Despesas no mês" sub={<>{expDelta !== null ? `${expDelta >= 0 ? '+' : '−'}${Math.abs(expDelta)}% vs. mês anterior` : 'sem mês anterior para comparar'}{s.pendingExpenseCents > 0 && <> · <Money cents={s.pendingExpenseCents} /> a pagar</>}</>}><Money cents={s.expenseCents} /></Tile>
        <Tile label="Resultado do mês" sub="receitas − despesas confirmadas" tone={s.netCents >= 0 ? 'good' : 'bad'}><Money cents={s.netCents} sign /></Tile>
        {data.commitment.incomeCents > 0 && (
          <Tile label="Gastos fixos (recorrências + faturas)" sub={<>{data.commitment.pct}% do seu {data.commitment.basis === 'salary' ? 'salário' : 'renda média'} (<Money cents={data.commitment.incomeCents} />)</>} tone={data.commitment.pct >= 90 ? 'bad' : data.commitment.pct < 50 ? 'good' : undefined}>
            <Money cents={data.commitment.committedCents} />
          </Tile>
        )}
      </div>

      <div className="fin-cols">
      <div className="fin-col">
      <section className="panel">
        <div className="panel-head"><h2>Receitas e despesas</h2><div className="month-nav">
          <button className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="left" size={16} /></button>
          <b>{monthTitle(month)}</b>
          <button className="icon-btn" aria-label="Próximo mês" disabled={isCurrent} onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="right" size={16} /></button>
        </div></div>
        <CashFlowChart data={data.cashFlow} />
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Evolução do patrimônio</h2></div>
        <PatrimonyChart data={data.patrimony} />
      </section>

      {data.commitment.incomeCents > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Renda comprometida</h2><button className="btn small ghost" onClick={() => navigate('/financas?tab=recorrentes')}>Ver recorrências</button></div>
          <div className="budget-top"><b>Gastos fixos + faturas a pagar</b><span><Money cents={data.commitment.committedCents} /> de <Money cents={data.commitment.incomeCents} /> · {data.commitment.pct}%</span></div>
          <div className={`bar-track ${data.commitment.pct >= 90 ? 'exceeded' : data.commitment.pct >= 70 ? 'risk' : 'ok'}`} role="progressbar" aria-valuenow={Math.min(100, data.commitment.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Renda comprometida: ${data.commitment.pct}%`}>
            <i style={{ width: `${Math.min(100, data.commitment.pct)}%` }} />
          </div>
          <p className="muted small">{data.commitment.basis === 'salary' ? 'Salário cadastrado (em "Minha renda")' : 'Renda média (últimos meses com receita)'}: <Money cents={data.commitment.incomeCents} /> · Gastos fixos por mês: <Money cents={data.commitment.fixedCents} />{data.commitment.invoicesCents > 0 && <> · Faturas fechadas a pagar: <Money cents={data.commitment.invoicesCents} /></>}</p>
        </section>
      )}

      {data.insights.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Insights</h2><button className="btn small ghost" onClick={() => navigate('/financas?tab=insights')}>Ver todos ({data.insightCount})</button></div>
          <div className="insight-grid">{data.insights.slice(0, 3).map((i) => <InsightCard key={i.key} insight={i} compact />)}</div>
        </section>
      )}
      </div>
      <div className="fin-col">
      <section className="panel">
        <div className="panel-head"><h2>Gastos por categoria</h2></div>
        {s.byCategory.length === 0 ? <p className="empty">Sem despesas confirmadas em {monthLabel(month)}.</p> : (
          <div className="cat-block">
            <Donut slices={donut} total={s.expenseCents} />
            <ul className="cat-list">
              {donut.map((c) => (
                <li key={c.name}>
                  <button onClick={() => { const cat = categories.find((x) => x.name === c.name && !x.parentId); navigate(`/financas?tab=movimentacoes&month=${month}${cat ? `&category=${cat.id}` : ''}`); }}>
                    <i style={{ background: c.color }} /><span>{c.name}</span><Money cents={c.cents} /><em>{Math.round((c.cents / s.expenseCents) * 100)}%</em>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>


      <section className="panel">
        <div className="panel-head"><h2>Próximos vencimentos</h2></div>
        {data.upcoming.length === 0 ? <p className="empty">Nada a pagar ou receber nos próximos 30 dias.</p> : <ul className="due-list">{data.upcoming.slice(0, 8).map(row)}</ul>}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Orçamentos</h2><button className="btn small ghost" onClick={() => navigate('/financas?tab=orcamentos')}>Ver todos</button></div>
        {data.budgets.length === 0 ? <p className="empty">Nenhum limite mensal definido. Crie um em “Orçamentos e metas” ou peça ao assistente.</p> : (
          <ul className="budget-list">
            {data.budgets.slice(0, 4).map((b) => (
              <li key={b.budget.id}>
                <div className="budget-top"><b>{b.name}</b><span><Money cents={b.spentCents} /> de <Money cents={b.budget.limitCents} /></span></div>
                <div className={`bar-track ${b.state}`} role="progressbar" aria-valuenow={Math.min(100, b.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name}: ${b.pct}% do limite`}><i style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>

          </div>
      </div>
    </div>
  );
}
