// Garante, ao iniciar, as colunas que o app precisa. Se o banco ainda não tem (migração não rodada), cria sozinho.
// Se o usuário do banco não tiver permissão de ALTER, avisa no terminal o comando para rodar manualmente.
async function garantirColunas(pool){
  try{
    const cols=await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tbComprasCartao' AND COLUMN_NAME='codFin'");
    if(cols.length)return true;
    await pool.query('ALTER TABLE tbComprasCartao ADD COLUMN codFin INT NULL');
    console.log('Banco atualizado: coluna tbComprasCartao.codFin criada. Rode database/migrate-consolidated.sql para ligar as compras antigas.');
    return true;
  }catch(e){
    console.warn('ATENÇÃO: não consegui criar tbComprasCartao.codFin automaticamente ('+e.message+'). Rode: mariadb -u root -p dbGabiru < database/migrate-consolidated.sql');
    return false;
  }
}

// Custos de Bens pagos no crédito que ficaram sem a compra ligada (criados antes da v2.5): liga a compra que já está na
// fatura (mesmo cartão e valor) ou cria a compra e as parcelas com os dados do próprio custo. Roda a cada início e não duplica.
async function religarCustosBens(pool){
  const {createCredit,mesProvavelFatura}=require('./credito');
  const res={ligados:0,criados:0,semDados:[],ambiguos:[]};
  let custos;
  try{custos=await pool.query(`SELECT f.codFin,f.descricao,f.valor,f.dataMovimentacao,f.codCartao,f.quantidadeParcelas,f.primeiraFatura FROM tbFinancas f WHERE f.formaPagamento='CREDITO' AND f.tipo='DESPESA' AND f.recorrente=0 AND (f.origem='CUSTO_BEM' OR EXISTS(SELECT 1 FROM tbCustosBens c WHERE c.codFin=f.codFin)) AND NOT EXISTS(SELECT 1 FROM tbComprasCartao x WHERE x.codFin=f.codFin)`)}
  catch(e){console.warn('Não consegui conferir os custos de Bens no crédito: '+e.message);return res}
  for(const f of custos){
    const nome=f.descricao||('custo '+f.codFin);
    if(f.codCartao==null){res.semDados.push({codFin:f.codFin,descricao:nome,falta:'cartão'});continue}
    let c;
    try{
      c=await pool.getConnection();await c.beginTransaction();
      const n=Math.max(1,Number(f.quantidadeParcelas||1));
      const cand=await c.query('SELECT x.codCompra FROM tbComprasCartao x WHERE x.codFin IS NULL AND x.chaveOrigem IS NULL AND x.codCartao=? AND x.valorTotal=?',[f.codCartao,f.valor]);
      const iguais=cand.length?Number((await c.query(`SELECT COUNT(*) n FROM tbFinancas g WHERE g.codFin<>? AND g.formaPagamento='CREDITO' AND g.tipo='DESPESA' AND g.recorrente=0 AND g.codCartao=? AND g.valor=? AND NOT EXISTS(SELECT 1 FROM tbComprasCartao y WHERE y.codFin=g.codFin)`,[f.codFin,f.codCartao,f.valor]))[0]?.n||0):0;
      if(cand.length===1&&!iguais){await c.query('UPDATE tbComprasCartao SET codFin=? WHERE codCompra=?',[f.codFin,cand[0].codCompra]);res.ligados++}
      else if(cand.length){res.ambiguos.push({codFin:f.codFin,descricao:nome})}
      else{
        const cart=(await c.query('SELECT diaFechamento FROM tbCartoes WHERE codCartao=?',[f.codCartao]))[0];
        if(!cart){res.semDados.push({codFin:f.codFin,descricao:nome,falta:'cartão (não existe mais)'})}
        else{
          const data=String(f.dataMovimentacao).slice(0,10),pf=f.primeiraFatura?String(f.primeiraFatura).slice(0,10):mesProvavelFatura(data,cart.diaFechamento);
          await createCredit(c,{codCartao:f.codCartao,quantidadeParcelas:n,valorTotal:f.valor,dataCompra:data,descricao:nome,categoria:'Bens',dataPrimeiraParcela:pf,codFin:f.codFin});
          res.criados++;
          if(!f.quantidadeParcelas||!f.primeiraFatura)res.semDados.push({codFin:f.codFin,descricao:nome,falta:(!f.quantidadeParcelas?'parcelas (assumi 1x) ':'')+(!f.primeiraFatura?'mês da primeira fatura (usei o mês provável)':'')})
        }
      }
      await c.commit();
    }catch(e){if(c)try{await c.rollback()}catch(_){}console.warn('Custo de Bens '+nome+': não consegui ligar à fatura ('+e.message+')')}
    finally{if(c)c.release()}
  }
  if(res.ligados||res.criados||res.semDados.length||res.ambiguos.length)console.log('Custos de Bens no crédito: '+res.ligados+' ligados a compras já existentes, '+res.criados+' criados nas faturas'+(res.semDados.length?', '+res.semDados.length+' com dado faltando':'')+(res.ambiguos.length?', '+res.ambiguos.length+' ambíguos (não mexi)':'')+'.');
  return res;
}
module.exports={garantirColunas,religarCustosBens};
