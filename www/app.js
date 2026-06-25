/*****************************************************************************************
 * CONTROL FINANZAS MS — cliente
 * Toda la agregación y los gráficos se calculan aquí (cliente) para que sea rápido.
 * El servidor (Supabase, vía db.js) sólo se usa para: carga inicial, agregar/borrar
 * movimiento, categorías, y guardar pendientes/presupuestos/metas/recurrencias.
 *
 * NOTA: la función gs() y el arranque automático viven ahora en db.js.
 *****************************************************************************************/

const APP_NAME='Control Finanzas MS';
const TXT={guardado:'Guardado',eliminado:'Eliminado',errGuardar:'No se pudo guardar — reintenta',
  errBorrar:'No se pudo eliminar',sinDatos:'Sin datos en este periodo'};

// Paletas por tipo (respaldo si el servidor no las envía)
const PALETTES_FALLBACK={
  Income:  ['#10B981','#059669','#047857','#065F46','#14B8A6','#0891B2','#06B6D4','#0ea5e9'],
  Expense: ['#EF4444','#DC2626','#B91C1C','#F43F5E','#F97316','#FB923C','#F59E0B','#FBBF24'],
  Savings: ['#8B5CF6','#7C3AED','#6D28D9','#4F46E5','#6366F1','#3B82F6','#60A5FA','#93C5FD']
};

const S={
  transactions:[], categories:{Income:[],Expense:[],Savings:[]}, pendings:[],
  budgets:[], recurring:[], goals:[],
  settings:{currencySymbol:'$',locale:'es-CO',decimals:0,palette:[]},
  palettes:PALETTES_FALLBACK,
  period:'month', ref:new Date(), view:'dashboard', histGrain:'day', pendFilter:'all',
  charts:{}, _kpiPrev:{income:0,expense:0,savings:0,balance:0},
  modal:{id:null,type:null,color:null,source:'Salary',category:null}, exportScope:'current',
  pend:{id:null,kind:'Income',category:null,color:null},
  editCat:{type:null,oldName:null,newName:null,color:null},
  recur:{id:null,type:'Expense',category:null,color:null,source:''},
  goal:{id:null,color:'#8B5CF6'},
  confirmCb:null,
  histSearch:'', histType:'all'
};

const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MON=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DOW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const PLUR={day:'días',week:'semanas',month:'meses',year:'años'};
function tipoES(t){return ({Income:'Ingreso',Expense:'Gasto',Savings:'Ahorro'})[t]||t;}
function capFirst(s){return s.charAt(0).toUpperCase()+s.slice(1);}
// Devuelve la paleta de colores para un tipo dado
function paletteFor(type){return (S.palettes&&S.palettes[type])||PALETTES_FALLBACK[type]||PALETTES_FALLBACK.Expense;}

/* ── Formato ── */
function money(n){
  const v=Math.round(n||0);
  const nf=new Intl.NumberFormat(S.settings.locale||'es-CO',{maximumFractionDigits:S.settings.decimals||0});
  return (v<0?'-':'')+S.settings.currencySymbol+' '+nf.format(Math.abs(v));
}
function groupDigits(str){const d=String(str).replace(/\D/g,'');if(!d)return '';return new Intl.NumberFormat(S.settings.locale||'es-CO').format(parseInt(d,10));}

/* ── Fechas ── */
function sod(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function ymd(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function parseYMD(s){const p=String(s).split('-');return new Date(+p[0],(+p[1])-1,+p[2]);}
function mondayOf(d){const x=sod(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}

function periodBounds(ref,period){
  let start,end;
  if(period==='day'){start=sod(ref);end=sod(ref);}
  else if(period==='week'){start=mondayOf(ref);end=new Date(start);end.setDate(start.getDate()+6);}
  else if(period==='month'){start=new Date(ref.getFullYear(),ref.getMonth(),1);end=new Date(ref.getFullYear(),ref.getMonth()+1,0);}
  else{start=new Date(ref.getFullYear(),0,1);end=new Date(ref.getFullYear(),11,31);}
  return {start:start,end:end};
}
function periodLabel(ref,period){
  if(period==='day')return DOW[ref.getDay()]+', '+ref.getDate()+' '+MON[ref.getMonth()]+' '+ref.getFullYear();
  if(period==='week'){const b=periodBounds(ref,'week'),a=b.start,z=b.end;
    const left=a.getDate()+(a.getMonth()!==z.getMonth()?' '+MON[a.getMonth()]:'');
    return left+'–'+z.getDate()+' '+MON[z.getMonth()]+' '+z.getFullYear();}
  if(period==='month')return capFirst(MESES[ref.getMonth()])+' '+ref.getFullYear();
  return String(ref.getFullYear());
}
function shiftRef(ref,period,dir){
  const d=new Date(ref);
  if(period==='day')d.setDate(d.getDate()+dir);
  else if(period==='week')d.setDate(d.getDate()+7*dir);
  else if(period==='month')d.setMonth(d.getMonth()+dir);
  else d.setFullYear(d.getFullYear()+dir);
  return d;
}

/* ── Mini calendario ── */
let calView=null;
function toggleCal(){
  const pop=document.getElementById('calPop');
  if(pop.classList.contains('show')){closeCal();return;}
  calView=new Date(S.ref.getFullYear(),S.ref.getMonth(),1);
  buildCal(); pop.classList.add('show');
  document.getElementById('periodLabel').classList.add('open');
  setTimeout(function(){document.addEventListener('click',calOutside);},0);
}
function closeCal(){
  const pop=document.getElementById('calPop'); if(!pop)return;
  pop.classList.remove('show'); document.getElementById('periodLabel').classList.remove('open');
  document.removeEventListener('click',calOutside);
}
function calOutside(e){const nav=document.querySelector('.period-nav');if(nav&&!nav.contains(e.target))closeCal();}
function calCell(d,other,today,b){
  const sel=ymd(d)===ymd(S.ref), isToday=ymd(d)===ymd(today), inrange=d>=b.start&&d<=b.end&&!sel;
  const cls='cal-day'+(other?' other':'')+(isToday?' today':'')+(sel?' sel':'')+(inrange?' inrange':'');
  return '<div class="'+cls+'" data-d="'+ymd(d)+'">'+d.getDate()+'</div>';
}
function buildCal(){
  const pop=document.getElementById('calPop');
  const y=calView.getFullYear(), m=calView.getMonth();
  const startDow=(new Date(y,m,1).getDay()+6)%7;       // lunes primero
  const dim=new Date(y,m+1,0).getDate();
  const today=sod(new Date()), b=periodBounds(S.ref,S.period);
  let cells='';
  for(let i=0;i<startDow;i++)cells+=calCell(new Date(y,m,1-(startDow-i)),true,today,b);
  for(let d=1;d<=dim;d++)cells+=calCell(new Date(y,m,d),false,today,b);
  const trail=(7-((startDow+dim)%7))%7;
  for(let i=1;i<=trail;i++)cells+=calCell(new Date(y,m+1,i),true,today,b);
  const dows=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(x){return '<div class="cal-dow">'+x+'</div>';}).join('');
  pop.innerHTML=
    '<div class="cal-head">'+
      '<div class="cal-navs"><button class="cal-nav" data-cal="py" title="Año anterior">«</button><button class="cal-nav" data-cal="pm" title="Mes anterior">‹</button></div>'+
      '<div class="cal-title">'+capFirst(MESES[m])+' '+y+'</div>'+
      '<div class="cal-navs"><button class="cal-nav" data-cal="nm" title="Mes siguiente">›</button><button class="cal-nav" data-cal="ny" title="Año siguiente">»</button></div>'+
    '</div>'+
    '<div class="cal-grid">'+dows+cells+'</div>'+
    '<div class="cal-foot"><button class="btn-ghost cal-today-btn">Hoy</button></div>';
  pop.querySelectorAll('[data-cal]').forEach(function(btn){btn.onclick=function(e){e.stopPropagation();
    const a=btn.dataset.cal;
    if(a==='pm')calView.setMonth(calView.getMonth()-1);
    else if(a==='nm')calView.setMonth(calView.getMonth()+1);
    else if(a==='py')calView.setFullYear(calView.getFullYear()-1);
    else calView.setFullYear(calView.getFullYear()+1);
    buildCal();};});
  pop.querySelectorAll('.cal-day').forEach(function(c){c.onclick=function(e){e.stopPropagation();
    S.ref=parseYMD(c.dataset.d); closeCal(); renderAll();};});
  const tb=pop.querySelector('.cal-today-btn');
  if(tb)tb.onclick=function(e){e.stopPropagation();S.ref=new Date();closeCal();renderAll();};
}

/* ── Agregación ── */
function inBounds(tx,b){const d=parseYMD(tx.date);return d>=b.start&&d<=b.end;}
// Movimientos reales = transacciones + pendientes ya completados (cuentan en métricas)
function allMovements(){
  const extra=S.pendings.filter(function(p){return p.status==='completed'&&p.dueDate;}).map(function(p){
    return {id:'pend-'+p.id, _pendId:p.id, _fromPending:true, type:p.kind, category:p.category||'(pendiente)', amount:p.amount, color:p.color, date:p.dueDate, source:'', method:p.method||'', note:p.note};
  });
  return S.transactions.concat(extra);
}
function periodTx(){const b=periodBounds(S.ref,S.period);return allMovements().filter(function(t){return inBounds(t,b);});}
function sumType(list,type){return list.filter(function(t){return t.type===type;}).reduce(function(a,t){return a+t.amount;},0);}
function breakdown(list,type){
  const map={};
  list.filter(function(t){return t.type===type;}).forEach(function(t){
    if(!map[t.category])map[t.category]={name:t.category,color:t.color,amount:0};
    map[t.category].amount+=t.amount; if(t.color)map[t.category].color=t.color;
  });
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.amount-a.amount;});
}

/* Gasto pagado desde el ahorro (source === 'Savings') */
function isFromSavings(t){return t.type==='Expense'&&t.source==='Savings';}
function fromSavingsSum(list){return list.filter(isFromSavings).reduce(function(a,t){return a+t.amount;},0);}
/* Ahorro neto del periodo = aportes − lo gastado desde el ahorro */
function savingsNet(list){return sumType(list,'Savings')-fromSavingsSum(list);}
/* Disponible global y estático = todo el dinero que tienes (ingresos − gastos, histórico) */
function globalDisponible(){const all=allMovements();return sumType(all,'Income')-sumType(all,'Expense');}

