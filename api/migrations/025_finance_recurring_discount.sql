-- Desconto (%) em recorrências/assinaturas: o valor cadastrado continua sendo o de tabela,
-- o desconto só é aplicado na hora de gerar a movimentação (e nas projeções).
ALTER TABLE fin_recurring ADD COLUMN discount_pct double precision CHECK (discount_pct BETWEEN 0 AND 100);
