const express = require('express');
const mariadb = require('mariadb');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dbGabiru', connectionLimit: 5, bigIntAsNumber: true
});
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

const ok = (res, dados, status = 200) => res.status(status).json({ sucesso: true, dados });
const fail = (res, error, status = 500) => {
  console.error(error);
  return res.status(status).json({ sucesso: false, mensagem: status === 500 ? 'Erro interno do servidor' : error.message });
};
const money = value => Number(value || 0);
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
async function transaction(callback) {
  let conn;
  try { conn = await pool.getConnection(); await conn.beginTransaction(); const result = await callback(conn); await conn.commit(); return result; }
  catch (error) { if (conn) await conn.rollback(); throw error; }
  finally { if (conn) conn.release(); }
}

async function ptaxDireta(moeda, dias = 10) {
  const fim = new Date(), inicio = new Date(); inicio.setDate(fim.getDate() - dias);
  const fmt = d => `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}-${d.getFullYear()}`;
  const base = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/';
  const url = moeda === 'USD'
    ? `${base}CotacaoDolarPeriodo(dataInicial=@i,dataFinalCotacao=@f)?@i='${fmt(inicio)}'&@f='${fmt(fim)}'&$orderby=dataHoraCotacao%20desc&$top=1&$format=json`
    : `${base}CotacaoMoedaPeriodoFechamento(moeda=@m,dataInicial=@i,dataFinalCotacao=@f)?@m='EUR'&@i='${fmt(inicio)}'&@f='${fmt(fim)}'&$orderby=dataHoraCotacao%20desc&$top=1&$format=json`;
  const response = await fetch(url,{signal:AbortSignal.timeout(9000)});
  if(!response.ok) throw Error('PTAX indisponível');
  const json = await response.json();
  if(!json.value?.length) throw Error('Sem cotação PTAX');
  const row=json.value[0]; return {valor:money(row.cotacaoCompra),venda:money(row.cotacaoVenda),data:row.dataHoraCotacao,fonte:'Banco Central do Brasil'};
}
async function frankfurter(moeda){
  const response=await fetch(`https://api.frankfurter.dev/v2/rates?base=${moeda}&quotes=BRL`,{signal:AbortSignal.timeout(9000)});
  if(!response.ok) throw Error('Fonte alternativa indisponível');
  const json=await response.json(), row=Array.isArray(json)?json.find(x=>x.quote==='BRL'):null;
  if(!row?.rate) throw Error('Sem cotação alternativa');
  return {valor:money(row.rate),venda:null,data:row.date,fonte:'Frankfurter'};
}
async function cachedQuote(moeda){
  const cache=(await pool.query('SELECT * FROM tbCotacoes WHERE moeda=?',[moeda]))[0];
  if(cache && Date.now()-new Date(cache.consultadaEm).getTime()<6*3600000) return {valor:money(cache.cotacaoCompra),venda:money(cache.cotacaoVenda),data:cache.dataCotacao,fonte:cache.fonte,cache:true};
  let quote;
  for(const dias of [10,30]){try{quote=await ptaxDireta(moeda,dias);break}catch(e){}}
  if(!quote){try{quote=await frankfurter(moeda)}catch(e){}}
  if(quote){await pool.query(`INSERT INTO tbCotacoes(moeda,cotacaoCompra,cotacaoVenda,dataCotacao,fonte,consultadaEm) VALUES(?,?,?,?,?,NOW()) ON DUPLICATE KEY UPDATE cotacaoCompra=VALUES(cotacaoCompra),cotacaoVenda=VALUES(cotacaoVenda),dataCotacao=VALUES(dataCotacao),fonte=VALUES(fonte),consultadaEm=NOW()`,[moeda,quote.valor,quote.venda,quote.data,quote.fonte]);return quote}
  if(cache)return {valor:money(cache.cotacaoCompra),venda:money(cache.cotacaoVenda),data:cache.dataCotacao,fonte:cache.fonte,cache:true,desatualizada:true};
  throw Error('Cotação indisponível e sem histórico salvo');
}


app.get('/api/saude', async (req, res) => { try { ok(res, (await pool.query('SELECT DATABASE() banco'))[0]); } catch (e) { fail(res, e); } });
app.get('/api/cotacoes', async (req,res)=>{try{const [usd,eur]=await Promise.allSettled([cachedQuote('USD'),cachedQuote('EUR')]);const parse=r=>r.status==='fulfilled'?{...r.value,disponivel:true}:{valor:null,data:null,fonte:null,disponivel:false};ok(res,{USD:parse(usd),EUR:parse(eur)})}catch(e){fail(res,e)}});

