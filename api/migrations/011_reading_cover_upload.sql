-- Capa enviada pelo usuário (foto tirada ou upload), como no módulo Academia: guardada no armazenamento de
-- arquivos por um nome (uuid), servida pela própria API. Quando presente, cover_url passa a apontar para essa
-- rota em vez de uma URL externa.
ALTER TABLE reading_books ADD COLUMN cover_storage text;
ALTER TABLE reading_books ADD COLUMN cover_mime text;
