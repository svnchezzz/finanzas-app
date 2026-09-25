/* app/categories.js — Categorías: vista y modal de edición.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Categorías ── */
function renderCategories(){
  const cols=document.getElementById('catCols');
  const meta={Income:'#10B981',Expense:'#F43F5E',Savings:'#0EA5E9'};
  cols.innerHTML=['Income','Expense','Savings'].map(function(type){
    const items=(S.categories[type]||[]).map(function(c,i){
      return '<div class="cat-item" style="animation-delay:'+(i*35)+'ms">'+
        '<span class="cat-swatch" style="background:'+safeColor(c.color)+'"></span>'+
        '<span class="cat-name">'+esc(c.name)+'</span>'+
        '<button class="cat-edit" data-type="'+type+'" data-name="'+esc(c.name)+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="cat-del" data-type="'+type+'" data-name="'+esc(c.name)+'" title="Quitar" aria-label="Quitar">'+ICON.close+'</button>'+
      '</div>';
    }).join('');
    const sws=swatchesHtml(paletteFor(type)||[]);
    return '<div class="cat-col"><h3><span class="hdot" style="background:'+meta[type]+'"></span>'+tipoES(type)+'</h3>'+
      '<div class="cat-list">'+items+'</div>'+
      '<div class="cat-add"><input type="text" placeholder="Nueva categoría de '+tipoES(type).toLowerCase()+'" data-type="'+type+'" maxlength="28"><button class="btn-ghost cat-add-btn" data-type="'+type+'">Agregar</button></div>'+
      '<div class="mini-swatches" data-picker="'+type+'">'+sws+'<button type="button" class="swatch-custom mini-custom" title="Elegir cualquier color" aria-label="Elegir cualquier color"></button></div></div>';
  }).join('');
  ['Income','Expense','Savings'].forEach(function(type){const pk=cols.querySelector('[data-picker="'+type+'"]');if(pk){const f=pk.querySelector('.swatch');if(f)f.classList.add('active');}});
  cols.querySelectorAll('.mini-swatches').forEach(function(pk){pk.addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;pk.querySelectorAll('.swatch').forEach(function(x){x.classList.remove('active');});s.classList.add('active');delete pk.dataset.custom;});
    const ci=pk.querySelector('.mini-custom');if(ci)ci.addEventListener('click',function(e){e.preventDefault();
      ColorWheel.open(ci,pk.dataset.custom||(paletteFor(pk.dataset.picker)[0]||'#4F46E5'),function(c){
        pk.querySelectorAll('.swatch').forEach(function(x){x.classList.remove('active');});pk.dataset.custom=c;ci.classList.add('active');});});});
  cols.querySelectorAll('.cat-add-btn').forEach(function(btn){btn.onclick=function(){
    const type=btn.dataset.type, input=cols.querySelector('.cat-add input[data-type="'+type+'"]'), pk=cols.querySelector('[data-picker="'+type+'"]'), picker=pk.querySelector('.swatch.active');
    const color=picker?picker.dataset.color:(pk.dataset.custom||(paletteFor(type)[0]||'#64748B'));
    addCategoryFlow(type,input.value,color); input.value='';};});
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
  document.getElementById('editCatSwatches').innerHTML=swatchesHtml(paletteFor(type)||[]);
  markSwatch('editCatSwatches',cat.color);
  S.editCat.icon=getCatIconOverrides()[type+'|'+name.toLowerCase()]||'';
  renderEditCatIcons();
  updateEditCatPreview();
  updateEditCatPreview();
  openBackdrop('editCatBackdrop');
  setTimeout(function(){document.getElementById('editCatName').focus({preventScroll:true});},250);
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
