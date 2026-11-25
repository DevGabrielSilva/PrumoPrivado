// Objetivos financeiros (metas com prazo e acompanhamento).
const express=require('express');
const router=express.Router();
const{pool}=require('../db');
const{ok,fail,money}=require('../helpers');

router.get('/objetivos',async(q,r)=>{try{ok(r,await pool.query('SELECT * FROM tbObjetivos ORDER BY ativo DESC,dataObjetivo,codObjetivo DESC'))}catch(e){fail(r,e)}});
router.post('/objetivos',async(q,r)=>{try{const b=q.body,x=await pool.query('INSERT INTO tbObjetivos(descricao,categoria,valorObjetivo,dataCriacao,dataObjetivo,ativo) VALUES(?,?,?,?,?,1)',[b.descricao,b.categoria||null,money(b.valorObjetivo),b.dataCriacao,b.dataObjetivo||null]);ok(r,{id:Number(x.insertId)},201)}catch(e){fail(r,e,400)}});
router.put('/objetivos/:id',async(q,r)=>{try{const b=q.body;await pool.query('UPDATE tbObjetivos SET descricao=?,categoria=?,valorObjetivo=?,dataCriacao=?,dataObjetivo=?,ativo=? WHERE codObjetivo=?',[b.descricao,b.categoria||null,money(b.valorObjetivo),b.dataCriacao,b.dataObjetivo||null,Number(b.ativo??1),q.params.id]);ok(r,{})}catch(e){fail(r,e,400)}});
router.delete('/objetivos/:id',async(q,r)=>{try{await pool.query('DELETE FROM tbObjetivos WHERE codObjetivo=?',[q.params.id]);ok(r,{})}catch(e){fail(r,e,409)}});

module.exports=router;
