// v2.4: erro 22007 (mês como data), Outros na lista de Movimentações, custo de bem no crédito.
const test = require('node:test');
const assert = require('node:assert');
const { pool } = require('../backend/db');
const { dataPrimeiraParcela, mesProvavelFatura } = require('../backend/services/credito');

test('dataPrimeiraParcela: mês vira data completa com o dia de vencimento', () => {
  assert.strictEqual(dataPrimeiraParcela('2026-12', 15), '2026-12-15');
  assert.strictEqual(dataPrimeiraParcela('2026-12', 31), '2026-12-28');
  assert.strictEqual(dataPrimeiraParcela('2026-12-05', 15), '2026-12-05');
  assert.strictEqual(dataPrimeiraParcela('', 15), null);
  assert.strictEqual(dataPrimeiraParcela('dezembro', 15), null);
});
test('mesProvavelFatura: depois do fechamento cai no mês seguinte', () => {
  assert.strictEqual(mesProvavelFatura('2026-11-10', 20), '2026-11');
  assert.strictEqual(mesProvavelFatura('2026-11-25', 20), '2026-12');
  assert.strictEqual(mesProvavelFatura('2026-12-25', 20), '2027-01');
});

// Conexão falsa que age como o MariaDB em modo estrito: coluna DATE só aceita AAAA-MM-DD (senão erro 22007).
function falsa(log) {
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  return {
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, p = []) {
      const s = String(sql).replace(/\s+/g, ' ');
      log.push({ s, p });
      if (s.startsWith('SELECT diaFechamento')) return [{ diaFechamento: 20, diaVencimento: 27 }];
      if (s.startsWith('SELECT diaVencimento')) return [{ diaVencimento: 27 }];
      if (s.startsWith('INSERT INTO tbFinancas')) {
        const idx = s.match(/\(([^)]*)\) VALUES/)[1].split(',').map((x) => x.trim());
        for (const col of ['dataMovimentacao', 'primeiraFatura', 'dataInicioRecorrencia']) {
          const i = idx.indexOf(col); if (i >= 0 && p[i] != null && !DATE.test(p[i])) { const e = new Error(`Incorrect date value: '${p[i]}' for column '${col}'`); e.code = 'ER_TRUNCATED_WRONG_VALUE'; throw e; }
        }
        return { insertId: 10 };
      }
      if (s.startsWith('INSERT INTO tbComprasCartao')) { assert.match(p[7], DATE); return { insertId: 20 }; }
      if (s.startsWith('INSERT INTO tbParcelasCartao')) { assert.match(p[3], DATE); return { insertId: 30 + p[1] }; }
      if (s.startsWith('SELECT codFatura FROM tbFaturas')) return [];
      if (s.startsWith('INSERT INTO tbFaturas')) return { insertId: 40 };
      if (s.startsWith('INSERT INTO tbCustosBens')) return { insertId: 50 };
      if (s.includes('SUM(')) return [{ v: 0 }];
      if (s.startsWith('SELECT f.codFatura')) return [];
      if (s.startsWith('SELECT codCompra')) return [];
      return { insertId: 1 };
    },
  };
}
async function chamar(app, metodo, url, corpo) {
  const srv = await new Promise((res) => { const x = app.listen(0, '127.0.0.1', () => res(x)); });
  try {
    const r = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: r.status, json: await r.json() };
  } finally { srv.close(); }
}
const { app } = require('../backend/server');

