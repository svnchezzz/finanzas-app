/* app/export.js — Exportación (modal; la generación de archivos vive en db.js).
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

/* ── Exportación ── */
function openExport(){
  document.getElementById('exportStatus').textContent='';
  // valores por defecto del rango = periodo actual
  const b=periodBounds(S.ref,S.period);
  setDate_('rangeStart',ymd(b.start));
  setDate_('rangeEnd',ymd(b.end));
  openBackdrop('exportBackdrop',positionAllSegInks);
}
function closeExport(){closeBackdrop('exportBackdrop');}
function buildScope(){
  if(S.exportScope==='all')return {mode:'all',label:'Toda la base de datos'};
  if(S.exportScope==='current'){const b=periodBounds(S.ref,S.period);return {mode:'range',start:ymd(b.start),end:ymd(b.end),label:periodLabel(S.ref,S.period)};}
  const s=document.getElementById('rangeStart').value, e=document.getElementById('rangeEnd').value;
  if(!s||!e)return null;
  return {mode:'range',start:s<e?s:e,end:s<e?e:s,label:''};
}
function runExport(fmt,btn){
  const scope=buildScope();
  if(!scope){toast('Selecciona el rango de fechas','err');return;}
  const fn=fmt==='excel'?'exportExcel':'exportPdf';
  btn.classList.add('busy');
  document.getElementById('exportStatus').textContent='Generando archivo…';
  gs(fn,scope).then(function(res){
    downloadB64(res); btn.classList.remove('busy');
    document.getElementById('exportStatus').textContent='Listo: '+res.filename;
    toast('Exportación lista','ok');
  }).catch(function(err){
    btn.classList.remove('busy');
    document.getElementById('exportStatus').textContent='Error: '+(err&&err.message?err.message:err);
    toast('No se pudo exportar','err');
  });
}
function downloadB64(res){
  try{
    const bin=atob(res.b64), len=bin.length, bytes=new Uint8Array(len);
    for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);
    const blob=new Blob([bytes],{type:res.mimeType}), url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=res.filename;
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1500);
  }catch(e){toast('Descarga bloqueada por el navegador','err');}
}
