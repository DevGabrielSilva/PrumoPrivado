// Meta mensal (teto) para "Outros": gastos que a fatura revelou ou foram lançados na categoria Outros.
function situacaoMeta(meta,gasto){const m=Number(meta||0),g=Number(gasto||0);if(!(m>0))return{meta:0,gasto:g,percentual:0,nivel:'SEM_META',restante:0};const pct=g/m*100;return{meta:m,gasto:g,percentual:Math.round(pct*10)/10,nivel:pct>=100?'ESTOUROU':pct>=80?'PERTO':'OK',restante:Math.round((m-g)*100)/100}}
module.exports={situacaoMeta};