/* ── Arranque (lo llama db.js después del login) ── */
async function init(){
  try{
    const data=await gs('getInitialData');
    S.transactions=data.transactions||[];
    S.categories=data.categories||S.categories;
    S.settings=data.settings||S.settings;
    S.pendings=data.pendings||[];
    S.budgets=data.budgets||[];
    S.recurring=data.recurring||[];
    S.goals=data.goals||[];
    S.palettes=data.palettes||PALETTES_FALLBACK;     // paletas por tipo
    if(window.Chart){Chart.defaults.color='#8a97b8';Chart.defaults.font.family="'Inter',sans-serif";Chart.defaults.font.size=12;}
    wireUI(); renderAll();
  }catch(e){
    document.getElementById('boot').innerHTML='<div class="boot-sub">No se pudo cargar: '+(e&&e.message?e.message:e)+'</div>';
    return;
  }
  const boot=document.getElementById('boot');
  boot.classList.add('gone'); setTimeout(function(){boot.style.display='none';},520);
  document.getElementById('app').classList.remove('hidden');
}

/* ── Conexiones de UI ── */
function wireUI(){
  document.getElementById('periodSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('periodSeg',b);S.period=b.dataset.period;renderAll();});
  document.getElementById('prevPeriod').onclick=function(){S.ref=shiftRef(S.ref,S.period,-1);renderAll();};
  document.getElementById('nextPeriod').onclick=function(){S.ref=shiftRef(S.ref,S.period,1);renderAll();};
  document.getElementById('periodLabel').onclick=function(e){e.stopPropagation();toggleCal();};
  document.querySelector('.viewtabs').addEventListener('click',function(e){const b=e.target.closest('.vtab');if(!b)return;switchView(b.dataset.view,b);});
  document.getElementById('historySeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('historySeg',b);S.histGrain=b.dataset.grain;renderHistory();});

  document.getElementById('addBtn').onclick=openActionMenu;
  document.getElementById('actionBackdrop').addEventListener('click',function(e){
    if(e.target.id==='actionBackdrop')closeActionMenu();
    const opt=e.target.closest('.action-opt'); if(opt){closeActionMenu();if(opt.dataset.type==='Pending')openPendModal();else openModal(opt.dataset.type);}
  });

  document.getElementById('modalClose').onclick=closeModal;
  document.getElementById('cancelBtn').onclick=closeModal;
  document.getElementById('modalBackdrop').addEventListener('click',function(e){if(e.target.id==='modalBackdrop')closeModal();});
  document.getElementById('saveBtn').onclick=saveTx;
  document.getElementById('amountInput').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('sourceSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('sourceSeg',b);S.modal.source=b.dataset.source;
    document.getElementById('sourceHint').textContent=b.dataset.source==='Salary'?'Se descuenta de tu saldo de salario.':'Proviene de otra fuente de fondos.';});
  document.getElementById('newCatSave').onclick=onNewCategoryInModal;
  document.getElementById('chipRow').addEventListener('click',function(e){
    const add=e.target.closest('.add-chip');
    if(add){document.getElementById('newCatRow').classList.toggle('show');document.getElementById('newCatInput').focus();return;}
    const chip=e.target.closest('.chip'); if(chip)selectChip(chip);
  });
  document.getElementById('swatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.modal.color=s.dataset.color;markSwatch('swatchRow',S.modal.color);});

  // Export
  document.getElementById('exportBtn').onclick=openExport;
  document.getElementById('exportClose').onclick=closeExport;
  document.getElementById('exportBackdrop').addEventListener('click',function(e){if(e.target.id==='exportBackdrop')closeExport();});
  document.getElementById('scopeSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('scopeSeg',b);S.exportScope=b.dataset.scope;
    document.getElementById('rangeRow').classList.toggle('show',b.dataset.scope==='range');
    const h={current:'Exporta el periodo que ves ahora en el panel.',range:'Elige las fechas de inicio y fin.',all:'Exporta absolutamente todos los movimientos.'};
    document.getElementById('scopeHint').textContent=h[b.dataset.scope];});
  document.getElementById('btnXlsx').onclick=function(){runExport('excel',this);};
  document.getElementById('btnPdf').onclick=function(){runExport('pdf',this);};

  // Notificaciones
  document.getElementById('notifyBtn').onclick=openNotify;
  document.getElementById('notifyClose').onclick=closeNotify;
  document.getElementById('notifyBackdrop').addEventListener('click',function(e){if(e.target.id==='notifyBackdrop')closeNotify();});
  document.getElementById('notifySave').onclick=saveNotify;
  document.getElementById('notifyTest').onclick=testNotify;

  // Pendientes
  document.getElementById('pendSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('pendSeg',b);S.pendFilter=b.dataset.pf;renderPending();});
  document.getElementById('pendClose').onclick=closePendModal;
  document.getElementById('pendCancel').onclick=closePendModal;
  document.getElementById('pendBackdrop').addEventListener('click',function(e){if(e.target.id==='pendBackdrop')closePendModal();});
  document.getElementById('pendSave').onclick=savePending;
  document.getElementById('pendAmount').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('pendKindSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('pendKindSeg',b);S.pend.kind=b.dataset.kind;buildPendChips(S.pend.kind,null);buildPendSwatches();
    const first=S.categories[S.pend.kind][0];S.pend.color=first?first.color:(paletteFor(S.pend.kind)[0]||'#F59E0B');markSwatch('pendSwatchRow',S.pend.color);});
  document.getElementById('pendNewCatSave').onclick=onNewPendCategory;
  document.getElementById('pendChipRow').addEventListener('click',function(e){
    const add=e.target.closest('.add-chip');
    if(add){document.getElementById('pendNewCatRow').classList.toggle('show');document.getElementById('pendNewCatInput').focus();return;}
    const chip=e.target.closest('.chip'); if(chip)selectPendChip(chip);
  });
  document.getElementById('pendSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.pend.color=s.dataset.color;markSwatch('pendSwatchRow',S.pend.color);});

  // Editar categoría (modal)
  document.getElementById('editCatClose').onclick=closeEditCat;
  document.getElementById('editCatCancel').onclick=closeEditCat;
  document.getElementById('editCatBackdrop').addEventListener('click',function(e){if(e.target.id==='editCatBackdrop')closeEditCat();});
  document.getElementById('editCatSave').onclick=saveEditCat;
  document.getElementById('editCatName').addEventListener('input',function(e){S.editCat.newName=e.target.value;updateEditCatPreview();});
  document.getElementById('editCatSwatches').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.editCat.color=s.dataset.color;markSwatch('editCatSwatches',S.editCat.color);updateEditCatPreview();});

  // Búsqueda / filtro en historial
  const hs=document.getElementById('histSearch');
  if(hs)hs.addEventListener('input',function(e){S.histSearch=e.target.value;renderHistory();});
  const htf=document.getElementById('histTypeSeg');
  if(htf)htf.addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('histTypeSeg',b);S.histType=b.dataset.ht;renderHistory();});

  // Confirmación reutilizable
  document.getElementById('confirmCancel').onclick=closeConfirm;
  document.getElementById('confirmBackdrop').addEventListener('click',function(e){if(e.target.id==='confirmBackdrop')closeConfirm();});
  document.getElementById('confirmOk').onclick=function(){const cb=S.confirmCb;closeConfirm();if(cb)cb();};

  // Ajustes
  document.getElementById('settingsBtn').onclick=openSettings;
  document.getElementById('settingsClose').onclick=closeSettings;
  document.getElementById('settingsBackdrop').addEventListener('click',function(e){if(e.target.id==='settingsBackdrop')closeSettings();});
  document.getElementById('settingsSave').onclick=saveSettings;

  // Recurrencias (modal)
  document.getElementById('recurClose').onclick=closeRecurModal;
  document.getElementById('recurCancel').onclick=closeRecurModal;
  document.getElementById('recurBackdrop').addEventListener('click',function(e){if(e.target.id==='recurBackdrop')closeRecurModal();});
  document.getElementById('recurSave').onclick=saveRecur;
  document.getElementById('recurAmount').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('recurKindSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('recurKindSeg',b);S.recur.type=b.dataset.rk;buildRecurChips(S.recur.type,null);buildRecurSwatches();
    const first=S.categories[S.recur.type][0];S.recur.color=first?first.color:(paletteFor(S.recur.type)[0]||'#64748B');markSwatch('recurSwatchRow',S.recur.color);});
  document.getElementById('recurChipRow').addEventListener('click',function(e){const chip=e.target.closest('.chip');if(chip&&!chip.classList.contains('add-chip'))selectRecurChip(chip);});
  document.getElementById('recurSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.recur.color=s.dataset.color;markSwatch('recurSwatchRow',S.recur.color);});

  // Metas (modal)
  document.getElementById('goalClose').onclick=closeGoalModal;
  document.getElementById('goalCancel').onclick=closeGoalModal;
  document.getElementById('goalBackdrop').addEventListener('click',function(e){if(e.target.id==='goalBackdrop')closeGoalModal();});
  document.getElementById('goalSave').onclick=saveGoal;
  document.getElementById('goalTarget').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('goalSaved').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('goalSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.goal.color=s.dataset.color;markSwatch('goalSwatchRow',S.goal.color);});

  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeModal();closeActionMenu();closeExport();closeCal();closePendModal();closeNotify();closeEditCat();closeConfirm();closeSettings();closeRecurModal();closeGoalModal();}});
}
function setSeg(id,btn){document.querySelectorAll('#'+id+' button').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');}

/* ── Confirmación reutilizable ── */
function confirmAction(title,message,okLabel,cb){
  document.getElementById('confirmTitle').textContent=title||'¿Confirmar?';
  document.getElementById('confirmMsg').textContent=message||'';
  document.getElementById('confirmOk').textContent=okLabel||'Confirmar';
  S.confirmCb=cb;
  const bk=document.getElementById('confirmBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
}
function closeConfirm(){const bk=document.getElementById('confirmBackdrop');bk.classList.remove('show');S.confirmCb=null;setTimeout(function(){bk.style.display='none';},250);}

/* ── Vistas ── */
function switchView(view,btn){
  S.view=view;
  document.querySelectorAll('.vtab').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
  ['dashboard','history','pending','categories','budgets','recurring','goals'].forEach(function(v){const el=document.getElementById('view-'+v);if(el)el.classList.toggle('hidden',v!==view);});
  moveTabInk(btn);
  renderCurrentView();
  // Reinicio interno al cambiar de pestaña: volver arriba sin animación para
  // que la nueva vista no quede "pegada" en una posición de scroll vieja.
  try{ window.scrollTo(0,0); }catch(e){ document.documentElement.scrollTop=0; document.body.scrollTop=0; }
}
function renderCurrentView(){
  const v=S.view;
  if(v==='history')renderHistory();
  else if(v==='categories')renderCategories();
  else if(v==='pending')renderPending();
  else if(v==='budgets')renderBudgets();
  else if(v==='recurring')renderRecurring();
  else if(v==='goals')renderGoals();
  else renderDashboard();
}
function moveTabInk(btn){const ink=document.getElementById('vtabInk');ink.style.left=btn.offsetLeft+'px';ink.style.width=btn.offsetWidth+'px';try{btn.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});}catch(e){}}

