import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { GymActive, GymAddSetResult, GymExercise, GymExerciseStats, GymPlanItem, GymSessionView, Level } from '../../api/types';
import { EQUIPMENT_LABEL, estimate1rm, fmtClock, fmtSets, fmtDuration, fmtKg, fmtTarget, fmtVolume, pickTarget, restLeft } from '../../lib/gym';
import { LEVEL_LABEL, LEVELS } from '../../lib/labels';
import { askAssistant } from '../../lib/chatPrompt';
import { MUSCLE_LABEL } from '../../lib/muscles';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { ErrorText, Modal } from '../ui';
import { ExerciseDetail } from './ExerciseLibrary';
import { ExercisePicker, ExerciseThumb, LevelTag, useNow } from './shared';

// ---- avisos ao fim do descanso ------------------------------------------------------
function alertRestOver() {
  try { navigator.vibrate?.([250, 120, 250, 120, 400]); } catch { /* sem vibração */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.22, 0.44].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.18);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.2);
    });
    setTimeout(() => void ctx.close(), 1200);
  } catch { /* sem áudio */ }
}

/** Mantém a tela acesa durante o treino (quando o navegador permite). */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const ask = () => navigator.wakeLock.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    void ask();
    const vis = () => { if (document.visibilityState === 'visible') void ask(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); void lock?.release().catch(() => undefined); };
  }, [on]);
}

// ---- descanso ----------------------------------------------------------------------
interface Rest { endsAt: number; total: number; label: string }
const REST_KEY = (sessionId: string) => `ninshiki.gym.rest.${sessionId}`;

function RestBar({ rest, now, onAdjust, onSkip }: { rest: Rest; now: number; onAdjust: (deltaSec: number) => void; onSkip: () => void }) {
  const left = restLeft(rest.endsAt, now);
  const pct = Math.min(100, Math.max(0, ((rest.total - left) / Math.max(1, rest.total)) * 100));
  return (
    <div className={`gx-rest${left === 0 ? ' over' : ''}`} role="timer" aria-live="off">
      <div className="gx-rest-bar" style={{ width: `${pct}%` }} />
      <div className="gx-rest-body">
        <div className="gx-rest-time"><small>{left === 0 ? 'Descanso terminou' : `Descanso · ${rest.label}`}</small><b>{left === 0 ? 'Bora!' : fmtClock(left)}</b></div>
        <div className="gx-rest-actions">
          <button type="button" className="btn small" onClick={() => onAdjust(-15)} aria-label="Menos 15 segundos">−15 s</button>
          <button type="button" className="btn small" onClick={() => onAdjust(15)} aria-label="Mais 15 segundos">+15 s</button>
          <button type="button" className="btn small primary" onClick={onSkip}>{left === 0 ? 'Fechar' : 'Pular'}</button>
        </div>
      </div>
    </div>
  );
}

// ---- entrada numérica com − / + ---------------------------------------------------------
function Stepper({ label, value, onChange, step, min = 0, max, suffix }: { label: string; value: string; onChange: (v: string) => void; step: number; min?: number; max: number; suffix?: string }) {
  const num = Number(value.replace(',', '.'));
  const bump = (d: number) => { const n = Math.min(max, Math.max(min, Math.round(((Number.isFinite(num) ? num : 0) + d) * 100) / 100)); onChange(String(n).replace('.', ',')); };
  return (
    <div className="gx-stepper">
      <span className="gx-stepper-label">{label}</span>
      <div>
        <button type="button" onClick={() => bump(-step)} aria-label={`Diminuir ${label}`}>−</button>
        <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value.replace(/[^0-9.,]/g, ''))} onFocus={(e) => e.target.select()} aria-label={label} />
        <button type="button" onClick={() => bump(step)} aria-label={`Aumentar ${label}`}>+</button>
      </div>
      {suffix && <span className="gx-stepper-suffix">{suffix}</span>}
    </div>
  );
}

const toNum = (s: string) => { const n = Number(s.replace(',', '.')); return Number.isFinite(n) ? n : NaN; };

