import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityService, CommuteService, StatsService } from '../src/application/services';
import type { ActivityRepository, CommuteRepository, ExecutionRepository, MeditationRepository } from '../src/application/ports';
import { addDays, todayIn } from '../src/domain/dates';
import { config } from '../src/config';
import { NotFoundError, ValidationError } from '../src/domain/errors';
import type { Activity, Commute, Execution } from '../src/domain/entities';

const make = (over: Partial<Activity> = {}): Activity => ({
  id: 'a1', name: 'Leitura', kind: 'goal', timeMode: 'free', period: null, blocks: [], weekdayBlocks: [],
  purpose: '', principle: '', minDesc: '', idealDesc: '', maxDesc: '', weekdays: [0, 1, 2, 3, 4, 5, 6],
  active: true, remindTime: null, remindChannels: [], createdAt: new Date('2020-01-01T00:00:00Z'), updatedAt: new Date(), ...over,
});

function memoryActivities(initial: Activity[] = []): ActivityRepository & { rows: Activity[] } {
  const rows = [...initial];
  return {
    rows,
    async list() { return rows; },
    async get(id) { return rows.find((r) => r.id === id) ?? null; },
    async create(d) { const a = make({ ...d, id: `n${rows.length}` }); rows.push(a); return a; },
    async update(id, patch) { const a = rows.find((r) => r.id === id); if (!a) return null; Object.assign(a, patch); return a; },
    async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
  };
}

test('atividade com horário definido exige ao menos um bloco', async () => {
  const svc = new ActivityService(memoryActivities());
  await assert.rejects(svc.create({ name: 'Trabalho', kind: 'obligation', timeMode: 'fixed' }), ValidationError);
  await assert.rejects(svc.create({ name: 'Academia', kind: 'goal', timeMode: 'period' }), ValidationError);
});

test('trocar para horário livre zera período e blocos', async () => {
  const repo = memoryActivities();
  const svc = new ActivityService(repo);
  const a = await svc.create({ name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', blocks: [{ startTime: '08:00', endTime: '17:00' }] });
  const updated = await svc.update(a.id, { timeMode: 'free' });
  assert.deepEqual(updated.blocks, []);
});

test('mais de um bloco por dia (ex.: trabalho de manhã e de tarde): ordena, exige fim entre blocos, recusa sobreposição', async () => {
  const svc = new ActivityService(memoryActivities());
  const a = await svc.create({
    name: 'Trabalho', kind: 'obligation', timeMode: 'fixed',
    blocks: [{ startTime: '13:30', endTime: '17:30' }, { startTime: '07:30', endTime: '11:30' }], // fora de ordem de propósito
  });
  assert.deepEqual(a.blocks, [{ startTime: '07:30', endTime: '11:30' }, { startTime: '13:30', endTime: '17:30' }]);

  await assert.rejects(svc.create({
    name: 'Turno', kind: 'obligation', timeMode: 'fixed',
    blocks: [{ startTime: '07:30', endTime: '12:00' }, { startTime: '11:00', endTime: '15:00' }], // se sobrepõem
  }), ValidationError);

  await assert.rejects(svc.create({
    name: 'Turno 2', kind: 'obligation', timeMode: 'fixed',
    blocks: [{ startTime: '07:30', endTime: null }, { startTime: '11:00', endTime: '15:00' }], // bloco sem fim antes de outro
  }), ValidationError);
});

test('horário por dia da semana: mantém exceções válidas, ignora dias não selecionados, exige fim depois do início', async () => {
  const svc = new ActivityService(memoryActivities());
  const a = await svc.create({
    name: 'Academia', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '20:30', endTime: '21:45' }],
    weekdays: [1, 2, 3, 4, 5, 6, 0], // toda a semana
    weekdayBlocks: [{ weekday: 0, blocks: [{ startTime: '09:00', endTime: '10:00' }] }, { weekday: 6, blocks: [{ startTime: '09:00', endTime: '10:00' }] }],
  });
  assert.deepEqual(a.weekdayBlocks, [{ weekday: 0, blocks: [{ startTime: '09:00', endTime: '10:00' }] }, { weekday: 6, blocks: [{ startTime: '09:00', endTime: '10:00' }] }]);

  // exceção pra um dia que não está em weekdays é descartada, não dá erro
  const b = await svc.create({
    name: 'Estudo', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '08:00', endTime: '09:00' }],
    weekdays: [1, 2, 3, 4, 5], weekdayBlocks: [{ weekday: 0, blocks: [{ startTime: '10:00', endTime: '11:00' }] }],
  });
  assert.deepEqual(b.weekdayBlocks, []);

  await assert.rejects(svc.create({
    name: 'Leitura', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '20:00', endTime: null }], weekdays: [0],
    weekdayBlocks: [{ weekday: 0, blocks: [{ startTime: '09:00', endTime: '08:00' }] }],
  }), ValidationError);

  await assert.rejects(svc.create({
    name: 'Projeto', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '20:00', endTime: null }], weekdays: [0],
    weekdayBlocks: [{ weekday: 0, blocks: [{ startTime: '09:00', endTime: null }] }, { weekday: 0, blocks: [{ startTime: '10:00', endTime: null }] }],
  }), ValidationError);
});

