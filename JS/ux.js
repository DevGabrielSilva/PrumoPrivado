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
  return{desc,acoes,trav,sit:`<span class="sit sit-${String(x.situacao).toLowerCase()}">${SIT[x.situacao]||x.situacao}</span>`};
}
movements=async function(){
  const q=new URLSearchParams({mes:$('#movMonth').value,busca:$('#movSearch').value,situacao:$('#movStatus').value,tipo:movTipo,pagamento:$('#movPayment').value}),rows=await api('movimentacoes?'+q);
  const ativos=rows.filter(x=>x.situacao!=='CANCELADA'),ent=ativos.filter(x=>x.tipo==='RECEITA').reduce((a,x)=>a+Number(x.valor),0),sai=ativos.filter(x=>x.tipo==='DESPESA').reduce((a,x)=>a+Number(x.valor),0),res=ent-sai;
  $('#movTotais').innerHTML=`<article class="saldo-card"><small>Entradas</small><b class="positive">${brl(ent)}</b></article><article class="saldo-card"><small>Saídas</small><b>${brl(sai)}</b></article><article class="saldo-card"><small>Resultado do mês</small><b class="${res<0?'negative':''}">${brl(res)}</b></article>`;
  $('#movRows').innerHTML=rows.map(x=>{const l=movLinha(x);return`<tr class="row-${x.tipo.toLowerCase()}${l.trav?' row-locked':''}"><td>${date(x.dataMovimentacao)}</td><td>${l.desc}</td><td class="${x.tipo==='RECEITA'?'positive':'negative-soft'}">${x.tipo==='RECEITA'?'+':'-'}${brl(x.valor)}</td><td>${l.sit}</td><td>${l.acoes}</td></tr>`}).join('')||'<tr><td colspan="5" class="vazio">Nada lançado neste mês.</td></tr>';
  $('#movCards').innerHTML=rows.map(x=>{const l=movLinha(x);return`<article class="mobile-record row-${x.tipo.toLowerCase()}${l.trav?' row-locked':''}"><div class="mr-top"><span>${date(x.dataMovimentacao)}</span>${l.sit}</div><h3>${l.desc}</h3><b>${x.tipo==='RECEITA'?'+':'-'}${brl(x.valor)}</b>${l.acoes}</article>`}).join('')||'<p class="vazio">Nada lançado neste mês.</p>';
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
