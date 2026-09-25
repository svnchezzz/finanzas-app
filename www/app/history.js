/* app/history.js — Historial: filtros, buscador y lista de movimientos.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

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
/* ── Cabecera del historial: menú flotante de filtros (estilo iOS) ──────────
   Los filtros no ocupan una barra fija: salen de un botón redondo, con palomita
   en la opción activa, y el filtro vigente se lee como subtítulo del título. */
const HIST_TIPOS=[['all','Todos'],['Income','Ingresos'],['Expense','Gastos'],['Savings','Ahorro']];
const HIST_GRANOS=[['day','Por día'],['week','Por semana'],['month','Por mes'],['year','Por año']];
function histLabel_(lista,val){for(var i=0;i<lista.length;i++)if(lista[i][0]===val)return lista[i][1];return '';}
function histSyncHead(){
  const activo=(S.histType&&S.histType!=='all')||!!S.histSearch;
  // El botón se pinta del color del tipo filtrado (verde ingreso, rojo gasto,
  // azul ahorro); el punto rojo queda solo para la búsqueda sin tipo.
  const fb=document.getElementById('histFilterBtn');
  if(fb){
    fb.classList.remove('t-Income','t-Expense','t-Savings');
    if(S.histType&&S.histType!=='all')fb.classList.add('t-'+S.histType);
    const dot=fb.querySelector('.rb-dot');
    if(dot)dot.hidden=!(!!S.histSearch&&(!S.histType||S.histType==='all'));
  }
}
function histMenuHTML(){
  var i=0;
  function fila(grupo,val,txt,actual){
    return '<button type="button" class="im-item'+(val===actual?' on':'')+'" style="--i:'+(i++)+'" data-'+grupo+'="'+val+'">'+
      '<span>'+txt+'</span><svg class="im-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg></button>';
  }
  return '<div class="im-sec">Mostrar</div>'+
    HIST_TIPOS.map(function(t){return fila('ht',t[0],t[1],S.histType||'all');}).join('')+
    '<div class="im-div"></div><div class="im-sec">Agrupar por</div>'+
    HIST_GRANOS.map(function(g){return fila('grain',g[0],g[1],S.histGrain);}).join('');
}
function histMenuToggle(force){
  const pop=document.getElementById('histMenu'), btn=document.getElementById('histFilterBtn');
  const abrir=(force!==undefined)?force:!pop.classList.contains('show');
  if(abrir){
    pop.innerHTML=histMenuHTML();
    pop.classList.add('show'); btn.setAttribute('aria-expanded','true');
    const r=btn.getBoundingClientRect();
    requestAnimationFrame(function(){
      const w=pop.offsetWidth, pad=10;
      pop.style.left=Math.max(pad,Math.min(r.right-w,window.innerWidth-pad-w))+'px';
      pop.style.top=(r.bottom+8)+'px';
    });
  }else{ pop.classList.remove('show'); btn.setAttribute('aria-expanded','false'); }
}
/* Abrir/cerrar el buscador. Explícito, no alternando: así dos llamadas seguidas
   no lo dejan al revés. Se despliega desde la lupa (ver .hist-search en el CSS). */
