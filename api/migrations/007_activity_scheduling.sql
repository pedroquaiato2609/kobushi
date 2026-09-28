-- Objetivos sem horário fixo passam a ocupar um horário no calendário.
-- not_before/not_after: "depois das" / "antes das". duration_min: quanto tempo o bloco ocupa.
-- suggested_*: horário escolhido pela IA (o calendário usa quando cabe; senão encaixa sozinho).
ALTER TABLE activities
  ADD COLUMN not_before       time,
  ADD COLUMN not_after        time,
  ADD COLUMN duration_min     integer NOT NULL DEFAULT 60 CHECK (duration_min BETWEEN 5 AND 480),
  ADD COLUMN suggested_start  time,
  ADD COLUMN suggested_reason text NOT NULL DEFAULT '';
