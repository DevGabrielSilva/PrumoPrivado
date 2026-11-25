// Funções utilitárias compartilhadas pelas rotas e serviços.
const{pool}=require('./db');

const ok=(r,d,s=200)=>r.status(s).json({sucesso:true,dados:d});
const fail=(r,e,s=500)=>{console.error(e);r.status(s).json({sucesso:false,mensagem:s===500?'Erro interno do servidor':e.message})};
const money=v=>Number(v||0),validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
async function tx(fn){let c;try{c=await pool.getConnection();await c.beginTransaction();const x=await fn(c);await c.commit();return x}catch(e){if(c)await c.rollback();throw e}finally{if(c)c.release()}}
function ym(d){return String(d).slice(0,7)}
function addMonths(d,n){const x=new Date(d);x.setDate(1);x.setMonth(x.getMonth()+n);return x}

module.exports={ok,fail,money,validDate,tx,ym,addMonths};
