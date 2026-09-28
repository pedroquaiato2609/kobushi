-- Lembretes, notificações, perfil/cofre, documentos e ajustes em atividades/eventos.

ALTER TABLE activities
  ADD COLUMN remind_time time,
  ADD COLUMN remind_channels text[] NOT NULL DEFAULT '{}';

ALTER TABLE events
  ADD COLUMN location text NOT NULL DEFAULT '',
  ADD COLUMN remind_minutes integer CHECK (remind_minutes IS NULL OR remind_minutes >= 0),
  ADD COLUMN remind_channels text[] NOT NULL DEFAULT '{}';

-- Lembretes avulsos. remind_at é a PRÓXIMA ocorrência (hora local); repetições avançam essa data.
CREATE TABLE reminders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  remind_at     timestamp NOT NULL,
  repeat        text NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekly')),
  channels      text[] NOT NULL DEFAULT '{}',
  activity_id   uuid REFERENCES activities(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  last_fired_at timestamp,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reminders_due ON reminders (status, remind_at);

-- Caixa de entrada do app (sempre criada), independente dos canais externos.
CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  link       text,
  source     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz
);
CREATE INDEX idx_notifications_created ON notifications (created_at DESC);

-- Evita disparar o mesmo lembrete duas vezes (chave = tipo:id:data).
CREATE TABLE notification_log (
  key     text PRIMARY KEY,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
  endpoint   text PRIMARY KEY,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_settings (
  id          integer PRIMARY KEY CHECK (id = 1),
  whatsapp_to text NOT NULL DEFAULT ''
);
INSERT INTO notification_settings (id) VALUES (1);

-- Perfil do usuário. Nível "secret" fica criptografado (AES-256-GCM, chave derivada da senha do cofre).
CREATE TABLE profile_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text NOT NULL,
  content    text NOT NULL DEFAULT '',
  level      text NOT NULL CHECK (level IN ('general', 'private', 'secret')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vault (
  id         integer PRIMARY KEY CHECK (id = 1),
  salt       text NOT NULL,
  verifier   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Documentos: pastas (aninhadas) e itens (nota, lista ou arquivo enviado).
CREATE TABLE folders (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id     uuid REFERENCES folders(id) ON DELETE CASCADE,
  name          text NOT NULL,
  agent_visible boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id    uuid REFERENCES folders(id) ON DELETE CASCADE,
  title        text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('note', 'list', 'file')),
  content      text NOT NULL DEFAULT '',
  summary      text NOT NULL DEFAULT '',
  mime         text,
  size_bytes   bigint,
  storage_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_folder ON documents (folder_id, updated_at DESC);
