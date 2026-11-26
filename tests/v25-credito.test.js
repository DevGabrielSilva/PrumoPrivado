// v2.5: gasto fixo no crédito é estimativa dentro da fatura, sem contar em dobro.
const test = require('node:test');
const assert = require('node:assert');
const { pool } = require('../backend/db');
const { estimativasCartao } = require('../backend/services/core');
const { app } = require('../backend/server');
const http = require('node:http');

async function chamar(metodo, url, corpo) {
  const srv = http.createServer(app);
  await new Promise((r) => srv.listen(0, r));
  try {
    const res = await fetch(`http://127.0.0.1:${srv.address().port}${url}`, { method: metodo, headers: { 'content-type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } finally { srv.close(); }
}

// Cenário: cartão 1, dezembro/2026. Estimativa: gasolina moto R$ 120 (Transporte) e streaming R$ 40 (Lazer).
function banco({ faturaOficial }) {
  const occ = [
    { codOcorrencia: 1, valor: 120, dataPrevista: '2026-12-10', descricao: 'gasolina moto', categoria: 'Transporte', codCartao: 1 },
    { codOcorrencia: 2, valor: 40, dataPrevista: '2026-12-10', descricao: 'streaming', categoria: 'Lazer', codCartao: 1 },
  ];
  return async (sql) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.includes("m.formaPagamento='CREDITO' ORDER BY")) return occ;
    // avulsa 50 + parcela de compra parcelada 30, ambas Transporte no cartão 1 (já saem na fatura)
    if (s.includes('GROUP BY x.codCartao,categoria')) return [{ codCartao: 1, categoria: 'Transporte', v: 80 }];
    if (s.startsWith('SELECT f.codCartao,f.valorInformado')) return [{ codCartao: 1, valorInformado: faturaOficial ? 500 : 0, dataVencimento: '2026-12-27' }];
    if (s.startsWith('SELECT codCartao,nomeCartao')) return [{ codCartao: 1, nomeCartao: 'Nubank', diaVencimento: 27 }];
    return [];
  };
}

test('estimativa: compras avulsas e parceladas da mesma categoria e cartão abatem, sem dobrar', async () => {
  const c = { query: banco({ faturaOficial: false }) };
  const r = await estimativasCartao('2026-12', c);
  const g = r.itens.find((x) => x.codOcorrencia === 1), l = r.itens.find((x) => x.codOcorrencia === 2);
  assert.strictEqual(g.abatido, 80); assert.strictEqual(g.restante, 40);
  assert.strictEqual(l.abatido, 0); assert.strictEqual(l.restante, 40);
  assert.strictEqual(r.total, 80);
  assert.strictEqual(g.data, '2026-12-27');
});

test('estimativa: compras acima da estimativa zeram o restante (nunca negativo)', async () => {
  const q = banco({ faturaOficial: false });
  const r = await estimativasCartao('2026-12', { query: async (s, p) => (String(s).includes('GROUP BY x.codCartao,categoria') ? [{ codCartao: 1, categoria: 'transporte', v: 300 }] : q(s, p)) });
  assert.strictEqual(r.itens.find((x) => x.codOcorrencia === 1).restante, 0);
});

test('estimativa: com fatura oficial, o total oficial vale e a estimativa não soma', async () => {
  const r = await estimativasCartao('2026-12', { query: banco({ faturaOficial: true }) });
  assert.ok(r.itens.every((x) => x.restante === 0 && x.oficial));
  assert.strictEqual(r.total, 0);
});

function bancoRotas({ faturaOficial }) {
  const base = banco({ faturaOficial });
  const modelo = { codFin: 5, tipo: 'DESPESA', formaPagamento: 'CREDITO' };
  return async (sql, p) => {
    const s = String(sql).replace(/\s+/g, ' ');
    // Ocorrências de crédito NÃO podem entrar no somatório de despesas/projeção como cobrança própria
    if (s.includes("o.situacao='PREVISTA'") && s.includes("<>'CREDITO'")) return [];
    if (s.includes('FROM tbOcorrenciasRecorrentes o JOIN tbFinancas m') && s.includes('valorOcorrencia')) {
      return [{ ...modelo, descricao: 'gasolina moto', categoria: 'Transporte', codCartao: 1, codOcorrencia: 1, dataPrevista: '2026-12-10', valorOcorrencia: 120, situacaoOcorrencia: 'PREVISTA' }];
    }
    if (s.includes('FROM tbFinancas f WHERE recorrente=0')) return [{ codFin: 9, tipo: 'DESPESA', descricao: 'posto', valor: 50, categoria: 'Transporte', situacao: 'EFETIVADA', formaPagamento: 'CREDITO', dataMovimentacao: '2026-12-03', classeRegistro: 'MOVIMENTACAO' }];
    return base(sql, p);
  };
}

test('Movimentações: estimativa vem marcada, com o que já foi abatido e o que falta', async () => {
  const orig = pool.query; pool.query = bancoRotas({ faturaOficial: false });
  try {
    const l = (await chamar('GET', '/api/app/movimentacoes?mes=2026-12')).json.dados;
    const e = l.find((x) => x.classeRegistro === 'OCORRENCIA');
    assert.strictEqual(e.estimativaCartao, true); assert.strictEqual(Number(e.valorAbatido), 80); assert.strictEqual(Number(e.valorRestante), 40);
  } finally { pool.query = orig; }
});

test('Movimentações: com fatura oficial a estimativa mostra restante 0', async () => {
  const orig = pool.query; pool.query = bancoRotas({ faturaOficial: true });
  try {
    const l = (await chamar('GET', '/api/app/movimentacoes?mes=2026-12')).json.dados;
    const e = l.find((x) => x.classeRegistro === 'OCORRENCIA');
    assert.strictEqual(Number(e.valorRestante), 0); assert.strictEqual(e.faturaOficial, true);
  } finally { pool.query = orig; }
});

test('Resumo do mês: estimativa soma só o restante, uma vez, e some com fatura oficial', async () => {
  const orig = pool.query;
  try {
    pool.query = bancoRotas({ faturaOficial: false });
    let r = (await chamar('GET', '/api/app/resumo-mes?mes=2026-12')).json.dados;
    assert.strictEqual(r.estimativasCartao, 80);
    assert.strictEqual(r.saidaTotal, 80 + r.despesas + r.totalFaturas);
    pool.query = bancoRotas({ faturaOficial: true });
    r = (await chamar('GET', '/api/app/resumo-mes?mes=2026-12')).json.dados;
    assert.strictEqual(r.estimativasCartao, 0);
  } finally { pool.query = orig; }
});

test('Efetivar gasto fixo no crédito é recusado (é estimativa dentro da fatura)', async () => {
  const origQ = pool.query, origC = pool.getConnection;
  pool.getConnection = async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql) {
      if (String(sql).replace(/\s+/g, ' ').startsWith('SELECT o.*,m.tipo')) return [{ codOcorrencia: 1, valor: 120, dataPrevista: '2026-12-10', situacao: 'PREVISTA', formaPagamento: 'CREDITO', tipo: 'DESPESA' }];
      return {};
    },
  });
  try {
    const r = await chamar('PATCH', '/api/app/ocorrencias/1/situacao', { situacao: 'EFETIVADA' });
    assert.strictEqual(r.status, 400);
  } finally { pool.query = origQ; pool.getConnection = origC; }
});

