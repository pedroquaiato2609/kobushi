-- Atividade de horário definido pode ter mais de um bloco por dia (ex.: trabalho de manhã E de tarde),
-- além de dias com bloco(s) diferente(s) (weekday não-nulo substitui o padrão nesse dia). Unifica o antigo
-- par start_time/end_time da atividade (weekday NULL = padrão) com a exceção por dia da migração anterior.
CREATE TABLE activity_time_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  weekday     smallint CHECK (weekday BETWEEN 0 AND 6), -- NULL = horário padrão; senão, só vale nesse dia (substitui o padrão)
  position    smallint NOT NULL DEFAULT 0, -- ordem dos blocos dentro do mesmo padrão/dia
  start_time  time NOT NULL,
  end_time    time
);
CREATE INDEX idx_activity_time_blocks_activity ON activity_time_blocks (activity_id);

INSERT INTO activity_time_blocks (activity_id, weekday, position, start_time, end_time)
SELECT id, NULL, 0, start_time, end_time FROM activities WHERE time_mode = 'fixed' AND start_time IS NOT NULL;

INSERT INTO activity_time_blocks (activity_id, weekday, position, start_time, end_time)
SELECT activity_id, weekday, 0, start_time, end_time FROM activity_weekday_times;

DROP TABLE activity_weekday_times;
ALTER TABLE activities DROP COLUMN start_time, DROP COLUMN end_time;
