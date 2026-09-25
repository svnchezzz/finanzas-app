/* app/movement.js — Menú de acción, modal de movimiento, calendario, rueda de color y vínculo con metas.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Menú de acción ── */
function openActionMenu(){openBackdrop('actionBackdrop');const ab=document.getElementById('addBtn');if(ab)ab.classList.add('menu-open');}
function closeActionMenu(){closeBackdrop('actionBackdrop');const ab=document.getElementById('addBtn');if(ab)ab.classList.remove('menu-open');}

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
  setDate_('dateInput',editing?tx.date:ymd(new Date()));
  document.getElementById('newCatRow').classList.remove('show'); document.getElementById('newCatInput').value='';
  document.getElementById('txColorRow').classList.add('hidden');
  document.getElementById('sourceRow').classList.toggle('hidden',type!=='Savings');
  document.getElementById('fromSavingsRow').classList.toggle('hidden',type!=='Expense');
  document.getElementById('fromSavings').checked=editing&&tx.source==='Savings';
  const srcVal=(editing&&type==='Savings')?(tx.source==='Other'?'Other':'Salary'):'Salary';
  document.querySelectorAll('#sourceSeg button').forEach(function(b){b.classList.toggle('active',b.dataset.source===srcVal);});
  if(type==='Savings')S.modal.source=srcVal;
  document.getElementById('sourceHint').textContent=srcVal==='Salary'?'Se descuenta de tu disponible actual.':'Es un nuevo ingreso (no afecta tu disponible actual).';
  setupGoalRow_(type,editing);
  setupExpGoalRow_((editing&&tx&&tx.source==='Savings'&&tx._goalId)?String(tx._goalId):'');
  buildChips(type); buildSwatches();
  if(editing){
    S.modal.category=tx.category; S.modal.color=tx.color;
    markChip('chipRow',tx.category); markSwatch('swatchRow',tx.color);
  }else{
    const first=(S.categories[type]||[])[0];
    S.modal.color=first?first.color:(paletteFor(type)[0]||'#4F46E5'); markSwatch('swatchRow',S.modal.color);
  }
  openBackdrop('modalBackdrop',positionAllSegInks);
  setTimeout(function(){document.getElementById('amountInput').focus({preventScroll:true});},250);
}
function markChip(rowId,name){const chips=document.querySelectorAll('#'+rowId+' .chip');chips.forEach(function(c){c.classList.toggle('active',c.dataset.name===name);});}
function closeModal(){closeBackdrop('modalBackdrop');}

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
  opts+='<option value="__new__">+ Crear nueva meta…</option>';
  sel.innerHTML=opts; sel.value='';
  sel.onchange=function(){ document.getElementById('txNewGoalRow').classList.toggle('hidden', sel.value!=='__new__'); };
  if(tgtI && !tgtI._wired){ tgtI._wired=true; tgtI.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);}); }
}
/* ── ¿De qué bolsillo del ahorro sale un gasto pagado con ahorro? ──
   Se muestra solo cuando el gasto está marcado como "pagar con el ahorro".
   preselect: id de meta a dejar elegida ('' = ahorro general). Si no se pasa,
   conserva lo que ya estuviera seleccionado. */
