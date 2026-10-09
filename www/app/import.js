/* app/import.js — Importar movimientos desde Excel (.xlsx/.xls) o CSV.
   Lee el mismo formato que exporta la app (hoja "Movimientos") y también hojas
   genéricas con columnas Fecha, Tipo, Categoría, Monto y Nota.
   Scripts clásicos que comparten ámbito global; el orden de carga está en index.html. */

let IMP=null;   // {name, rows:[tx], dup, bad, newCats:[{type,name}]}

function openImport(){
  IMP=null; impStep1_();
  openBackdrop('importBackdrop',positionAllSegInks);
}
function closeImport(){closeBackdrop('importBackdrop');}
window.openImport=openImport;

function impStep1_(msg){
  document.getElementById('importBody').innerHTML=
    '<div class="imp-drop">'+ICON.receipt+
      '<p class="imp-lead">Elige un archivo de Excel o CSV con tus movimientos.</p>'+
      '<p class="hint">Necesita las columnas <b>Fecha</b>, <b>Categoría</b> y <b>Monto</b>. <b>Tipo</b> (Ingreso, Gasto o Ahorro) y <b>Nota</b> son opcionales; sin Tipo, los montos negativos se toman como gastos y los positivos como ingresos.</p>'+
      '<p class="hint">Antes de guardar verás un resumen. Los movimientos que ya tienes no se duplican.</p>'+
    '</div>'+(msg?'<p class="imp-err" role="alert">'+esc(msg)+'</p>':'');
  document.getElementById('importFoot').innerHTML=
    '<button class="btn-ghost" id="impCancel">Cancelar</button><button class="btn-primary" id="impPick">Elegir archivo</button>';
  document.getElementById('impCancel').onclick=closeImport;
  document.getElementById('impPick').onclick=function(){const f=document.getElementById('importFile');f.value='';f.click();};
}

/* ── Lectura del archivo ── */
function impNorm_(v){return String(v==null?'':v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');}
function impText_(v){let t=String(v==null?'':v).trim();if(/^'[=+\-@]/.test(t))t=t.slice(1);return t;}   // quita el apóstrofo de seguridad del Excel exportado
function impCsv_(text){
  text=text.replace(/^﻿/,'');
  const first=text.split(/\r?\n/,1)[0]||'';
  const sep=[';','\t',','].map(function(c){return {c:c,n:first.split(c).length};}).sort(function(a,b){return b.n-a.n;})[0].c;
  const rows=[];let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;}
    else if(ch==='"')q=true;
    else if(ch===sep){row.push(cell);cell='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  if(cell!==''||row.length){row.push(cell);rows.push(row);}
  return rows;
}
function impDate_(v){
  if(v instanceof Date&&!isNaN(v))return ymd(v);
  if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return ymd(new Date(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));}
  const t=impText_(v);let m;
  if((m=t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/)))return impYmd_(+m[1],+m[2],+m[3]);
  if((m=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/))){let y=+m[3];if(y<100)y+=2000;return impYmd_(y,+m[2],+m[1]);}
  return null;
}
function impYmd_(y,mo,d){const x=new Date(y,mo-1,d);return (x.getFullYear()===y&&x.getMonth()===mo-1&&x.getDate()===d)?ymd(x):null;}
function impAmount_(v){
  if(typeof v==='number')return isFinite(v)?v:null;
  let t=impText_(v).replace(/[^\d.,\-()]/g,'');
  if(!t)return null;
  const neg=/^\(.*\)$/.test(t)||t.indexOf('-')>=0; t=t.replace(/[()\-]/g,'');
  const lc=t.lastIndexOf(','), ld=t.lastIndexOf('.');
  if(lc>=0&&ld>=0){const dec=lc>ld?',':'.';t=t.split(dec==='.'?',':'.').join('').replace(dec,'.');}
  else if(lc>=0||ld>=0){
    const c=lc>=0?',':'.', parts=t.split(c);
    t=(parts.length===2&&parts[1].length!==3)?parts.join('.'):parts.join('');   // 1.250.000 → miles · 12,5 → decimal
  }
  const n=parseFloat(t); if(!isFinite(n))return null;
  return neg?-n:n;
}
function impType_(v){
  const t=impNorm_(v);
  if(/^(ingreso|income|entrada|abono|credito)/.test(t))return 'Income';
  if(/^(gasto|expense|egreso|pago|salida|debito|cargo)/.test(t))return 'Expense';
  if(/^(ahorro|saving)/.test(t))return 'Savings';
  return null;
}
const IMP_COLS={date:/^(fecha|date|dia)$/,type:/^(tipo|type|clase)$/,cat:/^(categoria|category|concepto|rubro)$/,
  amount:/^(monto|valor|importe|amount|cantidad|total)$/,note:/^(nota|notas|note|descripcion|detalle|comentario)$/};
function impParse_(rows){
  let h=-1,col={};
  for(let i=0;i<Math.min(rows.length,40)&&h<0;i++){
    const c={};(rows[i]||[]).forEach(function(v,j){const n=impNorm_(v);Object.keys(IMP_COLS).forEach(function(k){if(c[k]==null&&IMP_COLS[k].test(n))c[k]=j;});});
    if(c.date!=null&&c.amount!=null){h=i;col=c;}
  }
  if(h<0)throw new Error('No encontramos las columnas Fecha y Monto en el archivo.');
  const out=[];let bad=0;
  rows.slice(h+1).forEach(function(r){
    if(!r||!r.some(function(v){return String(v==null?'':v).trim()!=='';}))return;   // fila vacía
    const date=impDate_(r[col.date]), amt=impAmount_(r[col.amount]);
    if(!date||amt==null||amt===0){bad++;return;}
    let type=col.type!=null?impType_(r[col.type]):null;
    if(!type)type=amt<0?'Expense':'Income';
    const cat=impText_(col.cat!=null?r[col.cat]:'').slice(0,28)||'Otros';
    out.push({date:date,type:type,category:cat,amount:Math.round(Math.abs(amt)),note:impText_(col.note!=null?r[col.note]:'').slice(0,60)});
  });
  return {rows:out,bad:bad};
}
async function impRead_(file){
  const isCsv=/\.csv$/i.test(file.name)||file.type==='text/csv';
  if(isCsv)return impCsv_(await file.text());
  await loadLib_('vendor/xlsx-js-style.min.js');
  if(!window.XLSX)throw new Error('No se pudo cargar el lector de Excel. Revisa tu conexión.');
  const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
  const name=wb.SheetNames.find(function(n){return impNorm_(n)==='movimientos';})||wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:''});
}

