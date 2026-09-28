-- Princípios: frases pessoais protegidas pela MESMA senha do Cofre (AES-256-GCM, chave derivada da senha).
-- title e content sempre cifrados — mesmo a lista, com o cofre bloqueado, não mostra nada além do id/pasta.
-- O agente não tem nenhuma ferramenta aqui: é um espaço só do usuário.
CREATE TABLE principle_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE principles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id  uuid REFERENCES principle_folders(id) ON DELETE SET NULL,
  title      text NOT NULL, -- cifrado (iv.tag.dados em base64), nunca texto plano
  content    text NOT NULL, -- cifrado
  archived   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_principles_folder ON principles (folder_id);

-- Agenda do lembrete diário: linha única (id=1), mesmo padrão de notification_settings.
-- A notificação em si nunca leva o texto do princípio (só avisa) — ver ReminderScheduler.
CREATE TABLE principle_schedule (
  id       integer PRIMARY KEY CHECK (id = 1),
  enabled  boolean NOT NULL DEFAULT false,
  times    text[] NOT NULL DEFAULT '{}',   -- ex.: {'08:00','21:30'}
  weekdays int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  channels text[] NOT NULL DEFAULT '{}'    -- 'push'/'whatsapp'; a caixa de entrada do app é sempre usada
);
INSERT INTO principle_schedule (id) VALUES (1);
