import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { GymCardioTargets, GymExercise, GymTargets, GymWorkout, Level } from '../../api/types';
import { askAssistant } from '../../lib/chatPrompt';
import { WEEKDAYS, fmtCardioTarget, fmtTarget } from '../../lib/gym';
import { LEVEL_LABEL, LEVELS } from '../../lib/labels';
import { MUSCLE_LABEL, type Muscle } from '../../lib/muscles';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { RichEditor } from '../RichEditor';
import { ErrorText, Field, Modal } from '../ui';
import { MuscleMap, bestView } from './MuscleMap';
import { ExercisePicker, ExerciseThumb, useExercises } from './shared';

export const useWorkouts = () => useQuery({ queryKey: ['gym', 'workouts'], queryFn: () => api.get<GymWorkout[]>('/gym/workouts') });

/** Músculos trabalhados por um treino: união dos exercícios (categoria de maior destaque prevalece). */
export function workoutMuscles(w: GymWorkout, byId: Map<string, GymExercise>) {
  const primary = new Set<Muscle>(), secondary = new Set<Muscle>(), stabilizer = new Set<Muscle>();
  for (const i of w.items) {
    const e = byId.get(i.exerciseId);
    e?.primaryMuscles.forEach((m) => primary.add(m));
    e?.secondaryMuscles.forEach((m) => secondary.add(m));
    e?.stabilizerMuscles.forEach((m) => stabilizer.add(m));
  }
  return { primary: [...primary], secondary: [...secondary].filter((m) => !primary.has(m)), stabilizer: [...stabilizer].filter((m) => !primary.has(m) && !secondary.has(m)) };
}

interface Row { exerciseId: string; restSeconds: number; note: string; targets: GymTargets | GymCardioTargets }
const blank = (): GymTargets => ({ min: { sets: 2, reps: 8, weight: 0 }, ideal: { sets: 3, reps: 10, weight: 0 }, max: { sets: 4, reps: 12, weight: 0 } });
const blankCardio = (): GymCardioTargets => ({
  min: { durationMin: 15, distanceKm: null, speedKmh: null }, ideal: { durationMin: 25, distanceKm: null, speedKmh: null }, max: { durationMin: 40, distanceKm: null, speedKmh: null },
});
const blankFor = (kind: 'strength' | 'cardio') => (kind === 'cardio' ? blankCardio() : blank());
const fmtRowTarget = (kind: 'strength' | 'cardio', t: unknown) => (kind === 'cardio' ? fmtCardioTarget(t as never) : fmtTarget(t as never));

function TargetsGrid({ value, onChange }: { value: GymTargets; onChange: (t: GymTargets) => void }) {
  const set = (l: Level, k: 'sets' | 'reps' | 'weight', raw: string) => {
    const n = Number(raw.replace(',', '.'));
    const cur = value[l] ?? { sets: 3, reps: 10, weight: 0 };
    onChange({ ...value, [l]: { ...cur, [k]: Number.isFinite(n) ? n : 0 } });
  };
  const toggle = (l: Level) => { const next = { ...value }; if (next[l]) delete next[l]; else next[l] = blank()[l]; onChange(next); };
  return (
    <div className="gx-tgrid" role="group" aria-label="Metas por nível">
      <div className="gx-tgrid-head"><span /><span>Séries</span><span>Reps</span><span>Carga (kg)</span></div>
      {LEVELS.map((l) => (
        <div key={l} className={`gx-tgrid-row ${l}${value[l] ? '' : ' off'}`}>
          <button type="button" className={`lvl-tag ${l}`} aria-pressed={Boolean(value[l])} onClick={() => toggle(l)} title={value[l] ? 'Toque para remover este nível' : 'Toque para definir este nível'}>{LEVEL_LABEL[l]}</button>
          {value[l] ? (['sets', 'reps', 'weight'] as const).map((k) => (
            <input key={k} inputMode="decimal" value={String(value[l]![k]).replace('.', ',')} onChange={(e) => set(l, k, e.target.value)} onFocus={(e) => e.target.select()} aria-label={`${LEVEL_LABEL[l]}: ${k === 'sets' ? 'séries' : k === 'reps' ? 'repetições' : 'carga em kg'}`} />
          )) : <span className="hint gx-tgrid-off">não definido</span>}
        </div>
      ))}
    </div>
  );
}

