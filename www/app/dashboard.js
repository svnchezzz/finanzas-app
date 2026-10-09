/* app/dashboard.js — Panel: KPIs, comparativas, gráficos (donas, tendencia, pendientes) y tooltips.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Panel ── */
function renderDashboard(){
  // Estado vacío para usuarios nuevos (sin ningún movimiento registrado)
  const hasAny=allMovements().length>0;
  const empty=document.getElementById('dashEmpty');
  if(empty)empty.hidden=hasAny;
  const dash=document.getElementById('view-dashboard');
  if(dash)dash.classList.toggle('is-empty',!hasAny);
  if(!hasAny)return;
  const list=periodTx();
  const inc=sumType(list,'Income'),exp=sumType(list,'Expense'),bal=disponibleReal();
  // Ingresos y gastos son del periodo; el ahorro es el saldo acumulado al cierre
  // del periodo que se está viendo (savPer es el movimiento del ahorro en él).
  const sav=savingsBalance(periodBounds(S.ref,S.period).end), savPer=savingsNet(list);
  countUp('income',inc);countUp('expense',exp);countUp('savings',sav);countUp('balance',bal);
  setSub('income',countOf(list,'Income'));setSub('expense',countOf(list,'Expense'));
  const fs=fromSavingsSum(list);
  const P=perTxt();
  setSub('savings',fs>0?('−'+money(fs)+' desde ahorro '+P.este)
    :(savPer>0?('+'+money(savPer)+' '+P.este):'Total acumulado'));
  renderDeltas(inc,exp,sav);
  renderMonthSum_();
  setSub('balance',smartLine(exp,savPer));
  ['Expense','Income','Savings'].forEach(renderDonut);
  renderTrend();
  renderPendChart();
  describeCharts_();
}
/* Texto para lectores de pantalla: la tendencia es un <canvas> y no se lee sola */
function describeCharts_(){
  const c=document.getElementById('trendChart'), ch=S.charts.trend; if(!c)return;
  c.setAttribute('role','img');
  if(!ch){c.setAttribute('aria-label','Tendencia: sin datos');return;}
  const parts=ch.data.datasets.map(function(ds){return ds.label+' '+money(ds.data.reduce(function(a,b){return a+(+b||0);},0));}).join(', ');
  c.setAttribute('aria-label','Tendencia. '+(document.getElementById('trendCaption').textContent||'')+'. '+(parts||'sin movimientos'));
}
/* Comparativa contra el mismo periodo anterior (día/semana/mes/año) */
function prevPeriodTx(){
  const prevRef=shiftRef(S.ref,S.period,-1);
  const b=periodBounds(prevRef,S.period);
  return allMovements().filter(function(t){return inBounds(t,b);});
}
function renderDeltas(inc,exp,sav){
  const prev=prevPeriodTx();
  const pInc=sumType(prev,'Income'), pExp=sumType(prev,'Expense');
  // El ahorro se compara contra el saldo al cierre del periodo anterior (cuánto
  // creció o bajó tu ahorro), no contra lo aportado en ese periodo.
  const pSav=savingsBalance(periodBounds(shiftRef(S.ref,S.period,-1),S.period).end);
  setDelta('income',inc,pInc,true);
  setDelta('expense',exp,pExp,false);   // en gastos, subir es "malo" → rojo
  setDelta('savings',sav,pSav,true);
}
function setDelta(key,cur,prev,upIsGood){
  const el=document.querySelector('[data-kpi-delta="'+key+'"]');
  if(!el)return;
  if(!prev){ el.textContent=''; el.className='kpi-delta'; return; }
  const pct=Math.round((cur-prev)/Math.abs(prev)*100);
  if(pct===0){ el.textContent='= '+perTxt().igual; el.className='kpi-delta flat'; return; }
  const up=pct>0;
  const good=upIsGood?up:!up;
  // Con bases pequeñas el % se dispara a cifras absurdas → mostrar la diferencia en dinero
  el.textContent=(up?'▲ ':'▼ ')+(Math.abs(pct)>200?money(Math.abs(cur-prev)):(Math.abs(pct)+'%'))+' '+perTxt().vs;
  el.className='kpi-delta '+(good?'good':'bad');
}
/* ── Resumen del mes que terminó ──
   Los primeros 10 días de cada mes, el Panel abre con "Así te fue en <mes anterior>":
   totales y hasta tres frases que comparan con el mes antes de ese. Se cierra con la
   × y no vuelve a salir para ese mes. */