// ---- cartão de exercício -------------------------------------------------------------------
function ExerciseCard({ item, sessionId, onLogged, onOpen, onRemoveExtra }: {
  item: GymPlanItem; sessionId: string; onLogged: (r: GymAddSetResult, item: GymPlanItem) => void; onOpen: (e: GymExercise) => void; onRemoveExtra?: () => void;
}) {
  const t = item.targets;
  const hasTargets = Object.keys(t).length > 0;
  const lastSet = item.sets.at(-1);
  const seed = lastSet ?? item.last.reduce<{ reps: number; weight: number } | null>((a, s) => (!a || s.weight > a.weight ? s : a), null) ?? pickTarget(t, null)?.target ?? null;
  const [weight, setWeight] = useState(() => String(seed?.weight ?? 0).replace('.', ','));
  const [reps, setReps] = useState(() => String(seed?.reps ?? 10));
  const [chosen, setChosen] = useState<Level | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const qc = useQueryClient();

  const log = useAction((p: { reps: number; weight: number }) => api.post<GymAddSetResult>(`/gym/sessions/${sessionId}/sets`, { exerciseId: item.exercise.id, ...p, restSeconds: item.restSeconds }), undefined);
  const del = useAction((id: string) => api.del(`/gym/sets/${id}`));

  const pick = (l: Level) => { setChosen(l); const x = t[l]; if (x) { setWeight(String(x.weight).replace('.', ',')); setReps(String(x.reps)); } };
  const submit = async () => {
    const r = toNum(reps), w = toNum(weight);
    if (!Number.isFinite(r) || r < 1 || !Number.isFinite(w) || w < 0) return;
    const res = await log.mutateAsync({ reps: Math.round(r), weight: w });
    setFlash(res.prs.length ? `🏆 Novo recorde! ${fmtKg(w)} × ${Math.round(r)} · 1RM estimado ${fmtKg(res.e1rm)}` : null);
    onLogged(res, item);
    void qc.invalidateQueries({ queryKey: ['gym'] });
  };
  useEffect(() => { if (!flash) return; const id = setTimeout(() => setFlash(null), 6000); return () => clearTimeout(id); }, [flash]);

  const targetSets = t.ideal?.sets ?? t.min?.sets ?? t.max?.sets;
  return (
    <article className={`gx-card${item.levelReached ? ` reached-${item.levelReached}` : ''}`}>
      <header className="gx-card-head">
        <button type="button" className="gx-card-title" onClick={() => onOpen(item.exercise)} title="Ver músculos, execução e histórico">
          <ExerciseThumb exercise={item.exercise} size={52} />
          <span><b>{item.exercise.name}</b><small>{item.exercise.primaryMuscles.map((m) => MUSCLE_LABEL[m]).join(', ')} · {EQUIPMENT_LABEL[item.exercise.equipment]}</small></span>
        </button>
        <div className="gx-card-side">
          <span className="gx-count">{item.sets.length}{targetSets ? `/${targetSets}` : ''}<small> {item.sets.length === 1 && !targetSets ? 'série' : 'séries'}</small></span>
          <LevelTag level={item.levelReached} />
          {onRemoveExtra && <button type="button" className="icon-btn" onClick={onRemoveExtra} aria-label="Tirar exercício"><Icon name="x" size={16} /></button>}
        </div>
      </header>

      {hasTargets && (
        <div className="gx-targets" role="group" aria-label="Metas do exercício (toque para preencher)">
          {LEVELS.map((l) => t[l] && (
            <button key={l} type="button" className={`gx-target ${l}${chosen === l ? ' on' : ''}`} aria-pressed={chosen === l} onClick={() => pick(l)}>
              <b>{LEVEL_LABEL[l]}</b><span>{fmtTarget(t[l])}</span>
            </button>
          ))}
        </div>
      )}

      <p className="gx-refs">
        {item.last.length > 0 && <span>Última vez: {fmtSets(item.last)} kg</span>}
        {item.best.weight > 0 && <span>Recorde: {fmtKg(item.best.weight)} · 1RM {fmtKg(item.best.e1rm)}</span>}
        {item.note && <span>📝 {item.note}</span>}
        {item.last.length === 0 && item.best.weight === 0 && <span>Primeira vez neste exercício: sem histórico ainda.</span>}
      </p>

      {item.sets.length > 0 && (
        <ol className="gx-sets">
          {item.sets.map((s) => (
            <li key={s.id} className={s.isPr ? 'pr' : ''}>
              <span className="gx-set-n">{s.setNumber}</span>
              <b>{fmtKg(s.weight)} × {s.reps}</b>
              <span className="gx-set-e1rm">1RM {fmtKg(estimate1rm(s.weight, s.reps))}</span>
              <LevelTag level={s.level} />
              {s.isPr && <span className="pr-badge">🏆 PR</span>}
              <button type="button" className="icon-btn" onClick={() => del.mutate(s.id)} aria-label={`Apagar série ${s.setNumber}`}><Icon name="trash" size={15} /></button>
            </li>
          ))}
        </ol>
      )}

      <div className="gx-log">
        <Stepper label="Carga" value={weight} onChange={setWeight} step={2.5} max={2000} suffix="kg" />
        <Stepper label="Repetições" value={reps} onChange={setReps} step={1} min={1} max={1000} />
        <button type="button" className="btn primary gx-log-btn" disabled={log.isPending} onClick={() => void submit()}>
          <Icon name="check" size={18} /> Concluir série {item.sets.length + 1}
        </button>
      </div>
      {flash && <p className="gx-flash" role="status">{flash}</p>}
      <ErrorText error={log.error ?? del.error} />
    </article>
  );
}

