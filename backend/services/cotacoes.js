// Cotação de moedas (dólar e euro) com cache de 6 horas no banco.
const{pool}=require('../db');
const{money}=require('../helpers');

async function quote(code){const cache=(await pool.query('SELECT * FROM tbCotacoes WHERE moeda=?',[code]))[0];if(cache&&Date.now()-new Date(cache.consultadaEm).getTime()<21600000)return{valor:money(cache.cotacaoCompra),data:cache.dataCotacao,fonte:cache.fonte};try{const r=await fetch(`https://api.frankfurter.dev/v2/rates?base=${code}&quotes=BRL`,{signal:AbortSignal.timeout(8000)});const j=await r.json(),row=j.find?.(x=>x.quote==='BRL');if(!row?.rate)throw Error();await pool.query(`INSERT INTO tbCotacoes(moeda,cotacaoCompra,dataCotacao,fonte,consultadaEm) VALUES(?,?,?,'Frankfurter',NOW()) ON DUPLICATE KEY UPDATE cotacaoCompra=VALUES(cotacaoCompra),dataCotacao=VALUES(dataCotacao),fonte='Frankfurter',consultadaEm=NOW()`,[code,row.rate,row.date]);return{valor:money(row.rate),data:row.date,fonte:'Frankfurter'}}catch(e){if(cache)return{valor:money(cache.cotacaoCompra),data:cache.dataCotacao,fonte:cache.fonte,desatualizada:true};return{valor:0,data:null,fonte:null,indisponivel:true}}}

module.exports={quote};
