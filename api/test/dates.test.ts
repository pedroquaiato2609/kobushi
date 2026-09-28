import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, diffDays, eachDay, weekdayOf } from '../src/domain/dates';

test('addDays atravessa meses e anos', () => {
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('weekdayOf: 0 = domingo', () => {
  assert.equal(weekdayOf('2026-09-20'), 0); // domingo
  assert.equal(weekdayOf('2026-09-21'), 1);
});

test('eachDay e diffDays', () => {
  assert.deepEqual(eachDay('2026-09-29', '2026-10-02'), ['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  assert.equal(diffDays('2026-09-01', '2026-09-20'), 19);
});
