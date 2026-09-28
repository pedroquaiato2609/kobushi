import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAction } from '../api/hooks';
import type { Activity, ActivityKind, ActivityMatrix, ActivityMatrixRow, DayPlan, Level } from '../api/types';
import { ActivityModal } from '../components/ActivityModal';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { ErrorText, LevelPicker, Modal } from '../components/ui';
import { cap, fmt, parseYmd, ymd } from '../lib/dates';
import { CHANNEL_LABEL, KIND_LABEL, LEVEL_LABEL, WEEKDAY_SHORT, timeLabel } from '../lib/labels';

type Filter = 'all' | ActivityKind;
const FILTERS: [Filter, string][] = [['all', 'Todas'], ['obligation', 'Obrigações'], ['goal', 'Objetivos'], ['special', 'Meditação']];

/** Faixa dos últimos dias: uma célula por dia, colorida pelo nível executado. */
function Heat({ row, big = false }: { row: ActivityMatrixRow; big?: boolean }) {
  const today = ymd(new Date());
  const lead = big ? parseYmd(row.cells[0].date).getDay() : 0; // no modo grande, alinha a primeira semana ao dia da semana
  return (
    <div className={big ? 'heat big' : 'heat'} role="img" aria-label={`Histórico de ${row.name}`}>
      {Array.from({ length: lead }, (_, i) => <i key={`pad${i}`} className="pad" />)}
      {row.cells.map((c) => {
        const state = !c.applicable ? 'na' : c.level ?? (c.date === today ? 'todo' : 'missed');
        const label = !c.applicable ? 'não se aplica' : c.level ? LEVEL_LABEL[c.level] : c.date === today ? 'a fazer hoje' : 'sem registro';
        return <i key={c.date} className={`${state}${c.date === today ? ' now' : ''}`} title={`${fmt(parseYmd(c.date), 'd MMM')}: ${label}`} />;
      })}
    </div>
  );
}

function Weekdays({ days }: { days: number[] }) {
  return (
    <span className="wk" aria-label={`Dias: ${days.map((d) => WEEKDAY_SHORT[d]).join(', ')}`}>
      {WEEKDAY_SHORT.map((w, d) => <i key={d} className={days.includes(d) ? 'on' : ''} aria-hidden="true">{w[0]}</i>)}
    </span>
  );
}

const LevelRows = ({ a }: { a: Activity }) => (
  <dl className="act-levels">
    {(['min', 'ideal', 'max'] as Level[]).map((l) => (
      <div key={l} className={`lv lv-${l}`}><dt>{LEVEL_LABEL[l]}</dt><dd>{(l === 'min' ? a.minDesc : l === 'ideal' ? a.idealDesc : a.maxDesc) || '—'}</dd></div>
    ))}
  </dl>
);

