import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG } from '../src/application/gym/catalog';
import { bestOf, cardioLevelReached, detectPr, estimate1rm, EQUIPMENT, levelReached, MUSCLES, normalizeName, recoveryOf, volumeOf } from '../src/domain/gym';

test('1RM estimado (Epley): uma repetição vale a carga; mais repetições elevam a estimativa', () => {
  assert.equal(estimate1rm(100, 1), 100);
  assert.equal(estimate1rm(100, 10), 133.3);
  assert.equal(estimate1rm(0, 10), 0);
  assert.equal(estimate1rm(80, 0), 0);
});

test('volume e melhor marca', () => {
  const sets = [{ reps: 10, weight: 40 }, { reps: 8, weight: 50 }];
  assert.equal(volumeOf(sets), 800);
  assert.deepEqual(bestOf(sets), { weight: 50, e1rm: 63.3 });
  assert.deepEqual(bestOf([]), { weight: 0, e1rm: 0 });
});

test('recorde: a primeira vez nunca é PR; depois só quando supera carga ou 1RM', () => {
  assert.deepEqual(detectPr([], { reps: 8, weight: 100 }), []);
  const prev = [{ reps: 8, weight: 100 }];
  assert.deepEqual(detectPr(prev, { reps: 8, weight: 100 }), []); // igual não é recorde
  assert.deepEqual(detectPr(prev, { reps: 8, weight: 105 }).sort(), ['e1rm', 'weight']);
  assert.deepEqual(detectPr(prev, { reps: 12, weight: 100 }), ['e1rm']); // mesma carga, mais repetições
  assert.deepEqual(detectPr(prev, { reps: 1, weight: 110 }), ['weight']); // mais pesado, mas 1RM estimado menor
  assert.deepEqual(detectPr(prev, { reps: 5, weight: 90 }), []);
  assert.deepEqual(detectPr(prev, { reps: 0, weight: 200 }), []); // série sem repetições não conta
});

test('nível atingido: o maior de mínimo/ideal/máximo cuja carga e repetições foram cumpridas', () => {
  const t = { min: { sets: 2, reps: 6, weight: 40 }, ideal: { sets: 3, reps: 8, weight: 50 }, max: { sets: 4, reps: 10, weight: 60 } };
  assert.equal(levelReached({ reps: 5, weight: 40 }, t), null);
  assert.equal(levelReached({ reps: 6, weight: 40 }, t), 'min');
  assert.equal(levelReached({ reps: 8, weight: 50 }, t), 'ideal');
  assert.equal(levelReached({ reps: 10, weight: 60 }, t), 'max');
  assert.equal(levelReached({ reps: 12, weight: 45 }, t), 'min'); // reps sobrando não compensam a carga do ideal
  assert.equal(levelReached({ reps: 8, weight: 50 }, {}), null);
});

test('cardio: nível atingido cumpre a duração E/OU a distância definidas em cada nível (não séries/reps/carga)', () => {
  const t = { min: { durationMin: 15, distanceKm: null }, ideal: { durationMin: 25, distanceKm: 3 }, max: { durationMin: 40, distanceKm: 5 } };
  assert.equal(cardioLevelReached({ durationSeconds: 600, distanceKm: 0 }, t), null); // 10 min: nem o mínimo
  assert.equal(cardioLevelReached({ durationSeconds: 900, distanceKm: 0 }, t), 'min'); // 15 min
  assert.equal(cardioLevelReached({ durationSeconds: 1500, distanceKm: 2 }, t), 'min'); // 25 min mas só 2 km: ideal exige os dois
  assert.equal(cardioLevelReached({ durationSeconds: 1500, distanceKm: 3 }, t), 'ideal');
  assert.equal(cardioLevelReached({ durationSeconds: 2400, distanceKm: 5 }, t), 'max');
  assert.equal(cardioLevelReached({ durationSeconds: 3600, distanceKm: 10 }, {}), null); // sem metas definidas
  // nível com só duração (distanceKm null): distância não entra na conta
  const soDuracao = { ideal: { durationMin: 20, distanceKm: null } };
  assert.equal(cardioLevelReached({ durationSeconds: 1200, distanceKm: 0 }, soDuracao), 'ideal');
});

