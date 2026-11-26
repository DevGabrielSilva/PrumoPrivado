// PRUMO - servidor HTTP. Organiza o Express e monta as rotas da API.
// A lógica de negócio está em backend/services/ e as rotas em backend/routes/.
const express=require('express');
const path=require('path');
const app=express();
const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||'127.0.0.1';
const{pool}=require('./db');
const{projection,ensureOccurrences}=require('./services/core');

app.use(express.json({limit:'9mb'}));
// Acesso com senha (desligado por padrão): protege API e páginas quando ligado. Também bloqueia o download do código.
const acesso=require('./services/acesso').comBanco(pool);
app.use(acesso.middleware);app.use('/api/auth',acesso.router);
app.use(express.static(path.join(__dirname,'..')));

app.use('/api/app',require('./routes/visao-geral'));
app.use('/api/app',require('./routes/movimentacoes'));
app.use('/api/app',require('./routes/transferencias'));
app.use('/api/app',require('./routes/cambio'));
app.use('/api/app',require('./routes/bens'));
app.use('/api/app',require('./routes/cartoes'));
app.use('/api/app',require('./routes/objetivos'));
app.use('/api/app',require('./routes/configuracoes'));
app.use('/api/app',require('./routes/gastos-fixos'));
app.use('/api/app',require('./routes/dados'));

app.use((q,r)=>r.status(404).json({sucesso:false,mensagem:'Rota não encontrada'}));
if(require.main===module)require('./services/schema').garantirColunas(pool).then(async ok=>{if(ok)await require('./services/schema').religarCustosBens(pool).catch(e=>console.warn(e.message))}).then(()=>app.listen(PORT,HOST,()=>{console.log(`PRUMO em http://${HOST}:${PORT}`);
  // Backup automático diário em ./backups (14 cópias). BACKUP_AUTO=0 desliga; BACKUP_DIR muda a pasta.
  if(process.env.BACKUP_AUTO!=='0')require('./services/backup').iniciarAutomatico(pool,{dir:process.env.BACKUP_DIR||path.join(__dirname,'..','backups')});
}));
module.exports={app,pool,projection,ensureOccurrences,HOST,PORT};
