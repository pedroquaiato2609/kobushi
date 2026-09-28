import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isFinanceConversation, isGymConversation, isReadingConversation, isStudyConversation } from '../src/agent/toolSelection';

const user = (content: string) => ({ role: 'user', content });
const tool = (name: string) => ({ role: 'tool', name, content: '{}' });
const assistantCall = (name: string) => ({ role: 'assistant', content: '', toolCalls: [{ name, args: {} }] });

test('finanças: detecta por palavra-chave e por ferramenta fin_* já usada; ignora o que não é sobre dinheiro', () => {
  assert.equal(isFinanceConversation([user('quanto eu gastei com uber esse mês?')]), true);
  assert.equal(isFinanceConversation([user('qual o saldo do meu cartão?')]), true);
  assert.equal(isFinanceConversation([tool('fin_get_overview')]), true);
  assert.equal(isFinanceConversation([assistantCall('fin_list_transactions')]), true);
  assert.equal(isFinanceConversation([user('como faço um bolo de chocolate?')]), false);
  assert.equal(isFinanceConversation([]), false);
});

test('academia: detecta por palavra-chave e por ferramenta gym_* já usada; ignora o que não é sobre treino', () => {
  assert.equal(isGymConversation([user('quanto eu levantei de supino na última vez?')]), true);
  assert.equal(isGymConversation([user('estou treinando agora, me ajuda com a próxima série')]), true);
  assert.equal(isGymConversation([user('quero montar um treino de academia')]), true);
  assert.equal(isGymConversation([tool('gym_overview')]), true);
  assert.equal(isGymConversation([assistantCall('gym_create_workout')]), true);
  assert.equal(isGymConversation([user('como faço um bolo de chocolate?')]), false);
  assert.equal(isGymConversation([user('minhas costas estão doendo')]), false); // "costas" sozinho não deve disparar
  assert.equal(isGymConversation([]), false);
});

test('leitura: detecta por palavra-chave e por ferramenta reading_* já usada; ignora o que não é sobre livros', () => {
  assert.equal(isReadingConversation([user('quantas páginas eu li esse mês?')]), true);
  assert.equal(isReadingConversation([user('quero adicionar um livro pelo isbn')]), true);
  assert.equal(isReadingConversation([user('o que estou lendo agora?')]), true);
  assert.equal(isReadingConversation([tool('reading_overview')]), true);
  assert.equal(isReadingConversation([assistantCall('reading_add_book')]), true);
  assert.equal(isReadingConversation([user('como faço um bolo de chocolate?')]), false);
  assert.equal(isReadingConversation([]), false);
});

test('estudos: detecta por palavra-chave e por ferramenta study_* já usada; ignora o que não é sobre estudo', () => {
  assert.equal(isStudyConversation([user('quero um plano de estudo de álgebra linear')]), true);
  assert.equal(isStudyConversation([user('anota isso sobre a aula de hoje')]), true);
  assert.equal(isStudyConversation([user('quais matérias eu preciso revisar?')]), true);
  assert.equal(isStudyConversation([tool('study_list_plans')]), true);
  assert.equal(isStudyConversation([assistantCall('study_generate_plan')]), true);
  assert.equal(isStudyConversation([user('como faço um bolo de chocolate?')]), false);
  assert.equal(isStudyConversation([]), false);
});

test('só olha as últimas 8 mensagens (não fica "preso" no assunto para sempre)', () => {
  const old = [user('quanto gastei com uber?'), ...Array.from({ length: 8 }, () => user('ok'))];
  assert.equal(isFinanceConversation(old), false);
  const oldGym = [user('quero montar um treino'), ...Array.from({ length: 8 }, () => user('ok'))];
  assert.equal(isGymConversation(oldGym), false);
  const oldReading = [user('quero adicionar um livro'), ...Array.from({ length: 8 }, () => user('ok'))];
  assert.equal(isReadingConversation(oldReading), false);
  const oldStudy = [user('quero um plano de estudo'), ...Array.from({ length: 8 }, () => user('ok'))];
  assert.equal(isStudyConversation(oldStudy), false);
});

test('as frases reais que os botões "Pedir à IA"/"Ajuda da IA" da Academia enviam disparam o contexto de academia', () => {
  const prompts = [
    'Estou treinando agora (Peito e Pernas). Com base no meu histórico, o que você sugere de carga e repetições para os próximos exercícios? Use as ferramentas da academia.',
    'Acabei de treinar (Peito e Pernas). Analise esse treino e o meu histórico e me diga o que ajustar de carga na próxima vez. Use as ferramentas da academia.',
    'Quero montar um treino de academia. Antes de criar, me pergunte meu objetivo, quantos dias por semana posso treinar, o equipamento que tenho e meu nível. Depois monte o treino com metas de mínimo, ideal e máximo e cargas realistas com base no meu histórico.',
    'Analise minha evolução na academia: cargas, recordes, frequência e recuperação muscular. Diga o que está progredindo, o que está parado e o que treinar hoje. Use as ferramentas da academia.',
  ];
  for (const p of prompts) assert.equal(isGymConversation([user(p)]), true, p);
});
