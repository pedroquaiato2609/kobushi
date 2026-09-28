import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildGymTools } from '../src/agent/gymTools';
import { PermissionPolicy } from '../src/agent/policy';
import { ToolRunner } from '../src/agent/runner';
import type { Exercise, GymRepository, GymSession, GymSet, Workout } from '../src/application/gym/ports';
import { GymService } from '../src/application/gym/service';

/** Repositório em memória só com o que as ferramentas do assistente usam. */
function memGym() {
  const exercises: Exercise[] = [
    { id: '11111111-1111-1111-1111-111111111111', name: 'Supino reto com barra', primaryMuscles: ['pectoral_major'], secondaryMuscles: ['triceps_brachii'], stabilizerMuscles: [], equipment: 'barbell', instructions: '', tips: '', isCustom: false, imageMime: null, archived: false, createdAt: new Date() },
    { id: '22222222-2222-2222-2222-222222222222', name: 'Supino inclinado com barra', primaryMuscles: ['pectoral_major'], secondaryMuscles: [], stabilizerMuscles: [], equipment: 'barbell', instructions: '', tips: '', isCustom: false, imageMime: null, archived: false, createdAt: new Date() },
    { id: '33333333-3333-3333-3333-333333333333', name: 'Agachamento livre', primaryMuscles: ['quadriceps'], secondaryMuscles: [], stabilizerMuscles: [], equipment: 'barbell', instructions: '', tips: '', isCustom: false, imageMime: null, archived: false, createdAt: new Date() },
  ];
  const workouts: Workout[] = [];
  const sessions: GymSession[] = [];
  const sets: GymSet[] = [];
  const repo = {
    listExercises: async () => exercises,
    getExercise: async (id: string) => exercises.find((e) => e.id === id) ?? null,
    getExercises: async (ids: string[]) => exercises.filter((e) => ids.includes(e.id)),
    createExercise: async (d: any) => { const e = { ...d, id: crypto.randomUUID(), imageMime: null, archived: false, createdAt: new Date() } as Exercise; exercises.push(e); return e; },
    listWorkouts: async () => workouts,
    getWorkout: async (id: string) => workouts.find((w) => w.id === id) ?? null,
    createWorkout: async (w: any, items: any[]) => { const x = { id: crypto.randomUUID(), ...w, archived: false, createdAt: new Date(), items: items.map((i, n) => ({ id: `i${n}`, position: n, ...i })) } as Workout; workouts.push(x); return x; },
    listSessions: async () => sessions,
    setsOf: async (ids: string[]) => sets.filter((s) => ids.includes(s.sessionId)),
    previousSets: async () => [],
    history: async () => [],
    lastTrainedByMuscle: async () => ({}),
    weeklyVolume: async () => [],
    muscleVolume: async () => [],
    sessionDates: async () => [],
    allSets: async () => [],
  } as unknown as GymRepository;
  return { repo, workouts, exercises };
}

function harness() {
  const m = memGym();
  const gym = new GymService(m.repo, { save: async () => undefined, remove: async () => undefined, path: (n) => n }, 'America/Sao_Paulo');
  const actions: any[] = [];
  const actionRepo: any = {
    create: async (d: any) => { const a = { id: `a${actions.length + 1}`, createdAt: new Date(), resolvedAt: null, ...d }; actions.push(a); return a; },
    get: async (id: string) => actions.find((a) => a.id === id) ?? null,
    resolve: async (id: string, status: string, result: unknown) => { const a = actions.find((x) => x.id === id); a.status = status; a.result = result; return a; },
  };
  const tools = buildGymTools(gym);
  const runner = new ToolRunner(tools, new PermissionPolicy({ all: async () => ({}), setMany: async () => undefined }), actionRepo, () => ({ type: 'object', properties: {} }));
  return { ...m, gym, tools, runner, actions };
}

const ctx = { userId: 'u' };
const ideal = (weight: number) => ({ ideal: { sets: 3, reps: 8, weight } });

test('assistente: ferramentas da academia existem, leituras são livres e criar/alterar pergunta antes', () => {
  const { tools } = harness();
  const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
  for (const n of ['gym_list_workouts', 'gym_list_exercises', 'gym_exercise_history', 'gym_recent_sessions', 'gym_records', 'gym_overview']) assert.equal(byName[n].action, 'read', n);
  for (const n of ['gym_create_exercise', 'gym_create_workout', 'gym_update_workout']) assert.equal(byName[n].defaultMode, 'confirm', n);
  assert.ok(tools.every((t) => t.resource === 'gym'));
  assert.ok(!tools.some((t) => t.name === 'gym_log_set'), 'o assistente não registra séries');
});

