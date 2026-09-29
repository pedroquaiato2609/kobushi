-- Academia: exercícios de cardio (esteira, bicicleta, escada, remo, elíptico, corda, natação...), rastreados por
-- duração e/ou distância em vez de séries×reps×carga. "kind" separa os dois tipos; os exercícios já cadastrados
-- continuam 'strength'. As colunas novas em gym_sets ficam nulas nas séries de musculação (reps/weight continuam
-- 0 nas séries de cardio, já permitido pelas colunas existentes).
ALTER TABLE gym_exercises ADD COLUMN kind text NOT NULL DEFAULT 'strength' CHECK (kind IN ('strength', 'cardio'));

ALTER TABLE gym_sets ADD COLUMN duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 36000);
ALTER TABLE gym_sets ADD COLUMN distance_km double precision CHECK (distance_km IS NULL OR (distance_km >= 0 AND distance_km <= 500));
