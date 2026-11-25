// Testes de fumaça da API: sobem o servidor em porta aleatória com o banco
// simulado (sem MariaDB) e conferem respostas básicas de cada módulo.
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');

const { app, pool } = require('../backend/server');

// Cotação simulada para não depender da internet nos testes.
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, ...args) => {
  if (String(url).includes('frankfurter')) {
    return { json: async () => [{ quote: 'BRL', rate: 5.5, date: '2026-11-25' }] };
  }
  return fetchReal(url, ...args);
};

// Banco simulado: responde conforme o SQL recebido.
const cfgFalsa = {
  saldoInicial: 0, poupancaInicial: 0, dataSaldoInicial: '2026-01-01',
  limiteSeguranca: 0, reservaEmergencia: 0,
};
pool.query = async (sql) => {
  const s = String(sql);
  if (s.includes('DATABASE()')) return [{ banco: 'db_teste' }];
  if (s.includes('tbConfiguracoes')) return [cfgFalsa];
  if (s.includes('SUM(')) return [{ v: 0, entradas: 0, saidas: 0, efetivado: 0, previsto: 0, compras: 0, faturas: 0, n: 0, saldo: 0, conhecido: 0 }];
  if (s.trim().startsWith('SELECT')) return [];
  return { insertId: 1, affectedRows: 1 };
};

let base, server;
test.before(async () => {
  server = await new Promise((res) => {
    const s = app.listen(0, '127.0.0.1', () => res(s));
  });
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { server.close(); });

// GET simples de cada módulo
for (const rota of ['/api/app/saude', '/api/app/dashboard', '/api/app/projecao', '/api/app/movimentacoes',
  '/api/app/transferencias', '/api/app/cambio', '/api/app/bens', '/api/app/cartoes', '/api/app/faturas',
  '/api/app/objetivos', '/api/app/configuracoes', '/api/app/gastos-fixos', '/api/app/resumo-financeiro',
  '/api/app/compromissos', '/api/app/bens/1/detalhes']) {
  test(`GET ${rota} responde 200 com sucesso`, async () => {
    const r = await fetch(base + rota);
    assert.strictEqual(r.status, 200);
    const j = await r.json();
    assert.strictEqual(j.sucesso, true, JSON.stringify(j));
  });
}

test('GET / serve a página inicial', async () => {
  const r = await fetch(base + '/');
  assert.strictEqual(r.status, 200);
  assert.match(await r.text(), /PRUMO/);
});

test('rota inexistente da API retorna 404 em JSON', async () => {
  const r = await fetch(base + '/api/app/nao-existe');
  assert.strictEqual(r.status, 404);
  assert.strictEqual((await r.json()).sucesso, false);
});

test('POST /api/app/movimentacoes rejeita dados inválidos', async () => {
  const r = await fetch(base + '/api/app/movimentacoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual((await r.json()).sucesso, false);
});

test('POST /api/app/transferencias rejeita transferência inválida', async () => {
  const r = await fetch(base + '/api/app/transferencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"dataTransferencia":"2026-11-25","origem":"SALDO","destino":"SALDO","valor":10}' });
  assert.strictEqual(r.status, 400);
});

test('POST /api/app/reset exige a frase de confirmação', async () => {
  const r = await fetch(base + '/api/app/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"frase":"apagar","confirmacao":true}' });
  assert.strictEqual(r.status, 400);
});

test('por padrão o servidor escuta só em 127.0.0.1 (HOST configurável)', () => {
  const sem = execFileSync(process.execPath, ['-e', "delete process.env.HOST;console.log(require('./backend/server.js').HOST)"], { cwd: require('path').join(__dirname, '..'), encoding: 'utf8' }).trim();
  assert.strictEqual(sem, '127.0.0.1');
  const com = execFileSync(process.execPath, ['-e', "process.env.HOST='0.0.0.0';console.log(require('./backend/server.js').HOST)"], { cwd: require('path').join(__dirname, '..'), encoding: 'utf8' }).trim();
  assert.strictEqual(com, '0.0.0.0');
});

test('server.js exporta o app sem abrir porta ao ser importado', () => {
  const out = execFileSync(process.execPath, ['-e', "const s=require('./backend/server.js');console.log(typeof s.app, typeof s.projection, typeof s.ensureOccurrences)"], { cwd: require('path').join(__dirname, '..'), encoding: 'utf8' }).trim();
  assert.strictEqual(out, 'function function function');
});
