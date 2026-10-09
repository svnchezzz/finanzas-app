/* app/history.js — Historial: resumen del periodo, filtros en chips, próximos pendientes y lista por día.
   Se ve mes a mes (‹ Octubre 2026 › en el resumen); la búsqueda busca en todo el historial.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Datos ── */
// Movimientos reales (incluye pendientes ya completados) y pendientes abiertos aparte
function historyItems(){
  const tx=S.transactions.map(function(t){return Object.assign({_real:true},t);});
  const pend=S.pendings.filter(function(p){return p.dueDate;}).map(function(p){
    const st=pendStatus(p);
    return {id:'pend-'+p.id,_pendId:p.id,_fromPending:true,_pendKey:st.key,_pendLabel:st.label,_real:(st.key==='completed'),
      type:p.kind,category:p.category||'(pendiente)',amount:p.amount,color:p.color,date:p.dueDate,source:'',method:p.method||'',note:p.note};
  });
  return tx.concat(pend);
}
function histMatch_(t,q){
  return !q || String(t.category||'').toLowerCase().indexOf(q)>=0
    || String(t.note||'').toLowerCase().indexOf(q)>=0
    || String(t.method||'').toLowerCase().indexOf(q)>=0;
}
const HIST_TIPOS=[['all','Todos'],['Expense','Gastos'],['Income','Ingresos'],['Savings','Ahorro']];
function histReset_(){S.histLimit=50;}
function histMonth_(){if(!S.histMonth){const r=new Date();S.histMonth=new Date(r.getFullYear(),r.getMonth(),1);}return S.histMonth;}

/* ── Buscador: se despliega desde la lupa ── */
function histSearchOpen(abrir){
  const row=document.getElementById('histSearchRow'), btn=document.getElementById('histSearchBtn'),
        inp=document.getElementById('histSearch');
  if(!row||!btn)return;
  if(abrir){
    row.classList.remove('hidden','out');
    setTimeout(function(){inp.focus({preventScroll:true});},80);
  }else{
    if(inp&&inp.value){inp.value='';S.histSearch='';histReset_();renderHistory();}
    if(inp)inp.blur();
    row.classList.add('out');
    setTimeout(function(){row.classList.add('hidden');row.classList.remove('out');},170);
  }
  btn.classList.toggle('on',abrir); btn.setAttribute('aria-expanded',String(abrir));
}
function wireHistHead(){
  const sBtn=document.getElementById('histSearchBtn'), row=document.getElementById('histSearchRow'),
        inp=document.getElementById('histSearch'), clr=document.getElementById('histSearchClear');
  if(sBtn)sBtn.onclick=function(){histSearchOpen(row.classList.contains('hidden'));};
  let searchT=0;
  if(inp)inp.addEventListener('input',function(e){S.histSearch=e.target.value;clearTimeout(searchT);searchT=setTimeout(function(){histReset_();renderHistory();},120);});
  if(clr)clr.onclick=function(e){e.stopPropagation();histSearchOpen(false);};
  // Chips de tipo y cifras del resumen filtran la lista (tocar de nuevo quita el filtro)
  function setTipo(t){
    if(S.histType===t)t='all';
    S.histType=t; histReset_(); if(window.Haptic&&Haptic.light)Haptic.light(); renderHistory();
  }
  document.getElementById('histChips').addEventListener('click',function(e){const b=e.target.closest('[data-ht]');if(b)setTipo(b.dataset.ht);});
  document.getElementById('histSum').addEventListener('click',function(e){
    const nav=e.target.closest('[data-hm]');
    if(nav){const m=histMonth_();S.histMonth=new Date(m.getFullYear(),m.getMonth()+(+nav.dataset.hm),1);histReset_();closeSwipes_();if(window.Haptic&&Haptic.light)Haptic.light();renderHistory();return;}
    const b=e.target.closest('[data-ht]');if(b)setTipo(b.dataset.ht);
  });
  document.getElementById('histNext').addEventListener('click',function(e){
    if(e.target.closest('.hn-head')){S.histNextOpen=!S.histNextOpen;if(window.Haptic&&Haptic.light)Haptic.light();renderHistory();}
  });
  wireHistRows_(document.getElementById('historyList'));
  wireHistRows_(document.getElementById('histNext'));
}

