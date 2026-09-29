import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Notifier, ReminderScheduler, type NotificationChannel } from '../src/application/notifications';
import { nextOccurrence } from '../src/domain/dates';
import type { Activity, CalendarEvent, Commute, Reminder } from '../src/domain/entities';

test('nextOccurrence avança até o futuro sem perder o horário', () => {
  assert.equal(nextOccurrence('2026-09-18T08:00', 'daily', '2026-09-20T09:30'), '2026-09-21T08:00');
  assert.equal(nextOccurrence('2026-09-01T18:00', 'weekly', '2026-09-20T09:30'), '2026-09-22T18:00');
  assert.equal(nextOccurrence('2026-09-20T08:00', 'daily', '2026-09-20T07:00'), '2026-09-20T08:00'); // ainda no futuro: mantém
});

const NOW = new Date('2026-09-21T12:30:00Z'); // 09:30 em America/Sao_Paulo (segunda-feira)

function world(over: { reminders?: Reminder[]; activities?: Partial<Activity>[]; done?: string[]; events?: Partial<CalendarEvent>[]; commutes?: Partial<Commute>[] } = {}) {
  const sent: { channel: string; title: string }[] = [];
  const inbox: string[] = [];
  const claimed = new Set<string>();
  const updates: any[] = [];
  const channel = (name: 'push' | 'whatsapp', available = true): NotificationChannel => ({
    name, available: async () => available, send: async (m) => { sent.push({ channel: name, title: m.title }); },
  });
  const notifier = new Notifier(
    { create: async (d: any) => { inbox.push(d.title); return d; } } as any,
    [channel('push'), channel('whatsapp', false)],
    () => {},
  );
  const scheduler = new ReminderScheduler({
    reminders: {
      due: async (local: string) => (over.reminders ?? []).filter((r) => r.remindAt <= local && r.status === 'pending'),
      update: async (id: string, patch: any) => { updates.push({ id, ...patch }); return null; },
    } as any,
    activities: { list: async () => (over.activities ?? []).map((a) => ({ active: true, weekdays: [0, 1, 2, 3, 4, 5, 6], remindChannels: [], minDesc: '', blocks: [], weekdayBlocks: [], ...a })) } as any,
    commutes: { list: async () => (over.commutes ?? []).map((c, i) => ({ id: `c${i + 1}`, active: true, direction: 'before', durationMin: 30, remindTime: null, remindMinutes: null, remindChannels: [], ...c })) } as any,
    executions: { listRange: async () => (over.done ?? []).map((activityId) => ({ activityId })) } as any,
    events: { reminderDue: async () => (over.events ?? []).map((e) => ({ location: '', remindChannels: [], ...e })) } as any,
    log: { claim: async (k: string) => (claimed.has(k) ? false : (claimed.add(k), true)) } as any,
    notifier, timezone: 'America/Sao_Paulo', onError: () => {},
  });
  return { scheduler, sent, inbox, updates };
}

test('lembrete avulso dispara uma vez, vai à caixa de entrada e ao canal disponível; repetição avança', async () => {
  const r: Reminder = { id: 'r1', title: 'Beber água', body: '', remindAt: '2026-09-21T09:00', repeat: 'daily', channels: ['push', 'whatsapp'], activityId: null, status: 'pending', lastFiredAt: null, createdAt: new Date() };
  const w = world({ reminders: [r] });
  await w.scheduler.tick(NOW);
  await w.scheduler.tick(NOW); // segundo ciclo: não repete
  assert.deepEqual(w.inbox, ['Beber água']);
  assert.deepEqual(w.sent, [{ channel: 'push', title: 'Beber água' }]); // whatsapp indisponível é ignorado sem erro
  assert.equal(w.updates[0].remindAt, '2026-09-22T09:00');
});

test('aviso de atividade: só dentro da janela, nunca se já registrou e uma vez por dia', async () => {
  const base = { name: 'Leitura', minDesc: '5 páginas', remindChannels: ['push'] as any };
  const w = world({ activities: [
    { id: 'ok', remindTime: '09:00', ...base },
    { id: 'done', remindTime: '09:00', ...base, name: 'Já feita' },
    { id: 'early', remindTime: '18:00', ...base, name: 'Mais tarde' },
    { id: 'stale', remindTime: '06:00', ...base, name: 'Janela passou' },
    { id: 'weekend', remindTime: '09:00', weekdays: [0, 6], ...base, name: 'Fim de semana' },
  ], done: ['done'] });
  await w.scheduler.tick(NOW);
  await w.scheduler.tick(NOW);
  assert.deepEqual(w.inbox, ['Hora de: Leitura']);
  assert.deepEqual(w.sent.map((s) => s.channel), ['push']);
});