/** Mesmo princípio de TargetsGrid, para exercícios de cardio: duração (min), distância (km) e velocidade (km/h) em vez de séries/reps/carga. */
function CardioTargetsGrid({ value, onChange }: { value: GymCardioTargets; onChange: (t: GymCardioTargets) => void }) {
  const set = (l: Level, k: 'durationMin' | 'distanceKm' | 'speedKmh', raw: string) => {
    const n = raw.trim() === '' ? null : Number(raw.replace(',', '.'));
    const cur = value[l] ?? { durationMin: null, distanceKm: null, speedKmh: null };
    onChange({ ...value, [l]: { ...cur, [k]: n !== null && Number.isFinite(n) ? n : null } });
  };
  const toggle = (l: Level) => { const next = { ...value }; if (next[l]) delete next[l]; else next[l] = blankCardio()[l]; onChange(next); };
  return (
    <div className="gx-tgrid gx-tgrid-cardio" role="group" aria-label="Metas por nível (cardio)">
      <div className="gx-tgrid-head"><span /><span>Minutos</span><span>Km (opcional)</span><span>Km/h (opcional)</span></div>
      {LEVELS.map((l) => (
        <div key={l} className={`gx-tgrid-row ${l}${value[l] ? '' : ' off'}`}>
          <button type="button" className={`lvl-tag ${l}`} aria-pressed={Boolean(value[l])} onClick={() => toggle(l)} title={value[l] ? 'Toque para remover este nível' : 'Toque para definir este nível'}>{LEVEL_LABEL[l]}</button>
          {value[l] ? (
            <>
              <input inputMode="decimal" value={value[l]!.durationMin == null ? '' : String(value[l]!.durationMin).replace('.', ',')} onChange={(e) => set(l, 'durationMin', e.target.value)} onFocus={(e) => e.target.select()} aria-label={`${LEVEL_LABEL[l]}: minutos`} />
              <input inputMode="decimal" value={value[l]!.distanceKm == null ? '' : String(value[l]!.distanceKm).replace('.', ',')} onChange={(e) => set(l, 'distanceKm', e.target.value)} onFocus={(e) => e.target.select()} aria-label={`${LEVEL_LABEL[l]}: km`} />
              <input inputMode="decimal" value={value[l]!.speedKmh == null ? '' : String(value[l]!.speedKmh).replace('.', ',')} onChange={(e) => set(l, 'speedKmh', e.target.value)} onFocus={(e) => e.target.select()} aria-label={`${LEVEL_LABEL[l]}: velocidade em km/h`} />
            </>
          ) : <span className="hint gx-tgrid-off">não definido</span>}
        </div>
      ))}
    </div>
  );
}