test('horário por dia da semana: um dia pode ter mais de um bloco, e some ao trocar pra livre/período', async () => {
  const svc = new ActivityService(memoryActivities());
  const a = await svc.create({
    name: 'Academia', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '20:30', endTime: null }], weekdays: [0, 6],
    weekdayBlocks: [{ weekday: 6, blocks: [{ startTime: '07:00', endTime: '08:00' }, { startTime: '17:00', endTime: '18:00' }] }],
  });
  assert.equal(a.weekdayBlocks.length, 1);
  assert.equal(a.weekdayBlocks[0].blocks.length, 2);
  const updated = await svc.update(a.id, { timeMode: 'free' });
  assert.deepEqual(updated.weekdayBlocks, []);
});

test('horário padrão só é obrigatório se sobrar dia sem exceção própria', async () => {
  const svc = new ActivityService(memoryActivities());
  // todo dia selecionado (seg e ter) já tem seu próprio horário: não precisa de "blocks"
  const a = await svc.create({
    name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', weekdays: [1, 2],
    weekdayBlocks: [{ weekday: 1, blocks: [{ startTime: '20:30', endTime: '21:45' }] }, { weekday: 2, blocks: [{ startTime: '20:00', endTime: '21:00' }] }],
  });
  assert.deepEqual(a.blocks, []);

  // sobrou quarta sem exceção: agora precisa do padrão
  await assert.rejects(svc.create({
    name: 'Trabalho 2', kind: 'obligation', timeMode: 'fixed', weekdays: [1, 2, 3],
    weekdayBlocks: [{ weekday: 1, blocks: [{ startTime: '20:30', endTime: '21:45' }] }, { weekday: 2, blocks: [{ startTime: '20:00', endTime: '21:00' }] }],
  }), ValidationError);
});

test('lembrete: remindMinutes e remindTime são alternativas (definir um zera o outro), e remindMinutes só em horário definido', async () => {
  const svc = new ActivityService(memoryActivities());
  const a = await svc.create({ name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', blocks: [{ startTime: '08:00', endTime: null }], remindTime: '07:00', remindMinutes: 15 });
  assert.equal(a.remindMinutes, 15);
  assert.equal(a.remindTime, null); // remindMinutes venceu

  const b = await svc.update(a.id, { remindTime: '07:30' }); // volta pro horário fixo
  assert.equal(b.remindTime, '07:30');
  assert.equal(b.remindMinutes, null);

  // remindMinutes não faz sentido fora de horário definido
  const c = await svc.create({ name: 'Leitura', kind: 'goal', timeMode: 'free', remindMinutes: 15 });
  assert.equal(c.remindMinutes, null);
});

function memoryCommutes(initial: Commute[] = []): CommuteRepository & { rows: Commute[] } {
  const rows = [...initial];
  return {
    rows,
    async list() { return rows; },
    async get(id) { return rows.find((r) => r.id === id) ?? null; },
    async create(d) { const c = { ...d, id: `c${rows.length}`, createdAt: new Date(), updatedAt: new Date() } as Commute; rows.push(c); return c; },
    async update(id, patch) { const c = rows.find((r) => r.id === id); if (!c) return null; Object.assign(c, patch); return c; },
    async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
  };
}

test('deslocamento: só pode ser vinculado a uma atividade existente com horário definido', async () => {
  const activities = memoryActivities();
  const commutes = new CommuteService(memoryCommutes(), activities);
  await assert.rejects(commutes.create({ name: 'Ida', activityId: 'inexistente', direction: 'before', durationMin: 20 }), NotFoundError);

  const flex = await new ActivityService(activities).create({ name: 'Leitura', kind: 'goal', timeMode: 'free' });
  await assert.rejects(commutes.create({ name: 'Ida', activityId: flex.id, direction: 'before', durationMin: 20 }), ValidationError);

  const fixed = await new ActivityService(activities).create({ name: 'Academia', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '07:00', endTime: '08:00' }] });
  const c = await commutes.create({ name: 'Ida à academia', activityId: fixed.id, direction: 'before', durationMin: 20 });
  assert.equal(c.activityId, fixed.id);
  assert.equal(c.active, true);
});

