import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGymTools } from '../src/agent/gymTools';
import { PermissionPolicy } from '../src/agent/policy';
import { ToolRunner } from '../src/agent/runner';
import type { Exercise, GymRepository, Workout } from '../src/application/gym/ports';
import { GymService } from '../src/application/gym/service';

let seq = 0;
const ex = (name: string): Exercise => ({
  id: `${String(++seq).padStart(8, '0')}-0000-0000-0000-000000000000`, name,
  primaryMuscles: ['biceps_brachii'], secondaryMuscles: [], stabilizerMuscles: [],
  equipment: 'other', instructions: '', tips: '', isCustom: false, imageMime: null, archived: false, createdAt: new Date(),
});

/** Biblioteca com nomes parecidos de propósito, para testar a resolução por nome (ambíguo, com detalhes a mais, por palavra-chave, sem correspondência). */
function memRepo() {
  const exercises = [
    ex('Supino reto com barra'), ex('Supino inclinado com barra'), ex('Rosca martelo'), ex('Rosca direta com barra'),
    ex('Puxada na frente (pulldown)'), ex('Puxada triângulo'), ex('Barra fixa'), ex('Agachamento livre'),
  ];
  const workouts: Workout[] = [];
  const repo = {
    listExercises: async () => exercises,
    getExercise: async (id: string) => exercises.find((e) => e.id === id) ?? null,
    getExercises: async (ids: string[]) => exercises.filter((e) => ids.includes(e.id)),
    createExercise: async (d: any) => { const e = { ...d, id: `${String(++seq).padStart(8, '0')}-0000-0000-0000-000000000000`, imageMime: null, archived: false, createdAt: new Date() } as Exercise; exercises.push(e); return e; },
    listWorkouts: async () => workouts,
    createWorkout: async (w: any, items: any[]) => { const x = { id: `w${workouts.length + 1}`, ...w, archived: false, createdAt: new Date(), items: items.map((i, n) => ({ id: `i${n}`, position: n, ...i })) } as Workout; workouts.push(x); return x; },
  } as unknown as GymRepository;
  return { repo, workouts, exercises };
}

const gym = (repo: GymRepository) => new GymService(repo, { save: async () => undefined, remove: async () => undefined, path: (n) => n }, 'UTC');

const harness = (repo: GymRepository) => {
  const actions: any[] = [];
  const actionRepo: any = {
    create: async (d: any) => { const a = { id: `a${actions.length + 1}`, createdAt: new Date(), resolvedAt: null, ...d }; actions.push(a); return a; },
    get: async (id: string) => actions.find((a) => a.id === id) ?? null,
    resolve: async (id: string, status: string, result: unknown) => { const a = actions.find((x) => x.id === id); a.status = status; a.result = result; return a; },
  };
  const g = gym(repo);
  const runner = new ToolRunner(buildGymTools(g), new PermissionPolicy({ all: async () => ({}), setMany: async () => undefined }), actionRepo, () => ({ type: 'object', properties: {} }));
  return { g, runner, actions };
};

test('resolver por nome: exato, com detalhes a mais (nos dois sentidos), por palavra-chave quando aponta pra um só, ambíguo e sem correspondência', async () => {
  const { repo } = memRepo();
  const g = gym(repo);
  assert.equal((await g.resolveExercise('Rosca martelo')).name, 'Rosca martelo'); // exato
  assert.equal((await g.resolveExercise('rosca martelo com halteres')).name, 'Rosca martelo'); // busca mais detalhada que o cadastro
  assert.equal((await g.resolveExercise('Puxada na frente')).name, 'Puxada na frente (pulldown)'); // cadastro tem detalhe a mais que a busca

  // sem trecho em comum, mas uma palavra-chave aponta pra um único exercício -> usa direto, sem perguntar
  assert.equal((await g.resolveExercise('Pulldown na polia')).name, 'Puxada na frente (pulldown)');
  assert.equal((await g.resolveExercise('Rosca direta com halteres')).name, 'Rosca direta com barra'); // mais parecido, "com" não conta como palavra-chave

  await assert.rejects(g.resolveExercise('Supino'), /Mais de um exercício combina.*Supino reto com barra.*Supino inclinado/s); // ambíguo (trecho em comum)
  await assert.rejects(g.resolveExercise('Puxada fechada'), /Mais de um exercício parece.*Puxada/s); // ambíguo (empate na palavra-chave "puxada")
  await assert.rejects(g.resolveExercise('Corrida'), /Não achei.*não há nada parecido/s); // sem nada parecido: diz isso, não inventa
});

test('montar treino: cria com o que resolveu e NÃO trava pelo resto — o que faltou aparece à parte, como pendência secundária', async () => {
  const { repo, workouts } = memRepo();
  const { runner, actions } = harness(repo);

  // 5 itens: 2 resolvem (um exato, um com detalhe a mais); 3 não (ambíguo por trecho, ambíguo por palavra-chave, sem nada parecido)
  const out: any = await runner.execute({
    id: '1', name: 'gym_create_workout',
    args: { name: 'Treino X', items: [
      { exercise: 'Barra fixa' }, { exercise: 'rosca martelo com halteres' },
      { exercise: 'Supino' }, { exercise: 'Puxada fechada' }, { exercise: 'Corrida' },
    ] },
  }, 'c', { userId: 'u' });

  assert.equal(out.status, 'pending_user_confirmation'); // não é erro: o treino foi preparado com o que deu certo
  const summary = out.resumo.join('\n');
  assert.match(summary, /Barra fixa/);
  assert.match(summary, /Rosca martelo/);
  assert.match(summary, /Não entraram/);
  assert.match(summary, /Supino.*Mais de um exercício/s);
  assert.match(summary, /Puxada fechada/);
  assert.match(summary, /Corrida.*não há nada parecido/s);
  assert.equal(workouts.length, 0); // ainda não gravado: só depois da aprovação

  const done = await runner.approve(actions[0].id, { userId: 'u' });
  assert.equal(done.status, 'executed');
  assert.equal(workouts.length, 1);
  assert.equal(workouts[0].items.length, 2); // só os 2 que resolveram — os outros 3 não entraram, sem travar o treino
});