function WorkoutEditor({ workout, onClose }: { workout?: GymWorkout; onClose: () => void }) {
  const exercises = useExercises();
  const byId = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const [name, setName] = useState(workout?.name ?? '');
  const [notes, setNotes] = useState(workout?.notes ?? '');
  const [weekdays, setWeekdays] = useState<number[]>(workout?.weekdays ?? []);
  const [rows, setRows] = useState<Row[]>(workout?.items.map((i) => ({ exerciseId: i.exerciseId, restSeconds: i.restSeconds, note: i.note, targets: i.targets })) ?? []);
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  const save = useAction(
    (p: object) => (workout ? api.patch<GymWorkout>(`/gym/workouts/${workout.id}`, p) : api.post<GymWorkout>('/gym/workouts', p)),
    onClose,
  );
  const move = (i: number, d: -1 | 1) => setRows((r) => { const j = i + d; if (j < 0 || j >= r.length) return r; const c = [...r]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const patchRow = (i: number, p: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const submit = () => save.mutate({ name: name.trim(), notes, weekdays, items: rows });
  const muscles = workoutMuscles({ items: rows.map((r) => ({ exerciseId: r.exerciseId })) } as GymWorkout, byId);

  return (
    <>
    <Modal title={workout ? 'Editar treino' : 'Novo treino'} onClose={onClose} onSubmit={submit} wide
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={save.isPending || !name.trim()}>Salvar treino</button></>}>
      <div className="gx-builder">
        <div className="gx-builder-main">
          <Field label="Nome do treino"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Peito, ombro e tríceps" autoFocus required /></Field>
          <fieldset className="field">
            <legend className="field-label">Dias sugeridos (opcional)</legend>
            <div className="weekdays">{WEEKDAYS.map((l, d) => <button key={d} type="button" className="chip-toggle" aria-pressed={weekdays.includes(d)} onClick={() => setWeekdays(weekdays.includes(d) ? weekdays.filter((x) => x !== d) : [...weekdays, d].sort())}>{l}</button>)}</div>
          </fieldset>

          <h4 className="gx-h4">Exercícios ({rows.length})</h4>
          <ol className="gx-rows">
            {rows.map((r, i) => {
              const e = byId.get(r.exerciseId);
              return (
                <li key={`${r.exerciseId}-${i}`} className="gx-row">
                  <div className="gx-row-head">
                    <span className="gx-row-n">{i + 1}</span>
                    {e && <ExerciseThumb exercise={e} size={40} />}
                    <button type="button" className="gx-row-name" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                      <b>{e?.name ?? 'Exercício removido'}</b>
                      <small>{(['min', 'ideal', 'max'] as const).filter((l) => r.targets[l]).map((l) => `${LEVEL_LABEL[l].slice(0, 3)} ${fmtRowTarget(e?.kind ?? 'strength', r.targets[l])}`).join(' · ') || 'sem metas'} · {r.restSeconds}s</small>
                    </button>
                    <div className="gx-row-actions">
                      <button type="button" className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                      <button type="button" className="icon-btn" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Descer">↓</button>
                      <button type="button" className="icon-btn" onClick={() => setRows(rows.filter((_, k) => k !== i))} aria-label="Remover"><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                  {open === i && (
                    <div className="gx-row-body">
                      {e?.kind === 'cardio'
                        ? <CardioTargetsGrid value={r.targets as GymCardioTargets} onChange={(t) => patchRow(i, { targets: t })} />
                        : <TargetsGrid value={r.targets as GymTargets} onChange={(t) => patchRow(i, { targets: t })} />}
                      <div className="row">
                        <Field label="Descanso entre séries (s)"><input inputMode="numeric" value={r.restSeconds} onChange={(e) => patchRow(i, { restSeconds: Math.min(900, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0)) })} /></Field>
                        <Field label="Observação"><input value={r.note} onChange={(e) => patchRow(i, { note: e.target.value })} placeholder="ex.: pausa de 1 s embaixo" /></Field>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn" onClick={() => setPicking(true)}><Icon name="plus" size={16} /> Adicionar exercício</button>
          <Field label="Notas do treino (opcional)" className="study-content-field"><RichEditor content={notes} onChange={setNotes} /></Field>
          <ErrorText error={save.error} />
        </div>
        <aside className="gx-builder-side">
          <h4 className="gx-h4">Músculos deste treino</h4>
          <MuscleMap primary={muscles.primary} secondary={muscles.secondary} stabilizer={muscles.stabilizer} view={bestView([...muscles.primary, ...muscles.secondary])} />
          <p className="hint">{muscles.primary.map((m) => MUSCLE_LABEL[m]).join(', ') || 'Adicione exercícios para ver o mapa.'}</p>
        </aside>
      </div>
    </Modal>
    {/* fora do <form> do editor: formulário dentro de formulário faria o Enter da busca salvar o treino */}
    {picking && <ExercisePicker onClose={() => setPicking(false)} onPick={(e) => { setRows((r) => [...r, { exerciseId: e.id, restSeconds: 90, note: '', targets: blankFor(e.kind) }]); setPicking(false); setOpen(rows.length); }} />}
    </>
  );
}

/** Aba Treinos: montar, editar e apagar treinos. */
export function WorkoutBuilder() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const workouts = useWorkouts();
  const exercises = useExercises();
  const byId = useMemo(() => new Map((exercises.data ?? []).map((e) => [e.id, e])), [exercises.data]);
  const [edit, setEdit] = useState<GymWorkout | 'new' | null>(null);
  const remove = useAction((id: string) => api.del(`/gym/workouts/${id}`));

  return (
    <div className="gx-workouts">
      <div className="gx-toolbar">
        <button type="button" className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> Novo treino</button>
        <button type="button" className="btn" onClick={() => askAssistant(navigate, 'Quero montar um treino de academia. Antes de criar, me pergunte meu objetivo, quantos dias por semana posso treinar, o equipamento que tenho e meu nível. Depois monte o treino com metas de mínimo, ideal e máximo e cargas realistas com base no meu histórico.')}>
          <Icon name="sparkles" size={16} /> Pedir à IA para montar
        </button>
      </div>
      <ul className="gx-wlist">
        {(workouts.data ?? []).map((w) => {
          const m = workoutMuscles(w, byId);
          return (
            <li key={w.id} className="gx-wcard">
              <div className="gx-wcard-map"><MuscleMap primary={m.primary} secondary={m.secondary} stabilizer={m.stabilizer} view={bestView([...m.primary, ...m.secondary])} /></div>
              <div className="gx-wcard-body">
                <h3>{w.name}</h3>
                <p className="hint">{w.items.length} exercício{w.items.length === 1 ? '' : 's'}{w.weekdays.length ? ` · ${w.weekdays.map((d) => WEEKDAYS[d]).join(', ')}` : ''}</p>
                <ul className="gx-wex">
                  {w.items.slice(0, 5).map((i) => <li key={i.id}>{byId.get(i.exerciseId)?.name ?? '—'} <small>{fmtRowTarget(byId.get(i.exerciseId)?.kind ?? 'strength', i.targets.ideal ?? i.targets.min ?? i.targets.max)}</small></li>)}
                  {w.items.length > 5 && <li className="hint">+ {w.items.length - 5}…</li>}
                </ul>
                <div className="gx-wcard-actions">
                  <button type="button" className="btn small" onClick={() => setEdit(w)}><Icon name="edit" size={14} /> Editar</button>
                  <button type="button" className="btn small ghost danger-text" onClick={async () => { if (await confirm(`Apagar o treino “${w.name}”? O histórico de sessões continua salvo.`)) remove.mutate(w.id); }}>Apagar</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {workouts.isSuccess && workouts.data.length === 0 && (
        <div className="gx-empty-card"><Icon name="dumbbell" size={28} /><h3>Nenhum treino ainda</h3><p>Monte seu primeiro treino escolhendo exercícios da biblioteca ({exercises.data?.length ?? 68} pré-cadastrados) e definindo metas de mínimo, ideal e máximo.</p></div>
      )}
      <ErrorText error={remove.error} />
      {edit && <WorkoutEditor workout={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
