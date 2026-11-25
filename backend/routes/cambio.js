// Câmbio: compra e venda de dólar e euro, com movimentação vinculada em reais.
const express=require('express');
const router=express.Router();
const crypto=require('crypto');
const{pool}=require('../db');
const{ok,fail,money,validDate,tx}=require('../helpers');
const{saldo}=require('../services/core');

router.get('/cambio',async(q,r)=>{try{ok(r,await pool.query(`SELECT *,CASE WHEN chaveOperacao LIKE 'saldo-inicial:%' THEN 'CONFIGURACAO_INICIAL' WHEN origemLegada IS NOT NULL THEN 'HISTORICO_IMPORTADO' ELSE 'OPERACAO_MANUAL' END origem FROM tbMoedasEstrangeiras ORDER BY dataMovimentacao DESC,codMoeda DESC`))}catch(e){fail(r,e)}});
router.post('/cambio/simular',async(q,r)=>{try{const b=q.body,c=money(b.cotacaoOperacao),reais=money(b.valorReal),qty=money(b.valorMoeda),buy=b.tipo!=='SAIDA';if(c<=0||(reais<=0&&qty<=0))throw Error('Informe valores válidos');const value=reais>0?reais:qty*c,amount=qty>0?qty:reais/c,s=await saldo();ok(r,{valorReal:value,valorMoeda:amount,cotacao:c,saldoDepois:s+(buy?-value:value),saldoSuficiente:!buy||s>=value})}catch(e){fail(r,e,400)}});
router.post('/cambio',async(q,r)=>{try{const b=q.body,v=money(b.valorReal),qty=money(b.valorMoeda),rate=money(b.cotacaoOperacao);if(!validDate(b.dataMovimentacao)||!['USD','EUR'].includes(b.moeda)||v<=0||qty<=0||rate<=0)throw Error('Dados inválidos');if(b.tipo==='ENTRADA'&&await saldo()<v)throw Error('Saldo insuficiente');const key=crypto.randomUUID();await tx(async c=>{if(b.tipo==='SAIDA'){const x=(await c.query(`SELECT COALESCE(SUM(CASE WHEN tipo='ENTRADA' THEN valorMoeda ELSE -valorMoeda END),0) v FROM tbMoedasEstrangeiras WHERE moeda=?`,[b.moeda]))[0];if(money(x.v)<qty)throw Error('Saldo insuficiente na moeda')}const desc=b.descricao||`${b.tipo==='ENTRADA'?'Compra':'Venda'} de ${b.moeda}`,fin=await c.query(`INSERT INTO tbFinancas(dataMovimentacao,tipo,descricao,valor,categoria,recorrente,situacao,origem,chaveOrigem) VALUES(?,?,?,?,?,0,'EFETIVADA','MOEDA_ESTRANGEIRA',?)`,[b.dataMovimentacao,b.tipo==='ENTRADA'?'DESPESA':'RECEITA',desc,v,'INVESTIMENTOS','moeda:'+key]);await c.query(`INSERT INTO tbMoedasEstrangeiras(dataMovimentacao,moeda,tipo,valorReal,cotacaoOperacao,valorMoeda,descricao,chaveOperacao,codFinReal) VALUES(?,?,?,?,?,?,?,?,?)`,[b.dataMovimentacao,b.moeda,b.tipo,v,rate,qty,desc,key,fin.insertId])});ok(r,{},201)}catch(e){fail(r,e,400)}});
router.delete('/cambio/:id',async(q,r)=>{try{await tx(async c=>{const x=(await c.query('SELECT codFinReal FROM tbMoedasEstrangeiras WHERE codMoeda=?',[q.params.id]))[0];await c.query('DELETE FROM tbMoedasEstrangeiras WHERE codMoeda=?',[q.params.id]);if(x?.codFinReal)await c.query('DELETE FROM tbFinancas WHERE codFin=?',[x.codFinReal])});ok(r,{})}catch(e){fail(r,e,409)}});

module.exports=router;
