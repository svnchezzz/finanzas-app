/* app/shell.js — Conexión de eventos de la interfaz, confirmación y navegación entre vistas.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Conexiones de UI ── */
function wireUI(){
  // Tooltip de gráficas: cerrar al hacer scroll y al tocar fuera/otra gráfica (captura = corre primero)
  window.addEventListener('scroll',onScrollDismissTip,true);
  document.addEventListener('pointerdown',onPointerDownDismissTip,true);
  document.getElementById('periodSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('periodSeg',b);S.period=b.dataset.period;deferRender();});
  document.getElementById('prevPeriod').onclick=function(){S.ref=shiftRef(S.ref,S.period,-1);deferRender();};
  document.getElementById('nextPeriod').onclick=function(){S.ref=shiftRef(S.ref,S.period,1);deferRender();};
  document.getElementById('periodLabel').onclick=function(e){e.stopPropagation();toggleCal();};
  document.querySelector('.viewtabs').addEventListener('click',function(e){const b=e.target.closest('.vtab');if(!b)return;switchView(b.dataset.view,b);});
  const hg=document.getElementById('historyGrain');
  if(hg){hg.value=S.histGrain;hg.addEventListener('change',function(){S.histGrain=hg.value;histReset_();renderHistory();});}

  document.getElementById('addBtn').onclick=openActionMenu;
  document.getElementById('actionBackdrop').addEventListener('click',function(e){
    if(e.target.id==='actionBackdrop')closeActionMenu();
    const opt=e.target.closest('.action-opt'); if(opt){if(window.Haptic&&Haptic.light)Haptic.light();closeActionMenu();if(opt.dataset.type==='Pending')openPendModal();else openModal(opt.dataset.type);}
  });

  document.getElementById('modalClose').onclick=closeModal;
  document.getElementById('cancelBtn').onclick=closeModal;
  document.getElementById('modalBackdrop').addEventListener('click',function(e){if(e.target.id==='modalBackdrop')closeModal();});
  document.getElementById('saveBtn').onclick=saveTx;
  document.getElementById('amountInput').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('sourceSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('sourceSeg',b);S.modal.source=b.dataset.source;
    document.getElementById('sourceHint').textContent=b.dataset.source==='Salary'?'Se descuenta de tu disponible actual.':'Es un nuevo ingreso (no afecta tu disponible actual).';});
  document.getElementById('fromSavings').addEventListener('change',function(){setupExpGoalRow_();});
  wireDateFields(); trackKeyboard();
  document.getElementById('newCatSave').onclick=onNewCategoryInModal;
  document.getElementById('chipRow').addEventListener('click',function(e){
    const add=e.target.closest('.add-chip');
    if(add){const shown=document.getElementById('newCatRow').classList.toggle('show');
      document.getElementById('txColorRow').classList.toggle('hidden',!shown);
      add.innerHTML='<span class="chip-dot" style="background:currentColor"></span>'+(shown?'Cerrar':'Nueva');
      add.classList.toggle('open',shown);
      if(shown){S.modal.color=paletteFor(S.modal.type)[0]||'#4F46E5';markSwatch('swatchRow',S.modal.color);document.getElementById('newCatInput').focus({preventScroll:true});}
      return;}
    const chip=e.target.closest('.chip'); if(chip){selectChip(chip);document.getElementById('newCatRow').classList.remove('show');document.getElementById('txColorRow').classList.add('hidden');
      const ac=document.querySelector('#chipRow .add-chip');if(ac){ac.innerHTML='<span class="chip-dot" style="background:currentColor"></span>Nueva';ac.classList.remove('open');}}
  });
  document.getElementById('swatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.modal.color=s.dataset.color;markSwatch('swatchRow',S.modal.color);});
  wireColorWheel('swatchRowCustom',function(){return S.modal.color;},function(c){S.modal.color=c;markSwatch('swatchRow',c);});

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

  // Navegación inferior (móvil)
  const bn=document.getElementById('bottomNav');
  if(bn)bn.addEventListener('click',function(e){const b=e.target.closest('.bn-item');if(!b)return;if(b.id==='bnMore'){openMore();return;}goToView(b.dataset.view);});
  document.getElementById('moreBackdrop').addEventListener('click',function(e){
    if(e.target.id==='moreBackdrop'){closeMore();return;}
    const opt=e.target.closest('.action-opt');if(opt){closeMore();goToView(opt.dataset.view);}
  });
  const emptyAdd=document.getElementById('emptyAddBtn');
  if(emptyAdd)emptyAdd.onclick=openActionMenu;

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
    if(add){document.getElementById('pendNewCatRow').classList.toggle('show');document.getElementById('pendNewCatInput').focus({preventScroll:true});return;}
    const chip=e.target.closest('.chip'); if(chip)selectPendChip(chip);
  });
  document.getElementById('pendSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.pend.color=s.dataset.color;markSwatch('pendSwatchRow',S.pend.color);});
  wireColorWheel('pendSwatchRowCustom',function(){return S.pend.color;},function(c){S.pend.color=c;markSwatch('pendSwatchRow',c);});

  // Editar categoría (modal)
  document.getElementById('editCatClose').onclick=closeEditCat;
  document.getElementById('editCatCancel').onclick=closeEditCat;
  document.getElementById('editCatBackdrop').addEventListener('click',function(e){if(e.target.id==='editCatBackdrop')closeEditCat();});
  document.getElementById('editCatSave').onclick=saveEditCat;
  document.getElementById('editCatName').addEventListener('input',function(e){S.editCat.newName=e.target.value;updateEditCatPreview();});
  document.getElementById('editCatSwatches').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.editCat.color=s.dataset.color;markSwatch('editCatSwatches',S.editCat.color);updateEditCatPreview();});
  wireColorWheel('editCatSwatchesCustom',function(){return S.editCat.color;},function(c){S.editCat.color=c;markSwatch('editCatSwatches',c);updateEditCatPreview();});

  // Historial: cabecera, buscador y menú de filtros
  wireHistHead();

  // Confirmación reutilizable
  document.getElementById('confirmCancel').onclick=closeConfirm;
  document.getElementById('confirmBackdrop').addEventListener('click',function(e){if(e.target.id==='confirmBackdrop')closeConfirm();});
  document.getElementById('confirmOk').onclick=function(){const cb=S.confirmCb;if(cb&&cb()===false)return;closeConfirm();};

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
  wireColorWheel('recurSwatchRowCustom',function(){return S.recur.color;},function(c){S.recur.color=c;markSwatch('recurSwatchRow',c);});

  // Metas (modal)
  document.getElementById('goalClose').onclick=closeGoalModal;
  document.getElementById('goalCancel').onclick=closeGoalModal;
  document.getElementById('goalBackdrop').addEventListener('click',function(e){if(e.target.id==='goalBackdrop')closeGoalModal();});
  document.getElementById('goalSave').onclick=saveGoal;
  document.getElementById('goalTarget').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('goalSaved').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('goalSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.goal.color=s.dataset.color;markSwatch('goalSwatchRow',S.goal.color);});
  wireColorWheel('goalSwatchRowCustom',function(){return S.goal.color;},function(c){S.goal.color=c;markSwatch('goalSwatchRow',c);});

  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeModal();closeActionMenu();closeMore();closeExport();closeCal();closePendModal();closeEditCat();closeConfirm();closeRecurModal();closeGoalModal();}});

  // Auto-ocultar barras al hacer scroll (animado)
  setupAutoHideBars();
  // Reajustar gráficos y layout al girar / cambiar tamaño
  setupResizeHandling();
}
/* Al rotar el teléfono o cambiar el tamaño, recalcula gráficos y pestañas
   para que nada quede fuera de la pantalla (sobre todo al volver a vertical). */