test('Gasto fixo no crédito exige o cartão', async () => {
  const r = await chamar('POST', '/api/app/gastos-fixos', { descricao: 'x', valor: 10, inicio: '2026-12', formaPagamento: 'CREDITO' });
  assert.strictEqual(r.status, 400);
});

test('Projeção e Resumo: a ocorrência de crédito não entra como cobrança própria; só o restante da estimativa', async () => {
  const orig = pool.query, sqls = [], b = bancoRotas({ faturaOficial: false });
  pool.query = async (sql, p) => { sqls.push(String(sql)); if (/SUM\(/.test(String(sql)) && String(sql).includes(' v ') && !String(sql).includes('GROUP BY')) return [{ v: 0, ent: 0, sai: 0 }]; return b(sql, p); };
  try {
    const r = await chamar('GET', '/api/app/projecao?meses=1');
    assert.strictEqual(r.status, 200);
    const itens = r.json.dados[0].itens;
    assert.strictEqual(itens.filter((x) => x.origem === 'RECORRENCIA').length, 0);
    const est = itens.filter((x) => x.origem === 'ESTIMATIVA_CARTAO');
    assert.strictEqual(est.length, 2);
    assert.strictEqual(est.reduce((a, x) => a + x.valor, 0), -80);
    const occSql = sqls.filter((x) => x.includes("o.situacao='PREVISTA'") && x.includes('GROUP BY') === false && x.includes("'RECORRENCIA' origem"));
    assert.ok(occSql.length && occSql.every((x) => x.includes("<>'CREDITO'")));
  } finally { pool.query = orig; }
});

// ---- Cenários pedidos pelo Gabriel: nada anotado na fatura é contado duas vezes ----
const { calcularOutros } = require('../backend/services/credito');

// Banco simulado de um mês (2026-12), cartão 1. Cada cenário diz o que há na fatura.
function cenario({ estimativas, compras, fatura }) {
  // fatura: { informado (0 = não informada), total, conhecido, outros }
  const faturaRow = { codFatura: 1, codCartao: 1, nomeCartao: 'Nubank', valorInformado: fatura.informado, valorTotal: fatura.total, conhecido: fatura.conhecido, outros: fatura.outros, dataVencimento: '2026-12-27', competencia: '2026-12' };
  return async (sql) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.includes("m.formaPagamento='CREDITO' ORDER BY")) return estimativas.map((e, i) => ({ codOcorrencia: i + 1, valor: e.valor, dataPrevista: '2026-12-10', descricao: e.descricao, categoria: e.categoria, codCartao: 1 }));
    if (s.includes('FROM tbOcorrenciasRecorrentes o JOIN tbFinancas m') && s.includes('valorOcorrencia')) return estimativas.map((e, i) => ({ codFin: 5 + i, tipo: 'DESPESA', formaPagamento: 'CREDITO', descricao: e.descricao, categoria: e.categoria, codCartao: 1, codOcorrencia: i + 1, dataPrevista: '2026-12-10', valorOcorrencia: e.valor, situacaoOcorrencia: 'PREVISTA' }));
    if (s.includes("o.situacao='PREVISTA'") && s.includes("<>'CREDITO'")) return [];
    if (s.includes('FROM tbFinancas f WHERE recorrente=0')) return compras.map((c, i) => ({ codFin: 90 + i, tipo: 'DESPESA', descricao: c.descricao, valor: c.valor, categoria: c.categoria, situacao: 'EFETIVADA', formaPagamento: 'CREDITO', dataMovimentacao: '2026-12-03', classeRegistro: 'MOVIMENTACAO' }));
    if (s.includes('GROUP BY x.codCartao,categoria')) return compras.map((c) => ({ codCartao: 1, categoria: c.categoria, v: c.valor }));
    if (s.startsWith('SELECT f.codCartao,f.valorInformado')) return [faturaRow];
    if (s.startsWith('SELECT codCartao,nomeCartao')) return [{ codCartao: 1, nomeCartao: 'Nubank', diaVencimento: 27 }];
    if (s.includes('SELECT f.codFatura,c.nomeCartao,f.valorTotal')) return [faturaRow];           // Resumo: faturas do mês
    if (s.includes('SELECT f.codFatura id,f.dataVencimento data')) return [{ ...faturaRow, id: 1, data: '2026-12-27' }]; // Projeção: faturas a pagar
    if (/SUM\(/.test(s) && s.includes(' v ') && !s.includes('GROUP BY')) return [{ v: 0, ent: 0, sai: 0 }];
    return [];
  };
}
async function tudo(cen) {
  const orig = pool.query; pool.query = cenario(cen);
  try {
    const mov = (await chamar('GET', '/api/app/movimentacoes?mes=2026-12')).json.dados;
    const res = (await chamar('GET', '/api/app/resumo-mes?mes=2026-12')).json.dados;
    const proj = (await chamar('GET', '/api/app/projecao?meses=1')).json.dados[0];
    // total do mês em cada tela, só o que sai pelo cartão
    const movTotal = mov.filter((x) => x.formaPagamento === 'CREDITO' || x.estimativaCartao).reduce((a, x) => a + Number(x.estimativaCartao ? x.valorRestante : x.valor), 0);
    const projTotal = -proj.itens.filter((x) => x.origem === 'FATURA' || x.origem === 'ESTIMATIVA_CARTAO').reduce((a, x) => a + Number(x.valor), 0);
    return { mov, res, proj, movTotal, projTotal };
  } finally { pool.query = orig; }
}

