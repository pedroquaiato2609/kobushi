import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { GymActive, GymSessionView, GymWorkout } from '../../api/types';
import { askAssistant } from '../../lib/chatPrompt';
import { WEEKDAYS, fmtSets, fmtDateFull, fmtDuration, fmtKg, fmtVolume } from '../../lib/gym';
import { LEVEL_LABEL } from '../../lib/labels';
import { Icon } from '../Icon';
import { ErrorText } from '../ui';
import { ActiveWorkout } from './ActiveWorkout';
import { MuscleMap, bestView } from './MuscleMap';
import { LevelTag, useActiveWorkout, useExercises } from './shared';
import { useWorkouts, workoutMuscles } from './WorkoutBuilder';

/** Resumo mostrado logo depois de finalizar o treino. */
function Finished({ view, onClose }: { view: GymSessionView; onClose: () => void }) {
  const navigate = useNavigate();
  const prSets = view.exercises.flatMap((e) => e.sets.filter((s) => s.isPr).map((s) => ({ name: e.exercise.name, s })));
  return (
    <section className="gx-finished" aria-live="polite">
      <div className="gx-finished-head"><span className="gx-trophy">{view.prs > 0 ? '🏆' : '💪'}</span><h2>Treino concluído!</h2><p className="hint">{view.session.name} · {fmtDateFull(view.session.startedAt.slice(0, 10))}</p></div>
      <div className="gx-summary">
        <div><b>{fmtDuration(view.durationSeconds)}</b><span>duração</span></div>
        <div><b>{view.totalSets}</b><span>séries</span></div>
        <div><b>{fmtVolume(view.volume)}</b><span>volume</span></div>
        <div><b>{view.session.level ? LEVEL_LABEL[view.session.level] : '—'}</b><span>nível</span></div>
      </div>
      {prSets.length > 0 && (
        <div className="gx-prs"><h4 className="gx-h4">Recordes batidos</h4><ul>{prSets.map(({ name, s }) => <li key={s.id}>🏆 <b>{name}</b> — {fmtKg(s.weight)} × {s.reps}</li>)}</ul></div>
      )}
      <ul className="gx-finish-list">
        {view.exercises.map((e) => <li key={e.exercise.id}><span>{e.exercise.name}</span><span>{fmtSets(e.sets)} kg <LevelTag level={e.levelReached} /></span></li>)}
      </ul>
      <div className="gx-finished-actions">
        <button type="button" className="btn" onClick={() => askAssistant(navigate, `Acabei de treinar (${view.session.name}). Analise esse treino e o meu histórico e me diga o que ajustar de carga na próxima vez. Use as ferramentas da academia.`)}><Icon name="sparkles" size={16} /> Análise da IA</button>
        <button type="button" className="btn primary" onClick={onClose}>Concluir</button>
      </div>
    </section>
  );
}

/** Aba Treinar: escolher um treino (ou treino livre) e, com um treino em andamento, o modo treino. */
export function TrainTab({ goTo }: { goTo: (tab: 'treinos') => void }) {
  const navigate = useNavigate();
  const active = useActiveWorkout();
  const workouts = useWorkouts();
  const exercises = useExercises();
  const recent = useQuery({ queryKey: ['gym', 'sessions', 1], queryFn: () => api.get<GymSessionView[]>('/gym/sessions?limit=1') });
  const byId = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const [finished, setFinished] = useState<GymSessionView | null>(null);
  const start = useAction((body: { workoutId?: string; name?: string }) => api.post<GymActive>('/gym/sessions', body));

  if (finished) return <Finished view={finished} onClose={() => setFinished(null)} />;
  if (active.data) return <ActiveWorkout active={active.data} onFinished={setFinished} />;

  const today = new Date().getDay();
  const list = [...(workouts.data ?? [])].sort((a, b) => Number(b.weekdays.includes(today)) - Number(a.weekdays.includes(today)));
  const last = recent.data?.[0];

  return (
    <div className="gx-train">
      {last && last.session.endedAt && (
        <p className="gx-last">Último treino: <b>{last.session.name}</b> em {fmtDateFull(last.session.startedAt.slice(0, 10))} · {fmtDuration(last.durationSeconds)} · {fmtVolume(last.volume)}{last.session.level && <> · <LevelTag level={last.session.level} /></>}</p>
      )}
      {workouts.isSuccess && workouts.data.length === 0 ? (
        // Sem treinos ainda: uma só chamada para ação (em vez do card "Treino livre" duplicando esta mensagem).
        <div className="gx-empty-card">
          <Icon name="dumbbell" size={28} /><h3>Comece a treinar</h3>
          <p>Você tem {exercises.data?.length ?? 0} exercícios pré-cadastrados. Monte um treino com metas de mínimo, ideal e máximo, peça para a IA sugerir, ou comece agora sem plano.</p>
          <div className="gx-finished-actions">
            <button type="button" className="btn primary" onClick={() => goTo('treinos')}>Montar meu treino</button>
            <button type="button" className="btn" onClick={() => askAssistant(navigate, 'Quero montar um treino de academia. Antes de criar, me pergunte meu objetivo, quantos dias por semana posso treinar, o equipamento que tenho e meu nível.')}><Icon name="sparkles" size={16} /> Pedir à IA</button>
            <button type="button" className="btn ghost" disabled={start.isPending} onClick={() => start.mutate({})}><Icon name="plus" size={16} /> Começar treino livre</button>
          </div>
        </div>
      ) : (
        <ul className="gx-wlist">
          {list.map((w: GymWorkout) => {
            const m = workoutMuscles(w, byId);
            const suggested = w.weekdays.includes(today);
            return (
              <li key={w.id} className={`gx-wcard${suggested ? ' suggested' : ''}`}>
                <div className="gx-wcard-map"><MuscleMap primary={m.primary} secondary={m.secondary} stabilizer={m.stabilizer} view={bestView([...m.primary, ...m.secondary])} /></div>
                <div className="gx-wcard-body">
                  {suggested && <span className="gx-badge">Sugerido para hoje</span>}
                  <h3>{w.name}</h3>
                  <p className="hint">{w.items.length} exercício{w.items.length === 1 ? '' : 's'}{w.weekdays.length ? ` · ${w.weekdays.map((d) => WEEKDAYS[d]).join(', ')}` : ''}</p>
                  <button type="button" className="btn primary gx-start" disabled={start.isPending || w.items.length === 0} onClick={() => start.mutate({ workoutId: w.id })}><Icon name="dumbbell" size={16} /> Iniciar treino</button>
                  {w.items.length === 0 && <p className="hint">Adicione exercícios em Treinos.</p>}
                </div>
              </li>
            );
          })}
          <li className="gx-wcard free">
            <div className="gx-wcard-body">
              <h3>Treino livre</h3>
              <p className="hint">Sem plano: escolha os exercícios na hora. Cronômetro, descanso e recordes funcionam igual.</p>
              <button type="button" className="btn gx-start" disabled={start.isPending} onClick={() => start.mutate({})}><Icon name="plus" size={16} /> Começar treino livre</button>
            </div>
          </li>
        </ul>
      )}
      <ErrorText error={start.error} />
    </div>
  );
}