function setupExpGoalRow_(preselect){
  const row=document.getElementById('expGoalRow'); if(!row) return;
  const chk=document.getElementById('fromSavings');
  const show=(S.modal.type==='Expense' && chk && chk.checked);
  row.classList.toggle('hidden', !show);
  const sel=document.getElementById('expGoalSelect'); if(!sel) return;
  // Se reconstruye aunque esté oculto: así no queda elegida la meta de un
  // movimiento anterior cuando se vuelve a marcar "pagar con el ahorro".
  const want=(preselect==null)?(sel.value||''):String(preselect);
  let opts='<option value="">Ahorro general ('+money(ahorroGeneral())+' disponible)</option>';
  (S.goals||[]).forEach(function(g){
    opts+='<option value="'+esc(String(g.id))+'">'+esc(g.name)+' ('+money(g.saved)+' disponible)</option>';
  });
  sel.innerHTML=opts;
  sel.value=want; if(sel.selectedIndex<0)sel.value='';
  sel.onchange=updateExpGoalHint_;
  updateExpGoalHint_();
}
function updateExpGoalHint_(){
  const sel=document.getElementById('expGoalSelect'), hint=document.getElementById('expGoalHint');
  if(!sel||!hint)return;
  const g=sel.value?(S.goals||[]).find(function(x){return String(x.id)===String(sel.value);}):null;
  hint.textContent=g
    ? ('Se descuenta de "'+g.name+'", que tiene '+money(g.saved)+'.')
    : ('Sale del ahorro que no está apartado en ninguna meta ('+money(ahorroGeneral())+').');
}
/* Id de la meta elegida como origen de un gasto pagado con ahorro ('' = general). */
function expGoalSel_(){
  const row=document.getElementById('expGoalRow'), sel=document.getElementById('expGoalSelect');
  if(!row||!sel||row.classList.contains('hidden'))return '';
  return sel.value||'';
}
/* Un gasto pagado con el ahorro de una meta baja lo ahorrado de esa meta. */
function aplicarGastoDesdeMeta_(t){
  if(!isFromSavings(t)||!t._goalId)return;
  const g=(S.goals||[]).find(function(x){return String(x.id)===String(t._goalId);}); if(!g)return;
  adjustGoalSaved_(g,-t.amount);
  toast('Descontado de "'+g.name+'"','info');
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
    gs('addGoal',g).then(function(saved){const i=S.goals.findIndex(function(x){return x.id===temp.id;});if(i>=0&&saved)S.goals[i]=saved;if(S.view==='goals')renderGoals();successFx();toast('Meta creada y aporte sumado','ok');if(window.Notif)evalGoal(saved||temp,true);})
      .catch(function(){S.goals=S.goals.filter(function(x){return x.id!==temp.id;});if(S.view==='goals')renderGoals();toast('No se pudo crear la meta','err');});
  }else{
    const g=S.goals.find(function(x){return x.id===metaSel;}); if(!g) return;
    const prev=g.saved; g.saved=Math.max(0,g.saved+amount); if(S.view==='goals')renderGoals();
    if(g.target&&prev<g.target&&g.saved>=g.target)celebrate(g.color);
    gs('contributeGoal',metaSel,amount).then(function(res){if(res&&typeof res.saved==='number'){g.saved=res.saved;if(S.view==='goals')renderGoals();}toast('Aporte sumado a "'+g.name+'"','ok');if(window.Notif)evalGoal(g,true);})
      .catch(function(){g.saved=prev;if(S.view==='goals')renderGoals();toast('No se pudo sumar a la meta','err');});
  }
}
/* ── Calendario propio para los campos de fecha ──────────────────────────
   Sustituye al selector nativo del sistema: se veía ajeno a la app y en el
   celular abre el diálogo del SO. Mismo look que el calendario de la cabecera. */