function setupResizeHandling(){
  let t=null;
  function reflow(){
    try{ Object.keys(S.charts||{}).forEach(function(k){ if(S.charts[k])S.charts[k].resize(); }); }catch(e){}
    const active=document.querySelector('.vtab.active'); if(active)moveTabInk(active);
    positionAllSegInks();
  }
  function onResize(){ clearTimeout(t); t=setTimeout(reflow,120); }
  window.addEventListener('resize',onResize);
  // En algunos WebView 'resize' tarda en reflejar el nuevo ancho tras girar; reforzamos.
  window.addEventListener('orientationchange',function(){ setTimeout(reflow,250); setTimeout(reflow,500); });
}
/* Oculta la barra superior y la inferior al bajar; las muestra al subir */
function setupAutoHideBars(){
  const appbar=document.querySelector('.appbar');
  const bottomNav=document.getElementById('bottomNav');
  if(!appbar)return;
  const THRESH=6;     // movimiento mínimo para reaccionar (evita parpadeo)
  const TOP_LOCK=72;  // cerca del tope siempre se muestran
  // En esta app el scroll vive en <body> (por overflow-x:hidden + height:100%),
  // no en window; leemos de donde realmente se desplace.
  function scrollPos(){
    return window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0;
  }
  let lastY=scrollPos(), ticking=false;
  function apply(hide){
    appbar.classList.toggle('bars-hidden',hide);
    if(bottomNav)bottomNav.classList.toggle('bars-hidden',hide);
    document.body.classList.toggle('bars-hidden',hide); // para que el aviso sin conexión siga al menú
  }
  function onScroll(){
    ticking=false;
    if(document.body.classList.contains('no-scroll')){lastY=scrollPos();return;}
    const y=scrollPos();
    if(y<=TOP_LOCK){apply(false);lastY=y;return;}
    const dy=y-lastY;
    if(Math.abs(dy)>THRESH){apply(dy>0);lastY=y;}
  }
  // Fase de captura: atrapa el scroll aunque ocurra en <body> u otro contenedor.
  window.addEventListener('scroll',function(){
    if(!ticking){ticking=true;requestAnimationFrame(onScroll);}
  },{capture:true,passive:true});
}
function setSeg(id,btn){if(window.Haptic&&Haptic.light)Haptic.light();document.querySelectorAll('#'+id+' button').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');moveSegInk(id);}
function moveSegInk(seg){
  if(typeof seg==='string')seg=document.getElementById(seg);
  if(!seg)return;
  const btn=seg.querySelector('button.active'); if(!btn||!btn.offsetWidth)return;
  let ink=seg.querySelector('.seg-ink');
  if(!ink){ink=document.createElement('span');ink.className='seg-ink';seg.appendChild(ink);}
  // Posición y tamaño solo con transform (compositado por GPU) → desliza fluido.
  // El ancho base del .seg-ink es 100px; lo escalamos al ancho real del botón.
  ink.style.transform='translateX('+btn.offsetLeft+'px) scaleX('+(btn.offsetWidth/100)+')';
  seg.classList.add('ink-ready');
}
function positionAllSegInks(){document.querySelectorAll('.segmented').forEach(function(s){moveSegInk(s);});}
/* Anima la salida de un item (colapsa + se desvanece) y luego ejecuta la baja real */
function animateRemove(el, then){
  if(window.Haptic)Haptic.heavy();
  if(!el){then();return;}
  el.style.maxHeight=el.offsetHeight+'px';
  el.classList.add('removing');
  void el.offsetWidth; // fija el estado inicial antes de transicionar
  el.style.maxHeight='0px'; el.style.opacity='0'; el.style.transform='translateX(-26px)';
  el.style.marginTop='0'; el.style.marginBottom='0'; el.style.paddingTop='0'; el.style.paddingBottom='0';
  let done=false; function fin(){if(done)return;done=true;then();}
  // Termina cuando acaba el colapso de altura (la última transición), no con la primera que llegue
  el.addEventListener('transitionend',function(e){if(e.propertyName==='max-height')fin();});
  setTimeout(fin,450);
}
/* Encuentra el elemento de lista que contiene el id, dentro de un contenedor */
function rowEl(containerId,id,itemSel){
  const b=document.querySelector('#'+containerId+' [data-id="'+id+'"]');
  return b?b.closest(itemSel):null;
}
/* Deja que la transición del slider (Día/Semana/Mes/Año) pinte primero y luego
   ejecuta el render pesado del panel en el siguiente frame, para que no se trabe. */
function deferRender(){
  // Sin pulseDash: el conteo de los KPIs y el morph de las gráficas ya hacen la transición.
  // Reanimar los contenedores encima trababa el canvas (compositing doble).
  requestAnimationFrame(function(){requestAnimationFrame(function(){renderAll();});});
}
/* Reanima las tarjetas del panel al cambiar de período/fecha */
function pulseDash(){
  if(S.view!=='dashboard')return;
  document.querySelectorAll('#view-dashboard .kpi-grid, #view-dashboard .donut-grid, #view-dashboard .dash-row').forEach(function(el){
    el.style.animation='none'; void el.offsetWidth; el.style.animation='dashSwap .42s var(--ease) both';
  });
}

/* ── Confirmación reutilizable ── */
function confirmAction(title,message,okLabel,cb){
  document.getElementById('confirmTitle').textContent=title||'¿Confirmar?';
  document.getElementById('confirmMsg').textContent=message||'';
  document.getElementById('confirmOk').textContent=okLabel||'Confirmar';
  S.confirmCb=cb;
  openBackdrop('confirmBackdrop');
}
function closeConfirm(){S.confirmCb=null;closeBackdrop('confirmBackdrop');}

/* ── Vistas ── */
function switchView(view,btn){
  if(view==='history'&&S.view!=='history')histReset_();
  S.view=view;
  document.querySelectorAll('.vtab').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
  ['dashboard','history','pending','categories','budgets','recurring','goals'].forEach(function(v){const el=document.getElementById('view-'+v);if(el)el.classList.toggle('hidden',v!==view);});
  // El calendario y Día/Semana/Mes/Año solo se muestran en el Panel
  const subbar=document.querySelector('.subbar');
  if(subbar)subbar.classList.toggle('hidden',view!=='dashboard');
  moveTabInk(btn);
  syncBottomNav(view);
  renderCurrentView();
  // Transición de entrada al cambiar de vista (se siente más pulido)
  const cur=document.getElementById('view-'+view);
  if(cur){cur.style.animation='none';void cur.offsetWidth;cur.style.animation='viewEnter .34s var(--ease) both';}
  requestAnimationFrame(positionAllSegInks);
}
/* Cambiar de vista desde la barra inferior, reutilizando la pestaña superior */
function goToView(view){
  const vt=document.querySelector('.vtab[data-view="'+view+'"]');
  if(vt)switchView(view,vt);
}
/* Resaltar el ítem correcto en la barra inferior (los secundarios marcan "Más") */
function syncBottomNav(view){
  const main=['dashboard','history','goals'];
  document.querySelectorAll('.bn-item').forEach(function(b){
    if(b.id==='bnMore')b.classList.toggle('active',main.indexOf(view)===-1);
    else b.classList.toggle('active',b.dataset.view===view);
  });
}
function openMore(){openBackdrop('moreBackdrop');}
function closeMore(){closeBackdrop('moreBackdrop');}
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
function moveTabInk(btn){const ink=document.getElementById('vtabInk');ink.style.transform='translateX('+btn.offsetLeft+'px) scaleX('+btn.offsetWidth+')';try{btn.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});}catch(e){}}

function renderAll(){
  document.getElementById('periodLabel').textContent=periodLabel(S.ref,S.period);
  renderCurrentView();
  const active=document.querySelector('.vtab.active'); if(active)moveTabInk(active);
  requestAnimationFrame(positionAllSegInks);
}