async function dashboardData() {
  const [base, saldos, cotacoes] = await Promise.all([
    pool.query(`SELECT
      (SELECT COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE -valor END),0) FROM tbFinancas WHERE dataMovimentacao<=CURRENT_DATE)
      -(SELECT COALESCE(SUM(CASE WHEN origem='SALDO' THEN valor WHEN destino='SALDO' THEN -valor ELSE 0 END),0) FROM tbTransferencias WHERE dataTransferencia<=CURRENT_DATE) saldo,
      (SELECT COALESCE(SUM(CASE WHEN destino='POUPANCA' THEN valor ELSE -valor END),0) FROM tbTransferencias WHERE dataTransferencia<=CURRENT_DATE) poupanca,
      (SELECT COALESCE(SUM(valorAtual),0) FROM tbBens) bens`),
    pool.query(`SELECT moeda, COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN valorMoeda ELSE -valorMoeda END),0) saldo FROM tbMoedasEstrangeiras WHERE dataMovimentacao<=CURRENT_DATE GROUP BY moeda`),
    Promise.allSettled([cachedQuote('USD'), cachedQuote('EUR')])
  ]);
  const moedaSaldo = { USD: 0, EUR: 0 }; saldos.forEach(x => moedaSaldo[x.moeda] = money(x.saldo));
  const moedaCotacao = { USD: 0, EUR: 0 };
  if (cotacoes[0].status === 'fulfilled') moedaCotacao.USD = money(cotacoes[0].value.valor);
  if (cotacoes[1].status === 'fulfilled') moedaCotacao.EUR = money(cotacoes[1].value.valor);
  const moedasReais = moedaSaldo.USD * moedaCotacao.USD + moedaSaldo.EUR * moedaCotacao.EUR;
  const item = base[0];
  return { saldo: money(item.saldo), poupanca: money(item.poupanca), bens: money(item.bens), saldos: moedaSaldo, cotacoes: moedaCotacao, moedasReais, patrimonio: money(item.saldo) + money(item.poupanca) + money(item.bens) + moedasReais };
}
app.get('/api/dashboard', async (req, res) => { try { ok(res, await dashboardData()); } catch (e) { fail(res, e); } });
app.get('/api/resumo', async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7);
    const row = (await pool.query(`SELECT COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END),0) entradas, COALESCE(SUM(CASE WHEN tipo='DESPESA' THEN valor ELSE 0 END),0) saidas FROM tbFinancas WHERE DATE_FORMAT(dataMovimentacao,'%Y-%m')=?`, [mes]))[0];
    ok(res, { entradas: money(row.entradas), saidas: money(row.saidas), saldo: money(row.entradas) - money(row.saidas) });
  } catch (e) { fail(res, e); }
});