test('montar treino: se NENHUM exercício for encontrado, aí sim não cria nada (não faz sentido um treino vazio)', async () => {
  const { repo, workouts } = memRepo();
  const { runner, actions } = harness(repo);
  const out: any = await runner.execute({
    id: '1', name: 'gym_create_workout',
    args: { name: 'Treino Vazio', items: [{ exercise: 'Corrida' }, { exercise: 'Natação' }] },
  }, 'c', { userId: 'u' });
  assert.ok(out.error);
  assert.match(out.error, /Nenhum dos 2 exercício/);
  assert.equal(workouts.length, 0);
  assert.equal(actions.length, 0);
});

test('dias da semana: avisa quando um novo treino cai no mesmo dia de outro já existente, sem travar a criação', async () => {
  const { repo, workouts } = memRepo();
  const { runner, actions } = harness(repo);

  const first: any = await runner.execute({
    id: '1', name: 'gym_create_workout',
    args: { name: 'Treino A', weekdays: [1, 3, 5], items: [{ exercise: 'Barra fixa' }] },
  }, 'c', { userId: 'u' });
  assert.doesNotMatch(first.resumo.join('\n'), /Mesmo dia/); // primeiro treino: nada com que colidir ainda
  await runner.approve(actions[0].id, { userId: 'u' });

  const second: any = await runner.execute({
    id: '2', name: 'gym_create_workout',
    args: { name: 'Treino C: Pernas', weekdays: [1, 3, 5], items: [{ exercise: 'Agachamento livre' }] }, // mesmos dias do Treino A
  }, 'c', { userId: 'u' });
  assert.match(second.resumo.join('\n'), /Mesmo dia de outro treino.*Treino A.*seg, qua, sex/is);
  await runner.approve(actions[1].id, { userId: 'u' }); // o aviso não bloqueia: cabe ao usuário decidir

  const noConflict: any = await runner.execute({
    id: '3', name: 'gym_create_workout',
    args: { name: 'Treino B', weekdays: [2, 4], items: [{ exercise: 'Barra fixa' }] }, // dias livres
  }, 'c', { userId: 'u' });
  assert.doesNotMatch(noConflict.resumo.join('\n'), /Mesmo dia/);

  assert.equal(workouts.length, 2); // Treino A e Treino C, já aprovados; o Treino B (3º) ainda só está pendente
});

test('cardio/duração: criar um exercício como "Esteira" com músculos reais funciona, e entra no treino com a duração na observação (sem metas de série/carga)', async () => {
  const { repo, workouts, exercises } = memRepo();
  const { runner, actions } = harness(repo);

  const created: any = await runner.execute({
    id: '1', name: 'gym_create_exercise',
    args: { name: 'Esteira', primaryMuscles: ['quadriceps', 'hamstrings'], secondaryMuscles: ['gastrocnemius', 'gluteus_maximus'], equipment: 'machine' },
  }, 'c', { userId: 'u' });
  assert.equal(created.status, 'pending_user_confirmation'); // nada de "Não consegui criar um exercício"
  await runner.approve(actions[0].id, { userId: 'u' });
  assert.ok(exercises.some((e) => e.name === 'Esteira')); // schema aceitou de primeira, com músculos reais

  const wk: any = await runner.execute({
    id: '2', name: 'gym_create_workout',
    args: { name: 'Cardio', items: [{ exercise: 'Esteira', note: '10 min, ritmo moderado' }] }, // sem "targets": cardio não tem série/carga
  }, 'c', { userId: 'u' });
  assert.equal(wk.status, 'pending_user_confirmation');
  await runner.approve(actions[1].id, { userId: 'u' });
  assert.equal(workouts[0].items[0].note, '10 min, ritmo moderado');
  assert.deepEqual(workouts[0].items[0].targets, {});
});

test('montar treino: quando todos os itens resolvem, funciona numa chamada só (sem voltas)', async () => {
  const { repo, workouts } = memRepo();
  const { runner, actions } = harness(repo);

  const out: any = await runner.execute({
    id: '1', name: 'gym_create_workout',
    args: { name: 'Treino Y', items: [{ exercise: 'rosca martelo com halteres' }, { exercise: 'Barra fixa' }] },
  }, 'c', { userId: 'u' });
  assert.equal(out.status, 'pending_user_confirmation');
  assert.match(out.resumo.join('\n'), /Rosca martelo/);
  assert.doesNotMatch(out.resumo.join('\n'), /Não entraram/);
  const done = await runner.approve(actions[0].id, { userId: 'u' });
  assert.equal(done.status, 'executed');
  assert.equal(workouts.length, 1);
  assert.equal(workouts[0].items.length, 2);
});
