// Exportação CSV pensada para Excel/Planilhas em português: separador ";", decimal com vírgula, BOM UTF-8.
// Células de texto que começam com = + - @ ganham um apóstrofo (evita fórmula injetada em planilha).
function celula(v,tipo){
  if(v===null||v===undefined)return '';
  if(tipo==='num'){const n=Number(v);return Number.isFinite(n)?String(n.toFixed(2)).replace('.',','):''}
  let s=tipo==='data'?String(v).slice(0,10):String(v);
  if(/^[=+\-@\t\r]/.test(s))s="'"+s;
  return /[";\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}
// colunas: [{titulo, campo, tipo?: 'num'|'data'}]
function paraCsv(colunas,linhas){const cab=colunas.map(c=>celula(c.titulo)).join(';'),corpo=linhas.map(l=>colunas.map(c=>celula(l[c.campo],c.tipo)).join(';'));return '\ufeff'+[cab,...corpo].join('\r\n')+'\r\n'}
module.exports={paraCsv,celula};
