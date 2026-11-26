// PRUMO 2.4: telas mais simples e fáceis de ler. Carregado por último; estende o que os outros módulos fazem.
// Seletor de mês com setas, mês da fatura em lista, bloco de crédito igual em todas as telas,
// Movimentações com totais e "Outros" da fatura, Câmbio dentro de Transferências, menu no celular.

const cap1=s=>s.charAt(0).toUpperCase()+s.slice(1);
const mesAtual=()=>today().slice(0,7);
const mesMais=(ym,n)=>{const[y,m]=ym.split('-').map(Number),d=new Date(y,m-1+n,1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`};

// ---------- Seletor de mês: "<  Novembro de 2026  >" ----------
function mesNav(inp){
  if(!inp||inp.dataset.mesnav)return;inp.dataset.mesnav=1;
  const desc=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
  inp.type='hidden';
  const w=document.createElement('div');w.className='mes-nav';
  w.innerHTML='<button type="button" class="mes-prev" aria-label="Mês anterior">‹</button><span class="mes-label"></span><button type="button" class="mes-next" aria-label="Próximo mês">›</button>';
  inp.after(w);
  const lab=w.querySelector('.mes-label'),draw=()=>{lab.textContent=fullMonth(desc.get.call(inp)||mesAtual())};
  Object.defineProperty(inp,'value',{get(){return desc.get.call(inp)},set(v){desc.set.call(inp,v);draw()},configurable:true});
  const ir=n=>{inp.value=mesMais(inp.value||mesAtual(),n);inp.dispatchEvent(new Event('change',{bubbles:true}))};
  w.querySelector('.mes-prev').onclick=()=>ir(-1);w.querySelector('.mes-next').onclick=()=>ir(1);
  if(inp.form)inp.form.addEventListener('reset',()=>setTimeout(draw,0));
  if(!inp.value)inp.value=mesAtual();else draw();
}
// Lista de meses (substitui o campo "month"): sempre preenchida e fácil de tocar.
function mesLista(inp,{vazio='',antes=1,depois=24,padrao=null}={}){
  if(!inp||inp.tagName==='SELECT')return inp;
  const sel=document.createElement('select');sel.name=inp.name;sel.id=inp.id;sel.required=inp.required;sel.className='mes-select';
  const add=v=>{const o=document.createElement('option');o.value=v;o.textContent=v?fullMonth(v):vazio;sel.appendChild(o)};
  if(vazio)add('');
  for(let i=-antes;i<=depois;i++)add(mesMais(mesAtual(),i));
  const desc=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
  Object.defineProperty(sel,'value',{get(){return desc.get.call(sel)},set(v){v=String(v??'').slice(0,7);if(v&&![...sel.options].some(o=>o.value===v))add(v);desc.set.call(sel,v)},configurable:true});
  inp.replaceWith(sel);if(padrao!==null)sel.value=padrao;return sel;
}

// ---------- Cartões (lista usada para sugerir o mês da fatura) ----------
let cartoesCache=[];
const cards0=cards;cards=async function(){await cards0();try{cartoesCache=await api0('cartoes')}catch{}};
function mesProvavel(dataCompra,diaFechamento){let[y,m,d]=String(dataCompra).slice(0,10).split('-').map(Number);if(d>Number(diaFechamento||31)){m++;if(m>12){m=1;y++}}return`${y}-${String(m).padStart(2,'0')}`}

// ---------- Bloco de crédito igual em todas as telas: cartão, parcelado?, mês da primeira fatura ----------
function popularParcelas(sel){if(!sel||sel.options.length)return;for(let n=1;n<=24;n++){const o=document.createElement('option');o.value=n;o.textContent=n===1?'Não, à vista':`Sim, em ${n}x`;sel.appendChild(o)}}
$$('.parcelas-select').forEach(popularParcelas);

// ---------- Nova movimentação: mês da primeira fatura sugerido ----------
const movForm=$('#movForm');
const pf=mesLista($('#movForm [name=primeiraFatura]'),{padrao:mesAtual()});
function sugerirFatura(){
  const f=movForm;if(f.formaPagamento.value!=='CREDITO'||f.primeiraFatura.dataset.manual)return;
  const c=cartoesCache.find(x=>String(x.codCartao)===String(f.codCartao.value));
  f.primeiraFatura.value=c?mesProvavel(f.dataMovimentacao.value||today(),c.diaFechamento):mesAtual();
}
pf.addEventListener('change',e=>{if(e.isTrusted)pf.dataset.manual='1'});
movForm.addEventListener('change',e=>{if(['codCartao','dataMovimentacao','formaPagamento'].includes(e.target.name))sugerirFatura()});
movForm.addEventListener('reset',()=>{delete pf.dataset.manual;setTimeout(sugerirFatura,0)});
new MutationObserver(()=>{if(!$('#movFormPanel').classList.contains('hidden')){delete pf.dataset.manual;sugerirFatura()}}).observe($('#movFormPanel'),{attributes:true,attributeFilter:['class']});
// Mês de gasto fixo: lista em vez do campo minúsculo.
mesLista($('#fixedCostForm [name=inicio]'),{padrao:mesAtual(),antes:12});
mesLista($('#fixedCostForm [name=fim]'),{vazio:'Sem término',antes:0,depois:60});

// ---------- Atalhos Hoje / Ontem nos campos de data ----------
function atalhosData(inp){
  if(!inp||inp.dataset.atalhos)return;inp.dataset.atalhos=1;
  const s=document.createElement('span');s.className='data-atalhos';
  s.innerHTML='<button type="button" data-d="0">Hoje</button><button type="button" data-d="-1">Ontem</button>';
  s.onclick=e=>{const b=e.target.closest('button');if(!b)return;const d=new Date();d.setDate(d.getDate()+Number(b.dataset.d));inp.value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10);inp.dispatchEvent(new Event('change',{bubbles:true}))};
  inp.closest('label').appendChild(s);
}
atalhosData($('#movForm [name=dataMovimentacao]'));atalhosData($('#transForm [name=dataTransferencia]'));atalhosData($('#cambioForm [name=dataMovimentacao]'));

// ---------- Movimentações: simples, com totais e a linha "Outros" da fatura ----------
mesNav($('#movMonth'));
let movTipo='';
$('#movimentacoes thead tr').innerHTML='<th>Data</th><th>Descrição</th><th>Valor</th><th>Situação</th><th>Ações</th>';
const PAG={PIX:'Pix',DEBITO:'Débito',CREDITO:'Crédito',DINHEIRO:'Dinheiro',BOLETO:'Boleto',TRANSFERENCIA:'Transferência'},SIT={EFETIVADA:'Efetivada',PREVISTA:'Prevista',CANCELADA:'Cancelada'};
function pagLabel(x){return PAG[x.formaPagamento]||(x.origem==='MOEDA_ESTRANGEIRA'?'Câmbio':x.origem==='CUSTO_BEM'?'Bem pessoal':'')}
function movLinha(x){
  const trav=x.classeRegistro==='OUTROS_FATURA',sub=[x.categoria,pagLabel(x),x.classeRegistro==='OCORRENCIA'?'Recorrência':''].filter(Boolean).join(' · ');
  const acoes=trav?'<div class="record-actions"><button class="ghost" data-page="cartoes">Ver fatura</button></div>':movActions(x);
  const desc=`${esc(x.descricao)}${trav?' <span class="lock" title="Vem da fatura. Para mudar, ajuste o total da fatura em Cartões e faturas.">🔒</span>':''}<small>${esc(sub)}${trav?(sub?' · ':'')+'Calculado pela fatura':''}</small>`;
  const est=x.estimativaCartao;return{desc:est?desc.replace('</small>',`${sub?' · ':''}${x.faturaOficial?'já está no total da fatura':Number(x.valorAbatido)>0?'abatido '+brl(x.valorAbatido)+' por compras lançadas · falta '+brl(x.valorRestante):'estimativa dentro da fatura'}</small>`):desc,acoes,trav,sit:est?'<span class="sit sit-prevista">Estimativa no cartão</span>':`<span class="sit sit-${String(x.situacao).toLowerCase()}">${SIT[x.situacao]||x.situacao}</span>`};
}
// Recorrência: "Efetivar" quando prevista, "Desfazer" quando já efetivada, "Reativar" quando cancelada.
const movActions0=movActions;
movActions=function(x){let h=movActions0(x);if(x.classeRegistro==='OCORRENCIA'){const next=x.situacao==='EFETIVADA'||x.situacao==='CANCELADA'?'PREVISTA':'EFETIVADA',txt=x.situacao==='EFETIVADA'?'Desfazer':x.situacao==='CANCELADA'?'Reativar':'Efetivar';h=h.replace(/<button class="ghost" data-status-occ="[^"]*" data-next="[^"]*">[^<]*<\/button>/,`<button class="ghost" data-status-occ="${x.codOcorrencia}" data-next="${next}">${txt}</button>`)}if(x.estimativaCartao)h=h.replace(/<button class="ghost" data-status-occ="[^"]*" data-next="[^"]*">[^<]*<\/button>/,'');return h};
movements=async function(){
  const q=new URLSearchParams({mes:$('#movMonth').value,busca:$('#movSearch').value,situacao:$('#movStatus').value,tipo:movTipo,pagamento:$('#movPayment').value}),rows=await api('movimentacoes?'+q);
  const ativos=rows.filter(x=>x.situacao!=='CANCELADA'),ent=ativos.filter(x=>x.tipo==='RECEITA').reduce((a,x)=>a+Number(x.valor),0),sai=ativos.filter(x=>x.tipo==='DESPESA').reduce((a,x)=>a+Number(x.estimativaCartao?x.valorRestante:x.valor),0),res=ent-sai,falta=ativos.filter(x=>x.tipo==='DESPESA'&&x.situacao==='PREVISTA'&&!x.estimativaCartao).reduce((a,x)=>a+Number(x.valor),0);
  $('#movTotais').innerHTML=`<article class="saldo-card"><small>Entradas</small><b class="positive">${brl(ent)}</b></article><article class="saldo-card"><small>Saídas</small><b>${brl(sai)}</b><small>${falta>0?'falta '+brl(falta)+' a pagar':''}</small></article><article class="saldo-card"><small>Resultado do mês</small><b class="${res<0?'negative':''}">${brl(res)}</b></article>`;
  $('#movRows').innerHTML=rows.map(x=>{const l=movLinha(x);return`<tr class="row-${x.tipo.toLowerCase()}${l.trav?' row-locked':''}"><td>${date(x.dataMovimentacao)}</td><td>${l.desc}</td><td class="${x.tipo==='RECEITA'?'positive':'negative-soft'}">${x.tipo==='RECEITA'?'+':'-'}${brl(x.estimativaCartao?x.valorRestante:x.valor)}${x.estimativaCartao?`<small>de ${brl(x.valor)} estimados</small>`:''}</td><td>${l.sit}</td><td>${l.acoes}</td></tr>`}).join('')||'<tr><td colspan="5" class="vazio">Nada lançado neste mês.</td></tr>';
  $('#movCards').innerHTML=rows.map(x=>{const l=movLinha(x);return`<article class="mobile-record row-${x.tipo.toLowerCase()}${l.trav?' row-locked':''}"><div class="mr-top"><span>${date(x.dataMovimentacao)}</span>${l.sit}</div><h3>${l.desc}</h3><b>${x.tipo==='RECEITA'?'+':'-'}${brl(x.estimativaCartao?x.valorRestante:x.valor)}</b>${x.estimativaCartao?`<small>de ${brl(x.valor)} estimados</small>`:''}${l.acoes}</article>`}).join('')||'<p class="vazio">Nada lançado neste mês.</p>';
};
// filtros automáticos
$('#movMonth').addEventListener('change',()=>movements());
let movT;$('#movSearch').oninput=()=>{clearTimeout(movT);movT=setTimeout(movements,250)};
$('#movStatus').onchange=$('#movPayment').onchange=()=>movements();
$('#movTipoTabs').onclick=e=>{const b=e.target.closest('button');if(!b)return;movTipo=b.dataset.tipo;$$('#movTipoTabs button').forEach(x=>x.classList.toggle('on',x===b));movements()};
$('#clearMovFilters').onclick=()=>{$('#movSearch').value='';$('#movStatus').value='';$('#movPayment').value='';movTipo='';$$('#movTipoTabs button').forEach((x,i)=>x.classList.toggle('on',i===0));movements()};

// ---------- Resumo do mês ----------
mesNav($('#resumoMes'));$('#resumoAtualizar').classList.add('hidden');

// ---------- Cartões e faturas ----------
mesNav($('#billForm [name=competencia]'));
function vencimentoAuto(){const f=$('#billForm'),c=cartoesCache.find(x=>String(x.codCartao)===String(f.codCartao.value));if(c&&f.competencia.value)f.dataVencimento.value=`${f.competencia.value}-${String(Math.min(28,Number(c.diaVencimento))).padStart(2,'0')}`}
$('#billForm').addEventListener('change',e=>{if(['codCartao','competencia'].includes(e.target.name))vencimentoAuto()});
const abrirCartao=()=>{resetForm($('#cardForm'));$('#cardForm').classList.remove('hidden');$('#cardForm [name=nomeCartao]').focus()};
$('#newCardBtn').onclick=abrirCartao;
$('#cancelCardBtn').onclick=()=>{resetForm($('#cardForm'));$('#cardForm').classList.add('hidden')};
$('#cardForm').addEventListener('submit',()=>setTimeout(()=>$('#cardForm').classList.add('hidden'),700));
document.addEventListener('click',e=>{if(e.target.closest('[data-edit-card]')){$('#cardForm').classList.remove('hidden');$('#cardForm').scrollIntoView({behavior:'smooth',block:'center'})}});
const cards1=cards;cards=async function(){await cards1();vencimentoAuto()};
faturas=async function(){
  const rows=await api0('faturas'),ex=rows.filter(x=>Number(x.excedente)>0),atual=mesAtual();
  $('#faturaAlertas').innerHTML=ex.map(x=>`<div class="alert-line" role="alert"><span>${esc(x.nomeCartao)} · ${fullMonth(x.competencia||x.dataVencimento)}: você anotou ${brl(x.excedente)} a mais que a fatura. Revise as compras do mês ou corrija o total da fatura.</span><button class="ghost" data-page="movimentacoes">Revisar compras</button></div>`).join('');
  $('#faturaList').innerHTML=rows.length?`<div class="fat-head"><span>Fatura</span><span>Total</span><span>Anotado</span><span>Outros</span></div>`+rows.map(x=>{const inf=Number(x.valorInformado),tot=Number(x.valorTotal)||0,an=Number(x.comprasConhecidas),pct=tot?Math.min(100,an/tot*100):100;return`<article class="fat-row ${(x.competencia||'')===atual?'atual':''}"><span class="fat-nome"><b>${esc(x.nomeCartao)}</b><small>${fullMonth(x.competencia||x.dataVencimento)}</small></span><span>${inf?brl(tot):`<button class="ghost" data-fatura-card="${x.codCartao}" data-comp="${x.competencia||String(x.dataVencimento).slice(0,7)}" data-venc="${String(x.dataVencimento).slice(0,10)}">Informar total</button>`}</span><span>${brl(an)}</span><span>${inf?brl(x.outros):'<small>-</small>'}</span>${inf?`<i class="fat-bar" title="Anotado x Outros"><u style="width:${pct}%"></u></i>`:''}</article>`}).join(''):'<p class="vazio">Nenhuma fatura ainda. Informe o total da fatura do cartão acima.</p>';
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-fatura-card]');if(b)setTimeout(vencimentoAuto,50)});

// ---------- Transferências: saldos à vista, prévia e Câmbio como aba ----------
const transfers0=transfers;
let saldosTrans={saldo:0,poupanca:0};
async function transSaldos(){try{const d=await api0('dashboard');saldosTrans={saldo:Number(d.saldo),poupanca:Number(d.poupanca.total)};$('#transSaldos').innerHTML=`<article class="saldo-card"><small>Disponível na conta</small><b class="${d.saldo<0?'negative':''}">${brl(d.saldo)}</b></article><article class="saldo-card"><small>Guardado (poupança)</small><b>${brl(d.poupanca.total)}</b></article>`;transPrevia()}catch{}}
transfers=async function(){await transfers0();await transSaldos()};
function transPrevia(){const f=$('#transForm'),v=val(f.valor.value),o=f.origem.value,d=f.destino.value,box=$('#transPreview');
  if(o===d){box.textContent='Escolha origem e destino diferentes.';return}
  if(!v){box.textContent='Digite o valor para ver como ficam a conta e a poupança.';return}
  const s=saldosTrans.saldo+(d==='SALDO'?v:-v),p=saldosTrans.poupanca+(d==='POUPANCA'?v:-v),falta=(o==='SALDO'?s<0&&saldosTrans.saldo>=0:p<0);
  box.innerHTML=`Depois da transferência: conta ${brl(s)}, poupança ${brl(p)}.${(o==='SALDO'&&s<0)||(o==='POUPANCA'&&p<0)?' <b class="negative">Valor maior que o disponível na origem.</b>':''}`}
$('#transForm').addEventListener('input',transPrevia);
$('#transForm [name=origem]').addEventListener('change',e=>{$('#transForm [name=destino]').value=e.target.value==='SALDO'?'POUPANCA':'SALDO';transPrevia()});
$('#transForm [name=destino]').addEventListener('change',e=>{$('#transForm [name=origem]').value=e.target.value==='SALDO'?'POUPANCA':'SALDO';transPrevia()});
document.addEventListener('click',e=>{const b=e.target.closest('[data-goto]');if(b)page(b.dataset.goto)});

// ---------- Custo de bem: forma de pagamento e crédito (cartão, parcelas) ----------
document.addEventListener('click',e=>{if(!e.target.closest('[data-cost-asset]'))return;setTimeout(async()=>{const form=$('.cost-form');if(!form||form.dataset.pag)return;form.dataset.pag=1;
  if(!cartoesCache.length)try{cartoesCache=await api0('cartoes')}catch{}
  const cartoes=cartoesCache.filter(c=>c.ativo).map(c=>`<option value="${c.codCartao}">${esc(c.nomeCartao)}</option>`).join('');
  const sit=form.querySelector('[name=situacao]').closest('label');
  sit.insertAdjacentHTML('afterend',`<label>Forma de pagamento<select name="formaPagamento"><option value="PIX">Pix</option><option value="DEBITO">Débito</option><option value="CREDITO">Crédito</option><option value="DINHEIRO">Dinheiro</option><option value="BOLETO">Boleto</option></select></label><div class="subfields credito-bem hidden"><label>Cartão<select name="codCartao">${cartoes||'<option value="">Cadastre um cartão primeiro</option>'}</select></label><label>Parcelado?<select name="quantidadeParcelas" class="parcelas-select"></select></label><label>Mês da primeira fatura<select name="primeiraFatura" class="mes-select"></select></label></div>`);
  popularParcelas(form.querySelector('.parcelas-select'));
  const mf=form.querySelector('[name=primeiraFatura]');for(let i=-1;i<=24;i++){const o=document.createElement('option');o.value=mesMais(mesAtual(),i);o.textContent=fullMonth(o.value);mf.appendChild(o)}
  const box=form.querySelector('.credito-bem'),pag=form.querySelector('[name=formaPagamento]'),cartao=form.querySelector('[name=codCartao]'),data=form.querySelector('[name=dataCusto]'),sitSel=form.querySelector('[name=situacao]');
  const atualiza=()=>{const cr=pag.value==='CREDITO';box.classList.toggle('hidden',!cr);sit.classList.toggle('hidden',cr);if(cr){const c=cartoesCache.find(x=>String(x.codCartao)===cartao.value);mf.value=c?mesProvavel(data.value||today(),c.diaFechamento):mesAtual()}};
  pag.onchange=cartao.onchange=data.onchange=atualiza;atualiza();
},0)});

// ---------- Câmbio sai do menu (fica em Transferências) ----------
const NAV=['dashboard','resumo','movimentacoes','transferencias','cartoes','bens','objetivos','configuracoes'];
function desenharMenu(){$('#nav').innerHTML=NAV.map(id=>`<button class="navbtn" data-page="${id}"><span>${sections[id][0]}</span><i class="nav-badge hidden"></i></button>`).join('')+'<button class="navbtn nav-mais" type="button" id="navMais"><span>Mais</span></button>'}
desenharMenu();
const page24=page;
page=function(id){page24(id);const ativo=id==='cambio'?'transferencias':id;$$('.navbtn[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===ativo));$('#lembretes').classList.toggle('hidden',id!=='dashboard');$('#nav').classList.remove('aberto');
  if(id==='cartoes')$('#contextAction').onclick=abrirCartao;
  if(id==='cambio'){$('#contextAction').style.display='block';$('#contextAction').textContent='+ Nova operação'}
  window.scrollTo({top:0})};
$('#navMais').onclick=()=>$('#nav').classList.toggle('aberto');
function selo(p,n){const b=$(`.navbtn[data-page=${p}] .nav-badge`);if(!b)return;b.textContent=n;b.classList.toggle('hidden',!n)}
const renderLembretes0=renderLembretes;renderLembretes=function(l){renderLembretes0(l);selo('cartoes',(l.faturas||[]).filter(x=>!localStorage.getItem(lembKey(x))).length);selo('movimentacoes',l.recorrentesAConfirmar||0)};
// o aviso dispensado também some do selo do menu
document.addEventListener('click',e=>{if(e.target.closest('[data-dismiss]'))setTimeout(()=>api0('lembretes').then(l=>{selo('cartoes',(l.faturas||[]).filter(x=>!localStorage.getItem(lembKey(x))).length)}).catch(()=>{}),50)});

// ---------- Visão geral: previsão menor no celular ----------
document.addEventListener('click',e=>{const t=e.target.closest('#forecastMais');if(t){$('#forecast').classList.toggle('todos');t.textContent=$('#forecast').classList.contains('todos')?'Ver menos':'Ver todos os meses'}});
$('#forecast').insertAdjacentHTML('afterend','<button id="forecastMais" class="ghost forecast-mais" type="button">Ver todos os meses</button>');

// ---------- Configurações em abas ----------
(function(){
  const sec=$('#configuracoes'),geral=['.preferences','.settings-summary','#initialConfigPanel','#reconcilePanel','#limitsPanel','#metaPanel'],dados=['#dadosPanel','#acessoPanel','.danger-zone'];
  const ultimo=[...sec.children].filter(x=>x.classList.contains('panel')).pop();
  if(ultimo&&/Backup e segurança/.test(ultimo.textContent)){ultimo.innerHTML='<details><summary>Para quem usa o terminal: backup completo do banco</summary><p>O PRUMO não armazena senhas bancárias, números completos de cartão ou credenciais externas.</p><code>mariadb-dump -u root -p dbGabiru &gt; backup_prumo_privado.sql</code></details>';ultimo.dataset.aba='dados'}
  geral.forEach(s=>sec.querySelectorAll(s).forEach(x=>x.dataset.aba='geral'));dados.forEach(s=>sec.querySelectorAll(s).forEach(x=>x.dataset.aba='dados'));
  sec.insertAdjacentHTML('afterbegin','<div class="seg-tabs" id="cfgTabs"><button type="button" class="on" data-aba="geral">Geral</button><button type="button" data-aba="dados">Dados e segurança</button></div>');
  const mostrar=a=>{$$('#cfgTabs button').forEach(b=>b.classList.toggle('on',b.dataset.aba===a));sec.querySelectorAll('[data-aba]:not(button)').forEach(x=>x.classList.toggle('aba-oculta',x.dataset.aba!==a))};
  $('#cfgTabs').onclick=e=>{const b=e.target.closest('button');if(b)mostrar(b.dataset.aba)};mostrar('geral');
})();

// ---------- Menu e telas começam no estado certo ----------
page(document.querySelector('.page.active').id);
cards().then(()=>{sugerirFatura();vencimentoAuto()});
load(document.querySelector('.page.active').id);

// ---------- Gasto fixo no crédito: cartão + categoria em lista ----------
(function(){
  const f=$('#fixedCostForm');if(!f)return;
  const pag=f.querySelector('[name=formaPagamento]');
  pag.closest('label').insertAdjacentHTML('afterend','<label id="fixCartaoBox" class="hidden">Cartão da fatura<select name="codCartao"></select></label>');
  const catIn=f.querySelector('[name=categoria]'),sel=document.createElement('select');sel.name='categoria';catIn.replaceWith(sel);
  const BASE=['Transporte','Alimentação','Moradia','Saúde','Lazer','Pessoal','Educação','Assinaturas','Compras','Outros'];
  let cats=[];
  function pintaCats(atual){const l=[...new Set([...BASE,...cats,...(atual?[atual]:[])])];sel.innerHTML='<option value="">Sem categoria</option>'+l.map(c=>`<option>${esc(c)}</option>`).join('')+'<option value="__nova">+ Nova categoria...</option>';if(atual)sel.value=atual}
  async function carrega(atual){try{const u=await api0('categorias');cats=u.filter(Boolean)}catch{}pintaCats(atual)}
  sel.onchange=()=>{if(sel.value!=='__nova')return;const n=(prompt('Nome da nova categoria:')||'').trim();if(n){cats.push(n);pintaCats(n)}else sel.value=''};
  function pintaCartoes(atual){const cs=(cartoesCache||[]).filter(c=>c.ativo),c=f.querySelector('[name=codCartao]');c.innerHTML=cs.map(k=>`<option value="${k.codCartao}">${esc(k.nomeCartao)}</option>`).join('')||'<option value="">Cadastre um cartão primeiro</option>';if(atual)c.value=atual}
  function mostra(){$('#fixCartaoBox').classList.toggle('hidden',pag.value!=='CREDITO')}
  pag.addEventListener('change',()=>{mostra();if(pag.value==='CREDITO')pintaCartoes()});
  $('#fixedCostsAction').addEventListener('click',async()=>{if(!cartoesCache.length){try{cartoesCache=await api0('cartoes')}catch{}}await carrega();pintaCartoes();mostra()});
  document.addEventListener('click',async e=>{const ed=e.target.closest('[data-edit-fixed]');if(!ed)return;const x=JSON.parse(ed.dataset.editFixed);await carrega(x.categoria||'');pintaCartoes(x.codCartao);mostra()});
  f.addEventListener('reset',()=>setTimeout(()=>{pintaCats('');mostra()}));
})();

// ---------- Fatura fechada: aviso fica até marcar como paga ----------
function textoFatura(x){
  const venc=date(x.vencimento),base=x.oficial?`Fatura ${esc(x.nomeCartao)} fechou: ${brl(x.valor)} (vence ${venc}).`:`Fatura ${esc(x.nomeCartao)} fechou, estimada em ${brl(x.valor)} (ainda sem o total do banco, vence ${venc}).`;
  const soma=x.somaAnteriores?` Somando as faturas que vencem antes, são ${brl(x.acumulado)}.`:'';
  return base+soma+(x.temSaldo?' Você já tem o valor na conta para pagar.':` Faltam ${brl(x.faltam)} na conta para pagar.`);
}
const renderLembretes1=renderLembretes;
renderLembretes=function(l){
  const f=l.fechadas||[],chaves=new Set(f.map(x=>`${x.codCartao}|${x.competencia}`));
  renderLembretes1({...l,faturas:(l.faturas||[]).filter(x=>!chaves.has(`${x.codCartao}|${x.competencia}`))});
  $('#lembretes').insertAdjacentHTML('afterbegin',f.map(x=>`<div class="reminder"><span>${textoFatura(x)}</span>${x.oficial?'':`<button class="ghost" data-fatura-card="${x.codCartao}" data-comp="${x.competencia}" data-venc="${x.vencimento}">Informar total</button>`}<button class="ghost" data-fatura-paga="${x.codFatura}" data-valor="${x.valor}">Marcar como paga</button></div>`).join(''));
};
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-fatura-paga]'),d=e.target.closest('[data-fatura-desfaz]');
  if(b){if(!confirm(`Marcar esta fatura como paga? Isso desconta ${brl(b.dataset.valor)} do seu saldo hoje.`))return;try{await api('faturas/'+b.dataset.faturaPaga+'/paga',{method:'PATCH',body:JSON.stringify({paga:true})});toast('Fatura marcada como paga.','positive');await dashboard();await faturas()}catch(x){toast(x.message,'negative')}}
  if(d){if(!confirm('Desfazer o pagamento? O valor volta para o seu saldo.'))return;try{await api('faturas/'+d.dataset.faturaDesfaz+'/paga',{method:'PATCH',body:JSON.stringify({paga:false})});toast('Pagamento desfeito.','positive');await dashboard();await faturas()}catch(x){toast(x.message,'negative')}}
});
const faturas1=faturas;
faturas=async function(){await faturas1();try{const rows=await api0('faturas'),els=[...document.querySelectorAll('#faturaList .fat-row')];rows.forEach((x,i)=>{const el=els[i];if(!el)return;const tot=Number(x.valorInformado)?Number(x.valorTotal):Number(x.comprasConhecidas);el.insertAdjacentHTML('beforeend',Number(x.paga)?`<span class="fat-paga"><small>Paga</small> <button class="ghost" data-fatura-desfaz="${x.codFatura}">Desfazer</button></span>`:tot>0?`<button class="ghost" data-fatura-paga="${x.codFatura}" data-valor="${tot}">Marcar como paga</button>`:'')})}catch{}};

// ---------- Configurações financeiras em 3 blocos + "Conferir com o banco" ----------
(function(){
  const f=$('#configForm'),sum=$('.settings-summary'),sec=$('#configuracoes');if(!f||!sum)return;
  const L=n=>f.querySelector(`[name=${n}]`).closest('label');
  const mk=(id,titulo,dica,nomes,aberto)=>{
    const d=document.createElement('details');d.className='panel cfg-bloco';d.id=id;d.dataset.aba='geral';if(aberto)d.open=true;
    d.innerHTML=`<summary><b>${titulo}</b><small>${dica}</small></summary><form class="form-grid"></form>`;
    const form=d.querySelector('form');nomes.forEach(n=>form.appendChild(L(n)));form.insertAdjacentHTML('beforeend','<button class="primary">Salvar</button>');
    form.onsubmit=async e=>{e.preventDefault();const c=await api('configuracoes');await api('configuracoes',{method:'PUT',body:JSON.stringify({...c,dataSaldoInicial:String(c.dataSaldoInicial||'').slice(0,10),...formData(form)})});await config();await dashboard();toast('Salvo.','positive')};
    return d};
  const b1=mk('blocoSaldos','Saldos de partida','De onde o PRUMO começou a contar. Mexa só se algo estiver errado.',['saldoInicial','poupancaInicial','dataSaldoInicial','saldoInicialUSD','cotacaoInicialUSD','saldoInicialEUR','cotacaoInicialEUR'],false),
        b2=mk('blocoMargem','Margem e metas','Quanto você quer manter de folga e de reserva.',['limiteSeguranca','reservaEmergencia'],true),
        b3=mk('blocoAlertas','Alertas de cotação','Avisa quando o dólar ou o euro chegar no valor ideal.',['alertaUSDAtivo','alertaUSDValor','alertaEURAtivo','alertaEURValor'],true);
  sum.after(b2,b3,b1);
  sum.querySelector('.hint').textContent='Margem, reserva e alertas ficam abertos. Os saldos de partida ficam recolhidos.';
  sum.querySelector('.settings-buttons').innerHTML='<button class="ghost" type="button" data-settings-target="reconcilePanel">Conferir com o banco</button>';
  sum.querySelector('.settings-buttons button').onclick=()=>$('#reconcilePanel').classList.toggle('hidden');
  const t=$('#reconcilePanel h3');if(t)t.textContent='Conferir com o banco';
  ['#initialConfigPanel','#limitsPanel'].forEach(s=>{const x=$(s);if(x)x.remove()});
  // reconciliação vem logo depois do resumo
  sum.after($('#reconcilePanel'));
  config=async function(){const c=await api('configuracoes'),q=n=>document.querySelector(`#configuracoes [name=${n}]`);
    for(const[k,v]of Object.entries(c)){const el=q(k);if(!el)continue;
      if(['saldoInicial','poupancaInicial','limiteSeguranca','reservaEmergencia'].includes(k))el.value=brl(v);
      else if(k==='saldoInicialUSD'||k==='saldoInicialEUR')el.value=Number(v).toLocaleString('pt-BR',{style:'currency',currency:k.endsWith('USD')?'USD':'EUR'});
      else el.value=String(v??'').slice(0,10)}
    bind(sec)};
  f.remove();
  config();
})();