test('assistente: monta treino por NOME, mostra o resumo, e só grava depois da aprovação', async () => {
  const { runner, workouts, actions } = harness();
  const out: any = await runner.execute({ id: '1', name: 'gym_create_workout', args: { name: 'Peito A', weekdays: [1], items: [{ exercise: 'supino reto com barra', restSeconds: 120, targets: ideal(70) }, { exercise: 'Agachamento livre' }] } }, 'c', ctx);
  assert.equal(out.status, 'pending_user_confirmation');
  assert.equal(workouts.length, 0); // nada gravado antes do "sim"
  assert.match(out.resumo.join('\n'), /Supino reto com barra — descanso 120s/);
  assert.match(out.resumo.join('\n'), /ideal 3×8 @ 70 kg/);
  const done = await runner.approve(actions[0].id, ctx);
  assert.equal(done.status, 'executed');
  assert.equal(workouts.length, 1);
  assert.deepEqual(workouts[0].items.map((i) => i.restSeconds), [120, 90]); // padrão de 90 s quando não informado
});

test('assistente: nome ambíguo lista as opções e nome inexistente sugere criar (sem chutar)', async () => {
  const { runner, workouts } = harness();
  const amb: any = await runner.execute({ id: '1', name: 'gym_create_workout', args: { name: 'X', items: [{ exercise: 'supino' }] } }, 'c', ctx);
  assert.match(amb.error, /Mais de um exercício.*Supino reto com barra.*Supino inclinado/s);
  const none: any = await runner.execute({ id: '2', name: 'gym_create_workout', args: { name: 'X', items: [{ exercise: 'remada maluca' }] } }, 'c', ctx);
  assert.match(none.error, /gym_create_exercise/);
  assert.equal(workouts.length, 0);
});

test('assistente: cria exercício próprio (com confirmação) e lê a lista de treinos', async () => {
  const { runner, exercises, actions } = harness();
  const out: any = await runner.execute({ id: '1', name: 'gym_create_exercise', args: { name: 'Elevação de quadril unilateral', primaryMuscles: ['gluteus_maximus'], secondaryMuscles: ['hamstrings'] } }, 'c', ctx);
  assert.equal(out.status, 'pending_user_confirmation');
  assert.match(out.resumo.join('\n'), /Principal: gluteus_maximus/);
  await runner.approve(actions[0].id, ctx);
  assert.ok(exercises.some((e) => e.name === 'Elevação de quadril unilateral' && e.isCustom));
  await runner.execute({ id: '2', name: 'gym_create_workout', args: { name: 'B', items: [{ exercise: 'Elevação de quadril unilateral' }] } }, 'c', ctx);
  await runner.approve(actions[1].id, ctx);
  const list: any = await runner.execute({ id: '3', name: 'gym_list_workouts', args: {} }, 'c', ctx);
  assert.equal(list[0].nome, 'B');
  assert.equal(list[0].exercicios[0].exercicio, 'Elevação de quadril unilateral');
});

test('assistente: permissões podem ser negadas pelo usuário (leitura da academia)', async () => {
  const m = memGym();
  const gym = new GymService(m.repo, { save: async () => undefined, remove: async () => undefined, path: (n) => n }, 'UTC');
  const acts: any[] = [];
  const runner = new ToolRunner(buildGymTools(gym), new PermissionPolicy({ all: async () => ({ gym_overview: 'deny' as const }), setMany: async () => undefined }),
    { create: async (d: any) => { acts.push(d); return { id: 'x', ...d }; } } as any, () => ({ type: 'object', properties: {} }));
  const r: any = await runner.execute({ id: '1', name: 'gym_overview', args: {} }, 'c', ctx);
  assert.equal(r.error, 'permission_denied');
  const specs = await runner.specsForModel({ finance: false });
  assert.ok(!specs.some((s) => s.name === 'gym_overview'));
  assert.ok(specs.some((s) => s.name === 'gym_records'));
});

test('poupa tokens: ferramentas de ESCREVER da academia só vão ao modelo quando a conversa é sobre treino; as de ler ficam sempre', async () => {
  const { runner } = harness();
  const write = ['gym_create_exercise', 'gym_create_workout', 'gym_update_workout'];
  const read = ['gym_list_workouts', 'gym_list_exercises', 'gym_exercise_history', 'gym_recent_sessions', 'gym_records', 'gym_overview'];

  const outOfContext = await runner.specsForModel({ finance: false, gym: false });
  for (const n of write) assert.ok(!outOfContext.some((s) => s.name === n), `${n} não deveria ir sem contexto de academia`);
  for (const n of read) assert.ok(outOfContext.some((s) => s.name === n), `${n} deveria ir mesmo sem contexto de academia`);

  const inContext = await runner.specsForModel({ finance: false, gym: true });
  for (const n of [...write, ...read]) assert.ok(inContext.some((s) => s.name === n), `${n} deveria ir com contexto de academia`);

  // omitir "gym" (undefined) é tratado como "sem restrição": comportamento padrão seguro se algum chamador esquecer o parâmetro.
  const omitted = await runner.specsForModel({ finance: false });
  for (const n of write) assert.ok(omitted.some((s) => s.name === n));
});