// ---- finalizar ---------------------------------------------------------------------------------
function FinishModal({ active, onClose, onDone }: { active: GymActive; onClose: () => void; onDone: (v: GymSessionView) => void }) {
  const [level, setLevel] = useState<Level | null>(active.suggestedLevel);
  const [note, setNote] = useState('');
  const finish = useAction(() => api.post<GymSessionView>(`/gym/sessions/${active.session.id}/finish`, { level, note: note.trim() || undefined }), onDone);
  return (
    <Modal title="Finalizar treino" onClose={onClose} onSubmit={() => finish.mutate(undefined)}
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Continuar treinando</button><button type="submit" className="btn primary" disabled={finish.isPending || active.totalSets === 0}>Finalizar</button></>}>
      <div className="gx-summary">
        <div><b>{fmtDuration(active.durationSeconds)}</b><span>duração</span></div>
        <div><b>{active.totalSets}</b><span>séries</span></div>
        <div><b>{fmtVolume(active.volume)}</b><span>volume</span></div>
        <div><b>{active.prs}</b><span>recordes</span></div>
      </div>
      {active.exercises.length > 0 && (
        <ul className="gx-finish-list">
          {active.exercises.map((e) => <li key={e.exercise.id}><span>{e.exercise.name}</span><span>{e.sets.length} {e.sets.length === 1 ? 'série' : 'séries'} <LevelTag level={e.levelReached} /></span></li>)}
        </ul>
      )}
      <fieldset className="field">
        <legend className="field-label">Como foi o treino? (mesmo princípio mínimo · ideal · máximo)</legend>
        <div className="gx-level-pick" role="radiogroup">
          {([null, ...LEVELS] as (Level | null)[]).map((l) => (
            <button key={l ?? 'none'} type="button" role="radio" aria-checked={level === l} className={`gx-lvl ${l ?? 'none'}${level === l ? ' on' : ''}`} onClick={() => setLevel(l)}>{l ? LEVEL_LABEL[l] : 'Sem nível'}</button>
          ))}
        </div>
        {active.suggestedLevel && <p className="hint">Sugerido pelas séries: <b>{LEVEL_LABEL[active.suggestedLevel]}</b>. Se houver uma atividade “Academia” na sua rotina, o nível é registrado nela hoje.</p>}
      </fieldset>
      <label className="field"><span className="field-label">Observações</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Como se sentiu, dores, ajustes para a próxima…" /></label>
      {active.totalSets === 0 && <p className="error" role="alert">Registre pelo menos uma série ou descarte o treino.</p>}
      <ErrorText error={finish.error} />
    </Modal>
  );
}

