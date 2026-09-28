-- Autenticação, sessões/dispositivos, auditoria e assistente proativo.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- O token da sessão só existe no cookie do navegador; aqui fica apenas o hash (SHA-256).
CREATE TABLE sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  user_agent   text NOT NULL DEFAULT '',
  ip           text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  revoked_at   timestamptz,
  reauth_until timestamptz
);
CREATE INDEX idx_sessions_user ON sessions (user_id);

-- Registro de ações relevantes. Nunca guarda senhas, tokens ou valores financeiros: só o que aconteceu e em quê.
CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  user_id    uuid,
  action     text NOT NULL,
  target     text NOT NULL DEFAULT '',
  detail     jsonb NOT NULL DEFAULT '{}',
  ip         text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created ON audit_log (created_at DESC);

CREATE TABLE assistant_settings (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  proactivity       text NOT NULL DEFAULT 'low' CHECK (proactivity IN ('off', 'low', 'normal')),
  types             text[] NOT NULL DEFAULT '{agenda,routine,review,finance}',
  max_per_day       integer NOT NULL DEFAULT 2 CHECK (max_per_day BETWEEN 1 AND 10),
  quiet_start       time NOT NULL DEFAULT '22:00',
  quiet_end         time NOT NULL DEFAULT '07:00',
  daily_review_time time,
  weekly_review_time time
);

-- Sugestões proativas. Cada uma nasce de um sinal real (key identifica o sinal) e guarda o motivo e os dados usados.
CREATE TABLE suggestions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         text NOT NULL,
  type        text NOT NULL,
  severity    text NOT NULL CHECK (severity IN ('info', 'attention', 'high')),
  title       text NOT NULL,
  reason      text NOT NULL,
  data        jsonb NOT NULL DEFAULT '[]',
  actions     jsonb NOT NULL DEFAULT '[]',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'dismissed', 'snoozed', 'expired')),
  snooze_until timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  expires_at  timestamptz,
  UNIQUE (user_id, key)
);
CREATE INDEX idx_suggestions_user_status ON suggestions (user_id, status);

-- Resumo legível de uma ação pendente (ex.: "Despesa de R$ 85,00 · Combustível"), para a confirmação no chat.
ALTER TABLE agent_actions ADD COLUMN summary text NOT NULL DEFAULT '';