const MSUM_KEY='cf-msum-visto';
function monthTx_(y,m){const b=periodBounds(new Date(y,m,1),'month');return allMovements().filter(function(t){return inBounds(t,b);});}
function renderMonthSum_(){
  const box=document.getElementById('monthSum'); if(!box)return;
  const hoy=new Date(), prev=new Date(hoy.getFullYear(),hoy.getMonth()-1,1);
  const tag=ymd(prev).slice(0,7);
  let visto=''; try{visto=localStorage.getItem(MSUM_KEY)||'';}catch(e){}
  const list=monthTx_(prev.getFullYear(),prev.getMonth());
  if(hoy.getDate()>10||visto===tag||!list.length){box.hidden=true;return;}
  const before=monthTx_(prev.getFullYear(),prev.getMonth()-1);
  const mes=MESES[prev.getMonth()], mesAntes=MESES[(prev.getMonth()+11)%12];
  const inc=sumType(list,'Income'), exp=sumType(list,'Expense'), sav=savingsNet(list);
  const pExp=sumType(before,'Expense');
  const lines=[];
  if(pExp>0&&exp!==pExp){
    const pct=Math.round(Math.abs(exp-pExp)/pExp*100), menos=exp<pExp;
    const cuanto=pct>200?money(Math.abs(exp-pExp)):pct+'%';
    lines.push({c:menos?'good':'bad',t:'Gastaste '+cuanto+(menos?' menos':' más')+' que en '+mesAntes+'.'});
  }
  const cats=breakdown(list,'Expense');
  if(cats.length&&exp>0)lines.push({c:'',t:'Tu mayor gasto fue '+cats[0].name+': '+money(cats[0].amount)+' ('+Math.round(cats[0].amount/exp*100)+'% de lo que gastaste).'});
  if(inc>0&&sav>0)lines.push({c:'good',t:'Ahorraste el '+Math.round(sav/inc*100)+'% de lo que ganaste.'});
  else if(inc>0&&exp>inc)lines.push({c:'bad',t:'Gastaste '+money(exp-inc)+' más de lo que ganaste.'});
  if(before.length){
    const pmap={}; breakdown(before,'Expense').forEach(function(c){pmap[c.name]=c.amount;});
    let up=null; cats.forEach(function(c){const d=c.amount-(pmap[c.name]||0);if(d>0&&(!up||d>up.d))up={n:c.name,d:d};});
    if(up)lines.push({c:'bad',t:up.n+' fue lo que más subió: '+money(up.d)+' más que en '+mesAntes+'.'});
  }
  // Las tres cifras con el mismo tamaño: el de la más larga
  const len=Math.max(money(inc).length,money(exp).length,money(sav).length);
  function num(l,v,cls){return '<div class="ms-num '+cls+'"><span>'+l+'</span><b style="--len:'+len+'">'+esc(money(v))+'</b></div>';}
  box.innerHTML=
    '<div class="card-head"><h3 id="msTitle">Así te fue en '+mes+'</h3>'+
      '<button type="button" class="icon-btn ms-close" aria-label="Cerrar el resumen de '+mes+'">'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></div>'+
    '<div class="ms-nums">'+num('Ingresos',inc,'in')+num('Gastos',exp,'out')+num('Ahorro',sav,'sav')+'</div>'+
    (lines.length?'<ul class="ms-lines">'+lines.slice(0,3).map(function(l){return '<li class="'+l.c+'">'+esc(l.t)+'</li>';}).join('')+'</ul>':'')+
    '<button type="button" class="btn-ghost ms-open">Ver '+mes+' completo</button>';
  box.hidden=false;
  box.querySelector('.ms-close').onclick=function(){
    try{localStorage.setItem(MSUM_KEY,tag);}catch(e){}
    box.hidden=true; if(window.Haptic)Haptic.light();
  };
  box.querySelector('.ms-open').onclick=function(){
    S.period='month'; S.ref=new Date(prev.getFullYear(),prev.getMonth(),15);
    const b=document.querySelector('#periodSeg [data-period="month"]'); if(b)setSeg('periodSeg',b);
    renderAll(); try{window.scrollTo({top:0,behavior:'smooth'});}catch(e){}
  };
}
function pendStatus(p){
  if(p.status==='completed')return {key:'completed',label:'Completado'};
  if(p.dueDate && p.dueDate < ymd(sod(new Date())))return {key:'overdue',label:'Vencido'};
  return {key:'pending',label:'Pendiente'};
}
/* Tarjeta "Pendientes" del panel: cuánto te deben y cuánto debes, y lo que vence pronto.
   Antes era una gráfica de barras apiladas con conteos; esto se lee de un vistazo. */