test('Cenário 1: estimativa R$120 + compra R$40 (mesma categoria e cartão): resta R$80 e o total é R$120 uma vez só', async () => {
  const r = await tudo({ estimativas: [{ valor: 120, descricao: 'gasolina moto', categoria: 'Transporte' }], compras: [{ valor: 40, descricao: 'posto', categoria: 'Transporte' }], fatura: { informado: 0, total: 0, conhecido: 40, outros: 0 } });
  const e = r.mov.find((x) => x.estimativaCartao);
  assert.strictEqual(Number(e.valorAbatido), 40); assert.strictEqual(Number(e.valorRestante), 80);
  assert.strictEqual(r.movTotal, 120, 'Movimentações: 40 da compra + 80 de restante');
  assert.strictEqual(r.res.estimativasCartao, 80); assert.strictEqual(r.res.totalFaturas, 40);
  assert.strictEqual(r.res.saidaTotal, 120, 'Resumo: 120 uma vez');
  assert.strictEqual(r.projTotal, 120, 'Projeção: fatura conhecida 40 + estimativa restante 80');
});

test('Cenário 2: fatura oficial R$150 com só R$40 anotados: R$110 em Outros, sem resto de estimativa, R$150 uma vez', async () => {
  assert.strictEqual(calcularOutros(150, 40).outros, 110);
  const r = await tudo({ estimativas: [{ valor: 120, descricao: 'gasolina moto', categoria: 'Transporte' }], compras: [{ valor: 40, descricao: 'posto', categoria: 'Transporte' }], fatura: { informado: 1, total: 150, conhecido: 40, outros: 110 } });
  const e = r.mov.find((x) => x.estimativaCartao);
  assert.strictEqual(Number(e.valorRestante), 0); assert.strictEqual(e.faturaOficial, true);
  assert.strictEqual(r.res.estimativasCartao, 0); assert.strictEqual(r.res.outros, 110); assert.strictEqual(r.res.totalFaturas, 150);
  assert.strictEqual(r.res.saidaTotal, 150, 'Resumo: 150 uma vez');
  assert.strictEqual(r.projTotal, 150, 'Projeção: 150 uma vez');
  assert.strictEqual(r.proj.itens.filter((x) => x.origem === 'ESTIMATIVA_CARTAO').length, 0);
});

test('Cenário 3: duas estimativas na mesma categoria e cartão + compra R$40: abate R$40 no conjunto, não em cada', async () => {
  const r = await estimativasCartao('2026-12', { query: cenario({ estimativas: [{ valor: 120, descricao: 'gasolina moto', categoria: 'Transporte' }, { valor: 60, descricao: 'estacionamento', categoria: 'transporte' }], compras: [{ valor: 40, descricao: 'posto', categoria: 'Transporte' }], fatura: { informado: 0, total: 0, conhecido: 40, outros: 0 } }) });
  assert.strictEqual(r.itens.reduce((a, x) => a + x.abatido, 0), 40, 'só R$40 abatidos no total');
  assert.strictEqual(r.total, 140, '180 de estimativas - 40');
});

// ---- Item 6: alerta de fatura fechada ----
const { alertasFaturaFechada } = require('../backend/services/lembretes');
const santander = { codCartao: 1, nomeCartao: 'Santander', ativo: 1, diaFechamento: 20, diaVencimento: 27 };
const xyz = { codCartao: 2, nomeCartao: 'XYZ', ativo: 1, diaFechamento: 10, diaVencimento: 17 };
const fat = (o) => ({ codFatura: 1, codCartao: 1, competencia: '2026-11', dataVencimento: '2026-11-27', valorTotal: 0, valorInformado: 0, conhecido: 0, ...o });

test('Alerta: fatura fechada com total oficial e saldo insuficiente diz quanto falta', () => {
  const a = alertasFaturaFechada([santander], '2026-11-25', [fat({ valorInformado: 1, valorTotal: 1250 })], 950);
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].valor, 1250); assert.strictEqual(a[0].oficial, true); assert.strictEqual(a[0].faltam, 300); assert.strictEqual(a[0].temSaldo, false);
});
test('Alerta: com saldo suficiente avisa que já tem o valor', () => {
  const a = alertasFaturaFechada([santander], '2026-11-25', [fat({ valorInformado: 1, valorTotal: 800 })], 1000);
  assert.strictEqual(a[0].temSaldo, true); assert.strictEqual(a[0].faltam, 0);
});
test('Alerta: sem total oficial usa o valor anotado e marca como não oficial', () => {
  const a = alertasFaturaFechada([santander], '2026-11-25', [fat({ conhecido: 400 })], 100);
  assert.strictEqual(a[0].oficial, false); assert.strictEqual(a[0].valor, 400); assert.strictEqual(a[0].faltam, 300);
});
test('Alerta: fatura que ainda não fechou ou sem nada anotado não gera alerta', () => {
  assert.strictEqual(alertasFaturaFechada([santander], '2026-11-25', [fat({ competencia: '2026-12', dataVencimento: '2026-12-27', valorInformado: 1, valorTotal: 500 })], 0).length, 0);
  assert.strictEqual(alertasFaturaFechada([santander], '2026-11-25', [fat({})], 0).length, 0);
});
test('Alerta: soma as faturas que vencem antes para comparar com o saldo (uma vez só)', () => {
  const faturas = [
    fat({ codFatura: 1, codCartao: 1, valorInformado: 1, valorTotal: 600, dataVencimento: '2026-11-27' }),
    fat({ codFatura: 2, codCartao: 2, competencia: '2026-11', dataVencimento: '2026-11-17', valorInformado: 1, valorTotal: 500 }),
  ];
  const a = alertasFaturaFechada([santander, xyz], '2026-11-25', faturas, 700);
  assert.deepStrictEqual(a.map((x) => x.nomeCartao), ['XYZ', 'Santander'], 'ordem de vencimento');
  assert.strictEqual(a[0].temSaldo, true); assert.strictEqual(a[0].faltam, 0);
  assert.strictEqual(a[1].acumulado, 1100); assert.strictEqual(a[1].faltam, 400); assert.strictEqual(a[1].somaAnteriores, true);
});
test('Alerta: fatura antiga ainda não paga continua aparecendo', () => {
  const a = alertasFaturaFechada([santander], '2026-11-25', [fat({ codFatura: 9, competencia: '2026-10', dataVencimento: '2026-10-27', valorInformado: 1, valorTotal: 300 })], 1000);
  assert.strictEqual(a.length, 1); assert.strictEqual(a[0].competencia, '2026-10');
});