var DatePick=(function(){
  var pop,view,cur,cb,openFor;
  function build(){
    pop=document.createElement('div'); pop.className='cal-pop dp';
    document.body.appendChild(pop);
    document.addEventListener('pointerdown',function(e){
      if(pop.classList.contains('show')&&!pop.contains(e.target)&&!(openFor&&openFor.contains(e.target)))close();
    },true);
    window.addEventListener('resize',function(){if(pop.classList.contains('show'))close();});
  }
  function render(){
    var y=view.getFullYear(), m=view.getMonth();
    var startDow=(new Date(y,m,1).getDay()+6)%7, dim=new Date(y,m+1,0).getDate();
    var hoy=ymd(sod(new Date())), cells='';
    function cell(d,other){
      var v=ymd(d);
      return '<div class="cal-day'+(other?' other':'')+(v===hoy?' today':'')+(v===cur?' sel':'')+'" data-d="'+v+'">'+d.getDate()+'</div>';
    }
    for(var i=0;i<startDow;i++)cells+=cell(new Date(y,m,1-(startDow-i)),true);
    for(var d=1;d<=dim;d++)cells+=cell(new Date(y,m,d),false);
    var trail=(7-((startDow+dim)%7))%7;
    for(var t=1;t<=trail;t++)cells+=cell(new Date(y,m+1,t),true);
    var dows=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(x){return '<div class="cal-dow">'+x+'</div>';}).join('');
    pop.innerHTML='<div class="cal-head">'+
      '<div class="cal-navs"><button type="button" class="cal-nav" data-dp="py" aria-label="Año anterior">«</button><button type="button" class="cal-nav" data-dp="pm" aria-label="Mes anterior">‹</button></div>'+
      '<div class="cal-title">'+capFirst(MESES[m])+' '+y+'</div>'+
      '<div class="cal-navs"><button type="button" class="cal-nav" data-dp="nm" aria-label="Mes siguiente">›</button><button type="button" class="cal-nav" data-dp="ny" aria-label="Año siguiente">»</button></div>'+
      '</div><div class="cal-grid">'+dows+cells+'</div>'+
      '<div class="cal-foot"><button type="button" class="btn-ghost cal-today-btn">Hoy</button></div>';
    pop.querySelectorAll('[data-dp]').forEach(function(b){b.onclick=function(e){e.preventDefault();e.stopPropagation();
      var a=b.dataset.dp;
      if(a==='pm')view.setMonth(view.getMonth()-1); else if(a==='nm')view.setMonth(view.getMonth()+1);
      else if(a==='py')view.setFullYear(view.getFullYear()-1); else view.setFullYear(view.getFullYear()+1);
      render();};});
    pop.querySelectorAll('.cal-day').forEach(function(c){c.onclick=function(e){e.preventDefault();e.stopPropagation();pick(c.dataset.d);};});
    pop.querySelector('.cal-today-btn').onclick=function(e){e.preventDefault();e.stopPropagation();pick(ymd(new Date()));};
  }
  function pick(v){var f=cb; close(); if(f)f(v);}
  function place(){
    var r=openFor.getBoundingClientRect(), pad=8, w=pop.offsetWidth, h=pop.offsetHeight;
    var left=Math.min(Math.max(pad,r.left),Math.max(pad,window.innerWidth-pad-w));
    var top=r.bottom+pad; if(top+h>window.innerHeight-pad)top=Math.max(pad,r.top-pad-h);
    pop.style.left=left+'px'; pop.style.top=top+'px';
  }
  function open(trigger,value,onPick){
    if(!pop)build();
    openFor=trigger; cb=onPick; cur=value||ymd(new Date());
    view=parseYMD(cur); view.setDate(1);
    render(); pop.classList.add('show');
    requestAnimationFrame(place);
  }
  function close(){if(pop)pop.classList.remove('show');cb=null;openFor=null;}
  return {open:open,close:close};
})();
/* El campo de fecha es un botón con la fecha en bonito + un input oculto con el
   valor ISO, así todo el código que lee o escribe .value sigue igual. */
function fmtFecha_(v){if(!v)return '—';var d=parseYMD(v);return d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();}
function setDate_(id,val){
  var inp=document.getElementById(id); if(!inp)return;
  inp.value=val||'';
  var txt=document.querySelector('.date-field[data-for="'+id+'"] .df-txt');
  if(txt)txt.textContent=fmtFecha_(inp.value);
}
function wireDateFields(){
  document.querySelectorAll('.date-field').forEach(function(btn){
    if(btn._wired)return; btn._wired=true;
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var id=btn.dataset.for, inp=document.getElementById(id);
      DatePick.open(btn,inp?inp.value:'',function(v){setDate_(id,v);});
    });
  });
}
/* El teclado del celular no encoge la página: sin esto el modal queda debajo
   del teclado y hay que hacer scroll a ciegas. Publica su alto en --kb. */
