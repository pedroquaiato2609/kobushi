import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ActivityRepository, CommuteRepository } from '../src/application/ports';
import { ActivitySchedulingService, schedulePrompt } from '../src/application/scheduling';
import { ActivityService } from '../src/application/services';
import type { Activity, Commute, NewActivity } from '../src/domain/entities';

function memRepo(): ActivityRepository & { rows: Activity[] } {
  const rows: Activity[] = [];
  return {
    rows,
    async list() { return rows; },
    async get(id) { return rows.find((r) => r.id === id) ?? null; },
    async create(d: NewActivity) { const a = { ...d, id: `a${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date() } as Activity; rows.push(a); return a; },
    async update(id, patch) { const a = rows.find((r) => r.id === id); if (!a) return null; Object.assign(a, patch); return a; },
    async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
  };
}

function memCommutes(rows: Commute[] = []): CommuteRepository {
  return {
    async list() { return rows; },
    async get(id) { return rows.find((r) => r.id === id) ?? null; },
    async create(d) { const c = { ...d, id: `c${rows.length + 1}`, createdAt: new Date(), updatedAt: new Date() } as Commute; rows.push(c); return c; },
    async update(id, patch) { const c = rows.find((r) => r.id === id); if (!c) return null; Object.assign(c, patch); return c; },
    async delete(id) { const i = rows.findIndex((r) => r.id === id); if (i < 0) return false; rows.splice(i, 1); return true; },
  };
}

const goal = { name: 'Estudar', kind: 'goal' as const, timeMode: 'period' as const, period: 'morning' as const };

test('atividade: "depois das"/"antes das" e duração são guardados; horário fixo os descarta', async () => {
  const svc = new ActivityService(memRepo());
  const g = await svc.create({ ...goal, notBefore: '08:00', notAfter: '11:00', durationMin: 90 });
  assert.equal(g.notBefore, '08:00'); assert.equal(g.notAfter, '11:00'); assert.equal(g.durationMin, 90);
  const fixed = await svc.update(g.id, { timeMode: 'fixed', blocks: [{ startTime: '09:00' }] });
  assert.equal(fixed.notBefore, null); assert.equal(fixed.notAfter, null);
  await assert.rejects(svc.create({ ...goal, notBefore: '11:00', notAfter: '09:00' }), /Antes das/);
});

test('sugestão da IA: valida a janela, tenta de novo uma vez e é apagada quando as restrições mudam', async () => {
  const repo = memRepo();
  const svc = new ActivityService(repo);
  const sched = new ActivitySchedulingService(repo, memCommutes());
  const g = await svc.create({ ...goal, notBefore: '09:00', notAfter: '12:00', durationMin: 60 });

  const answers = ['{"start":"07:00","reason":"cedo"}', '{"start":"09:30","reason":"Foco no começo da manhã"}']; // 1ª fora da janela, 2ª boa
  let calls = 0;
  const out = await sched.suggest(g.id, async () => answers[calls++]);
  assert.equal(calls, 2);
  assert.equal(out.suggestedStart, '09:30');
  assert.equal(out.suggestedReason, 'Foco no começo da manhã');

  await svc.update(g.id, { active: true }); // editar outro campo mantém a sugestão
  assert.equal((await svc.get(g.id)).suggestedStart, '09:30');
  await svc.update(g.id, { notBefore: '10:00' }); // mudou a janela: sugestão antiga não vale mais
  assert.equal((await svc.get(g.id)).suggestedStart, null);

  await assert.rejects(sched.suggest(g.id, async () => 'não sei'), /não devolveu um horário válido/);
});

test('sugestão da IA: recusa horário fixo e janela impossível', async () => {
  const repo = memRepo();
  const svc = new ActivityService(repo);
  const sched = new ActivitySchedulingService(repo, memCommutes());
  const fixed = await svc.create({ name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', blocks: [{ startTime: '08:00', endTime: '17:00' }] });
  await assert.rejects(sched.suggest(fixed.id, async () => '{}'), /já tem horário definido/);
  const impossible = await svc.create({ ...goal, notBefore: '13:00' }); // depois das 13h não é manhã
  await assert.rejects(sched.suggest(impossible.id, async () => '{}'), /janela livre/);
});

test('o prompt da IA leva compromissos fixos e a janela, e trata o conteúdo como dados', async () => {
  const repo = memRepo();
  const svc = new ActivityService(repo);
  await svc.create({ name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', blocks: [{ startTime: '08:00', endTime: '17:30' }] });
  const g = await svc.create({ ...goal, name: 'Academia', notBefore: '06:00', notAfter: '10:00' });
  const p = schedulePrompt(g, [360, 600], repo.rows);
  assert.match(p, /Trabalho: 08:00–17:30/);
  assert.match(p, /Não começar antes das 06:00/);
  assert.match(p, /Terminar antes das 10:00/);
});

test('o prompt da IA inclui deslocamentos vinculados a atividades de horário definido', async () => {
  const repo = memRepo();
  const svc = new ActivityService(repo);
  const trabalho = await svc.create({ name: 'Trabalho', kind: 'obligation', timeMode: 'fixed', blocks: [{ startTime: '08:00', endTime: '17:00' }], weekdays: [1, 2, 3, 4, 5] });
  const g = await svc.create({ ...goal, name: 'Academia' });
  const commute: Commute = {
    id: 'c1', name: 'Ida ao trabalho', activityId: trabalho.id, direction: 'before', durationMin: 20,
    active: true, remindTime: null, remindMinutes: null, remindChannels: [], createdAt: new Date(), updatedAt: new Date(),
  };
  const p = schedulePrompt(g, [360, 600], repo.rows, [commute]);
  assert.match(p, /Ida ao trabalho: seg 07:40–08:00, ter 07:40–08:00/);
});
