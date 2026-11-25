// Importação de fatura (CSV, texto ou PDF): só SUGERE o total. Quem confirma é o usuário.
const zlib=require('node:zlib');

// "1.234,56" -> 1234.56 ; "1234.56" -> 1234.56 ; "R$ 99,90" -> 99.9 ; "-50,00" -> -50
function numero(v){let s=String(v??'').replace(/[R$\s]/g,'').replace(/\u00a0/g,'');if(!s)return NaN;const neg=/^-|^\(.*\)$/.test(s);s=s.replace(/[()-]/g,'');const lc=s.lastIndexOf(','),lp=s.lastIndexOf('.');if(lc>-1&&lc>lp)s=s.replace(/\./g,'').replace(',','.');else if(lp>-1&&lc===-1&&(s.match(/\./g)||[]).length>1)s=s.replace(/\./g,'');else s=s.replace(/,/g,'');const n=Number(s);return Number.isFinite(n)?(neg?-n:n):NaN}

const ROTULOS=/(total\s+(?:da|desta|dessa)\s+fatura|valor\s+total\s+da\s+fatura|total\s+a\s+pagar|valor\s+da\s+fatura|fatura\s+atual|total\s+da\s+compra|valor\s+total|total\s+fatura)/i;
function porRotulo(texto){const re=new RegExp(ROTULOS.source+'[^0-9\\n]{0,40}?(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*,\\d{2}|\\d+,\\d{2})','ig');const achados=[];let m;while((m=re.exec(texto)))achados.push(numero(m[2]));return achados.filter(x=>x>0)}

function porCsv(texto){
  const linhas=texto.split(/\r?\n/).filter(l=>l.trim());if(linhas.length<2)return null;
  const sep=[';',',','\t'].map(s=>[s,linhas[0].split(s).length]).sort((a,b)=>b[1]-a[1])[0][0];
  const cab=linhas[0].split(sep).map(x=>x.trim().replace(/^"|"$/g,'').toLowerCase());
  let iv=cab.findIndex(x=>/^(valor|amount|value|quantia|valor \(r\$\))/.test(x));if(iv<0)return null;
  const idesc=cab.findIndex(x=>/(descri|title|titulo|título|estabelecimento|lan[cç]amento|hist[oó]rico)/.test(x));
  let soma=0,n=0;
  for(const l of linhas.slice(1)){const c=l.split(sep).map(x=>x.trim().replace(/^"|"$/g,'')),v=numero(c[iv]),d=idesc>=0?c[idesc]||'':'';if(!(v>0))continue;if(/pagamento|payment|estorno|cr[eé]dito em conta/i.test(d))continue;soma+=v;n++}
  return n?{total:Math.round(soma*100)/100,itens:n}:null;
}

// Extrai texto de um PDF simples: infla os fluxos Flate e junta os trechos entre parênteses dos operadores Tj/TJ.
function textoDePdf(buf){
  const bin=buf.toString('latin1'),partes=[];let i=0;
  while((i=bin.indexOf('stream',i))>-1){let ini=i+6;if(bin[ini]==='\r')ini++;if(bin[ini]==='\n')ini++;const fim=bin.indexOf('endstream',ini);if(fim<0)break;const dados=Buffer.from(bin.slice(ini,fim),'latin1');let txt;try{txt=zlib.inflateSync(dados).toString('latin1')}catch{txt=dados.toString('latin1')}
    if(/\bBT\b/.test(txt)){let linha='';for(const m of txt.matchAll(/\[(.*?)\]\s*TJ|\((.*?)(?<!\\)\)\s*Tj|\bET\b|T\*|Td|TD/gs)){if(m[1]!==undefined)linha+=[...m[1].matchAll(/\((.*?)(?<!\\)\)/gs)].map(x=>x[1]).join('');else if(m[2]!==undefined)linha+=m[2]+' ';else{if(linha.trim())partes.push(linha.trim());linha=''}}if(linha.trim())partes.push(linha.trim())}
    i=fim+9}
  return partes.join('\n').replace(/\\([()\\])/g,'$1');
}

// entrada: Buffer; saída: {total, metodo, confianca, itens?, mensagem}
function sugerirTotal(buf,nome=''){
  const ehPdf=buf.slice(0,5).toString()==='%PDF-'||/\.pdf$/i.test(nome);
  const texto=ehPdf?textoDePdf(buf):buf.toString('utf8');
  if(ehPdf&&!texto.trim())return{total:null,metodo:'pdf',confianca:'nenhuma',mensagem:'Não consegui ler o texto desse PDF (pode ser imagem ou protegido). Digite o total manualmente ou use o CSV do banco.'};
  const rot=porRotulo(texto);
  if(rot.length)return{total:rot[0],metodo:'rotulo',confianca:'media',mensagem:`Achei "total da fatura" no arquivo: confira se bate com o app do banco.`};
  if(!ehPdf){const csv=porCsv(texto);if(csv)return{total:csv.total,itens:csv.itens,metodo:'soma-csv',confianca:'media',mensagem:`Somei ${csv.itens} compras do CSV (ignorei pagamentos e estornos). Confira com o total do banco.`}}
  return{total:null,metodo:ehPdf?'pdf':'texto',confianca:'nenhuma',mensagem:'Não encontrei o total da fatura nesse arquivo. Digite manualmente.'};
}

module.exports={numero,porRotulo,porCsv,textoDePdf,sugerirTotal};
