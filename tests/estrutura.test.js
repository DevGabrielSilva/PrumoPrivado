// Testes de estrutura: sintaxe de todos os arquivos JS e integridade
// da divisão em módulos (rotas montadas e scripts referenciados).
const test = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');

function jsFiles(dir) {
  return fs.readdirSync(path.join(raiz, dir), { recursive: true })
    .filter((f) => String(f).endsWith('.js'))
    .map((f) => path.join(dir, String(f)));
}

const arquivos = [...jsFiles('backend'), ...jsFiles('JS')];

for (const arq of arquivos) {
  test(`sintaxe válida: ${arq}`, () => {
    execFileSync(process.execPath, ['--check', path.join(raiz, arq)]);
  });
}

test('index.html referencia todos os scripts de JS/ e nenhum a mais', () => {
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const referenciados = [...html.matchAll(/<script src="(JS\/[^"]+)"><\/script>/g)].map((m) => m[1]);
  const existentes = jsFiles('JS');
  assert.deepStrictEqual([...referenciados].sort(), [...existentes].sort());
  for (const r of referenciados) {
    assert.ok(fs.existsSync(path.join(raiz, r)), `${r} não existe`);
  }
});

test('todos os arquivos de rota são montados no servidor', () => {
  const server = fs.readFileSync(path.join(raiz, 'backend', 'server.js'), 'utf8');
  const rotas = fs.readdirSync(path.join(raiz, 'backend', 'routes')).filter((f) => f.endsWith('.js'));
  assert.ok(rotas.length >= 9, 'esperava pelo menos 9 arquivos de rota');
  for (const r of rotas) {
    assert.ok(server.includes(`./routes/${r.replace(/\.js$/, '')}`), `${r} não está montado em server.js`);
  }
});

test('rotas centrais continuam existindo', () => {
  const conteudo = fs.readdirSync(path.join(raiz, 'backend', 'routes'))
    .map((f) => fs.readFileSync(path.join(raiz, 'backend', 'routes', f), 'utf8'))
    .join('\n');
  for (const esperada of ["get('/saude'", "get('/dashboard'", "post('/movimentacoes'", "post('/reset'", "post('/simulador'", "get('/projecao'"]) {
    assert.ok(conteudo.includes(esperada), `rota ${esperada} não encontrada`);
  }
});
