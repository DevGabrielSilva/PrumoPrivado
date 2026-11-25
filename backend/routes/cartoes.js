// Cartões de crédito e faturas.
const express=require('express');
const router=express.Router();
const{pool}=require('../db');
const{ok,fail,money}=require('../helpers');

router.get('/cartoes',async(q,r)=>{try{ok(r,await pool.query(`SELECT c.*,(SELECT COUNT(*) FROM tbComprasCartao x WHERE x.codCartao=c.codCartao) compras,(SELECT COUNT(*) FROM tbFaturas f WHERE f.codCartao=c.codCartao) faturas FROM tbCartoes c ORDER BY ativo DESC,nomeCartao`))}catch(e){fail(r,e)}});
router.post('/cartoes',async(q,r)=>{try{const b=q.body,x=await pool.query('INSERT INTO tbCartoes(nomeCartao,diaFechamento,diaVencimento,ativo) VALUES(?,?,?,1)',[b.nomeCartao,b.diaFechamento,b.diaVencimento]);ok(r,{id:Number(x.insertId)},201)}catch(e){fail(r,e,400)}});
router.put('/cartoes/:id',async(q,r)=>{try{const b=q.body;await pool.query('UPDATE tbCartoes SET nomeCartao=?,diaFechamento=?,diaVencimento=?,ativo=? WHERE codCartao=?',[b.nomeCartao,b.diaFechamento,b.diaVencimento,Number(b.ativo??1),q.params.id]);ok(r,{})}catch(e){fail(r,e,400)}});
router.delete('/cartoes/:id',async(q,r)=>{try{const x=(await pool.query(`SELECT (SELECT COUNT(*) FROM tbComprasCartao WHERE codCartao=?) compras,(SELECT COUNT(*) FROM tbFaturas WHERE codCartao=?) faturas`,[q.params.id,q.params.id]))[0];if(x.compras||x.faturas)throw Error('Cartão possui histórico. Inative-o.');await pool.query('DELETE FROM tbCartoes WHERE codCartao=?',[q.params.id]);ok(r,{})}catch(e){fail(r,e,400)}});
router.get('/faturas',async(q,r)=>{try{ok(r,await pool.query(`SELECT f.*,c.nomeCartao,COALESCE(SUM(p.valor),0) comprasConhecidas,GREATEST(f.valorTotal-COALESCE(SUM(p.valor),0),0) outros FROM tbFaturas f JOIN tbCartoes c ON c.codCartao=f.codCartao LEFT JOIN tbFaturaParcelas fp ON fp.codFatura=f.codFatura LEFT JOIN tbParcelasCartao p ON p.codParcela=fp.codParcela GROUP BY f.codFatura ORDER BY COALESCE(f.competencia,DATE_FORMAT(f.dataVencimento,'%Y-%m')) DESC`))}catch(e){fail(r,e)}});
router.post('/faturas',async(q,r)=>{try{const b=q.body;await pool.query(`INSERT INTO tbFaturas(codCartao,dataFechamento,dataVencimento,valorTotal,paga,competencia,valorInformado) VALUES(?,?,?,?,0,?,1) ON DUPLICATE KEY UPDATE dataVencimento=VALUES(dataVencimento),valorTotal=VALUES(valorTotal),valorInformado=1`,[b.codCartao,b.dataVencimento,b.dataVencimento,money(b.valorTotal),b.competencia]);ok(r,{},201)}catch(e){fail(r,e,400)}});

module.exports=router;