test('/lembretes devolve as faturas fechadas com o saldo da conta (sem poupança)', async () => {
  const orig = pool.query;
  pool.query = async (sql) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.startsWith('SELECT * FROM tbCartoes')) return [santander];
    if (s.includes('FROM tbFaturas f LEFT JOIN tbFaturaParcelas') && s.includes('f.paga=0')) return [fat({ valorInformado: 1, valorTotal: 1250 })];
    if (s.includes('FROM tbFinancas WHERE situacao=\'EFETIVADA\'')) return [{ v: 950 }];
    if (s.includes('FROM tbTransferencias WHERE dataTransferencia<=CURRENT_DATE')) return [{ v: 0 }];
    if (s.startsWith('SELECT * FROM tbConfiguracoes')) return [{ saldoInicial: 0, dataSaldoInicial: '2026-01-01' }];
    return [{ n: 0 }];
  };
  try {
    const r = (await chamar('GET', '/api/app/lembretes?hoje=2026-11-25')).json.dados;
    assert.strictEqual(r.fechadas.length, 1); assert.strictEqual(r.fechadas[0].faltam, 300);
  } finally { pool.query = orig; }
});

test('Marcar fatura como paga: desconta do saldo uma vez, some o aviso; desfazer devolve', async () => {
  const estado = { paga: 0, financas: [] };
  const orig = pool.getConnection;
  pool.getConnection = async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, p = []) {
      const s = String(sql).replace(/\s+/g, ' ');
      if (s.startsWith('SELECT f.codFatura,f.paga')) return [{ codFatura: 1, paga: estado.paga, valorTotal: 1250, valorInformado: 1, nomeCartao: 'Santander', competencia: '2026-11', conhecido: 400 }];
      if (s.startsWith('DELETE FROM tbFinancas WHERE chaveOrigem')) { estado.financas = estado.financas.filter((x) => x.chave !== p[0]); return {}; }
      if (s.startsWith('INSERT INTO tbFinancas')) { estado.financas.push({ valor: p[1], chave: p[2], origem: 'PAGAMENTO_FATURA' }); return {}; }
      if (s.startsWith('UPDATE tbFaturas SET paga')) { estado.paga = p[0]; return {}; }
      return {};
    },
  });
  try {
    for (let i = 0; i < 2; i++) assert.strictEqual((await chamar('PATCH', '/api/app/faturas/1/paga', { paga: true })).status, 200);
    assert.strictEqual(estado.paga, 1); assert.strictEqual(estado.financas.length, 1, 'clicar duas vezes não desconta duas vezes');
    assert.strictEqual(estado.financas[0].valor, 1250);
    assert.strictEqual((await chamar('PATCH', '/api/app/faturas/1/paga', { paga: false })).status, 200);
    assert.strictEqual(estado.paga, 0); assert.strictEqual(estado.financas.length, 0);
  } finally { pool.getConnection = orig; }
});

// ---- Item 7: fuso (America/Sao_Paulo) e edição de custo de bem ----
const { hoje, mesAtual } = require('../backend/helpers');
const fs = require('node:fs');
const path = require('node:path');

test('hoje(): à noite em São Paulo ainda é o mesmo dia, mesmo que em UTC já seja o dia seguinte', () => {
  assert.strictEqual(hoje(new Date('2026-11-26T01:21:00Z')), '2026-11-25'); // 22:21 em São Paulo
  assert.strictEqual(hoje(new Date('2026-11-26T02:59:00Z')), '2026-11-25');
  assert.strictEqual(hoje(new Date('2026-11-26T03:00:00Z')), '2026-11-26');
  assert.strictEqual(mesAtual(new Date('2026-12-01T02:30:00Z')), '2026-11'); // 23:30 de 30/11
});
test('o código não usa mais data em UTC (toISOString) nem CURRENT_DATE do banco para "hoje"', () => {
  const arquivos = [];
  for (const d of ['backend/routes', 'backend/services']) for (const f of fs.readdirSync(path.join(__dirname, '..', d))) arquivos.push(path.join(d, f));
  arquivos.push('JS/core.js');
  for (const f of arquivos) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    assert.ok(!/new Date\(\)\.toISOString\(\)\.slice\(0, ?[107]\)/.test(src), `${f}: data de hoje em UTC`);
    assert.ok(!/CURRENT_DATE|CURDATE\(\)/.test(src), `${f}: usa a data do servidor do banco`);
  }
});

test('Editar custo de bem: muda custo e a movimentação vinculada', async () => {
  const log = [];
  const orig = pool.getConnection;
  pool.getConnection = async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, p = []) {
      const s = String(sql).replace(/\s+/g, ' '); log.push({ s, p });
      if (s.startsWith('SELECT c.codCusto')) return [{ codCusto: 3, codFin: 8, dataCusto: '2026-11-26', valor: 900, formaPagamento: 'PIX' }];
      if (s.startsWith('SELECT codCompra FROM tbComprasCartao')) return [];
      return {};
    },
  });
  try {
    const r = await chamar('PUT', '/api/app/bens/custos/3', { dataCusto: '2026-11-25', tipo: 'SEGURO', descricao: 'Seguro Lindy', valor: 950, situacao: 'PREVISTO' });
    assert.strictEqual(r.status, 200);
    const c = log.find((x) => x.s.startsWith('UPDATE tbCustosBens')), f = log.find((x) => x.s.startsWith('UPDATE tbFinancas'));
    assert.deepStrictEqual(c.p, ['2026-11-25', 'SEGURO', 'Seguro Lindy', 950, 'PREVISTO', 8, '3']);
    assert.deepStrictEqual(f.p, ['2026-11-25', 'Seguro Lindy', 950, 'PREVISTA', 'PIX', null, null, null, 8]);
  } finally { pool.getConnection = orig; }
});

