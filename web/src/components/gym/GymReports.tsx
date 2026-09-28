import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../api/client';
import type { GymOverview, GymRecord, GymSessionView } from '../../api/types';
import { askAssistant } from '../../lib/chatPrompt';
import { fmtDate, fmtDateFull, fmtDuration, fmtKg, fmtNum, fmtVolume } from '../../lib/gym';
import { MUSCLE_LABEL, MUSCLE_ZONE, type Zone } from '../../lib/muscles';
import { Icon } from '../Icon';
import { ExerciseDetail } from './ExerciseLibrary';
import { MuscleMap } from './MuscleMap';
import { ExerciseThumb, LevelTag } from './shared';

/** 0% (acabou de treinar) → vermelho; 100% (recuperado) → verde. */
const heat = (pct: number) => `hsl(${Math.round(pct * 1.15)} 62% 48%)`;

function Kpi({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return <div className="gx-kpi"><b>{value}</b><span>{label}</span>{hint && <small>{hint}</small>}</div>;
}

function SessionRow({ v }: { v: GymSessionView }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="gx-srow">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="gx-srow-date">{fmtDate(v.session.startedAt.slice(0, 10))}</span>
        <span className="gx-srow-main"><b>{v.session.name}</b><small>{fmtDuration(v.durationSeconds)} · {v.totalSets} séries · {fmtVolume(v.volume)}</small></span>
        <span className="gx-srow-tags"><LevelTag level={v.session.level} />{v.prs > 0 && <span className="pr-badge">🏆 {v.prs}</span>}{!v.session.endedAt && <span className="gx-badge">em andamento</span>}</span>
      </button>
      {open && (
        <ul className="gx-srow-detail">
          {v.exercises.map((e) => <li key={e.exercise.id}><b>{e.exercise.name}</b><span>{e.sets.map((s) => `${s.reps}×${fmtNum(s.weight)}${s.isPr ? '🏆' : ''}`).join(' · ')} kg</span></li>)}
          {v.session.note && <li className="hint">📝 {v.session.note}</li>}
        </ul>
      )}
    </li>
  );
}

