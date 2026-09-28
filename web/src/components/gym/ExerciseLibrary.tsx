import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, ApiError } from '../../api/client';
import { useAction } from '../../api/hooks';
import type { GymEquipment, GymExercise, GymExerciseStats } from '../../api/types';
import { EQUIPMENT_LABEL, fmtDate, fmtDateFull, fmtKg, fmtSets, fmtVolume } from '../../lib/gym';
import { MUSCLE_LABEL, MUSCLE_ZONE, MUSCLES_BY_ZONE, ZONES, ZONE_LABEL, type Muscle, type Zone } from '../../lib/muscles';
import { useConfirm } from '../ConfirmProvider';
import { Icon } from '../Icon';
import { ErrorText, Field, Modal } from '../ui';
import { MuscleMap } from './MuscleMap';
import { ExerciseThumb, muscleNames, useExercises } from './shared';

/** Histórico e recordes de um exercício (usado no detalhe e nos relatórios). */
export function ExerciseStatsBody({ stats }: { stats: GymExerciseStats }) {
  const r = stats.records;
  if (stats.totalSessions === 0) return <p className="hint">Ainda sem histórico neste exercício. Faça o primeiro treino para ver a evolução das cargas.</p>;
  return (
    <div className="gx-stats">
      <div className="gx-records">
        {r.maxWeight && <div><span>Maior carga</span><b>{fmtKg(r.maxWeight.weight)}</b><small>{r.maxWeight.reps} reps · {fmtDateFull(r.maxWeight.date)}</small></div>}
        {r.maxE1rm && <div><span>Melhor 1RM estimado</span><b>{fmtKg(r.maxE1rm.e1rm)}</b><small>{fmtKg(r.maxE1rm.weight)} × {r.maxE1rm.reps} · {fmtDateFull(r.maxE1rm.date)}</small></div>}
        {r.maxReps && <div><span>Mais repetições</span><b>{r.maxReps.reps}</b><small>com {fmtKg(r.maxReps.weight)} · {fmtDateFull(r.maxReps.date)}</small></div>}
        {r.maxVolume && <div><span>Maior volume (treino)</span><b>{fmtVolume(r.maxVolume.volume)}</b><small>{fmtDateFull(r.maxVolume.date)}</small></div>}
      </div>
      {stats.progression.length > 1 && (
        <div className="gx-chart" aria-label="Evolução das cargas">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={stats.progression.map((p) => ({ ...p, label: fmtDate(p.date) }))} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(140,148,173,0.15)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#8c94ad', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#8c94ad', fontSize: 11 }} tickLine={false} axisLine={false} unit=" kg" width={56} />
              <Tooltip contentStyle={{ background: '#151a28', border: '1px solid #2d3650', borderRadius: 10, fontSize: 12 }} labelStyle={{ color: '#c9cfe2' }}
                formatter={(v: number, name: string) => [`${v} kg`, name === 'e1rm' ? '1RM estimado' : 'Maior carga']} />
              <Line type="monotone" dataKey="e1rm" stroke="#f0765f" strokeWidth={2} dot={{ r: 3 }} name="e1rm" />
              <Line type="monotone" dataKey="topWeight" stroke="#7c6cf0" strokeWidth={2} dot={{ r: 3 }} name="topWeight" />
            </LineChart>
          </ResponsiveContainer>
          <p className="gx-legend"><i style={{ background: '#f0765f' }} /> 1RM estimado <i style={{ background: '#7c6cf0' }} /> Maior carga da sessão</p>
        </div>
      )}
      <h4 className="gx-h4">Últimas sessões</h4>
      <ul className="gx-hist">
        {stats.sessions.slice(0, 8).map((s) => (
          <li key={s.sessionId}>
            <b>{fmtDateFull(s.date)}{s.hadPr && ' 🏆'}</b>
            <span>{fmtSets(s.sets)} kg</span>
            <small>{fmtVolume(s.volume)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Detalhe do exercício: mapa muscular (ou a sua foto), como executar, dicas e histórico. */
export function ExerciseDetail({ exercise, onClose, onEdit, readOnly = false }: { exercise: GymExercise; onClose: () => void; onEdit?: (e: GymExercise) => void; readOnly?: boolean }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const stats = useQuery({ queryKey: ['gym', 'stats', exercise.id], queryFn: () => api.get<GymExerciseStats>(`/gym/exercises/${exercise.id}/stats`) });
  const fresh = useExercises().data?.find((e) => e.id === exercise.id) ?? exercise; // reflete foto enviada/removida na hora
  const [tab, setTab] = useState<'map' | 'photo'>(fresh.imageMime ? 'photo' : 'map');
  const file = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (f: File) => {
    setErr(null);
    try {
      const body = new FormData(); body.append('file', f);
      const res = await fetch(`/api/gym/exercises/${exercise.id}/image`, { method: 'POST', body });
      if (!res.ok) throw new ApiError(res.status, (await res.json().catch(() => null))?.error ?? 'Não consegui enviar a imagem.');
      await qc.invalidateQueries({ queryKey: ['gym'] }); setTab('photo');
    } catch (e) { setErr((e as Error).message); }
  };
  const removePhoto = useAction(() => api.del(`/gym/exercises/${exercise.id}/image`), () => setTab('map'));
  const remove = useAction(() => api.del<{ result: string }>(`/gym/exercises/${exercise.id}`), onClose);

  return (
    <Modal title={fresh.name} onClose={onClose} wide
      footer={!readOnly && (
        <>
          <button type="button" className="btn danger" disabled={remove.isPending} onClick={async () => { if (await confirm(`Apagar “${fresh.name}”? Se já tem histórico, ele é arquivado e o histórico continua salvo.`)) remove.mutate(undefined); }}>Apagar</button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => onEdit?.(fresh)}><Icon name="edit" size={15} /> Editar</button>
        </>
      )}>
      <div className="gx-detail">
        <div className="gx-detail-visual">
          <div className="tabs inline" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'map'} onClick={() => setTab('map')}>Mapa muscular</button>
            <button type="button" role="tab" aria-selected={tab === 'photo'} onClick={() => setTab('photo')}>Foto de referência</button>
          </div>
          {tab === 'map' || !fresh.imageMime
            ? <MuscleMap primary={fresh.primaryMuscles} secondary={fresh.secondaryMuscles} stabilizer={fresh.stabilizerMuscles} view="both" className="gx-detail-map" />
            : <img className="gx-photo" src={`/api/gym/exercises/${fresh.id}/image?v=${fresh.imageMime}`} alt={`Foto de referência: ${fresh.name}`} />}
          {tab === 'photo' && !fresh.imageMime && <p className="hint">Nenhuma foto ainda.</p>}
          {!readOnly && (
            <div className="gx-photo-actions">
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ''; }} />
              <button type="button" className="btn small" onClick={() => file.current?.click()}><Icon name="upload" size={14} /> {fresh.imageMime ? 'Trocar foto' : 'Enviar foto de referência'}</button>
              {fresh.imageMime && <button type="button" className="btn small ghost" onClick={() => removePhoto.mutate(undefined)}>Remover foto</button>}
            </div>
          )}
          {err && <p className="error" role="alert">{err}</p>}
        </div>

        <div className="gx-detail-info">
          <p className="gx-muscle-legend"><i className="primary" /> Principal: <b>{muscleNames(fresh.primaryMuscles)}</b></p>
          {fresh.secondaryMuscles.length > 0 && <p className="gx-muscle-legend"><i className="secondary" /> Secundários: <b>{muscleNames(fresh.secondaryMuscles)}</b></p>}
          {fresh.stabilizerMuscles.length > 0 && <p className="gx-muscle-legend"><i className="stabilizer" /> Estabilizadores: <b>{muscleNames(fresh.stabilizerMuscles)}</b></p>}
          <p className="hint">Equipamento: {EQUIPMENT_LABEL[fresh.equipment]}{fresh.isCustom ? ' · exercício seu' : ''}</p>
          {fresh.instructions && <><h4 className="gx-h4">Como executar</h4><p>{fresh.instructions}</p></>}
          {fresh.tips && <><h4 className="gx-h4">Dica</h4><p>{fresh.tips}</p></>}
          <h4 className="gx-h4">Seu histórico</h4>
          {stats.isLoading ? <p className="hint">Carregando…</p> : stats.data ? <ExerciseStatsBody stats={stats.data} /> : null}
        </div>
      </div>
      <ErrorText error={remove.error ?? removePhoto.error} />
    </Modal>
  );
}

type Category = 'primary' | 'secondary' | 'stabilizer';
const CATEGORY_LABEL: Record<Category, string> = { primary: 'Principal', secondary: 'Secundário', stabilizer: 'Estabilizador' };
const CATEGORY_HINT: Record<Category, string> = {
  primary: 'motor principal do movimento', secondary: 'participa ativamente, mas não é o principal responsável',
  stabilizer: 'não move a articulação-alvo; segura postura, tronco ou escápula',
};

/** Cadastro/edição: escolha os músculos por região (chips agrupados). O mapa é só a pré-visualização gerada a partir da escolha. */
export function ExerciseEditor({ exercise, onClose, onSaved }: { exercise?: GymExercise; onClose: () => void; onSaved?: (e: GymExercise) => void }) {
  const [name, setName] = useState(exercise?.name ?? '');
  const [equipment, setEquipment] = useState<GymEquipment>(exercise?.equipment ?? 'machine');
  const [primary, setPrimary] = useState<Muscle[]>(exercise?.primaryMuscles ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(exercise?.secondaryMuscles ?? []);
  const [stabilizer, setStabilizer] = useState<Muscle[]>(exercise?.stabilizerMuscles ?? []);
  const [instructions, setInstructions] = useState(exercise?.instructions ?? '');
  const [tips, setTips] = useState(exercise?.tips ?? '');

  const categoryOf = (m: Muscle): Category | null => (primary.includes(m) ? 'primary' : secondary.includes(m) ? 'secondary' : stabilizer.includes(m) ? 'stabilizer' : null);
  // toque: nenhum → principal → secundário → estabilizador → nenhum
  const cycle = (m: Muscle) => {
    const cur = categoryOf(m);
    const without = (list: Muscle[]) => list.filter((x) => x !== m);
    setPrimary(without(primary)); setSecondary(without(secondary)); setStabilizer(without(stabilizer));
    if (cur === null) setPrimary((p) => (p.length < 4 ? [...without(p), m] : p));
    else if (cur === 'primary') setSecondary((s) => [...without(s), m]);
    else if (cur === 'secondary') setStabilizer((s) => [...without(s), m]);
  };
  const save = useAction(
    (p: object) => (exercise ? api.patch<GymExercise>(`/gym/exercises/${exercise.id}`, p) : api.post<GymExercise>('/gym/exercises', p)),
    (e) => { onSaved?.(e); onClose(); },
  );
  const submit = () => save.mutate({ name: name.trim(), equipment, primaryMuscles: primary, secondaryMuscles: secondary, stabilizerMuscles: stabilizer, instructions, tips });

  return (
    <Modal title={exercise ? 'Editar exercício' : 'Novo exercício'} onClose={onClose} onSubmit={submit} wide
      footer={<><span className="spacer" /><button type="button" className="btn ghost" onClick={onClose}>Cancelar</button><button type="submit" className="btn primary" disabled={save.isPending || name.trim().length < 2 || primary.length === 0}>Salvar</button></>}>
      <div className="gx-detail">
        <div className="gx-detail-visual">
          <MuscleMap primary={primary} secondary={secondary} stabilizer={stabilizer} view="both" className="gx-detail-map" />
          <p className="gx-muscle-legend"><i className="primary" /> Principal <i className="secondary" /> Secundário <i className="stabilizer" /> Estabilizador</p>
        </div>
        <div className="gx-detail-info">
          <Field label="Nome"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex.: Supino inclinado na máquina" autoFocus required /></Field>
          <Field label="Equipamento">
            <select value={equipment} onChange={(e) => setEquipment(e.target.value as GymEquipment)}>
              {Object.entries(EQUIPMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <fieldset className="field">
            <legend className="field-label">Músculos: toque para alternar entre principal → secundário → estabilizador → nenhum</legend>
            {primary.length === 0 && <p className="error" role="alert">Escolha pelo menos um músculo principal.</p>}
            <div className="gx-muscle-groups">
              {ZONES.map((z) => (
                <div key={z} className="gx-muscle-group">
                  <b>{ZONE_LABEL[z]}</b>
                  <div className="gx-chips">
                    {MUSCLES_BY_ZONE[z].map((m) => {
                      const cat = categoryOf(m);
                      return (
                        <button key={m} type="button" className={`gx-mchip${cat ? ` ${cat}` : ''}`} aria-pressed={cat !== null}
                          title={cat ? CATEGORY_LABEL[cat] : 'Toque para classificar'} onClick={() => cycle(m)}>
                          {MUSCLE_LABEL[m]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>
          <div className="gx-chips" aria-label="Resumo da classificação">
            {(['primary', 'secondary', 'stabilizer'] as Category[]).map((cat) => {
              const list = cat === 'primary' ? primary : cat === 'secondary' ? secondary : stabilizer;
              return list.length > 0 ? <span key={cat} className="hint">{CATEGORY_LABEL[cat]} ({CATEGORY_HINT[cat]}): <b>{muscleNames(list)}</b></span> : null;
            })}
          </div>
          <Field label="Como executar (opcional)"><textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
          <Field label="Dica (opcional)"><textarea rows={2} value={tips} onChange={(e) => setTips(e.target.value)} /></Field>
          <ErrorText error={save.error} />
        </div>
      </div>
    </Modal>
  );
}

const zoneMatch = (e: Pick<GymExercise, 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles'>, zone: Zone) =>
  [...e.primaryMuscles, ...e.secondaryMuscles, ...e.stabilizerMuscles].some((m) => MUSCLE_ZONE[m] === zone);

/** Aba Exercícios: biblioteca com busca, filtro por região do corpo, detalhe e cadastro. */
export function ExerciseLibrary() {
  const all = useExercises();
  const [q, setQ] = useState('');
  const [zone, setZone] = useState<Zone | null>(null);
  const [mine, setMine] = useState(false);
  const [open, setOpen] = useState<GymExercise | null>(null);
  const [edit, setEdit] = useState<GymExercise | 'new' | null>(null);

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (all.data ?? []).filter((e) => (!n || e.name.toLowerCase().includes(n)) && (!zone || zoneMatch(e, zone)) && (!mine || e.isCustom));
  }, [all.data, q, zone, mine]);

  return (
    <div className="gx-library">
      <div className="gx-filters">
        <div className="gx-filters-row">
          <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar exercício" /></label>
          <button type="button" className="btn primary" onClick={() => setEdit('new')}><Icon name="plus" size={16} /> Novo exercício</button>
        </div>
        <div className="gx-chips" role="group" aria-label="Filtrar por região do corpo">
          <button type="button" className="chip-toggle" aria-pressed={mine} onClick={() => setMine(!mine)}>Meus exercícios</button>
          {ZONES.map((z) => <button key={z} type="button" className="chip-toggle" aria-pressed={zone === z} onClick={() => setZone(zone === z ? null : z)}>{ZONE_LABEL[z]}</button>)}
        </div>
      </div>
      <p className="hint">{list.length} exercício{list.length === 1 ? '' : 's'}. Toque em um para ver os músculos, a execução e o seu histórico.</p>
      <ul className="gx-grid">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" className="gx-ex-card" onClick={() => setOpen(e)}>
              <ExerciseThumb exercise={e} size={84} />
              <b>{e.name}</b>
              <small>{muscleNames(e.primaryMuscles)}</small>
              <span className="gx-ex-meta">{EQUIPMENT_LABEL[e.equipment]}{e.isCustom && <em>meu</em>}</span>
            </button>
          </li>
        ))}
      </ul>
      {all.isSuccess && list.length === 0 && <p className="hint gx-empty">Nada encontrado. Cadastre o exercício: escolha os músculos e o desenho é gerado.</p>}
      {open && <ExerciseDetail exercise={open} onClose={() => setOpen(null)} onEdit={(e) => { setOpen(null); setEdit(e); }} />}
      {edit && <ExerciseEditor exercise={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