// ---- Item 9: receitas fixas ----
test('Receitas fixas: cria receita recorrente mensal (origem RECEITA_FIXA) com dia, categoria e recebimento', async () => {
  const log = [], orig = pool.query;
  pool.query = async (sql, p = []) => { log.push({ s: String(sql), p }); return { insertId: 11 }; };
  try {
    const r = await chamar('POST', '/api/app/receitas-fixas', { descricao: 'Salário', valor: 5200, categoria: 'Salário', dia: '5', formaPagamento: 'PIX', inicio: '2026-12', fim: '' });
    assert.strictEqual(r.status, 201);
    const ins = log.find((x) => x.s.includes('INSERT INTO tbFinancas'));
    assert.ok(ins.s.includes("'RECEITA'") && ins.s.includes("'RECEITA_FIXA'") && ins.s.includes("'MENSAL'"));
    assert.deepStrictEqual(ins.p, ['2026-12-05', 'Salário', 5200, 'Salário', '2026-12-05', null, 'PIX']);
    assert.strictEqual((await chamar('POST', '/api/app/receitas-fixas', { descricao: 'x', valor: 0, inicio: '2026-12' })).status, 400);
    assert.strictEqual((await chamar('POST', '/api/app/receitas-fixas', { descricao: 'x', valor: 10, inicio: 'dez' })).status, 400);
    // forma de pagamento fora da lista vira Pix (nunca crédito)
    log.length = 0;
    await chamar('POST', '/api/app/receitas-fixas', { descricao: 'Aluguel', valor: 900, inicio: '2026-12', formaPagamento: 'CREDITO' });
    assert.strictEqual(log.find((x) => x.s.includes('INSERT INTO tbFinancas')).p[6], 'PIX');
  } finally { pool.query = orig; }
});

test('Receitas fixas: editar só mexe em RECEITA_FIXA e refaz as previsões; excluir com histórico é recusado', async () => {
  const log = [], orig = pool.query;
  pool.query = async (sql, p = []) => { log.push({ s: String(sql), p }); return String(sql).includes('COUNT(*)') ? [{ n: 1 }] : {}; };
  try {
    assert.strictEqual((await chamar('PUT', '/api/app/receitas-fixas/4', { descricao: 'Salário', valor: 5500, inicio: '2026-12', dia: '6' })).status, 200);
    assert.ok(log.find((x) => x.s.includes("UPDATE tbFinancas") && x.s.includes("origem='RECEITA_FIXA'")));
    assert.ok(log.find((x) => x.s.includes('DELETE FROM tbOcorrenciasRecorrentes') && x.s.includes("situacao='PREVISTA'")));
    assert.strictEqual((await chamar('DELETE', '/api/app/receitas-fixas/4')).status, 400);
  } finally { pool.query = orig; }
});

test('Receita fixa: efetivar a ocorrência cria entrada (RECEITA) e a lista mostra a situação da ocorrência', async () => {
  const orig = pool.getConnection, inserts = [];
  pool.getConnection = async () => ({
    async beginTransaction() {}, async commit() {}, async rollback() {}, release() {},
    async query(sql, p = []) {
      const s = String(sql).replace(/\s+/g, ' ');
      if (s.startsWith('SELECT o.*,m.tipo')) return [{ codOcorrencia: 2, codFinModelo: 4, competencia: '2026-12', dataPrevista: '2026-12-05', valor: 5200, situacao: 'PREVISTA', codFinEfetivada: null, tipo: 'RECEITA', descricao: 'Salário', categoria: 'Salário', formaPagamento: 'PIX' }];
      if (s.startsWith('INSERT INTO tbFinancas')) { inserts.push(p); return { insertId: 50 }; }
      return {};
    },
  });
  try {
    assert.strictEqual((await chamar('PATCH', '/api/app/ocorrencias/2/situacao', { situacao: 'EFETIVADA' })).status, 200);
    assert.strictEqual(inserts[0][1], 'RECEITA'); assert.strictEqual(inserts[0][0], '2026-12-05'); assert.strictEqual(Number(inserts[0][3]), 5200);
  } finally { pool.getConnection = orig; }
});

