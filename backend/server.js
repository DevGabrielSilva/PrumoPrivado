// PRUMO - servidor HTTP. Organiza o Express e monta as rotas da API.
// A lógica de negócio está em backend/services/ e as rotas em backend/routes/.
const express=require('express');
const path=require('path');
const app=express();
const PORT=Number(process.env.PORT||3000);
const HOST=process.env.HOST||'127.0.0.1';
const{pool}=require('./db');
const{projection,ensureOccurrences}=require('./services/core');

app.use(express.json());app.use(express.static(path.join(__dirname,'..')));

app.use('/api/app',require('./routes/visao-geral'));
app.use('/api/app',require('./routes/movimentacoes'));
app.use('/api/app',require('./routes/transferencias'));
app.use('/api/app',require('./routes/cambio'));
app.use('/api/app',require('./routes/bens'));
app.use('/api/app',require('./routes/cartoes'));
app.use('/api/app',require('./routes/objetivos'));
app.use('/api/app',require('./routes/configuracoes'));
app.use('/api/app',require('./routes/gastos-fixos'));

app.use((q,r)=>r.status(404).json({sucesso:false,mensagem:'Rota não encontrada'}));
if(require.main===module)app.listen(PORT,HOST,()=>console.log(`PRUMO em http://${HOST}:${PORT}`));
module.exports={app,pool,projection,ensureOccurrences,HOST,PORT};
