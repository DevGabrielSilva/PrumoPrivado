// Transferências entre saldo disponível e poupança.
const express=require('express');
const router=express.Router();
const{pool}=require('../db');
const{ok,fail,money,validDate}=require('../helpers');
const{saldo,poupanca}=require('../services/core');

router.get('/transferencias',async(q,r)=>{try{ok(r,await pool.query('SELECT * FROM tbTransferencias ORDER BY dataTransferencia DESC,codTransferencia DESC'))}catch(e){fail(r,e)}});
router.post('/transferencias',async(q,r)=>{try{const b=q.body,v=money(b.valor);if(!validDate(b.dataTransferencia)||b.origem===b.destino||v<=0)throw Error('Transferência inválida');const s=await saldo(),p=await poupanca();if(b.origem==='SALDO'&&v>s)throw Error('Saldo insuficiente');if(b.origem==='POUPANCA'&&v>p.total)throw Error('Poupança insuficiente');const x=await pool.query('INSERT INTO tbTransferencias(dataTransferencia,origem,destino,valor,descricao) VALUES(?,?,?,?,?)',[b.dataTransferencia,b.origem,b.destino,v,b.descricao||null]);ok(r,{id:Number(x.insertId)},201)}catch(e){fail(r,e,400)}});
router.put('/transferencias/:id',async(q,r)=>{try{const b=q.body;await pool.query('UPDATE tbTransferencias SET dataTransferencia=?,origem=?,destino=?,valor=?,descricao=? WHERE codTransferencia=?',[b.dataTransferencia,b.origem,b.destino,money(b.valor),b.descricao||null,q.params.id]);ok(r,{})}catch(e){fail(r,e,400)}});
router.delete('/transferencias/:id',async(q,r)=>{try{await pool.query('DELETE FROM tbTransferencias WHERE codTransferencia=?',[q.params.id]);ok(r,{})}catch(e){fail(r,e,409)}});

module.exports=router;