test('Sobra por mês: receita anual conta 1/12, não o valor inteiro', async () => {
  const orig = pool.query, sqls = [];
  pool.query = async (sql, p) => { sqls.push(String(sql)); if (String(sql).includes("tipo='RECEITA' AND situacao<>'CANCELADA'")) return [{ v: 5200 + 100 }]; if (/SUM\(/.test(String(sql)) && !String(sql).includes('GROUP BY')) return [{ v: 0, efetivado: 0, previsto: 0, entradas: 0, saidas: 0 }]; return []; };
  try {
    await chamar('GET', '/api/app/resumo-financeiro');
    const q = sqls.find((x) => x.includes("tipo='RECEITA' AND situacao<>'CANCELADA'"));
    assert.ok(/CASE WHEN frequencia='ANUAL' THEN valor\/12 ELSE valor END/.test(q));
  } finally { pool.query = orig; }
});


// ---- Item 8: compra no crédito ligada à movimentação (excluir/editar mexem na fatura) ----
// Banco em memória só para as tabelas de cartão; entende exatamente as consultas de services/credito.js e das rotas.
function bancoCartao({ oficial = {}, financas = {} } = {}) {
  const st = { compras: [], parcelas: [], fps: [], faturas: [], financas: { ...financas }, seq: 100 };
  const nova = (comp, total) => { st.faturas.push({ codFatura: ++st.seq, codCartao: 1, competencia: comp, dataVencimento: comp + '-10', valorTotal: total || 0, valorInformado: total ? 1 : 0 }); };
  for (const [comp, total] of Object.entries(oficial)) nova(comp, total);
  const fat = (id) => st.faturas.find((f) => f.codFatura === id);
  const q = async (sql, p = []) => {
    const s = String(sql).replace(/\s+/g, ' ');
    if (s.startsWith('SELECT diaVencimento FROM tbCartoes') || s.startsWith('SELECT diaFechamento,diaVencimento')) return p[0] == null ? [] : [{ diaVencimento: 10, diaFechamento: 3 }];
    if (s.startsWith('INSERT INTO tbComprasCartao')) {
      if (s.includes('codFin) VALUES')) { st.compras.push({ codCompra: ++st.seq, codCartao: p[0], dataCompra: p[1], descricao: p[2], categoria: p[3], valorTotal: p[4], quantidadeParcelas: p[5], codFin: p[8], chaveOrigem: null }); }
      else { st.compras.push({ codCompra: ++st.seq, codCartao: p[0], dataCompra: p[1], descricao: p[2], categoria: p[3], valorTotal: p[4], quantidadeParcelas: 1, chaveOrigem: p[7], codFin: null }); }
      return { insertId: st.seq };
    }
    if (s.startsWith('INSERT INTO tbParcelasCartao')) { st.parcelas.push({ codParcela: ++st.seq, codCompra: p[0], numeroParcela: p[1], valor: p[2], dataParcela: p[3] }); return { insertId: st.seq }; }
    if (s.startsWith('SELECT codFatura FROM tbFaturas WHERE codCartao')) return st.faturas.filter((f) => f.competencia === p[1]).map((f) => ({ codFatura: f.codFatura }));
    if (s.startsWith('INSERT INTO tbFaturas')) { nova(p[4], 0); return { insertId: st.seq }; }
    if (s.startsWith('INSERT IGNORE INTO tbFaturaParcelas')) { st.fps.push({ codFatura: p[0], codParcela: p[1] }); return {}; }
    if (s.startsWith('SELECT f.codFatura,f.codCartao,f.dataVencimento')) { const f = fat(p[0]); return f ? [{ ...f, nomeCartao: 'Santander' }] : []; }
    if (s.startsWith('SELECT COALESCE(SUM(p.valor),0) v FROM tbFaturaParcelas')) { let v = 0; for (const fp of st.fps.filter((x) => x.codFatura === p[0])) { const pa = st.parcelas.find((x) => x.codParcela === fp.codParcela); const co = st.compras.find((x) => x.codCompra === pa.codCompra); if (!co.chaveOrigem) v += Number(pa.valor); } return [{ v }]; }
    if (s.startsWith('SELECT codCompra FROM tbComprasCartao WHERE chaveOrigem=?')) return st.compras.filter((x) => x.chaveOrigem === p[0]).map((x) => ({ codCompra: x.codCompra }));
    if (s.startsWith('SELECT codCompra FROM tbComprasCartao WHERE codFin=?')) return st.compras.filter((x) => String(x.codFin) === String(p[0])).map((x) => ({ codCompra: x.codCompra }));
    if (s.startsWith('SELECT DISTINCT fp.codFatura')) return [...new Set(st.fps.filter((fp) => st.parcelas.find((x) => x.codParcela === fp.codParcela).codCompra === p[0]).map((fp) => fp.codFatura))].map((codFatura) => ({ codFatura }));
    if (s.startsWith('DELETE FROM tbFaturaParcelas WHERE codParcela IN')) { const ids = st.parcelas.filter((x) => x.codCompra === p[0]).map((x) => x.codParcela); st.fps = st.fps.filter((fp) => !ids.includes(fp.codParcela)); return {}; }
    if (s.startsWith('DELETE FROM tbParcelasCartao WHERE codCompra')) { st.parcelas = st.parcelas.filter((x) => x.codCompra !== p[0]); return {}; }
    if (s.startsWith('DELETE FROM tbComprasCartao WHERE codCompra')) { st.compras = st.compras.filter((x) => x.codCompra !== p[0]); return {}; }
    if (s.startsWith('SELECT codFin,dataMovimentacao,descricao,valor')) { const f = st.financas[p[0]]; return f ? [{ codFin: Number(p[0]), ...f }] : []; }
    if (s.startsWith('UPDATE tbFinancas SET dataMovimentacao=?,tipo=?')) { const f = st.financas[p[11]]; Object.assign(f, { dataMovimentacao: p[0], descricao: p[2], valor: p[3], categoria: p[4] }); return {}; }
    if (s.startsWith('DELETE FROM tbFinancas WHERE codFin')) { delete st.financas[p[0]]; return {}; }
    if (s.startsWith('SELECT c.codCusto,c.codBem,c.codFin')) { const f = st.financas[8]; return [{ codCusto: 3, codBem: 1, codFin: 8, formaPagamento: f.formaPagamento, codCartao: f.codCartao, quantidadeParcelas: f.quantidadeParcelas, primeiraFatura: f.primeiraFatura }]; }
    if (s.startsWith('UPDATE tbFinancas SET dataMovimentacao=?,descricao=?,valor=?,situacao=?,formaPagamento=?')) { Object.assign(st.financas[p[8]], { dataMovimentacao: p[0], descricao: p[1], valor: p[2], formaPagamento: p[4], codCartao: p[5], quantidadeParcelas: p[6], primeiraFatura: p[7] }); return {}; }
    if (s.startsWith('UPDATE tbCustosBens')) return {};
    if (s.startsWith('SELECT codFin FROM tbCustosBens')) return [{ codFin: 8 }];
    if (s.startsWith('DELETE FROM tbCustosBens')) return {};
    throw Error('consulta não prevista no teste: ' + s.slice(0, 90));
  };
  st.run = async (fn) => { const orig = pool.getConnection; pool.getConnection = async () => ({ async beginTransaction() {}, async commit() {}, async rollback() {}, release() {}, query: q }); try { return await fn(); } finally { pool.getConnection = orig; } };
  st.q = q;
  st.total = (comp) => { const f = st.faturas.find((x) => x.competencia === comp); if (!f) return 0; return Math.round(st.fps.filter((fp) => fp.codFatura === f.codFatura).reduce((a, fp) => a + Number(st.parcelas.find((x) => x.codParcela === fp.codParcela).valor), 0) * 100) / 100; };
  st.outros = (comp) => { const f = st.faturas.find((x) => x.competencia === comp); const ids = st.fps.filter((fp) => fp.codFatura === f.codFatura).map((fp) => st.parcelas.find((x) => x.codParcela === fp.codParcela)); return ids.filter((pa) => st.compras.find((c) => c.codCompra === pa.codCompra).chaveOrigem).reduce((a, pa) => a + Number(pa.valor), 0); };
  return st;
}
const { createCredit } = require('../backend/services/credito');

test('Excluir compra no crédito com fatura oficial: o valor não some, vira Outros (oficial - anotado)', async () => {
  const st = bancoCartao({ oficial: { '2026-12': 1000 }, financas: { 7: { dataMovimentacao: '2026-11-20', descricao: 'Mercado', valor: 300, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 1, primeiraFatura: '2026-12-10' } } });
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 1, valorTotal: 300, dataCompra: '2026-11-20', descricao: 'Mercado', categoria: 'Alimentação', dataPrimeiraParcela: '2026-12', codFin: 7 }); });
  assert.strictEqual(st.outros('2026-12'), 700);
  assert.strictEqual((await st.run(() => chamar('DELETE', '/api/app/movimentacoes/7'))).status, 200);
  assert.strictEqual(st.outros('2026-12'), 1000);
  assert.strictEqual(st.total('2026-12'), 1000);
  assert.strictEqual(st.compras.filter((c) => c.codFin === 7).length, 0);
  assert.ok(!st.financas[7]);
});

