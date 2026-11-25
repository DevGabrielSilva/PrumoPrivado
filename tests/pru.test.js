const test = require('node:test');
const assert = require('node:assert');
const Pru = require('../JS/pru.js');

const ctx = { saldo: 3000, limiteSeguranca: 1000, poupado: 4000, objetivos: [{ descricao: 'Viagem', valorObjetivo: 10000, ativo: 1 }, { descricao: 'Moto', valorObjetivo: 30000, ativo: 1 }] };

test('lançamento comum cita o objetivo mais próximo', () => {
  const t = Pru.comentarioLancamento({ tipo: 'DESPESA', valor: 100, formaPagamento: 'PIX' }, ctx);
  assert.match(t, /Viagem/); assert.match(t, /5\.900,00/);
});
test('lançamento que deixa saldo negativo avisa', () => {
  assert.match(Pru.comentarioLancamento({ tipo: 'DESPESA', valor: 100 }, { ...ctx, saldo: -50 }), /negativo/);
});
test('abaixo da margem avisa quanto falta', () => {
  assert.match(Pru.comentarioLancamento({ tipo: 'DESPESA', valor: 100 }, { ...ctx, saldo: 700 }), /abaixo da sua margem/);
});
test('compra parcelada mostra parcela e meses', () => {
  const t = Pru.comentarioLancamento({ tipo: 'DESPESA', valor: 1200, formaPagamento: 'CREDITO', quantidadeParcelas: 6 }, ctx);
  assert.match(t, /6x/); assert.match(t, /200,00/);
});
test('poupar aproxima do objetivo; completar parabeniza', () => {
  assert.match(Pru.comentarioTransferencia({ destino: 'POUPANCA', valor: 500 }, ctx), /faltam R\$\s?5\.500,00/);
  assert.match(Pru.comentarioTransferencia({ destino: 'POUPANCA', valor: 7000 }, ctx), /completa/);
});
test('fatura: Outros, excedente e fatura que bateu', () => {
  assert.match(Pru.comentarioFatura({ valorTotal: 2000, outros: 500, excedente: 0 }), /500,00.*Outros/);
  assert.match(Pru.comentarioFatura({ valorTotal: 1400, outros: 0, excedente: 100 }), /100,00 a mais/);
  assert.match(Pru.comentarioFatura({ valorTotal: 1500, outros: 0, excedente: 0 }), /bateu/);
});
test('simulação: vermelho por N meses, amarelo e verde', () => {
  const v = Pru.comentarioSimulacao({ mesesNoVermelho: ['2027-01', '2027-02', '2027-03'], minimum: { saldo: -800 } }, { best: { mes: '2027-06' } });
  assert.strictEqual(v.nivel, 'VERMELHO'); assert.match(v.texto, /vermelho por 3 meses/); assert.match(v.texto, /junho\/2027/);
  assert.match(Pru.comentarioSimulacao({ mesesNoVermelho: ['2027-01'] }, null).texto, /por 1 mês /);
  assert.strictEqual(Pru.comentarioSimulacao({ mesesPertoDaMargem: ['2027-01'] }, { firstPossible: { mes: '2027-03' } }).nivel, 'AMARELO');
  assert.strictEqual(Pru.comentarioSimulacao({}, null).nivel, 'VERDE');
  assert.strictEqual(Pru.comentarioSimulacao({ jaNegativoSemACompra: true }, null).nivel, 'VERMELHO');
});
test('frase do dia prioriza fatura fechada e saldo negativo', () => {
  assert.match(Pru.comentarioDiario(ctx, { faturas: [{ tipo: 'FATURA_FECHOU', nomeCartao: 'Nubank' }] }), /Nubank/);
  assert.match(Pru.comentarioDiario({ ...ctx, saldo: -10 }, {}), /negativo/);
});