function renderAll(){
  document.getElementById('periodLabel').textContent=periodLabel(S.ref,S.period);
  renderCurrentView();
  const active=document.querySelector('.vtab.active'); if(active)moveTabInk(active);
}

/* ── Panel ── */
function renderDashboard(){
  const list=periodTx();
  const inc=sumType(list,'Income'),exp=sumType(list,'Expense'),sav=savingsNet(list),bal=globalDisponible();
  countUp('income',inc);countUp('expense',exp);countUp('savings',sav);countUp('balance',bal);
  setSub('income',countOf(list,'Income'));setSub('expense',countOf(list,'Expense'));
  const fs=fromSavingsSum(list);
  setSub('savings',fs>0?('−'+money(fs)+' desde ahorro'):countOf(list,'Savings'));
  renderDeltas(inc,exp,sav);
  ['Expense','Income','Savings'].forEach(renderDonut);
  renderTrend();
  renderPendChart();
}
/* Comparativa contra el mismo periodo anterior (día/semana/mes/año) */
function prevPeriodTx(){
  const prevRef=shiftRef(S.ref,S.period,-1);
  const b=periodBounds(prevRef,S.period);
  return allMovements().filter(function(t){return inBounds(t,b);});
}
function renderDeltas(inc,exp,sav){
  const prev=prevPeriodTx();
  const pInc=sumType(prev,'Income'), pExp=sumType(prev,'Expense'), pSav=savingsNet(prev);
  setDelta('income',inc,pInc,true);
  setDelta('expense',exp,pExp,false);   // en gastos, subir es "malo" → rojo
  setDelta('savings',sav,pSav,true);
}
function setDelta(key,cur,prev,upIsGood){
  const el=document.querySelector('[data-kpi-delta="'+key+'"]');
  if(!el)return;
  if(!prev){ el.textContent=''; el.className='kpi-delta'; return; }
  const pct=Math.round((cur-prev)/Math.abs(prev)*100);
  if(pct===0){ el.textContent='= igual al periodo anterior'; el.className='kpi-delta flat'; return; }
  const up=pct>0;
  const good=upIsGood?up:!up;
  el.textContent=(up?'▲ ':'▼ ')+Math.abs(pct)+'% vs. periodo anterior';
  el.className='kpi-delta '+(good?'good':'bad');
}
function pendStatus(p){
  if(p.status==='completed')return {key:'completed',label:'Completado'};
  if(p.dueDate && p.dueDate < ymd(sod(new Date())))return {key:'overdue',label:'Vencido'};
  return {key:'pending',label:'Pendiente'};
}
function renderPendChart(){
  let incP=0,incV=0,incC=0,payP=0,payV=0,payC=0;
  S.pendings.forEach(function(p){
    const k=pendStatus(p).key, isInc=p.kind==='Income';
    if(k==='completed'){isInc?incC++:payC++;}
    else if(k==='overdue'){isInc?incV++:payV++;}
    else {isInc?incP++:payP++;}
  });
  const totInc=incP+incV+incC, totPay=payP+payV+payC;
  document.getElementById('pendCaption').textContent=(totInc+totPay)===0?'sin pendientes':(totInc+' ingreso(s) · '+totPay+' pago(s)');
  const canvas=document.getElementById('pendChart');
  if(S.charts.pend)S.charts.pend.destroy();
  S.charts.pend=new Chart(canvas,{
    type:'bar',
    data:{labels:['Ingresos','Pagos'],datasets:[
      {label:'Pendiente',data:[incP,payP],backgroundColor:'#F59E0B',borderRadius:5,maxBarThickness:42,stack:'s'},
      {label:'Vencido',data:[incV,payV],backgroundColor:'#EF4444',borderRadius:5,maxBarThickness:42,stack:'s'},
      {label:'Completado',data:[incC,payC],backgroundColor:'#10B981',borderRadius:5,maxBarThickness:42,stack:'s'}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:12}},
        tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+c.parsed.x;}}}},
      scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{precision:0,stepSize:1}},
              y:{stacked:true,grid:{display:false},border:{display:false}}},
      animation:{duration:600,easing:'easeOutQuart'}}
  });
}
function countOf(list,type){const n=list.filter(function(t){return t.type===type;}).length;return n+' '+(n===1?'movimiento':'movimientos');}
function setSub(key,txt){const el=document.querySelector('[data-kpi-sub="'+key+'"]');if(el&&key!=='balance')el.textContent=txt;}
function countUp(key,to){
  const el=document.querySelector('[data-kpi="'+key+'"]');
  const from=S._kpiPrev[key]||0; S._kpiPrev[key]=to;
  const dur=600,t0=performance.now();
  function step(now){const p=Math.min((now-t0)/dur,1),e=1-Math.pow(1-p,3);el.textContent=money(from+(to-from)*e);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
function renderDonut(type){
  const list=periodTx(), data=breakdown(list,type), total=data.reduce(function(a,d){return a+d.amount;},0);
  document.querySelector('[data-donut-total="'+type+'"]').textContent=money(total);
  const center=document.querySelector('[data-donut-center="'+type+'"]');
  center.innerHTML='<div class="dc-top">'+tipoES(type)+'</div><div class="dc-val">'+money(total)+'</div>';
  const legend=document.querySelector('[data-legend="'+type+'"]'), canvas=document.querySelector('[data-donut="'+type+'"]');
  if(S.charts[type]){S.charts[type].destroy();S.charts[type]=null;}
  if(!data.length){legend.innerHTML='<li class="empty">'+TXT.sinDatos+'</li>';const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);return;}
  S.charts[type]=new Chart(canvas,{
    type:'doughnut',
    data:{labels:data.map(function(d){return d.name;}),datasets:[{data:data.map(function(d){return d.amount;}),backgroundColor:data.map(function(d){return d.color;}),borderColor:'#121a2e',borderWidth:3,hoverOffset:6}]},
    options:{cutout:'72%',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){const pct=total?Math.round(c.parsed/total*100):0;return ' '+c.label+': '+money(c.parsed)+' ('+pct+'%)';}}}},
      animation:{animateRotate:true,duration:700,easing:'easeOutQuart'}}
  });
  legend.innerHTML=data.map(function(d,i){const pct=total?Math.round(d.amount/total*100):0;
    return '<li style="animation-delay:'+(i*40)+'ms"><span class="lg-dot" style="background:'+d.color+'"></span><span class="lg-name">'+esc(d.name)+'</span><span class="lg-pct">'+pct+'%</span><span class="lg-amt">'+money(d.amount)+'</span></li>';}).join('');
}
function renderTrend(){
  const ref=S.ref, period=S.period;
  const canvas=document.getElementById('trendChart');
  if(S.charts.trend)S.charts.trend.destroy();

  // ── DÍA: una barra por tipo (Ingresos/Gastos/Ahorro), siempre centrado ──
  if(period==='day'){
    document.getElementById('trendCaption').textContent='este día · '+DOW[ref.getDay()]+' '+ref.getDate()+' '+MON[ref.getMonth()];
    const b={start:sod(ref),end:sod(ref)};
    const list=allMovements().filter(function(t){return inBounds(t,b);});
    const vals=[sumType(list,'Income'),sumType(list,'Expense'),sumType(list,'Savings')];
    S.charts.trend=new Chart(canvas,{
      type:'bar',
      data:{labels:['Ingresos','Gastos','Ahorro'],datasets:[{data:vals,backgroundColor:['#10B981','#F43F5E','#0EA5E9'],borderRadius:6,maxBarThickness:64}]},
      options:{responsive:true,maintainAspectRatio:false,
        categoryPercentage:0.6,barPercentage:0.8,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+c.label+': '+money(c.parsed.y);}}}},
        scales:{x:{grid:{display:false},border:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{callback:function(v){return compact(v);}}}},
        animation:{duration:600,easing:'easeOutQuart'}}
    });
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
  S.charts.trend=new Chart(canvas,{
    type:'bar',
    data:{labels:labels,datasets:[
      {label:'Ingresos',data:inc,backgroundColor:'#10B981',borderRadius:6,maxBarThickness:30},
      {label:'Gastos',data:exp,backgroundColor:'#F43F5E',borderRadius:6,maxBarThickness:30},
      {label:'Ahorro',data:sav,backgroundColor:'#0EA5E9',borderRadius:6,maxBarThickness:30}]},
    options:{responsive:true,maintainAspectRatio:false,
      categoryPercentage:0.8,barPercentage:0.92,
      plugins:{legend:{display:true,labels:{usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:16}},tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+money(c.parsed.y);}}}},
      scales:{x:{grid:{display:false},border:{display:false},offset:true},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{callback:function(v){return compact(v);}}}},
      animation:{duration:650,easing:'easeOutQuart'}}
  });
}
function compact(v){const a=Math.abs(v);if(a>=1e6)return (v/1e6).toFixed(1)+'M';if(a>=1e3)return Math.round(v/1e3)+'k';return v;}

