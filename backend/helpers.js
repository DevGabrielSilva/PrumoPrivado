// Funções utilitárias compartilhadas pelas rotas e serviços.
const{pool}=require('./db');

const ok=(r,d,s=200)=>r.status(s).json({sucesso:true,dados:d});
const fail=(r,e,s=500)=>{console.error(e);r.status(s).json({sucesso:false,mensagem:s===500?'Erro interno do servidor':e.message})};
const money=v=>Number(v||0),validDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'');
async function tx(fn){let c;try{c=await pool.getConnection();await c.beginTransaction();const x=await fn(c);await c.commit();return x}catch(e){if(c)await c.rollback();throw e}finally{if(c)c.release()}}
// "Hoje" sempre no fuso do usuário (America/Sao_Paulo), nunca em UTC: à noite o UTC já é o dia seguinte.
const TZ=process.env.PRUMO_TZ||'America/Sao_Paulo';
function hoje(agora=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(agora)}
function mesAtual(agora=new Date()){return hoje(agora).slice(0,7)}
function ym(d){return String(d).slice(0,7)}
function addMonths(d,n){const x=new Date(d);x.setDate(1);x.setMonth(x.getMonth()+n);return x}

module.exports={hoje,mesAtual,ok,fail,money,validDate,tx,ym,addMonths};
