// PRUMO 2.2: Pru interativo, lançamento rápido, lembretes, importar fatura, resumo do mês e home mais simples.
// Carregado por último: estende (sem reescrever) o que os outros módulos já fazem.
const api0=api;
const pruModo=()=>localStorage.getItem('prumo-pru')||'normal';

// ---------- Pru: balão de comentário ----------
let pruTimer;
function pruFala(texto){if(!texto||pruModo()==='quieto')return;$('#pruBubbleText').textContent=texto;$('#pruBubble').classList.remove('hidden');clearTimeout(pruTimer);pruTimer=setTimeout(()=>$('#pruBubble').classList.add('hidden'),11000)}
$('#pruBubbleClose').onclick=()=>$('#pruBubble').classList.add('hidden');
async function pruCtx(){const[d,g]=await Promise.all([api0('dashboard'),api0('objetivos')]);return{saldo:d.saldo,limiteSeguranca:d.config.limiteSeguranca,poupado:d.poupanca.total,objetivos:g,proximoRisco:null}}
async function pruMeta(){try{return Pru.comentarioMetaOutros(await api0('meta-outros'))}catch{return null}}
async function pruDepois(u,body,res){
  if(['movimentacoes','faturas'].includes(u)){const m=await pruMeta();if(m)return pruFala(m)}
  if(u==='movimentacoes')return pruFala(Pru.comentarioLancamento(body,await pruCtx()));
  if(u==='transferencias')return pruFala(Pru.comentarioTransferencia(body,await pruCtx()));
  if(u==='faturas')return pruFala(Pru.comentarioFatura(res));
}
api=async function(u,o={}){let r;try{r=await api0(u,o)}catch(e){if(e.message==='Acesso protegido'){location.href='/login.html';return new Promise(()=>{})}throw e}if(String(o.method||'GET').toUpperCase()==='POST'&&['movimentacoes','transferencias','faturas'].includes(u)){let b={};try{b=JSON.parse(o.body||'{}')}catch{}setTimeout(()=>pruDepois(u,b,r).catch(()=>{}),700)}return r};
$('#pruSelect').value=pruModo();$('#pruSelect').onchange=e=>localStorage.setItem('prumo-pru',e.target.value);

// ---------- Simulador: o Pru diz com clareza o que acontece ----------
$('#quickSimForm').onsubmit=async e=>{e.preventDefault();const data=formData(e.target),[r,best]=await Promise.all([api0('simulador',{method:'POST',body:JSON.stringify(data)}),api0('simulador/melhor-mes',{method:'POST',body:JSON.stringify(data)})]),c=Pru.comentarioSimulacao(r,best);$('#quickSimResult').classList.remove('hidden');const adv=$('#quickSimAdvice');adv.textContent=c.texto;adv.className='advice-'+c.nivel.toLowerCase();renderForecast(r.projecao,'#quickSimForecast')};

// ---------- Home mais simples ----------
financialSummary=async function(){
  const[s,commit,lemb,ctx]=await Promise.all([api0('resumo-financeiro'),api0('compromissos'),api0('lembretes'),pruCtx()]);
  $('#financialIndicators').innerHTML=`<article class="indicator-card ${s.saldoLivre<0?'bad':'good'}"><small>Livre de verdade</small><b class="${s.saldoLivre<0?'negative':''}">${brl(s.saldoLivre)}</b><span>Saldo menos gastos fixos e margem</span></article><article class="indicator-card ${s.sobraMensal<0?'bad':'good'}"><small>Sobra do mês</small><b class="${s.sobraMensal<0?'negative':''}">${brl(s.sobraMensal)}</b><span>Receitas fixas menos gastos fixos</span></article><article class="indicator-card ${s.proximoRisco?'warn':'good'}"><small>Próximo aperto</small><b>${s.proximoRisco?fullMonth(s.proximoRisco.mes):'Nenhum'}</b><span>${s.proximoRisco?`Saldo previsto: ${brl(s.proximoRisco.saldo)}`:'Nos próximos 12 meses'}</span></article>`;
  $('#moreNumbers').innerHTML=`<article class="indicator-card"><small>Custo fixo mensal</small><b>${brl(s.custoFixo)}</b><span>${s.comprometimento.toFixed(1)}% da renda fixa</span></article><article class="indicator-card"><small>Reserva</small><b>${s.mesesReserva.toFixed(1)} meses</b><span>de gastos fixos cobertos</span></article>`;
  $('#compromissos').innerHTML=commit.map(x=>`<button class="commitment-item" data-page="${x.origem==='FATURA'?'cartoes':'movimentacoes'}"><time>${date(x.data)}</time><span>${esc(x.descricao)}</span><b class="${x.tipo==='DESPESA'?'negative':'positive'}">${x.tipo==='DESPESA'?'-':'+'}${brl(x.valor)}</b></button>`).join('')||'<p>Nenhum compromisso previsto para os próximos 30 dias.</p>';
  $('#pruTip').textContent=(await pruMeta())||Pru.comentarioDiario({...ctx,proximoRisco:s.proximoRisco},lemb);
  renderLembretes(lemb);
};

