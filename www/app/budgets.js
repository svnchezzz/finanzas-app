/* app/budgets.js — Presupuestos, notificaciones locales y mini-input.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

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
/* ═══════════════ NOTIFICACIONES (presupuestos · metas · pendientes) ═══════════════ */
function curMonthKey(){const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);}
// Gasto del MES REAL en curso por categoría (independiente del periodo que se esté viendo)
function monthExpenseForCategoryNow(category){
  const b=periodBounds(new Date(),'month');
  return allMovements().filter(function(t){return t.type==='Expense'&&t.category===category&&inBounds(t,b);})
    .reduce(function(a,t){return a+t.amount;},0);
}
// Revisa un presupuesto y avisa al cruzar 80% o 100% (una sola vez por mes). silent=solo registrar estado.
function evalBudget(category,notify){
  notify=notify&&ntOn('budget');   // el seguimiento sigue; solo se calla el aviso
  if(!window.Notif||!category)return;
  const bg=budgetFor(category); if(bg<=0)return;
  const spent=monthExpenseForCategoryNow(category);
  const ratio=spent/bg, mk=curMonthKey();
  const k80='budget80:'+category+':'+mk, k100='budget100:'+category+':'+mk;
  if(ratio<0.8){ Notif.clearSeen(k80); Notif.clearSeen(k100); return; }
  if(ratio<1){ Notif.clearSeen(k100); }
  if(ratio>=1){
    if(!Notif.wasSeen(k100)){ if(notify)Notif.now(k100,'🚨 Presupuesto agotado','Llegaste al 100% de "'+category+'": '+money(spent)+' de '+money(bg)+'.'); Notif.markSeen(k100); Notif.markSeen(k80); }
  }else if(ratio>=0.8){
    if(!Notif.wasSeen(k80)){ if(notify)Notif.now(k80,'⚠️ Cerca del límite del presupuesto','Vas en '+Math.round(ratio*100)+'% de "'+category+'": '+money(spent)+' de '+money(bg)+'.'); Notif.markSeen(k80); }
  }
}
// Revisa una meta y avisa al cruzar 80% o 100%.
function evalGoal(g,notify){
  if(!window.Notif||!g||!g.target||g.target<=0)return;
  notify=notify&&ntOn('goal');
  const ratio=g.saved/g.target;
  const k80='goal80:'+g.id, k100='goal100:'+g.id;
  if(ratio<0.8){ Notif.clearSeen(k80); Notif.clearSeen(k100); return; }
  if(ratio<1){ Notif.clearSeen(k100); }
  if(ratio>=1){
    if(!Notif.wasSeen(k100)){ if(notify)Notif.now(k100,'🎉 ¡Meta cumplida!','Completaste "'+g.name+'": '+money(g.saved)+' de '+money(g.target)+'.'); Notif.markSeen(k100); Notif.markSeen(k80); }
  }else if(ratio>=0.8){
    if(!Notif.wasSeen(k80)){ if(notify)Notif.now(k80,'🔥 Casi logras tu meta','Vas en '+Math.round(ratio*100)+'% de "'+g.name+'": '+money(g.saved)+' de '+money(g.target)+'.'); Notif.markSeen(k80); }
  }
}
// Programa los avisos de un pendiente: recordatorio el día ANTES (9:00) y "vencido" el día DESPUÉS (9:00).
function schedulePendAlerts(p){
  if(!window.Notif||!p||!p.dueDate||p.status==='completed')return;
  if(!ntOn('pend')){ cancelPendAlerts(p.id); return; }   // apagado en Ajustes
  const due=parseYMD(p.dueDate);
  // Recordatorio: un día antes de la fecha acordada
  const remind=new Date(due.getFullYear(),due.getMonth(),due.getDate()-1,9,0,0,0);
  if(remind.getTime()>Date.now())
    Notif.at('pend-reminder:'+p.id,'🔔 Recordatorio',
      (p.kind==='Income'?'Mañana tienes un cobro: ':'Mañana tienes un pago: ')+(p.category||'')+' · '+money(p.amount),remind);
  // Vencido: un día después de la fecha acordada
  const over=new Date(due.getFullYear(),due.getMonth(),due.getDate()+1,9,0,0,0);
  if(over.getTime()>Date.now())
    Notif.at('pend-overdue:'+p.id,'⚠️ Pendiente vencido',(p.category||'Pendiente')+' · '+money(p.amount)+' venció.',over);
}
// Cancela ambos avisos (recordatorio y vencido) de un pendiente.
function cancelPendAlerts(id){
  if(!window.Notif)return;
  Notif.cancel('pend-reminder:'+id);
  Notif.cancel('pend-overdue:'+id);
}
// Recorre los pendientes: avisa los ya vencidos (una vez) y programa los futuros.
function scanPendingsNotif(notify){
  if(!window.Notif)return;
  notify=notify&&ntOn('pend');
  (S.pendings||[]).forEach(function(p){
    if(p.status==='completed'){ cancelPendAlerts(p.id); return; }
    if(!p.dueDate)return;
    const due=parseYMD(p.dueDate);
    const overdueAt=new Date(due.getFullYear(),due.getMonth(),due.getDate()+1,9,0,0,0);
    if(overdueAt.getTime()<=Date.now()){
      const k='pend-overdue-fired:'+p.id;
      if(!Notif.wasSeen(k)){ if(notify)Notif.now('pend-overdue:'+p.id,'⚠️ Pendiente vencido',(p.category||'Pendiente')+' · '+money(p.amount)+' está vencido.'); Notif.markSeen(k); }
    }else{
      schedulePendAlerts(p);
    }
  });
}
// Recordatorio diario: si un día no registras ningún movimiento, avisa a las 20:00.
// Programa los próximos días y cancela solo el día en que sí registras algo.
function scheduleDailyReminders(){
  if(!window.Notif)return;
  const DAYS=14, HOUR=20;
  // Apagado en Ajustes: cancelar los que ya estaban programados y salir
  if(!ntOn('daily')){
    const b=sod(new Date());
    for(let i=0;i<DAYS;i++)Notif.cancel('daily-reminder:'+ymd(new Date(b.getFullYear(),b.getMonth(),b.getDate()+i)));
    return;
  }
  const moved={};
  (S.transactions||[]).forEach(function(t){ if(t.date)moved[t.date]=true; });
  const base=sod(new Date());
  for(let i=0;i<DAYS;i++){
    const d=new Date(base.getFullYear(),base.getMonth(),base.getDate()+i,HOUR,0,0,0);
    const key='daily-reminder:'+ymd(d);
    if(moved[ymd(d)]||d.getTime()<=Date.now()) Notif.cancel(key);
    else Notif.at(key,'📝 Registra tus movimientos','¡No te olvides de registrar tus movimientos del día!',d);
  }
}
// Arranque: pide permiso y revisa el estado actual. En la PRIMERA ejecución solo
// registra el estado (sin avisar) para no llenar de notificaciones al instalar.
/* Vuelve a aplicar TODO el estado de notificaciones según los interruptores de
   Ajustes. Se llama al cambiar cualquiera: apagar cancela lo programado y
   encender lo vuelve a programar (antes solo cancelaba). No manda avisos
   inmediatos — solo reprograma — para que tocar un interruptor no dispare
   una avalancha de notificaciones viejas. */
