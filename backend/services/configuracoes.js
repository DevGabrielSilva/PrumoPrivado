// Saldos iniciais em moeda estrangeira, registrados como operações rastreáveis.
const{money,hoje}=require('../helpers');
const{quote}=require('./cotacoes');

async function upsertInitial(c,code,qty,rate){const key='saldo-inicial:'+code,old=(await c.query('SELECT codMoeda FROM tbMoedasEstrangeiras WHERE chaveOperacao=?',[key]))[0];if(qty<=0){if(old)await c.query('DELETE FROM tbMoedasEstrangeiras WHERE codMoeda=?',[old.codMoeda]);return}rate=money(rate)||money((await quote(code)).valor)||1;if(old)await c.query(`UPDATE tbMoedasEstrangeiras SET dataMovimentacao='${hoje()}',tipo='ENTRADA',valorReal=?,cotacaoOperacao=?,valorMoeda=?,descricao='Saldo inicial configurado' WHERE codMoeda=?`,[qty*rate,rate,qty,old.codMoeda]);else await c.query(`INSERT INTO tbMoedasEstrangeiras(dataMovimentacao,moeda,tipo,valorReal,cotacaoOperacao,valorMoeda,descricao,chaveOperacao) VALUES('${hoje()}',?,'ENTRADA',?,?,?,'Saldo inicial configurado',?)`,[code,qty*rate,rate,qty,key])}

module.exports={upsertInitial};
