// Gastos fixos mensais (aluguel, assinaturas etc.), gerados como recorrências.
const express=require('express');
const router=express.Router();
const{pool}=require('../db');
const{ok,fail,money}=require('../helpers');

router.get('/gastos-fixos',async(q,r)=>{try{ok(r,await pool.query(`SELECT * FROM tbFinancas WHERE recorrente=1 AND tipo='DESPESA' AND origem='GASTO_FIXO' ORDER BY descricao`))}catch(e){fail(r,e)}});
router.post('/gastos-fixos',async(q,r)=>{try{const b=q.body,[y,m]=b.inicio.split('-').map(Number),day=Math.min(28,Number(b.dia||10)),start=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`,end=b.fim?`${b.fim}-${String(day).padStart(2,'0')}`:null,x=await pool.query(`INSERT INTO tbFinancas(dataMovimentacao,tipo,descricao,valor,categoria,recorrente,frequencia,dataInicioRecorrencia,dataFimRecorrencia,situacao,formaPagamento,origem) VALUES(?,'DESPESA',?,?,?,1,'MENSAL',?,?,'PREVISTA',?,'GASTO_FIXO')`,[start,b.descricao,money(b.valor),b.categoria||null,start,end,b.formaPagamento||null]);ok(r,{id:Number(x.insertId)},201)}catch(e){fail(r,e,400)}});
router.put('/gastos-fixos/:id',async(q,r)=>{try{const b=q.body,[y,m]=b.inicio.split('-').map(Number),day=Math.min(28,Number(b.dia||10)),start=`${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`,end=b.fim?`${b.fim}-${String(day).padStart(2,'0')}`:null;await pool.query(`UPDATE tbFinancas SET dataMovimentacao=?,descricao=?,valor=?,categoria=?,dataInicioRecorrencia=?,dataFimRecorrencia=?,formaPagamento=? WHERE codFin=? AND origem='GASTO_FIXO'`,[start,b.descricao,money(b.valor),b.categoria||null,start,end,b.formaPagamento||null,q.params.id]);await pool.query(`DELETE FROM tbOcorrenciasRecorrentes WHERE codFinModelo=? AND situacao='PREVISTA'`,[q.params.id]);ok(r,{})}catch(e){fail(r,e,400)}});
router.delete('/gastos-fixos/:id',async(q,r)=>{try{const paid=(await pool.query(`SELECT COUNT(*) n FROM tbOcorrenciasRecorrentes WHERE codFinModelo=? AND situacao='EFETIVADA'`,[q.params.id]))[0];if(Number(paid.n))throw Error('Este gasto fixo possui histórico. Cancele o modelo para preservar pagamentos anteriores.');await pool.query('DELETE FROM tbFinancas WHERE codFin=?',[q.params.id]);ok(r,{})}catch(e){fail(r,e,400)}});

module.exports=router;
