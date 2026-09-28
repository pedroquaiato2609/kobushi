import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, ActivityKind, DayPlan, Level } from '../api/types';
import { cap, fmt, ymd } from '../lib/dates';
import { KIND_GROUP, timeLabel } from '../lib/labels';
import { ActivityModal } from './ActivityModal';
import { Icon } from './Icon';
import { ErrorText, LevelPicker } from './ui';

/** Rotina do dia selecionado: registre o nível executado e gerencie as atividades. */
export function DayRoutine({ date }: { date: Date }) {
  const day = ymd(date);
  const plan = useQuery({ queryKey: ['day', day], queryFn: () => api.get<DayPlan>(`/day?date=${day}`) });
  const all = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const [editing, setEditing] = useState<Activity | 'new' | null>(null);

  const setLevel = useAction(async (v: { activityId: string; level: Level | null }) => {
    if (v.level) await api.put('/executions', { activityId: v.activityId, date: day, level: v.level });
    else await api.del(`/executions?activityId=${v.activityId}&date=${day}`);
  });

  const items = plan.data?.items ?? [];
  const registered = items.filter((i) => i.executionLevel).length;
  const inPlan = new Set(items.map((i) => i.id));
  const others = (all.data ?? []).filter((a) => !inPlan.has(a.id));
  const groups = (['obligation', 'goal', 'special'] as ActivityKind[])
    .map((kind) => ({ kind, list: items.filter((i) => i.kind === kind) }))
    .filter((g) => g.list.length > 0);

  return (
    <div className="routine-panel">
      <header className="routine-head">
        <div>
          <h2>{cap(fmt(date, "EEEE, d 'de' MMMM"))}</h2>
          <p className="muted small">{items.length ? `${registered} de ${items.length} registradas` : 'Nenhuma atividade neste dia'}</p>
        </div>
        <button className="btn small" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> Atividade</button>
      </header>
      {items.length > 0 && <p className="hint">Toque no nível que você cumpriu. O mínimo já mantém a continuidade; toque de novo para desfazer.</p>}

      {plan.isLoading && <p className="muted">Carregando…</p>}
      {!plan.isLoading && items.length === 0 && (
        <p className="empty">Crie a primeira atividade em “Atividade” para montar a sua rotina.</p>
      )}
      <ErrorText error={plan.error ?? setLevel.error} />

      {groups.map((g) => (
        <section key={g.kind} className="routine-group">
          <h3>{KIND_GROUP[g.kind]}</h3>
          <ul>
            {g.list.map((a) => (
              <li key={a.id} className={`routine-item${a.executionLevel ? ' done' : ''}`}>
                <div className="routine-line">
                  <strong>{a.name}</strong>
                  <span className="muted small">{timeLabel(a)}</span>
                  <button className="link" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}>Editar</button>
                </div>
                {a.principle && <p className="principle">{a.principle}</p>}
                <LevelPicker activity={a} value={a.executionLevel} onChange={(level) => setLevel.mutate({ activityId: a.id, level })} />
              </li>
            ))}
          </ul>
        </section>
      ))}

      {others.length > 0 && (
        <details className="routine-others">
          <summary>Fora deste dia ou arquivadas ({others.length})</summary>
          <ul>
            {others.map((a) => (
              <li key={a.id}>
                <span>{a.name} <span className="muted">{a.active ? 'não se aplica a este dia' : 'arquivada'}</span></span>
                <button className="link" onClick={() => setEditing(a)}>Editar</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {editing && <ActivityModal activity={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