function histSearchOpen(abrir){
  const row=document.getElementById('histSearchRow'), btn=document.getElementById('histSearchBtn'),
        inp=document.getElementById('histSearch');
  if(!row||!btn)return;
  if(abrir){
    row.classList.remove('hidden','out');
    setTimeout(function(){inp.focus({preventScroll:true});},80);
  }else{
    if(inp&&inp.value){inp.value='';S.histSearch='';histReset_();histSyncHead();renderHistory();}
    if(inp)inp.blur();
    row.classList.add('out');
    setTimeout(function(){row.classList.add('hidden');row.classList.remove('out');},170);
  }
  btn.classList.toggle('on',abrir); btn.setAttribute('aria-expanded',String(abrir));
}
/* El círculo rebota al cambiar de tipo, para que se note que tomó su color */
function popFiltro_(){
  const b=document.getElementById('histFilterBtn'); if(!b)return;
  b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop');
  setTimeout(function(){b.classList.remove('pop');},480);
}
function wireHistHead(){
  const btn=document.getElementById('histFilterBtn'), pop=document.getElementById('histMenu'),
        sBtn=document.getElementById('histSearchBtn'),
        row=document.getElementById('histSearchRow'), inp=document.getElementById('histSearch'),
        clr=document.getElementById('histSearchClear');
  if(!btn||!pop)return;
  btn.onclick=function(e){e.stopPropagation();if(window.Haptic&&Haptic.light)Haptic.light();histMenuToggle();};
  pop.addEventListener('click',function(e){
    const it=e.target.closest('.im-item'); if(!it)return;
    if(window.Haptic&&Haptic.light)Haptic.light();
    if(it.dataset.ht!==undefined){
      const cambio=S.histType!==it.dataset.ht; S.histType=it.dataset.ht;
      if(cambio)popFiltro_();
    }else S.histGrain=it.dataset.grain;
    histReset_(); histMenuToggle(false); histSyncHead(); renderHistory();
  });
  document.addEventListener('pointerdown',function(e){
    if(pop.classList.contains('show')&&!pop.contains(e.target)&&!btn.contains(e.target))histMenuToggle(false);
  },true);
  if(sBtn)sBtn.onclick=function(){histSearchOpen(row.classList.contains('hidden'));};
  let searchT=0;
  if(inp)inp.addEventListener('input',function(e){S.histSearch=e.target.value;clearTimeout(searchT);searchT=setTimeout(function(){histReset_();histSyncHead();renderHistory();},120);});
  // La X cierra la barra (y de paso limpia): antes solo borraba el texto y además
  // quedaba de 0px, así que no se podía tocar.
  if(clr)clr.onclick=function(e){e.stopPropagation();histSearchOpen(false);};
  histSyncHead();
}
function histReset_(){S.histLimit=50;}
function renderHistory(){
  histSyncHead();
  const grain=S.histGrain, wrap=document.getElementById('historyList');
  // Al pulsar "Ver más" se repinta la lista completa: sin esto la animación de
  // entrada vuelve a correr en todos los grupos y se ve un parpadeo.
  const ampliando=!!S._histAppend; S._histAppend=false;
  wrap.classList.toggle('no-anim',ampliando);
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
  // Ordenado global (lo más nuevo primero) para poder cortar en 50 sin descuadrar
  // los grupos: pintar cientos de filas en cada render hace lento el historial.
  MOV.sort(function(a,b){return (a.date+(a.timestamp||''))<(b.date+(b.timestamp||''))?1:-1;});
  const total=MOV.length, tope=S.histLimit||50;
  const resto=Math.max(0,total-tope);
  if(resto)MOV=MOV.slice(0,tope);
  if(!MOV.length){wrap.innerHTML=(q||S.histType!=='all')?emptyState(ICON.receipt,'Sin resultados','No hay movimientos para este filtro o búsqueda.'):emptyState(ICON.receipt,'Sin movimientos','Aún no registras nada en este periodo.');return;}
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
    // 8 · un grupo donde todo está por cobrar/pagar no tiene "neto": decir "$ 0"
    // hacía pensar que el movimiento no valía nada.
    const nPend=g.items.length-real.length;
    const chip=real.length
      ? '<span class="hist-group-net" style="color:'+(net>=0?'var(--pos)':'var(--neg)')+'">'+money(net)+' neto</span>'
      : '<span class="hist-group-net pend">'+nPend+(nPend===1?' pendiente':' pendientes')+'</span>';
    block+='<div class="hist-group-head"><span class="hist-group-title">'+histGroupTitle(grain,k)+'</span>'+chip+'</div>';
    if(grain==='year')block+='<div class="year-summary">'+ysCell('Ingresos',inc,'var(--pos)')+ysCell('Gastos',exp,'var(--neg)')+ysCell('Ahorro',sav,'var(--sav)')+'</div>';
    else block+='<div class="hist-rows">'+g.items.map(rowHTML).join('')+'</div>';
    block+='</div>'; return block;
  }).join('')
  + (resto?'<button class="btn-ghost hist-more" id="histMore">Ver '+Math.min(50,resto)+' más · quedan '+resto+'</button>':'');
  const more=document.getElementById('histMore');
  if(more)more.onclick=function(){S._histAppend=true;S.histLimit=(S.histLimit||50)+50;renderHistory();};
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
  // Agrupado por día, el encabezado ya dice la fecha: repetirla en cada fila solo
  // gasta la línea que sirve para la nota, el método o el origen del dinero.
  let meta=(S.histGrain==='day')?'':(DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]);
  const sep=function(){return meta?' · ':'';};
  if(t._fromPending)meta+=sep()+(t.type==='Income'?'por cobrar':'por pagar')+(t.method?' · '+esc(t.method):'');
  if(t.note)meta+=sep()+esc(t.note);
  if(t.source)meta+=sep()+(t.source==='Salary'?'Disponible actual':t.source==='Other'?'Nuevo ingreso':t.source==='Savings'?'desde ahorro':t.source);
  const sign=t.type==='Income'?'+':'−';
  const del=t._fromPending?'data-pend="'+t._pendId+'"':'data-id="'+esc(t.id)+'"';
  const rowCls='hist-row'+(t._fromPending?' is-pend':'')+(t._fromPending&&t._pendKey!=='completed'?' is-unrealized':'');
  const statePill=t._fromPending?'<span class="hr-state '+t._pendKey+'">'+t._pendLabel+'</span>':'';
  return '<div class="'+rowCls+'"><span class="hr-ava" style="background:'+safeColor(t.color)+'22;color:'+safeColor(t.color)+'">'+catIcon(t.category,t.type)+'</span>'+
    '<div class="hr-main"><span class="hr-cat">'+esc(t.category)+statePill+'</span><span class="hr-meta">'+meta+'</span></div>'+
    '<span class="hr-amt '+t.type+'">'+sign+money(t.amount)+'</span>'+
    '<button class="hr-edit" '+del+' title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
    '<button class="hr-del" '+del+' title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button></div>';
}
