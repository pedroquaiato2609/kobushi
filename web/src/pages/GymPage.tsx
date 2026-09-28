import { useSearchParams } from 'react-router-dom';
import { ExerciseLibrary } from '../components/gym/ExerciseLibrary';
import { GymReports } from '../components/gym/GymReports';
import { useActiveWorkout } from '../components/gym/shared';
import { TrainTab } from '../components/gym/TrainTab';
import { WorkoutBuilder } from '../components/gym/WorkoutBuilder';
import { PageHeader } from '../components/PageHeader';

const TABS = [
  { id: 'treinar', label: 'Treinar' },
  { id: 'treinos', label: 'Treinos' },
  { id: 'exercicios', label: 'Exercícios' },
  { id: 'relatorios', label: 'Relatórios' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export default function GymPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === raw) ? (raw as TabId) : 'treinar';
  const active = useActiveWorkout();
  const go = (t: TabId) => setParams(t === 'treinar' ? {} : { tab: t }, { replace: true });
  const training = Boolean(active.data);

  return (
    <div className="page gym">
      <PageHeader title="Academia" subtitle={training ? 'Treino em andamento: registre as séries e respeite o descanso.' : 'Monte treinos, treine com cronômetro e acompanhe cargas e recordes.'} />
      <div className="tabs gx-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => go(t.id)}>
            {t.label}{t.id === 'treinar' && training && <i className="gx-live" aria-label="treino em andamento" />}
          </button>
        ))}
      </div>
      {tab === 'treinar' && <TrainTab goTo={go} />}
      {tab === 'treinos' && <WorkoutBuilder />}
      {tab === 'exercicios' && <ExerciseLibrary />}
      {tab === 'relatorios' && <GymReports />}
    </div>
  );
}
