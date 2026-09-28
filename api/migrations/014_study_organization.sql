CREATE TABLE study_folders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE study_notes
  ADD COLUMN folder_id uuid REFERENCES study_folders(id) ON DELETE SET NULL,
  ADD COLUMN pinned    boolean NOT NULL DEFAULT false,
  ADD COLUMN tags      text[] NOT NULL DEFAULT '{}';

CREATE INDEX idx_study_notes_folder ON study_notes (folder_id);
CREATE INDEX idx_study_notes_tags ON study_notes USING gin (tags);

-- Notas que se referenciam (link livre nota-a-nota, tipo backlink de Notion/Obsidian).
-- Separado do linked_type/linked_id existente, que aponta pra livro/treino/atividade, não pra outra nota.
CREATE TABLE study_note_links (
  from_note uuid NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
  to_note   uuid NOT NULL REFERENCES study_notes(id) ON DELETE CASCADE,
  PRIMARY KEY (from_note, to_note),
  CHECK (from_note <> to_note)
);
CREATE INDEX idx_study_note_links_to ON study_note_links (to_note);