test('Excluir compra no crédito sem total oficial: só reduz o anotado, não cria Outros', async () => {
  const st = bancoCartao({ financas: { 7: { dataMovimentacao: '2026-11-20', descricao: 'Mercado', valor: 300, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 1, primeiraFatura: '2026-12-10' } } });
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 1, valorTotal: 300, dataCompra: '2026-11-20', descricao: 'Mercado', dataPrimeiraParcela: '2026-12', codFin: 7 }); });
  assert.strictEqual(st.total('2026-12'), 300);
  await st.run(() => chamar('DELETE', '/api/app/movimentacoes/7'));
  assert.strictEqual(st.total('2026-12'), 0);
  assert.strictEqual(st.compras.length, 0);
});

test('Excluir compra parcelada: todas as parcelas saem e cada fatura oficial recalcula o Outros', async () => {
  const st = bancoCartao({ oficial: { '2026-12': 500, '2027-01': 500 }, financas: { 7: { dataMovimentacao: '2026-11-20', descricao: 'TV', valor: 400, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 2, primeiraFatura: '2026-12-10' } } });
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 2, valorTotal: 400, dataCompra: '2026-11-20', descricao: 'TV', dataPrimeiraParcela: '2026-12', codFin: 7 }); });
  assert.strictEqual(st.outros('2026-12'), 300); assert.strictEqual(st.outros('2027-01'), 300);
  await st.run(() => chamar('DELETE', '/api/app/movimentacoes/7'));
  assert.strictEqual(st.outros('2026-12'), 500); assert.strictEqual(st.outros('2027-01'), 500);
  assert.strictEqual(st.parcelas.filter((p) => st.compras.find((c) => c.codCompra === p.codCompra)?.codFin === 7).length, 0);
});

test('Excluir custo de Bens no crédito: some da fatura; com total oficial vira Outros', async () => {
  const st = bancoCartao({ oficial: { '2026-12': 1000 }, financas: { 8: { dataMovimentacao: '2026-11-20', descricao: 'Seguro', valor: 600, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 1, primeiraFatura: '2026-12-10' } } });
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 1, valorTotal: 600, dataCompra: '2026-11-20', descricao: 'Seguro', categoria: 'Bens', dataPrimeiraParcela: '2026-12', codFin: 8 }); });
  assert.strictEqual(st.outros('2026-12'), 400);
  assert.strictEqual((await st.run(() => chamar('DELETE', '/api/app/bens/custos/3'))).status, 200);
  assert.strictEqual(st.outros('2026-12'), 1000);
  assert.ok(!st.financas[8]);
});

test('Editar compra no crédito: muda valor e parcelas na fatura e o Outros se ajusta', async () => {
  const st = bancoCartao({ oficial: { '2026-12': 1000 }, financas: { 7: { dataMovimentacao: '2026-11-20', descricao: 'Mercado', valor: 300, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 1, primeiraFatura: '2026-12-10' } } });
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 1, valorTotal: 300, dataCompra: '2026-11-20', descricao: 'Mercado', dataPrimeiraParcela: '2026-12', codFin: 7 }); });
  const r = await st.run(() => chamar('PUT', '/api/app/movimentacoes/7', { dataMovimentacao: '2026-11-20', tipo: 'DESPESA', descricao: 'Mercado', valor: 450, categoria: 'Alimentação', situacao: 'EFETIVADA', formaPagamento: 'CREDITO' }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(st.compras.filter((c) => c.codFin === 7).length, 1);
  assert.strictEqual(st.compras.find((c) => c.codFin === 7).valorTotal, 450);
  assert.strictEqual(st.outros('2026-12'), 550);
  assert.strictEqual(st.total('2026-12'), 1000);
});

test('Seguro Santander parcelado (884,09): cada parcela cai numa fatura Santander, mês a mês, somando o total', async () => {
  const st = bancoCartao({});
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 4, valorTotal: 884.09, dataCompra: '2026-11-20', descricao: 'Seguro', categoria: 'Bens', dataPrimeiraParcela: '2026-12', codFin: 9 }); });
  const comps = ['2026-12', '2027-01', '2027-02', '2027-03'];
  const valores = comps.map((c) => st.total(c));
  assert.ok(valores.every((v) => v > 0), 'toda parcela entra em uma fatura');
  assert.strictEqual(Math.round(valores.reduce((a, b) => a + b, 0) * 100), 88409);
});

test('Saldo não desconta compra no crédito na hora da compra (só o pagamento da fatura desconta)', async () => {
  const orig = pool.query, sqls = [];
  pool.query = async (sql) => { sqls.push(String(sql)); return [{ v: 0, saldoInicial: 0, dataSaldoInicial: '2026-01-01' }]; };
  try { await require('../backend/services/core').saldo(); } finally { pool.query = orig; }
  const q = sqls.find((x) => x.includes('FROM tbFinancas WHERE situacao'));
  assert.ok(q.includes("COALESCE(formaPagamento,'')<>'CREDITO'"));
});

test('Movimentações: compra no crédito sai como parcela do mês (valor da parcela), não como saída cheia', async () => {
  const orig = pool.query, sqls = [];
  pool.query = async (sql) => {
    const s = String(sql).replace(/\s+/g, ' '); sqls.push(s);
    if (s.includes('FROM tbParcelasCartao p JOIN tbComprasCartao x ON x.codCompra=p.codCompra WHERE x.codFin IS NOT NULL')) return [{ codFin: 7, descricao: 'TV', categoria: 'Casa', valorTotal: 400, dataCompra: '2026-11-20', quantidadeParcelas: 2, numeroParcela: 2, valor: 200, dataParcela: '2027-01-10', codCartao: 1 }];
    return [];
  };
  try {
    const r = await chamar('GET', '/api/app/movimentacoes?mes=2027-01');
    const x = r.json.dados?.find?.((i) => i.classeRegistro === 'PARCELA_CREDITO') || (r.json.find?.((i) => i.classeRegistro === 'PARCELA_CREDITO'));
    assert.ok(x, 'linha de parcela presente');
    assert.strictEqual(Number(x.valor), 200); assert.strictEqual(x.descricao, 'TV (2/2)'); assert.strictEqual(Number(x.valorCompra), 400);
    assert.ok(sqls.some((s) => s.includes('FROM tbFinancas f WHERE recorrente=0') && s.includes('NOT EXISTS(SELECT 1 FROM tbComprasCartao k WHERE k.codFin=f.codFin)')));
  } finally { pool.query = orig; }
});

