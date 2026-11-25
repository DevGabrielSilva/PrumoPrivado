// O Pru (porquinho): frases curtas e claras. Funções puras, sem acesso à tela nem ao banco,
// para serem testadas no npm test. A tela só chama estas funções e mostra o texto.
(function(root){
const reais=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const MES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const mesNome=c=>{const[y,m]=String(c).slice(0,7).split('-');return m?`${MES[Number(m)-1]}/${y}`:String(c)};
const plural=(n,a,b)=>n===1?a:b;

// Objetivo ativo mais perto de ser alcançado (menor valor que ainda falta).
function objetivoAlvo(objetivos,poupado){let best=null;for(const o of objetivos||[]){if(o.ativo===0||o.ativo===false)continue;const falta=Number(o.valorObjetivo)-Number(poupado||0);if(falta>0&&(!best||falta<best.falta))best={descricao:o.descricao,falta,valor:Number(o.valorObjetivo)}}return best}

// ctx: {saldo, limiteSeguranca, poupado, objetivos:[{descricao,valorObjetivo,ativo}], proximoRisco:{mes,saldo}|null}
function comentarioLancamento(l,ctx={}){
  const v=Number(l.valor||0),saldoDepois=Number(ctx.saldo||0),margem=Number(ctx.limiteSeguranca||0);
  if(l.tipo==='RECEITA')return `Entrou ${reais(v)}. Que tal separar uma parte pra poupança antes de gastar?`;
  const parcelas=Number(l.quantidadeParcelas||1);
  if(l.formaPagamento==='CREDITO'&&parcelas>1)return `Compra em ${parcelas}x: ${reais(v/parcelas)} por mês na fatura durante ${parcelas} meses.`;
  if(saldoDepois<0)return `Atenção: seu saldo ficou negativo em ${reais(saldoDepois)}.`;
  if(margem&&saldoDepois<margem)return `Anotado. Você está ${reais(margem-saldoDepois)} abaixo da sua margem de segurança.`;
  const alvo=objetivoAlvo(ctx.objetivos,ctx.poupado);
  if(alvo&&v>0)return `Anotado. Se você poupasse esses ${reais(v)}, faltariam ${reais(Math.max(0,alvo.falta-v))} pro objetivo "${alvo.descricao}".`;
  return `Anotado. ${reais(v)} a menos no mês.`;
}

function comentarioTransferencia(t,ctx={}){
  const v=Number(t.valor||0);
  if(t.destino==='POUPANCA'){const poupado=Number(ctx.poupado||0),alvo=objetivoAlvo(ctx.objetivos,poupado);
    if(alvo){const falta=Math.max(0,alvo.falta-v);return falta===0?`Isso completa o objetivo "${alvo.descricao}". Parabéns!`:`Boa! Guardar ${reais(v)} aproxima você do objetivo "${alvo.descricao}": faltam ${reais(falta)}.`}
    return `Boa! ${reais(v)} guardados. Que tal criar um objetivo pra essa poupança?`}
  if(t.origem==='POUPANCA')return `Você tirou ${reais(v)} da poupança. Se possível, devolva quando puder.`;
  return `Transferência de ${reais(v)} anotada.`;
}

function comentarioFatura(r){
  if(!r)return '';
  if(r.excedente>0)return `Você anotou ${reais(r.excedente)} a mais que a fatura. Confira se alguma compra está repetida.`;
  if(r.outros>0)return `Fatura de ${reais(r.valorTotal)}: ${reais(r.outros)} não estavam anotados e viraram "Outros". Dá pra reduzir isso no próximo mês?`;
  return `Fatura de ${reais(r.valorTotal)} bateu com tudo que você anotou. Parabéns!`;
}

// r: resposta de /simulador; best: resposta de /simulador/melhor-mes. Retorna {texto, nivel}.
function comentarioSimulacao(r,best){
  const verm=r.mesesNoVermelho||[],perto=r.mesesPertoDaMargem||[];let texto,nivel;
  if(verm.length){nivel='VERMELHO';texto=`Essa compra deixa você no vermelho por ${verm.length} ${plural(verm.length,'mês','meses')} (${mesNome(verm[0])}${verm.length>1?` a ${mesNome(verm[verm.length-1])}`:''}). Pior mês: ${reais(r.minimum&&r.minimum.saldo)}.`}
  else if(r.jaNegativoSemACompra){nivel='VERMELHO';texto='Seu saldo já fica negativo nos próximos meses mesmo sem essa compra. Resolva isso antes de comprar.'}
  else if(perto.length){nivel='AMARELO';texto=`Cabe, mas deixa você abaixo da margem de segurança por ${perto.length} ${plural(perto.length,'mês','meses')}.`}
  else{nivel='VERDE';texto='Essa compra cabe no seu orçamento sem apertar nenhum mês.'}
  if(nivel!=='VERDE'){if(best&&best.best)texto+=` Melhor mês pra comprar: ${mesNome(best.best.mes)}.`;else if(best&&best.firstPossible)texto+=` Primeiro mês sem ficar no vermelho: ${mesNome(best.firstPossible.mes)}.`;else texto+=' Não achei mês seguro nos próximos 24 meses.'}
  return{texto,nivel};
}

// Frase do dia na home.
function comentarioDiario(ctx={},lembretes={}){
  const f=(lembretes.faturas||[]).find(x=>x.tipo==='FATURA_FECHOU');
  if(f)return `A fatura do ${f.nomeCartao} fechou. Informe o total pra eu calcular o "Outros".`;
  if(Number(ctx.saldo)<0)return `Seu saldo está negativo em ${reais(ctx.saldo)}. Vamos olhar o que dá pra ajustar?`;
  if(ctx.proximoRisco)return `Fique de olho: ${mesNome(ctx.proximoRisco.mes)} é o próximo mês apertado.`;
  const alvo=objetivoAlvo(ctx.objetivos,ctx.poupado);
  if(alvo)return `Faltam ${reais(alvo.falta)} pro objetivo "${alvo.descricao}".`;
  return 'Tudo certo por aqui. Anote seus gastos do dia pra eu cuidar do resto.';
}

const api={reais,mesNome,objetivoAlvo,comentarioLancamento,comentarioTransferencia,comentarioFatura,comentarioSimulacao,comentarioDiario};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Pru=api;
})(typeof window!=='undefined'?window:globalThis);