test('cardio: meta de velocidade (km/h) é derivada da distância ÷ tempo da própria série', () => {
  const t = { min: { speedKmh: 8 }, ideal: { speedKmh: 10 }, max: { speedKmh: 12 } };
  assert.equal(cardioLevelReached({ durationSeconds: 1800, distanceKm: 3 }, t), null); // 3km em 30min = 6 km/h: nem o mínimo
  assert.equal(cardioLevelReached({ durationSeconds: 1800, distanceKm: 4 }, t), 'min'); // 4km em 30min = 8 km/h
  assert.equal(cardioLevelReached({ durationSeconds: 1800, distanceKm: 5 }, t), 'ideal'); // 10 km/h
  assert.equal(cardioLevelReached({ durationSeconds: 1800, distanceKm: 6 }, t), 'max'); // 12 km/h
  // combinada com duração: só conta se cumprir os dois
  const combo = { ideal: { durationMin: 20, speedKmh: 10 } };
  assert.equal(cardioLevelReached({ durationSeconds: 900, distanceKm: 2.5 }, combo), null); // 15 min (10 km/h, mas duração curta)
  assert.equal(cardioLevelReached({ durationSeconds: 1200, distanceKm: 3.5 }, combo), 'ideal'); // 20 min e ~10,5 km/h
});

test('equipamentos de cardio existem e o catálogo tem pelo menos 20 exercícios de cardio cobrindo vários deles', () => {
  for (const eq of ['treadmill', 'bike', 'stairs', 'rowing_machine', 'elliptical', 'jump_rope', 'pool'] as const) assert.ok((EQUIPMENT as readonly string[]).includes(eq));
  const cardio = CATALOG.filter((c) => c.kind === 'cardio');
  assert.ok(cardio.length >= 20, `esperava pelo menos 20 exercícios de cardio, achei ${cardio.length}`);
  const equipmentsUsed = new Set(cardio.map((c) => c.equipment));
  assert.ok(equipmentsUsed.size >= 5, 'cardio deveria cobrir vários equipamentos diferentes (esteira, bike, escada...)');
});

test('recuperação muscular: 100% em 72 h, nunca treinado = pronto', () => {
  const now = new Date('2026-09-21T12:00:00Z');
  const r = recoveryOf({ pectoral_major: '2026-09-20T12:00:00Z', quadriceps: '2026-09-10T12:00:00Z' }, now);
  const get = (m: string) => r.find((x) => x.muscle === m)!;
  assert.equal(get('pectoral_major').recoveryPct, 33); // 24 h de 72
  assert.equal(get('pectoral_major').ready, false);
  assert.equal(get('quadriceps').ready, true);
  assert.equal(get('biceps_brachii').lastTrainedAt, null);
  assert.equal(get('biceps_brachii').ready, true);
  assert.equal(r.length, MUSCLES.length);
});

test('catálogo: nomes únicos, músculos válidos, cada músculo só numa categoria por exercício', () => {
  const names = new Set<string>();
  for (const c of CATALOG) {
    const n = normalizeName(c.name);
    assert.ok(!names.has(n), `duplicado: ${c.name}`); names.add(n);
    assert.ok(c.primary.length >= 1, `${c.name}: precisa de ao menos um músculo principal`);
    for (const m of [...c.primary, ...c.secondary, ...c.stabilizer]) assert.ok((MUSCLES as readonly string[]).includes(m), `${c.name}: músculo desconhecido ${m}`);
    for (const m of c.primary) { assert.ok(!c.secondary.includes(m), `${c.name}: ${m} em principal e secundário`); assert.ok(!c.stabilizer.includes(m), `${c.name}: ${m} em principal e estabilizador`); }
    for (const m of c.secondary) assert.ok(!c.stabilizer.includes(m), `${c.name}: ${m} em secundário e estabilizador`);
    assert.ok(c.instructions.length > 10 && c.tips.length > 5, c.name);
  }
  assert.ok(CATALOG.length >= 60);
  // Todo músculo do vocabulário aparece em pelo menos um exercício (em qualquer das três categorias) — sem entradas mortas.
  for (const m of MUSCLES) assert.ok(CATALOG.some((c) => c.primary.includes(m) || c.secondary.includes(m) || c.stabilizer.includes(m)), `nenhum exercício usa ${m}`);
});