// ---------- Lembretes ----------
const lembKey=x=>`prumo-lemb-${x.tipo}-${x.codCartao||''}-${x.competencia||x.fechaEm||''}`;
function renderLembretes(l){const itens=[];for(const x of l.faturas||[]){if(localStorage.getItem(lembKey(x)))continue;itens.push(x.tipo==='FATURA_FECHOU'?{k:lembKey(x),t:`A fatura do ${esc(x.nomeCartao)} fechou em ${date(x.fechouEm)}. Informe o total pra eu calcular o "Outros".`,a:`<button class="ghost" data-fatura-card="${x.codCartao}" data-comp="${x.competencia}" data-venc="${x.vencimento}">Informar total</button>`}:{k:lembKey(x),t:`A fatura do ${esc(x.nomeCartao)} fecha em ${x.dias} ${x.dias===1?'dia':'dias'} (${date(x.fechaEm)}). Anote o que faltou.`,a:''})}
  if(l.recorrentesAConfirmar)itens.push({k:'',t:`${l.recorrentesAConfirmar} ${l.recorrentesAConfirmar===1?'lançamento recorrente venceu':'lançamentos recorrentes venceram'} e ${l.recorrentesAConfirmar===1?'espera':'esperam'} confirmação.`,a:'<button class="ghost" data-page="movimentacoes">Ver</button>'});
  $('#lembretes').innerHTML=itens.map(i=>`<div class="reminder"><span>${i.t}</span>${i.a}${i.k?`<button type="button" class="reminder-x" data-dismiss="${i.k}" aria-label="Dispensar">×</button>`:''}</div>`).join('')}
document.addEventListener('click',async e=>{const d=e.target.closest('[data-dismiss]');if(d){localStorage.setItem(d.dataset.dismiss,'1');d.closest('.reminder').remove()}const b=e.target.closest('[data-fatura-card]');if(b){page('cartoes');await cards();const f=$('#billForm');f.codCartao.value=b.dataset.faturaCard;f.competencia.value=b.dataset.comp;f.dataVencimento.value=b.dataset.venc;f.valorTotal.focus();f.scrollIntoView({behavior:'smooth'})}});

// ---------- Faturas: Outros automático e alerta de excedente; importar PDF/CSV ----------
faturas=async function(){const rows=await api0('faturas'),ex=rows.filter(x=>Number(x.excedente)>0);
  $('#faturaAlertas').innerHTML=ex.map(x=>`<div class="alert-line" role="alert">${esc(x.nomeCartao)} · ${fullMonth(x.competencia||x.dataVencimento)}: você anotou ${brl(x.excedente)} a mais que a fatura.</div>`).join('');
  $('#faturaList').innerHTML=rows.map(x=>`<article class="bill"><b>${esc(x.nomeCartao)} · ${fullMonth(x.competencia||x.dataVencimento)}</b><span>${Number(x.valorInformado)?`Total ${brl(x.valorTotal)}`:'Total ainda não informado'} · Anotadas ${brl(x.comprasConhecidas)} · Outros (não anotado) ${brl(x.outros)}</span></article>`).join('')||'<p>Nenhuma fatura.</p>'};
$('#billFile').onchange=async e=>{const f=e.target.files[0],msg=$('#billFileMsg');if(!f)return;msg.textContent='Lendo o arquivo...';try{const buf=new Uint8Array(await f.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));const r=await api('faturas/importar',{method:'POST',body:JSON.stringify({arquivo:{nome:f.name,base64:btoa(bin)}})});if(r.total){$('#billForm').valorTotal.value=brl(r.total);msg.textContent=`${r.mensagem} Total sugerido: ${brl(r.total)}. Nada foi salvo: confira e clique em Informar fatura.`}else msg.textContent=r.mensagem}catch(x){msg.textContent=x.message}e.target.value=''};

