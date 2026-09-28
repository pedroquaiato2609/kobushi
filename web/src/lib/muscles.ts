// Músculos específicos do módulo Academia (anatomia). As chaves são as mesmas da API (api/src/domain/gym.ts).
export const MUSCLES = [
  'pectoral_major',
  'deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior',
  'trapezius',
  'latissimus_dorsi',
  'rhomboids',
  'teres_major',
  'rotator_cuff',
  'erector_spinae',
  'biceps_brachii',
  'triceps_brachii',
  'brachialis',
  'brachioradialis',
  'wrist_flexors', 'wrist_extensors',
  'rectus_abdominis',
  'obliques',
  'transverse_abdominis',
  'serratus_anterior',
  'gluteus_maximus', 'gluteus_medius',
  'hip_adductors', 'hip_flexors',
  'quadriceps',
  'hamstrings',
  'gastrocnemius', 'soleus',
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  pectoral_major: 'Peitoral maior',
  deltoid_anterior: 'Deltoide anterior', deltoid_lateral: 'Deltoide lateral', deltoid_posterior: 'Deltoide posterior',
  trapezius: 'Trapézio',
  latissimus_dorsi: 'Dorsais (latíssimo do dorso)',
  rhomboids: 'Romboides',
  teres_major: 'Redondo maior',
  rotator_cuff: 'Manguito rotador',
  erector_spinae: 'Eretores da espinha (lombar)',
  biceps_brachii: 'Bíceps braquial',
  triceps_brachii: 'Tríceps braquial',
  brachialis: 'Braquial',
  brachioradialis: 'Braquiorradial',
  wrist_flexors: 'Flexores do punho', wrist_extensors: 'Extensores do punho',
  rectus_abdominis: 'Reto abdominal',
  obliques: 'Oblíquos',
  transverse_abdominis: 'Transverso do abdômen',
  serratus_anterior: 'Serrátil anterior',
  gluteus_maximus: 'Glúteo máximo', gluteus_medius: 'Glúteo médio',
  hip_adductors: 'Adutores do quadril', hip_flexors: 'Flexores do quadril',
  quadriceps: 'Quadríceps',
  hamstrings: 'Isquiotibiais',
  gastrocnemius: 'Gastrocnêmio', soleus: 'Sóleo',
};

// Regiões desenhadas no mapa (MuscleMap.tsx): um mapa anatômico exato exigiria uma forma própria para cada um dos
// 28 músculos; em vez disso, vários músculos vizinhos tingem a mesma região já desenhada. O NOME mostrado ao usuário
// (cartão, detalhe, edição) é sempre o músculo específico — a região é só um agrupamento visual do desenho.
export const ZONES = ['chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'abs', 'traps', 'lats', 'lower_back', 'glutes', 'quads', 'hamstrings', 'calves'] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABEL: Record<Zone, string> = {
  chest: 'Peito', shoulders: 'Ombros', biceps: 'Bíceps', triceps: 'Tríceps', forearms: 'Antebraço', abs: 'Abdômen',
  traps: 'Trapézio', lats: 'Dorsais', lower_back: 'Lombar', glutes: 'Glúteos', quads: 'Quadril e coxa', hamstrings: 'Posterior de coxa', calves: 'Panturrilha',
};

export const MUSCLE_ZONE: Record<Muscle, Zone> = {
  pectoral_major: 'chest', serratus_anterior: 'chest',
  deltoid_anterior: 'shoulders', deltoid_lateral: 'shoulders', deltoid_posterior: 'shoulders', rotator_cuff: 'shoulders',
  trapezius: 'traps',
  latissimus_dorsi: 'lats', rhomboids: 'lats', teres_major: 'lats',
  erector_spinae: 'lower_back',
  biceps_brachii: 'biceps', brachialis: 'biceps',
  triceps_brachii: 'triceps',
  brachioradialis: 'forearms', wrist_flexors: 'forearms', wrist_extensors: 'forearms',
  rectus_abdominis: 'abs', obliques: 'abs', transverse_abdominis: 'abs',
  gluteus_maximus: 'glutes', gluteus_medius: 'glutes',
  hip_adductors: 'quads', hip_flexors: 'quads', quadriceps: 'quads',
  hamstrings: 'hamstrings',
  gastrocnemius: 'calves', soleus: 'calves',
};

/** Cada região aparece na vista frontal e/ou traseira. */
export const ZONE_VIEW: Record<Zone, ('front' | 'back')[]> = {
  chest: ['front'], shoulders: ['front', 'back'], biceps: ['front'], triceps: ['back'], forearms: ['front', 'back'], abs: ['front'],
  traps: ['front', 'back'], lats: ['back'], lower_back: ['back'], glutes: ['back'], quads: ['front'], hamstrings: ['back'], calves: ['front', 'back'],
};
export const MUSCLE_VIEW: Record<Muscle, ('front' | 'back')[]> = Object.fromEntries(
  MUSCLES.map((m) => [m, ZONE_VIEW[MUSCLE_ZONE[m]]]),
) as Record<Muscle, ('front' | 'back')[]>;

/** Músculos de uma região, na ordem em que aparecem no seletor de cadastro. */
export const MUSCLES_BY_ZONE: Record<Zone, Muscle[]> = ZONES.reduce((acc, z) => {
  acc[z] = MUSCLES.filter((m) => MUSCLE_ZONE[m] === z);
  return acc;
}, {} as Record<Zone, Muscle[]>);
