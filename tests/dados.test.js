// Acesso com senha, backup/restauração, CSV e meta de "Outros".
const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const acesso = require('../backend/services/acesso');
const backup = require('../backend/services/backup');
const { paraCsv, celula } = require('../backend/services/csv');
const { situacaoMeta } = require('../backend/services/metas');
const Pru = require('../JS/pru.js');

test('hash de senha: scrypt, sem texto puro, salt diferente e verificação', async () => {
  const h1 = await acesso.hashSenha('segredo123'), h2 = await acesso.hashSenha('segredo123');
  assert.match(h1, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.ok(!h1.includes('segredo123')); assert.notStrictEqual(h1, h2);
  assert.strictEqual(await acesso.verificarSenha('segredo123', h1), true);
  assert.strictEqual(await acesso.verificarSenha('errada', h1), false);
  assert.strictEqual(await acesso.verificarSenha('x', 'lixo'), false);
});
test('política de senha: 6 a 128 caracteres', () => {
  assert.strictEqual(acesso.senhaValida('12345'), false); assert.strictEqual(acesso.senhaValida('123456'), true);
  assert.strictEqual(acesso.senhaValida('a'.repeat(129)), false); assert.strictEqual(acesso.senhaValida(123456), false);
});
test('sessão expira e limite de tentativas bloqueia e libera', () => {
  let t = 1000; const agora = () => t;
  const s = new acesso.Sessoes(500, agora), tk = s.criar();
  assert.ok(s.valida(tk)); t += 600; assert.ok(!s.valida(tk)); assert.ok(!s.valida('inventado'));
  const l = new acesso.LimiteTentativas(3, 60000, agora);
  l.falhou('ip'); l.falhou('ip'); assert.strictEqual(l.segundosBloqueado('ip'), 0); l.falhou('ip');
  assert.ok(l.segundosBloqueado('ip') > 0); t += 61000; assert.strictEqual(l.segundosBloqueado('ip'), 0);
});

async function subir() {
  let estado = { ativo: false, senhaHash: null };
  const a = acesso.criarAcesso({ lerAcesso: async () => estado, salvarAcesso: async (ativo, h) => { estado = { ativo, senhaHash: h }; } });
  const app = express(); app.use(express.json()); app.use(a.middleware); app.use('/api/auth', a.router);
  app.get('/api/app/x', (q, r) => r.json({ sucesso: true })); app.get('/', (q, r) => r.send('home')); app.get('/login.html', (q, r) => r.send('login'));
  app.get('/backend/db.js', (q, r) => r.send('codigo'));
  const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, srv, a };
}
const post = (b, u, body, h = {}) => fetch(b + u, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body), redirect: 'manual' });

test('com a senha desligada tudo abre; código-fonte nunca é servido', async () => {
  const { base, srv } = await subir();
  assert.strictEqual((await fetch(base + '/api/app/x')).status, 200);
  assert.strictEqual((await fetch(base + '/backend/db.js')).status, 404);
  srv.close();
});
test('ligar senha, exigir login, entrar, sair e senha errada', async () => {
  const { base, srv } = await subir();
  let r = await post(base, '/api/auth/configurar', { novaSenha: '123' }); assert.strictEqual(r.status, 400);
  r = await post(base, '/api/auth/configurar', { novaSenha: 'minhasenha' }); assert.strictEqual(r.status, 200);
  assert.strictEqual((await fetch(base + '/api/app/x')).status, 401);
  const home = await fetch(base + '/', { redirect: 'manual' }); assert.strictEqual(home.status, 302); assert.strictEqual(home.headers.get('location'), '/login.html');
  assert.strictEqual((await fetch(base + '/login.html')).status, 200);
  assert.strictEqual((await post(base, '/api/auth/entrar', { senha: 'errada' })).status, 401);
  r = await post(base, '/api/auth/entrar', { senha: 'minhasenha' }); assert.strictEqual(r.status, 200);
  const ck = r.headers.get('set-cookie'); assert.match(ck, /HttpOnly/); assert.match(ck, /SameSite=Strict/);
  const cookie = ck.split(';')[0];
  assert.strictEqual((await fetch(base + '/api/app/x', { headers: { cookie } })).status, 200);
  await post(base, '/api/auth/sair', {}, { cookie });
  assert.strictEqual((await fetch(base + '/api/app/x', { headers: { cookie } })).status, 401);
  srv.close();
});
test('desligar e trocar senha exigem sessão e senha atual; 5 erros bloqueiam', async () => {
  const { base, srv } = await subir();
  await post(base, '/api/auth/configurar', { novaSenha: 'minhasenha' });
  assert.strictEqual((await post(base, '/api/auth/configurar', { ativo: false })).status, 401);
  const ck = (await post(base, '/api/auth/entrar', { senha: 'minhasenha' })).headers.get('set-cookie').split(';')[0];
  assert.strictEqual((await post(base, '/api/auth/configurar', { ativo: false, senhaAtual: 'x' }, { cookie: ck })).status, 401);
  for (let i = 0; i < 5; i++) await post(base, '/api/auth/entrar', { senha: 'x' });
  assert.strictEqual((await post(base, '/api/auth/entrar', { senha: 'minhasenha' })).status, 429);
  assert.strictEqual((await post(base, '/api/auth/configurar', { ativo: false, senhaAtual: 'minhasenha' }, { cookie: ck })).status, 200);
  assert.strictEqual((await fetch(base + '/api/app/x')).status, 200);
  srv.close();
});

