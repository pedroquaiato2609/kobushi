import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { BudgetStatus, FinCategory, FinGoal } from '../../api/types';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { DemoChip, Money, StateBox, dm } from './shared';

const STATE_TEXT = { ok: 'Dentro do limite', risk: 'Em risco de estourar', exceeded: 'Estourado' } as const;

export function PlanningTab({ budgets, goals, categories, onBudget, onGoal, onContribute }: {
  budgets: BudgetStatus[]; goals: FinGoal[]; categories: FinCategory[]; onBudget: () => void; onGoal: (g: FinGoal | null) => void; onContribute: (g: FinGoal) => void;
}) {
  const confirm = useConfirm();
  const [notice, setNotice] = useState<string | null>(null);
  const delBudget = useAction((id: string) => api.del(`/finance/budgets/${id}`));
  const kanban = useAction((id: string) => api.post(`/finance/goals/${id}/kanban`), () => setNotice('Card criado no Kanban, na primeira coluna do quadro.'));
  void categories;
  return (
    <div className="plan-grid">
      <section className="panel">
        <div className="panel-head"><h2>Limites mensais</h2><button className="btn small" onClick={onBudget}><Icon name="plus" size={14} /> Novo limite</button></div>
        {budgets.length === 0 ? <StateBox kind="empty" title="Nenhum limite definido">Defina quanto quer gastar por mês em uma categoria (ex.: R$ 600 em lazer). Você também pode pedir ao assistente.</StateBox> : (
          <ul className="budget-list big">
            {budgets.map((b) => (
              <li key={b.budget.id}>
                <div className="budget-top">
                  <b><i className="cat-dot" style={{ background: b.color }} />{b.name}</b>
                  <span><Money cents={b.spentCents} /> de <Money cents={b.budget.limitCents} /> · {b.pct}%</span>
                </div>
                <div className={`bar-track ${b.state}`} role="progressbar" aria-valuenow={Math.min(100, b.pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.name}: ${b.pct}% do limite`}><i style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
                <div className="budget-foot">
                  <span className={`state-text ${b.state}`}>{STATE_TEXT[b.state]}</span>
                  {b.state !== 'exceeded' && <span className="muted">no ritmo atual: <Money cents={b.projectedCents} /> no fim do mês</span>}
                  <button className="icon-btn" aria-label={`Excluir limite de ${b.name}`} onClick={async () => { if (await confirm(`Excluir o limite de ${b.name}?`)) delBudget.mutate(b.budget.id); }}><Icon name="trash" size={15} /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Metas de economia</h2><button className="btn small" onClick={() => onGoal(null)}><Icon name="plus" size={14} /> Nova meta</button></div>
        {notice && <p className="ok-note" role="status">{notice}</p>}
        {goals.length === 0 ? <StateBox kind="empty" title="Nenhuma meta ainda">Uma meta acompanha quanto falta para chegar ao valor que você quer juntar.</StateBox> : (
          <ul className="goal-list">
            {goals.map((g) => {
              const pct = Math.min(100, Math.round((g.currentCents / g.targetCents) * 100));
              return (
                <li key={g.id}>
                  <div className="budget-top"><b>{g.name} <DemoChip source={g.source} /></b><span>{pct}%</span></div>
                  <div className="bar-track goal" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.name}: ${pct}%`}><i style={{ width: `${pct}%` }} /></div>
                  <div className="budget-foot">
                    <span><Money cents={g.currentCents} /> de <Money cents={g.targetCents} />{g.deadline ? ` · até ${dm(g.deadline)}/${g.deadline.slice(0, 4)}` : ''}</span>
                    <span className="goal-actions">
                      <button className="btn small" onClick={() => onContribute(g)}>Guardar</button>
                      {!g.kanbanCardId && <button className="btn small ghost" disabled={kanban.isPending} onClick={() => kanban.mutate(g.id)} title="Cria um card com o prazo da meta no Kanban"><Icon name="kanban" size={14} /> Kanban</button>}
                      <button className="icon-btn" aria-label={`Editar ${g.name}`} onClick={() => onGoal(g)}><Icon name="edit" size={15} /></button>
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <span className="muted">{kanban.error ? (kanban.error as Error).message : ''}</span>
      </section>
    </div>
  );
}
