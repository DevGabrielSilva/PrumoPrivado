// "Outros" automático da fatura: o que não foi anotado vira uma despesa; reinformar atualiza (não duplica).
const test = require('node:test');
const assert = require('node:assert');
const { calcularOutros, syncOutros } = require('../backend/services/credito');

test('calcularOutros: resto positivo, zero e excedente', () => {
  assert.deepStrictEqual(calcularOutros(2000, 1500), { outros: 500, excedente: 0 });
  assert.deepStrictEqual(calcularOutros(1500, 1500), { outros: 0, excedente: 0 });
  assert.deepStrictEqual(calcularOutros(1400, 1500), { outros: 0, excedente: 100 });
  assert.deepStrictEqual(calcularOutros(0.3, 0.1 + 0.2), { outros: 0, excedente: 0 }); // sem erro de ponto flutuante
});

// Banco falso mínimo: guarda a compra automática e devolve as compras anotadas (1500).
function conexao(fatura, conhecidas = 1500) {
  const estado = { compras: [], parcelas: [], links: [], nextId: 100 };
  return {
    estado,
    async query(sql, p = []) {
      const s = String(sql).replace(/\s+/g, ' ');
      if (s.startsWith('SELECT f.codFatura')) return [fatura];
      if (s.includes('SUM(p.valor)')) return [{ v: conhecidas }];
      if (s.startsWith('SELECT codCompra FROM tbComprasCartao WHERE chaveOrigem')) return estado.compras.filter((c) => c.chave === p[0]).map((c) => ({ codCompra: c.id }));
      if (s.startsWith('DELETE FROM tbFaturaParcelas')) { estado.links = []; estado.parcelas = []; return {}; }
      if (s.startsWith('DELETE FROM tbComprasCartao')) { estado.compras = estado.compras.filter((c) => c.id !== p[0]); return {}; }
      if (s.startsWith('INSERT INTO tbComprasCartao')) { const id = estado.nextId++; estado.compras.push({ id, chave: p[7], valor: p[4], descricao: p[2], categoria: p[3] }); return { insertId: id }; }
      if (s.startsWith('INSERT INTO tbParcelasCartao')) { const id = estado.nextId++; estado.parcelas.push({ id, valor: p[2] }); return { insertId: id }; }
      if (s.startsWith('INSERT IGNORE INTO tbFaturaParcelas')) { estado.links.push(p); return {}; }
      throw new Error('SQL inesperado: ' + s);
    },
  };
}
const fat = (total, informado = 1) => ({ codFatura: 7, codCartao: 1, dataVencimento: '2026-12-10', competencia: '2026-12', valorTotal: total, valorInformado: informado, nomeCartao: 'Nubank' });

test('fatura R$2.000 com R$1.500 anotados gera Outros de R$500', async () => {
  const c = conexao(fat(2000));
  const r = await syncOutros(c, 7);
  assert.strictEqual(r.outros, 500);
  assert.strictEqual(c.estado.compras.length, 1);
  assert.strictEqual(c.estado.compras[0].valor, 500);
  assert.strictEqual(c.estado.compras[0].chave, 'fatura-outros:7');
  assert.match(c.estado.compras[0].descricao, /^Outros - Nubank 2026-12$/);
  assert.strictEqual(c.estado.links.length, 1);
});

test('reinformar R$2.200 vira Outros de R$700 (não R$1.200) e não duplica', async () => {
  const c = conexao(fat(2000));
  await syncOutros(c, 7);
  const c2 = conexao(fat(2200)); c2.estado.compras = c.estado.compras; c2.estado.links = c.estado.links; c2.estado.parcelas = c.estado.parcelas;
  const r = await syncOutros(c2, 7);
  assert.strictEqual(r.outros, 700);
  assert.strictEqual(c2.estado.compras.length, 1);
  assert.strictEqual(c2.estado.compras[0].valor, 700);
});

test('informar R$1.400 remove o Outros e devolve excedente de R$100', async () => {
  const c = conexao(fat(2000));
  await syncOutros(c, 7);
  const c2 = conexao(fat(1400)); c2.estado.compras = c.estado.compras; c2.estado.links = c.estado.links; c2.estado.parcelas = c.estado.parcelas;
  const r = await syncOutros(c2, 7);
  assert.strictEqual(r.outros, 0);
  assert.strictEqual(r.excedente, 100);
  assert.strictEqual(c2.estado.compras.length, 0);
});

test('fatura sem total informado não cria Outros', async () => {
  const c = conexao(fat(0, 0));
  const r = await syncOutros(c, 7);
  assert.strictEqual(r.outros, 0);
  assert.strictEqual(c.estado.compras.length, 0);
});
