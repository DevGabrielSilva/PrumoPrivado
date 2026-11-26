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

// Aceita 'AAAA-MM' (mês da fatura) ou 'AAAA-MM-DD' e devolve sempre uma data completa válida.
// O mês vira o dia de vencimento do cartão (limitado a 28 para existir em todo mês).
function dataPrimeiraParcela(valor,diaVencimento){
  const v=String(valor||'').slice(0,10);
  if(/^\d{4}-\d{2}$/.test(v))return `${v}-${String(Math.min(28,Math.max(1,Number(diaVencimento)||1))).padStart(2,'0')}`;
  if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
  return null;
}
// Mês provável da fatura: compras depois do fechamento caem na fatura do mês seguinte.
function mesProvavelFatura(dataCompra,diaFechamento){
  const [y,m,d]=String(dataCompra).slice(0,10).split('-').map(Number);let ano=y,mes=m;
  if(d>Number(diaFechamento||31)){mes++;if(mes>12){mes=1;ano++}}
  return `${ano}-${String(mes).padStart(2,'0')}`;
}

async function createCredit(c,b){const n=Math.max(1,Number(b.quantidadeParcelas||1)),total=Math.round(money(b.valorTotal)*100),base=Math.floor(total/n),rest=total-base*n,card=(await c.query('SELECT diaVencimento FROM tbCartoes WHERE codCartao=?',[b.codCartao]))[0];if(!card)throw Error('Cartão inválido');b.dataPrimeiraParcela=dataPrimeiraParcela(b.dataPrimeiraParcela,card.diaVencimento);if(!b.dataPrimeiraParcela)throw Error('Informe o mês da primeira fatura');const cp=await c.query(`INSERT INTO tbComprasCartao(codCartao,dataCompra,descricao,categoria,valorTotal,quantidadeParcelas,valorParcela,dataPrimeiraParcela,codFin) VALUES(?,?,?,?,?,?,?,?,?)`,[b.codCartao,b.dataCompra,b.descricao,b.categoria||null,total/100,n,base/100,b.dataPrimeiraParcela,b.codFin||null]);const tocadas=new Set();for(let i=0;i<n;i++){const d=new Date(b.dataPrimeiraParcela+'T12:00:00');d.setMonth(d.getMonth()+i);const ds=d.toISOString().slice(0,10),comp=ds.slice(0,7),par=await c.query('INSERT INTO tbParcelasCartao(codCompra,numeroParcela,valor,dataParcela) VALUES(?,?,?,?)',[cp.insertId,i+1,(base+(i===n-1?rest:0))/100,ds]);let f=(await c.query('SELECT codFatura FROM tbFaturas WHERE codCartao=? AND competencia=?',[b.codCartao,comp]))[0];if(!f){const fr=await c.query(`INSERT INTO tbFaturas(codCartao,dataFechamento,dataVencimento,valorTotal,paga,competencia,valorInformado) VALUES(?,?,?,?,0,?,0)`,[b.codCartao,ds,ds,0,comp]);f={codFatura:fr.insertId}}await c.query('INSERT IGNORE INTO tbFaturaParcelas(codFatura,codParcela) VALUES(?,?)',[f.codFatura,par.insertId]);tocadas.add(f.codFatura)}
  // Se a fatura já tinha o total informado, o "Outros" é recalculado com a nova compra.
  for(const id of tocadas)await syncOutros(c,id);
  return Number(cp.insertId)}

// Remove a compra (e parcelas) ligada a uma movimentação/custo e devolve as faturas afetadas.
async function removerComprasDoFin(c,codFin){
  const faturas=new Set();
  for(const x of await c.query('SELECT codCompra FROM tbComprasCartao WHERE codFin=?',[codFin])){
    for(const f of await c.query('SELECT DISTINCT fp.codFatura FROM tbFaturaParcelas fp JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela WHERE p.codCompra=?',[x.codCompra]))faturas.add(f.codFatura);
    await c.query('DELETE FROM tbFaturaParcelas WHERE codParcela IN (SELECT codParcela FROM tbParcelasCartao WHERE codCompra=?)',[x.codCompra]);
    await c.query('DELETE FROM tbParcelasCartao WHERE codCompra=?',[x.codCompra]);
    await c.query('DELETE FROM tbComprasCartao WHERE codCompra=?',[x.codCompra]);
  }
  return faturas;
}
// Excluir: a compra sai da fatura. Se a fatura tem total oficial, a diferença volta como "Outros" (total oficial - anotado).
// Sem total oficial, só reduz o anotado/previsto.
async function excluirCompraCredito(c,codFin){
  const faturas=await removerComprasDoFin(c,codFin);
  for(const id of faturas)await syncOutros(c,id);
  return faturas.size;
}
// Editar: refaz a compra e as parcelas com os dados atuais da movimentação (valor, data, descrição, cartão, parcelas, 1ª fatura).
async function refazerCompraCredito(c,codFin,categoria){
  const f=(await c.query('SELECT codFin,dataMovimentacao,descricao,valor,categoria,formaPagamento,codCartao,quantidadeParcelas,primeiraFatura FROM tbFinancas WHERE codFin=?',[codFin]))[0];
  if(!f||f.formaPagamento!=='CREDITO')return false;
  const antigas=await removerComprasDoFin(c,codFin);
  await createCredit(c,{codCartao:f.codCartao,quantidadeParcelas:f.quantidadeParcelas||1,valorTotal:f.valor,dataCompra:String(f.dataMovimentacao).slice(0,10),descricao:f.descricao,categoria:categoria||f.categoria,dataPrimeiraParcela:f.primeiraFatura||String(f.dataMovimentacao).slice(0,10),codFin:f.codFin});
  for(const id of antigas)await syncOutros(c,id);
  return true;
}

module.exports={removerComprasDoFin,excluirCompraCredito,refazerCompraCredito,createCredit,syncOutros,calcularOutros,dataPrimeiraParcela,mesProvavelFatura};
