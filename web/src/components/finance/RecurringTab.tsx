import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { FinRecurring } from '../../api/types';
import { Icon } from '../Icon';
import { DemoChip, dm, Money, StateBox } from './shared';

const FREQ = { weekly: 'toda semana', monthly: 'todo mês', yearly: 'todo ano' } as const;
const USAGE = { often: 'Uso bastante', sometimes: 'Uso às vezes', rarely: 'Quase não uso' } as const;
const monthly = (r: FinRecurring) => (r.frequency === 'monthly' ? r.amountCents : r.frequency === 'weekly' ? Math.round((r.amountCents * 52) / 12) : Math.round(r.amountCents / 12));

export function RecurringTab({ items, loading, error, onEdit }: { items: FinRecurring[] | undefined; loading: boolean; error: unknown; onEdit: (r: FinRecurring | null) => void }) {
  const usage = useAction((v: { id: string; usage: FinRecurring['usage'] }) => api.patch(`/finance/recurring/${v.id}`, { usage: v.usage }));
  const toggle = useAction((r: FinRecurring) => api.patch(`/finance/recurring/${r.id}`, { active: !r.active }));
  if (loading) return <StateBox kind="loading" title="Carregando…" />;
  if (error) return <StateBox kind="error" title="Não consegui carregar">{(error as Error).message}</StateBox>;
  const list = items ?? [];
  const total = list.filter((r) => r.active && r.kind === 'expense').reduce((n, r) => n + monthly(r), 0);
  const subs = list.filter((r) => r.isSubscription && r.active).reduce((n, r) => n + monthly(r), 0);
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>Recorrências e assinaturas</h2><p className="muted small">Gastos fixos: <Money cents={total} />/mês, dos quais assinaturas: <Money cents={subs} />/mês.</p></div>
        <button className="btn small" onClick={() => onEdit(null)}><Icon name="plus" size={14} /> Nova</button>
      </div>
      {list.length === 0 ? <StateBox kind="empty" title="Nada cadastrado">Cadastre o que se repete (aluguel, internet, assinaturas) para o Ninshiki prever vencimentos, avisar antes e notar cobranças que somem ou duplicam.</StateBox> : (
        <>
          <p className="hint">O Ninshiki não consegue medir o quanto você usa cada assinatura: o campo “uso” é o que <b>você</b> informa.</p>
          <ul className="rec-list">
            {list.map((r) => (
              <li key={r.id} className={r.active ? '' : 'off'}>
                <button className="rec-main" onClick={() => onEdit(r)}>
                  <b>{r.description} <DemoChip source={r.source} />{r.isSubscription && <em className="chip">assinatura</em>}</b>
                  <span>{FREQ[r.frequency]} · próximo em {dm(r.nextDue)}/{r.nextDue.slice(0, 4)}{r.remindDaysBefore !== null ? ` · avisa ${r.remindDaysBefore}d antes` : ''}</span>
                </button>
                {r.isSubscription && (
                  <select aria-label={`Uso de ${r.description}`} value={r.usage ?? ''} onChange={(e) => usage.mutate({ id: r.id, usage: (e.target.value || null) as FinRecurring['usage'] })}>
                    <option value="">Uso: não informado</option>
                    {Object.entries(USAGE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                )}
                <Money cents={r.kind === 'income' ? r.amountCents : -r.amountCents} className={r.kind === 'income' ? 'pos' : ''} />
                <button className="btn small ghost" onClick={() => toggle.mutate(r)}>{r.active ? 'Pausar' : 'Reativar'}</button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
