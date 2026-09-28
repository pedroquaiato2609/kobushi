import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectiveBlocks as apiEffectiveBlocks, FREE_WINDOW as apiFree, PERIOD_WINDOW as apiPeriods, parseSuggestion, windowFor as apiWindow } from '../src/domain/schedule';
import { effectiveBlocks, FREE_WINDOW, PERIOD_WINDOW, placeFlexible, windowFor } from '../../web/src/lib/schedule';

const base = { period: null, notBefore: null, notAfter: null, durationMin: 60 } as const;

test('as janelas do front e da API são idênticas', () => {
  assert.deepEqual(PERIOD_WINDOW, apiPeriods);
  assert.deepEqual(FREE_WINDOW, apiFree);
  for (const a of [{ ...base, period: 'morning' as const, notBefore: '08:30' }, { ...base, notAfter: '20:00' }, { ...base, period: 'night' as const, notAfter: '19:00', durationMin: 90 }]) {
    assert.deepEqual(windowFor(a), apiWindow(a));
  }
});

test('effectiveBlocks: usa a exceção do dia (podendo ter mais de um bloco) quando existe, senão os blocos padrão; front e API concordam', () => {
  const a = {
    blocks: [{ startTime: '07:30', endTime: '11:30' }, { startTime: '13:30', endTime: '17:30' }],
    weekdayBlocks: [{ weekday: 0, blocks: [{ startTime: '09:00', endTime: '10:00' }] }, { weekday: 6, blocks: [{ startTime: '09:00', endTime: null }] }],
  };
  for (const d of [0, 1, 2, 3, 4, 5, 6]) assert.deepEqual(effectiveBlocks(a, d), apiEffectiveBlocks(a, d));
  assert.deepEqual(effectiveBlocks(a, 0), [{ startTime: '09:00', endTime: '10:00' }]); // domingo: exceção
  assert.deepEqual(effectiveBlocks(a, 6), [{ startTime: '09:00', endTime: null }]); // sábado: exceção sem fim
  assert.deepEqual(effectiveBlocks(a, 2), a.blocks); // terça: sem exceção, usa os blocos padrão (manhã + tarde)
});

test('janela = período ∩ "depois das" ∩ "antes das"; vazia quando não cabe', () => {
  assert.deepEqual(windowFor({ ...base, period: 'morning' }), [360, 720]);
  assert.deepEqual(windowFor({ ...base, period: 'morning', notBefore: '09:00' }), [540, 720]);
  assert.deepEqual(windowFor({ ...base, period: 'afternoon', notAfter: '15:00' }), [720, 900]);
  assert.deepEqual(windowFor({ ...base, notBefore: '18:00', notAfter: '20:00' }), [1080, 1200]);
  assert.equal(windowFor({ ...base, period: 'morning', notBefore: '13:00' }), null); // depois das 13h não é mais manhã
});

test('encaixe: desvia de compromissos e respeita a janela', () => {
  const busy = [{ start: 480, end: 1050 }]; // 08:00–17:30 (trabalho)
  const r = placeFlexible([{ id: 'a', window: [360, 720], durationMin: 60, suggestedStart: null }], busy);
  assert.deepEqual(r.get('a'), { start: 360, end: 420, fitted: true, inWindow: true, suggested: false }); // 06:00, antes do trabalho
  const night = placeFlexible([{ id: 'n', window: [1080, 1380], durationMin: 60, suggestedStart: null }], busy);
  assert.equal(night.get('n')!.start, 1080); // 18:00, logo depois
});

test('encaixe: sem vaga NO PERÍODO, tenta o resto do dia antes de desistir (evita cair em cima de outra coisa)', () => {
  const busy = [{ start: 480, end: 1050 }]; // 08:00–17:30 (trabalho)
  const semVagaNoPeriodo = placeFlexible([{ id: 'x', window: [540, 720], durationMin: 60, suggestedStart: null }], busy); // janela 09:00–12:00, tomada pelo trabalho
  const x = semVagaNoPeriodo.get('x')!;
  assert.equal(x.fitted, true); // achou depois, no resto do dia
  assert.equal(x.inWindow, false); // mas fora do período original
  assert.equal(x.start, 1050); // 17:30, assim que o trabalho libera
  // só cai de volta no início da janela (podendo colidir) quando o DIA INTEIRO está tomado
  const diaTodoTomado = placeFlexible([{ id: 'y', window: [540, 720], durationMin: 60, suggestedStart: null }], [{ start: 0, end: 1440 }]);
  assert.equal(diaTodoTomado.get('y')!.fitted, false);
});

test('encaixe: usa a sugestão da IA quando livre, ignora quando ocupada, e objetivos não se sobrepõem', () => {
  const ok = placeFlexible([{ id: 'a', window: [360, 720], durationMin: 60, suggestedStart: 420 }], []);
  assert.deepEqual(ok.get('a'), { start: 420, end: 480, fitted: true, inWindow: true, suggested: true });
  const clash = placeFlexible([{ id: 'a', window: [360, 720], durationMin: 60, suggestedStart: 420 }], [{ start: 400, end: 460 }]);
  assert.equal(clash.get('a')!.suggested, false);
  const two = placeFlexible([
    { id: 'a', window: [360, 720], durationMin: 60, suggestedStart: null },
    { id: 'b', window: [360, 720], durationMin: 60, suggestedStart: null },
  ], []);
  assert.notEqual(two.get('a')!.start, two.get('b')!.start);
  assert.ok(two.get('b')!.start >= two.get('a')!.end || two.get('a')!.start >= two.get('b')!.end);
});

test('encaixe: duas atividades que não cabem no mesmo período não caem no mesmo horário (o bug que gerava texto em cima do outro)', () => {
  const busy = [{ start: 480, end: 1050 }]; // 08:00–17:30 (trabalho ocupa quase o dia todo)
  const r = placeFlexible([
    { id: 'a', window: [540, 720], durationMin: 60, suggestedStart: null }, // 09:00–12:00, sem vaga
    { id: 'b', window: [540, 720], durationMin: 60, suggestedStart: null }, // mesma janela, também sem vaga
  ], busy);
  const a = r.get('a')!, b = r.get('b')!;
  assert.ok(a.fitted && b.fitted);
  assert.notEqual(a.start, b.start); // não ficam no mesmo horário
  assert.ok(b.start >= a.end || a.start >= b.end); // nem se sobrepõem
});

test('resposta da IA: só vale JSON com início dentro da janela', () => {
  const w: [number, number] = [540, 720];
  assert.deepEqual(parseSuggestion('```json\n{"start":"09:30","reason":"Foco de manhã"}\n```', w, 60), { start: '09:30', reason: 'Foco de manhã' });
  assert.equal(parseSuggestion('{"start":"08:00","reason":"x"}', w, 60), null); // antes da janela
  assert.equal(parseSuggestion('{"start":"11:30","reason":"x"}', w, 60), null); // terminaria depois do fim
  assert.equal(parseSuggestion('{"start":"9h","reason":"x"}', w, 60), null);
  assert.equal(parseSuggestion('sem json', w, 60), null);
});
