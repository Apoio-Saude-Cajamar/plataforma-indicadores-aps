import test from 'node:test';
import assert from 'node:assert/strict';
await import('../painel/js/estadual-regras.js');
const R = globalThis.ESTADUAL_REGRAS;

test('os pesos somam 10', () => assert.equal(+R.ITENS.reduce((t, i) => t + i.peso, 0).toFixed(6), 10));
test('cobertura da eSF: 20 equipes em 100 mil dá 70%', () => { assert.equal(R.cobertura(20, 100000), 70); assert.equal(R.esf(20, 100000).pct, 1); assert.equal(R.esf(19, 100000).pct, 0.5); assert.equal(R.esf(5, 100000).pct, 0.25); assert.equal(R.esf(4, 100000).pct, 0); });
test('vacina: de 95% ou mais', () => {
  assert.equal(R.vacina(98, 99, 90, 95).pct, 1);
  assert.equal(R.vacina(93, 99, 90, 95).pct, 0.75);
  assert.equal(R.vacina(80, 99, 90, 95).pct, 0);
});
test('vacina: entre a mediana e 95%', () => {
  assert.equal(R.vacina(94, 92, 90, 95).pct, 1);
  assert.equal(R.vacina(91, 92, 90, 95).pct, 0.75);
  assert.equal(R.vacina(89, 92, 90, 95).pct, 0);
});
test('vacina: abaixo da mediana', () => {
  assert.equal(R.vacina(91, 85, 90, 95).pct, 1);
  assert.equal(R.vacina(86, 85, 90, 95).pct, 0.5);
  assert.equal(R.vacina(80, 85, 90, 95).pct, 0);
});
test('vacina sem dado fica pendente', () => assert.equal(R.vacina(98, null, 90, 95).pct, null));
test('internações, sífilis e LIRAa', () => {
  assert.equal(R.internacoes(20, 25).pct, 1); assert.equal(R.internacoes(25, 25).pct, 0.5);
  assert.equal(R.sifilis(90).pct, 1); assert.equal(R.sifilis(89.9).pct, 0);
  assert.equal(R.liraa(1).pct, 1); assert.equal(R.liraa(0).pct, 0);
});
test('mortalidade infantil por quartil', () => {
  assert.equal(R.mortalidade(1, 5, 1, 6).pct, 1); assert.equal(R.mortalidade(2, 9, 1, 6).pct, 0.5); assert.equal(R.mortalidade(3, 12, 1, 6).pct, 0);
  assert.equal(R.mortalidade(1, 6, 2, 9).pct, 1); assert.equal(R.mortalidade(2, 8, 2, 9).pct, 1); assert.equal(R.mortalidade(2, 10, 2, 9).pct, 0.5);
  assert.equal(R.mortalidade(2, 9, 3, 12).pct, 1); assert.equal(R.mortalidade(3, 11, 3, 12).pct, 0.5); assert.equal(R.mortalidade(3, 13, 3, 12).pct, 0);
});
test('nota: soma ponderada e ponto extra', () => {
  const todos = R.ITENS.map(i => ({ peso: i.peso, pct: 1 }));
  assert.equal(R.nota(todos, true).final, 1);
  const meio = R.ITENS.map(i => ({ peso: i.peso, pct: 0.5 }));
  assert.ok(Math.abs(R.nota(meio, false).final - 0.5) < 1e-9);
  assert.ok(Math.abs(R.nota(meio, true).final - 0.6) < 1e-9);
  const parcial = [{ peso: 1.3, pct: 1 }, { peso: 0.8, pct: null }];
  assert.equal(R.nota(parcial, false).completo, false);
});
