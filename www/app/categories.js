/* app/categories.js — Categorías: vista y modal de edición.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Categorías ── */
function renderCategories(){
  const cols=document.getElementById('catCols');
  const meta={Income:'#10B981',Expense:'#F43F5E',Savings:'#0EA5E9'};
  cols.innerHTML=['Income','Expense','Savings'].map(function(type){
    const items=(S.categories[type]||[]).map(function(c){
      const col=safeColor(c.color);
      return '<div class="cat-item">'+
        '<span class="hr-ava" style="background:'+col+'22;color:'+col+'">'+catIcon(c.name,type)+'</span>'+
        '<span class="cat-name">'+esc(c.name)+'</span>'+
        '<button class="cat-edit" data-type="'+type+'" data-name="'+esc(c.name)+'" title="Editar" aria-label="Editar '+esc(c.name)+'">'+ICON.edit+'</button>'+
        '<button class="cat-del" data-type="'+type+'" data-name="'+esc(c.name)+'" title="Quitar" aria-label="Quitar '+esc(c.name)+'">'+ICON.close+'</button>'+
      '</div>';
    }).join('')||'<p class="cat-empty">Aún no tienes categorías aquí.</p>';
    return '<div class="cat-col"><h3><span class="hdot" style="background:'+meta[type]+'"></span>'+tipoES(type)+'</h3>'+
      '<div class="cat-list">'+items+'</div>'+
      '<button type="button" class="cat-new" data-type="'+type+'"><span class="plus">＋</span>Nueva categoría de '+tipoES(type).toLowerCase()+'</button></div>';
  }).join('');
  cols.querySelectorAll('.cat-new').forEach(function(b){b.onclick=function(){openNewCat(b.dataset.type);};});
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

/* ── Crear / editar categoría (mismo modal) ──
   Crear guía en tres pasos: nombre (con sugerencias), ícono (sugerido según el
   nombre) y color, con una vista previa arriba que cambia en vivo. */
const CAT_SUGS={
  Expense:['Mercado','Arriendo','Servicios','Transporte','Gasolina','Restaurantes','Salud','Música','Streaming','Gimnasio','Mascotas','Ropa','Educación','Seguros','Belleza','Regalos'],
  Income:['Salario','Freelance','Ventas','Arriendos','Inversiones','Regalos','Reembolsos','Prima'],
  Savings:['Fondo de emergencia','Viaje','Carro','Casa','Educación','Cesantías','Inversión']
};
function openCatModal_(type,isNew,cat){
  S.editCat={type:type,isNew:isNew,oldName:isNew?'':cat.name,newName:isNew?'':cat.name,
    color:isNew?(paletteFor(type)[0]||'#64748B'):cat.color,
    icon:isNew?'':(getCatIconOverrides()[type+'|'+cat.name.toLowerCase()]||'')};
  document.getElementById('editCatTitle').textContent=(isNew?'Nueva categoría · ':'Editar categoría · ')+tipoES(type);
  document.getElementById('editCatSave').textContent=isNew?'Crear categoría':'Guardar cambios';
  const inp=document.getElementById('editCatName');
  inp.value=S.editCat.newName;
  inp.placeholder='ej. '+(CAT_SUGS[type]||[]).slice(0,3).join(', ');
  document.getElementById('editCatHint').textContent='Ayuda a reconocerla de un vistazo en tus gráficas.';
  document.getElementById('editCatSwatches').innerHTML=swatchesHtml(paletteFor(type)||[]);
  markSwatch('editCatSwatches',S.editCat.color);
  renderCatSugs_();
  renderEditCatIcons();
  updateEditCatPreview();
  openBackdrop('editCatBackdrop');
  setTimeout(function(){inp.focus({preventScroll:true});},250);
}
function openNewCat(type){openCatModal_(type,true,null);}
function openEditCat(type,name){
  const cat=(S.categories[type]||[]).find(function(c){return c.name===name;});
  if(cat)openCatModal_(type,false,cat);
}
/* Nombres frecuentes que todavía no tienes: un toque y queda escrito */
function renderCatSugs_(){
  const box=document.getElementById('editCatSugs'); if(!box)return;
  const type=S.editCat.type, have=(S.categories[type]||[]).map(function(c){return c.name.toLowerCase();});
  const list=S.editCat.isNew?(CAT_SUGS[type]||[]).filter(function(n){return have.indexOf(n.toLowerCase())<0;}).slice(0,8):[];
  box.hidden=!list.length;
  box.innerHTML=list.map(function(n){return '<button type="button" class="cat-sug" data-name="'+esc(n)+'">'+catIcon(n,type)+esc(n)+'</button>';}).join('');
  box.querySelectorAll('.cat-sug').forEach(function(b){b.onclick=function(){
    const inp=document.getElementById('editCatName'); inp.value=b.dataset.name;
    S.editCat.newName=b.dataset.name; updateEditCatPreview();
    if(window.Haptic&&Haptic.light)Haptic.light();
  };});
}
function closeEditCat(){closeBackdrop('editCatBackdrop');}
function updateEditCatPreview(){
  const dot=document.getElementById('editCatPreviewDot'), nm=document.getElementById('editCatPreviewName');
  const col=S.editCat.color||'#64748B';
  if(dot){
    dot.style.background=col+'22'; dot.style.color=col;
    dot.innerHTML=(S.editCat.icon&&CAT_SVG[S.editCat.icon])?CAT_SVG[S.editCat.icon]
      :catIcon((S.editCat.newName||S.editCat.oldName||''),S.editCat.type);
  }
  if(nm)nm.textContent=(S.editCat.newName||'').trim()||'Escribe un nombre';
  const auto=document.querySelector('#editCatIcons .icon-opt.auto');
  if(auto)auto.firstElementChild.outerHTML=autoCatIcon_();
}
/* Ícono que se pondría solo según el nombre (sin contar el fijado a mano) */
function autoCatIcon_(){
  const n=(S.editCat.newName||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for(let i=0;i<CAT_KEYS.length;i++){if(CAT_KEYS[i][0].test(n))return CAT_SVG[CAT_KEYS[i][1]];}
  return CAT_SVG[S.editCat.type==='Income'?'money':S.editCat.type==='Savings'?'bank':'tag'];
}
function saveEditCat(){
  const type=S.editCat.type, oldName=S.editCat.oldName;
  const newName=(document.getElementById('editCatName').value||'').trim();
  const newColor=S.editCat.color||(paletteFor(type)[0]||'#64748B');
  if(!newName){toast('Ingresa un nombre','err');return;}
  if(S.editCat.isNew){
    if((S.categories[type]||[]).some(function(c){return c.name.toLowerCase()===newName.toLowerCase();})){toast('Ya existe una categoría con ese nombre','err');return;}
    setCatIconOverride(type,newName,S.editCat.icon||'');
    closeEditCat(); addCategoryFlow(type,newName,newColor); return;
  }
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
  if(newName!==oldName)setCatIconOverride(type,oldName,'');   // el override sigue al nuevo nombre
  setCatIconOverride(type,newName,S.editCat.icon||'');
  closeEditCat(); renderCategories(); if(S.view==='dashboard')renderDashboard(); if(S.view==='history')renderHistory();
  gs('updateCategory',type,oldName,newName,newColor).then(function(){toast('Categoría actualizada','ok');})
    .catch(function(){
      S.categories[type][idx].name=prev.name; S.categories[type][idx].color=prev.color;
      S.transactions.forEach(function(t){if(t.category===newName){t.category=prev.name;t.color=prev.color;}});
      renderCategories(); if(S.view==='dashboard')renderDashboard();
      toast('No se pudo guardar los cambios','err');
    });
}