// ---------- Lançamento rápido (+) ----------
const CATEGORIAS_BASE=['Alimentação','Transporte','Moradia','Saúde','Lazer','Educação','Assinaturas','Compras','Salário','Outros'];
async function categoriasUsadas(){let u=[];try{u=await api0('categorias')}catch{}return[...new Set([...u,...CATEGORIAS_BASE])]}
async function preencherCategorias(){const cats=await categoriasUsadas();$('#qaCatList').innerHTML=cats.map(c=>`<option value="${esc(c)}">`).join('');const sel=$('#movCategoria');if(sel&&!sel.options.length)sel.innerHTML='<option value="">Sem categoria</option>'+cats.map(c=>`<option>${esc(c)}</option>`).join('')}
let qaCatEditada=false,qaTimer;
$('#qaCat').oninput=()=>qaCatEditada=true;
$('#qaDesc').oninput=()=>{clearTimeout(qaTimer);qaTimer=setTimeout(async()=>{const d=$('#qaDesc').value.trim();if(d.length<2||qaCatEditada)return;try{const s=await api0('sugestao-categoria?descricao='+encodeURIComponent(d));if(s.categoria){$('#qaCat').value=s.categoria;if(s.tipo)$('#qaTipo').value=s.tipo;if(s.formaPagamento&&[...$('#qaPag').options].some(o=>o.value===s.formaPagamento||o.text===s.formaPagamento))$('#qaPag').value=s.formaPagamento;qaPag()}}catch{}},350)};
function qaPag(){$('#qaCredito').classList.toggle('hidden',$('#qaPag').value!=='CREDITO')}
$('#qaPag').onchange=qaPag;
$('#quickAdd').onclick=async()=>{const f=$('#quickAddForm');f.reset();qaCatEditada=false;f.valor.value=brl(0);$('#qaPag').value=localStorage.getItem('prumo-qa-pag')||'PIX';qaPag();bind(f);const[cs]=await Promise.all([api0('cartoes'),preencherCategorias()]);$('#qaCartao').innerHTML=cs.filter(x=>x.ativo).map(x=>`<option value="${x.codCartao}">${esc(x.nomeCartao)}</option>`).join('');$('#quickAddDialog').showModal();$('#qaValor').focus()};
$('#qaCancel').onclick=()=>$('#quickAddDialog').close();
$('#quickAddForm').onsubmit=async e=>{e.preventDefault();const f=e.target,d=formData(f),credit=d.formaPagamento==='CREDITO';if(!(d.valor>0))return toast('Informe o valor.','negative');if(credit&&!d.codCartao)return toast('Cadastre um cartão antes.','negative');const body={dataMovimentacao:today(),tipo:d.tipo,descricao:d.descricao,valor:d.valor,categoria:d.categoria||null,situacao:'EFETIVADA',formaPagamento:d.formaPagamento,recorrente:'0'};if(credit){body.codCartao=d.codCartao;body.quantidadeParcelas=Number(d.quantidadeParcelas||1);body.primeiraFatura=today().slice(0,7)}try{await api('movimentacoes',{method:'POST',body:JSON.stringify(body)});localStorage.setItem('prumo-qa-pag',d.formaPagamento);$('#quickAddDialog').close();toast('Lançado.','positive');await load($('.page.active').id)}catch(x){toast(x.message,'negative')}};

