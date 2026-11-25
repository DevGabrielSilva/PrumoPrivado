// Backup do banco em JSON (todas as tabelas tb*, exceto a de acesso) e restauração com confirmação.
const fs=require('node:fs');
const path=require('node:path');

const EXCLUIDAS=new Set(['tbAcesso']);
const nomeOk=n=>/^tb[A-Za-z0-9_]+$/.test(n)&&!EXCLUIDAS.has(n);
const colOk=n=>/^[A-Za-z0-9_]+$/.test(n);

async function listarTabelas(c){return(await c.query('SHOW TABLES')).map(x=>Object.values(x)[0]).filter(nomeOk)}
async function exportar(c,agora=new Date()){const tabelas={};for(const t of await listarTabelas(c))tabelas[t]=await c.query(`SELECT * FROM \`${t}\``);return{formato:'prumo-backup',versao:1,criadoEm:agora.toISOString(),tabelas}}

// Valida o arquivo antes de qualquer alteração. Lança Error com mensagem em português.
function validarBackup(b){
  if(!b||b.formato!=='prumo-backup'||b.versao!==1||typeof b.tabelas!=='object'||!b.tabelas)throw Error('Arquivo de backup inválido.');
  for(const[t,rows]of Object.entries(b.tabelas)){if(!nomeOk(t))throw Error(`Tabela não permitida no backup: ${t}`);if(!Array.isArray(rows))throw Error(`Dados inválidos em ${t}`);for(const r of rows)for(const k of Object.keys(r))if(!colOk(k))throw Error(`Coluna inválida em ${t}`)}
  return true;
}
// Restaura numa conexão já dentro de uma transação. Só toca tabelas que existem no banco e no arquivo.
async function restaurar(c,b){
  validarBackup(b);const noBanco=new Set(await listarTabelas(c)),usar=Object.keys(b.tabelas).filter(t=>noBanco.has(t));
  if(!usar.length)throw Error('Nenhuma tabela do backup existe neste banco.');
  await c.query('SET FOREIGN_KEY_CHECKS=0');
  try{
    for(const t of usar)await c.query(`DELETE FROM \`${t}\``);
    for(const t of usar){const rows=b.tabelas[t];if(!rows.length)continue;const cols=Object.keys(rows[0]),sql=`INSERT INTO \`${t}\`(${cols.map(x=>`\`${x}\``).join(',')}) VALUES (${cols.map(()=>'?').join(',')})`;for(let i=0;i<rows.length;i+=200)await c.batch(sql,rows.slice(i,i+200).map(r=>cols.map(k=>r[k]??null)))}
  }finally{await c.query('SET FOREIGN_KEY_CHECKS=1')}
  return{tabelas:usar.length,linhas:usar.reduce((a,t)=>a+b.tabelas[t].length,0)};
}

const stamp=d=>d.toISOString().slice(0,10);
function salvarArquivo(dir,backup,prefixo='prumo-backup',agora=new Date()){fs.mkdirSync(dir,{recursive:true});const f=path.join(dir,`${prefixo}-${stamp(agora)}${prefixo==='prumo-backup'?'':'-'+agora.toISOString().slice(11,19).replace(/:/g,'')}.json`);fs.writeFileSync(f,JSON.stringify(backup),{mode:0o600});return f}
function limparAntigos(dir,manter=14){const l=fs.readdirSync(dir).filter(f=>/^prumo-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();for(const f of l.slice(0,Math.max(0,l.length-manter)))fs.unlinkSync(path.join(dir,f));return l.length}

// Backup automático diário (se ainda não existe o de hoje). Desligue com BACKUP_AUTO=0.
function iniciarAutomatico(pool,{dir,manter=14,intervaloMs=6*3600e3,log=console.log}={}){
  const rodar=async()=>{try{const f=path.join(dir,`prumo-backup-${stamp(new Date())}.json`);if(fs.existsSync(f))return;const b=await exportar(pool);const r=salvarArquivo(dir,b);limparAntigos(dir,manter);log(`Backup automático salvo em ${r}`)}catch(e){console.error('Falha no backup automático:',e.message)}};
  rodar();const t=setInterval(rodar,intervaloMs);t.unref();return t;
}

module.exports={exportar,restaurar,validarBackup,salvarArquivo,limparAntigos,iniciarAutomatico,listarTabelas,nomeOk};
