-- Exercícios de cardio "de sessão única" (esteira, caminhada, bike...): feitos uma vez só no treino, não em
-- várias séries. Continua dando pra desligar (ex.: tiros/intervalado, circuito) e voltar ao modo de séries.
-- Musculação ignora esta coluna (sempre em séries).
ALTER TABLE gym_exercises ADD COLUMN single_session boolean NOT NULL DEFAULT true;
