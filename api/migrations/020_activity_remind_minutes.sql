-- Lembrete "X minutos antes do horário da atividade", igual ao que já existe pros eventos (remind_minutes).
-- Alternativa ao remind_time (horário fixo): quando definido, o horário do aviso é calculado a cada dia a
-- partir do primeiro bloco efetivo daquele dia (padrão ou exceção), então acompanha sozinho um horário que
-- varia por dia da semana.
ALTER TABLE activities ADD COLUMN remind_minutes integer;