const crud = {
  financas: { table: 'tbFinancas', id: 'codFin', fields: ['dataMovimentacao','tipo','descricao','valor','categoria','recorrente','frequencia','dataInicioRecorrencia','dataFimRecorrencia'], order: 'dataMovimentacao DESC,codFin DESC' },
  transferencias: { table: 'tbTransferencias', id: 'codTransferencia', fields: ['dataTransferencia','origem','destino','valor','descricao'], order: 'dataTransferencia DESC,codTransferencia DESC' },
  moedas: { table: 'tbMoedasEstrangeiras', id: 'codMoeda', fields: ['dataMovimentacao','moeda','tipo','valorReal','cotacaoOperacao','valorMoeda','descricao'], order: 'dataMovimentacao DESC,codMoeda DESC' },
  bens: { table: 'tbBens', id: 'codBem', fields: ['dataAquisicao','descricao','categoria','valorPago','valorAtual'], order: 'codBem DESC' },
  cartoes: { table: 'tbCartoes', id: 'codCartao', fields: ['nomeCartao','diaFechamento','diaVencimento','ativo'], order: 'codCartao DESC' },
  objetivos: { table: 'tbObjetivos', id: 'codObjetivo', fields: ['descricao','categoria','valorObjetivo','dataCriacao','dataObjetivo','ativo'], order: 'codObjetivo DESC' },
  programas: { table: 'tbProgramasPontos', id: 'codPrograma', fields: ['nomePrograma','saldo','dataAtualizacao'], order: 'nomePrograma' }
};
for (const [route, c] of Object.entries(crud)) {
  app.get('/api/' + route, async (req, res) => {
    try {
      const filters = [], params = [];
      if (route === 'financas') {
        if (req.query.tipo) { filters.push('tipo=?'); params.push(req.query.tipo); }
        if (req.query.categoria) { filters.push('categoria=?'); params.push(req.query.categoria); }
        if (req.query.mes) { filters.push("DATE_FORMAT(dataMovimentacao,'%Y-%m')=?"); params.push(req.query.mes); }
      }
      const where = filters.length ? ' WHERE ' + filters.join(' AND ') : '';
      ok(res, await pool.query(`SELECT * FROM ${c.table}${where} ORDER BY ${c.order}`, params));
    } catch (e) { fail(res, e); }
  });
  app.post('/api/' + route, async (req, res) => {
    try {
      if (route === 'transferencias' && req.body.origem === req.body.destino) throw Error('Origem e destino devem ser diferentes');
      const fields = route === 'bens' ? ['dataCadastro', ...c.fields] : c.fields;
      const values = route === 'bens' ? [new Date().toISOString().slice(0,10), ...c.fields.map(f => req.body[f] ?? null)] : c.fields.map(f => req.body[f] ?? null);
      const result = await pool.query(`INSERT INTO ${c.table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values);
      ok(res, { id: Number(result.insertId) }, 201);
    } catch (e) { fail(res, e, 400); }
  });
  app.delete('/api/' + route + '/:id', async (req, res) => {
    try {
      if (route === 'moedas') {
        const result = await transaction(async conn => {
          const item = (await conn.query('SELECT codFinReal FROM tbMoedasEstrangeiras WHERE codMoeda=? FOR UPDATE', [req.params.id]))[0];
          if (!item) return 0;
          await conn.query('DELETE FROM tbMoedasEstrangeiras WHERE codMoeda=?', [req.params.id]);
          if (item.codFinReal) await conn.query('DELETE FROM tbFinancas WHERE codFin=?', [item.codFinReal]);
          return 1;
        });
        return ok(res, { excluidos: result });
      }
      const result = await pool.query(`DELETE FROM ${c.table} WHERE ${c.id}=?`, [req.params.id]);
      ok(res, { excluidos: result.affectedRows });
    } catch (e) { fail(res, e, 409); }
  });
}

app.post('/api/moedas/simular', async (req, res) => {
  try {
    const { moeda, tipo, valorReal, valorMoeda, cotacaoOperacao } = req.body;
    const cotacao = money(cotacaoOperacao), reais = money(valorReal), quantidade = money(valorMoeda);
    if (!['USD','EUR'].includes(moeda) || cotacao <= 0 || (reais <= 0 && quantidade <= 0)) throw Error('Informe moeda, cotação e um valor válido');
    const dash = await dashboardData();
    const resultado = reais > 0 ? { valorReal: reais, valorMoeda: reais / cotacao } : { valorReal: quantidade * cotacao, valorMoeda: quantidade };
    const compra = tipo !== 'SAIDA';
    ok(res, { ...resultado, cotacao, saldoAntes: dash.saldo, saldoDepois: dash.saldo + (compra ? -resultado.valorReal : resultado.valorReal), saldoSuficiente: compra ? dash.saldo >= resultado.valorReal : true });
  } catch (e) { fail(res, e, 400); }
});
app.post('/api/moedas/operacao', async (req, res) => {
  try {
    const body = req.body, cotacao = money(body.cotacaoOperacao), valorReal = money(body.valorReal), valorMoeda = money(body.valorMoeda);
    if (!validDate(body.dataMovimentacao) || !['USD','EUR'].includes(body.moeda) || !['ENTRADA','SAIDA'].includes(body.tipo) || cotacao <= 0 || valorReal <= 0 || valorMoeda <= 0) throw Error('Dados da operação inválidos');
    const chave = body.chaveOperacao || crypto.randomUUID();
    const result = await transaction(async conn => {
      const existe = await conn.query('SELECT codMoeda FROM tbMoedasEstrangeiras WHERE chaveOperacao=?', [chave]);
      if (existe.length) return { codMoeda: existe[0].codMoeda, repetida: true };
      if (body.tipo === 'SAIDA') {
        const saldo = (await conn.query(`SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN valorMoeda ELSE -valorMoeda END),0) saldo FROM tbMoedasEstrangeiras WHERE moeda=? FOR UPDATE`, [body.moeda]))[0];
        if (money(saldo.saldo) < valorMoeda) throw Error('Saldo insuficiente na moeda estrangeira');
      }
      const descricao = body.descricao || `${body.tipo === 'ENTRADA' ? 'Compra' : 'Venda'} de ${body.moeda}`;
      const fin = await conn.query(`INSERT INTO tbFinancas(dataMovimentacao,tipo,descricao,valor,categoria,origem,chaveOrigem) VALUES(?,?,?,?,?,'MOEDA_ESTRANGEIRA',?)`, [body.dataMovimentacao, body.tipo === 'ENTRADA' ? 'DESPESA' : 'RECEITA', descricao, valorReal, 'INVESTIMENTOS', 'moeda:' + chave]);
      const moeda = await conn.query(`INSERT INTO tbMoedasEstrangeiras(dataMovimentacao,moeda,tipo,valorReal,cotacaoOperacao,valorMoeda,descricao,chaveOperacao,codFinReal) VALUES(?,?,?,?,?,?,?,?,?)`, [body.dataMovimentacao, body.moeda, body.tipo, valorReal, cotacao, valorMoeda, descricao, chave, fin.insertId]);
      return { codMoeda: Number(moeda.insertId), codFin: Number(fin.insertId), repetida: false };
    });
    ok(res, result, 201);
  } catch (e) { fail(res, e, 400); }
});

app.post('/api/compras-cartao', async (req, res) => {
  try {
    const b = req.body, total = Math.round(money(b.valorTotal) * 100), parcelas = Number(b.quantidadeParcelas);
    if (!validDate(b.dataCompra) || !validDate(b.dataPrimeiraParcela) || total <= 0 || parcelas < 1) throw Error('Dados da compra inválidos');
    const id = await transaction(async conn => {
      const base = Math.floor(total / parcelas), resto = total - base * parcelas;
      const compra = await conn.query(`INSERT INTO tbComprasCartao(codCartao,dataCompra,descricao,categoria,valorTotal,quantidadeParcelas,valorParcela,dataPrimeiraParcela,codBem) VALUES(?,?,?,?,?,?,?,?,?)`, [b.codCartao,b.dataCompra,b.descricao,b.categoria||null,total/100,parcelas,base/100,b.dataPrimeiraParcela,b.codBem||null]);
      for (let i=0;i<parcelas;i++) { const d=new Date(b.dataPrimeiraParcela+'T12:00:00'); d.setMonth(d.getMonth()+i); await conn.query(`INSERT INTO tbParcelasCartao(codCompra,numeroParcela,valor,dataParcela) VALUES(?,?,?,?)`, [compra.insertId,i+1,(base+(i===parcelas-1?resto:0))/100,d.toISOString().slice(0,10)]); }
      return Number(compra.insertId);
    }); ok(res,{codCompra:id},201);
  } catch(e){ fail(res,e,400); }
});
app.get('/api/faturas', async (req,res)=>{try{ok(res,await pool.query(`SELECT f.*,ca.nomeCartao,COALESCE(SUM(p.valor),0) parcelasConhecidas,GREATEST(f.valorTotal-COALESCE(SUM(p.valor),0),0) outros FROM tbFaturas f JOIN tbCartoes ca ON ca.codCartao=f.codCartao LEFT JOIN tbFaturaParcelas fp ON fp.codFatura=f.codFatura LEFT JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela GROUP BY f.codFatura ORDER BY f.dataVencimento DESC`));}catch(e){fail(res,e)}});
app.post('/api/faturas/:id/pagar',async(req,res)=>{try{await transaction(async conn=>{const f=(await conn.query('SELECT * FROM tbFaturas WHERE codFatura=? FOR UPDATE',[req.params.id]))[0];if(!f||f.paga)throw Error('Fatura inexistente ou já paga');const data=req.body.dataPagamento||new Date().toISOString().slice(0,10);const fin=await conn.query(`INSERT INTO tbFinancas(dataMovimentacao,tipo,descricao,valor,categoria,origem,chaveOrigem) VALUES(?,'DESPESA',?,?,?,'FATURA',?)`,[data,`Pagamento de fatura #${f.codFatura}`,f.valorTotal,'CARTAO',`fatura:${f.codFatura}`]);await conn.query('UPDATE tbFaturas SET paga=1,dataPagamento=?,codFinPagamento=? WHERE codFatura=?',[data,fin.insertId,f.codFatura]);await conn.query(`UPDATE tbParcelasCartao p JOIN tbFaturaParcelas fp ON fp.codParcela=p.codParcela SET p.paga=1,p.faturada=1 WHERE fp.codFatura=?`,[f.codFatura])});ok(res,{mensagem:'Fatura paga'});}catch(e){fail(res,e,400)}});
app.get('/api/objetivos-progresso',async(req,res)=>{try{ok(res,await pool.query(`SELECT o.* FROM tbObjetivos o ORDER BY o.ativo DESC,o.dataObjetivo`));}catch(e){fail(res,e)}});
app.post('/api/pontos/:id/movimentacoes',async(req,res)=>{try{await transaction(async conn=>{const sinal=req.body.tipo==='ENTRADA'?1:-1,p=(await conn.query('SELECT saldo FROM tbProgramasPontos WHERE codPrograma=? FOR UPDATE',[req.params.id]))[0];if(!p||money(p.saldo)+sinal*money(req.body.quantidade)<0)throw Error('Saldo de pontos insuficiente');await conn.query(`INSERT INTO tbMovimentacoesPontos(codPrograma,dataMovimentacao,tipo,quantidade,descricao) VALUES(?,?,?,?,?)`,[req.params.id,req.body.dataMovimentacao,req.body.tipo,req.body.quantidade,req.body.descricao]);await conn.query('UPDATE tbProgramasPontos SET saldo=saldo+?,dataAtualizacao=? WHERE codPrograma=?',[sinal*money(req.body.quantidade),req.body.dataMovimentacao,req.params.id])});ok(res,{mensagem:'Saldo atualizado'},201);}catch(e){fail(res,e,400)}});

async function buildProjection(meses, extra = null) {
  const dash = await dashboardData();
  const [future, recurring, bills] = await Promise.all([
    pool.query(`SELECT DATE_FORMAT(dataMovimentacao,'%Y-%m') mes,tipo,valor FROM tbFinancas WHERE dataMovimentacao>CURRENT_DATE AND recorrente=0`),
    pool.query(`SELECT tipo,valor,frequencia,dataInicioRecorrencia,dataFimRecorrencia FROM tbFinancas WHERE recorrente=1`),
    pool.query(`SELECT DATE_FORMAT(dataVencimento,'%Y-%m') mes,valorTotal FROM tbFaturas WHERE paga=0 AND dataVencimento>=CURRENT_DATE`)
  ]);
  let saldo = dash.saldo; const out = [], now = new Date();
  for (let i=0;i<meses;i++) {
    const first = new Date(now.getFullYear(),now.getMonth()+i,1), last = new Date(now.getFullYear(),now.getMonth()+i+1,0), ym = `${first.getFullYear()}-${String(first.getMonth()+1).padStart(2,'0')}`; let impacto=0;
    future.forEach(x=>{if(x.mes===ym)impacto+=(x.tipo==='RECEITA'?1:-1)*money(x.valor)});
    recurring.forEach(x=>{const ini=new Date(x.dataInicioRecorrencia||now),fim=x.dataFimRecorrencia?new Date(x.dataFimRecorrencia):null;if(ini<=last&&(!fim||fim>=first)&& (x.frequencia!=='ANUAL'||ini.getMonth()===first.getMonth())) impacto+=(x.tipo==='RECEITA'?1:-1)*money(x.valor)});
    bills.forEach(x=>{if(x.mes===ym)impacto-=money(x.valorTotal)});
    if(extra){const ini=new Date(extra.data+'T12:00:00'),index=(first.getFullYear()-ini.getFullYear())*12+first.getMonth()-ini.getMonth();if(index===0&&extra.entrada>0)impacto-=extra.entrada;if(index>=0&&index<extra.ocorrencias)impacto-=extra.parcela;}
    saldo+=impacto;out.push({mes:ym,impacto,saldo});
  } return out;
}
app.get('/api/projecao',async(req,res)=>{try{ok(res,await buildProjection(Math.min(36,Math.max(1,Number(req.query.meses||12)))))}catch(e){fail(res,e)}});
app.post('/api/simulador',async(req,res)=>{try{const valor=money(req.body.valor),entrada=money(req.body.entrada),parcelas=Math.max(1,Number(req.body.parcelas||1)),recorrente=String(req.body.recorrente)==='1';if(valor<=0||entrada<0||entrada>valor||!validDate(req.body.data))throw Error('Valores da simulação inválidos');let ocorrencias=parcelas;if(recorrente&&req.body.dataFim){const a=new Date(req.body.data+'T12:00:00'),b=new Date(req.body.dataFim+'T12:00:00');ocorrencias=Math.max(1,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+1)}else if(recorrente)ocorrencias=24;const parcela=(valor-entrada)/parcelas,meses=Math.min(60,Math.max(6,ocorrencias+3));ok(res,{projecao:await buildProjection(meses,{data:req.body.data,entrada,ocorrencias,parcela:recorrente?valor:parcela}),horizonte:meses,continua:recorrente&&!req.body.dataFim});}catch(e){fail(res,e,400)}});


// ===== Núcleo financeiro v4 =====
app.get('/api/v4/configuracoes',async(req,res)=>{try{ok(res,(await pool.query('SELECT * FROM tbConfiguracoes WHERE id=1'))[0])}catch(e){fail(res,e)}});
app.put('/api/v4/configuracoes',async(req,res)=>{try{const b=req.body;await pool.query('UPDATE tbConfiguracoes SET saldoInicial=?,dataSaldoInicial=?,limiteSeguranca=?,dataUltimoBackup=COALESCE(?,dataUltimoBackup) WHERE id=1',[money(b.saldoInicial),b.dataSaldoInicial,money(b.limiteSeguranca),b.dataUltimoBackup||null]);ok(res,{mensagem:'Configurações salvas'})}catch(e){fail(res,e,400)}});

async function saldoReal(){const c=(await pool.query('SELECT * FROM tbConfiguracoes WHERE id=1'))[0]||{saldoInicial:0,dataSaldoInicial:'1900-01-01'};const r=(await pool.query(`SELECT COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE -valor END),0) saldo FROM tbFinancas WHERE situacao='EFETIVADA' AND dataMovimentacao<=CURRENT_DATE AND dataMovimentacao>=?`,[c.dataSaldoInicial]))[0];const t=(await pool.query(`SELECT COALESCE(SUM(CASE WHEN origem='SALDO' THEN valor WHEN destino='SALDO' THEN -valor ELSE 0 END),0) valor FROM tbTransferencias WHERE dataTransferencia<=CURRENT_DATE`))[0];return money(c.saldoInicial)+money(r.saldo)-money(t.valor)}
app.get('/api/v4/dashboard',async(req,res)=>{try{const saldo=await saldoReal(),cfg=(await pool.query('SELECT * FROM tbConfiguracoes WHERE id=1'))[0],poup=(await pool.query(`SELECT COALESCE(SUM(CASE WHEN destino='POUPANCA' THEN valor ELSE -valor END),0) v FROM tbTransferencias WHERE dataTransferencia<=CURRENT_DATE`))[0],bens=(await pool.query('SELECT COALESCE(SUM(valorAtual),0) v FROM tbBens'))[0],d=await dashboardData();const ym=new Date().toISOString().slice(0,7);const m=(await pool.query(`SELECT COALESCE(SUM(CASE WHEN tipo='RECEITA' AND situacao='PREVISTA' THEN valor ELSE 0 END),0) receitasPrevistas,COALESCE(SUM(CASE WHEN tipo='DESPESA' AND situacao='PREVISTA' THEN valor ELSE 0 END),0) despesasPrevistas FROM tbFinancas WHERE DATE_FORMAT(dataMovimentacao,'%Y-%m')=?`,[ym]))[0];const fat=(await pool.query(`SELECT COALESCE(SUM(CASE WHEN valorInformado=1 THEN valorTotal ELSE conhecido END),0) total FROM (SELECT f.codFatura,f.valorTotal,f.valorInformado,COALESCE(SUM(p.valor),0) conhecido FROM tbFaturas f LEFT JOIN tbFaturaParcelas fp ON fp.codFatura=f.codFatura LEFT JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela WHERE f.paga=0 AND DATE_FORMAT(f.dataVencimento,'%Y-%m')=? GROUP BY f.codFatura) x`,[ym]))[0];const fimMes=saldo+money(m.receitasPrevistas)-money(m.despesasPrevistas)-money(fat.total);ok(res,{saldo,poupanca:money(poup.v),saldos:d.saldos,moedasReais:d.moedasReais,patrimonio:saldo+money(poup.v)+d.moedasReais+money(bens.v),limiteSeguranca:money(cfg.limiteSeguranca),esteMes:{receitasPrevistas:money(m.receitasPrevistas),despesasPrevistas:money(m.despesasPrevistas),faturasAbertas:money(fat.total),saldoFim:fimMes}})}catch(e){fail(res,e)}});

app.get('/api/v4/movimentacoes',async(req,res)=>{try{const w=[],p=[];if(req.query.mes){w.push("DATE_FORMAT(f.dataMovimentacao,'%Y-%m')=?");p.push(req.query.mes)}if(req.query.busca){w.push('(f.descricao LIKE ? OR f.categoria LIKE ?)');p.push('%'+req.query.busca+'%','%'+req.query.busca+'%')}if(req.query.situacao){w.push('f.situacao=?');p.push(req.query.situacao)}const q=`SELECT f.*,c.nomeCartao FROM tbFinancas f LEFT JOIN tbCartoes c ON c.codCartao=f.codCartao ${w.length?'WHERE '+w.join(' AND '):''} ORDER BY f.dataMovimentacao DESC,f.codFin DESC`;ok(res,await pool.query(q,p))}catch(e){fail(res,e)}});
app.post('/api/v4/movimentacoes',async(req,res)=>{try{const b=req.body;if(!validDate(b.dataMovimentacao)||!['RECEITA','DESPESA'].includes(b.tipo)||money(b.valor)<=0)throw Error('Dados inválidos');const situacao=b.situacao|| (b.dataMovimentacao>new Date().toISOString().slice(0,10)?'PREVISTA':'EFETIVADA');const id=await transaction(async c=>{const r=await c.query(`INSERT INTO tbFinancas(dataMovimentacao,tipo,descricao,valor,categoria,recorrente,frequencia,dataInicioRecorrencia,dataFimRecorrencia,situacao,formaPagamento,codCartao,quantidadeParcelas,primeiraFatura,origem) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[b.dataMovimentacao,b.tipo,b.descricao,money(b.valor),b.categoria||null,Number(b.recorrente||0),b.recorrente?b.frequencia:null,b.recorrente?b.dataInicioRecorrencia:null,b.recorrente?b.dataFimRecorrencia:null,situacao,b.formaPagamento||null,b.codCartao||null,b.quantidadeParcelas||null,b.primeiraFatura||null,b.origem||'MANUAL']);if(b.tipo==='DESPESA'&&b.formaPagamento==='CREDITO'){const n=Math.max(1,Number(b.quantidadeParcelas||1)),total=Math.round(money(b.valor)*100),base=Math.floor(total/n),rest=total-base*n;const compra=await c.query(`INSERT INTO tbComprasCartao(codCartao,dataCompra,descricao,categoria,valorTotal,quantidadeParcelas,valorParcela,dataPrimeiraParcela) VALUES(?,?,?,?,?,?,?,?)`,[b.codCartao,b.dataMovimentacao,b.descricao,b.categoria||null,total/100,n,base/100,b.primeiraFatura]);for(let i=0;i<n;i++){const dt=new Date(b.primeiraFatura+'T12:00:00');dt.setMonth(dt.getMonth()+i);const par=await c.query(`INSERT INTO tbParcelasCartao(codCompra,numeroParcela,valor,dataParcela) VALUES(?,?,?,?)`,[compra.insertId,i+1,(base+(i===n-1?rest:0))/100,dt.toISOString().slice(0,10)]);const comp=dt.toISOString().slice(0,7),venc=dt.toISOString().slice(0,10);let f=(await c.query('SELECT codFatura FROM tbFaturas WHERE codCartao=? AND competencia=?',[b.codCartao,comp]))[0];if(!f){const fr=await c.query(`INSERT INTO tbFaturas(codCartao,dataFechamento,dataVencimento,valorTotal,paga,competencia,valorInformado) VALUES(?,?,?,?,0,?,0)`,[b.codCartao,venc,venc,0,comp]);f={codFatura:fr.insertId}}await c.query('INSERT IGNORE INTO tbFaturaParcelas(codFatura,codParcela) VALUES(?,?)',[f.codFatura,par.insertId])}}return Number(r.insertId)});ok(res,{id},201)}catch(e){fail(res,e,400)}});
app.put('/api/v4/movimentacoes/:id',async(req,res)=>{try{const b=req.body;await pool.query(`UPDATE tbFinancas SET dataMovimentacao=?,tipo=?,descricao=?,valor=?,categoria=?,situacao=?,formaPagamento=? WHERE codFin=?`,[b.dataMovimentacao,b.tipo,b.descricao,money(b.valor),b.categoria||null,b.situacao,b.formaPagamento||null,req.params.id]);ok(res,{mensagem:'Atualizada'})}catch(e){fail(res,e,400)}});

app.get('/api/v4/cartoes',async(req,res)=>{try{ok(res,await pool.query('SELECT * FROM tbCartoes ORDER BY ativo DESC,nomeCartao'))}catch(e){fail(res,e)}});
app.get('/api/v4/faturas',async(req,res)=>{try{ok(res,await pool.query(`SELECT f.*,c.nomeCartao,COALESCE(SUM(p.valor),0) comprasConhecidas,GREATEST(f.valorTotal-COALESCE(SUM(p.valor),0),0) outros,CASE WHEN f.valorTotal<COALESCE(SUM(p.valor),0) THEN COALESCE(SUM(p.valor),0)-f.valorTotal ELSE 0 END divergencia FROM tbFaturas f JOIN tbCartoes c ON c.codCartao=f.codCartao LEFT JOIN tbFaturaParcelas fp ON fp.codFatura=f.codFatura LEFT JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela GROUP BY f.codFatura ORDER BY f.competencia DESC`))}catch(e){fail(res,e)}});
app.post('/api/v4/faturas',async(req,res)=>{try{const b=req.body,comp=b.competencia,venc=b.dataVencimento;await pool.query(`INSERT INTO tbFaturas(codCartao,dataFechamento,dataVencimento,valorTotal,paga,competencia,valorInformado) VALUES(?,?,?,?,0,?,1) ON DUPLICATE KEY UPDATE dataVencimento=VALUES(dataVencimento),valorTotal=VALUES(valorTotal),valorInformado=1`,[b.codCartao,venc,venc,money(b.valorTotal),comp]);ok(res,{mensagem:'Fatura informada'},201)}catch(e){fail(res,e,400)}});

app.get('/api/v4/bens',async(req,res)=>{try{const rows=await pool.query(`SELECT b.*,COALESCE((SELECT JSON_ARRAYAGG(JSON_OBJECT('codObrigacao',o.codObrigacao,'ano',o.ano,'tipo',o.tipo,'valor',o.valor,'dataVencimento',o.dataVencimento,'paga',o.paga)) FROM tbObrigacoesBens o WHERE o.codBem=b.codBem),JSON_ARRAY()) obrigacoes FROM tbBens b ORDER BY b.codBem DESC`);ok(res,rows)}catch(e){fail(res,e)}});
app.post('/api/v4/bens',async(req,res)=>{try{const b=req.body,id=await transaction(async c=>{const r=await c.query('INSERT INTO tbBens(dataCadastro,dataAquisicao,descricao,categoria,valorPago,valorAtual) VALUES(CURRENT_DATE,?,?,?,?,?)',[b.dataAquisicao,b.descricao,b.categoria,money(b.valorPago),money(b.valorAtual)]);for(const o of(b.obrigacoes||[])){if(money(o.valor)>0)await c.query('INSERT INTO tbObrigacoesBens(codBem,ano,tipo,descricao,valor,dataVencimento,paga,quantidadeParcelas) VALUES(?,?,?,?,?,?,?,?)',[r.insertId,o.ano,o.tipo,o.descricao||null,money(o.valor),o.dataVencimento||null,Number(o.paga||0),Number(o.quantidadeParcelas||1)])}return Number(r.insertId)});ok(res,{id},201)}catch(e){fail(res,e,400)}});
app.post('/api/v4/obrigacoes/:id/pagar',async(req,res)=>{try{await transaction(async c=>{const o=(await c.query('SELECT * FROM tbObrigacoesBens WHERE codObrigacao=? FOR UPDATE',[req.params.id]))[0];if(!o||o.paga)throw Error('Obrigação inexistente ou paga');const data=req.body.dataPagamento||new Date().toISOString().slice(0,10);const f=await c.query(`INSERT INTO tbFinancas(dataMovimentacao,tipo,descricao,valor,categoria,situacao,origem) VALUES(?,'DESPESA',?,?,?,'EFETIVADA','OBRIGACAO_BEM')`,[data,`${o.tipo} ${o.ano}`,o.valor,'BENS']);await c.query('UPDATE tbObrigacoesBens SET paga=1,dataPagamento=?,codFinPagamento=? WHERE codObrigacao=?',[data,f.insertId,o.codObrigacao])});ok(res,{mensagem:'Pagamento registrado'})}catch(e){fail(res,e,400)}});

app.get('/api/v4/compromissos',async(req,res)=>{try{ok(res,await pool.query(`SELECT dataMovimentacao data,descricao,tipo,valor,'MOVIMENTACAO' origem FROM tbFinancas WHERE situacao='PREVISTA' UNION ALL SELECT dataVencimento,CONCAT(tipo,' ',ano),'DESPESA',valor,'BEM' FROM tbObrigacoesBens WHERE paga=0 AND dataVencimento IS NOT NULL UNION ALL SELECT dataVencimento,CONCAT('Fatura ',c.nomeCartao),'DESPESA',f.valorTotal,'FATURA' FROM tbFaturas f JOIN tbCartoes c ON c.codCartao=f.codCartao WHERE f.paga=0 AND f.valorInformado=1 ORDER BY data`))}catch(e){fail(res,e)}});
app.get('/api/v4/projecao',async(req,res)=>{try{const meses=Math.min(36,Math.max(1,Number(req.query.meses||12))),cfg=(await pool.query('SELECT limiteSeguranca FROM tbConfiguracoes WHERE id=1'))[0],saldo=await saldoReal(),rows=await pool.query(`SELECT DATE_FORMAT(dataMovimentacao,'%Y-%m') mes,SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE -valor END) impacto FROM tbFinancas WHERE situacao='PREVISTA' GROUP BY mes`),faturas=await pool.query(`SELECT DATE_FORMAT(dataVencimento,'%Y-%m') mes,SUM(CASE WHEN valorInformado=1 THEN valorTotal ELSE conhecido END) total FROM (SELECT f.codFatura,f.dataVencimento,f.valorTotal,f.valorInformado,COALESCE(SUM(p.valor),0) conhecido FROM tbFaturas f LEFT JOIN tbFaturaParcelas fp ON fp.codFatura=f.codFatura LEFT JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela WHERE f.paga=0 GROUP BY f.codFatura) x GROUP BY mes`),obs=await pool.query(`SELECT DATE_FORMAT(dataVencimento,'%Y-%m') mes,SUM(valor) total FROM tbObrigacoesBens WHERE paga=0 AND dataVencimento IS NOT NULL GROUP BY mes`);let value=saldo,out=[],now=new Date();for(let i=0;i<meses;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1),ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;let impacto=money(rows.find(x=>x.mes===ym)?.impacto)-money(faturas.find(x=>x.mes===ym)?.total)-money(obs.find(x=>x.mes===ym)?.total);value+=impacto;out.push({mes:ym,impacto,saldo:value,nivel:value<0?'VERMELHO':value<money(cfg.limiteSeguranca)?'AMARELO':'VERDE'})}ok(res,out)}catch(e){fail(res,e)}});

app.post('/api/v4/simulador-comparar',async(req,res)=>{try{const b=req.body,avista=money(b.precoAVista),entrada=money(b.entrada),parcelas=Math.max(1,Number(b.parcelas)),vp=money(b.valorParcela),taxa=Number(b.rendimentoLiquidoAnual||0)/100;if(avista<=0||vp<=0)throw Error('Valores inválidos');const total=entrada+parcelas*vp,custoExtra=total-avista,capital=Math.max(0,avista-entrada),rendimento=capital*(Math.pow(1+taxa,parcelas/12)-1),vantagem=rendimento-custoExtra,tolerancia=Math.max(50,avista*.005),recomendacao=vantagem>tolerancia?'PARCELADO':vantagem<-tolerancia?'A_VISTA':'INCONCLUSIVO';const meses=parcelas+3,base=await saldoReal(),cfg=(await pool.query('SELECT limiteSeguranca FROM tbConfiguracoes WHERE id=1'))[0];let sVista=base,sParc=base,out=[];for(let i=0;i<meses;i++){if(i===0){sVista-=avista;sParc-=entrada}sParc-=i<parcelas?vp:0;out.push({mes:i+1,saldoAVista:sVista,saldoParcelado:sParc})}const menorVista=Math.min(...out.map(x=>x.saldoAVista)),menorParcelado=Math.min(...out.map(x=>x.saldoParcelado));ok(res,{avista,totalParcelado:total,custoExtra,rendimento,vantagem,recomendacao,pontoEquilibrioAnual:capital>0?(Math.pow(1+custoExtra/capital,12/parcelas)-1)*100:null,menorVista,menorParcelado,limite:money(cfg.limiteSeguranca),projecao:out})}catch(e){fail(res,e,400)}});
app.use((req,res)=>res.status(404).json({sucesso:false,mensagem:'Rota não encontrada'}));
if(require.main===module)app.listen(PORT,()=>console.log(`PRUMO em http://localhost:${PORT}`));
module.exports={app,pool};
