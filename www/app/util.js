/* app/util.js — Utilidades compartidas: piezas de formulario, toasts, escape, confeti.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Piezas de formulario compartidas (chips de categoría, paleta de colores) ── */
/* Pinta una fila de chips de categoría. Marca la elegida (o la primera) y devuelve su nombre. */
function chipRow(rowId,cats,selected,o){
  const row=document.getElementById(rowId);
  row.innerHTML=cats.map(function(c,i){
    const on=selected?c.name===selected:i===0, col=safeColor(c.color);
    const mark=o.icons?'<span class="chip-ico">'+catIcon(c.name)+'</span>':'<span class="chip-dot" style="background:'+col+'"></span>';
    return '<button type="button" class="chip'+(on?' active':'')+'" aria-pressed="'+on+'" data-name="'+esc(c.name)+'" data-color="'+col+'"'+(o.icons?' style="color:'+col+'"':'')+'>'+mark+'<span style="color:var(--txt)">'+esc(c.name)+'</span></button>';
  }).join('')+(o.add?'<button type="button" class="chip add-chip"><span class="chip-dot" style="background:currentColor"></span>Nueva</button>':'');
  return selected||(cats[0]?cats[0].name:null);
}
/* Selecciona un chip de la fila y sincroniza categoría + color en el estado del formulario */
function pickChip(rowId,chip,st,swatchId){
  document.querySelectorAll('#'+rowId+' .chip').forEach(function(c){c.classList.remove('active');c.setAttribute('aria-pressed','false');});
  chip.classList.add('active');chip.setAttribute('aria-pressed','true');
  st.category=chip.dataset.name;
  if(chip.dataset.color){st.color=chip.dataset.color;markSwatch(swatchId,st.color);}
}
/* Paleta de colores como botones (enfocables y con nombre para el lector de pantalla) */
function swatchesHtml(pal){
  return pal.map(function(col){col=safeColor(col);return '<button type="button" class="swatch" data-color="'+col+'" style="background:'+col+'" aria-label="Color '+col+'"></button>';}).join('');
}
/* Abre / cierra un fondo modal con su transición. Un cierre pendiente no oculta un modal recién reabierto. */
function openBackdrop(id,after){
  const bk=document.getElementById(id); if(!bk)return;
  clearTimeout(bk._hideT); bk.style.display='flex';
  requestAnimationFrame(function(){bk.classList.add('show');if(after)after();});
}
function closeBackdrop(id){
  const bk=document.getElementById(id); if(!bk)return;
  bk.classList.remove('show');
  bk._hideT=setTimeout(function(){bk.style.display='none';},250);
}

/* ── Toasts / util ── */
function toast(msg,kind){
  if(window.Haptic){ if(kind==='err')Haptic.error(); else if(kind==='ok')Haptic.light(); }
  const wrap=document.getElementById('toasts'), el=document.createElement('div');
  el.className='toast '+(kind||'info'); el.innerHTML='<span class="t-dot"></span>'+esc(msg);
  wrap.appendChild(el);
  setTimeout(function(){el.classList.add('out');setTimeout(function(){el.remove();},300);},2400);
}
function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

/* Color seguro para meter en un atributo style.
   escapar con esc() NO basta aquí: dentro de style="" un valor con comillas
   rompe el atributo y permite inyectar otro (onmouseover, onerror…). La app
   solo genera colores hexadecimales, así que se aceptan únicamente esos y
   cualquier otra cosa cae al color por defecto. */
const COLOR_FB='#64748B';
function safeColor(c,fb){
  const v=String(c==null?'':c).trim();
  return /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v) ? v : (fb||COLOR_FB);
}
/* Confeti de celebración (ej. al cumplir una meta de ahorro) */
function celebrate(accent){
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;
  if(window.Haptic&&Haptic.heavy)Haptic.heavy();
  const layer=document.createElement('div');layer.className='confetti';document.body.appendChild(layer);
  const colors=[accent||'#6366F1','#10B981','#0EA5E9','#F59E0B','#F43F5E','#A855F7'];
  const N=90;
  for(let i=0;i<N;i++){
    const p=document.createElement('span');
    const w=6+Math.random()*7;
    p.style.left=(Math.random()*100)+'vw';
    p.style.background=colors[i%colors.length];
    p.style.width=w+'px';p.style.height=(w*0.5+3)+'px';
    p.style.setProperty('--dx',((Math.random()*2-1)*180)+'px');
    p.style.setProperty('--rot',(Math.random()*900-450)+'deg');
    p.style.animationDuration=(2200+Math.random()*1400)+'ms';
    p.style.animationDelay=(Math.random()*260)+'ms';
    layer.appendChild(p);
  }
  setTimeout(function(){layer.remove();},4400);
}

window.S = S;

/* ── Pull-to-refresh eliminado ───────────────────────────────
   Se quitó por completo: causaba recargas/saltos al deslizar hacia arriba.
   El scroll queda totalmente libre. La app sigue funcionando offline y se
   refresca al volver a abrirla. El indicador y sus gestos ya no existen.   */

/* ── Los modales nunca se desplazan en horizontal ─────────────────────────
   Al enfocar un campo, el WebView puede correr el modal hacia la derecha
   ("se corre todo"). El CSS ya evita que algo sobresalga; esto es la red de
   seguridad para WebViews que ignoran focus({preventScroll:true}).        */
(function(){
  function unshift(el){ if(el && el.scrollLeft) el.scrollLeft = 0; }
  document.addEventListener('scroll', function(e){
    const t = e.target;
    if (t && t.nodeType === 1 && t.classList && t.classList.contains('modal')) unshift(t);
  }, true);
  document.addEventListener('focusin', function(e){
    const m = e.target && e.target.closest ? e.target.closest('.modal') : null;
    if (m) requestAnimationFrame(function(){ unshift(m); });
  });
})();

window.renderAll = renderAll;
