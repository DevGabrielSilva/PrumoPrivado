const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { numero, sugerirTotal } = require('../backend/services/importar-fatura');
const { lembretesFatura, fechamentos, vencimentoDe } = require('../backend/services/lembretes');

test('numero lê formatos brasileiro e americano', () => {
  assert.strictEqual(numero('R$ 1.234,56'), 1234.56);
  assert.strictEqual(numero('1234.56'), 1234.56);
  assert.strictEqual(numero('-50,00'), -50);
});
test('CSV: soma compras e ignora pagamento/estorno', () => {
  const csv = 'date,title,amount\n2026-11-01,Mercado,100.50\n2026-11-02,Pagamento recebido,-300.00\n2026-11-03,Cinema,49.50\n';
  const r = sugerirTotal(Buffer.from(csv), 'fatura.csv');
  assert.strictEqual(r.total, 150); assert.strictEqual(r.itens, 2);
});
test('CSV brasileiro com ponto e vírgula', () => {
  const csv = 'Data;Descrição;Valor\n01/11;Padaria;12,30\n02/11;Estorno compra;5,00\n03/11;Posto;200,00\n';
  assert.strictEqual(sugerirTotal(Buffer.from(csv), 'x.csv').total, 212.3);
});
test('texto com rótulo "Total da fatura"', () => {
  assert.strictEqual(sugerirTotal(Buffer.from('Resumo\nTotal da fatura: R$ 2.345,67\nVencimento 10/12'), 'x.txt').total, 2345.67);
});
test('PDF simples com fluxo comprimido', () => {
  const conteudo = 'BT /F1 12 Tf (Total da fatura) Tj (R$ 1.999,90) Tj ET';
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n1 0 obj\n<< /Filter /FlateDecode >>\nstream\n'), zlib.deflateSync(conteudo), Buffer.from('\nendstream\nendobj\n%%EOF')]);
  const r = sugerirTotal(pdf, 'fatura.pdf');
  assert.strictEqual(r.total, 1999.9);
});
test('arquivo sem total devolve sugestão vazia, nunca inventa', () => {
  assert.strictEqual(sugerirTotal(Buffer.from('nada aqui'), 'x.txt').total, null);
  assert.strictEqual(sugerirTotal(Buffer.from('%PDF-1.4 sem texto'), 'x.pdf').total, null);
});

const cartao = { codCartao: 1, nomeCartao: 'Nubank', diaFechamento: 20, diaVencimento: 27, ativo: 1 };
test('fechamento e vencimento de um cartão', () => {
  const f = fechamentos(cartao, '2026-11-25');
  assert.strictEqual(f.ultimo.getDate(), 20); assert.strictEqual(f.proximo.getMonth(), 11);
  assert.strictEqual(vencimentoDe(cartao, f.ultimo).getDate(), 27);
});
test('lembrete: fatura fechou há 5 dias e total não informado', () => {
  const l = lembretesFatura([cartao], '2026-11-25', () => false);
  assert.strictEqual(l.length, 1); assert.strictEqual(l[0].tipo, 'FATURA_FECHOU'); assert.strictEqual(l[0].competencia, '2026-11');
});
test('sem lembrete quando o total já foi informado ou passou da janela', () => {
  assert.strictEqual(lembretesFatura([cartao], '2026-11-25', () => true).length, 0);
  assert.strictEqual(lembretesFatura([cartao], '2026-12-05', () => false).length, 0);
});
test('aviso de fatura que fecha em breve', () => {
  const l = lembretesFatura([cartao], '2026-12-18', () => true);
  assert.deepStrictEqual(l.map((x) => x.tipo), ['FATURA_FECHA_EM_BREVE']);
});
