import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Exercise, ExerciseInput, GymRepository, WorkoutInput, WorkoutItemInput } from '../src/application/gym/ports';
import { GymService } from '../src/application/gym/service';
import { exerciseUpdateSchema, workoutUpdateSchema } from '../src/application/gym/schemas';

/** Repositório em memória: só o que create/update/upsert de exercícios precisam. */
function memRepo() {
  const rows: Exercise[] = [];
  const workouts: any[] = [];
  const repo = {
    listExercises: async () => rows,
    getExercise: async (id: string) => rows.find((e) => e.id === id) ?? null,
    getExercises: async (ids: string[]) => rows.filter((e) => ids.includes(e.id)),
    createExercise: async (d: ExerciseInput & { isCustom: boolean }) => {
      if (rows.some((e) => e.name.toLowerCase() === d.name.toLowerCase())) { const err: any = new Error('duplicado'); err.code = '23505'; throw err; }
      const e: Exercise = { ...d, id: crypto.randomUUID(), imageMime: null, archived: false, createdAt: new Date() };
      rows.push(e); return e;
    },
    updateExercise: async (id: string, patch: Partial<ExerciseInput>) => {
      const e = rows.find((x) => x.id === id); if (!e) return null;
      Object.assign(e, patch); return e;
    },
    listWorkouts: async () => workouts,
    getWorkout: async (id: string) => workouts.find((w) => w.id === id) ?? null,
    createWorkout: async (w: WorkoutInput, items: WorkoutItemInput[]) => {
      const wo = { id: crypto.randomUUID(), ...w, archived: false, createdAt: new Date(), items: items.map((it, n) => ({ id: crypto.randomUUID(), position: n, ...it })) };
      workouts.push(wo); return wo;
    },
    updateWorkout: async (id: string, patch: Record<string, unknown>, items?: WorkoutItemInput[]) => {
      const w = workouts.find((x) => x.id === id); if (!w) return null;
      Object.assign(w, patch);
      if (items) w.items = items.map((it, n) => ({ id: crypto.randomUUID(), position: n, ...it }));
      return w;
    },
    upsertCatalog: async (items: (ExerciseInput & { name: string })[]) => {
      let created = 0, updated = 0;
      for (const d of items) {
        const cur = rows.find((e) => e.name.toLowerCase() === d.name.toLowerCase());
        if (!cur) { rows.push({ ...d, id: crypto.randomUUID(), isCustom: false, imageMime: null, archived: false, createdAt: new Date() }); created++; continue; }
        const changed = JSON.stringify([cur.primaryMuscles, cur.secondaryMuscles, cur.stabilizerMuscles, cur.equipment, cur.instructions, cur.tips])
          !== JSON.stringify([d.primaryMuscles, d.secondaryMuscles, d.stabilizerMuscles, d.equipment, d.instructions, d.tips]);
        if (changed) { Object.assign(cur, d); updated++; }
      }
      return { created, updated };
    },
  } as unknown as GymRepository;
  return { repo, rows, workouts };
}

const gym = (repo: GymRepository) => new GymService(repo, { save: async () => undefined, remove: async () => undefined, path: (n) => n }, 'UTC');

test('criar exercício: um músculo repetido em duas categorias fica só na de maior destaque', async () => {
  const { repo } = memRepo();
  const e = await gym(repo).createExercise({
    name: 'Teste', equipment: 'other', instructions: '', tips: '',
    primaryMuscles: ['pectoral_major'], secondaryMuscles: ['pectoral_major', 'triceps_brachii'], stabilizerMuscles: ['triceps_brachii', 'serratus_anterior'],
  });
  assert.deepEqual(e.primaryMuscles, ['pectoral_major']);
  assert.deepEqual(e.secondaryMuscles, ['triceps_brachii']); // saiu do estabilizador: secundário tem mais destaque
  assert.deepEqual(e.stabilizerMuscles, ['serratus_anterior']);
});

test('editar exercício: reclassificar aplica a mesma precedência; editar outro campo preserva os músculos', async () => {
  const { repo } = memRepo();
  const e = await gym(repo).createExercise({ name: 'Teste', equipment: 'other', instructions: '', tips: '', primaryMuscles: ['biceps_brachii'], secondaryMuscles: [], stabilizerMuscles: [] });
  const moved = await gym(repo).updateExercise(e.id, { secondaryMuscles: ['biceps_brachii', 'brachialis'] });
  assert.deepEqual(moved.primaryMuscles, ['biceps_brachii']); // não mandado no patch: mantido
  assert.deepEqual(moved.secondaryMuscles, ['brachialis']); // biceps_brachii já é principal, não duplica
  const renamed = await gym(repo).updateExercise(e.id, { instructions: 'nova' });
  assert.deepEqual(renamed.primaryMuscles, ['biceps_brachii']);
  assert.deepEqual(renamed.secondaryMuscles, ['brachialis']);
  assert.equal(renamed.instructions, 'nova');
});

