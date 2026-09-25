/* app/pending.js — Pendientes: vista y modal.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Pendientes (vista) ── */
function renderPending(){
  const wrap=document.getElementById('pendList');
  let items=S.pendings.slice().sort(function(a,b){return (a.dueDate||'')<(b.dueDate||'')?-1:1;});
  const f=S.pendFilter;
  if(f!=='all')items=items.filter(function(p){return pendStatus(p).key===f;});
  if(!items.length){wrap.innerHTML=emptyState(ICON.pending,'No hay pendientes',f!=='all'?'No hay pendientes en este filtro.':'Registra ingresos o pagos por cobrar/pagar y aparecerán aquí.');return;}
  wrap.innerHTML=items.map(function(p,i){
    const st=pendStatus(p);
    const fecha=p.dueDate?fechaLarga(p.dueDate):'sin fecha';
    return '<div class="pend-item s-'+st.key+'" style="animation-delay:'+(i*30)+'ms">'+
      '<span class="pend-dot" style="background:'+safeColor(p.color)+'"></span>'+
      '<div class="pend-main">'+
        '<span class="pend-cat">'+esc(p.category||'(sin categoría)')+'<span class="pend-kind '+p.kind+'">'+(p.kind==='Income'?'Ingreso':'Pago')+'</span></span>'+
        '<span class="pend-meta"><span>'+ICON.cal+fecha+'</span><span>'+ICON.card+esc(p.method||'—')+'</span>'+(p.note?'<span>'+ICON.note+esc(p.note)+'</span>':'')+'</span>'+
      '</div>'+
      '<span class="pend-amt">'+money(p.amount)+'</span>'+
      '<span class="pend-pill '+st.key+'">'+st.label+'</span>'+
      '<div class="pend-acts">'+
        '<button class="pend-act done" data-act="done" data-id="'+esc(p.id)+'" title="'+(p.status==='completed'?'Reabrir':'Marcar completado')+'" aria-label="'+(p.status==='completed'?'Reabrir':'Completar')+'">'+(p.status==='completed'?ICON.undo:ICON.check)+'</button>'+
        '<button class="pend-act" data-act="edit" data-id="'+esc(p.id)+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+esc(p.id)+'" title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('.pend-act').forEach(function(b){b.onclick=function(){
    const id=b.dataset.id, act=b.dataset.act;
    if(act==='done')togglePendDone(id); else if(act==='edit')openPendModal(id); else removePending(id);
  };});
}
function fechaLarga(ymdStr){const d=parseYMD(ymdStr);return DOW[d.getDay()]+' '+d.getDate()+' '+MON[d.getMonth()]+' '+d.getFullYear();}

function refreshPend(){renderPending();if(S.view==='dashboard')renderDashboard();}

/* Verifica que haya disponible para completar un pendiente de GASTO.
   Si no, avisa en la app + manda notificación y devuelve false (no se realiza el pago).
   addBack = monto que este pendiente ya estaba descontando (al editar uno ya completado). */
