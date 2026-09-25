/* app/recurring.js — Movimientos recurrentes.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ═══════════════ RECURRENCIAS ═══════════════ */
function renderRecurring(){
  const wrap=document.getElementById('recurList');
  document.getElementById('recurAddBtn').onclick=function(){openRecurModal();};
  if(!S.recurring.length){wrap.innerHTML=emptyState(ICON.repeat,'Sin movimientos recurrentes','Crea uno (ej. salario, arriendo, suscripciones) y se registrará solo cada mes.');return;}
  const items=S.recurring.slice().sort(function(a,b){return a.day-b.day;});
  wrap.innerHTML=items.map(function(r,i){
    const tipo=tipoES(r.type);
    return '<div class="recur-item'+(r.active?'':' off')+'" style="animation-delay:'+(i*30)+'ms">'+
      '<span class="pend-dot" style="background:'+safeColor(r.color)+'"></span>'+
      '<div class="pend-main"><span class="pend-cat">'+esc(r.category)+'<span class="pend-kind '+r.type+'">'+tipo+'</span>'+(r.active?'':'<span class="b-tag off">Pausado</span>')+'</span>'+
        '<span class="pend-meta"><span>'+ICON.cal+'cada día '+r.day+'</span>'+(r.note?'<span>'+ICON.note+esc(r.note)+'</span>':'')+'</span></div>'+
      '<span class="pend-amt">'+money(r.amount)+'</span>'+
      '<div class="pend-acts">'+
        '<button class="pend-act" data-act="toggle" data-id="'+esc(r.id)+'" title="'+(r.active?'Pausar':'Activar')+'" aria-label="'+(r.active?'Pausar':'Activar')+'">'+(r.active?ICON.pause:ICON.play)+'</button>'+
        '<button class="pend-act" data-act="edit" data-id="'+esc(r.id)+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+esc(r.id)+'" title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button>'+
      '</div></div>';
  }).join('');
  if(!wrap._deleg){wrap._deleg=true;wrap.addEventListener('click',function(e){
    const b=e.target.closest('.pend-act');if(!b||!wrap.contains(b))return;
    const id=b.dataset.id,act=b.dataset.act;
    if(act==='toggle')toggleRecur(id);else if(act==='edit')openRecurModal(id);else removeRecur(id);
  });}
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
    const idx=S.recurring.findIndex(function(x){return x.id===id;});if(idx<0)return;
    animateRemove(rowEl('recurList',id,'.recur-item'),function(){
    const removed=S.recurring[idx];S.recurring.splice(idx,1);renderRecurring();
    gs('deleteRecurring',id).then(function(){toast('Recurrencia eliminada','ok');})
      .catch(function(){S.recurring.splice(idx,0,removed);renderRecurring();toast('No se pudo eliminar','err');});
    });
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
  openBackdrop('recurBackdrop',positionAllSegInks);
  setTimeout(function(){document.getElementById('recurAmount').focus({preventScroll:true});},250);
}
function closeRecurModal(){closeBackdrop('recurBackdrop');}
function buildRecurChips(type,selected){
  S.recur.category=chipRow('recurChipRow',S.categories[type]||[],selected,{icons:false,add:false});
}
function buildRecurSwatches(){document.getElementById('recurSwatchRow').innerHTML=swatchesHtml(paletteFor(S.recur.type)||[]);}
function selectRecurChip(chip){pickChip('recurChipRow',chip,S.recur,'recurSwatchRow');}
function saveRecur(){
  const amount=parseInt(String(document.getElementById('recurAmount').value).replace(/\D/g,''),10)||0;
  if(amount<=0){shakeAmount('recurAmount');toast('Ingresa un monto','err');return;}
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
    gs('addRecurring',rc).then(function(saved){const i=S.recurring.findIndex(function(x){return x.id===temp.id;});if(i>=0&&saved)S.recurring[i]=saved;if(S.view==='recurring')renderRecurring();successFx();toast('Recurrencia creada','ok');})
      .catch(function(){S.recurring=S.recurring.filter(function(x){return x.id!==temp.id;});renderRecurring();toast('No se pudo guardar','err');});
  }
}
