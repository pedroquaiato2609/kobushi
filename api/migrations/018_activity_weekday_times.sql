-- Horário por dia da semana: uma atividade "fixed" pode ter um horário diferente em dias específicos
-- (ex.: academia às 20:30 durante a semana, mas às 09:00 no fim de semana). Sem linha aqui pro dia = usa
-- o start_time/end_time padrão da atividade.
CREATE TABLE activity_weekday_times (
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  weekday     smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time  time NOT NULL,
  end_time    time,
  PRIMARY KEY (activity_id, weekday)
);