// ---------- Bens: editar custo adicional ----------
document.addEventListener('click',async e=>{const b=e.target.closest('[data-edit-cost]');if(!b)return;
  const c=JSON.parse(b.dataset.editCost),box=b.closest('[id^=asset-extra-]'),tipos=['MANUTENCAO','REPARO','SEGURO','DOCUMENTACAO','LICENCIAMENTO','IMPOSTO','OUTRO'],formas=[['PIX','Pix'],['DEBITO','Débito'],['CREDITO','Crédito'],['DINHEIRO','Dinheiro'],['BOLETO','Boleto']],fp=c.formaPagamento||'PIX';
  if(!cartoesCache.length)try{cartoesCache=await api0('cartoes')}catch{}
  const cartoes=cartoesCache.filter(k=>k.ativo||String(k.codCartao)===String(c.codCartao)).map(k=>`<option value="${k.codCartao}" ${String(k.codCartao)===String(c.codCartao)?'selected':''}>${esc(k.nomeCartao)}</option>`).join('');
  box.innerHTML=`<form class="cost-edit-form form-grid" data-cod="${c.codCusto}"><h4>Editar custo</h4><label>Data<input name="dataCusto" type="date" value="${String(c.dataCusto).slice(0,10)}"></label><label>Tipo<select name="tipo">${tipos.map(t=>`<option ${t===c.tipo?'selected':''}>${t}</option>`).join('')}</select></label><label>Descrição<input name="descricao" value="${esc(c.descricao||'')}"></label><label>Valor<input name="valor" class="money-input" value="${brl(c.valor)}"></label><label class="sit-label">Situação<select name="situacao"><option ${c.situacao==='PAGO'?'selected':''}>PAGO</option><option ${c.situacao==='PREVISTO'?'selected':''}>PREVISTO</option></select></label><label>Forma de pagamento<select name="formaPagamento">${formas.map(([v,t])=>`<option value="${v}" ${v===fp?'selected':''}>${t}</option>`).join('')}</select></label><div class="subfields credito-bem hidden"><label>Cartão<select name="codCartao">${cartoes||'<option value="">Cadastre um cartão primeiro</option>'}</select></label><label>Parcelado?<select name="quantidadeParcelas" class="parcelas-select"></select></label><label>Mês da primeira fatura<select name="primeiraFatura" class="mes-select"></select></label></div><button class="primary">Salvar</button><button class="ghost" type="button" data-cancel-edit-cost>Cancelar</button></form>`;
  box.classList.remove('hidden');bind(box);
  const form=box.querySelector('form'),mf=form.querySelector('[name=primeiraFatura]'),par=form.querySelector('.parcelas-select'),pag=form.querySelector('[name=formaPagamento]'),cartao=form.querySelector('[name=codCartao]'),data=form.querySelector('[name=dataCusto]'),sitL=form.querySelector('.sit-label'),sub=form.querySelector('.credito-bem');
  popularParcelas(par);par.value=String(c.quantidadeParcelas||1);
  const atual=c.primeiraFatura?String(c.primeiraFatura).slice(0,7):null;
  for(let i=-12;i<=36;i++){const o=document.createElement('option');o.value=mesMais(mesAtual(),i);o.textContent=fullMonth(o.value);mf.appendChild(o)}
  if(atual&&![...mf.options].some(o=>o.value===atual)){const o=document.createElement('option');o.value=atual;o.textContent=fullMonth(atual);mf.appendChild(o)}
  if(atual)mf.value=atual;
  const sugere=()=>{const k=cartoesCache.find(x=>String(x.codCartao)===cartao.value);mf.value=k?mesProvavel(data.value||today(),k.diaFechamento):mesAtual()};
  const atualiza=()=>{const cr=pag.value==='CREDITO';sub.classList.toggle('hidden',!cr);sitL.classList.toggle('hidden',cr)};
  pag.onchange=()=>{atualiza();if(pag.value==='CREDITO'&&!atual)sugere()};cartao.onchange=sugere;atualiza();
});
document.addEventListener('click',async e=>{if(e.target.closest('[data-cancel-edit-cost]')){await bens()}});
document.addEventListener('submit',async e=>{if(!e.target.matches('.cost-edit-form'))return;e.preventDefault();e.stopImmediatePropagation();
  try{await api('bens/custos/'+e.target.dataset.cod,{method:'PUT',body:JSON.stringify(formData(e.target))});toast('Custo atualizado em Bens e Movimentações.','positive');await bens();await dashboard()}catch(x){toast(x.message,'negative')}},true);

