// Lembretes de fatura: quando fecha, quando acabou de fechar e ainda sem total informado.
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const ymd=s=>{const[y,m,d]=String(s).slice(0,10).split('-').map(Number);return new Date(y,m-1,d)};
const diaNoMes=(ano,mes,dia)=>new Date(ano,mes,Math.min(dia,new Date(ano,mes+1,0).getDate()));

// Fechamento mais recente (<= hoje) e próximo (> hoje) de um cartão.
function fechamentos(card,hoje){const h=ymd(hoje);let ult=diaNoMes(h.getFullYear(),h.getMonth(),Number(card.diaFechamento));if(ult>h)ult=diaNoMes(h.getFullYear(),h.getMonth()-1,Number(card.diaFechamento));const prox=diaNoMes(ult.getFullYear(),ult.getMonth()+1,Number(card.diaFechamento));return{ultimo:ult,proximo:prox}}
// Vencimento da fatura que fechou em `fechou`: primeiro dia de vencimento depois do fechamento.
function vencimentoDe(card,fechou){let v=diaNoMes(fechou.getFullYear(),fechou.getMonth(),Number(card.diaVencimento));if(v<=fechou)v=diaNoMes(fechou.getFullYear(),fechou.getMonth()+1,Number(card.diaVencimento));return v}
const dias=(a,b)=>Math.round((a-b)/86400000);

// jaInformada(card, competencia) -> boolean
function lembretesFatura(cards,hoje,jaInformada,{janelaFechada=7,avisoAntes=2}={}){
  const h=ymd(hoje),out=[];
  for(const c of cards){
    if(!c.ativo)continue;
    const{ultimo,proximo}=fechamentos(c,hoje),venc=vencimentoDe(c,ultimo),comp=iso(venc).slice(0,7),desde=dias(h,ultimo);
    if(desde<=janelaFechada&&!jaInformada(c,comp))out.push({tipo:'FATURA_FECHOU',codCartao:c.codCartao,nomeCartao:c.nomeCartao,competencia:comp,vencimento:iso(venc),fechouEm:iso(ultimo),diasDesdeFechamento:desde});
    const falta=dias(proximo,h);
    if(falta>=1&&falta<=avisoAntes)out.push({tipo:'FATURA_FECHA_EM_BREVE',codCartao:c.codCartao,nomeCartao:c.nomeCartao,fechaEm:iso(proximo),dias:falta});
  }
  return out;
}

module.exports={fechamentos,vencimentoDe,lembretesFatura};