/* ── Historial ── */
function historyItems(){
  const tx=S.transactions.map(function(t){return Object.assign({_real:true},t);});
  const pend=S.pendings.filter(function(p){return p.dueDate;}).map(function(p){
    const st=pendStatus(p);
    return {id:'pend-'+p.id,_pendId:p.id,_fromPending:true,_pendKey:st.key,_pendLabel:st.label,_real:(st.key==='completed'),
      type:p.kind,category:p.category||'(pendiente)',amount:p.amount,color:p.color,date:p.dueDate,source:'',method:p.method||'',note:p.note};
  });
  return tx.concat(pend);
}
function renderHistory(){
  const grain=S.histGrain, wrap=document.getElementById('historyList');
  let MOV=historyItems();
  // filtro por tipo
  if(S.histType&&S.histType!=='all')MOV=MOV.filter(function(t){return t.type===S.histType;});
  // búsqueda por texto (categoría, nota, método)
  const q=(S.histSearch||'').trim().toLowerCase();
  if(q)MOV=MOV.filter(function(t){
    return String(t.category||'').toLowerCase().indexOf(q)>=0
      || String(t.note||'').toLowerCase().indexOf(q)>=0
      || String(t.method||'').toLowerCase().indexOf(q)>=0;
  });
  if(!MOV.length){wrap.innerHTML='<div class="empty">'+(q||S.histType!=='all'?'Sin resultados para este filtro.':TXT.sinDatos)+'</div>';return;}
  const groups={};
  MOV.forEach(function(t){
    const d=parseYMD(t.date); let key;
    if(grain==='day')key=ymd(d);
    else if(grain==='week')key=ymd(mondayOf(d));
    else if(grain==='month')key=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);
    else key=String(d.getFullYear());
    (groups[key]=groups[key]||{items:[]}).items.push(t);
  });
  const keys=Object.keys(groups).sort(function(a,b){return b<a?-1:1;});
  wrap.innerHTML=keys.map(function(k,gi){
    const g=groups[k]; g.items.sort(function(a,b){return (a.date+(a.timestamp||''))<(b.date+(b.timestamp||''))?1:-1;});
    const real=g.items.filter(function(x){return x._real;});
    const inc=sumType(real,'Income'),exp=sumType(real,'Expense'),sav=sumType(real,'Savings'),net=inc-exp-sav;
    let block='<div class="hist-group" style="animation-delay:'+(gi*40)+'ms">';
    block+='<div class="hist-group-head"><span class="hist-group-title">'+histGroupTitle(grain,k)+'</span><span class="hist-group-net" style="color:'+(net>=0?'#10B981':'#F43F5E')+'">'+money(net)+' neto</span></div>';
    if(grain==='year')block+='<div class="year-summary">'+ysCell('Ingresos',inc,'#10B981')+ysCell('Gastos',exp,'#F43F5E')+ysCell('Ahorro',sav,'#0EA5E9')+'</div>';
    else block+='<div class="hist-rows">'+g.items.map(rowHTML).join('')+'</div>';
    block+='</div>'; return block;
  }).join('');
  wrap.querySelectorAll('.hr-del').forEach(function(b){b.onclick=function(){
    if(b.dataset.pend)removePending(b.dataset.pend); else removeTx(b.dataset.id);
  };});
  wrap.querySelectorAll('.hr-edit').forEach(function(b){b.onclick=function(){
    if(b.dataset.pend)openPendModal(b.dataset.pend); else openModal(null,b.dataset.id);
  };});
}
function ysCell(k,v,c){return '<div class="ys-cell"><div class="ys-k">'+k+'</div><div class="ys-v" style="color:'+c+'">'+money(v)+'</div></div>';}
function histGroupTitle(grain,key){
  if(grain==='day'){const d=parseYMD(key);return DOW[d.getDay()]+', '+d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();}
  if(grain==='week'){const d=parseYMD(key),z=new Date(d);z.setDate(d.getDate()+6);return 'Semana del '+d.getDate()+' '+MON[d.getMonth()]+'–'+z.getDate()+' '+MON[z.getMonth()]+' '+z.getFullYear();}
  if(grain==='month'){const p=key.split('-');return capFirst(MESES[(+p[1])-1])+' '+p[0];}
  return key;
}
function rowHTML(t){
  const d=parseYMD(t.date);
  let meta=DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()];
  if(t._fromPending)meta+=' · '+(t.type==='Income'?'por cobrar':'por pagar')+(t.method?' · '+esc(t.method):'');
  if(t.note)meta+=' · '+esc(t.note);
  if(t.source)meta+=' · '+(t.source==='Salary'?'Salario':t.source==='Other'?'Otra fuente':t.source==='Savings'?'desde ahorro':t.source);
  const sign=t.type==='Income'?'+':'−';
  const del=t._fromPending?'data-pend="'+t._pendId+'"':'data-id="'+t.id+'"';
  const rowCls='hist-row'+(t._fromPending?' is-pend':'')+(t._fromPending&&t._pendKey!=='completed'?' is-unrealized':'');
  const statePill=t._fromPending?'<span class="hr-state '+t._pendKey+'">'+t._pendLabel+'</span>':'';
  return '<div class="'+rowCls+'"><span class="hr-dot" style="background:'+t.color+'"></span>'+
    '<div class="hr-main"><span class="hr-cat">'+esc(t.category)+statePill+'</span><span class="hr-meta">'+meta+'</span></div>'+
    '<span class="hr-badge '+t.type+'">'+tipoES(t.type)+'</span>'+
    '<span class="hr-amt '+t.type+'">'+sign+' '+money(t.amount)+'</span>'+
    '<button class="hr-edit" '+del+' title="Editar">✎</button>'+
    '<button class="hr-del" '+del+' title="Eliminar">🗑</button></div>';
}

/* ── Categorías ── */
function renderCategories(){
  const cols=document.getElementById('catCols');
  const meta={Income:'#10B981',Expense:'#F43F5E',Savings:'#0EA5E9'};
  cols.innerHTML=['Income','Expense','Savings'].map(function(type){
    const items=(S.categories[type]||[]).map(function(c,i){
      return '<div class="cat-item" style="animation-delay:'+(i*35)+'ms">'+
        '<span class="cat-swatch" style="background:'+c.color+'"></span>'+
        '<span class="cat-name">'+esc(c.name)+'</span>'+
        '<button class="cat-edit" data-type="'+type+'" data-name="'+esc(c.name)+'" title="Editar">✎</button>'+
        '<button class="cat-del" data-type="'+type+'" data-name="'+esc(c.name)+'" title="Quitar">✕</button>'+
      '</div>';
    }).join('');
    const sws=(paletteFor(type)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');
    return '<div class="cat-col"><h3><span class="hdot" style="background:'+meta[type]+'"></span>'+tipoES(type)+'</h3>'+
      '<div class="cat-list">'+items+'</div>'+
      '<div class="cat-add"><input type="text" placeholder="Nueva categoría de '+tipoES(type).toLowerCase()+'" data-type="'+type+'" maxlength="28"><button class="btn-ghost cat-add-btn" data-type="'+type+'">Agregar</button></div>'+
      '<div class="mini-swatches" data-picker="'+type+'">'+sws+'</div></div>';
  }).join('');
  ['Income','Expense','Savings'].forEach(function(type){const pk=cols.querySelector('[data-picker="'+type+'"]');if(pk&&pk.firstChild)pk.firstChild.classList.add('active');});
  cols.querySelectorAll('.mini-swatches').forEach(function(pk){pk.addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;pk.querySelectorAll('.swatch').forEach(function(x){x.classList.remove('active');});s.classList.add('active');});});
  cols.querySelectorAll('.cat-add-btn').forEach(function(btn){btn.onclick=function(){
    const type=btn.dataset.type, input=cols.querySelector('.cat-add input[data-type="'+type+'"]'), picker=cols.querySelector('[data-picker="'+type+'"] .swatch.active');
    addCategoryFlow(type,input.value,picker?picker.dataset.color:(paletteFor(type)[0]||'#64748B')); input.value='';};});
  cols.querySelectorAll('.cat-edit').forEach(function(b){b.onclick=function(){openEditCat(b.dataset.type,b.dataset.name);};});
  cols.querySelectorAll('.cat-del').forEach(function(b){b.onclick=function(){removeCategory(b.dataset.type,b.dataset.name);};});
}
function addCategoryFlow(type,name,color){
  name=(name||'').trim(); if(!name){toast('Ingresa un nombre','err');return;}
  if((S.categories[type]||[]).some(function(c){return c.name.toLowerCase()===name.toLowerCase();})){toast('Ya existe','info');return;}
  S.categories[type].push({name:name,color:color}); renderCategories();
  gs('addCategory',type,name,color).then(function(){toast('Categoría agregada','ok');})
    .catch(function(){S.categories[type]=S.categories[type].filter(function(c){return c.name!==name;});renderCategories();toast('No se pudo agregar','err');});
}
function removeCategory(type,name){
  const idx=S.categories[type].findIndex(function(c){return c.name===name;}); if(idx<0)return;
  const removed=S.categories[type][idx]; S.categories[type].splice(idx,1); renderCategories();
  gs('deleteCategory',type,name).then(function(){toast('Categoría eliminada','ok');})
    .catch(function(){S.categories[type].splice(idx,0,removed);renderCategories();toast('No se pudo eliminar','err');});
}