/** Aba Relatórios: recuperação muscular, volume, recordes (PR) por exercício e histórico de treinos. */
export function GymReports() {
  const navigate = useNavigate();
  const overview = useQuery({ queryKey: ['gym', 'overview'], queryFn: () => api.get<GymOverview>('/gym/overview') });
  const records = useQuery({ queryKey: ['gym', 'records'], queryFn: () => api.get<GymRecord[]>('/gym/records') });
  const [count, setCount] = useState(10);
  const sessions = useQuery({ queryKey: ['gym', 'sessions', count], queryFn: () => api.get<GymSessionView[]>(`/gym/sessions?limit=${count}`) });
  const [open, setOpen] = useState<GymRecord['exercise'] | null>(null);
  const [q, setQ] = useState('');

  const o = overview.data;
  // O mapa desenha 13 regiões, não os 28 músculos específicos: cada região usa o pior caso (menor recuperação) entre
  // os músculos que ela contém, para nunca sugerir "descansado" numa região com um músculo recém-treinado.
  const zoneFills: Partial<Record<Zone, string>> = {};
  if (o) {
    const worst: Partial<Record<Zone, number>> = {};
    for (const r of o.recovery) { const z = MUSCLE_ZONE[r.muscle]; if (worst[z] === undefined || r.recoveryPct < worst[z]!) worst[z] = r.recoveryPct; }
    for (const [z, pct] of Object.entries(worst)) zoneFills[z as Zone] = heat(pct as number);
  }
  const recs = (records.data ?? []).filter((r) => r.exercise.name.toLowerCase().includes(q.trim().toLowerCase()));
  const maxVol = Math.max(1, ...(o?.muscleVolume.map((m) => m.volume) ?? [1]));

  return (
    <div className="gx-reports">
      <div className="gx-toolbar">
        <button type="button" className="btn" onClick={() => askAssistant(navigate, 'Analise minha evolução na academia: cargas, recordes, frequência e recuperação muscular. Diga o que está progredindo, o que está parado e o que treinar hoje. Use as ferramentas da academia.')}><Icon name="sparkles" size={16} /> Análise da IA</button>
      </div>

      {o && (
        <div className="gx-kpis">
          <Kpi value={o.daysSinceLast === null ? '—' : String(o.daysSinceLast)} label="dias desde o último treino" />
          <Kpi value={`${o.freshMuscles}/${o.recovery.length}`} label="grupos musculares descansados" />
          <Kpi value={String(o.sessionsLast30)} label="treinos em 30 dias" />
        </div>
      )}

      <section className="panel gx-recovery">
        <div className="panel-head"><h2>Recuperação muscular</h2></div>
        {o ? (
          <div className="gx-recovery-body">
            <MuscleMap fills={zoneFills} view="both" className="gx-recovery-map" />
            <ul className="gx-recovery-list">
              {[...o.recovery].sort((a, b) => a.recoveryPct - b.recoveryPct).map((r) => (
                <li key={r.muscle}>
                  <span className="gx-dot" style={{ background: heat(r.recoveryPct) }} />
                  <b>{MUSCLE_LABEL[r.muscle]}</b>
                  <span>{r.hoursSince === null ? 'nunca treinado' : r.ready ? 'descansado' : `${r.recoveryPct}% · treinou há ${r.hoursSince < 48 ? `${r.hoursSince} h` : `${Math.round(r.hoursSince / 24)} dias`}`}</span>
                </li>
              ))}
              <li className="hint">Vermelho = treinado há pouco · verde = recuperado (cerca de 72 h). É uma estimativa, não uma regra: ouça o corpo.</li>
            </ul>
          </div>
        ) : <p className="hint">Carregando…</p>}
      </section>

      <div className="gx-two">
        <section className="panel">
          <div className="panel-head"><h2>Volume por semana</h2></div>
          {o && o.weekly.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={o.weekly.map((w) => ({ ...w, label: fmtDate(w.week) }))} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="rgba(140,148,173,0.15)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#8c94ad', fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#8c94ad', fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}t` : String(v))} />
                <Tooltip cursor={{ fill: 'rgba(124,108,240,0.12)' }} contentStyle={{ background: '#151a28', border: '1px solid #2d3650', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [fmtVolume(v), 'Volume']} labelFormatter={(l) => `Semana de ${l}`} />
                <Bar dataKey="volume" fill="#7c6cf0" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="hint">O volume (carga × repetições) aparece depois do primeiro treino.</p>}
        </section>
        <section className="panel">
          <div className="panel-head"><h2>Volume por músculo (30 dias)</h2></div>
          {o && o.muscleVolume.length > 0 ? (
            <ul className="gx-bars">
              {o.muscleVolume.map((m) => (
                <li key={m.muscle}><span>{MUSCLE_LABEL[m.muscle]}</span><div><i style={{ width: `${(m.volume / maxVol) * 100}%` }} /></div><b>{m.sets} séries · {fmtVolume(m.volume)}</b></li>
              ))}
            </ul>
          ) : <p className="hint">Sem treinos nos últimos 30 dias.</p>}
        </section>
      </div>

      <section className="panel">
        <div className="panel-head"><h2>Recordes (PR) por exercício</h2></div>
        <label className="search gx-search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar exercício" /></label>
        {recs.length === 0 ? <p className="hint">{records.data?.length ? 'Nada encontrado.' : 'Seus recordes aparecem aqui depois do primeiro treino.'}</p> : (
          <ul className="gx-prlist">
            {recs.map((r) => (
              <li key={r.exercise.id}>
                <button type="button" onClick={() => setOpen(r.exercise)}>
                  <ExerciseThumb exercise={r.exercise} size={44} />
                  <span className="gx-pr-name"><b>{r.exercise.name}</b><small>{r.totalSets} séries · último treino {fmtDate(r.lastDate)}</small></span>
                  <span className="gx-pr-val"><b>{fmtKg(r.maxWeight.weight)}</b><small>× {r.maxWeight.reps} · {fmtDateFull(r.maxWeight.date)}</small></span>
                  <span className="gx-pr-val e1"><b>{fmtKg(r.maxE1rm.e1rm)}</b><small>1RM estimado</small></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><h2>Histórico de treinos</h2></div>
        {(sessions.data ?? []).length === 0 ? <p className="hint">Nenhum treino registrado ainda.</p> : (
          <>
            <ul className="gx-slist">{(sessions.data ?? []).map((v) => <SessionRow key={v.session.id} v={v} />)}</ul>
            {(sessions.data?.length ?? 0) >= count && <button type="button" className="btn small" onClick={() => setCount(count + 20)}>Ver mais</button>}
          </>
        )}
      </section>
      {open && <ExerciseDetail exercise={open} onClose={() => setOpen(null)} readOnly />}
    </div>
  );
}