/* ── Render ── */
function renderHistory(){
  const wrap=document.getElementById('historyList');
  const ampliando=!!S._histAppend; S._histAppend=false;
  wrap.classList.toggle('no-anim',ampliando);
  const q=(S.histSearch||'').trim().toLowerCase();
  const tipo=S.histType||'all';
  const b=periodBounds(histMonth_(),'month');
  const ALL=historyItems();
  // Lo realizado: del periodo elegido, o de todo el historial si se está buscando
  const base=ALL.filter(function(t){return t._real&&(q?histMatch_(t,q):inBounds(t,b));});
  // Pendientes abiertos: se muestran aparte como "Próximos"
  const abiertos=ALL.filter(function(t){return !t._real&&histMatch_(t,q)&&(tipo==='all'||t.type===tipo);})
    .sort(function(a,c){return a.date<c.date?-1:1;});

  renderHistSum_(base,q);
  renderHistChips_(base,tipo);
  renderHistNext_(abiertos);

  let MOV=tipo==='all'?base:base.filter(function(t){return t.type===tipo;});
  MOV.sort(function(a,c){return (a.date+(a.timestamp||''))<(c.date+(c.timestamp||''))?1:-1;});
  const total=MOV.length, tope=S.histLimit||50, resto=Math.max(0,total-tope);
  if(resto)MOV=MOV.slice(0,tope);
  if(!MOV.length){
    const nom=histLabel_(tipo).toLowerCase();
    wrap.innerHTML=q?emptyState(ICON.receipt,'Sin resultados','Nada coincide con "'+esc(S.histSearch.trim())+'".')
      :(tipo!=='all'?emptyState(ICON.receipt,'Sin '+nom,'No hay '+nom+' '+perTxt('month',histMonth_()).este+'.')
      :emptyState(ICON.receipt,'Sin movimientos','Aún no registras nada '+perTxt('month',histMonth_()).este+'.'));
    return;
  }
  // Por día; buscando en todo el historial con muchos resultados se agrupa por mes
  const porMes=!!q&&total>30;
  const groups={},order=[];
  MOV.forEach(function(t){
    const k=porMes?t.date.slice(0,7):t.date;
    if(!groups[k]){groups[k]=[];order.push(k);}
    groups[k].push(t);
  });
  wrap.innerHTML=order.map(function(k,gi){
    const items=groups[k];
    const net=sumType(items,'Income')-sumType(items,'Expense')-sumType(items,'Savings');
    return '<section class="hist-group" style="animation-delay:'+Math.min(gi*30,240)+'ms">'+
      '<h3 class="hist-group-head"><span class="hist-group-title">'+histGroupTitle_(k,porMes)+'</span>'+
      '<span class="hist-group-net '+(net>=0?'pos':'neg')+'">'+(net>0?'+':net<0?'−':'')+money(Math.abs(net))+'</span></h3>'+
      '<div class="hist-rows">'+items.map(rowHTML).join('')+'</div></section>';
  }).join('')
  + (resto?'<button class="btn-ghost hist-more" id="histMore">Ver '+Math.min(50,resto)+' más · quedan '+resto+'</button>':'');
  const more=document.getElementById('histMore');
  if(more)more.onclick=function(){S._histAppend=true;S.histLimit=(S.histLimit||50)+50;renderHistory();};
}
function histLabel_(val){for(var i=0;i<HIST_TIPOS.length;i++)if(HIST_TIPOS[i][0]===val)return HIST_TIPOS[i][1];return '';}