function aplicarNotifs(){
  if(!window.Notif||!Notif.available())return;
  try{
    scheduleDailyReminders();                       // respeta ntOn('daily')
    (S.pendings||[]).forEach(function(p){           // respeta ntOn('pend')
      if(p.status==='completed')cancelPendAlerts(p.id);
      else schedulePendAlerts(p);
    });
    (S.categories.Expense||[]).forEach(function(c){ evalBudget(c.name,false); });
    (S.goals||[]).forEach(function(g){ evalGoal(g,false); });
  }catch(e){}
}
window.aplicarNotifs=aplicarNotifs;

function notifStartup(){
  if(!window.Notif||!Notif.available())return;
  Notif.init().then(function(ok){
    if(!ok)return;
    const firstRun=!Notif.wasSeen('__baseline__');
    const notify=!firstRun;
    (S.categories.Expense||[]).forEach(function(c){ evalBudget(c.name,notify); });
    (S.goals||[]).forEach(function(g){ evalGoal(g,notify); });
    scanPendingsNotif(notify);
    scheduleDailyReminders();
    if(firstRun)Notif.markSeen('__baseline__');
  });
}

function renderBudgets(){
  const wrap=document.getElementById('budgetList');
  const spent=monthExpenseByCategory();
  const cats=(S.categories.Expense||[]);
  if(!cats.length){wrap.innerHTML=emptyState(ICON.chart,'Sin categorías de gasto','Crea categorías de gasto para asignarles un presupuesto mensual.');return;}
  document.getElementById('budgetCaption').textContent=capFirst(MESES[S.ref.getMonth()])+' '+S.ref.getFullYear();
  // resumen total
  let totBudget=0,totSpent=0;
  cats.forEach(function(c){const bg=budgetFor(c.name);if(bg>0){totBudget+=bg;totSpent+=(spent[c.name]||0);}});
  const totPct=totBudget?Math.min(100,Math.round(totSpent/totBudget*100)):0;
  // Resumen del mes (tarjeta destacada)
  let head='';
  if(totBudget>0){
    head='<div class="budget-total">'+
      '<span class="bt-label">Gastado en '+MESES[S.ref.getMonth()]+'</span>'+
      '<div class="bt-big">'+money(totSpent)+' <span class="bt-of">de '+money(totBudget)+'</span></div>'+
      '<div class="bbar big"><span class="bbar-fill '+barClass(totSpent,totBudget)+'" style="width:'+totPct+'%'+(totPct>0?';min-width:6px':'')+'"></span></div>'+
      '<div class="bt-row"><span>'+totPct+'% usado</span><span class="bt-val">'+
        (totSpent>totBudget?(money(totSpent-totBudget)+' por encima del límite'):(money(totBudget-totSpent)+' disponible'))+'</span></div>'+
    '</div>';
  }
  // Con presupuesto primero (ordenados por % de uso, el más comprometido arriba); sin presupuesto, compactas al final
  const withB=cats.filter(function(c){return budgetFor(c.name)>0;})
    .sort(function(a,b){return (spent[b.name]||0)/budgetFor(b.name)-(spent[a.name]||0)/budgetFor(a.name);});
  const without=cats.filter(function(c){return !budgetFor(c.name);});
  const rows=withB.map(function(c,i){
    const bg=budgetFor(c.name), sp=spent[c.name]||0;
    const pct=bg?Math.min(100,Math.round(sp/bg*100)):0;
    const over=sp>bg;
    const state=over?'<span class="b-tag over">Excedido</span>':(sp/bg>=0.8?'<span class="b-tag warn">Cerca</span>':'<span class="b-tag ok">En rango</span>');
    return '<div class="budget-item" style="animation-delay:'+(i*30)+'ms">'+
      '<div class="bi-head">'+
        '<span class="hr-ava" style="background:'+safeColor(c.color)+'22;color:'+safeColor(c.color)+'">'+catIcon(c.name,'Expense')+'</span>'+
        '<div class="bi-info"><span class="bi-name">'+esc(c.name)+'</span><span class="bi-sub">'+money(sp)+' de '+money(bg)+'</span></div>'+
        state+
        '<div class="bi-acts">'+
          '<button class="pend-act bi-edit" data-cat="'+esc(c.name)+'" data-bg="'+bg+'" aria-label="Editar">'+ICON.edit+'</button>'+
          '<button class="pend-act del bi-del" data-cat="'+esc(c.name)+'" aria-label="Eliminar">'+ICON.trash+'</button>'+
        '</div></div>'+
      '<div class="bbar"><span class="bbar-fill '+barClass(sp,bg)+'" style="width:'+pct+'%'+(pct>0?';min-width:6px':'')+'"></span></div>'+
      '<div class="bi-foot"><span>'+pct+'% usado</span><span>'+(over?(money(sp-bg)+' por encima'):(money(bg-sp)+' disponible'))+'</span></div>'+
    '</div>';
  }).join('');
  const rest=without.length?('<div class="b-sec">Sin presupuesto</div>'+without.map(function(c,i){
    const sp=spent[c.name]||0;
    return '<div class="budget-item compact" style="animation-delay:'+((withB.length+i)*30)+'ms">'+
      '<div class="bi-head">'+
        '<span class="hr-ava" style="background:'+safeColor(c.color)+'22;color:'+safeColor(c.color)+'">'+catIcon(c.name,'Expense')+'</span>'+
        '<div class="bi-info"><span class="bi-name">'+esc(c.name)+'</span><span class="bi-sub">'+(sp?('Gastado '+money(sp)+' este mes'):'Sin gastos este mes')+'</span></div>'+
        '<button class="btn-ghost bi-def bi-edit" data-cat="'+esc(c.name)+'" data-bg="0">＋ Definir</button>'+
      '</div></div>';
  }).join('')):'';
  wrap.innerHTML=head+rows+rest;
  wrap.querySelectorAll('.bi-edit').forEach(function(b){b.onclick=function(){promptBudget(b.dataset.cat,Number(b.dataset.bg)||0);};});
  wrap.querySelectorAll('.bi-del').forEach(function(b){b.onclick=function(){removeBudget(b.dataset.cat);};});
}
/* Eliminar presupuesto: pide confirmación y luego lo baja a cero */
function removeBudget(category){
  const i=S.budgets.findIndex(function(x){return x.category===category;});
  if(i<0)return;
  confirmAction('Eliminar presupuesto','Se quitará el presupuesto de "'+category+'" (queda en cero).','Eliminar',function(){
    const j=S.budgets.findIndex(function(x){return x.category===category;});
    if(j<0)return;
    const prevB=S.budgets.slice();
    S.budgets.splice(j,1);
    renderBudgets();
    if(window.Notif){ const mk=curMonthKey(); Notif.clearSeen('budget80:'+category+':'+mk); Notif.clearSeen('budget100:'+category+':'+mk); }
    gs('setBudget','Expense',category,0).then(function(){toast('Presupuesto eliminado','ok');})
      .catch(function(){S.budgets=prevB;renderBudgets();toast('No se pudo eliminar','err');});
  });
}
function barClass(sp,bg){if(!bg)return '';const r=sp/bg;return r>1?'over':(r>=0.8?'warn':'ok');}
function promptBudget(category,current){
  // usa el modal de confirmación como contenedor simple con input
  const html='<div style="margin-top:10px"><div class="amount-field"><span class="cur">'+esc(S.settings.currencySymbol)+'</span>'+
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
    if(window.Notif){
      if(v<=0){ const mk=curMonthKey(); Notif.clearSeen('budget80:'+category+':'+mk); Notif.clearSeen('budget100:'+category+':'+mk); }
      else evalBudget(category,true);
    }
    gs('setBudget','Expense',category,v).then(function(){toast('Presupuesto guardado','ok');})
      .catch(function(){S.budgets=prevB;renderBudgets();toast('No se pudo guardar','err');});
  });
  setTimeout(function(){const el=document.getElementById('budgetInput');if(el){el.focus({preventScroll:true});el.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});}},260);
}

/* Mini-input reutilizable (usa el modal de confirmación con cuerpo personalizado) */
function openMiniInput(title,bodyHtml,okLabel,cb){
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').innerHTML=bodyHtml;
  document.getElementById('confirmOk').textContent=okLabel||'Guardar';
  S.confirmCb=cb;
  const bk=document.getElementById('confirmBackdrop');bk.style.display='flex';
  // El cuerpo puede traer un .segmented: hay que colocar su burbuja ya visible,
  // si no queda sin posicionar y después no acompaña a la opción activa.
  requestAnimationFrame(function(){bk.classList.add('show');positionAllSegInks();});
}
