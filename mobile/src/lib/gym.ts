// Espelho de web/src/lib/muscles.ts + web/src/lib/gym.ts — só os rótulos usados nas telas.
import type { GymEquipment, Muscle } from '../api/types';

export const MUSCLE_LABEL: Record<Muscle, string> = {
  pectoral_major: 'Peitoral maior',
  deltoid_anterior: 'Deltoide anterior', deltoid_lateral: 'Deltoide lateral', deltoid_posterior: 'Deltoide posterior',
  trapezius: 'Trapézio', latissimus_dorsi: 'Dorsais', rhomboids: 'Romboides', teres_major: 'Redondo maior',
  rotator_cuff: 'Manguito rotador', erector_spinae: 'Eretores da espinha', biceps_brachii: 'Bíceps',
  triceps_brachii: 'Tríceps', brachialis: 'Braquial', brachioradialis: 'Braquiorradial',
  wrist_flexors: 'Flexores do punho', wrist_extensors: 'Extensores do punho', rectus_abdominis: 'Reto abdominal',
  obliques: 'Oblíquos', transverse_abdominis: 'Transverso do abdômen', serratus_anterior: 'Serrátil anterior',
  gluteus_maximus: 'Glúteo máximo', gluteus_medius: 'Glúteo médio', hip_adductors: 'Adutores do quadril',
  hip_flexors: 'Flexores do quadril', quadriceps: 'Quadríceps', hamstrings: 'Isquiotibiais',
  gastrocnemius: 'Gastrocnêmio', soleus: 'Sóleo',
};
export const EQUIPMENT_LABEL: Record<GymEquipment, string> = {
  barbell: 'Barra', dumbbell: 'Halteres', machine: 'Máquina', cable: 'Polia', bodyweight: 'Peso do corpo', kettlebell: 'Kettlebell', other: 'Outro',
  treadmill: 'Esteira', bike: 'Bicicleta', stairs: 'Escada/Step', rowing_machine: 'Remo', elliptical: 'Elíptico', jump_rope: 'Corda', pool: 'Natação',
};
export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const fmtKg = (kg: number) => `${kg.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} kg`;
export const estimate1rm = (weight: number, reps: number) => (reps <= 1 ? weight : Math.round(weight * (1 + reps / 30)));
export const fmtClock = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600); const m = Math.floor((totalSeconds % 3600) / 60); const s = Math.floor(totalSeconds % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