function pendFundsOk_(p,addBack){
  if(!p||p.kind!=='Expense')return true;
  const disp=disponibleReal()+(addBack||0);
  if(p.amount>disp){
    toast('No se realizó el pago "'+(p.category||'pendiente')+'" · saldo insuficiente (disponible '+money(disp)+')','err');
    if(window.Notif&&Notif.now&&ntOn('pend'))Notif.now('pend-nofunds:'+(p.id||'x')+':'+Date.now(),'⚠️ Pago no realizado','No se realizó el pago pendiente "'+(p.category||'')+'" por '+money(p.amount)+': saldo insuficiente.');
    return false;
  }
  return true;
}
function togglePendDone(id){
  const p=S.pendings.find(function(x){return x.id===id;}); if(!p)return;
  // Al completar un gasto: bloquear si dejaría el disponible en negativo
  if(p.status!=='completed' && !pendFundsOk_(p,0))return;
  const prev=p.status; p.status=(p.status==='completed'?'pending':'completed');
  refreshPend();
  if(p.status==='completed'){if(window.Haptic)Haptic.success();const bd=document.querySelector('.pend-act.done[data-id="'+id+'"]');if(bd){const it=bd.closest('.pend-item');if(it)it.classList.add('just-done');}}
  gs('setPendingStatus',id,p.status==='completed').then(function(){toast(p.status==='completed'?'Marcado completado':'Reabierto','ok');
    if(window.Notif){
      if(p.status==='completed'){ cancelPendAlerts(id); if(ntOn('pend'))Notif.now('pend-done:'+id,'✅ Pendiente completado',(p.category||'Pendiente')+' · '+money(p.amount)); }
      else{ Notif.clearSeen('pend-overdue-fired:'+id); schedulePendAlerts(p); }
    }
  })
    .catch(function(){p.status=prev;refreshPend();toast('No se pudo actualizar','err');});
}
function removePending(id){
  const p=S.pendings.find(function(x){return x.id===id;}); if(!p)return;
  confirmAction('Eliminar pendiente','Vas a eliminar "'+(p.category||'pendiente')+'" por '+money(p.amount)+'. Esta acción no se puede deshacer.','Eliminar',function(){
    const idx=S.pendings.findIndex(function(x){return x.id===id;}); if(idx<0)return;
    animateRemove(rowEl('pendList',id,'.pend-item'),function(){
    const removed=S.pendings[idx]; S.pendings.splice(idx,1);
    refreshPend();
    if(window.Notif){ cancelPendAlerts(id); Notif.clearSeen('pend-overdue-fired:'+id); }
    gs('deletePending',id).then(function(){toast('Pendiente eliminado','ok');})
      .catch(function(){S.pendings.splice(idx,0,removed);refreshPend();toast('No se pudo eliminar','err');});
    });
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
  setDate_('pendDate',p&&p.dueDate?p.dueDate:ymd(new Date()));
  document.getElementById('pendMethod').value=p?(p.method||'Transferencia'):'Transferencia';
  document.getElementById('pendNote').value=p?(p.note||''):'';
  document.getElementById('pendDone').checked=p?p.status==='completed':false;
  document.getElementById('pendNewCatRow').classList.remove('show'); document.getElementById('pendNewCatInput').value='';
  document.querySelectorAll('#pendKindSeg button').forEach(function(b){b.classList.toggle('active',b.dataset.kind===S.pend.kind);});
  buildPendSwatches();
  buildPendChips(S.pend.kind, p?p.category:null);
  S.pend.color=p?p.color:(S.categories[S.pend.kind][0]?S.categories[S.pend.kind][0].color:(paletteFor(S.pend.kind)[0]||'#F59E0B'));
  markSwatch('pendSwatchRow',S.pend.color);
  openBackdrop('pendBackdrop',positionAllSegInks);
  setTimeout(function(){document.getElementById('pendAmount').focus({preventScroll:true});},250);
}
function closePendModal(){closeBackdrop('pendBackdrop');}
function buildPendChips(kind,selected){
  S.pend.category=chipRow('pendChipRow',S.categories[kind]||[],selected,{icons:true,add:true});
}
function buildPendSwatches(){document.getElementById('pendSwatchRow').innerHTML=swatchesHtml(paletteFor(S.pend.kind)||[]);}
function selectPendChip(chip){pickChip('pendChipRow',chip,S.pend,'pendSwatchRow');}
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
  if(amount<=0){shakeAmount('pendAmount');toast('Ingresa un monto','err');return;}
  if(!S.pend.category){toast('Elige una categoría','err');return;}
  const date=document.getElementById('pendDate').value;
  if(!date){toast('Elige la fecha acordada','err');return;}
  const p={kind:S.pend.kind, category:S.pend.category, amount:amount, color:S.pend.color||'#F59E0B',
    method:document.getElementById('pendMethod').value, dueDate:date, note:document.getElementById('pendNote').value.trim(),
    status:document.getElementById('pendDone').checked?'completed':'pending'};
  const editId=S.pend.id;
  // Si se marca como completado un gasto, validar disponible (no dejar negativo)
  if(p.status==='completed'){
    let addBack=0;
    if(editId){const prevP=S.pendings.find(function(x){return x.id===editId;});if(prevP&&prevP.status==='completed')addBack=prevP.amount;}
    if(!pendFundsOk_(Object.assign({id:editId},p),addBack))return;
  }
  closePendModal();
  if(editId){
    const idx=S.pendings.findIndex(function(x){return x.id===editId;});
    const prev=S.pendings[idx]; const prevStatus=prev?prev.status:'pending';
    S.pendings[idx]=Object.assign({id:editId},p);
    refreshPend();
    gs('updatePending',editId,p).then(function(){successFx();toast('Pendiente actualizado','ok');
      if(window.Notif){
        const np=Object.assign({id:editId},p);
        cancelPendAlerts(editId);
        if(np.status==='completed'){
          if(prevStatus!=='completed')
            if(ntOn('pend'))Notif.now('pend-done:'+editId,'✅ Pendiente completado',(np.category||'Pendiente')+' · '+money(np.amount));
        }else{ schedulePendAlerts(np); }
      }
    })
      .catch(function(){S.pendings[idx]=prev;refreshPend();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now()},p);
    S.pendings.push(temp); refreshPend();
    if(window.Notif&&p.status!=='completed'){
      const tipo=p.kind==='Income'?'cobro':'pago';
      if(ntOn('pend'))Notif.now('pend-new:'+temp.id,'🕒 Nuevo pendiente','Registraste un '+tipo+' pendiente: '+(p.category||'')+' · '+money(p.amount));
    }
    gs('addPending',p).then(function(saved){const i=S.pendings.findIndex(function(x){return x.id===temp.id;});if(i>=0)S.pendings[i]=saved;refreshPend();successFx();toast('Pendiente guardado','ok');
      if(window.Notif&&saved&&saved.id)schedulePendAlerts(saved);})
      .catch(function(){S.pendings=S.pendings.filter(function(x){return x.id!==temp.id;});refreshPend();toast('No se pudo guardar','err');});
  }
}
