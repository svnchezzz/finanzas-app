/* app/goals.js — Metas de ahorro.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ═══════════════ METAS DE AHORRO ═══════════════ */
function renderGoals(){
  const wrap=document.getElementById('goalList');
  document.getElementById('goalAddBtn').onclick=function(){openGoalModal();};
  if(!S.goals.length){wrap.innerHTML=emptyState(ICON.target,'Sin metas de ahorro','Crea una (ej. "Fondo de emergencia: '+esc(S.settings.currencySymbol)+'5.000.000") y sigue tu progreso.');return;}
  wrap.innerHTML=S.goals.map(function(g,i){
    const pct=g.target?Math.min(100,Math.round(g.saved/g.target*100)):0;
    const done=g.target&&g.saved>=g.target;
    return '<div class="goal-item'+(done?' done':'')+'" style="animation-delay:'+(i*30)+'ms">'+
      '<div class="goal-head"><span class="goal-dot" style="background:'+safeColor(g.color)+'"></span>'+
        '<span class="goal-name">'+esc(g.name)+(done?'<span class="b-tag ok">¡Lograda!</span>':'')+'</span>'+
        '<span class="goal-pct">'+pct+'%</span></div>'+
      '<div class="bbar big"><span class="bbar-fill" style="width:'+pct+'%'+(pct>0?';min-width:6px':'')+';background:'+safeColor(g.color)+'"></span></div>'+
      '<div class="goal-foot"><span>'+money(g.saved)+' de '+money(g.target)+'</span>'+
        '<span>'+(done?'Meta cumplida':(money(Math.max(0,g.target-g.saved))+' restante'))+'</span></div>'+
      (g.note?'<div class="goal-note">'+ICON.note+esc(g.note)+'</div>':'')+
      '<div class="goal-acts">'+
        '<button class="btn-ghost goal-contrib" data-id="'+esc(g.id)+'">＋ Aportar</button>'+
        '<button class="btn-ghost goal-contrib minus" data-id="'+esc(g.id)+'">－ Retirar</button>'+
        '<button class="pend-act edit" data-act="edit" data-id="'+esc(g.id)+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+esc(g.id)+'" title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button>'+
      '</div></div>';
  }).join('');
  if(!wrap._deleg){wrap._deleg=true;wrap.addEventListener('click',function(e){
    const c=e.target.closest('.goal-contrib');if(c&&wrap.contains(c)){contribGoal(c.dataset.id,c.classList.contains('minus'));return;}
    const b=e.target.closest('.pend-act');if(!b||!wrap.contains(b))return;
    if(b.dataset.act==='edit')openGoalModal(b.dataset.id);else removeGoal(b.dataset.id);
  });}
}
function contribGoal(id,isMinus){
  const g=S.goals.find(function(x){return x.id===id;});if(!g)return;
  const title=(isMinus?'Retirar de ':'Aportar a ')+'"'+g.name+'"';
  let html='<div style="margin-top:10px"><div class="amount-field"><span class="cur">'+esc(S.settings.currencySymbol)+'</span>'+
    '<input type="text" inputmode="numeric" pattern="[0-9]*" id="contribInput" placeholder="0" autocomplete="off"></div>';
  if(isMinus){
    html+='<p class="hint" style="margin-top:8px">Disponible en la meta: '+money(g.saved)+'.</p>';
  }else{
    html+='<div class="segmented inline" id="contribSrcSeg" style="margin-top:12px">'+
      '<button type="button" class="active" data-source="Salary">Disponible actual</button>'+
      '<button type="button" data-source="Other">Nuevo ingreso</button></div>'+
      '<p class="hint" id="contribHint" style="margin-top:8px">Se descuenta de tu disponible actual ('+money(disponibleReal())+').</p>';
  }
  html+='</div>';
  openMiniInput(title,html,isMinus?'Retirar':'Aportar',function(){
    let v=parseInt(String(document.getElementById('contribInput').value).replace(/\D/g,''),10)||0;
    if(v<=0)return false;
    let source='';
    if(isMinus){
      if(v>g.saved){toast('Saldo insuficiente · en la meta hay '+money(g.saved),'err');return false;}
    }else{
      const sb=document.querySelector('#contribSrcSeg button.active');
      source=sb?sb.dataset.source:'Salary';
      if(source==='Salary'){
        const disp=disponibleReal();
        if(v>disp){toast('Saldo insuficiente · disponible '+money(disp),'err');return false;}
      }
    }
    const signed=isMinus?-v:v;
    // Movimiento de Ahorro: aporte (+) o retiro (−). Se refleja en la estadística de ahorro y el historial.
    const tx={type:'Savings',category:g.name,amount:signed,color:g.color||'#8B5CF6',
      note:(isMinus?'Retiro de meta':'Aporte a meta')+' "'+g.name+'"',date:ymd(new Date()),source:source,_goalId:id};
    const temp=Object.assign({id:'tmp-'+Date.now(),timestamp:new Date().toISOString()},tx);
    S.transactions.push(temp);
    const prevSaved=g.saved; g.saved=Math.max(0,g.saved+signed);
    renderAll();
    const justDone=!isMinus&&g.target&&prevSaved<g.target&&g.saved>=g.target;
    if(justDone)celebrate(g.color);
    gs('addTransaction',tx).then(function(saved){const i=S.transactions.findIndex(function(t){return t.id===temp.id;});if(i>=0&&saved)S.transactions[i]=saved;renderAll();})
      .catch(function(){S.transactions=S.transactions.filter(function(t){return t.id!==temp.id;});g.saved=prevSaved;renderAll();toast('No se pudo guardar el movimiento','err');});
    gs('contributeGoal',id,signed).then(function(res){if(res&&typeof res.saved==='number'){g.saved=res.saved;renderAll();}toast((isMinus?'Retiro registrado':'Aporte registrado')+' · '+money(v),'ok');if(window.Notif)evalGoal(g,true);})
      .catch(function(){toast('No se pudo actualizar la meta','err');});
  });
  setTimeout(function(){
    const el=document.getElementById('contribInput');
    if(el){el.focus({preventScroll:true});el.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});}
    const seg=document.getElementById('contribSrcSeg');
    if(seg)seg.addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;
      setSeg('contribSrcSeg',b); // mueve la burbuja además de marcar la opción
      const hint=document.getElementById('contribHint');
      if(hint)hint.textContent=b.dataset.source==='Salary'?('Se descuenta de tu disponible actual ('+money(disponibleReal())+').'):'Es un nuevo ingreso (no afecta tu disponible actual).';});
  },260);
}
function removeGoal(id){
  const g=S.goals.find(function(x){return x.id===id;});if(!g)return;
  confirmAction('Eliminar meta','Vas a eliminar la meta "'+g.name+'". Esta acción no se puede deshacer.','Eliminar',function(){
    const idx=S.goals.findIndex(function(x){return x.id===id;});if(idx<0)return;
    animateRemove(rowEl('goalList',id,'.goal-item'),function(){
    const removed=S.goals[idx];S.goals.splice(idx,1);renderGoals();
    gs('deleteGoal',id).then(function(){toast('Meta eliminada','ok');})
      .catch(function(){S.goals.splice(idx,0,removed);renderGoals();toast('No se pudo eliminar','err');});
    });
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
  document.getElementById('goalSwatchRow').innerHTML=swatchesHtml(paletteFor('Savings')||[]);
  markSwatch('goalSwatchRow',S.goal.color);
  openBackdrop('goalBackdrop');
  setTimeout(function(){document.getElementById('goalName').focus({preventScroll:true});},250);
}
function closeGoalModal(){closeBackdrop('goalBackdrop');}
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
    gs('updateGoal',editId,g).then(function(){toast('Meta actualizada','ok');if(window.Notif)evalGoal(S.goals[idx],true);})
      .catch(function(){S.goals[idx]=prev;renderGoals();toast('No se pudo guardar','err');});
  }else{
    const temp=Object.assign({id:'tmp-'+Date.now()},g);
    S.goals.push(temp);renderGoals();
    gs('addGoal',g).then(function(saved){const i=S.goals.findIndex(function(x){return x.id===temp.id;});if(i>=0&&saved)S.goals[i]=saved;if(S.view==='goals')renderGoals();toast('Meta creada','ok');if(window.Notif)evalGoal(saved||temp,true);})
      .catch(function(){S.goals=S.goals.filter(function(x){return x.id!==temp.id;});renderGoals();toast('No se pudo guardar','err');});
  }
}
