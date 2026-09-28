-- Módulo Estudos: notas ricas (HTML de um editor tipo Notion/Google Docs, com imagens embutidas), que podem
-- se atrelar a um livro (Leitura), a um treino (Academia) ou a uma atividade da rotina; e planos de estudo
-- (lista de aulas/tópicos sobre um assunto, gerados com ajuda do assistente) com progresso marcável.

CREATE TABLE study_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL DEFAULT '',       -- HTML do editor, sempre sanitizado antes de gravar (ver service.ts)
  linked_type text CHECK (linked_type IN ('book', 'workout', 'activity')),
  linked_id   uuid,                           -- id na tabela do tipo vinculado; sem FK (tipos diferentes de tabela)
  archived    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((linked_type IS NULL) = (linked_id IS NULL))  -- os dois vazios ou os dois preenchidos, nunca só um
);
CREATE INDEX idx_study_notes_linked ON study_notes (linked_type, linked_id) WHERE linked_type IS NOT NULL;
CREATE INDEX idx_study_notes_updated ON study_notes (updated_at DESC) WHERE NOT archived;

-- lessons = [{"id","title","description","done"}, ...]
CREATE TABLE study_plans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject    text NOT NULL,
  title      text NOT NULL,
  lessons    jsonb NOT NULL DEFAULT '[]',
  archived   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_study_plans_updated ON study_plans (updated_at DESC) WHERE NOT archived;

-- Imagens embutidas nas notas (upload direto do editor, referenciadas por URL no HTML). Uma linha por arquivo,
-- só pra saber o tipo real na hora de servir (o navegador precisa do content-type certo pra exibir inline).
CREATE TABLE study_images (
  storage    uuid PRIMARY KEY,
  mime       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