// ---------- Resumo do mês ----------
sections.resumo=['Resumo do mês',''];
const ordem=['dashboard','resumo','movimentacoes','transferencias','cambio','bens','cartoes','objetivos','configuracoes'];
$('#nav').innerHTML=ordem.map((id,i)=>`<button class="navbtn ${i?'':'active'}" data-page="${id}">${sections[id][0]}</button>`).join('');
$('#resumoMes').value=today().slice(0,7);
async function resumo(){const mes=$('#resumoMes').value||today().slice(0,7),r=await api0('resumo-mes?mes='+mes),dif=r.saidaTotal-r.anterior.saidaTotal,max=Math.max(1,...r.categorias.map(c=>c.total));
  $('#resumoCorpo').innerHTML=`<div class="indicator-grid indicator-3"><article class="indicator-card good"><small>Entrou</small><b>${brl(r.receitas)}</b><span>${fullMonth(r.mes)}</span></article><article class="indicator-card warn"><small>Saiu (com faturas)</small><b>${brl(r.saidaTotal)}</b><span>${dif===0?'Igual ao mês anterior':`${brl(Math.abs(dif))} ${dif>0?'a mais':'a menos'} que ${fullMonth(r.anterior.mes)}`}</span></article><article class="indicator-card ${r.sobra<0?'bad':'good'}"><small>Sobrou</small><b class="${r.sobra<0?'negative':''}">${brl(r.sobra)}</b><span>Entradas menos saídas</span></article></div>
  <div class="grid2"><article class="panel"><h3>Pra onde foi o dinheiro</h3>${r.categorias.map(c=>`<div class="bar-line"><span>${esc(c.categoria)}</span><i style="width:${Math.round(c.total/max*100)}%"></i><b>${brl(c.total)}</b></div>`).join('')||'<p>Nada lançado neste mês.</p>'}</article><article class="panel"><h3>Faturas do mês</h3>${r.faturas.map(f=>`<div class="projection-line"><span>${esc(f.cartao)}<small>${f.informada?'Total informado':'Só o que foi anotado'}${f.outros?` · Outros ${brl(f.outros)}`:''}</small></span><b>${brl(f.total)}</b></div>`).join('')||'<p>Nenhuma fatura neste mês.</p>'}${r.outros?`<p class="hint">"Outros" são gastos que você não anotou e a fatura revelou: ${brl(r.outros)}.</p>`:''}</article></div>`}
$('#resumoAtualizar').onclick=()=>resumo().catch(x=>toast(x.message,'negative'));$('#resumoMes').onchange=$('#resumoAtualizar').onclick;
const load0=load;load=async function(id){if(id==='resumo'){try{await resumo()}catch(e){toast(e.message,'negative')}return}await load0(id);if(id==='movimentacoes')preencherCategorias()};
preencherCategorias();
load(document.querySelector('.page.active').id); // recarrega a página inicial já com as extensões desta versão

// ---------- Modo privacidade (ícone de olho): esconde valores em todas as telas ----------
const PRIV_RE=/-?(?:R\$|US\$|€)\s?-?[\d.,]+/g,privOriginal=new WeakMap();let privAplicando=false;
const privOn=()=>localStorage.getItem('prumo-privado')==='1';
function privTexto(n){if(!n.nodeValue||!PRIV_RE.test(n.nodeValue)){PRIV_RE.lastIndex=0;return}PRIV_RE.lastIndex=0;if(!privOriginal.has(n))privOriginal.set(n,n.nodeValue);n.nodeValue=n.nodeValue.replace(PRIV_RE,'••••')}
function privVarrer(raiz){const w=document.createTreeWalker(raiz,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&!n.parentElement.closest('script,style,textarea,option,#privToggle')?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});const lista=[];while(w.nextNode())lista.push(w.currentNode);lista.forEach(privTexto)}
function privRestaurar(){const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);while(w.nextNode()){const n=w.currentNode;if(privOriginal.has(n)){n.nodeValue=privOriginal.get(n);privOriginal.delete(n)}}}
const privObs=new MutationObserver(ms=>{if(privAplicando||!privOn())return;privAplicando=true;try{for(const m of ms){if(m.type==='characterData')privTexto(m.target);else m.addedNodes.forEach(n=>{if(n.nodeType===3)privTexto(n);else if(n.nodeType===1)privVarrer(n)})}}finally{privAplicando=false}});
function privIcone(){const on=privOn();$('#privToggle').innerHTML=on?'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>':'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';$('#privToggle').title=on?'Mostrar valores':'Ocultar valores';$('#privToggle').setAttribute('aria-label',$('#privToggle').title);$('#privToggle').setAttribute('aria-pressed',on)}
function privAplicar(){privAplicando=true;try{if(privOn())privVarrer(document.body);else privRestaurar()}finally{privAplicando=false}privIcone();document.body.classList.toggle('privado',privOn())}
const privBtn=document.createElement('button');privBtn.id='privToggle';privBtn.type='button';privBtn.className='ghost eye-btn';$('.header-actions').prepend(privBtn);
privBtn.onclick=()=>{localStorage.setItem('prumo-privado',privOn()?'0':'1');privAplicar()};
privObs.observe(document.body,{childList:true,subtree:true,characterData:true});privAplicar();