test('crédito em 2 parcelas com primeiraFatura "AAAA-MM" não dá erro de data (bug 22007)', async () => {
  const log = []; const orig = pool.getConnection;
  pool.getConnection = async () => falsa(log);
  try {
    const r = await chamar(app, 'POST', '/api/app/movimentacoes', { dataMovimentacao: '2026-11-25', tipo: 'DESPESA', descricao: 'Compra', valor: 350, situacao: 'PREVISTA', formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 2, primeiraFatura: '2026-12' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    const ins = log.find((x) => x.s.startsWith('INSERT INTO tbFinancas'));
    assert.ok(ins.p.includes('2026-12-27'), 'primeiraFatura gravada como data');
    assert.strictEqual(log.filter((x) => x.s.startsWith('INSERT INTO tbParcelasCartao')).length, 2);
    assert.deepStrictEqual(log.filter((x) => x.s.startsWith('INSERT INTO tbParcelasCartao')).map((x) => x.p[3]), ['2026-12-27', '2027-01-27']);
  } finally { pool.getConnection = orig; }
});
test('crédito sem mês informado usa o mês provável pelo fechamento do cartão', async () => {
  const log = []; const orig = pool.getConnection; pool.getConnection = async () => falsa(log);
  try {
    const r = await chamar(app, 'POST', '/api/app/movimentacoes', { dataMovimentacao: '2026-11-25', tipo: 'DESPESA', descricao: 'Compra', valor: 100, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 1 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.ok(log.find((x) => x.s.startsWith('INSERT INTO tbFinancas')).p.includes('2026-12-27'));
  } finally { pool.getConnection = orig; }
});
test('despesa à vista com mês de fatura sobrando no formulário também não quebra', async () => {
  const log = []; const orig = pool.getConnection; pool.getConnection = async () => falsa(log);
  try {
    const r = await chamar(app, 'POST', '/api/app/movimentacoes', { dataMovimentacao: '2026-11-25', tipo: 'DESPESA', descricao: 'Pix', valor: 10, formaPagamento: 'PIX', primeiraFatura: '2026-11', quantidadeParcelas: 1 });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
  } finally { pool.getConnection = orig; }
});
test('custo de bem no crédito vira compra no cartão com parcelas', async () => {
  const log = []; const orig = pool.getConnection; pool.getConnection = async () => falsa(log);
  try {
    const r = await chamar(app, 'POST', '/api/app/bens/3/custos', { dataCusto: '2026-11-25', tipo: 'MANUTENCAO', descricao: 'Troca de óleo', valor: 300, situacao: 'PAGO', formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 3, primeiraFatura: '2026-12' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.strictEqual(log.filter((x) => x.s.startsWith('INSERT INTO tbParcelasCartao')).length, 3);
    assert.ok(log.some((x) => x.s.startsWith('INSERT INTO tbComprasCartao')));
  } finally { pool.getConnection = orig; }
});
test('custo de bem à vista continua como antes (sem compra no cartão)', async () => {
  const log = []; const orig = pool.getConnection; pool.getConnection = async () => falsa(log);
  try {
    const r = await chamar(app, 'POST', '/api/app/bens/3/custos', { dataCusto: '2026-11-25', tipo: 'REPARO', valor: 80, situacao: 'PAGO', formaPagamento: 'PIX' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.ok(!log.some((x) => x.s.startsWith('INSERT INTO tbComprasCartao')));
  } finally { pool.getConnection = orig; }
});
test('Movimentações de novembro traz a linha "Outros (fatura nu)" travada', async () => {
  const orig = pool.query;
  pool.query = async (sql) => {
    const s = String(sql);
    if (s.includes("chaveOrigem LIKE 'fatura-outros:%'")) return [{ codCompra: 9, valor: 3150, codFatura: 4, dataVencimento: '2026-11-15', nomeCartao: 'nu' }];
    if (s.includes('FROM tbFinancas f')) return [{ codFin: 1, dataMovimentacao: '2026-11-10', tipo: 'DESPESA', descricao: 'Mercado', valor: 350, situacao: 'EFETIVADA', formaPagamento: 'CREDITO', classeRegistro: 'MOVIMENTACAO' }];
    return [];
  };
  try {
    const r = await chamar(app, 'GET', '/api/app/movimentacoes?mes=2026-11');
    const linha = r.json.dados.find((x) => x.classeRegistro === 'OUTROS_FATURA');
    assert.ok(linha); assert.strictEqual(linha.descricao, 'Outros (fatura nu)'); assert.strictEqual(Number(linha.valor), 3150); assert.strictEqual(linha.travado, true);
    const f = await chamar(app, 'GET', '/api/app/movimentacoes?mes=2026-11&busca=mercado');
    assert.strictEqual(f.json.dados.length, 1);
  } finally { pool.query = orig; }
});
