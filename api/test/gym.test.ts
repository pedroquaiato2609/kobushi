import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG } from '../src/application/gym/catalog';
import { bestOf, detectPr, estimate1rm, levelReached, MUSCLES, normalizeName, recoveryOf, volumeOf } from '../src/domain/gym';

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