test('sincronizar catálogo: cria o que falta, corrige o que mudou, e não repete atualização sem mudança real', async () => {
  const { repo, rows } = memRepo();
  const g = gym(repo);
  const first = await g.syncCatalog();
  assert.ok(first.created >= 60);
  assert.equal(first.updated, 0);
  const totalAfterFirst = rows.length;

  // simula uma classificação antiga (errada) num exercício do catálogo
  const supino = rows.find((r) => r.name === 'Supino reto com barra')!;
  supino.primaryMuscles = ['triceps_brachii']; supino.secondaryMuscles = [];

  const second = await g.syncCatalog();
  assert.equal(second.created, 0); // nada novo
  assert.ok(second.updated >= 1); // corrigiu o que foi adulterado
  assert.equal(rows.length, totalAfterFirst); // não duplicou
  assert.deepEqual(rows.find((r) => r.name === 'Supino reto com barra')!.primaryMuscles, ['pectoral_major']); // corrigido de volta

  const third = await g.syncCatalog();
  assert.equal(third.created, 0); assert.equal(third.updated, 0); // nada mudou: nenhuma atualização à toa
});

// Regressão: exerciseUpdateSchema/workoutUpdateSchema vêm de um .partial() de schemas que tinham .default() nos
// outros campos. Um .default() sobrevive ao .partial(), então um PATCH que só manda {instructions: 'x'} (ou
// {name: 'x'} no treino) voltava a gravar equipment="other"/tips=""/secundários=[] (ou notes=""/weekdays=[]/
// items=[], apagando os exercícios do treino) por cima do que já estava salvo. Ver application/gym/schemas.ts.
test('PATCH parcial: exerciseUpdateSchema/workoutUpdateSchema NÃO preenchem os campos omitidos com o padrão do create', () => {
  const ep = exerciseUpdateSchema.parse({ instructions: 'nova' });
  assert.equal(ep.equipment, undefined);
  assert.equal(ep.tips, undefined);
  assert.equal(ep.secondaryMuscles, undefined);
  assert.equal(ep.stabilizerMuscles, undefined);

  const wp = workoutUpdateSchema.parse({ name: 'Só o nome' });
  assert.equal(wp.notes, undefined);
  assert.equal(wp.weekdays, undefined);
  assert.equal(wp.items, undefined);
});

test('editar exercício de verdade (passando pelo schema, como a rota faz): só o campo enviado muda', async () => {
  const { repo } = memRepo();
  const g = gym(repo);
  const e = await g.createExercise({ name: 'Rosca direta', equipment: 'barbell', instructions: 'Cotovelos fixos', tips: 'Não balance', primaryMuscles: ['biceps_brachii'], secondaryMuscles: ['brachialis'], stabilizerMuscles: ['wrist_flexors'] });
  const patch = exerciseUpdateSchema.parse({ instructions: 'Cotovelos colados ao tronco' }); // só o que um PATCH real mandaria
  const after = await g.updateExercise(e.id, patch);
  assert.equal(after.instructions, 'Cotovelos colados ao tronco');
  assert.equal(after.equipment, 'barbell'); // não voltou para "other"
  assert.equal(after.tips, 'Não balance'); // não foi apagado
  assert.deepEqual(after.secondaryMuscles, ['brachialis']); // não foi apagado
  assert.deepEqual(after.stabilizerMuscles, ['wrist_flexors']); // não foi apagado
});

test('renomear um treino de verdade (passando pelo schema): não apaga os exercícios nem os dias da semana', async () => {
  const { repo } = memRepo();
  const g = gym(repo);
  const supino = await g.createExercise({ name: 'Supino reto', equipment: 'barbell', instructions: '', tips: '', primaryMuscles: ['pectoral_major'], secondaryMuscles: [], stabilizerMuscles: [] });
  const w = await g.createWorkout({ name: 'Peito A', notes: 'foco em volume', weekdays: [1, 4], items: [{ exerciseId: supino.id, restSeconds: 90, note: '', targets: {} }] });
  const patch = workoutUpdateSchema.parse({ name: 'Peito A (atualizado)' }); // só o nome, como um "renomear" real mandaria
  const after = await g.updateWorkout(w.id, patch);
  assert.equal(after.name, 'Peito A (atualizado)');
  assert.deepEqual(after.weekdays, [1, 4]); // não foi apagado
  assert.equal(after.items.length, 1); // os exercícios não sumiram
  assert.equal(after.notes, 'foco em volume'); // não foi apagado
});
