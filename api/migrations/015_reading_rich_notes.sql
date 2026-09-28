-- Anotações do livro deixam de ser blocos tipados (mini-editor próprio) e passam a ser HTML do mesmo
-- editor rico usado em Estudos/Documentos/Academia. Sem dados reais em notes_blocks até aqui: a coluna
-- é substituída direto, sem conversão.
ALTER TABLE reading_books ADD COLUMN notes text NOT NULL DEFAULT '';
ALTER TABLE reading_books DROP COLUMN notes_blocks;