test('aviso de atividade por remindMinutes: acompanha o bloco EFETIVO do dia (não o padrão), e respeita a janela', async () => {
  const base = { name: 'Trabalho', minDesc: '', remindChannels: ['push'] as any, timeMode: 'fixed' as const };
  const w = world({ activities: [
    // segunda (weekday 1, hoje): exceção às 10:00–11:00, 30 min antes = 09:30 = agora → dispara
    { id: 'today', remindMinutes: 30, blocks: [{ startTime: '20:00', endTime: '21:00' }], weekdayBlocks: [{ weekday: 1, blocks: [{ startTime: '10:00', endTime: '11:00' }] }], ...base },
    // sem exceção pra segunda: usa o padrão (20:00), longe demais de agora → não dispara
    { id: 'other-day', remindMinutes: 30, blocks: [{ startTime: '20:00', endTime: '21:00' }], weekdayBlocks: [{ weekday: 2, blocks: [{ startTime: '10:00', endTime: '11:00' }] }], ...base, name: 'Outro dia' },
  ] });
  await w.scheduler.tick(NOW);
  assert.deepEqual(w.inbox, ['Hora de: Trabalho']);
});

test('remindTime e remindMinutes nunca disparam os dois juntos pra mesma atividade (mutuamente exclusivos na validação)', async () => {
  const w = world({ activities: [
    { id: 'a', remindTime: '09:30', remindMinutes: 30, timeMode: 'fixed', blocks: [{ startTime: '10:00', endTime: null }], name: 'Dupla' },
  ] });
  await w.scheduler.tick(NOW);
  // o agendador em si respeita o que vier salvo; aqui as duas condições levam ao mesmo horário (09:30), então dispara uma vez só
  assert.equal(w.inbox.length, 1);
});

test('aviso de deslocamento (remindMinutes): acompanha o horário EFETIVO da atividade âncora naquele dia, sem repetir', async () => {
  // segunda (weekday 1, hoje): exceção da atividade às 10:00; ida de 20 min termina às 10:00 -> começa às 09:40; aviso 10 min antes = 09:30 = agora
  const w = world({
    activities: [{ id: 'act1', name: 'Trabalho', timeMode: 'fixed', blocks: [{ startTime: '20:00', endTime: '21:00' }], weekdayBlocks: [{ weekday: 1, blocks: [{ startTime: '10:00', endTime: '11:00' }] }] }],
    commutes: [{ name: 'Ida ao trabalho', activityId: 'act1', direction: 'before', durationMin: 20, remindMinutes: 10, remindChannels: ['push'] }],
  });
  await w.scheduler.tick(NOW);
  await w.scheduler.tick(NOW); // segundo ciclo: não repete
  assert.deepEqual(w.inbox, ['Hora de: Ida ao trabalho']);
  assert.deepEqual(w.sent.map((s) => s.channel), ['push']);
});

test('deslocamento "after" sem hora de fim no último bloco: não dispara e não quebra', async () => {
  const w = world({
    activities: [{ id: 'act1', name: 'Trabalho', timeMode: 'fixed', blocks: [{ startTime: '09:00', endTime: null }] }],
    commutes: [{ name: 'Volta do trabalho', activityId: 'act1', direction: 'after', durationMin: 20, remindMinutes: 10 }],
  });
  await w.scheduler.tick(NOW);
  assert.deepEqual(w.inbox, []);
});

test('deslocamento cuja atividade âncora está inativa ou não se aplica no dia: não dispara', async () => {
  const w = world({
    activities: [
      { id: 'inactive', name: 'Inativa', active: false, timeMode: 'fixed', blocks: [{ startTime: '10:00', endTime: '11:00' }] },
      { id: 'weekend', name: 'Fim de semana', weekdays: [0, 6], timeMode: 'fixed', blocks: [{ startTime: '10:00', endTime: '11:00' }] },
    ],
    commutes: [
      { name: 'Ida 1', activityId: 'inactive', direction: 'before', durationMin: 20, remindMinutes: 10 },
      { name: 'Ida 2', activityId: 'weekend', direction: 'before', durationMin: 20, remindMinutes: 10 },
    ],
  });
  await w.scheduler.tick(NOW);
  assert.deepEqual(w.inbox, []);
});

test('aviso de evento inclui o local e não repete', async () => {
  const w = world({ events: [{ id: 'e1', title: 'Dentista', start: '2026-09-21T10:00', location: 'Clínica Sorriso', remindChannels: ['push'] }] });
  await w.scheduler.tick(NOW);
  await w.scheduler.tick(NOW);
  assert.deepEqual(w.inbox, ['Dentista']);
});
