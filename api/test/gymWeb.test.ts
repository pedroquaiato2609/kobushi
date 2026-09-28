import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimate1rm as apiE1rm } from '../src/domain/gym';
import { estimate1rm, fmtClock, fmtDuration, fmtKg, fmtNum, fmtSets, fmtVolume, pickTarget, restLeft } from '../../web/src/lib/gym';
import { MUSCLES as apiMuscles } from '../src/domain/gym';
import { MUSCLE_LABEL, MUSCLE_VIEW, MUSCLE_ZONE, MUSCLES, MUSCLES_BY_ZONE, ZONES, ZONE_LABEL } from '../../web/src/lib/muscles';

test('cronômetro: mm:ss e h:mm:ss', () => {
  assert.equal(fmtClock(0), '0:00'); assert.equal(fmtClock(65), '1:05'); assert.equal(fmtClock(3599), '59:59');
  assert.equal(fmtClock(3725), '1:02:05'); assert.equal(fmtClock(-5), '0:00');
});
test('descanso: contagem regressiva nunca fica negativa e acompanha o relógio (não os "ticks")', () => {
  const start = 1_000_000;
  assert.equal(restLeft(start + 90_000, start), 90);
  assert.equal(restLeft(start + 90_000, start + 30_500), 60); // aba em segundo plano: recalcula pelo horário real
  assert.equal(restLeft(start + 90_000, start + 200_000), 0);
});
test('formatação em português: vírgula decimal, duração e volume', () => {
  assert.equal(fmtNum(72.5), '72,5'); assert.equal(fmtKg(80), '80 kg'); assert.equal(fmtKg(72.5), '72,5 kg');
  assert.equal(fmtSets([{ reps: 8, weight: 70 }, { reps: 6, weight: 72.5 }]), '8×70 · 6×72,5');
  assert.equal(fmtDuration(50), '50 s'); assert.equal(fmtDuration(42 * 60), '42 min'); assert.equal(fmtDuration(3900), '1 h 05 min');
  assert.equal(fmtVolume(800), '800 kg'); assert.equal(fmtVolume(2610), '2,6 t');
});
test('1RM do front é igual ao da API', () => {
  for (const [w, r] of [[100, 1], [100, 10], [72.5, 6], [0, 8], [60, 0]]) assert.equal(estimate1rm(w, r), apiE1rm(w, r));
});
test('meta usada para preencher: a escolhida, senão ideal, senão a primeira definida', () => {
  const t = { min: { sets: 2, reps: 6, weight: 40 }, max: { sets: 4, reps: 10, weight: 60 } };
  assert.equal(pickTarget(t, 'max')?.level, 'max');
  assert.equal(pickTarget(t, null)?.level, 'min'); // sem ideal: cai no mínimo
  assert.equal(pickTarget({}, null), null);
});
test('músculos do front e da API são os mesmos, e todos têm nome específico e vista', () => {
  assert.deepEqual([...MUSCLES], [...apiMuscles]);
  for (const m of MUSCLES) { assert.ok(MUSCLE_LABEL[m]); assert.ok(MUSCLE_VIEW[m].length >= 1); }
});
test('cada músculo pertence a exatamente uma região desenhada, e toda região é usada', () => {
  for (const m of MUSCLES) assert.ok(ZONES.includes(MUSCLE_ZONE[m]), `${m} sem região`);
  for (const z of ZONES) { assert.ok(ZONE_LABEL[z]); assert.ok(MUSCLES_BY_ZONE[z].length >= 1, `região ${z} sem músculo`); }
  assert.equal(ZONES.reduce((n, z) => n + MUSCLES_BY_ZONE[z].length, 0), MUSCLES.length); // partição: soma bate com o total
});
