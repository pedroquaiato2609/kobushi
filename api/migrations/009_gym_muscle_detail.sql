-- Taxonomia muscular mais precisa: de 13 grupos genéricos (peito, ombros...) para músculos específicos
-- (peitoral maior, deltoide anterior...), e uma terceira categoria: estabilizadores.
--
-- Exercícios do catálogo (is_custom = false) são reclassificados de verdade pela sincronização do catálogo,
-- que roda a cada início da API e corrige os três campos por nome (ver application/gym/catalog.ts). O remapeamento
-- abaixo é só uma rede de segurança para eles não ficarem com chaves inexistentes entre a migração e esse boot.
-- Exercícios do usuário (is_custom = true) não têm um catálogo de referência: o remapeamento abaixo é a correção
-- definitiva para eles — uma aproximação razoável (o antigo "ombros" vira "deltoide lateral", por exemplo), que o
-- usuário pode refinar a qualquer momento editando o exercício.

ALTER TABLE gym_exercises ADD COLUMN stabilizer_muscles text[] NOT NULL DEFAULT '{}';

UPDATE gym_exercises SET
  primary_muscles = array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(
    primary_muscles,
    'chest', 'pectoral_major'), 'shoulders', 'deltoid_lateral'), 'biceps', 'biceps_brachii'), 'triceps', 'triceps_brachii'),
    'forearms', 'brachioradialis'), 'abs', 'rectus_abdominis'), 'traps', 'trapezius'), 'lats', 'latissimus_dorsi'),
    'lower_back', 'erector_spinae'), 'glutes', 'gluteus_maximus'), 'quads', 'quadriceps'), 'hamstrings', 'hamstrings'), 'calves', 'gastrocnemius'),
  secondary_muscles = array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(array_replace(
    secondary_muscles,
    'chest', 'pectoral_major'), 'shoulders', 'deltoid_lateral'), 'biceps', 'biceps_brachii'), 'triceps', 'triceps_brachii'),
    'forearms', 'brachioradialis'), 'abs', 'rectus_abdominis'), 'traps', 'trapezius'), 'lats', 'latissimus_dorsi'),
    'lower_back', 'erector_spinae'), 'glutes', 'gluteus_maximus'), 'quads', 'quadriceps'), 'hamstrings', 'hamstrings'), 'calves', 'gastrocnemius');
