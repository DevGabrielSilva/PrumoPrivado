// Testes das funções puras de apoio (sem banco de dados).
const test = require('node:test');
const assert = require('node:assert');
const { money, validDate, ym, addMonths } = require('../backend/helpers');
const { applies } = require('../backend/services/core');

test('money converte valores para número com segurança', () => {
  assert.strictEqual(money(5), 5);
  assert.strictEqual(money('3.5'), 3.5);
  assert.strictEqual(money(null), 0);
  assert.strictEqual(money(undefined), 0);
  assert.strictEqual(money(''), 0);
});

test('validDate aceita apenas AAAA-MM-DD', () => {
  assert.strictEqual(validDate('2026-11-25'), true);
  assert.strictEqual(validDate('25/11/2026'), false);
  assert.strictEqual(validDate(''), false);
  assert.strictEqual(validDate(null), false);
});

test('ym extrai o ano-mês', () => {
  assert.strictEqual(ym('2026-11-25'), '2026-11');
});

test('addMonths avança meses sem estourar o dia', () => {
  const d = addMonths('2026-01-15', 1);
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 1); // fevereiro
  assert.strictEqual(d.getDate(), 1);
  const y = addMonths('2026-12-10', 1);
  assert.strictEqual(y.getFullYear(), 2027);
  assert.strictEqual(y.getMonth(), 0); // janeiro
});

test('applies: recorrência mensal vale do início ao fim', () => {
  const modelo = { dataMovimentacao: '2026-01-10', frequencia: 'MENSAL' };
  const jan = [new Date(2026, 0, 1), new Date(2026, 0, 31, 23, 59, 59)];
  const dez = [new Date(2025, 11, 1), new Date(2025, 11, 31, 23, 59, 59)];
  assert.strictEqual(applies(modelo, ...jan), true);
  assert.strictEqual(applies(modelo, ...dez), false); // começa só em janeiro
  const comFim = { ...modelo, dataFimRecorrencia: '2026-03-10' };
  const abr = [new Date(2026, 3, 1), new Date(2026, 3, 30, 23, 59, 59)];
  assert.strictEqual(applies(comFim, ...abr), false); // terminou em março
});

test('applies: recorrência anual só se repete no mesmo mês', () => {
  const anual = { dataMovimentacao: '2026-01-10', frequencia: 'ANUAL' };
  const jan2027 = [new Date(2027, 0, 1), new Date(2027, 0, 31, 23, 59, 59)];
  const fev2027 = [new Date(2027, 1, 1), new Date(2027, 1, 28, 23, 59, 59)];
  assert.strictEqual(applies(anual, ...jan2027), true);
  assert.strictEqual(applies(anual, ...fev2027), false);
});