/* Resumen: cuánto entró, cuánto salió y lo que quedó. Tocar Entró/Salió filtra la lista. */
function renderHistSum_(list,q){
  const inc=sumType(list,'Income'), exp=sumType(list,'Expense'), sav=savingsNet(list), net=inc-exp-sumType(list,'Savings');
  const m=histMonth_(), hoy=new Date(), esActual=m.getFullYear()===hoy.getFullYear()&&m.getMonth()===hoy.getMonth();
  const arrow=function(dir,lbl,dis){return '<button type="button" class="hs-nav" data-hm="'+dir+'" aria-label="'+lbl+'"'+(dis?' disabled':'')+'>'+(dir<0?'‹':'›')+'</button>';};
  const titulo=q?'<span class="hs-q">Resultados de “'+esc(S.histSearch.trim())+'” en todo el historial</span>'
    :arrow(-1,'Mes anterior')+'<span class="hs-month">'+capFirst(MESES[m.getMonth()])+' '+m.getFullYear()+'</span>'+arrow(1,'Mes siguiente',esActual);
  const on=S.histType||'all';
  function cell(ht,lbl,val,cls){
    return '<button type="button" class="hs-cell '+cls+(on===ht?' on':'')+'" data-ht="'+ht+'" aria-pressed="'+(on===ht)+'">'+
      '<span class="hs-k">'+lbl+'</span><b class="hs-v">'+val+'</b></button>';
  }
  const len=Math.max(money(inc).length,money(exp).length,money(Math.abs(net)).length)+1;
  document.getElementById('histSum').innerHTML=
    '<div class="hs-title">'+titulo+'</div>'+
    '<div class="hs-cells" style="--len:'+len+'">'+
      cell('Income','Entró','+'+money(inc),'in')+
      cell('Expense','Salió','−'+money(exp),'out')+
      '<div class="hs-cell net '+(net>=0?'pos':'neg')+'"><span class="hs-k">Neto</span><b class="hs-v">'+(net>0?'+':net<0?'−':'')+money(Math.abs(net))+'</b></div>'+
    '</div>'+
    (sav?'<p class="hs-foot">'+(sav>0?'El neto descuenta '+money(sav)+' que apartaste en ahorro.':'Usaste '+money(-sav)+' de tu ahorro.')+'</p>':'');
}
function renderHistChips_(list,tipo){
  const n=function(t){return t==='all'?list.length:list.filter(function(x){return x.type===t;}).length;};
  document.getElementById('histChips').innerHTML=HIST_TIPOS.map(function(t){
    const on=tipo===t[0];
    return '<button type="button" class="chip hc-'+t[0]+(on?' active':'')+'" data-ht="'+t[0]+'" aria-pressed="'+on+'">'+t[1]+'<span class="hc-n">'+n(t[0])+'</span></button>';
  }).join('');
}
/* Próximos: cobros y pagos aún abiertos (incluye vencidos), plegable */
function renderHistNext_(list){
  const box=document.getElementById('histNext');
  if(!list.length){box.hidden=true;box.innerHTML='';return;}
  const venc=list.filter(function(t){return t._pendKey==='overdue';}).length;
  const open=!!S.histNextOpen;
  box.hidden=false;
  box.innerHTML='<button type="button" class="hn-head" aria-expanded="'+open+'">'+
      '<span class="hn-ico">'+ICON.pending+'</span>'+
      '<span class="hn-txt"><b>Próximos</b><span>'+list.length+(list.length===1?' cobro o pago por hacer':' cobros y pagos por hacer')+(venc?' · '+venc+(venc===1?' vencido':' vencidos'):'')+'</span></span>'+
      '<svg class="hn-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>'+
    (open?'<div class="hist-rows hn-rows">'+list.map(rowHTML).join('')+'</div>':'');
}
function histGroupTitle_(key,porMes){
  if(porMes){const p=key.split('-');return capFirst(MESES[(+p[1])-1])+(+p[0]!==new Date().getFullYear()?' '+p[0]:'');}
  const d=parseYMD(key), hoy=sod(new Date()), dias=Math.round((hoy-d)/864e5);
  const base=DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]+(d.getFullYear()!==hoy.getFullYear()?' '+d.getFullYear():'');
  return dias===0?'Hoy · '+base:(dias===1?'Ayer · '+base:base);
}