// ---------- Receitas fixas (mesmo estilo dos gastos fixos) ----------
(function(){
  $('#fixedCostsAction').insertAdjacentHTML('afterend','<button id="fixedIncomeAction" class="ghost hidden" type="button">Receitas fixas</button>');
  $('#fixedCostsPanel').insertAdjacentHTML('afterend',`<div id="fixedIncomePanel" class="panel hidden"><div class="panel-head"><h3>Receitas fixas</h3><button id="closeFixedIncome" class="ghost" type="button">Fechar</button></div><p class="hint">Salário e outras entradas que se repetem todo mês. Aparecem como previstas em Movimentações; você confirma quando cair.</p><form id="fixedIncomeForm" class="form-grid"><input type="hidden" name="codFin"><label>Descrição<input name="descricao" required placeholder="Salário"></label><label>Valor mensal<input name="valor" class="money-input" placeholder="R$ 0,00" inputmode="numeric" value="" required></label><label>Categoria<select name="categoria"></select></label><label>Dia previsto<input name="dia" type="number" min="1" max="31" value="5"></label><label>Recebimento<select name="formaPagamento"><option value="PIX">Pix</option><option value="TRANSFERENCIA">Transferência</option><option value="DINHEIRO">Dinheiro</option></select></label><label>Início<input name="inicio" type="month" required></label><label>Término, opcional<input name="fim" type="month"></label><button class="primary">Salvar receita fixa</button></form><div id="fixedIncomeList" class="responsive-list"></div></div>`);
  const f=$('#fixedIncomeForm'),sel=f.querySelector('[name=categoria]'),BASE=['Salário','Freelance','Aluguel recebido','Benefícios','Reembolso','Outros'];
  let cats=[];
  const pinta=a=>{const l=[...new Set([...BASE,...cats,...(a?[a]:[])])];sel.innerHTML='<option value="">Sem categoria</option>'+l.map(c=>`<option>${esc(c)}</option>`).join('')+'<option value="__nova">+ Nova categoria...</option>';if(a)sel.value=a};
  const carrega=async a=>{try{cats=(await api0('categorias')).filter(Boolean)}catch{}pinta(a)};
  sel.onchange=()=>{if(sel.value!=='__nova')return;const n=(prompt('Nome da nova categoria:')||'').trim();if(n){cats.push(n);pinta(n)}else sel.value=''};
  mesLista(f.querySelector('[name=inicio]'),{padrao:mesAtual(),antes:12});
  mesLista(f.querySelector('[name=fim]'),{vazio:'Sem término',antes:0,depois:60});
  bind(f);
  async function lista(){const rows=await api('receitas-fixas');$('#fixedIncomeList').innerHTML=rows.map(x=>`<article class="list-card"><div><b>${esc(x.descricao)}</b><small>${brl(x.valor)} por mês · dia ${Number(String(x.dataInicioRecorrencia).slice(8,10))} · ${esc(x.categoria||'Sem categoria')} · Início ${fullMonth(x.dataInicioRecorrencia)}${x.dataFimRecorrencia?' · até '+fullMonth(x.dataFimRecorrencia):''}</small></div><div class="record-actions"><button class="ghost" data-edit-income='${JSON.stringify(x).replace(/'/g,'&#39;')}'>Editar</button><button class="danger-outline" data-delete-income="${x.codFin}">Excluir</button></div></article>`).join('')||'<p>Nenhuma receita fixa cadastrada.</p>'}
  $('#fixedIncomeAction').onclick=async()=>{$('#fixedIncomePanel').classList.remove('hidden');await carrega();await lista();$('#fixedIncomePanel').scrollIntoView({behavior:'smooth'})};
  $('#closeFixedIncome').onclick=()=>$('#fixedIncomePanel').classList.add('hidden');
  f.onsubmit=async e=>{e.preventDefault();const d=formData(f),editing=f.dataset.editing&&d.codFin;try{await api(editing?'receitas-fixas/'+d.codFin:'receitas-fixas',{method:editing?'PUT':'POST',body:JSON.stringify(d)});resetForm(f,{inicio:mesAtual(),dia:'5'});pinta('');await lista();await movements();await dashboard();toast('Receita fixa salva.','positive')}catch(x){toast(x.message,'negative')}};
  document.addEventListener('click',async e=>{const ed=e.target.closest('[data-edit-income]'),del=e.target.closest('[data-delete-income]');
    if(ed){const x=JSON.parse(ed.dataset.editIncome);resetForm(f);await carrega(x.categoria||'');f.codFin.value=x.codFin;f.descricao.value=x.descricao;f.valor.value=brl(x.valor);f.formaPagamento.value=x.formaPagamento||'PIX';f.inicio.value=String(x.dataInicioRecorrencia).slice(0,7);f.fim.value=x.dataFimRecorrencia?String(x.dataFimRecorrencia).slice(0,7):'';f.dia.value=Number(String(x.dataInicioRecorrencia).slice(8,10));f.dataset.editing='1';f.inicio.dispatchEvent(new Event('change'));f.fim.dispatchEvent(new Event('change'));$('#fixedIncomePanel').scrollIntoView({behavior:'smooth'})}
    if(del){if(!confirm('Excluir esta receita fixa e as previsões futuras?'))return;try{await api('receitas-fixas/'+del.dataset.deleteIncome,{method:'DELETE'});await lista();await movements();await dashboard()}catch(x){toast(x.message,'negative')}}});
  const page2=page;page=function(id){page2(id);$('#fixedIncomeAction').classList.toggle('hidden',id!=='movimentacoes')};
})();