export default function ActivitiesPage() {
  const activities = useQuery({ queryKey: ['activities'], queryFn: () => api.get<Activity[]>('/activities') });
  const matrix = useQuery({ queryKey: ['activity-matrix', 28], queryFn: () => api.get<ActivityMatrix>('/activities/overview?days=28') });
  const today = ymd(new Date());
  const plan = useQuery({ queryKey: ['day', today], queryFn: () => api.get<DayPlan>(`/day?date=${today}`) });

  const [filter, setFilter] = useState<Filter>('all');
  const [archived, setArchived] = useState(false);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Activity | 'new' | null>(null);
  const [detail, setDetail] = useState<Activity | null>(null);

  const setLevel = useAction(async (v: { activityId: string; level: Level | null }) => {
    if (v.level) await api.put('/executions', { activityId: v.activityId, date: today, level: v.level });
    else await api.del(`/executions?activityId=${v.activityId}&date=${today}`);
  });

  const rows = useMemo(() => new Map((matrix.data?.rows ?? []).map((r) => [r.activityId, r] as const)), [matrix.data]);
  const todayLevel = useMemo(() => new Map((plan.data?.items ?? []).map((i) => [i.id, i.executionLevel] as const)), [plan.data]);

  const all = activities.data ?? [];
  const list = all
    .filter((a) => (archived ? true : a.active))
    .filter((a) => filter === 'all' || a.kind === filter)
    .filter((a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase()));

  const active = all.filter((a) => a.active);
  const withReminder = active.filter((a) => a.remindTime).length;
  const best = [...rows.values()].sort((a, b) => b.streak - a.streak)[0];
  const doneToday = (plan.data?.items ?? []).filter((i) => i.executionLevel).length;

  return (
    <div className="page">
      <PageHeader title="Atividades" subtitle="Tudo o que compõe a sua rotina: níveis, princípios, lembretes e a sua constância dia a dia.">
        <button className="btn primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Nova atividade</button>
      </PageHeader>

      <div className="stat-tiles">
        <div className="tile"><b>{active.length}</b><span>ativas</span></div>
        <div className="tile"><b>{plan.data ? `${doneToday}/${plan.data.items.length}` : '—'}</b><span>registradas hoje</span></div>
        <div className="tile"><b>{best ? best.streak : '—'}</b><span>{best && best.streak > 0 ? `dias seguidos · ${best.name}` : 'maior sequência'}</span></div>
        <div className="tile"><b>{withReminder}</b><span>com lembrete</span></div>
      </div>

      <div className="toolbar">
        <div className="btn-group" role="group" aria-label="Filtrar por tipo">
          {FILTERS.map(([k, label]) => <button key={k} className="btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>)}
        </div>
        <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar atividade" aria-label="Buscar atividade" /></label>
        <label className="check inline"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Mostrar arquivadas</label>
      </div>

      <ErrorText error={activities.error ?? matrix.error ?? setLevel.error} />
      {!activities.isLoading && list.length === 0 && (
        <div className="panel empty-block">
          <p>{all.length === 0 ? 'Você ainda não tem atividades.' : 'Nenhuma atividade com esse filtro.'}</p>
          {all.length === 0 && <button className="btn primary" onClick={() => setEditing('new')}>Criar a primeira atividade</button>}
        </div>
      )}

      <div className="act-grid">
        {list.map((a) => {
          const row = rows.get(a.id);
          const appliesToday = todayLevel.has(a.id);
          return (
            <article key={a.id} className={`act-card kind-${a.kind}${a.active ? '' : ' archived'}`}>
              <header>
                <div>
                  <h3>{a.name}</h3>
                  <span className="muted small">{timeLabel(a)}</span>
                </div>
                <div className="act-tags">
                  <span className={`tag k-${a.kind}`}>{KIND_LABEL[a.kind].split(' (')[0]}</span>
                  {!a.active && <span className="tag">Arquivada</span>}
                </div>
              </header>

              <Weekdays days={a.weekdays} />
              {a.purpose && <p className="act-purpose">{a.purpose}</p>}
              {a.principle && <p className="principle">{a.principle}</p>}
              <LevelRows a={a} />

              {row && (
                <div className="act-hist">
                  <Heat row={row} />
                  <p className="muted small">
                    <b>{row.streak}</b> {row.streak === 1 ? 'dia seguido' : 'dias seguidos'} · {row.counts.min + row.counts.ideal + row.counts.max} registros em 28 dias
                  </p>
                </div>
              )}

              {a.remindTime && (
                <p className="act-remind"><Icon name="bell" size={14} /> Aviso às {a.remindTime}{a.remindChannels.length ? ` · ${a.remindChannels.map((c) => CHANNEL_LABEL[c]).join(', ')}` : ''}</p>
              )}

              {a.active && appliesToday && (
                <div className="act-today">
                  <span className="muted small">Hoje</span>
                  <LevelPicker activity={a} value={todayLevel.get(a.id) ?? null} onChange={(level) => setLevel.mutate({ activityId: a.id, level })} />
                </div>
              )}

              <footer>
                <button className="btn small" onClick={() => setDetail(a)}>Detalhes</button>
                <button className="btn small" onClick={() => setEditing(a)}>Editar</button>
              </footer>
            </article>
          );
        })}
      </div>

      {detail && <ActivityDetail activity={detail} onClose={() => setDetail(null)} onEdit={() => { setEditing(detail); setDetail(null); }} />}
      {editing && <ActivityModal activity={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

/** Histórico de ~13 semanas, contagens e tudo o que define a atividade. */
function ActivityDetail({ activity: a, onClose, onEdit }: { activity: Activity; onClose: () => void; onEdit: () => void }) {
  const long = useQuery({ queryKey: ['activity-matrix', 91], queryFn: () => api.get<ActivityMatrix>('/activities/overview?days=91') });
  const row = long.data?.rows.find((r) => r.activityId === a.id);
  return (
    <Modal title={a.name} onClose={onClose} footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Fechar</button><button type="button" className="btn primary" onClick={onEdit}>Editar</button></>}>
      <p className="muted">{cap(KIND_LABEL[a.kind])} · {timeLabel(a)}</p>
      <Weekdays days={a.weekdays} />
      {a.purpose && <p className="act-purpose">{a.purpose}</p>}
      {a.principle && <p className="principle">{a.principle}</p>}
      <LevelRows a={a} />
      {long.isLoading && <p className="muted">Carregando histórico…</p>}
      {row && (
        <>
          <div className="stat-tiles small">
            <div className="tile"><b>{row.streak}</b><span>dias seguidos</span></div>
            <div className="tile lv-min"><b>{row.counts.min}</b><span>mínimo</span></div>
            <div className="tile lv-ideal"><b>{row.counts.ideal}</b><span>ideal</span></div>
            <div className="tile lv-max"><b>{row.counts.max}</b><span>máximo</span></div>
          </div>
          <Heat row={row} big />
          <p className="hint">Últimos 91 dias. O mínimo conta como continuidade; dias sem registro não são fracasso — são informação para ajustar a rotina.</p>
        </>
      )}
    </Modal>
  );
}
