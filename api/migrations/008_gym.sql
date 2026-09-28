-- Módulo Academia: biblioteca de exercícios, treinos montados, sessões de treino e séries (com recordes).

CREATE TABLE gym_exercises (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  primary_muscles   text[] NOT NULL DEFAULT '{}',
  secondary_muscles text[] NOT NULL DEFAULT '{}',
  equipment         text NOT NULL DEFAULT 'other',
  instructions      text NOT NULL DEFAULT '',
  tips              text NOT NULL DEFAULT '',
  is_custom         boolean NOT NULL DEFAULT false,   -- false = veio do catálogo pré-cadastrado
  image_storage     text,                             -- foto de referência enviada pelo usuário (nome UUID no armazenamento de arquivos)
  image_mime        text,
  archived          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX gym_exercises_name_uq ON gym_exercises (lower(name));

CREATE TABLE gym_workouts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  notes      text NOT NULL DEFAULT '',
  weekdays   smallint[] NOT NULL DEFAULT '{}',        -- dias sugeridos (0 = domingo); vazio = qualquer dia
  archived   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- targets = {"min":{"sets":2,"reps":8,"weight":40},"ideal":{...},"max":{...}} — mesmo princípio mínimo/ideal/máximo do Ninshiki.
CREATE TABLE gym_workout_exercises (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id   uuid NOT NULL REFERENCES gym_workouts(id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES gym_exercises(id) ON DELETE RESTRICT,
  position     integer NOT NULL,
  rest_seconds integer NOT NULL DEFAULT 90 CHECK (rest_seconds BETWEEN 0 AND 900),
  note         text NOT NULL DEFAULT '',
  targets      jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_gym_we_workout ON gym_workout_exercises (workout_id, position);

CREATE TABLE gym_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid REFERENCES gym_workouts(id) ON DELETE SET NULL,
  name       text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at   timestamptz,
  note       text NOT NULL DEFAULT '',
  level      text CHECK (level IN ('min', 'ideal', 'max')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX idx_gym_sessions_started ON gym_sessions (started_at DESC);
-- só pode haver um treino em andamento por vez
CREATE UNIQUE INDEX gym_one_active_session ON gym_sessions ((true)) WHERE ended_at IS NULL;

CREATE TABLE gym_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
  exercise_id  uuid NOT NULL REFERENCES gym_exercises(id) ON DELETE RESTRICT,
  set_number   integer NOT NULL CHECK (set_number >= 1),
  reps         integer NOT NULL CHECK (reps BETWEEN 0 AND 1000),
  weight       double precision NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 2000),
  level        text CHECK (level IN ('min', 'ideal', 'max')),
  rest_seconds integer CHECK (rest_seconds IS NULL OR rest_seconds BETWEEN 0 AND 3600),
  is_pr        boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_gym_sets_session ON gym_sets (session_id, created_at);
CREATE INDEX idx_gym_sets_exercise ON gym_sets (exercise_id, created_at DESC);
