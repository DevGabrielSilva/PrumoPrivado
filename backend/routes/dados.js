// Dados: backup/restauração, exportação CSV e meta mensal de "Outros".
const express=require('express');
const path=require('node:path');
const router=express.Router();
const{pool}=require('../db');
const{ok,fail,money,validDate,tx}=require('../helpers');
const backup=require('../services/backup');
const{paraCsv}=require('../services/csv');
const{situacaoMeta}=require('../services/metas');
const DIR=process.env.BACKUP_DIR||path.join(__dirname,'..','..','backups');

router.get('/backup',async(q,r)=>{try{const b=await backup.exportar(pool);r.setHeader('Content-Type','application/json; charset=utf-8');r.setHeader('Content-Disposition',`attachment; filename="prumo-backup-${new Date().toISOString().slice(0,10)}.json"`);r.send(JSON.stringify(b))}catch(e){fail(r,e)}});
router.post('/backup/salvar',async(q,r)=>{try{const f=backup.salvarArquivo(DIR,await backup.exportar(pool),'prumo-manual');ok(r,{arquivo:path.basename(f),pasta:DIR})}catch(e){fail(r,e)}});
// Restaurar APAGA os dados atuais. Exige a frase RESTAURAR e guarda uma cópia de segurança antes.
router.post('/backup/restaurar',async(q,r)=>{try{if(q.body?.confirmacao!=='RESTAURAR')throw Error('Digite RESTAURAR para confirmar.');backup.validarBackup(q.body.arquivo);const seguranca=backup.salvarArquivo(DIR,await backup.exportar(pool),'prumo-antes-de-restaurar');const res=await tx(c=>backup.restaurar(c,q.body.arquivo));ok(r,{...res,copiaDeSeguranca:path.basename(seguranca)})}catch(e){fail(r,e,400)}});

const EXPORTS={
  movimentacoes:{arq:'movimentacoes',cols:[['Data','dataMovimentacao','data'],['Tipo','tipo'],['Descrição','descricao'],['Categoria','categoria'],['Valor','valor','num'],['Situação','situacao'],['Pagamento','formaPagamento'],['Origem','origem']],
    sql:`SELECT dataMovimentacao,tipo,descricao,categoria,valor,situacao,formaPagamento,origem FROM tbFinancas WHERE recorrente=0 AND (? IS NULL OR dataMovimentacao>=?) AND (? IS NULL OR dataMovimentacao<=?) ORDER BY dataMovimentacao,codFin`,datas:true},
  faturas:{arq:'faturas',cols:[['Cartão','nomeCartao'],['Competência','competencia'],['Vencimento','dataVencimento','data'],['Total informado','valorTotal','num'],['Total informado?','informado'],['Anotado','anotado','num'],['Outros','outros','num'],['Paga','pagaTxt']],
    sql:`SELECT c.nomeCartao,f.competencia,f.dataVencimento,f.valorTotal,CASE WHEN f.valorInformado=1 THEN 'Sim' ELSE 'Não' END informado,COALESCE(SUM(CASE WHEN x.chaveOrigem IS NULL THEN p.valor END),0) anotado,COALESCE(SUM(CASE WHEN x.chaveOrigem IS NOT NULL THEN p.valor END),0) outros,CASE WHEN f.paga=1 THEN 'Sim' ELSE 'Não' END pagaTxt FROM tbFaturas f JOIN tbCartoes c ON c.codCartao=f.codCartao LEFT JOIN tbFaturaParcelas fp ON fp.codFatura=f.codFatura LEFT JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela LEFT JOIN tbComprasCartao x ON x.codCompra=p.codCompra GROUP BY f.codFatura ORDER BY f.dataVencimento`},
  compras:{arq:'compras-cartao',cols:[['Cartão','nomeCartao'],['Descrição','descricao'],['Categoria','categoria'],['Data da compra','dataCompra','data'],['Parcela','parcelaTxt'],['Valor da parcela','valor','num'],['Data da parcela','dataParcela','data'],['Automática (Outros)','automatica']],
    sql:`SELECT c.nomeCartao,x.descricao,x.categoria,x.dataCompra,CONCAT(p.numeroParcela,'/',x.quantidadeParcelas) parcelaTxt,p.valor,p.dataParcela,CASE WHEN x.chaveOrigem IS NULL THEN 'Não' ELSE 'Sim' END automatica FROM tbParcelasCartao p JOIN tbComprasCartao x ON x.codCompra=p.codCompra JOIN tbCartoes c ON c.codCartao=x.codCartao ORDER BY p.dataParcela,x.codCompra,p.numeroParcela`},
  transferencias:{arq:'transferencias',cols:[['Data','dataTransferencia','data'],['Origem','origem'],['Destino','destino'],['Valor','valor','num'],['Descrição','descricao']],
    sql:`SELECT dataTransferencia,origem,destino,valor,descricao FROM tbTransferencias ORDER BY dataTransferencia,codTransferencia`},
};
router.get('/exportar/:tipo.csv',async(q,r)=>{try{const e=EXPORTS[q.params.tipo];if(!e)return r.status(404).json({sucesso:false,mensagem:'Tipo de exportação desconhecido'});let params=[];if(e.datas){const de=validDate(q.query.de)?q.query.de:null,ate=validDate(q.query.ate)?q.query.ate:null;params=[de,de,ate,ate]}const rows=await pool.query(e.sql,params);r.setHeader('Content-Type','text/csv; charset=utf-8');r.setHeader('Content-Disposition',`attachment; filename="prumo-${e.arq}-${new Date().toISOString().slice(0,10)}.csv"`);r.send(paraCsv(e.cols.map(([titulo,campo,tipo])=>({titulo,campo,tipo})),rows))}catch(x){fail(r,x)}});

async function gastoOutros(comp){const[a,b]=await Promise.all([pool.query(`SELECT COALESCE(SUM(p.valor),0) v FROM tbParcelasCartao p JOIN tbComprasCartao x ON x.codCompra=p.codCompra WHERE x.chaveOrigem IS NOT NULL AND DATE_FORMAT(p.dataParcela,'%Y-%m')=?`,[comp]),pool.query(`SELECT COALESCE(SUM(valor),0) v FROM tbFinancas WHERE recorrente=0 AND tipo='DESPESA' AND categoria='Outros' AND situacao<>'CANCELADA' AND COALESCE(formaPagamento,'')<>'CREDITO' AND DATE_FORMAT(dataMovimentacao,'%Y-%m')=?`,[comp])]);return money(a[0]?.v)+money(b[0]?.v)}
router.get('/meta-outros',async(q,r)=>{try{const comp=/^\d{4}-\d{2}$/.test(q.query.mes||'')?q.query.mes:new Date().toISOString().slice(0,7),m=(await pool.query(`SELECT valor FROM tbMetas WHERE chave='outros-mensal'`))[0];ok(r,{mes:comp,...situacaoMeta(m?.valor,await gastoOutros(comp))})}catch(e){fail(r,e)}});
router.put('/meta-outros',async(q,r)=>{try{const v=money(q.body?.valor);if(v<0||v>1e9)throw Error('Valor inválido');await pool.query(`INSERT INTO tbMetas(chave,valor) VALUES('outros-mensal',?) ON DUPLICATE KEY UPDATE valor=VALUES(valor)`,[v]);ok(r,{meta:v})}catch(e){fail(r,e,400)}});

module.exports=router;