// ---- backup ----
function banco(tabelas) {
  const log = [];
  return { log, async query(sql) { const s = String(sql); log.push(s); if (s === 'SHOW TABLES') return Object.keys(tabelas).map((t) => ({ Tables_in_db: t })); const m = s.match(/^SELECT \* FROM `(\w+)`/); if (m) return tabelas[m[1]]; return {}; }, async batch(sql, rows) { log.push('BATCH ' + sql + ' x' + rows.length); } };
}
test('exportar leva todas as tabelas tb* e deixa de fora a de acesso', async () => {
  const c = banco({ tbFinancas: [{ codFin: 1, valor: '10.00' }], tbAcesso: [{ senhaHash: 'segredo' }], outra: [{}] });
  const b = await backup.exportar(c);
  assert.deepStrictEqual(Object.keys(b.tabelas), ['tbFinancas']); assert.ok(!JSON.stringify(b).includes('segredo'));
});
test('validarBackup recusa formato, tabela e coluna perigosos', () => {
  assert.throws(() => backup.validarBackup({}), /inválido/);
  assert.throws(() => backup.validarBackup({ formato: 'prumo-backup', versao: 1, tabelas: { 'tbX; DROP TABLE y': [] } }), /não permitida/);
  assert.throws(() => backup.validarBackup({ formato: 'prumo-backup', versao: 1, tabelas: { tbFinancas: [{ 'a`;--': 1 }] } }), /Coluna inválida/);
  assert.ok(backup.validarBackup({ formato: 'prumo-backup', versao: 1, tabelas: { tbFinancas: [{ codFin: 1 }] } }));
});
test('restaurar apaga e reinsere só tabelas que existem, com FK desligada e religada', async () => {
  const c = banco({ tbFinancas: [], tbBens: [] });
  const r = await backup.restaurar(c, { formato: 'prumo-backup', versao: 1, tabelas: { tbFinancas: [{ codFin: 1, valor: 5 }, { codFin: 2, valor: 6 }], tbNaoExiste: [{ a: 1 }] } });
  assert.deepStrictEqual(r, { tabelas: 1, linhas: 2 });
  const i = (x) => c.log.findIndex((l) => l.includes(x));
  assert.ok(i('FOREIGN_KEY_CHECKS=0') < i('DELETE FROM `tbFinancas`')); assert.ok(i('DELETE FROM `tbFinancas`') < i('BATCH')); assert.ok(c.log.at(-1).includes('FOREIGN_KEY_CHECKS=1'));
  assert.ok(!c.log.some((l) => l.includes('tbBens') && l.includes('DELETE')));
});
test('restaurar religa a FK mesmo se der erro', async () => {
  const c = banco({ tbFinancas: [] }); c.batch = async () => { throw new Error('falhou'); };
  await assert.rejects(backup.restaurar(c, { formato: 'prumo-backup', versao: 1, tabelas: { tbFinancas: [{ a: 1 }] } }));
  assert.ok(c.log.at(-1).includes('FOREIGN_KEY_CHECKS=1'));
});

// ---- CSV ----
test('CSV: BOM, ponto e vírgula, decimal com vírgula, aspas e proteção contra fórmula', () => {
  const csv = paraCsv([{ titulo: 'Data', campo: 'd', tipo: 'data' }, { titulo: 'Descrição', campo: 'x' }, { titulo: 'Valor', campo: 'v', tipo: 'num' }], [{ d: '2026-11-25T00:00:00', x: 'Padaria; "boa"', v: '12.5' }, { d: '2026-11-26', x: '=HYPERLINK("x")', v: 3 }]);
  assert.ok(csv.startsWith('\ufeffData;Descrição;Valor\r\n'));
  assert.ok(csv.includes('2026-11-25;"Padaria; ""boa""";12,50'));
  assert.ok(csv.includes(`'=HYPERLINK`)); assert.strictEqual(celula(null), '');
});

// ---- meta de Outros ----
test('meta de Outros: ok, perto (80%), estourou e sem meta', () => {
  assert.strictEqual(situacaoMeta(500, 100).nivel, 'OK'); assert.strictEqual(situacaoMeta(500, 400).nivel, 'PERTO');
  assert.strictEqual(situacaoMeta(500, 500).nivel, 'ESTOUROU'); assert.strictEqual(situacaoMeta(0, 50).nivel, 'SEM_META');
  assert.strictEqual(situacaoMeta(500, 450).restante, 50);
});
test('Pru só avisa da meta quando perto ou estourou', () => {
  assert.strictEqual(Pru.comentarioMetaOutros(situacaoMeta(500, 100)), null);
  assert.match(Pru.comentarioMetaOutros(situacaoMeta(500, 450)), /90%/);
  assert.match(Pru.comentarioMetaOutros(situacaoMeta(500, 600)), /passou da meta/);
});
