-- Detalhes extras de uma série de cardio, preenchidos depois de concluí-la no treino (opcional): calorias,
-- velocidade média/máxima, ritmo (pace) médio/máximo e frequência cardíaca média/máxima. Tudo opcional e sem
-- efeito no nível atingido nem em recordes — só informação extra guardada com a série.
ALTER TABLE gym_sets
  ADD COLUMN calories_kcal   integer CHECK (calories_kcal IS NULL OR calories_kcal BETWEEN 0 AND 20000),
  ADD COLUMN avg_speed_kmh   double precision CHECK (avg_speed_kmh IS NULL OR (avg_speed_kmh >= 0 AND avg_speed_kmh <= 100)),
  ADD COLUMN max_speed_kmh   double precision CHECK (max_speed_kmh IS NULL OR (max_speed_kmh >= 0 AND max_speed_kmh <= 100)),
  ADD COLUMN avg_pace_min_km double precision CHECK (avg_pace_min_km IS NULL OR (avg_pace_min_km >= 0 AND avg_pace_min_km <= 60)),
  ADD COLUMN max_pace_min_km double precision CHECK (max_pace_min_km IS NULL OR (max_pace_min_km >= 0 AND max_pace_min_km <= 60)),
  ADD COLUMN avg_heart_rate  integer CHECK (avg_heart_rate IS NULL OR avg_heart_rate BETWEEN 0 AND 300),
  ADD COLUMN max_heart_rate  integer CHECK (max_heart_rate IS NULL OR max_heart_rate BETWEEN 0 AND 300);