// Compra no crédito na lista: mostra a parcela do mês; Editar/Excluir atuam na compra inteira.
(function(){const base=movActions;movActions=function(x){if(x.classeRegistro!=='PARCELA_CREDITO')return base(x);
  const compra={...x,valor:x.valorCompra,dataMovimentacao:String(x.dataCompra).slice(0,10),classeRegistro:'MOVIMENTACAO'};
  return base(compra).replace(/<button class="ghost" data-status-mov="[^"]*" data-next="[^"]*">[^<]*<\/button>/,'').replace('>Excluir<','>Excluir compra<')}})();

// ---------- Cartões e faturas: só a fatura do mês / a vencer; as outras ficam escondidas ----------
let faturasTodas=false;
const faturas2=faturas;
faturas=async function(){await faturas2();try{
  const rows=await api0('faturas'),els=[...document.querySelectorAll('#faturaList .fat-row')],atual=mesAtual(),comp=x=>x.competencia||String(x.dataVencimento).slice(0,7);
  const valor=x=>Number(x.valorInformado)?Number(x.valorTotal)||0:Number(x.comprasConhecidas)||0;
  const abertas=rows.filter(x=>!Number(x.paga)&&comp(x)>=atual&&valor(x)>0);
  const proxima=abertas.map(comp).sort()[0];
  const visivel=x=>!Number(x.paga)&&comp(x)<atual&&valor(x)>0||comp(x)===atual||(!rows.some(y=>comp(y)===atual)&&comp(x)===proxima);
  let ocultas=0;rows.forEach((x,i)=>{const el=els[i];if(!el)return;const oculta=!visivel(x);if(oculta)ocultas++;el.classList.toggle('hidden',oculta&&!faturasTodas)});
  const lista=$('#faturaList'),total=abertas.reduce((a,x)=>a+Math.round(valor(x)*100),0)/100;
  lista.querySelectorAll('.fat-total,.fat-mais').forEach(n=>n.remove());
  lista.insertAdjacentHTML('afterbegin',`<small class="fat-total hint">A vencer: ${brl(total)} em ${abertas.length} ${abertas.length===1?'fatura':'faturas'}</small>`);
  if(ocultas)lista.insertAdjacentHTML('beforeend',`<button class="ghost fat-mais" type="button" data-fat-mais>${faturasTodas?'Esconder outras faturas':`Mostrar outras faturas (${ocultas})`}</button>`);
}catch{}};
document.addEventListener('click',e=>{if(e.target.closest('[data-fat-mais]')){faturasTodas=!faturasTodas;faturas()}});