function trackKeyboard(){
  var vv=window.visualViewport; if(!vv)return;
  var ultimo=-1;
  function upd(){
    // Solo el alto: mientras el teclado entra, el navegador desplaza el viewport
    // visual y ese offsetTop transitorio hacía subir la hoja de más para luego
    // devolverla. Con el alto solo, el valor es estable de una vez.
    var kb=Math.max(0,Math.round(window.innerHeight-vv.height));
    if(kb===ultimo)return; ultimo=kb;
    document.documentElement.style.setProperty('--kb',kb+'px');
    document.body.classList.toggle('kb-open',kb>60);
  }
  vv.addEventListener('resize',upd); upd();
  // El navegador ya lleva el campo enfocado a la vista; aquí solo se corrige si
  // de verdad quedó fuera del modal, y sin animación (si no, se ve doble salto).
  document.addEventListener('focusin',function(e){
    var t=e.target, m=(t&&t.closest)?t.closest('.modal'):null; if(!m)return;
    setTimeout(function(){
      var r=t.getBoundingClientRect(), b=m.getBoundingClientRect();
      if(r.top<b.top+8||r.bottom>b.bottom-8){try{t.scrollIntoView({block:'nearest'});}catch(_){}}
    },320);
  });
}

function buildChips(type){
  S.modal.category=chipRow('chipRow',S.categories[type]||[],null,{icons:true,add:true});
}
function selectChip(chip){pickChip('chipRow',chip,S.modal,'swatchRow');}
function buildSwatches(){document.getElementById('swatchRow').innerHTML=swatchesHtml(paletteFor(S.modal.type)||[]);}
function markSwatch(id,color){
  let matched=false;
  document.querySelectorAll('#'+id+' .swatch').forEach(function(s){var on=s.dataset.color===color;s.classList.toggle('active',on);s.setAttribute('aria-pressed',on);if(on)matched=true;});
  const cp=document.getElementById(id+'Custom');
  if(cp){var valid=/^#[0-9a-fA-F]{6}$/.test(color||'');cp.classList.toggle('active',!matched&&valid);if(valid)cp.dataset.color=color;}
}

/* ── Rueda de color (círculo cromático) reutilizable ──────────────────────
   Reemplaza el selector nativo del SO por un círculo cromático propio + un
   recuadro para escribir/ver el código de color. Se abre junto al botón. */
function hsvToRgb(h,s,v){
  h=((h%360)+360)%360; var c=v*s, x=c*(1-Math.abs((h/60)%2-1)), m=v-c, r=0,g=0,b=0;
  if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
  else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
  return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
}
function hsvToHex(h,s,v){return '#'+hsvToRgb(h,s,v).map(function(n){return ('0'+n.toString(16)).slice(-2);}).join('').toUpperCase();}
function hexToHsv(hex){
  hex=String(hex||'').replace('#','');
  if(!/^[0-9a-fA-F]{6}$/.test(hex))hex='4F46E5';
  var r=parseInt(hex.slice(0,2),16)/255,g=parseInt(hex.slice(2,4),16)/255,b=parseInt(hex.slice(4,6),16)/255;
  var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0;
  if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360;}
  return {h:h,s:mx?d/mx:0,v:mx};
}
var ColorWheel=(function(){
  var pop,wheel,dim,thumb,valSlider,hexInput,preview,cb,openFor,h=0,s=0,v=1,dragging=false;
  function build(){
    pop=document.createElement('div');pop.className='cw-pop';
    pop.innerHTML='<div class="cw-wheel"><span class="cw-dim"></span><span class="cw-thumb"></span></div>'+
      '<input type="range" class="cw-val" min="0" max="100" value="100" aria-label="Brillo">'+
      '<div class="cw-foot"><span class="cw-preview"></span>'+
      '<label class="cw-hexwrap"><span class="cw-hash">#</span>'+
      '<input type="text" class="cw-hex" maxlength="6" spellcheck="false" autocomplete="off" placeholder="RRGGBB" aria-label="Código de color"></label></div>';
    document.body.appendChild(pop);
    wheel=pop.querySelector('.cw-wheel');dim=pop.querySelector('.cw-dim');thumb=pop.querySelector('.cw-thumb');
    valSlider=pop.querySelector('.cw-val');hexInput=pop.querySelector('.cw-hex');preview=pop.querySelector('.cw-preview');
    function pick(e){
      var r=wheel.getBoundingClientRect(),rad=r.width/2;
      var px=(e.touches?e.touches[0].clientX:e.clientX)-(r.left+rad);
      var py=(e.touches?e.touches[0].clientY:e.clientY)-(r.top+rad);
      var dist=Math.sqrt(px*px+py*py),ang=Math.atan2(py,px)*180/Math.PI;
      h=(ang+360)%360;s=Math.min(1,dist/rad);apply(true);
    }
    wheel.addEventListener('pointerdown',function(e){dragging=true;try{wheel.setPointerCapture(e.pointerId);}catch(_){}pick(e);e.preventDefault();});
    wheel.addEventListener('pointermove',function(e){if(dragging)pick(e);});
    wheel.addEventListener('pointerup',function(){dragging=false;});
    wheel.addEventListener('pointercancel',function(){dragging=false;});
    valSlider.addEventListener('input',function(){v=valSlider.value/100;apply(true);});
    hexInput.addEventListener('input',function(){
      var hx=hexInput.value.replace(/[^0-9a-fA-F]/g,'').slice(0,6);
      if(hx!==hexInput.value)hexInput.value=hx; // descarta el # y caracteres inválidos
      if(/^[0-9a-fA-F]{6}$/.test(hx)){var c=hexToHsv(hx);h=c.h;s=c.s;v=c.v;apply(false);}
    });
    document.addEventListener('pointerdown',function(e){if(pop.classList.contains('show')&&!pop.contains(e.target)&&e.target!==openFor)close();},true);
    window.addEventListener('resize',function(){if(pop.classList.contains('show'))close();});
  }
  function positionThumb(){
    var r=wheel.clientWidth/2,a=h*Math.PI/180;
    thumb.style.left=(r+Math.cos(a)*s*r)+'px';thumb.style.top=(r+Math.sin(a)*s*r)+'px';
  }
  function updateChrome(){
    var hex=hsvToHex(h,s,v);
    thumb.style.background=hex;preview.style.background=hex;
    dim.style.opacity=String(1-v);
    valSlider.style.setProperty('--cw-hue',hsvToHex(h,s,1));
  }
  function apply(syncHex){
    var hex=hsvToHex(h,s,v);
    positionThumb();updateChrome();
    if(syncHex)hexInput.value=hex.slice(1); // el # es un prefijo fijo, no editable
    if(cb)cb(hex);
  }
  function open(trigger,color,onPick){
    if(!pop)build();
    cb=onPick;openFor=trigger;
    var c=hexToHsv(color);h=c.h;s=c.s;v=c.v;
    pop.classList.add('show');
    apply(true);
    requestAnimationFrame(function(){
      var tr=trigger.getBoundingClientRect(),pw=pop.offsetWidth,ph=pop.offsetHeight,pad=8;
      var left=tr.left,top=tr.bottom+pad;
      if(left+pw>window.innerWidth-pad)left=window.innerWidth-pad-pw;
      if(top+ph>window.innerHeight-pad)top=tr.top-pad-ph;
      pop.style.left=Math.max(pad,left)+'px';pop.style.top=Math.max(pad,top)+'px';
      positionThumb();
    });
  }
  function close(){if(pop)pop.classList.remove('show');cb=null;openFor=null;dragging=false;}
  return {open:open,close:close};
})();
/* Conecta un botón .swatch-custom para que abra la rueda de color. */
function wireColorWheel(btnId,getColor,setColor){
  var btn=document.getElementById(btnId);if(!btn)return;
  btn.addEventListener('click',function(e){e.preventDefault();ColorWheel.open(btn,getColor(),setColor);});
}
function onNewCategoryInModal(){
  const input=document.getElementById('newCatInput'), name=(input.value||'').trim(); if(!name){toast('Ingresa un nombre','err');return;}
  const type=S.modal.type, color=S.modal.color||(paletteFor(type)[0]||'#4F46E5');
  if((S.categories[type]||[]).some(function(c){return c.name.toLowerCase()===name.toLowerCase();})){toast('Ya existe','info');}
  else{S.categories[type].push({name:name,color:color});gs('addCategory',type,name,color).catch(function(){toast('Guardado solo localmente','info');});}
  buildChips(type);
  const chips=document.querySelectorAll('#chipRow .chip');
  for(let i=0;i<chips.length;i++){if(chips[i].dataset.name===name){selectChip(chips[i]);break;}}
  document.getElementById('newCatRow').classList.remove('show'); document.getElementById('txColorRow').classList.add('hidden'); input.value='';
}
function saveTx(){
  const amount=parseInt(String(document.getElementById('amountInput').value).replace(/\D/g,''),10)||0;
  if(amount<=0){shakeAmount('amountInput');toast('Ingresa un monto','err');return;}
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
  // El gasto pagado con ahorro guarda de qué meta salió ('' = ahorro general).
  if(tx.type==='Expense')tx._goalId=(tx.source==='Savings'?(expGoalSel_()||null):null);
  const editId=S.modal.id;
  // Gasto desde el ahorro: no permitir gastar más de lo que hay en el bolsillo elegido
  // (la meta seleccionada o el ahorro general); sí permite gastar exactamente el saldo.
  if(tx.type==='Expense' && tx.source==='Savings'){
    let disponible=saldoBolsilloAhorro(tx._goalId);
    if(editId){
      const prevTx=S.transactions.find(function(t){return t.id===editId;});
      // Solo se devuelve el monto anterior si salía del mismo bolsillo: si cambió de
      // bolsillo, el anterior se reintegra aparte y este saldo ya está actualizado.
      if(prevTx&&isFromSavings(prevTx)&&String(prevTx._goalId||'')===String(tx._goalId||''))disponible+=prevTx.amount;
    }
    if(amount>disponible){
      const g=tx._goalId?(S.goals||[]).find(function(x){return String(x.id)===String(tx._goalId);}):null;
      toast('Saldo insuficiente · '+(g?'en "'+g.name+'" hay ':'en el ahorro general hay ')+money(disponible),'err');return;
    }
  }
  // Ahorro que sale de tu bolsillo (salario/ingreso): no puede dejar tu disponible en negativo
  if(tx.type==='Savings' && tx.source!=='Other'){
    let disponible=disponibleReal();
    if(editId){const prevTx=S.transactions.find(function(t){return t.id===editId;});if(prevTx&&prevTx.type==='Savings'&&prevTx.source!=='Other')disponible+=prevTx.amount;}
    if(amount>disponible){toast('Saldo insuficiente · disponible '+money(disponible),'err');return;}
  }
  // Gasto normal: no puede superar tu disponible real (dejaría el saldo en negativo)
  if(tx.type==='Expense' && tx.source!=='Savings'){
    let disponible=disponibleReal();
    if(editId){const prevTx=S.transactions.find(function(t){return t.id===editId;});if(prevTx&&prevTx.type==='Expense'&&prevTx.source!=='Savings')disponible+=prevTx.amount;}
    if(amount>disponible){toast('Saldo insuficiente · disponible '+money(disponible),'err');return;}
  }
  closeModal();
  if(editId){
    const idx=S.transactions.findIndex(function(t){return t.id===editId;});
    if(idx<0)return;
    const prev=S.transactions[idx];
    const merged=Object.assign({},prev,tx,{id:editId});
    S.transactions[idx]=merged;
    S.ref=parseYMD(tx.date); renderAll();
    gs('updateTransaction',editId,merged).then(function(){successFx();toast('Movimiento actualizado','ok');
      syncGoalOnEdit_(prev,merged);
      if(window.Notif){ if(tx.type==='Expense')evalBudget(tx.category,true); if(prev&&prev.category&&prev.category!==tx.category)evalBudget(prev.category,true); scheduleDailyReminders(); }})
      .catch(function(){S.transactions[idx]=prev;renderAll();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now(),timestamp:new Date().toISOString()},tx);
    S.transactions.push(temp); S.ref=parseYMD(tx.date); renderAll();
    gs('addTransaction',tx).then(function(saved){const i=S.transactions.findIndex(function(t){return t.id===temp.id;});if(i>=0)S.transactions[i]=saved;renderAll();successFx();toast(TXT.guardado+' · '+money(amount),'ok');aplicarMetaAhorro_(metaSel,metaNewName,metaNewTarget,amount);aplicarGastoDesdeMeta_(saved||temp);if(window.Notif){if(tx.type==='Expense')evalBudget(tx.category,true);scheduleDailyReminders();}})
      .catch(function(){S.transactions=S.transactions.filter(function(t){return t.id!==temp.id;});renderAll();toast(TXT.errGuardar,'err');});
  }
}
/* Encuentra la meta vinculada a un movimiento: por _goalId (aportes/retiros de
   meta y gastos pagados con el ahorro de una meta) o, para los ahorros, por
   nombre de categoría (las aportaciones a meta usan el nombre de la meta). */
