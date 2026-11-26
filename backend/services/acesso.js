// Acesso com senha/PIN: hash scrypt (nunca texto puro), sessão em cookie HttpOnly e limite de tentativas.
// Desligado por padrão (uso local). Quando ligado, protege a API e as páginas.
const crypto=require('node:crypto');
const express=require('express');

const scrypt=(s,salt)=>new Promise((res,rej)=>crypto.scrypt(String(s),salt,64,{N:16384},(e,k)=>e?rej(e):res(k)));
async function hashSenha(senha){const salt=crypto.randomBytes(16);return `scrypt$${salt.toString('hex')}$${(await scrypt(senha,salt)).toString('hex')}`}
async function verificarSenha(senha,guardado){const[alg,s,h]=String(guardado||'').split('$');if(alg!=='scrypt'||!s||!h)return false;const k=await scrypt(senha,Buffer.from(s,'hex')),b=Buffer.from(h,'hex');return b.length===k.length&&crypto.timingSafeEqual(b,k)}
function senhaValida(s){return typeof s==='string'&&s.length>=6&&s.length<=128}

class Sessoes{
  constructor(ttlMs=12*3600e3,agora=Date.now){this.ttl=ttlMs;this.agora=agora;this.m=new Map()}
  criar(){const t=crypto.randomBytes(32).toString('hex');this.m.set(t,this.agora()+this.ttl);return t}
  valida(t){const e=this.m.get(t);if(!e)return false;if(e<=this.agora()){this.m.delete(t);return false}return true}
  encerrar(t){this.m.delete(t)}
  encerrarTodas(){this.m.clear()}
}
class LimiteTentativas{
  constructor(max=5,bloqueioMs=60e3,agora=Date.now){this.max=max;this.bloqueio=bloqueioMs;this.agora=agora;this.m=new Map()}
  segundosBloqueado(k){const e=this.m.get(k);if(!e||!e.ate)return 0;const r=e.ate-this.agora();if(r<=0){this.m.delete(k);return 0}return Math.ceil(r/1000)}
  falhou(k){const e=this.m.get(k)||{n:0};e.n++;if(e.n>=this.max){e.ate=this.agora()+this.bloqueio;e.n=0}this.m.set(k,e)}
  limpar(k){this.m.delete(k)}
}
const lerCookie=(req,nome)=>{for(const p of String(req.headers.cookie||'').split(';')){const[k,...v]=p.trim().split('=');if(k===nome)return decodeURIComponent(v.join('='))}return null};
const PUBLICO=[/^\/login\.html$/,/^\/css\//,/^\/assets\//,/^\/api\/auth\//];
// Caminhos que nunca devem ser servidos como arquivo estático (código, banco, dependências).
const PRIVADO=/^\/(backend|database|tests|node_modules|backups)(\/|$)|^\/(package(-lock)?\.json|README\.md)$/i;

// lerAcesso(): {ativo, senhaHash}; salvarAcesso(ativo, senhaHash)
function criarAcesso({lerAcesso,salvarAcesso,sessoes=new Sessoes(),limite=new LimiteTentativas()}){
  let cache=null,cacheEm=0;
  const estado=async()=>{if(cache&&Date.now()-cacheEm<3000)return cache;try{cache=(await lerAcesso())||{ativo:false}}catch{cache={ativo:false}}cacheEm=Date.now();return cache};
  const logado=req=>sessoes.valida(lerCookie(req,'prumo_sessao'));
  const cookie=(req,v,max)=>`prumo_sessao=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${max}${req.secure||req.headers['x-forwarded-proto']==='https'?'; Secure':''}`;
  const chaveIp=req=>req.ip||req.socket?.remoteAddress||'?';

  async function middleware(req,res,next){
    if(PRIVADO.test(req.path))return res.status(404).json({sucesso:false,mensagem:'Rota não encontrada'});
    const e=await estado();
    if(!e.ativo||PUBLICO.some(r=>r.test(req.path))||logado(req))return next();
    if(req.path.startsWith('/api/'))return res.status(401).json({sucesso:false,mensagem:'Acesso protegido',loginNecessario:true});
    if(req.method==='GET'&&(req.path==='/'||req.path.endsWith('.html')))return res.redirect(302,'/login.html');
    return res.status(401).end();
  }

  const router=express.Router();
  const ok=(r,d,s=200)=>r.status(s).json({sucesso:true,dados:d}),erro=(r,m,s=400)=>r.status(s).json({sucesso:false,mensagem:m});
  router.get('/estado',async(q,r)=>{const e=await estado();ok(r,{ativo:!!e.ativo,logado:!e.ativo||logado(q)})});
  router.post('/entrar',async(q,r)=>{try{const e=await estado();if(!e.ativo)return ok(r,{ativo:false});const k=chaveIp(q),s=limite.segundosBloqueado(k);if(s)return erro(r,`Muitas tentativas. Tente de novo em ${s}s.`,429);if(await verificarSenha(String(q.body?.senha??''),e.senhaHash)){limite.limpar(k);r.setHeader('Set-Cookie',cookie(q,sessoes.criar(),43200));return ok(r,{logado:true})}limite.falhou(k);erro(r,'Senha incorreta.',401)}catch(x){console.error(x);erro(r,'Erro interno do servidor',500)}});
  router.post('/sair',(q,r)=>{sessoes.encerrar(lerCookie(q,'prumo_sessao'));r.setHeader('Set-Cookie',cookie(q,'',0));ok(r,{})});
  // Ligar/desligar/trocar senha. Com acesso ativo exige sessão válida e a senha atual.
  router.post('/configurar',async(q,r)=>{try{const e=await estado(),b=q.body||{};if(e.ativo){if(!logado(q))return erro(r,'Acesso protegido',401);if(!(await verificarSenha(String(b.senhaAtual??''),e.senhaHash)))return erro(r,'Senha atual incorreta.',401)}
    if(b.ativo===false){if(!e.ativo)return ok(r,{ativo:false});await salvarAcesso(false,null);cache=null;sessoes.encerrarTodas();return ok(r,{ativo:false})}
    if(!senhaValida(b.novaSenha))return erro(r,'A senha precisa ter de 6 a 128 caracteres.');
    await salvarAcesso(true,await hashSenha(b.novaSenha));cache=null;sessoes.encerrarTodas();const t=sessoes.criar();r.setHeader('Set-Cookie',cookie(q,t,43200));ok(r,{ativo:true})}catch(x){console.error(x);erro(r,'Erro interno do servidor',500)}});
  return{middleware,router,sessoes,limite,estado};
}

// Ligação com o banco (tabela tbAcesso, uma linha).
function comBanco(pool){return criarAcesso({
  lerAcesso:async()=>{const x=(await pool.query('SELECT ativo,senhaHash FROM tbAcesso WHERE id=1'))[0];return x?{ativo:!!Number(x.ativo),senhaHash:x.senhaHash}:{ativo:false}},
  salvarAcesso:(ativo,hash)=>pool.query('INSERT INTO tbAcesso(id,ativo,senhaHash) VALUES(1,?,?) ON DUPLICATE KEY UPDATE ativo=VALUES(ativo),senhaHash=VALUES(senhaHash)',[ativo?1:0,hash]),
})}

module.exports={hashSenha,verificarSenha,senhaValida,Sessoes,LimiteTentativas,criarAcesso,comBanco,lerCookie,PRIVADO};