// ---------- Conferir com o banco: dá para conferir só um campo (vazio = não conferir, nunca vira zero) ----------
function conferirCalculo(entradas,prumo){
  // entradas: {saldo,poupanca} em texto; vazio ou só espaços = não conferir.
  const campos=[['saldo','Conta (saldo)',prumo.saldo],['poupanca','Poupança',prumo.poupanca]],out=[];
  for(const[k,nome,atual]of campos){const t=String(entradas[k]??'').trim();if(t==='')continue;
    const banco=val(t),dif=Math.round((banco-Number(atual))*100)/100;out.push({campo:k,nome,prumo:Number(atual),banco,dif})}
  return out}
(function(){
  const a=$('#realBankBalance'),b=$('#realSavingsBalance'),btn=$('#calculateReconcile'),res=$('#reconcileResult'),reg=$('#registerReconcile');if(!a||!b||!btn)return;
  [a,b].forEach(i=>{i.classList.remove('money-input');i.dataset.bind=1;i.value='';i.placeholder='Deixe vazio para não conferir';i.inputMode='numeric';
    i.oninput=e=>{const d=i.value.replace(/\D/g,''),apagando=e&&String(e.inputType||'').startsWith('delete');i.value=d&&!(apagando&&Number(d)===0)?(Number(d)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'';res.innerHTML=''}});
  if(reg)reg.remove();
  btn.onclick=async()=>{
    if(!a.value.trim()&&!b.value.trim()){res.innerHTML='<p class="hint">Preencha ao menos um campo. O que ficar vazio não é conferido.</p>';return}
    try{const d=await api0('dashboard'),r=conferirCalculo({saldo:a.value,poupanca:b.value},{saldo:d.saldo,poupanca:d.poupanca.total});
      res.innerHTML=r.map(x=>`<article class="saldo-card"><small>${x.nome}</small><b>${x.dif===0?'Bate com o banco':(x.dif>0?'Banco tem '+brl(x.dif)+' a mais':'Banco tem '+brl(-x.dif)+' a menos')}</b><small>PRUMO: ${brl(x.prumo)} · Banco: ${brl(x.banco)}</small></article>`).join('')}
    catch(e){toast(e.message,'negative')}}})();