test('Início do app: cria a coluna codFin se faltar; se já existe, não mexe; sem permissão, avisa sem derrubar', async () => {
  const { garantirColunas } = require('../backend/services/schema');
  const log = [];
  assert.strictEqual(await garantirColunas({ query: async (s) => { log.push(s); return s.startsWith('SELECT') ? [] : {}; } }), true);
  assert.ok(log.some((s) => s.startsWith('ALTER TABLE tbComprasCartao ADD COLUMN codFin')));
  log.length = 0;
  assert.strictEqual(await garantirColunas({ query: async (s) => { log.push(s); return [{ COLUMN_NAME: 'codFin' }]; } }), true);
  assert.strictEqual(log.length, 1);
  const w = console.warn; console.warn = () => {};
  try { assert.strictEqual(await garantirColunas({ query: async (s) => { if (s.startsWith('ALTER')) throw Error('denied'); return []; } }), false); } finally { console.warn = w; }
});

test('Conferir com o banco: confere só o campo preenchido; vazio não vira zero', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'JS', 'ux.js'), 'utf8');
  const i = src.indexOf('function conferirCalculo'), j = src.indexOf('(function(){', i);
  const val = (v) => Number(String(v || '').replace(/\D/g, '')) / 100;
  const conferir = new Function('val', src.slice(i, j) + '; return conferirCalculo;')(val);
  const prumo = { saldo: 170, poupanca: 1000 };
  const soSaldo = conferir({ saldo: 'R$ 150,00', poupanca: '' }, prumo);
  assert.strictEqual(soSaldo.length, 1); assert.strictEqual(soSaldo[0].campo, 'saldo'); assert.strictEqual(soSaldo[0].dif, -20);
  const soPoup = conferir({ saldo: '', poupanca: 'R$ 1.200,00' }, prumo);
  assert.strictEqual(soPoup.length, 1); assert.strictEqual(soPoup[0].campo, 'poupanca'); assert.strictEqual(soPoup[0].dif, 200);
  assert.strictEqual(conferir({ saldo: '   ', poupanca: undefined }, prumo).length, 0);
  const zero = conferir({ saldo: 'R$ 0,00', poupanca: '' }, prumo); // zero digitado é conferido de verdade
  assert.strictEqual(zero.length, 1); assert.strictEqual(zero[0].dif, -170);
  assert.strictEqual(conferir({ saldo: 'R$ 170,00', poupanca: 'R$ 1.000,00' }, prumo).every((x) => x.dif === 0), true);
});


test('Editar custo de Bens: de Pix para crédito cria a compra e as parcelas na fatura (cartão e parcelas escolhidos)', async () => {
  const st = bancoCartao({ financas: { 8: { dataMovimentacao: '2026-11-20', descricao: 'Seguro', valor: 600, formaPagamento: 'PIX', codCartao: null, quantidadeParcelas: null, primeiraFatura: null } } });
  const r = await st.run(() => chamar('PUT', '/api/app/bens/custos/3', { dataCusto: '2026-11-20', tipo: 'SEGURO', descricao: 'Seguro', valor: 600, situacao: 'PAGO', formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 3, primeiraFatura: '2026-12' }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(st.compras.filter((c) => c.codFin === 8).length, 1);
  assert.strictEqual(st.compras.find((c) => c.codFin === 8).quantidadeParcelas, 3);
  assert.deepStrictEqual(['2026-12', '2027-01', '2027-02'].map((c) => st.total(c)), [200, 200, 200]);
  assert.strictEqual(st.financas[8].formaPagamento, 'CREDITO');
});

test('Editar custo de Bens: mudar parcelas no crédito refaz as parcelas; de crédito para Pix remove a compra e o Outros se ajusta', async () => {
  const st = bancoCartao({ oficial: { '2026-12': 1000 }, financas: { 8: { dataMovimentacao: '2026-11-20', descricao: 'Seguro', valor: 600, formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 1, primeiraFatura: '2026-12-10' } } });
  await st.run(async () => { await createCredit({ query: st.q }, { codCartao: 1, quantidadeParcelas: 1, valorTotal: 600, dataCompra: '2026-11-20', descricao: 'Seguro', categoria: 'Bens', dataPrimeiraParcela: '2026-12', codFin: 8 }); });
  assert.strictEqual(st.outros('2026-12'), 400);
  // 1x -> 2x: 300 em dez e 300 em jan; dez oficial 1000 => Outros 700
  let r = await st.run(() => chamar('PUT', '/api/app/bens/custos/3', { dataCusto: '2026-11-20', tipo: 'SEGURO', descricao: 'Seguro', valor: 600, situacao: 'PAGO', formaPagamento: 'CREDITO', codCartao: 1, quantidadeParcelas: 2, primeiraFatura: '2026-12' }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(st.compras.filter((c) => c.codFin === 8).length, 1);
  assert.strictEqual(st.outros('2026-12'), 700);
  assert.strictEqual(st.total('2027-01'), 300);
  // crédito -> Pix: compra sai; o valor oficial da fatura volta todo para Outros
  r = await st.run(() => chamar('PUT', '/api/app/bens/custos/3', { dataCusto: '2026-11-20', tipo: 'SEGURO', descricao: 'Seguro', valor: 600, situacao: 'PAGO', formaPagamento: 'PIX' }));
  assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  assert.strictEqual(st.compras.filter((c) => c.codFin === 8).length, 0);
  assert.strictEqual(st.outros('2026-12'), 1000);
  assert.strictEqual(st.total('2027-01'), 0);
  assert.strictEqual(st.financas[8].formaPagamento, 'PIX'); assert.strictEqual(st.financas[8].codCartao, null);
});

test('Editar custo de Bens no crédito sem cartão válido é recusado', async () => {
  const st = bancoCartao({ financas: { 8: { dataMovimentacao: '2026-11-20', descricao: 'Seguro', valor: 600, formaPagamento: 'PIX', codCartao: null, quantidadeParcelas: null, primeiraFatura: null } } });
  const r = await st.run(() => chamar('PUT', '/api/app/bens/custos/3', { dataCusto: '2026-11-20', tipo: 'SEGURO', valor: 600, situacao: 'PAGO', formaPagamento: 'CREDITO', codCartao: null }));
  assert.strictEqual(r.status, 400);
});
