-- Anotações organizadas em blocos (texto, título, citação com página, tarefa, divisor) em vez de um campo de
-- texto único — um "mini Notion" por livro. Cada bloco: {id, type, content, page?, checked?}.
ALTER TABLE reading_books ADD COLUMN notes_blocks jsonb NOT NULL DEFAULT '[]';

-- Preserva o que já estava escrito: vira um único bloco de texto.
UPDATE reading_books SET notes_blocks = jsonb_build_array(
  jsonb_build_object('id', gen_random_uuid()::text, 'type', 'text', 'content', notes, 'page', null, 'checked', false)
) WHERE notes IS NOT NULL AND notes <> '';

ALTER TABLE reading_books DROP COLUMN notes;
