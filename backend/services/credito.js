// Compras no crédito: gera a compra, as parcelas e as faturas correspondentes.
// Também mantém a despesa automática "Outros" de cada fatura informada.
const{money}=require('../helpers');

// Resto da fatura que não foi anotado (outros) e quanto foi anotado a mais (excedente).
function calcularOutros(valorTotal,conhecidas){const t=Math.round(money(valorTotal)*100),k=Math.round(money(conhecidas)*100),d=t-k;return{outros:d>0?d/100:0,excedente:d<0?-d/100:0}}

// Recalcula a compra automática "Outros" de uma fatura. Ao reinformar o total, atualiza (nunca duplica).
// Resto = total informado - compras anotadas (sem contar o próprio "Outros"). Resto 0 remove; negativo vira excedente.
async function syncOutros(c,codFatura){
  const f=(await c.query('SELECT f.codFatura,f.codCartao,f.dataVencimento,f.competencia,f.valorTotal,f.valorInformado,k.nomeCartao FROM tbFaturas f JOIN tbCartoes k ON k.codCartao=f.codCartao WHERE f.codFatura=?',[codFatura]))[0];
  if(!f)return{outros:0,excedente:0,conhecidas:0};
  const chave=`fatura-outros:${codFatura}`;
  const conhecidas=money((await c.query('SELECT COALESCE(SUM(p.valor),0) v FROM tbFaturaParcelas fp JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela JOIN tbComprasCartao x ON x.codCompra=p.codCompra WHERE fp.codFatura=? AND x.chaveOrigem IS NULL',[codFatura]))[0]?.v);
  for(const o of await c.query('SELECT codCompra FROM tbComprasCartao WHERE chaveOrigem=?',[chave])){
    await c.query('DELETE FROM tbFaturaParcelas WHERE codParcela IN (SELECT codParcela FROM tbParcelasCartao WHERE codCompra=?)',[o.codCompra]);
    await c.query('DELETE FROM tbComprasCartao WHERE codCompra=?',[o.codCompra]);
  }
  if(!Number(f.valorInformado))return{outros:0,excedente:0,conhecidas};
  const r=calcularOutros(f.valorTotal,conhecidas);
  if(r.outros>0){
    const comp=f.competencia||String(f.dataVencimento).slice(0,7),ds=String(f.dataVencimento).slice(0,10);
    const cp=await c.query('INSERT INTO tbComprasCartao(codCartao,dataCompra,descricao,categoria,valorTotal,quantidadeParcelas,valorParcela,dataPrimeiraParcela,chaveOrigem) VALUES(?,?,?,?,?,1,?,?,?)',[f.codCartao,ds,`Outros - ${f.nomeCartao} ${comp}`,'Outros',r.outros,r.outros,ds,chave]);
    const par=await c.query('INSERT INTO tbParcelasCartao(codCompra,numeroParcela,valor,dataParcela) VALUES(?,?,?,?)',[cp.insertId,1,r.outros,ds]);
    await c.query('INSERT IGNORE INTO tbFaturaParcelas(codFatura,codParcela) VALUES(?,?)',[f.codFatura,par.insertId]);
  }
  return{...r,conhecidas};
}

async function createCredit(c,b){const n=Math.max(1,Number(b.quantidadeParcelas||1)),total=Math.round(money(b.valorTotal)*100),base=Math.floor(total/n),rest=total-base*n,card=(await c.query('SELECT diaVencimento FROM tbCartoes WHERE codCartao=?',[b.codCartao]))[0];if(!card)throw Error('Cartão inválido');if(/^\d{4}-\d{2}$/.test(b.dataPrimeiraParcela))b.dataPrimeiraParcela=`${b.dataPrimeiraParcela}-${String(Math.min(28,Number(card.diaVencimento))).padStart(2,'0')}`;const cp=await c.query(`INSERT INTO tbComprasCartao(codCartao,dataCompra,descricao,categoria,valorTotal,quantidadeParcelas,valorParcela,dataPrimeiraParcela) VALUES(?,?,?,?,?,?,?,?)`,[b.codCartao,b.dataCompra,b.descricao,b.categoria||null,total/100,n,base/100,b.dataPrimeiraParcela]);const tocadas=new Set();for(let i=0;i<n;i++){const d=new Date(b.dataPrimeiraParcela+'T12:00:00');d.setMonth(d.getMonth()+i);const ds=d.toISOString().slice(0,10),comp=ds.slice(0,7),par=await c.query('INSERT INTO tbParcelasCartao(codCompra,numeroParcela,valor,dataParcela) VALUES(?,?,?,?)',[cp.insertId,i+1,(base+(i===n-1?rest:0))/100,ds]);let f=(await c.query('SELECT codFatura FROM tbFaturas WHERE codCartao=? AND competencia=?',[b.codCartao,comp]))[0];if(!f){const fr=await c.query(`INSERT INTO tbFaturas(codCartao,dataFechamento,dataVencimento,valorTotal,paga,competencia,valorInformado) VALUES(?,?,?,?,0,?,0)`,[b.codCartao,ds,ds,0,comp]);f={codFatura:fr.insertId}}await c.query('INSERT IGNORE INTO tbFaturaParcelas(codFatura,codParcela) VALUES(?,?)',[f.codFatura,par.insertId]);tocadas.add(f.codFatura)}
  // Se a fatura já tinha o total informado, o "Outros" é recalculado com a nova compra.
  for(const id of tocadas)await syncOutros(c,id);
  return Number(cp.insertId)}

module.exports={createCredit,syncOutros,calcularOutros};
