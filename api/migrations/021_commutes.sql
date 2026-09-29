-- Deslocamentos: trechos de transporte recorrentes (ex.: "Ida à academia") vinculados a uma atividade-âncora
-- de horário definido (fixed). O horário não é gravado aqui: é derivado a cada dia a partir do(s) bloco(s)
-- efetivos da atividade âncora naquele dia da semana (ver commuteBlock em domain/schedule.ts). "before" termina
-- quando o 1º bloco do dia começa (ida); "after" começa quando o último bloco do dia termina (volta).
CREATE TABLE commutes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  activity_id     uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  direction       text NOT NULL CHECK (direction IN ('before', 'after')),
  duration_min    integer NOT NULL CHECK (duration_min BETWEEN 5 AND 240),
  active          boolean NOT NULL DEFAULT true,
  remind_time     time,
  remind_minutes  integer,
  remind_channels text[] NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_commutes_activity ON commutes (activity_id);
