// Configurações iniciais e reset completo dos dados.
const express=require('express');
const router=express.Router();
const{ok,fail,money,tx}=require('../helpers');
const{cfg}=require('../services/core');
const{upsertInitial}=require('../services/configuracoes');
const{pool}=require('../db');

router.get('/configuracoes',async(q,r)=>{try{const c=await cfg(),x=await pool.query(`SELECT moeda,valorMoeda,cotacaoOperacao FROM tbMoedasEstrangeiras WHERE chaveOperacao IN ('saldo-inicial:USD','saldo-inicial:EUR')`),map={USD:{saldo:0,cotacao:0},EUR:{saldo:0,cotacao:0}};x.forEach(v=>map[v.moeda]={saldo:money(v.valorMoeda),cotacao:money(v.cotacaoOperacao)});ok(r,{...c,saldoInicialUSD:map.USD.saldo,cotacaoInicialUSD:map.USD.cotacao,saldoInicialEUR:map.EUR.saldo,cotacaoInicialEUR:map.EUR.cotacao})}catch(e){fail(r,e)}});
router.put('/configuracoes',async(q,r)=>{try{const b=q.body;await tx(async c=>{await c.query(`UPDATE tbConfiguracoes SET saldoInicial=?,poupancaInicial=?,dataSaldoInicial=?,limiteSeguranca=?,reservaEmergencia=?,alertaUSDAtivo=?,alertaUSDValor=?,alertaEURAtivo=?,alertaEURValor=?,configuracaoInicialConcluida=1 WHERE id=1`,[money(b.saldoInicial),money(b.poupancaInicial),b.dataSaldoInicial,money(b.limiteSeguranca),money(b.reservaEmergencia),Number(b.alertaUSDAtivo??1),money(b.alertaUSDValor),Number(b.alertaEURAtivo??1),money(b.alertaEURValor)]);await upsertInitial(c,'USD',money(b.saldoInicialUSD),b.cotacaoInicialUSD);await upsertInitial(c,'EUR',money(b.saldoInicialEUR),b.cotacaoInicialEUR)});ok(r,{})}catch(e){fail(r,e,400)}});
router.post('/reset',async(q,r)=>{try{if(q.body.frase!=='APAGAR TUDO'||q.body.confirmacao!==true)throw Error('Confirmação inválida');await tx(async c=>{for(const t of ['tbFaturaParcelas','tbParcelasCartao','tbComprasCartao','tbFaturas','tbCartoes','tbCustosBens','tbObrigacoesBens','tbAportesObjetivos','tbObjetivos','tbMovimentacoesPontos','tbProgramasPontos','tbOcorrenciasRecorrentes','tbMoedasEstrangeiras','tbInvestimentosDolar','tbTransferencias','tbFinancas','tbBens','tbCotacoes'])await c.query(`DELETE FROM ${t}`);await c.query(`UPDATE tbConfiguracoes SET saldoInicial=0,poupancaInicial=0,dataSaldoInicial=CURRENT_DATE,limiteSeguranca=0,reservaEmergencia=0,configuracaoInicialConcluida=0 WHERE id=1`)});ok(r,{})}catch(e){fail(r,new Error('Não foi possível apagar os dados. Nenhuma alteração foi confirmada.'),400)}});

module.exports=router;