function goalForTx_(t){
  if(!t)return null;
  if(t._goalId){const g=S.goals.find(function(x){return String(x.id)===String(t._goalId);});if(g)return g;}
  if(t.type!=='Savings')return null;
  return S.goals.find(function(g){return g.name===t.category;})||null;
}
/* Cuánto suma (+) o resta (−) ese movimiento a lo ahorrado de su meta. */
function goalDeltaOf_(t){
  if(!goalForTx_(t))return 0;
  if(t.type==='Savings')return t.amount;      // el monto ya viene firmado (aporte o retiro)
  if(isFromSavings(t))return -t.amount;       // gasto pagado con el ahorro de la meta
  return 0;
}
/* Ajusta lo ahorrado de una meta (local + backend) cuando se edita/elimina su movimiento. */
function adjustGoalSaved_(goal,delta){
  if(!goal||!delta)return;
  goal.saved=Math.max(0,(goal.saved||0)+delta);
  if(S.view==='goals')renderGoals();
  gs('contributeGoal',goal.id,delta).then(function(res){if(res&&typeof res.saved==='number'){goal.saved=res.saved;if(S.view==='goals')renderGoals();}}).catch(function(){});
}
/* Reconcilia la meta cuando se EDITA un movimiento (cambia monto, tipo o categoría). */
function syncGoalOnEdit_(prev,now){
  const oldGoal=goalForTx_(prev), oldC=goalDeltaOf_(prev);
  const newGoal=goalForTx_(now),  newC=goalDeltaOf_(now);
  if(oldGoal&&oldGoal===newGoal){adjustGoalSaved_(oldGoal,newC-oldC);return;}
  if(oldGoal&&oldC)adjustGoalSaved_(oldGoal,-oldC);
  if(newGoal&&newC)adjustGoalSaved_(newGoal,newC);
}
function removeTx(id){
  const tx=S.transactions.find(function(t){return t.id===id;}); if(!tx)return;
  confirmAction('Eliminar movimiento','Vas a eliminar "'+tx.category+'" por '+money(tx.amount)+'. Esta acción no se puede deshacer.','Eliminar',function(){
    const idx=S.transactions.findIndex(function(t){return t.id===id;}); if(idx<0)return;
    animateRemove(rowEl('historyList',id,'.hist-row'),function(){
    const removed=S.transactions[idx]; S.transactions.splice(idx,1); renderAll();
    if(window.Notif){ if(tx.type==='Expense')evalBudget(tx.category,true); scheduleDailyReminders(); }
    gs('deleteTransaction',id).then(function(){toast(TXT.eliminado,'ok');const g=goalForTx_(removed);if(g)adjustGoalSaved_(g,-goalDeltaOf_(removed));})
      .catch(function(){S.transactions.splice(idx,0,removed);renderAll();toast(TXT.errBorrar,'err');});
    });
  });
}