test('deslocamento: remindMinutes e remindTime são alternativas (definir um zera o outro) em create e update', async () => {
  const activities = memoryActivities();
  const fixed = await new ActivityService(activities).create({ name: 'Academia', kind: 'goal', timeMode: 'fixed', blocks: [{ startTime: '07:00', endTime: '08:00' }] });
  const commutes = new CommuteService(memoryCommutes(), activities);

  const c = await commutes.create({ name: 'Ida', activityId: fixed.id, direction: 'before', durationMin: 20, remindTime: '06:00', remindMinutes: 10 });
  assert.equal(c.remindMinutes, 10);
  assert.equal(c.remindTime, null); // remindMinutes venceu

  const updated = await commutes.update(c.id, { remindTime: '06:30' }); // volta pro horário fixo
  assert.equal(updated.remindTime, '06:30');
  assert.equal(updated.remindMinutes, null);
});

test('deslocamento: apagar um id inexistente falha', async () => {
  const commutes = new CommuteService(memoryCommutes(), memoryActivities());
  await assert.rejects(commutes.remove('nada'), NotFoundError);
});

function statsService(activities: Activity[], executions: Execution[]) {
  const execRepo = { listRange: async () => executions } as unknown as ExecutionRepository;
  const medRepo = { list: async () => [] } as unknown as MeditationRepository;
  return new StatsService(memoryActivities(activities), execRepo, medRepo);
}
const exec = (activityId: string, date: string, level: Execution['level']): Execution => ({ id: `${activityId}${date}`, activityId, date, level, note: '' });

test('stats: sequência conta dias completos e ignora o dia de hoje enquanto incompleto', async () => {
  const today = todayIn(config.timezone);
  const d = (n: number) => addDays(today, -n);
  const activities = [make({ id: 'a' }), make({ id: 'b' })];
  const executions = [
    exec('a', d(1), 'min'), exec('b', d(1), 'ideal'), // ontem completo
    exec('a', d(2), 'max'), exec('b', d(2), 'min'), // anteontem completo
    exec('a', d(3), 'ideal'), // três dias atrás: faltou "b" -> quebra
    exec('a', today, 'ideal'), // hoje incompleto: não quebra
  ];
  const stats = await statsService(activities, executions).range(d(5), today);
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.totals.min, 2);
  assert.equal(stats.totals.max, 1);
  assert.equal(stats.byActivity.find((a) => a.activityId === 'b')?.missed, 4); // 6 dias - 2 feitos
});

test('stats: atividade criada depois do dia não conta como perdida', async () => {
  const today = todayIn(config.timezone);
  const late = make({ id: 'n', createdAt: new Date(`${today}T12:00:00Z`) });
  const stats = await statsService([late], []).range(addDays(today, -3), today);
  assert.equal(stats.totals.applicable, 1); // só hoje
});

test('stats: dias futuros são descartados', async () => {
  const today = todayIn(config.timezone);
  const stats = await statsService([make()], []).range(today, addDays(today, 10));
  assert.equal(stats.days.length, 1);
});

test('matriz de atividades: sequência, contagens e dias não aplicáveis', async () => {
  const today = todayIn(config.timezone);
  const d = (n: number) => addDays(today, -n);
  const weekdayOnly = make({ id: 'w', weekdays: [1, 2, 3, 4, 5] });
  const daily = make({ id: 'a' });
  const executions = [exec('a', d(1), 'min'), exec('a', d(2), 'max'), exec('a', d(3), 'ideal'), exec('a', today, 'ideal')];
  const execRepo = { listRange: async () => executions } as unknown as ExecutionRepository;
  const svc = new StatsService(memoryActivities([daily, weekdayOnly]), execRepo, { list: async () => [] } as unknown as MeditationRepository);
  const { rows } = await svc.activityMatrix(7);
  const a = rows.find((r) => r.activityId === 'a')!;
  assert.equal(a.cells.length, 7);
  assert.equal(a.streak, 4); // hoje + 3 dias
  assert.deepEqual(a.counts, { min: 1, ideal: 2, max: 1, missed: 3 });
  const w = rows.find((r) => r.activityId === 'w')!;
  assert.ok(w.cells.some((c) => !c.applicable)); // fins de semana não se aplicam
});
