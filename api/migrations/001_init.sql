-- Ninshiki: esquema inicial.
-- Horários de agenda são gravados como hora local (timestamp sem fuso): app de uso pessoal, fuso único.

CREATE TABLE activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('obligation', 'goal', 'special')),
  time_mode   text NOT NULL DEFAULT 'free' CHECK (time_mode IN ('fixed', 'period', 'free')),
  period      text CHECK (period IN ('morning', 'afternoon', 'night')),
  start_time  time,
  end_time    time,
  purpose     text NOT NULL DEFAULT '',
  principle   text NOT NULL DEFAULT '',
  min_desc    text NOT NULL DEFAULT '',
  ideal_desc  text NOT NULL DEFAULT '',
  max_desc    text NOT NULL DEFAULT '',
  weekdays    smallint[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activity_executions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  date        date NOT NULL,
  level       text NOT NULL CHECK (level IN ('min', 'ideal', 'max')),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, date)
);
CREATE INDEX idx_executions_date ON activity_executions (date);

CREATE TABLE events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at   timestamp NOT NULL,
  ends_at     timestamp NOT NULL,
  activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_events_range ON events (starts_at, ends_at);

CREATE TABLE boards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE board_columns (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id   uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name       text NOT NULL,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id   uuid NOT NULL REFERENCES board_columns(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text NOT NULL DEFAULT '',
  position    integer NOT NULL DEFAULT 0,
  due_date    date,
  activity_id uuid REFERENCES activities(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cards_column ON cards (column_id, position);

CREATE TABLE daily_reviews (
  date             date PRIMARY KEY,
  responsibilities text NOT NULL DEFAULT '',
  goals            text NOT NULL DEFAULT '',
  state            text NOT NULL DEFAULT '',
  learned          text NOT NULL DEFAULT '',
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meditation_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date         date NOT NULL,
  duration_min integer NOT NULL CHECK (duration_min > 0),
  attention    smallint CHECK (attention BETWEEN 0 AND 10),
  spatial      smallint CHECK (spatial BETWEEN 0 AND 10),
  sound        smallint CHECK (sound BETWEEN 0 AND 10),
  imagery      smallint CHECK (imagery BETWEEN 0 AND 10),
  after_state  smallint CHECK (after_state BETWEEN 0 AND 10),
  note         text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_meditation_date ON meditation_sessions (date);

-- Agente ----------------------------------------------------------------

CREATE TABLE conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq             bigint GENERATED ALWAYS AS IDENTITY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'note')),
  content         text NOT NULL DEFAULT '',
  tool_calls      jsonb,
  tool_call_id    text,
  tool_name       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conversation ON messages (conversation_id, seq);

CREATE TABLE agent_settings (
  id                      integer PRIMARY KEY CHECK (id = 1),
  provider                text NOT NULL DEFAULT 'anthropic' CHECK (provider IN ('anthropic', 'openai')),
  model                   text NOT NULL DEFAULT 'claude-sonnet-5',
  custom_instructions     text NOT NULL DEFAULT '',
  tone                    text NOT NULL DEFAULT 'direto e acolhedor',
  language                text NOT NULL DEFAULT 'pt-BR',
  include_routine_context boolean NOT NULL DEFAULT true,
  max_tool_steps          integer NOT NULL DEFAULT 8 CHECK (max_tool_steps BETWEEN 1 AND 20),
  stt_mode                text NOT NULL DEFAULT 'server' CHECK (stt_mode IN ('server', 'browser')),
  stt_model               text NOT NULL DEFAULT 'whisper-1',
  updated_at              timestamptz NOT NULL DEFAULT now()
);
INSERT INTO agent_settings (id) VALUES (1);

-- Permissão por ferramenta. Ferramentas sem linha usam o padrão definido no código.
CREATE TABLE agent_permissions (
  tool       text PRIMARY KEY,
  mode       text NOT NULL CHECK (mode IN ('allow', 'confirm', 'deny')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Log de tudo que o agente tentou/fez. Ações pendentes de aprovação também vivem aqui.
CREATE TABLE agent_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  tool            text NOT NULL,
  resource        text NOT NULL,
  action          text NOT NULL,
  args            jsonb NOT NULL DEFAULT '{}',
  result          jsonb,
  status          text NOT NULL CHECK (status IN ('pending', 'executed', 'denied', 'rejected', 'error')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX idx_agent_actions_status ON agent_actions (status, created_at DESC);