/* ── Fila: tocar edita; deslizar a la izquierda muestra Eliminar ── */
function rowHTML(t){
  const d=parseYMD(t.date), parts=[];
  if(t._fromPending&&!t._real){
    const dias=Math.round((d-sod(new Date()))/864e5);
    parts.push(dias<0?'venció hace '+(-dias)+(dias===-1?' día':' días'):dias===0?'vence hoy':dias===1?'vence mañana':'vence el '+d.getDate()+' '+MON[d.getMonth()]);
  }else if(S.histSearch){
    parts.push(d.getDate()+' '+MON[d.getMonth()]);
  }
  if(t._fromPending)parts.push(t.type==='Income'?(t._real?'cobro':'por cobrar'):(t._real?'pago':'por pagar'));
  if(t.method)parts.push(esc(t.method));
  if(t.note)parts.push(esc(t.note));
  if(isFromSavings(t))parts.push('pagado con ahorro');
  else if(t.type==='Savings'&&t.source==='Other')parts.push('de otra fuente');
  const sign=t.type==='Income'?'+':'−', col=safeColor(t.color);
  const ref=t._fromPending?'data-pend="'+esc(t._pendId)+'"':'';
  const late=t._pendKey==='overdue'&&!t._real;
  return '<div class="hr-wrap">'+
    '<button type="button" class="hr-swipe-del" '+ref+' data-id="'+esc(t.id)+'" tabindex="-1" aria-hidden="true">'+ICON.trash+'<span>Eliminar</span></button>'+
    '<div class="hist-row'+(t._real?'':' is-unrealized')+'" role="button" tabindex="0" data-id="'+esc(t.id)+'" '+ref+
      ' aria-label="'+esc(t.category)+', '+(t.type==='Income'?'ingreso':t.type==='Expense'?'gasto':'ahorro')+' de '+esc(money(t.amount))+'. Toca para editar">'+
      '<span class="hr-ava" style="background:'+col+'22;color:'+col+'">'+catIcon(t.category,t.type)+'</span>'+
      '<span class="hr-main"><span class="hr-cat">'+esc(t.category)+'</span>'+
        (parts.length?'<span class="hr-meta'+(late?' late':'')+'">'+parts.join(' · ')+'</span>':'')+'</span>'+
      '<span class="hr-amt '+t.type+'">'+sign+money(t.amount)+'</span>'+
    '</div></div>';
}
function histEdit_(row){
  if(row.dataset.pend)openPendModal(row.dataset.pend); else openModal(null,row.dataset.id);
}
function histDelete_(el){
  if(el.dataset.pend)removePending(el.dataset.pend); else removeTx(el.dataset.id);
}
function closeSwipes_(except){
  document.querySelectorAll('.hr-wrap.open').forEach(function(w){if(w!==except){w.classList.remove('open');w.querySelector('.hist-row').style.transform='';}});
}
function wireHistRows_(box){
  if(!box||box._wired)return; box._wired=true;
  const OPEN=-92;
  let row=null,x0=0,y0=0,dx=0,mode='',base=0;
  box.addEventListener('pointerdown',function(e){
    const r=e.target.closest('.hist-row'); if(!r||e.button>0)return;
    row=r; x0=e.clientX; y0=e.clientY; dx=0; mode='';
    base=r.parentNode.classList.contains('open')?OPEN:0;
  });
  box.addEventListener('pointermove',function(e){
    if(!row)return;
    const mx=e.clientX-x0, my=e.clientY-y0;
    if(!mode){
      if(Math.abs(mx)>8&&Math.abs(mx)>Math.abs(my)*1.2){mode='x';closeSwipes_(row.parentNode);row.classList.add('dragging');try{row.setPointerCapture(e.pointerId);}catch(_){}}
      else if(Math.abs(my)>8)mode='y';
    }
    if(mode==='x'){dx=Math.max(OPEN*1.4,Math.min(0,base+mx));row.style.transform='translateX('+dx+'px)';}
  });
  function fin(){
    if(!row)return;
    const r=row; row=null; r.classList.remove('dragging');
    if(mode==='x'){
      const abrir=dx<OPEN/2; r.parentNode.classList.toggle('open',abrir);
      r.style.transform=abrir?'translateX('+OPEN+'px)':'';
      if(abrir&&window.Haptic&&Haptic.light)Haptic.light();
      r._noClick=true; setTimeout(function(){r._noClick=false;},50);
    }
  }
  box.addEventListener('pointerup',fin); box.addEventListener('pointercancel',fin);
  box.addEventListener('click',function(e){
    const del=e.target.closest('.hr-swipe-del'); if(del){closeSwipes_();histDelete_(del);return;}
    const r=e.target.closest('.hist-row'); if(!r||r._noClick)return;
    if(r.parentNode.classList.contains('open')){closeSwipes_();return;}
    closeSwipes_(); histEdit_(r);
  });
  box.addEventListener('keydown',function(e){
    const r=e.target.closest('.hist-row'); if(!r)return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();histEdit_(r);}
    else if(e.key==='Delete'){e.preventDefault();histDelete_(r);}
  });
}