/* ── Editar categoría (modal) ── */
function openEditCat(type,name){
  const cat=(S.categories[type]||[]).find(function(c){return c.name===name;});
  if(!cat)return;
  S.editCat={type:type,oldName:name,newName:name,color:cat.color};
  document.getElementById('editCatTitle').textContent='Editar categoría · '+tipoES(type);
  document.getElementById('editCatName').value=name;
  document.getElementById('editCatHint').textContent='Selecciona un color para '+tipoES(type).toLowerCase()+'.';
  // paleta del tipo
  document.getElementById('editCatSwatches').innerHTML=(paletteFor(type)||[]).map(function(col){
    return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';
  }).join('');
  markSwatch('editCatSwatches',cat.color);
  updateEditCatPreview();
  const bk=document.getElementById('editCatBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('editCatName').focus();},250);
}
function closeEditCat(){const bk=document.getElementById('editCatBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function updateEditCatPreview(){
  const dot=document.getElementById('editCatPreviewDot'), nm=document.getElementById('editCatPreviewName');
  if(dot)dot.style.background=S.editCat.color||'#64748B';
  if(nm)nm.textContent=(S.editCat.newName||'').trim()||'(sin nombre)';
}
function saveEditCat(){
  const type=S.editCat.type, oldName=S.editCat.oldName;
  const newName=(document.getElementById('editCatName').value||'').trim();
  const newColor=S.editCat.color||(paletteFor(type)[0]||'#64748B');
  if(!newName){toast('Ingresa un nombre','err');return;}
  if(newName!==oldName && (S.categories[type]||[]).some(function(c){return c.name.toLowerCase()===newName.toLowerCase();})){
    toast('Ya existe una categoría con ese nombre','err');return;
  }
  const idx=(S.categories[type]||[]).findIndex(function(c){return c.name===oldName;});
  if(idx<0)return;
  const prev={name:S.categories[type][idx].name,color:S.categories[type][idx].color};
  // Optimista: actualiza categoría + movimientos locales que la usan
  S.categories[type][idx].name=newName;
  S.categories[type][idx].color=newColor;
  S.transactions.forEach(function(t){if(t.category===oldName){t.category=newName;t.color=newColor;}});
  closeEditCat(); renderCategories(); if(S.view==='dashboard')renderDashboard(); if(S.view==='history')renderHistory();
  gs('updateCategory',type,oldName,newName,newColor).then(function(){toast('Categoría actualizada','ok');})
    .catch(function(){
      S.categories[type][idx].name=prev.name; S.categories[type][idx].color=prev.color;
      S.transactions.forEach(function(t){if(t.category===newName){t.category=prev.name;t.color=prev.color;}});
      renderCategories(); if(S.view==='dashboard')renderDashboard();
      toast('No se pudo guardar los cambios','err');
    });
}

/* ── Pendientes (vista) ── */
function renderPending(){
  const wrap=document.getElementById('pendList');
  let items=S.pendings.slice().sort(function(a,b){return (a.dueDate||'')<(b.dueDate||'')?-1:1;});
  const f=S.pendFilter;
  if(f!=='all')items=items.filter(function(p){return pendStatus(p).key===f;});
  if(!items.length){wrap.innerHTML='<div class="empty">No hay pendientes'+(f!=='all'?' en este filtro':'')+'.</div>';return;}
  wrap.innerHTML=items.map(function(p,i){
    const st=pendStatus(p);
    const fecha=p.dueDate?fechaLarga(p.dueDate):'sin fecha';
    return '<div class="pend-item s-'+st.key+'" style="animation-delay:'+(i*30)+'ms">'+
      '<span class="pend-dot" style="background:'+p.color+'"></span>'+
      '<div class="pend-main">'+
        '<span class="pend-cat">'+esc(p.category||'(sin categoría)')+'<span class="pend-kind '+p.kind+'">'+(p.kind==='Income'?'Ingreso':'Pago')+'</span></span>'+
        '<span class="pend-meta"><span>📅 '+fecha+'</span><span>💳 '+esc(p.method||'—')+'</span>'+(p.note?'<span>📝 '+esc(p.note)+'</span>':'')+'</span>'+
      '</div>'+
      '<span class="pend-amt">'+money(p.amount)+'</span>'+
      '<span class="pend-pill '+st.key+'">'+st.label+'</span>'+
      '<div class="pend-acts">'+
        '<button class="pend-act done" data-act="done" data-id="'+p.id+'" title="'+(p.status==='completed'?'Reabrir':'Marcar completado')+'">'+(p.status==='completed'?'↺':'✓')+'</button>'+
        '<button class="pend-act" data-act="edit" data-id="'+p.id+'" title="Editar">✎</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+p.id+'" title="Eliminar">🗑</button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('.pend-act').forEach(function(b){b.onclick=function(){
    const id=b.dataset.id, act=b.dataset.act;
    if(act==='done')togglePendDone(id); else if(act==='edit')openPendModal(id); else removePending(id);
  };});
}
function fechaLarga(ymdStr){const d=parseYMD(ymdStr);return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();}

function refreshPend(){renderPending();if(S.view==='dashboard')renderDashboard();}

function togglePendDone(id){
  const p=S.pendings.find(function(x){return x.id===id;}); if(!p)return;
  const prev=p.status; p.status=(p.status==='completed'?'pending':'completed');
  refreshPend();
  gs('setPendingStatus',id,p.status==='completed').then(function(){toast(p.status==='completed'?'Marcado completado':'Reabierto','ok');})
    .catch(function(){p.status=prev;refreshPend();toast('No se pudo actualizar','err');});
}
function removePending(id){
  const p=S.pendings.find(function(x){return x.id===id;}); if(!p)return;
  confirmAction('Eliminar pendiente','Vas a eliminar "'+(p.category||'pendiente')+'" por '+money(p.amount)+'. Esta acción no se puede deshacer.','Eliminar',function(){
    const idx=S.pendings.findIndex(function(x){return x.id===id;}); if(idx<0)return;
    const removed=S.pendings[idx]; S.pendings.splice(idx,1);
    refreshPend();
    gs('deletePending',id).then(function(){toast('Pendiente eliminado','ok');})
      .catch(function(){S.pendings.splice(idx,0,removed);refreshPend();toast('No se pudo eliminar','err');});
  });
}

/* ── Modal pendiente ── */
function openPendModal(editId){
  const editing=!!editId;
  let p=editing?S.pendings.find(function(x){return x.id===editId;}):null;
  S.pend.id=editing?editId:null;
  S.pend.kind=p?p.kind:'Income';
  document.getElementById('pendTitle').textContent=editing?'Editar pendiente':'Ingreso / Pago pendiente';
  document.getElementById('pendCur').textContent=S.settings.currencySymbol;
  document.getElementById('pendAmount').value=p?groupDigits(String(p.amount)):'';
  document.getElementById('pendDate').value=p&&p.dueDate?p.dueDate:ymd(new Date());
  document.getElementById('pendMethod').value=p?(p.method||'Transferencia'):'Transferencia';
  document.getElementById('pendNote').value=p?(p.note||''):'';
  document.getElementById('pendDone').checked=p?p.status==='completed':false;
  document.getElementById('pendNewCatRow').classList.remove('show'); document.getElementById('pendNewCatInput').value='';
  document.querySelectorAll('#pendKindSeg button').forEach(function(b){b.classList.toggle('active',b.dataset.kind===S.pend.kind);});
  buildPendSwatches();
  buildPendChips(S.pend.kind, p?p.category:null);
  S.pend.color=p?p.color:(S.categories[S.pend.kind][0]?S.categories[S.pend.kind][0].color:(paletteFor(S.pend.kind)[0]||'#F59E0B'));
  markSwatch('pendSwatchRow',S.pend.color);
  const bk=document.getElementById('pendBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('pendAmount').focus();},250);
}
function closePendModal(){const bk=document.getElementById('pendBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function buildPendChips(kind,selected){
  const row=document.getElementById('pendChipRow'), cats=S.categories[kind]||[];
  row.innerHTML=cats.map(function(c){const on=selected?c.name===selected:false;
    return '<button class="chip'+(on?' active':'')+'" data-name="'+esc(c.name)+'" data-color="'+c.color+'" style="color:'+c.color+'"><span class="chip-dot" style="background:'+c.color+'"></span><span style="color:var(--txt)">'+esc(c.name)+'</span></button>';
  }).join('')+'<button class="chip add-chip"><span class="chip-dot" style="background:currentColor"></span>Nueva</button>';
  S.pend.category=selected||(cats[0]?cats[0].name:null);
  if(!selected&&row.querySelector('.chip:not(.add-chip)'))row.querySelector('.chip:not(.add-chip)').classList.add('active');
}
function buildPendSwatches(){document.getElementById('pendSwatchRow').innerHTML=(paletteFor(S.pend.kind)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');}
function selectPendChip(chip){
  document.querySelectorAll('#pendChipRow .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');
  S.pend.category=chip.dataset.name;
  if(chip.dataset.color){S.pend.color=chip.dataset.color;markSwatch('pendSwatchRow',S.pend.color);}
}
function onNewPendCategory(){
  const input=document.getElementById('pendNewCatInput'), name=(input.value||'').trim(); if(!name){toast('Ingresa un nombre','err');return;}
  const kind=S.pend.kind, color=S.pend.color||(paletteFor(kind)[0]||'#F59E0B');
  if((S.categories[kind]||[]).some(function(c){return c.name.toLowerCase()===name.toLowerCase();})){toast('Ya existe','info');}
  else{S.categories[kind].push({name:name,color:color});gs('addCategory',kind,name,color).catch(function(){toast('Guardado solo localmente','info');});}
  buildPendChips(kind,name);
  document.getElementById('pendNewCatRow').classList.remove('show'); input.value='';
}
function savePending(){
  const amount=parseInt(String(document.getElementById('pendAmount').value).replace(/\D/g,''),10)||0;
  if(amount<=0){toast('Ingresa un monto','err');return;}
  if(!S.pend.category){toast('Elige una categoría','err');return;}
  const date=document.getElementById('pendDate').value;
  if(!date){toast('Elige la fecha acordada','err');return;}
  const p={kind:S.pend.kind, category:S.pend.category, amount:amount, color:S.pend.color||'#F59E0B',
    method:document.getElementById('pendMethod').value, dueDate:date, note:document.getElementById('pendNote').value.trim(),
    status:document.getElementById('pendDone').checked?'completed':'pending'};
  const editId=S.pend.id;
  closePendModal();
  if(editId){
    const idx=S.pendings.findIndex(function(x){return x.id===editId;});
    const prev=S.pendings[idx]; S.pendings[idx]=Object.assign({id:editId},p);
    refreshPend();
    gs('updatePending',editId,p).then(function(){toast('Pendiente actualizado','ok');})
      .catch(function(){S.pendings[idx]=prev;refreshPend();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now()},p);
    S.pendings.push(temp); refreshPend();
    gs('addPending',p).then(function(saved){const i=S.pendings.findIndex(function(x){return x.id===temp.id;});if(i>=0)S.pendings[i]=saved;toast('Pendiente guardado','ok');})
      .catch(function(){S.pendings=S.pendings.filter(function(x){return x.id!==temp.id;});refreshPend();toast('No se pudo guardar','err');});
  }
}

/* ── Menú de acción ── */
function openActionMenu(){const b=document.getElementById('actionBackdrop');b.style.display='flex';requestAnimationFrame(function(){b.classList.add('show');});}
function closeActionMenu(){const b=document.getElementById('actionBackdrop');b.classList.remove('show');setTimeout(function(){b.style.display='none';},250);}

/* ── Modal movimiento (agregar o editar) ──
   openModal(type)            → agregar nuevo de ese tipo
   openModal(null, id)        → editar el movimiento existente con ese id */
function openModal(type,editId){
  const editing=!!editId;
  let tx=null;
  if(editing){
    tx=S.transactions.find(function(t){return t.id===editId;});
    if(!tx)return;
    type=tx.type;
  }
  S.modal.id=editing?editId:null;
  S.modal.type=type; S.modal.source=editing?(tx.source||'Salary'):'Salary';
  document.getElementById('modalTitle').textContent=(editing?'Editar ':'Agregar ')+tipoES(type).toLowerCase();
  document.getElementById('saveBtn').textContent=editing?'Guardar cambios':'Guardar';
  document.getElementById('curSign').textContent=S.settings.currencySymbol;
  document.getElementById('amountInput').value=editing?groupDigits(String(tx.amount)):'';
  document.getElementById('noteInput').value=editing?(tx.note||''):'';
  document.getElementById('dateInput').value=editing?tx.date:ymd(new Date());
  document.getElementById('newCatRow').classList.remove('show'); document.getElementById('newCatInput').value='';
  document.getElementById('sourceRow').classList.toggle('hidden',type!=='Savings');
  document.getElementById('fromSavingsRow').classList.toggle('hidden',type!=='Expense');
  document.getElementById('fromSavings').checked=editing&&tx.source==='Savings';
  const srcVal=(editing&&type==='Savings')?(tx.source==='Other'?'Other':'Salary'):'Salary';
  document.querySelectorAll('#sourceSeg button').forEach(function(b){b.classList.toggle('active',b.dataset.source===srcVal);});
  if(type==='Savings')S.modal.source=srcVal;
  document.getElementById('sourceHint').textContent=srcVal==='Salary'?'Se descuenta de tu saldo de salario.':'Proviene de otra fuente de fondos.';
  setupGoalRow_(type,editing);
  buildChips(type); buildSwatches();
  if(editing){
    S.modal.category=tx.category; S.modal.color=tx.color;
    markChip('chipRow',tx.category); markSwatch('swatchRow',tx.color);
  }else{
    const first=(S.categories[type]||[])[0];
    S.modal.color=first?first.color:(paletteFor(type)[0]||'#4F46E5'); markSwatch('swatchRow',S.modal.color);
  }
  const bk=document.getElementById('modalBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('amountInput').focus();},250);
}
function markChip(rowId,name){const chips=document.querySelectorAll('#'+rowId+' .chip');chips.forEach(function(c){c.classList.toggle('active',c.dataset.name===name);});}
function closeModal(){const bk=document.getElementById('modalBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}

/* ── Meta de ahorro dentro del modal de movimiento ── */
function setupGoalRow_(type, editing){
  const row=document.getElementById('goalRow'); if(!row) return;
  const show=(type==='Savings' && !editing);
  row.classList.toggle('hidden', !show);
  const newRow=document.getElementById('txNewGoalRow'); if(newRow) newRow.classList.add('hidden');
  const nameI=document.getElementById('txNewGoalName'); if(nameI) nameI.value='';
  const tgtI=document.getElementById('txNewGoalTarget'); if(tgtI) tgtI.value='';
  const curEl=document.getElementById('txNewGoalCur'); if(curEl) curEl.textContent=S.settings.currencySymbol;
  if(!show) return;
  const sel=document.getElementById('txGoalSelect');
  let opts='<option value="">Sin meta</option>';
  (S.goals||[]).forEach(function(g){
    opts+='<option value="'+g.id+'">'+esc(g.name)+' ('+money(g.saved)+' / '+money(g.target)+')</option>';
  });
  opts+='<option value="__new__">➕ Crear nueva meta…</option>';
  sel.innerHTML=opts; sel.value='';
  sel.onchange=function(){ document.getElementById('txNewGoalRow').classList.toggle('hidden', sel.value!=='__new__'); };
  if(tgtI && !tgtI._wired){ tgtI._wired=true; tgtI.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);}); }
}
function aplicarMetaAhorro_(metaSel, metaNewName, metaNewTarget, amount){
  if(!metaSel) return;
  if(window.isOffline && window.isOffline()){
    toast('El ahorro se guardó. Asignarlo a una meta requiere conexión.','info'); return;
  }
  if(metaSel==='__new__'){
    const g={name:metaNewName, target:metaNewTarget, saved:amount, color:(paletteFor('Savings')[0]||'#8B5CF6'), note:''};
    const temp=Object.assign({id:'tmp-g'+Date.now()},g);
    S.goals.push(temp); if(S.view==='goals')renderGoals();
    gs('addGoal',g).then(function(saved){const i=S.goals.findIndex(function(x){return x.id===temp.id;});if(i>=0&&saved)S.goals[i]=saved;if(S.view==='goals')renderGoals();toast('Meta creada y aporte sumado','ok');})
      .catch(function(){S.goals=S.goals.filter(function(x){return x.id!==temp.id;});if(S.view==='goals')renderGoals();toast('No se pudo crear la meta','err');});
  }else{
    const g=S.goals.find(function(x){return x.id===metaSel;}); if(!g) return;
    const prev=g.saved; g.saved=Math.max(0,g.saved+amount); if(S.view==='goals')renderGoals();
    gs('contributeGoal',metaSel,amount).then(function(res){if(res&&typeof res.saved==='number'){g.saved=res.saved;if(S.view==='goals')renderGoals();}toast('Aporte sumado a "'+g.name+'"','ok');})
      .catch(function(){g.saved=prev;if(S.view==='goals')renderGoals();toast('No se pudo sumar a la meta','err');});
  }
}
function buildChips(type){
  const row=document.getElementById('chipRow'), cats=S.categories[type]||[];
  row.innerHTML=cats.map(function(c,i){return '<button class="chip'+(i===0?' active':'')+'" data-name="'+esc(c.name)+'" data-color="'+c.color+'" style="color:'+c.color+'"><span class="chip-dot" style="background:'+c.color+'"></span><span style="color:var(--txt)">'+esc(c.name)+'</span></button>';}).join('')+'<button class="chip add-chip"><span class="chip-dot" style="background:currentColor"></span>Nueva</button>';
  S.modal.category=cats.length?cats[0].name:null;
}
function selectChip(chip){
  document.querySelectorAll('#chipRow .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');
  S.modal.category=chip.dataset.name;
  if(chip.dataset.color){S.modal.color=chip.dataset.color;markSwatch('swatchRow',S.modal.color);}
}
function buildSwatches(){document.getElementById('swatchRow').innerHTML=(paletteFor(S.modal.type)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');}
function markSwatch(id,color){document.querySelectorAll('#'+id+' .swatch').forEach(function(s){s.classList.toggle('active',s.dataset.color===color);});}
function onNewCategoryInModal(){
  const input=document.getElementById('newCatInput'), name=(input.value||'').trim(); if(!name){toast('Ingresa un nombre','err');return;}
  const type=S.modal.type, color=S.modal.color||(paletteFor(type)[0]||'#4F46E5');
  if((S.categories[type]||[]).some(function(c){return c.name.toLowerCase()===name.toLowerCase();})){toast('Ya existe','info');}
  else{S.categories[type].push({name:name,color:color});gs('addCategory',type,name,color).catch(function(){toast('Guardado solo localmente','info');});}
  buildChips(type);
  const chips=document.querySelectorAll('#chipRow .chip');
  for(let i=0;i<chips.length;i++){if(chips[i].dataset.name===name){selectChip(chips[i]);break;}}
  document.getElementById('newCatRow').classList.remove('show'); input.value='';
}
function saveTx(){
  const amount=parseInt(String(document.getElementById('amountInput').value).replace(/\D/g,''),10)||0;
  if(amount<=0){toast('Ingresa un monto','err');return;}
  if(!S.modal.category){toast('Elige una categoría','err');return;}
  let metaSel='', metaNewName='', metaNewTarget=0;
  if(S.modal.type==='Savings' && !S.modal.id){
    const selG=document.getElementById('txGoalSelect');
    metaSel=selG?selG.value:'';
    if(metaSel==='__new__'){
      metaNewName=(document.getElementById('txNewGoalName').value||'').trim();
      metaNewTarget=parseInt(String(document.getElementById('txNewGoalTarget').value).replace(/\D/g,''),10)||0;
      if(!metaNewName){toast('Ponle nombre a la meta','err');return;}
      if(metaNewTarget<=0){toast('Define el objetivo de la meta','err');return;}
    }
  }
  const tx={type:S.modal.type,category:S.modal.category,amount:amount,color:S.modal.color||'#64748B',
    note:document.getElementById('noteInput').value.trim(),date:document.getElementById('dateInput').value||ymd(new Date()),
    source:S.modal.type==='Savings'?S.modal.source:(S.modal.type==='Expense'&&document.getElementById('fromSavings').checked?'Savings':'')};
  const editId=S.modal.id;
  closeModal();
  if(editId){
    const idx=S.transactions.findIndex(function(t){return t.id===editId;});
    if(idx<0)return;
    const prev=S.transactions[idx];
    S.transactions[idx]=Object.assign({},prev,tx,{id:editId});
    S.ref=parseYMD(tx.date); renderAll();
    gs('updateTransaction',editId,tx).then(function(){toast('Movimiento actualizado','ok');})
      .catch(function(){S.transactions[idx]=prev;renderAll();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now(),timestamp:new Date().toISOString()},tx);
    S.transactions.push(temp); S.ref=parseYMD(tx.date); renderAll();
    gs('addTransaction',tx).then(function(saved){const i=S.transactions.findIndex(function(t){return t.id===temp.id;});if(i>=0)S.transactions[i]=saved;toast(TXT.guardado+' · '+money(amount),'ok');aplicarMetaAhorro_(metaSel,metaNewName,metaNewTarget,amount);})
      .catch(function(){S.transactions=S.transactions.filter(function(t){return t.id!==temp.id;});renderAll();toast(TXT.errGuardar,'err');});
  }
}
function removeTx(id){
  const tx=S.transactions.find(function(t){return t.id===id;}); if(!tx)return;
  confirmAction('Eliminar movimiento','Vas a eliminar "'+tx.category+'" por '+money(tx.amount)+'. Esta acción no se puede deshacer.','Eliminar',function(){
    const idx=S.transactions.findIndex(function(t){return t.id===id;}); if(idx<0)return;
    const removed=S.transactions[idx]; S.transactions.splice(idx,1); renderAll();
    gs('deleteTransaction',id).then(function(){toast(TXT.eliminado,'ok');})
      .catch(function(){S.transactions.splice(idx,0,removed);renderAll();toast(TXT.errBorrar,'err');});
  });
}

/* ── Exportación ── */
function openExport(){
  const bk=document.getElementById('exportBackdrop');
  document.getElementById('exportStatus').textContent='';
  // valores por defecto del rango = periodo actual
  const b=periodBounds(S.ref,S.period);
  document.getElementById('rangeStart').value=ymd(b.start);
  document.getElementById('rangeEnd').value=ymd(b.end);
  bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
}
function closeExport(){const bk=document.getElementById('exportBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function buildScope(){
  if(S.exportScope==='all')return {mode:'all',label:'Toda la base de datos'};
  if(S.exportScope==='current'){const b=periodBounds(S.ref,S.period);return {mode:'range',start:ymd(b.start),end:ymd(b.end),label:periodLabel(S.ref,S.period)};}
  const s=document.getElementById('rangeStart').value, e=document.getElementById('rangeEnd').value;
  if(!s||!e)return null;
  return {mode:'range',start:s<e?s:e,end:s<e?e:s,label:''};
}
function runExport(fmt,btn){
  const scope=buildScope();
  if(!scope){toast('Selecciona el rango de fechas','err');return;}
  const fn=fmt==='excel'?'exportExcel':'exportPdf';
  btn.classList.add('busy');
  document.getElementById('exportStatus').textContent='Generando archivo…';
  gs(fn,scope).then(function(res){
    downloadB64(res); btn.classList.remove('busy');
    document.getElementById('exportStatus').textContent='Listo: '+res.filename;
    toast('Exportación lista','ok');
  }).catch(function(err){
    btn.classList.remove('busy');
    document.getElementById('exportStatus').textContent='Error: '+(err&&err.message?err.message:err);
    toast('No se pudo exportar','err');
  });
}
function downloadB64(res){
  try{
    const bin=atob(res.b64), len=bin.length, bytes=new Uint8Array(len);
    for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);
    const blob=new Blob([bytes],{type:res.mimeType}), url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=res.filename;
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1500);
  }catch(e){toast('Descarga bloqueada por el navegador','err');}
}

/* ── Notificaciones ── */
function openNotify(){
  document.getElementById('notifyEmail').value=S.settings.notifyEmail||'';
  document.getElementById('notifyEnabled').checked=!!S.settings.notifyEnabled;
  document.getElementById('notifyStatus').textContent='';
  const bk=document.getElementById('notifyBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
}
function closeNotify(){const bk=document.getElementById('notifyBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function validEmail(e){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);}
function saveNotify(){
  const email=document.getElementById('notifyEmail').value.trim();
  const enabled=document.getElementById('notifyEnabled').checked;
  if(enabled&&!validEmail(email)){toast('Ingresa un correo válido','err');return;}
  const btn=document.getElementById('notifySave'); btn.disabled=true;
  document.getElementById('notifyStatus').textContent='Guardando…';
  gs('saveNotifySettings',email,enabled).then(function(res){
    S.settings.notifyEmail=res.notifyEmail; S.settings.notifyEnabled=res.notifyEnabled;
    document.getElementById('notifyStatus').textContent=enabled?'Notificaciones activadas para '+email:'Notificaciones desactivadas.';
    btn.disabled=false; toast('Preferencias guardadas','ok');
  }).catch(function(err){btn.disabled=false;document.getElementById('notifyStatus').textContent='Error: '+(err&&err.message?err.message:err);toast('No se pudo guardar','err');});
}
function testNotify(){
  const email=document.getElementById('notifyEmail').value.trim();
  if(!validEmail(email)){toast('Ingresa un correo válido','err');return;}
  const btn=document.getElementById('notifyTest'); btn.disabled=true;
  document.getElementById('notifyStatus').textContent='Enviando correo de prueba…';
  // guarda primero para que el backend tenga el correo, luego envía la prueba
  gs('saveNotifySettings',email,document.getElementById('notifyEnabled').checked).then(function(){
    return gs('probarNotificacion');
  }).then(function(msg){
    S.settings.notifyEmail=email;
    document.getElementById('notifyStatus').textContent='✓ '+msg+'. Revisa tu bandeja (y spam).';
    btn.disabled=false; toast('Correo de prueba enviado','ok');
  }).catch(function(err){btn.disabled=false;document.getElementById('notifyStatus').textContent='Error: '+(err&&err.message?err.message:err);toast('No se pudo enviar','err');});
}

/* ═══════════════ PRESUPUESTOS ═══════════════ */
function budgetFor(category){const b=S.budgets.find(function(x){return x.category===category;});return b?b.amount:0;}
function monthExpenseByCategory(){
  // gasto del mes en curso (mes de S.ref) por categoría
  const b=periodBounds(S.ref,'month');
  const map={};
  allMovements().filter(function(t){return t.type==='Expense'&&inBounds(t,b);}).forEach(function(t){
    map[t.category]=(map[t.category]||0)+t.amount;
  });
  return map;
}
function renderBudgets(){
  const wrap=document.getElementById('budgetList');
  const spent=monthExpenseByCategory();
  const cats=(S.categories.Expense||[]);
  if(!cats.length){wrap.innerHTML='<div class="empty">Primero crea categorías de gasto.</div>';return;}
  document.getElementById('budgetCaption').textContent=capFirst(MESES[S.ref.getMonth()])+' '+S.ref.getFullYear();
  // resumen total
  let totBudget=0,totSpent=0;
  cats.forEach(function(c){const bg=budgetFor(c.name);if(bg>0){totBudget+=bg;totSpent+=(spent[c.name]||0);}});
  const totPct=totBudget?Math.min(100,Math.round(totSpent/totBudget*100)):0;
  let head='';
  if(totBudget>0){
    head='<div class="budget-total"><div class="bt-row"><span>Presupuesto total del mes</span><span class="bt-val">'+money(totSpent)+' / '+money(totBudget)+'</span></div>'+
      '<div class="bbar"><span class="bbar-fill '+barClass(totSpent,totBudget)+'" style="width:'+totPct+'%"></span></div></div>';
  }
  wrap.innerHTML=head+cats.map(function(c){
    const bg=budgetFor(c.name), sp=spent[c.name]||0;
    const pct=bg?Math.min(100,Math.round(sp/bg*100)):0;
    const over=bg&&sp>bg;
    const state=!bg?'':(over?'<span class="b-tag over">Excedido</span>':(sp/bg>=0.8?'<span class="b-tag warn">Cerca del límite</span>':'<span class="b-tag ok">En rango</span>'));
    return '<div class="budget-item">'+
      '<div class="bi-head"><span class="cat-swatch" style="background:'+c.color+'"></span>'+
        '<span class="bi-name">'+esc(c.name)+'</span>'+state+
        '<button class="bi-edit" data-cat="'+esc(c.name)+'" data-bg="'+bg+'">'+(bg?'Editar':'Definir')+'</button></div>'+
      (bg?('<div class="bbar"><span class="bbar-fill '+barClass(sp,bg)+'" style="width:'+pct+'%"></span></div>'+
        '<div class="bi-foot"><span>'+money(sp)+' de '+money(bg)+'</span><span>'+(over?('+'+money(sp-bg)+' sobre'):(money(bg-sp)+' disponible'))+'</span></div>')
        :'<div class="bi-foot muted">Sin presupuesto · gastado '+money(sp)+' este mes</div>')+
    '</div>';
  }).join('');
  wrap.querySelectorAll('.bi-edit').forEach(function(b){b.onclick=function(){promptBudget(b.dataset.cat,Number(b.dataset.bg)||0);};});
}
function barClass(sp,bg){if(!bg)return '';const r=sp/bg;return r>1?'over':(r>=0.8?'warn':'ok');}
function promptBudget(category,current){
  // usa el modal de confirmación como contenedor simple con input
  const html='<div style="margin-top:10px"><div class="amount-field"><span class="cur">'+S.settings.currencySymbol+'</span>'+
    '<input type="text" inputmode="numeric" id="budgetInput" value="'+(current?groupDigits(String(current)):'')+'" placeholder="0" autocomplete="off"></div>'+
    '<p class="hint" style="margin-top:8px">Deja en 0 (o vacío) para quitar el presupuesto.</p></div>';
  openMiniInput('Presupuesto · '+category, html, 'Guardar', function(){
    const v=parseInt(String(document.getElementById('budgetInput').value).replace(/\D/g,''),10)||0;
    const prevB=S.budgets.slice();
    const i=S.budgets.findIndex(function(x){return x.category===category;});
    if(v<=0){ if(i>=0)S.budgets.splice(i,1); }
    else if(i>=0)S.budgets[i].amount=v;
    else S.budgets.push({type:'Expense',category:category,amount:v});
    renderBudgets();
    gs('setBudget','Expense',category,v).then(function(){toast('Presupuesto guardado','ok');})
      .catch(function(){S.budgets=prevB;renderBudgets();toast('No se pudo guardar','err');});
  });
  setTimeout(function(){const el=document.getElementById('budgetInput');if(el){el.focus();el.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});}},260);
}

/* Mini-input reutilizable (usa el modal de confirmación con cuerpo personalizado) */
function openMiniInput(title,bodyHtml,okLabel,cb){
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').innerHTML=bodyHtml;
  document.getElementById('confirmOk').textContent=okLabel||'Guardar';
  S.confirmCb=cb;
  const bk=document.getElementById('confirmBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
}

/* ═══════════════ RECURRENCIAS ═══════════════ */
function renderRecurring(){
  const wrap=document.getElementById('recurList');
  document.getElementById('recurAddBtn').onclick=function(){openRecurModal();};
  if(!S.recurring.length){wrap.innerHTML='<div class="empty">No tienes movimientos recurrentes. Crea uno (ej. salario, arriendo, suscripciones) y se registrará solo cada mes.</div>';return;}
  const items=S.recurring.slice().sort(function(a,b){return a.day-b.day;});
  wrap.innerHTML=items.map(function(r){
    const tipo=tipoES(r.type);
    return '<div class="recur-item'+(r.active?'':' off')+'">'+
      '<span class="pend-dot" style="background:'+r.color+'"></span>'+
      '<div class="pend-main"><span class="pend-cat">'+esc(r.category)+'<span class="pend-kind '+r.type+'">'+tipo+'</span>'+(r.active?'':'<span class="b-tag off">Pausado</span>')+'</span>'+
        '<span class="pend-meta"><span>📅 cada día '+r.day+'</span>'+(r.note?'<span>📝 '+esc(r.note)+'</span>':'')+'</span></div>'+
      '<span class="pend-amt">'+money(r.amount)+'</span>'+
      '<div class="pend-acts">'+
        '<button class="pend-act" data-act="toggle" data-id="'+r.id+'" title="'+(r.active?'Pausar':'Activar')+'">'+(r.active?'⏸':'▶')+'</button>'+
        '<button class="pend-act" data-act="edit" data-id="'+r.id+'" title="Editar">✎</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+r.id+'" title="Eliminar">🗑</button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('.pend-act').forEach(function(b){b.onclick=function(){
    const id=b.dataset.id,act=b.dataset.act;
    if(act==='toggle')toggleRecur(id);else if(act==='edit')openRecurModal(id);else removeRecur(id);
  };});
}
function toggleRecur(id){
  const r=S.recurring.find(function(x){return x.id===id;});if(!r)return;
  const prev=r.active; r.active=!r.active; renderRecurring();
  gs('updateRecurring',id,r).then(function(){toast(r.active?'Recurrencia activada':'Recurrencia pausada','ok');})
    .catch(function(){r.active=prev;renderRecurring();toast('No se pudo actualizar','err');});
}
function removeRecur(id){
  const r=S.recurring.find(function(x){return x.id===id;});if(!r)return;
  confirmAction('Eliminar recurrencia','Vas a eliminar la recurrencia "'+r.category+'". Los movimientos ya generados no se borran.','Eliminar',function(){
    const idx=S.recurring.findIndex(function(x){return x.id===id;});const removed=S.recurring[idx];S.recurring.splice(idx,1);renderRecurring();
    gs('deleteRecurring',id).then(function(){toast('Recurrencia eliminada','ok');})
      .catch(function(){S.recurring.splice(idx,0,removed);renderRecurring();toast('No se pudo eliminar','err');});
  });
}
function openRecurModal(editId){
  const editing=!!editId;
  let r=editing?S.recurring.find(function(x){return x.id===editId;}):null;
  S.recur.id=editing?editId:null;
  S.recur.type=r?r.type:'Expense';
  document.getElementById('recurTitle').textContent=editing?'Editar recurrencia':'Nuevo movimiento recurrente';
  document.getElementById('recurCur').textContent=S.settings.currencySymbol;
  document.getElementById('recurAmount').value=r?groupDigits(String(r.amount)):'';
  document.getElementById('recurDay').value=r?r.day:1;
  document.getElementById('recurNote').value=r?(r.note||''):'';
  document.getElementById('recurActive').checked=r?r.active:true;
  document.querySelectorAll('#recurKindSeg button').forEach(function(b){b.classList.toggle('active',b.dataset.rk===S.recur.type);});
  buildRecurSwatches();
  buildRecurChips(S.recur.type, r?r.category:null);
  S.recur.color=r?r.color:(S.categories[S.recur.type][0]?S.categories[S.recur.type][0].color:(paletteFor(S.recur.type)[0]||'#64748B'));
  markSwatch('recurSwatchRow',S.recur.color);
  const bk=document.getElementById('recurBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('recurAmount').focus();},250);
}
function closeRecurModal(){const bk=document.getElementById('recurBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function buildRecurChips(type,selected){
  const row=document.getElementById('recurChipRow'),cats=S.categories[type]||[];
  row.innerHTML=cats.map(function(c){const on=selected?c.name===selected:false;
    return '<button class="chip'+(on?' active':'')+'" data-name="'+esc(c.name)+'" data-color="'+c.color+'"><span class="chip-dot" style="background:'+c.color+'"></span><span style="color:var(--txt)">'+esc(c.name)+'</span></button>';}).join('');
  S.recur.category=selected||(cats[0]?cats[0].name:null);
  if(!selected&&row.querySelector('.chip'))row.querySelector('.chip').classList.add('active');
}
function buildRecurSwatches(){document.getElementById('recurSwatchRow').innerHTML=(paletteFor(S.recur.type)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');}
function selectRecurChip(chip){
  document.querySelectorAll('#recurChipRow .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');
  S.recur.category=chip.dataset.name;
  if(chip.dataset.color){S.recur.color=chip.dataset.color;markSwatch('recurSwatchRow',S.recur.color);}
}
function saveRecur(){
  const amount=parseInt(String(document.getElementById('recurAmount').value).replace(/\D/g,''),10)||0;
  if(amount<=0){toast('Ingresa un monto','err');return;}
  if(!S.recur.category){toast('Elige una categoría','err');return;}
  let day=parseInt(document.getElementById('recurDay').value,10)||1; if(day<1)day=1; if(day>31)day=31;
  const rc={type:S.recur.type,category:S.recur.category,amount:amount,color:S.recur.color||'#64748B',
    source:S.recur.type==='Savings'?'Salary':'',day:day,note:document.getElementById('recurNote').value.trim(),
    active:document.getElementById('recurActive').checked};
  const editId=S.recur.id;
  closeRecurModal();
  if(editId){
    const idx=S.recurring.findIndex(function(x){return x.id===editId;});const prev=S.recurring[idx];
    S.recurring[idx]=Object.assign({id:editId,lastGen:prev.lastGen},rc);renderRecurring();
    gs('updateRecurring',editId,rc).then(function(){toast('Recurrencia actualizada','ok');})
      .catch(function(){S.recurring[idx]=prev;renderRecurring();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now(),lastGen:''},rc);
    S.recurring.push(temp);renderRecurring();
    gs('addRecurring',rc).then(function(saved){const i=S.recurring.findIndex(function(x){return x.id===temp.id;});if(i>=0&&saved)S.recurring[i]=saved;toast('Recurrencia creada','ok');})
      .catch(function(){S.recurring=S.recurring.filter(function(x){return x.id!==temp.id;});renderRecurring();toast('No se pudo guardar','err');});
  }
}

/* ═══════════════ METAS DE AHORRO ═══════════════ */
function renderGoals(){
  const wrap=document.getElementById('goalList');
  document.getElementById('goalAddBtn').onclick=function(){openGoalModal();};
  if(!S.goals.length){wrap.innerHTML='<div class="empty">No tienes metas de ahorro. Crea una (ej. "Fondo de emergencia: '+S.settings.currencySymbol+'5.000.000") y sigue tu progreso.</div>';return;}
  wrap.innerHTML=S.goals.map(function(g){
    const pct=g.target?Math.min(100,Math.round(g.saved/g.target*100)):0;
    const done=g.target&&g.saved>=g.target;
    return '<div class="goal-item">'+
      '<div class="goal-head"><span class="goal-dot" style="background:'+g.color+'"></span>'+
        '<span class="goal-name">'+esc(g.name)+(done?'<span class="b-tag ok">¡Lograda!</span>':'')+'</span>'+
        '<span class="goal-pct">'+pct+'%</span></div>'+
      '<div class="bbar big"><span class="bbar-fill" style="width:'+pct+'%;background:'+g.color+'"></span></div>'+
      '<div class="goal-foot"><span>'+money(g.saved)+' de '+money(g.target)+'</span>'+
        '<span>'+(done?'Meta cumplida':(money(Math.max(0,g.target-g.saved))+' restante'))+'</span></div>'+
      (g.note?'<div class="goal-note">📝 '+esc(g.note)+'</div>':'')+
      '<div class="goal-acts">'+
        '<button class="btn-ghost goal-contrib" data-id="'+g.id+'">＋ Aportar</button>'+
        '<button class="btn-ghost goal-contrib minus" data-id="'+g.id+'">－ Retirar</button>'+
        '<button class="pend-act edit" data-act="edit" data-id="'+g.id+'" title="Editar">✎</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+g.id+'" title="Eliminar">🗑</button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('.goal-contrib').forEach(function(b){b.onclick=function(){contribGoal(b.dataset.id,b.classList.contains('minus'));};});
  wrap.querySelectorAll('.pend-act').forEach(function(b){b.onclick=function(){const id=b.dataset.id;if(b.dataset.act==='edit')openGoalModal(id);else removeGoal(id);};});
}
function contribGoal(id,isMinus){
  const g=S.goals.find(function(x){return x.id===id;});if(!g)return;
  const title=(isMinus?'Retirar de ':'Aportar a ')+'"'+g.name+'"';
  const html='<div style="margin-top:10px"><div class="amount-field"><span class="cur">'+S.settings.currencySymbol+'</span>'+
    '<input type="text" inputmode="numeric" id="contribInput" placeholder="0" autocomplete="off"></div></div>';
  openMiniInput(title,html,isMinus?'Retirar':'Aportar',function(){
    let v=parseInt(String(document.getElementById('contribInput').value).replace(/\D/g,''),10)||0;
    if(v<=0)return;
    if(isMinus)v=-v;
    const prev=g.saved; g.saved=Math.max(0,g.saved+v); renderGoals();
    gs('contributeGoal',id,v).then(function(res){if(res&&typeof res.saved==='number'){g.saved=res.saved;renderGoals();}toast('Meta actualizada','ok');})
      .catch(function(){g.saved=prev;renderGoals();toast('No se pudo guardar','err');});
  });
  setTimeout(function(){const el=document.getElementById('contribInput');if(el){el.focus();el.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});}},260);
}
function removeGoal(id){
  const g=S.goals.find(function(x){return x.id===id;});if(!g)return;
  confirmAction('Eliminar meta','Vas a eliminar la meta "'+g.name+'". Esta acción no se puede deshacer.','Eliminar',function(){
    const idx=S.goals.findIndex(function(x){return x.id===id;});const removed=S.goals[idx];S.goals.splice(idx,1);renderGoals();
    gs('deleteGoal',id).then(function(){toast('Meta eliminada','ok');})
      .catch(function(){S.goals.splice(idx,0,removed);renderGoals();toast('No se pudo eliminar','err');});
  });
}
function openGoalModal(editId){
  const editing=!!editId;
  let g=editing?S.goals.find(function(x){return x.id===editId;}):null;
  S.goal.id=editing?editId:null;
  S.goal.color=g?g.color:(paletteFor('Savings')[0]||'#8B5CF6');
  document.getElementById('goalTitle').textContent=editing?'Editar meta':'Nueva meta de ahorro';
  document.getElementById('goalName').value=g?g.name:'';
  document.getElementById('goalCur').textContent=S.settings.currencySymbol;
  document.getElementById('goalCur2').textContent=S.settings.currencySymbol;
  document.getElementById('goalTarget').value=g?groupDigits(String(g.target)):'';
  document.getElementById('goalSaved').value=g?groupDigits(String(g.saved)):'';
  document.getElementById('goalNote').value=g?(g.note||''):'';
  document.getElementById('goalSwatchRow').innerHTML=(paletteFor('Savings')||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');
  markSwatch('goalSwatchRow',S.goal.color);
  const bk=document.getElementById('goalBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('goalName').focus();},250);
}
function closeGoalModal(){const bk=document.getElementById('goalBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function saveGoal(){
  const name=(document.getElementById('goalName').value||'').trim();
  if(!name){toast('Ponle un nombre a la meta','err');return;}
  const target=parseInt(String(document.getElementById('goalTarget').value).replace(/\D/g,''),10)||0;
  if(target<=0){toast('Define un objetivo','err');return;}
  const saved=parseInt(String(document.getElementById('goalSaved').value).replace(/\D/g,''),10)||0;
  const g={name:name,target:target,saved:saved,color:S.goal.color||'#8B5CF6',note:document.getElementById('goalNote').value.trim()};
  const editId=S.goal.id;
  closeGoalModal();
  if(editId){
    const idx=S.goals.findIndex(function(x){return x.id===editId;});const prev=S.goals[idx];
    S.goals[idx]=Object.assign({id:editId},g);renderGoals();
    gs('updateGoal',editId,g).then(function(){toast('Meta actualizada','ok');})
      .catch(function(){S.goals[idx]=prev;renderGoals();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now()},g);
    S.goals.push(temp);renderGoals();
    gs('addGoal',g).then(function(saved){const i=S.goals.findIndex(function(x){return x.id===temp.id;});if(i>=0&&saved)S.goals[i]=saved;toast('Meta creada','ok');})
      .catch(function(){S.goals=S.goals.filter(function(x){return x.id!==temp.id;});renderGoals();toast('No se pudo guardar','err');});
  }
}

/* ═══════════════ AJUSTES ═══════════════ */
function openSettings(){
  document.getElementById('setCurrency').value=S.settings.currencySymbol||'$';
  document.getElementById('setDecimals').value=String(S.settings.decimals||0);
  document.getElementById('setLocale').value=S.settings.locale||'es-CO';
  document.getElementById('settingsStatus').textContent='';
  const bk=document.getElementById('settingsBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
}
function closeSettings(){const bk=document.getElementById('settingsBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function saveSettings(){
  const cur=(document.getElementById('setCurrency').value||'$').trim()||'$';
  const dec=parseInt(document.getElementById('setDecimals').value,10)||0;
  const loc=document.getElementById('setLocale').value||'es-CO';
  const btn=document.getElementById('settingsSave');btn.disabled=true;
  document.getElementById('settingsStatus').textContent='Guardando…';
  gs('saveAppSettings',cur,dec,loc).then(function(s){
    S.settings.currencySymbol=s.currencySymbol;S.settings.decimals=s.decimals;S.settings.locale=s.locale;
    btn.disabled=false;document.getElementById('settingsStatus').textContent='Guardado.';
    renderAll();toast('Ajustes guardados','ok');setTimeout(closeSettings,500);
  }).catch(function(err){btn.disabled=false;document.getElementById('settingsStatus').textContent='Error: '+(err&&err.message?err.message:err);toast('No se pudo guardar','err');});
}

/* ── Toasts / util ── */
function toast(msg,kind){
  const wrap=document.getElementById('toasts'), el=document.createElement('div');
  el.className='toast '+(kind||'info'); el.innerHTML='<span class="t-dot"></span>'+esc(msg);
  wrap.appendChild(el);
  setTimeout(function(){el.classList.add('out');setTimeout(function(){el.remove();},300);},2400);
}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

window.S = S;

/* ── Pull-to-refresh eliminado ───────────────────────────────
   Se quitó por completo: causaba recargas/saltos al deslizar hacia arriba.
   El scroll queda totalmente libre. La app sigue funcionando offline y se
   refresca al volver a abrirla. (El indicador #ptr se oculta en el CSS.)   */
window.renderAll = renderAll;