function renderPendChart(){
  const box=document.getElementById('pendBox'); if(!box)return;
  const today=ymd(sod(new Date()));
  const open=S.pendings.filter(function(p){return pendStatus(p).key!=='completed';});
  const done=S.pendings.length-open.length;
  let cobrar=0,pagar=0,nC=0,nP=0,venc=0;
  open.forEach(function(p){
    if(p.kind==='Income'){cobrar+=+p.amount||0;nC++;}else{pagar+=+p.amount||0;nP++;}
    if(pendStatus(p).key==='overdue')venc++;
  });
  document.getElementById('pendCaption').textContent=!S.pendings.length?'sin pendientes'
    :(venc?(venc===1?'1 vencido':venc+' vencidos'):(open.length?'al día':'todo completado'));
  if(!S.pendings.length){
    box.innerHTML='<div class="pb-empty">'+ICON.pending+'<p>Sin pendientes por ahora</p>'+
      '<button type="button" class="btn-ghost pb-add">Agregar pendiente</button></div>';
    box.querySelector('.pb-add').onclick=function(){if(typeof openPendModal==='function')openPendModal();};
    return;
  }
  function tile(kind,label,total,n){
    return '<div class="pb-tile '+kind+'"><span class="pb-ico">'+(kind==='in'?ICON.arrowDown:ICON.arrowUp)+'</span>'+
      '<span class="pb-k">'+label+'</span><span class="pb-v">'+money(total)+'</span>'+
      '<span class="pb-n">'+(n===1?'1 pendiente':n+' pendientes')+'</span></div>';
  }
  function cuando(d){
    if(!d)return {t:'Sin fecha',c:''};
    const diff=Math.round((parseYMD(d)-parseYMD(today))/864e5);
    if(diff<0)return {t:'Venció hace '+(-diff)+(diff===-1?' día':' días'),c:'late'};
    if(diff===0)return {t:'Vence hoy',c:'soon'};
    if(diff===1)return {t:'Vence mañana',c:'soon'};
    return {t:'En '+diff+' días',c:diff<=7?'soon':''};
  }
  const next=open.slice().sort(function(a,b){return (a.dueDate||'9999')<(b.dueDate||'9999')?-1:1;}).slice(0,3);
  const pct=S.pendings.length?Math.round(done/S.pendings.length*100):0;
  box.innerHTML=
    '<div class="pb-tiles">'+tile('in','Por cobrar',cobrar,nC)+tile('out','Por pagar',pagar,nP)+'</div>'+
    '<div class="pb-prog"><div class="pb-prog-row"><span>Completados</span><span>'+done+' de '+S.pendings.length+'</span></div>'+
      '<div class="bbar"><span class="bbar-fill ok" style="width:'+pct+'%"></span></div></div>'+
    (next.length?'<ul class="pb-list">'+next.map(function(p){
      const w=cuando(p.dueDate), col=safeColor(p.color);
      return '<li><button type="button" class="pb-item" data-id="'+esc(p.id)+'">'+
        '<span class="hr-ava" style="background:'+col+'22;color:'+col+'">'+catIcon(p.category,p.kind)+'</span>'+
        '<span class="pb-main"><span class="pb-name">'+esc(p.category||'(sin categoría)')+'</span>'+
        '<span class="pb-when '+w.c+'">'+w.t+'</span></span>'+
        '<span class="pb-amt '+(p.kind==='Income'?'in':'out')+'">'+(p.kind==='Income'?'+':'−')+money(p.amount)+'</span></button></li>';
    }).join('')+'</ul>':'<p class="pb-ok">'+ICON.check+' Todo al día</p>')+
    '<button type="button" class="pb-all">Ver todos los pendientes</button>';
  box.querySelector('.pb-all').onclick=function(){goToView('pending');};
  box.querySelectorAll('.pb-item').forEach(function(b){b.onclick=function(){openPendModal(b.dataset.id);};});
}
function countOf(list,type){const n=list.filter(function(t){return t.type===type;}).length;return n+' '+(n===1?'movimiento':'movimientos');}
function setSub(key,txt){const el=document.querySelector('[data-kpi-sub="'+key+'"]');if(el)el.textContent=txt;}
function countUp(key,to){
  const el=document.querySelector('[data-kpi="'+key+'"]');
  if(!el)return;
  const had=(key in S._kpiPrev);
  const from=S._kpiPrev[key]||0; S._kpiPrev[key]=to;
  // Destello de color cuando el valor cambia (no en la primera carga)
  if(had && Math.round(to)!==Math.round(from)){
    el.classList.remove('kpi-up','kpi-down'); void el.offsetWidth;
    el.classList.add(to>=from?'kpi-up':'kpi-down');
    setTimeout(function(){el.classList.remove('kpi-up','kpi-down');},800);
  }
  setLen_(el,to);
  if(key==='balance'){writeTicker(el,to);}else{animateMoney(el,from,to);}
}
/* Conteo del valor (texto, barato). */
/* Largo de la cifra final (en "caracteres") para que el CSS ajuste el tamaño y no se salga */
function setLen_(el,n){
  if(!el)return;
  const txt=nf_().format(Math.abs(Math.round(n||0)));
  const seps=(txt.match(/[.,\s]/g)||[]).length;
  el.style.setProperty('--len',String((txt.length-seps)+seps*.5+(String(S.settings.currencySymbol||'').length*.7)+(n<0?.6:0)+.4));
}
function animateMoney(el,from,to){
  if(!el)return;
  setLen_(el,to);
  if(Math.round(from)===Math.round(to)){writeMoney(el,to);return;}
  const dur=800,t0=performance.now();
  // max(0,…): el primer cuadro puede traer una marca de tiempo anterior a t0; sin esto el avance sale
  // negativo y la curva dispara la cifra a valores absurdos (y nunca termina).
  function step(now){const p=Math.max(0,Math.min((now-t0)/dur,1)),e=1-Math.pow(1-p,3);writeMoney(el,from+(to-from)*e);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
/* Animación de entrada de las gráficas: 100% GPU (opacity + transform), escalonada. Fluida. */
function pulseChart(c,kind,seq){
  if(window._noChartPulse)return; // al cambiar de tema no se repite la animación de entrada
  if(!c)return;
  c.style.animation='none'; void c.offsetWidth;
  var delay=((seq||0)*160)+'ms';
  c.style.animation=(kind==='bars'?'chartPopBars':'chartPopDonut')+' .7s var(--ease) '+delay+' both';
}
var _tipShown=false, _tipChart=null;
/* Oculta el tooltip y limpia el estado de tooltip de las gráficas (excepto la indicada). */
function clearChartTipState(exceptCanvas){
  Object.keys(S.charts||{}).forEach(function(k){
    var ch=S.charts[k]; if(!ch||ch.canvas===exceptCanvas)return;
    try{ ch.setActiveElements([]); if(ch.tooltip)ch.tooltip.setActiveElements([],{x:0,y:0}); }catch(e){}
  });
}
function hideChartTip(){
  var tip=document.getElementById('chartTip'); if(tip)tip.classList.remove('show'); _tipShown=false; _tipChart=null;
}
/* Cierra el tooltip al hacer scroll. */
function onScrollDismissTip(){ if(_tipShown){hideChartTip(); clearChartTipState(null);} }
/* Al tocar otra gráfica, limpia el estado de las demás para que no peleen por el tooltip;
   al tocar fuera de cualquier gráfica, cierra el tooltip. */
function onPointerDownDismissTip(e){
  if(!_tipShown)return;
  var onChart = e.target && e.target.tagName==='CANVAS';
  clearChartTipState(onChart?e.target:null);
  if(!onChart)hideChartTip();
}
/* Tooltip HTML superpuesto para las gráficas: fondo opaco, por encima de todo (no se mezcla),
   y con una animación suave de aparición (la única animación de las gráficas). */
function externalChartTooltip(context){
  var tip=document.getElementById('chartTip');
  if(!tip){tip=document.createElement('div');tip.id='chartTip';tip.className='chart-tip';document.body.appendChild(tip);}
  var tt=context.tooltip;
  if(!tt||tt.opacity===0){tip.classList.remove('show'); _tipShown=false; _tipChart=null; return;}
  var wasShown=tip.classList.contains('show');
  var title=(tt.title||[]).join(' ');
  var body=(tt.body||[]).map(function(b){return b.lines.join(' ');});
  var colors=tt.labelColors||[];
  var html=title?('<div class="ct-title">'+esc(title)+'</div>'):'';
  body.forEach(function(line,i){
    var bg=colors[i]&&colors[i].backgroundColor;
    var dot=(typeof bg==='string')?('<span class="ct-dot" style="background:'+bg+'"></span>'):'';
    html+='<div class="ct-row">'+dot+'<span>'+esc(line.trim())+'</span></div>';
  });
  var changed=(tip._html!==html);
  tip.innerHTML=html; tip._html=html;
  var rect=context.chart.canvas.getBoundingClientRect();
  var tw=tip.offsetWidth, th=tip.offsetHeight, pad=8;
  var left=rect.left+tt.caretX-tw/2, top=rect.top+tt.caretY-th-12;
  if(left<pad)left=pad; if(left+tw>window.innerWidth-pad)left=window.innerWidth-pad-tw;
  if(top<pad)top=rect.top+tt.caretY+16;
  var sameChart=(_tipChart===context.chart); _tipChart=context.chart;
  if(sameChart && wasShown){
    // Mismo gráfico, otro segmento → se desliza
    tip.style.transition='left .2s var(--ease), top .2s var(--ease), opacity .16s var(--ease)';
    tip.style.left=left+'px'; tip.style.top=top+'px';
    if(changed){ tip.style.animation='none'; void tip.offsetWidth; tip.style.animation='ctBump .22s var(--ease)'; }
  }else{
    // Primera vez o GRÁFICO DISTINTO → aparece con animación (fade + pop) en el nuevo lugar
    tip.style.transition='';
    tip.style.left=left+'px'; tip.style.top=top+'px';
    tip.style.animation='none'; void tip.offsetWidth; tip.style.animation='ctAppear .24s var(--ease)';
  }
  tip.classList.add('show'); _tipShown=true;
}
function renderDonut(type){
  // Solo categorías con monto positivo (un retiro de meta es ahorro negativo y no se grafica)
  const list=periodTx(), data=breakdown(list,type).filter(function(d){return d.amount>0;}), total=data.reduce(function(a,d){return a+d.amount;},0);
  document.querySelector('[data-donut-total="'+type+'"]').textContent=money(total);
  const center=document.querySelector('[data-donut-center="'+type+'"]');
  // Número central con conteo animado (igual que los KPIs)
  center.innerHTML='<div class="dc-top">'+tipoES(type)+'</div><div class="dc-val"></div>';
  animateMoney(center.querySelector('.dc-val'), S._donutPrev[type]||0, total); S._donutPrev[type]=total;
  const legend=document.querySelector('[data-legend="'+type+'"]'), canvas=document.querySelector('[data-donut="'+type+'"]');
  if(!data.length){if(S.charts[type]){S.charts[type].destroy();S.charts[type]=null;}legend.innerHTML='<li class="empty">'+TXT.sinDatos+'</li>';const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);return;}
  // Con una sola categoría (100%) el anillo va completo, sin muesca
  const single=data.length<=1;
  // Versión ligera (sin bordes redondeados ni separación, que era lo pesado al animar)
  // Porción mínima visible: montos muy pequeños se dibujan con un mínimo del 3.5%
  // del anillo para que no desaparezcan; el tooltip y la leyenda muestran el monto real.
  const MINSLICE=0.035;
  const ds={data:data.map(function(d){return single?d.amount:Math.max(d.amount,total*MINSLICE);}),backgroundColor:data.map(function(d){return d.color;}),borderColor:tcol('--surface'),borderWidth:single?0:2,hoverOffset:0};
  // Se dibuja el canvas AL INSTANTE (sin animación de Chart.js = cero repintado por frame).
  // La animación de entrada es 100% GPU (opacity + transform) vía pulseChart → sin tirones.
  const seq=({Expense:0,Income:1,Savings:2})[type]||0;
  const tipLabel=function(c){const real=data[c.dataIndex]?data[c.dataIndex].amount:c.parsed;const raw=total?real/total*100:0;const pct=(raw>0&&raw<1)?'<1':Math.round(raw);return ' '+c.label+': '+money(real)+' ('+pct+'%)';};
  const prev=S.charts[type];
  if(prev&&prev.canvas===canvas){
    prev.data.labels=data.map(function(d){return d.name;});
    prev.data.datasets[0]=ds;
    prev.options.plugins.tooltip.callbacks.label=tipLabel;
    prev.update('none');
  }else{
  if(prev)prev.destroy();
  S.charts[type]=new Chart(canvas,{
    type:'doughnut',
    data:{labels:data.map(function(d){return d.name;}),datasets:[ds]},
    options:{cutout:'74%',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:tipLabel}}},
      animation:false}
  });
  }
  pulseChart(canvas,'donut',seq);
  legend.innerHTML=data.map(function(d,i){const raw=total?d.amount/total*100:0;const pct=(raw>0&&raw<1)?'<1':Math.round(raw);
    return '<li style="animation-delay:'+(i*40)+'ms"><span class="lg-dot" style="background:'+safeColor(d.color)+'"></span><span class="lg-name">'+esc(d.name)+'</span><span class="lg-pct">'+pct+'%</span><span class="lg-amt">'+money(d.amount)+'</span></li>';}).join('');
}
function renderTrend(){
  const ref=S.ref, period=S.period;
  const canvas=document.getElementById('trendChart');

  // ── DÍA: una barra por tipo (Ingresos/Gastos/Ahorro), siempre centrado ──
  if(period==='day'){
    document.getElementById('trendCaption').textContent='este día · '+DOW[ref.getDay()]+' '+ref.getDate()+' '+MON[ref.getMonth()];
    const b={start:sod(ref),end:sod(ref)};
    const list=allMovements().filter(function(t){return inBounds(t,b);});
    const vals=[sumType(list,'Income'),sumType(list,'Expense'),sumType(list,'Savings')];
    if(S.charts.trend && S._trendMode==='day'){
      // Morph suave: misma estructura, solo cambian los valores
      S.charts.trend.data.labels=['Ingresos','Gastos','Ahorro'];
      S.charts.trend.data.datasets[0].data=vals;
      S.charts.trend.update('none');
    }else{
      if(S.charts.trend)S.charts.trend.destroy();
      S.charts.trend=new Chart(canvas,{
        type:'bar',
        data:{labels:['Ingresos','Gastos','Ahorro'],datasets:[{data:vals,backgroundColor:function(c){var cols=[tcol('--pos'),tcol('--neg'),tcol('--sav')];return barGrad(c,cols[c.dataIndex]||cols[0]);},borderRadius:6,maxBarThickness:64,minBarLength:6}]},
        options:{responsive:true,maintainAspectRatio:false,
          categoryPercentage:0.6,barPercentage:0.8,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+c.label+': '+money(c.parsed.y);}}}},
          scales:{x:{grid:{display:false},border:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{callback:function(v){return compact(v);}}}},
          animation:false}
      });
      S._trendMode='day';
    }
    pulseChart(canvas,'bars'); // dibujado por CSS (crece desde abajo)
    return;
  }

  // ── SEMANA / MES / AÑO: barras agrupadas por bucket ──
  const labels=[],inc=[],exp=[],sav=[]; let caption='';
  const MOV=allMovements();
  function bucket(label,start,end){
    const b={start:start,end:end};
    const list=MOV.filter(function(t){return inBounds(t,b);});
    labels.push(label); inc.push(sumType(list,'Income')); exp.push(sumType(list,'Expense')); sav.push(sumType(list,'Savings'));
  }
  if(period==='week'){
    caption='los 7 días de esta semana (lun–dom)';
    const mon=mondayOf(ref);
    for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);bucket(DOW[d.getDay()]+' '+d.getDate(), sod(d), sod(d));}
  }else if(period==='month'){
    caption='las 4 semanas de '+capFirst(MESES[ref.getMonth()]);
    const y=ref.getFullYear(), m=ref.getMonth(), dim=new Date(y,m+1,0).getDate();
    [[1,7],[8,14],[15,21],[22,dim]].forEach(function(r,i){bucket('Sem '+(i+1), new Date(y,m,r[0]), new Date(y,m,r[1]));});
  }else{
    caption='los 12 meses de '+ref.getFullYear();
    const y=ref.getFullYear();
    for(let mo=0;mo<12;mo++)bucket(MON[mo], new Date(y,mo,1), new Date(y,mo+1,0));
  }
  document.getElementById('trendCaption').textContent=caption;
  if(S.charts.trend && S._trendMode==='grouped'){
    // Morph suave entre semana/mes/año: misma estructura (3 series), solo cambian datos y etiquetas
    const ch=S.charts.trend;
    ch.data.labels=labels;
    ch.data.datasets[0].data=inc; ch.data.datasets[1].data=exp; ch.data.datasets[2].data=sav;
    ch.update('none'); pulseChart(canvas,'bars');
    return;
  }
  if(S.charts.trend)S.charts.trend.destroy();
  S._trendMode='grouped';
  S.charts.trend=new Chart(canvas,{
    type:'bar',
    data:{labels:labels,datasets:[
      {label:'Ingresos',data:inc,backgroundColor:function(c){return barGrad(c,tcol('--pos'));},borderRadius:6,maxBarThickness:30,minBarLength:4},
      {label:'Gastos',data:exp,backgroundColor:function(c){return barGrad(c,tcol('--neg'));},borderRadius:6,maxBarThickness:30,minBarLength:4},
      {label:'Ahorro',data:sav,backgroundColor:function(c){return barGrad(c,tcol('--sav'));},borderRadius:6,maxBarThickness:30,minBarLength:4}]},
    options:{responsive:true,maintainAspectRatio:false,
      categoryPercentage:0.8,barPercentage:0.92,
      plugins:{legend:{display:true,labels:{usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:16,
        color:tcol('--ink-2'),
        generateLabels:function(chart){var cols=[tcol('--pos'),tcol('--neg'),tcol('--sav')];return chart.data.datasets.map(function(ds,i){return {text:ds.label,fillStyle:cols[i],strokeStyle:cols[i],lineWidth:0,pointStyle:'circle',fontColor:tcol('--ink-2'),datasetIndex:i,hidden:!chart.isDatasetVisible(i)};});}}},tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+money(c.parsed.y);}}}},
      scales:{x:{grid:{display:false},border:{display:false},offset:true},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{callback:function(v){return compact(v);}}}},
      animation:false}
  });
  pulseChart(canvas,'bars'); // dibujado por CSS (crece desde abajo)
}
function compact(v){const a=Math.abs(v);if(a>=1e6)return (v/1e6).toFixed(1)+'M';if(a>=1e3)return Math.round(v/1e3)+'k';return v;}
function hexToRgba(hex,a){hex=String(hex).replace('#','');return 'rgba('+parseInt(hex.slice(0,2),16)+','+parseInt(hex.slice(2,4),16)+','+parseInt(hex.slice(4,6),16)+','+a+')';}
/* Gradiente vertical para barras: color sólido arriba → translúcido abajo (look premium).
   Se cachea por gráfica+color+alto: crearlo en cada frame trababa la animación. */
function barGrad(ctx,hex){
  const ch=ctx.chart,area=ch.chartArea; if(!area)return hex;
  const h=Math.round(area.bottom-area.top);
  const cache=ch._gradCache||(ch._gradCache={});
  const key=hex+'@'+h;
  if(cache[key])return cache[key];
  const g=ch.ctx.createLinearGradient(0,area.top,0,area.bottom);
  g.addColorStop(0,hexToRgba(hex,1));g.addColorStop(1,hexToRgba(hex,.40));
  cache[key]=g;
  return g;
}