/* ── Resumen antes de guardar ── */
function impKey_(t){return [t.date,t.type,impNorm_(t.category),Math.round(t.amount),impNorm_(t.note)].join('|');}
async function onImportFile_(file){
  if(!file)return;
  document.getElementById('importBody').innerHTML='<p class="imp-lead">Leyendo '+esc(file.name)+'…</p>';
  let parsed;
  try{parsed=impParse_(await impRead_(file));}
  catch(e){impStep1_((e&&e.message)||'No se pudo leer el archivo.');return;}
  // Lo que ya tienes no se vuelve a sumar: se descuenta uno a uno (dos cafés iguales el mismo día siguen siendo dos)
  const have={};S.transactions.forEach(function(t){const k=impKey_(t);have[k]=(have[k]||0)+1;});
  const rows=[];let dup=0;
  parsed.rows.forEach(function(t){const k=impKey_(t);if(have[k]>0){have[k]--;dup++;}else rows.push(t);});
  const newCats=[],seen={};
  rows.forEach(function(t){
    const list=S.categories[t.type]||[], hit=list.find(function(c){return impNorm_(c.name)===impNorm_(t.category);});
    if(hit){t.category=hit.name;return;}
    const k=t.type+'|'+impNorm_(t.category); if(!seen[k]){seen[k]=1;newCats.push({type:t.type,name:t.category});}
  });
  IMP={name:file.name,rows:rows,dup:dup,bad:parsed.bad,newCats:newCats};
  impStep2_();
}
function impStep2_(){
  const r=IMP.rows, n=function(type){return r.filter(function(t){return t.type===type;}).length;};
  const pl=function(k,cls,uno,varios){return k?'<span class="'+cls+'">'+k+' '+(k===1?uno:varios)+'</span>':'';};
  const fechas=r.map(function(t){return t.date;}).sort();
  const rango=r.length?(fmtFecha_(fechas[0])+' – '+fmtFecha_(fechas[fechas.length-1])):'';
  const sample=r.slice().sort(function(a,b){return a.date<b.date?1:-1;}).slice(0,4);
  document.getElementById('importBody').innerHTML=
    '<p class="imp-file">'+esc(IMP.name)+'</p>'+
    (r.length?
      '<div class="imp-big"><b>'+r.length+'</b> '+(r.length===1?'movimiento nuevo':'movimientos nuevos')+'<span>'+rango+'</span></div>'+
      '<div class="imp-split">'+
        pl(n('Income'),'in','ingreso','ingresos')+pl(n('Expense'),'out','gasto','gastos')+pl(n('Savings'),'sav','ahorro','ahorros')+'</div>'
      :'<div class="imp-big"><b>0</b> movimientos nuevos<span>Todo lo del archivo ya está en tu cuenta.</span></div>')+
    '<ul class="imp-notes">'+
      (IMP.dup?'<li>'+IMP.dup+(IMP.dup===1?' ya existe y no se duplicará.':' ya existen y no se duplicarán.')+'</li>':'')+
      (IMP.bad?'<li class="warn">'+(IMP.bad===1?'1 fila no tiene fecha o monto válidos y se omitirá.':IMP.bad+' filas no tienen fecha o monto válidos y se omitirán.')+'</li>':'')+
      (IMP.newCats.length?'<li>'+(IMP.newCats.length===1?'Se creará 1 categoría nueva: ':'Se crearán '+IMP.newCats.length+' categorías nuevas: ')+esc(IMP.newCats.slice(0,6).map(function(c){return c.name;}).join(', '))+(IMP.newCats.length>6?'…':'')+'.</li>':'')+
      (n('Savings')?'<li>Los ahorros se registran como apartados de tu disponible.</li>':'')+
    '</ul>'+
    (sample.length?'<p class="field-label">Vista previa</p><ul class="imp-sample">'+sample.map(function(t){
      return '<li><span class="hr-ava">'+catIcon(t.category,t.type)+'</span><span class="imp-s-main"><b>'+esc(t.category)+'</b><span>'+fmtFecha_(t.date)+(t.note?' · '+esc(t.note):'')+'</span></span>'+
        '<span class="imp-s-amt '+t.type+'">'+(t.type==='Income'?'+':'−')+esc(money(t.amount))+'</span></li>';}).join('')+'</ul>':'');
  document.getElementById('importFoot').innerHTML=
    '<button class="btn-ghost" id="impOther">Elegir otro</button>'+
    (r.length?'<button class="btn-primary" id="impGo">Importar '+r.length+'</button>':'<button class="btn-primary" id="impDone">Listo</button>');
  document.getElementById('impOther').onclick=function(){const f=document.getElementById('importFile');f.value='';f.click();};
  const go=document.getElementById('impGo'); if(go)go.onclick=function(){runImport_(go);};
  const done=document.getElementById('impDone'); if(done)done.onclick=closeImport;
}
async function runImport_(btn){
  if(!IMP||!IMP.rows.length)return;
  btn.disabled=true; btn.textContent='Importando…';
  // Categorías nuevas primero, con colores de la paleta de su tipo
  IMP.newCats.forEach(function(c){
    const list=(S.categories[c.type]=S.categories[c.type]||[]), pal=paletteFor(c.type);
    const color=pal[list.length%pal.length]||'#64748B';
    list.push({name:c.name,color:color});
    gs('addCategory',c.type,c.name,color).catch(function(){});
  });
  const list=IMP.rows.map(function(t){
    const c=(S.categories[t.type]||[]).find(function(x){return x.name===t.category;});
    return {type:t.type,category:t.category,amount:t.amount,color:c?c.color:'#64748B',note:t.note,date:t.date,source:t.type==='Savings'?'Salary':''};
  });
  try{
    const saved=await gs('importTransactions',list);
    S.transactions=S.transactions.concat(saved);
    closeImport(); renderAll(); successFx();
    toast(saved.length===1?'1 movimiento importado':saved.length+' movimientos importados','ok');
    if(window.Notif)try{aplicarNotifs();}catch(e){}
  }catch(e){
    btn.disabled=false; btn.textContent='Reintentar';
    toast('No se pudo importar: '+((e&&e.message)||e),'err');
  }
}

(function wireImport_(){
  function go(){
    document.getElementById('importClose').onclick=closeImport;
    document.getElementById('importBackdrop').addEventListener('click',function(e){if(e.target.id==='importBackdrop')closeImport();});
    document.getElementById('importFile').addEventListener('change',function(){onImportFile_(this.files&&this.files[0]);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeImport();});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
})();
