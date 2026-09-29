import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, Commute } from '../api/types';
import { CommuteModal } from '../components/CommuteModal';
import { useConfirm } from '../components/ConfirmProvider';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { ErrorText } from '../components/ui';
import { DIRECTION_LABEL } from '../lib/labels';

/** Deslocamentos: trechos de transporte recorrentes (ida/volta), com duração aproximada, encaixados no horário de uma atividade já cadastrada. */
export default function CommutesPage() {
  const confirm = useConfirm();
  const commutes = useQuery({ queryKey: ['commutes'], queryFn: () => api.get<Commute[]>('/commutes') });
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const [editing, setEditing] = useState<Commute | 'new' | null>(null);
  const remove = useAction((id: string) => api.del(`/commutes/${id}`));

  const byId = new Map((activities.data ?? []).map((a) => [a.id, a]));
  const list = commutes.data ?? [];

  return (
    <div className="page">
      <PageHeader title="Deslocamentos" subtitle="Trechos de transporte recorrentes (ex.: ida e volta da academia), com duração aproximada, encaixados no horário de uma atividade já cadastrada.">
        <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Novo deslocamento</button>
      </PageHeader>

      <ErrorText error={commutes.error ?? activities.error ?? remove.error} />
      {!commutes.isLoading && list.length === 0 && (
        <div className="panel empty-block">
          <p>Nenhum deslocamento cadastrado.</p>
          <p className="hint">Um deslocamento precisa de uma atividade com horário definido para se ancorar (ex.: crie a atividade "Academia" com horário definido, depois "Ida à academia" e "Volta da academia" aqui).</p>
          {(activities.data ?? []).filter((a) => a.timeMode === 'fixed').length > 0 && (
            <button className="btn primary" onClick={() => setEditing('new')}>Criar o primeiro deslocamento</button>
          )}
        </div>
      )}

      <section className="rem-group">
        <ul>
          {list.map((c) => {
            const act = byId.get(c.activityId);
            return (
              <li key={c.id} className={`rem-row k-activity${c.active ? '' : ' done'}`}>
                <span className="rem-time"><Icon name="car" size={22} /></span>
                <div className="rem-main">
                  <b>{c.name}</b>
                  <span className="muted small">
                    {DIRECTION_LABEL[c.direction]} · {act?.name ?? '(atividade removida)'} · {c.durationMin} min
                    {!c.active ? ' · pausado' : ''}
                  </span>
                </div>
                <span className="tag k-activity">Deslocamento</span>
                <div className="rem-actions">
                  <button className="btn small" onClick={() => setEditing(c)}>Editar</button>
                  <button className="icon-btn" aria-label={`Apagar ${c.name}`} onClick={async () => { if (await confirm(`Apagar "${c.name}"?`)) remove.mutate(c.id); }}><Icon name="trash" size={16} /></button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {editing && <CommuteModal commute={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