// ---- tela do treino em andamento --------------------------------------------------------------------------
export function ActiveWorkout({ active, onFinished }: { active: GymActive; onFinished: (v: GymSessionView) => void }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const sessionId = active.session.id;
  const now = useNow(1000);
  const elapsed = Math.max(0, Math.floor((now - new Date(active.session.startedAt).getTime()) / 1000));
  useWakeLock(true);

  const [rest, setRest] = useState<Rest | null>(() => { try { return JSON.parse(sessionStorage.getItem(REST_KEY(sessionId)) ?? 'null') as Rest | null; } catch { return null; } });
  const alerted = useRef(false);
  useEffect(() => { try { if (rest) sessionStorage.setItem(REST_KEY(sessionId), JSON.stringify(rest)); else sessionStorage.removeItem(REST_KEY(sessionId)); } catch { /* sem armazenamento */ } }, [rest, sessionId]);
  useEffect(() => {
    if (!rest) { alerted.current = false; return; }
    if (restLeft(rest.endsAt, now) === 0 && !alerted.current) { alerted.current = true; alertRestOver(); }
    if (restLeft(rest.endsAt, now) > 0) alerted.current = false;
  }, [rest, now]);

  const startRest = useCallback((item: GymPlanItem) => {
    const total = item.restSeconds;
    if (total > 0) setRest({ endsAt: Date.now() + total * 1000, total, label: item.exercise.name });
  }, []);
  const adjustRest = (d: number) => setRest((r) => (r ? { ...r, endsAt: r.endsAt + d * 1000, total: Math.max(5, r.total + d) } : r));

  // exercícios escolhidos na hora (fora do plano): aparecem no treino mesmo antes da primeira série
  const [extras, setExtras] = useState<GymPlanItem[]>([]);
  const [picking, setPicking] = useState(false);
  const [detail, setDetail] = useState<GymExercise | null>(null);
  const [finishing, setFinishing] = useState(false);
  const planIds = new Set(active.plan.map((p) => p.exercise.id));
  const shownExtras = extras.filter((e) => !planIds.has(e.exercise.id));

  async function addExtra(e: GymExercise) {
    setPicking(false);
    if (planIds.has(e.id) || extras.some((x) => x.exercise.id === e.id)) return;
    const s = await api.get<GymExerciseStats>(`/gym/exercises/${e.id}/stats`).catch(() => null);
    setExtras((list) => [...list, {
      exercise: e, restSeconds: 90, note: '', targets: {}, planned: false, last: s?.sessions[0]?.sets.map(({ reps, weight }) => ({ reps, weight })) ?? [],
      best: { weight: s?.records.maxWeight?.weight ?? 0, e1rm: s?.records.maxE1rm?.e1rm ?? 0 }, sets: [], levelReached: null,
    }]);
  }

  const discard = useAction(() => api.del(`/gym/sessions/${sessionId}`), () => { setRest(null); });
  const items = [...active.plan, ...shownExtras];

  return (
    <section className="gx-active" aria-label="Treino em andamento">
      <header className="gx-clock">
        <div className="gx-clock-main">
          <small><Icon name="dumbbell" size={14} /> {active.session.name}</small>
          <b className="gx-timer" aria-label="Tempo de treino">{fmtClock(elapsed)}</b>
        </div>
        <div className="gx-clock-stats"><span><b>{active.totalSets}</b> {active.totalSets === 1 ? 'série' : 'séries'}</span><span><b>{fmtVolume(active.volume)}</b></span>{active.prs > 0 && <span>🏆 {active.prs}</span>}</div>
        <button type="button" className="btn primary" onClick={() => setFinishing(true)}>Finalizar</button>
      </header>

      {items.length === 0 && <p className="hint gx-empty">Treino livre: escolha o primeiro exercício para começar.</p>}
      {items.map((item) => (
        <ExerciseCard key={item.exercise.id} item={item} sessionId={sessionId} onOpen={setDetail} onLogged={(_r, it) => startRest(it)}
          onRemoveExtra={!item.planned && item.sets.length === 0 ? () => setExtras((l) => l.filter((x) => x.exercise.id !== item.exercise.id)) : undefined} />
      ))}

      <div className="gx-active-foot">
        <button type="button" className="btn" onClick={() => setPicking(true)}><Icon name="plus" size={16} /> Adicionar exercício</button>
        <button type="button" className="btn" onClick={() => askAssistant(navigate, `Estou treinando agora (${active.session.name}). Com base no meu histórico, o que você sugere de carga e repetições para os próximos exercícios? Use as ferramentas da academia.`)}><Icon name="sparkles" size={16} /> Ajuda da IA</button>
        <button type="button" className="btn danger" onClick={async () => { if (await confirm('Descartar este treino e todas as séries registradas nele?')) discard.mutate(undefined); }}>Descartar</button>
      </div>
      <ErrorText error={discard.error} />

      {rest && <RestBar rest={rest} now={now} onAdjust={adjustRest} onSkip={() => setRest(null)} />}
      {picking && <ExercisePicker onPick={(e) => void addExtra(e)} onClose={() => setPicking(false)} exclude={items.map((i) => i.exercise.id)} />}
      {detail && <ExerciseDetail exercise={detail} onClose={() => setDetail(null)} readOnly />}
      {finishing && <FinishModal active={active} onClose={() => setFinishing(false)} onDone={(v) => { setFinishing(false); setRest(null); onFinished(v); }} />}
    </section>
  );
}
