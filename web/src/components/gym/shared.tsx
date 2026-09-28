import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import type { GymActive, GymExercise, Level } from '../../api/types';
import { LEVEL_LABEL } from '../../lib/labels';
import { EQUIPMENT_LABEL } from '../../lib/gym';
import { MUSCLE_LABEL, MUSCLE_ZONE, ZONES, ZONE_LABEL, type Muscle, type Zone } from '../../lib/muscles';
import { Icon } from '../Icon';
import { Modal } from '../ui';
import { MuscleMap, bestView } from './MuscleMap';

/** Treino em andamento (ou null). Todas as telas da Academia e o aviso global usam a mesma consulta. */
export const useActiveWorkout = (enabled = true) =>
  useQuery({ queryKey: ['gym', 'active'], queryFn: () => api.get<GymActive | null>('/gym/sessions/active'), enabled, refetchInterval: 60_000 });

export const useExercises = () => useQuery({ queryKey: ['gym', 'exercises'], queryFn: () => api.get<GymExercise[]>('/gym/exercises') });

/** Relógio que atualiza a cada `ms` (padrão 1 s). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Miniatura do exercício: a foto de referência, se houver; senão o mapa muscular gerado a partir dos músculos. */
export function ExerciseThumb({ exercise, size = 56 }: { exercise: Pick<GymExercise, 'id' | 'imageMime' | 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles' | 'name'>; size?: number }) {
  const [broken, setBroken] = useState(false); // foto corrompida ou removida: volta para o mapa gerado
  return (
    <span className="gx-thumb" style={{ width: size, height: size }}>
      {exercise.imageMime && !broken
        ? <img src={`/api/gym/exercises/${exercise.id}/image`} alt={exercise.name} loading="lazy" onError={() => setBroken(true)} />
        : <MuscleMap primary={exercise.primaryMuscles} secondary={exercise.secondaryMuscles} stabilizer={exercise.stabilizerMuscles} view={bestView([...exercise.primaryMuscles, ...exercise.secondaryMuscles])} />}
    </span>
  );
}

export const LevelTag = ({ level }: { level: Level | null }) => (level ? <span className={`lvl-tag ${level}`}>{LEVEL_LABEL[level]}</span> : null);

export function muscleNames(ms: Muscle[]) { return ms.map((m) => MUSCLE_LABEL[m]).join(', '); }
const zoneMatch = (e: Pick<GymExercise, 'primaryMuscles' | 'secondaryMuscles' | 'stabilizerMuscles'>, zone: Zone) =>
  [...e.primaryMuscles, ...e.secondaryMuscles, ...e.stabilizerMuscles].some((m) => MUSCLE_ZONE[m] === zone);

/** Escolha de exercício da biblioteca (busca + filtro por região do corpo). */
export function ExercisePicker({ onPick, onClose, exclude = [] }: { onPick: (e: GymExercise) => void; onClose: () => void; exclude?: string[] }) {
  const all = useExercises();
  const [q, setQ] = useState('');
  const [zone, setZone] = useState<Zone | null>(null);
  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return (all.data ?? []).filter((e) => !exclude.includes(e.id) && (!n || e.name.toLowerCase().includes(n)) && (!zone || zoneMatch(e, zone)));
  }, [all.data, q, zone, exclude]);
  return (
    <Modal title="Adicionar exercício" onClose={onClose} wide>
      <div className="gx-filters">
        <label className="search"><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar exercício" autoFocus /></label>
        <div className="gx-chips" role="group" aria-label="Região do corpo">
          {ZONES.map((z) => <button key={z} type="button" className="chip-toggle" aria-pressed={zone === z} onClick={() => setZone(zone === z ? null : z)}>{ZONE_LABEL[z]}</button>)}
        </div>
      </div>
      <ul className="gx-pick-list">
        {list.map((e) => (
          <li key={e.id}>
            <button type="button" onClick={() => onPick(e)}>
              <ExerciseThumb exercise={e} size={48} />
              <span className="gx-pick-text"><b>{e.name}</b><span>{muscleNames(e.primaryMuscles)} · {EQUIPMENT_LABEL[e.equipment]}</span></span>
              <Icon name="plus" size={16} />
            </button>
          </li>
        ))}
        {all.isSuccess && list.length === 0 && <li className="hint">Nenhum exercício encontrado. Cadastre um novo na aba Exercícios.</li>}
      </ul>
    </Modal>
  );
}
