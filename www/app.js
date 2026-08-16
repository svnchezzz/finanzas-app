/*****************************************************************************************
 * CONTROL FINANZAS MS — cliente
 * Toda la agregación y los gráficos se calculan aquí (cliente) para que sea rápido.
 * El servidor (Supabase, vía db.js) sólo se usa para: carga inicial, agregar/borrar
 * movimiento, categorías, y guardar pendientes/presupuestos/metas/recurrencias.
 *
 * NOTA: la función gs() y el arranque automático viven ahora en db.js.
 *****************************************************************************************/

const APP_NAME='Control Finanzas MS';
const TXT={guardado:'Guardado',eliminado:'Eliminado',errGuardar:'No se pudo guardar — reintenta',
  errBorrar:'No se pudo eliminar',sinDatos:'Sin datos en este periodo'};

// Paletas por tipo (respaldo si el servidor no las envía)
const PALETTES_FALLBACK={
  Income:  ['#10B981','#059669','#047857','#065F46','#14B8A6','#0891B2','#06B6D4','#0ea5e9'],
  Expense: ['#EF4444','#DC2626','#B91C1C','#F43F5E','#F97316','#FB923C','#F59E0B','#FBBF24'],
  Savings: ['#8B5CF6','#7C3AED','#6D28D9','#4F46E5','#6366F1','#3B82F6','#60A5FA','#93C5FD']
};

const S={
  transactions:[], categories:{Income:[],Expense:[],Savings:[]}, pendings:[],
  budgets:[], recurring:[], goals:[],
  settings:{currencySymbol:'$',locale:'es-CO',decimals:0,palette:[]},
  palettes:PALETTES_FALLBACK,
  period:'day', ref:new Date(), view:'dashboard', histGrain:'day', pendFilter:'all',
  charts:{}, _kpiPrev:{income:0,expense:0,savings:0,balance:0}, _donutPrev:{}, _trendMode:null,
  modal:{id:null,type:null,color:null,source:'Salary',category:null}, exportScope:'current',
  pend:{id:null,kind:'Income',category:null,color:null},
  editCat:{type:null,oldName:null,newName:null,color:null},
  recur:{id:null,type:'Expense',category:null,color:null,source:''},
  goal:{id:null,color:'#8B5CF6'},
  confirmCb:null,
  histSearch:'', histType:'all', histLimit:50
};

/* Color de un token CSS del tema activo (para canvas/Chart.js, que no acepta var()) */
function tcol(name){try{const v=getComputedStyle(document.documentElement).getPropertyValue(name).trim();return v||'#888';}catch(e){return '#888';}}

/* Monto inválido: sacudida del campo + háptico de error (DESIGN_SPEC §8.3) */
function shakeAmount(inputId){
  const el=document.getElementById(inputId);
  const f=el?el.closest('.amount-field'):null;
  if(f){f.classList.remove('error');void f.offsetWidth;f.classList.add('error');setTimeout(function(){f.classList.remove('error');},500);}
  if(window.Haptic&&Haptic.error)Haptic.error();
}

/* ¿El usuario dejó encendido este tipo de aviso? (Ajustes → Notificaciones).
   Si settings.js aún no cargó, se asume que sí: es el valor por defecto. */
function ntOn(k){ return typeof window.NotifPrefs!=='function' || window.NotifPrefs(k); }

/* Animación de éxito al guardar: check SVG dibujado (DESIGN_SPEC §9.3, en código) */
function successFx(){
  const o=document.getElementById('successFx'); if(!o)return;
  o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
  setTimeout(function(){o.classList.remove('show');},1900); // debe durar lo mismo que sfIn/sfBadge
}

/* ── Iconos de categoría ─────────────────────────────────────────────────
   Se asignan automáticamente según el nombre de la etiqueta (sin tocar la
   base de datos). Si ninguna palabra coincide, hay un icono por tipo. */
function _ci(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg>';}
const CAT_SVG={
  home:_ci('<path d="m3 10 9-7 9 7"/><path d="M5 8.6V21h14V8.6"/><path d="M9.5 21v-6h5v6"/>'),
  bus:_ci('<rect x="4" y="3.5" width="16" height="13" rx="2"/><path d="M4 10h16"/><circle cx="8.5" cy="19" r="1.5"/><circle cx="15.5" cy="19" r="1.5"/><path d="M8 13.5h.01M16 13.5h.01"/>'),
  car:_ci('<path d="M5 11.5 7 6h10l2 5.5"/><rect x="3" y="11.5" width="18" height="5.5" rx="1.8"/><circle cx="7.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>'),
  food:_ci('<path d="M7 3v7a2 2 0 0 0 4 0V3"/><path d="M9 3v18"/><path d="M17 3c-1.6 2-2.4 4-2.4 6.2 0 2 1 3.3 2.4 3.3V21"/>'),
  cart:_ci('<circle cx="9" cy="20" r="1.4"/><circle cx="17" cy="20" r="1.4"/><path d="M3 4h2l2.5 11h10L21 7H6.2"/>'),
  health:_ci('<path d="M12 20s-7.5-4.8-9.3-9.2A5 5 0 0 1 12 6.5a5 5 0 0 1 9.3 4.3C19.5 15.2 12 20 12 20z"/>'),
  edu:_ci('<path d="m12 4 10 5-10 5L2 9z"/><path d="M6 11.5V16c0 1.2 2.6 3 6 3s6-1.8 6-3v-4.5"/>'),
  fun:_ci('<rect x="3" y="8" width="18" height="9" rx="4.5"/><path d="M8 10.8v3.4M6.3 12.5h3.4"/><path d="M15.8 11.3h.01M18 13.7h.01"/>'),
  travel:_ci('<path d="m21 3-9 18-2-8-8-2z"/><path d="M21 3 10 13"/>'),
  clothes:_ci('<path d="m8 3.5 4 2 4-2 5 4-2.5 3L16 8.5V21H8V8.5L5.5 10.5 3 7.5z"/>'),
  bolt:_ci('<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>'),
  wifi:_ci('<path d="M2 9a15 15 0 0 1 20 0"/><path d="M5.5 12.5a10 10 0 0 1 13 0"/><path d="M9 16a5 5 0 0 1 6 0"/><path d="M12 19.5h.01"/>'),
  phone:_ci('<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>'),
  paw:_ci('<circle cx="6.8" cy="9" r="1.6"/><circle cx="12" cy="7" r="1.6"/><circle cx="17.2" cy="9" r="1.6"/><path d="M12 12c-3 0-5.4 2.4-5.4 4.8A2.2 2.2 0 0 0 8.8 19h6.4a2.2 2.2 0 0 0 2.2-2.2C17.4 14.4 15 12 12 12z"/>'),
  gift:_ci('<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9"/><path d="M12 8v13"/><path d="M12 8c0-3-1.5-5-3.5-5S6 6 12 8zm0 0c0-3 1.5-5 3.5-5S18 6 12 8z"/>'),
  money:_ci('<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M5.5 9h.01M18.5 15h.01"/>'),
  briefcase:_ci('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>'),
  invest:_ci('<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  bank:_ci('<path d="m3 9 9-6 9 6"/><path d="M5 9v9M9.7 9v9M14.3 9v9M19 9v9"/><path d="M3 21h18"/>'),
  card:_ci('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>'),
  cash:_ci('<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>'),
  repeat:_ci('<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>'),
  gym:_ci('<path d="M6.5 6.5v11M17.5 6.5v11"/><path d="M3 9.5v5M21 9.5v5"/><path d="M6.5 12h11"/>'),
  coffee:_ci('<path d="M17 8h2a3 3 0 0 1 0 6h-2"/><path d="M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/>'),
  tag:_ci('<path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>')
};
const CAT_KEYS=[
  [/(casa|hogar|arriendo|renta|hipoteca|alquiler|mueble)/,'home'],
  [/(bus|buseta|transporte|taxi|uber|metro|pasaje|didi)/,'bus'],
  [/(gasolina|carro|auto|moto|vehiculo|parqueadero|peaje|taller)/,'car'],
  [/(comida|restaurante|almuerzo|cena|desayuno|domicilio|rappi)/,'food'],
  [/(mercado|super|despensa|viveres|tienda)/,'cart'],
  [/(salud|medic|farmacia|doctor|eps|clinica|odont|drogueria)/,'health'],
  [/(educaci|curso|universidad|colegio|libro|matricula|estudio)/,'edu'],
  [/(ocio|entreten|cine|juego|fiesta|salida|diversion)/,'fun'],
  [/(viaje|vacacion|vuelo|hotel|turismo)/,'travel'],
  [/(ropa|moda|zapato|vestido|accesorio)/,'clothes'],
  [/(luz|energia|agua|gas(?!olina)|servicio|factura|recibo)/,'bolt'],
  [/(internet|wifi|cable|tv|television)/,'wifi'],
  [/(telefono|celular|movil|plan)/,'phone'],
  [/(mascota|perro|gato|veterinari)/,'paw'],
  [/(regalo|cumplea|navidad|detalle)/,'gift'],
  [/(salario|sueldo|nomina|quincena|prima|pension)/,'money'],
  [/(trabajo|freelance|negocio|venta|cliente|honorario|extra)/,'briefcase'],
  [/(inversion|interes|dividendo|rendimiento|cdt|cripto|accion)/,'invest'],
  [/(ahorro|meta|fondo|emergencia|banco|cuenta)/,'bank'],
  [/(tarjeta|credito|cuota)/,'card'],
  [/(efectivo|cash)/,'cash'],
  [/(suscripcion|netflix|spotify|disney|hbo|prime|mensualidad)/,'repeat'],
  [/(gimnasio|gym|deporte|futbol|entrenamiento)/,'gym'],
  [/(cafe|cafeteria)/,'coffee']
];
/* Overrides del usuario: icono fijado a mano por categoría (guardado local) */
function getCatIconOverrides(){try{return JSON.parse(localStorage.getItem('cfms-caticons')||'{}');}catch(e){return {};}}
function setCatIconOverride(type,name,key){
  const o=getCatIconOverrides(), k=type+'|'+(name||'').toLowerCase();
  if(key)o[k]=key; else delete o[k];
  try{localStorage.setItem('cfms-caticons',JSON.stringify(o));}catch(e){}
}
function catIcon(name,type){
  const o=getCatIconOverrides(), nm=(name||'').toLowerCase();
  const ov=type?o[type+'|'+nm]:(o['Expense|'+nm]||o['Income|'+nm]||o['Savings|'+nm]);
  if(ov&&CAT_SVG[ov])return CAT_SVG[ov];
  const n=nm.normalize('NFD').replace(/[̀-ͯ]/g,'');
  for(let i=0;i<CAT_KEYS.length;i++){if(CAT_KEYS[i][0].test(n))return CAT_SVG[CAT_KEYS[i][1]];}
  return CAT_SVG[type==='Income'?'money':type==='Savings'?'bank':'tag'];
}
/* Cuadrícula de iconos del modal "Editar categoría" */
function renderEditCatIcons(){
  const g=document.getElementById('editCatIcons'); if(!g)return;
  const cur=S.editCat.icon||'';
  let html='<button type="button" class="icon-opt'+(cur?'':' active')+'" data-ico="" title="Automático según el nombre"><span>Auto</span></button>';
  Object.keys(CAT_SVG).forEach(function(k){
    html+='<button type="button" class="icon-opt'+(cur===k?' active':'')+'" data-ico="'+k+'">'+CAT_SVG[k]+'</button>';
  });
  g.innerHTML=html;
  g.querySelectorAll('.icon-opt').forEach(function(b){
    b.addEventListener('click',function(){
      S.editCat.icon=this.dataset.ico||'';
      g.querySelectorAll('.icon-opt').forEach(function(x){x.classList.remove('active');});
      this.classList.add('active');
      updateEditCatPreview();               // se refleja al instante en la vista previa
      if(window.Haptic&&Haptic.light)Haptic.light();
    });
  });
}

/* Odómetro por dígito para la cifra hero "Disponible" (DESIGN_SPEC §13.5) */
function writeTicker(el,n){
  if(!el)return;
  const v=Math.round(n||0);
  const str=nf_().format(Math.abs(v));
  const sign=(v<0?'−':'')+S.settings.currencySymbol;
  const fresh=(el._tkStr==null)||(el._tkStr.length!==str.length)||!el.querySelector('.tk-col');
  if(fresh){
    let html='<span class="cur-sym"></span><span class="tk-num">';
    for(let i=0;i<str.length;i++){
      const ch=str[i];
      if(ch>='0'&&ch<='9'){
        html+='<span class="tk-col"><span class="tk-strip">';
        for(let d=0;d<10;d++)html+='<span>'+d+'</span>';
        html+='</span></span>';
      }else html+='<span class="tk-sep">'+ch+'</span>';
    }
    el.innerHTML=html+'</span>';
    el._numEl=null; el._symEl=null; // invalida la caché de writeMoney
  }
  el.querySelector('.cur-sym').textContent=sign;
  const strips=el.querySelectorAll('.tk-strip');
  const digits=[]; for(let i=0;i<str.length;i++){const ch=str[i]; if(ch>='0'&&ch<='9')digits.push(+ch);}
  const apply=function(){for(let i=0;i<strips.length&&i<digits.length;i++)strips[i].style.transform='translateY(-'+(digits[i]*1.15)+'em)';};
  if(fresh)requestAnimationFrame(function(){requestAnimationFrame(apply);}); else apply();
  el._tkStr=str;
}

/* Resumen inteligente bajo "Disponible" (DESIGN_SPEC §13.4) */
function smartLine(exp,sav){
  const overdue=S.pendings.filter(function(p){return pendStatus(p).key==='overdue';}).length;
  if(overdue>0)return overdue===1?'1 pendiente vencido':overdue+' pendientes vencidos';
  const pExp=sumType(prevPeriodTx(),'Expense');
  if(pExp>0&&Math.round(exp)!==Math.round(pExp)){
    const pct=Math.round(Math.abs(exp-pExp)/pExp*100);
    if(pct>200)return exp>pExp?('Gastaste '+money(exp-pExp)+' más que el periodo anterior'):('Gastaste '+money(pExp-exp)+' menos que el periodo anterior');
    if(pct>0)return exp<pExp?('Gastaste '+pct+'% menos que el periodo anterior'):('Gastaste '+pct+'% más que el periodo anterior');
  }
  if(sav>0)return 'Ahorraste '+money(sav)+' este periodo';
  return 'Ingresos − gastos − ahorro apartado';
}

const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const MON=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const DOW=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const PLUR={day:'días',week:'semanas',month:'meses',year:'años'};
/* Iconos SVG universales (se ven igual en todo dispositivo, sin depender de emojis) */
const ICON={
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  undo:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7"/></svg>',
  pause:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M7 5.5v13a1 1 0 0 0 1.5.87l11-6.5a1 1 0 0 0 0-1.74l-11-6.5A1 1 0 0 0 7 5.5Z"/></svg>',
  cal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  card:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>',
  note:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  // Pendientes: reloj de arena (no un reloj, para no confundirlo con Historial)
  pending:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h10"/><path d="M7 21h10"/><path d="M8.5 3v3.2L12 12l3.5-5.8V3"/><path d="M8.5 21v-3.2L12 12l3.5 5.8V21"/><path d="M9.9 18.6h4.2"/></svg>',
  target:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/></svg>',
  repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="20" x2="6" y2="14"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="10"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2.5-1.5L9 22l3-1.5L15 22l2.5-1.5L20 22V2l-2.5 1.5L15 2l-3 1.5L9 2 6.5 3.5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>'
};
/* Construye un estado vacío con icono, título y texto guía */
function emptyState(iconSvg,title,sub){
  return '<div class="empty-state"><div class="es-ico">'+iconSvg+'</div><div class="es-title">'+title+'</div>'+(sub?'<div class="es-sub">'+sub+'</div>':'')+'</div>';
}
function tipoES(t){return ({Income:'Ingreso',Expense:'Gasto',Savings:'Ahorro'})[t]||t;}
function capFirst(s){return s.charAt(0).toUpperCase()+s.slice(1);}
// Devuelve la paleta de colores para un tipo dado
function paletteFor(type){return (S.palettes&&S.palettes[type])||PALETTES_FALLBACK[type]||PALETTES_FALLBACK.Expense;}

/* ── Formato ── */
/* Formateador de números cacheado (crear Intl.NumberFormat en cada frame era lo que trababa la animación) */
var _nfCache={};
function nf_(){
  const loc=S.settings.locale||'es-CO', dec=S.settings.decimals||0, key=loc+'|'+dec;
  return _nfCache[key]||(_nfCache[key]=new Intl.NumberFormat(loc,{maximumFractionDigits:dec}));
}
function money(n){
  const v=Math.round(n||0);
  return (v<0?'−':'')+S.settings.currencySymbol+' '+nf_().format(Math.abs(v));
}
/* Versión con el símbolo de moneda más pequeño y atenuado (look fintech).
   Solo para sitios donde escribimos HTML (KPIs, centro de donas). */
function moneyHTML(n){
  const v=Math.round(n||0);
  return (v<0?'−':'')+'<span class="cur-sym">'+esc(S.settings.currencySymbol)+'</span>'+nf_().format(Math.abs(v));
}
/* Escribe el valor actualizando SOLO nodos de texto (sin re-parsear HTML cada frame).
   Mucho más barato para la animación de conteo en WebView de celular. */
function writeMoney(el,n){
  if(!el._numEl){
    el.innerHTML='<span class="cur-sym"></span><span class="cur-num"></span>';
    el._symEl=el.querySelector('.cur-sym'); el._numEl=el.querySelector('.cur-num');
  }
  const v=Math.round(n||0);
  el._symEl.textContent=(v<0?'−':'')+S.settings.currencySymbol;
  el._numEl.textContent=nf_().format(Math.abs(v));
}
function groupDigits(str){const d=String(str).replace(/\D/g,'');if(!d)return '';return new Intl.NumberFormat(S.settings.locale||'es-CO').format(parseInt(d,10));}

/* ── Fechas ── */
function sod(d){return new Date(d.getFullYear(),d.getMonth(),d.getDate());}
function ymd(d){return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);}
function parseYMD(s){const p=String(s).split('-');return new Date(+p[0],(+p[1])-1,+p[2]);}
function mondayOf(d){const x=sod(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x;}

function periodBounds(ref,period){
  let start,end;
  if(period==='day'){start=sod(ref);end=sod(ref);}
  else if(period==='week'){start=mondayOf(ref);end=new Date(start);end.setDate(start.getDate()+6);}
  else if(period==='month'){start=new Date(ref.getFullYear(),ref.getMonth(),1);end=new Date(ref.getFullYear(),ref.getMonth()+1,0);}
  else{start=new Date(ref.getFullYear(),0,1);end=new Date(ref.getFullYear(),11,31);}
  return {start:start,end:end};
}
function periodLabel(ref,period){
  if(period==='day')return DOW[ref.getDay()]+', '+ref.getDate()+' '+MON[ref.getMonth()]+' '+ref.getFullYear();
  if(period==='week'){const b=periodBounds(ref,'week'),a=b.start,z=b.end;
    const left=a.getDate()+(a.getMonth()!==z.getMonth()?' '+MON[a.getMonth()]:'');
    return left+'–'+z.getDate()+' '+MON[z.getMonth()]+' '+z.getFullYear();}
  if(period==='month')return capFirst(MESES[ref.getMonth()])+' '+ref.getFullYear();
  return String(ref.getFullYear());
}
function shiftRef(ref,period,dir){
  const d=new Date(ref);
  if(period==='day')d.setDate(d.getDate()+dir);
  else if(period==='week')d.setDate(d.getDate()+7*dir);
  else if(period==='month')d.setMonth(d.getMonth()+dir);
  else d.setFullYear(d.getFullYear()+dir);
  return d;
}

/* ── Mini calendario ── */
let calView=null;
function toggleCal(){
  const pop=document.getElementById('calPop');
  if(pop.classList.contains('show')){closeCal();return;}
  calView=new Date(S.ref.getFullYear(),S.ref.getMonth(),1);
  buildCal(); pop.classList.add('show');
  document.getElementById('periodLabel').classList.add('open');
  setTimeout(function(){document.addEventListener('click',calOutside);},0);
}
function closeCal(){
  const pop=document.getElementById('calPop'); if(!pop)return;
  pop.classList.remove('show'); document.getElementById('periodLabel').classList.remove('open');
  document.removeEventListener('click',calOutside);
}
function calOutside(e){const nav=document.querySelector('.period-nav');if(nav&&!nav.contains(e.target))closeCal();}
function calCell(d,other,today,b){
  const sel=ymd(d)===ymd(S.ref), isToday=ymd(d)===ymd(today), inrange=d>=b.start&&d<=b.end&&!sel;
  const cls='cal-day'+(other?' other':'')+(isToday?' today':'')+(sel?' sel':'')+(inrange?' inrange':'');
  return '<div class="'+cls+'" data-d="'+ymd(d)+'">'+d.getDate()+'</div>';
}
function buildCal(){
  const pop=document.getElementById('calPop');
  const y=calView.getFullYear(), m=calView.getMonth();
  const startDow=(new Date(y,m,1).getDay()+6)%7;       // lunes primero
  const dim=new Date(y,m+1,0).getDate();
  const today=sod(new Date()), b=periodBounds(S.ref,S.period);
  let cells='';
  for(let i=0;i<startDow;i++)cells+=calCell(new Date(y,m,1-(startDow-i)),true,today,b);
  for(let d=1;d<=dim;d++)cells+=calCell(new Date(y,m,d),false,today,b);
  const trail=(7-((startDow+dim)%7))%7;
  for(let i=1;i<=trail;i++)cells+=calCell(new Date(y,m+1,i),true,today,b);
  const dows=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(function(x){return '<div class="cal-dow">'+x+'</div>';}).join('');
  pop.innerHTML=
    '<div class="cal-head">'+
      '<div class="cal-navs"><button class="cal-nav" data-cal="py" title="Año anterior">«</button><button class="cal-nav" data-cal="pm" title="Mes anterior">‹</button></div>'+
      '<div class="cal-title">'+capFirst(MESES[m])+' '+y+'</div>'+
      '<div class="cal-navs"><button class="cal-nav" data-cal="nm" title="Mes siguiente">›</button><button class="cal-nav" data-cal="ny" title="Año siguiente">»</button></div>'+
    '</div>'+
    '<div class="cal-grid">'+dows+cells+'</div>'+
    '<div class="cal-foot"><button class="btn-ghost cal-today-btn">Hoy</button></div>';
  pop.querySelectorAll('[data-cal]').forEach(function(btn){btn.onclick=function(e){e.stopPropagation();
    const a=btn.dataset.cal;
    if(a==='pm')calView.setMonth(calView.getMonth()-1);
    else if(a==='nm')calView.setMonth(calView.getMonth()+1);
    else if(a==='py')calView.setFullYear(calView.getFullYear()-1);
    else calView.setFullYear(calView.getFullYear()+1);
    buildCal();};});
  pop.querySelectorAll('.cal-day').forEach(function(c){c.onclick=function(e){e.stopPropagation();
    S.ref=parseYMD(c.dataset.d); S.period='day';
    const db=document.querySelector('#periodSeg button[data-period="day"]'); if(db)setSeg('periodSeg',db);
    closeCal(); deferRender();};});
  const tb=pop.querySelector('.cal-today-btn');
  if(tb)tb.onclick=function(e){e.stopPropagation();S.ref=new Date();closeCal();renderAll();};
}

/* ── Agregación ── */
function inBounds(tx,b){const d=parseYMD(tx.date);return d>=b.start&&d<=b.end;}
// Movimientos reales = transacciones + pendientes ya completados (cuentan en métricas)
function allMovements(){
  const extra=S.pendings.filter(function(p){return p.status==='completed'&&p.dueDate;}).map(function(p){
    return {id:'pend-'+p.id, _pendId:p.id, _fromPending:true, type:p.kind, category:p.category||'(pendiente)', amount:p.amount, color:p.color, date:p.dueDate, source:'', method:p.method||'', note:p.note};
  });
  return S.transactions.concat(extra);
}
function periodTx(){const b=periodBounds(S.ref,S.period);return allMovements().filter(function(t){return inBounds(t,b);});}
function sumType(list,type){return list.filter(function(t){return t.type===type;}).reduce(function(a,t){return a+t.amount;},0);}
function breakdown(list,type){
  const map={};
  list.filter(function(t){return t.type===type;}).forEach(function(t){
    if(!map[t.category])map[t.category]={name:t.category,color:t.color,amount:0};
    map[t.category].amount+=t.amount; if(t.color)map[t.category].color=t.color;
  });
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return b.amount-a.amount;});
}

/* Gasto pagado desde el ahorro (source === 'Savings') */
function isFromSavings(t){return t.type==='Expense'&&t.source==='Savings';}
function fromSavingsSum(list){return list.filter(isFromSavings).reduce(function(a,t){return a+t.amount;},0);}
/* Ahorro neto del periodo = aportes − lo gastado desde el ahorro */
function savingsNet(list){return sumType(list,'Savings')-fromSavingsSum(list);}
/* Ahorro acumulado hasta esa fecha: es un SALDO, no el flujo del periodo. Pagar
   con ahorro de meses anteriores baja el saldo, pero solo queda en negativo si
   se saca más de lo que hay (ej. 190.000 ahorrados − 200.000 = −10.000). */
function savingsBalance(end){
  return savingsNet(allMovements().filter(function(t){return parseYMD(t.date)<=end;}));
}
/* Disponible global y estático = todo el dinero que tienes (ingresos − gastos, histórico) */
function globalDisponible(){const all=allMovements();return sumType(all,'Income')-sumType(all,'Expense');}
/* Ahorro que salió de tu bolsillo (no el de "Otra fuente"), neto de lo gastado desde el ahorro.
   El ahorro "Otra fuente" no se descuenta del disponible porque no salió de tu salario/ingreso. */
function pocketSavingsNet(){
  const all=allMovements();
  const saved=all.filter(function(t){return t.type==='Savings'&&t.source!=='Other';}).reduce(function(a,t){return a+t.amount;},0);
  return saved-fromSavingsSum(all);
}
/* Disponible real = ingresos − gastos − lo que apartaste en ahorro desde tu bolsillo.
   Es la plata que realmente te queda libre para gastar o aportar a metas. */
function disponibleReal(){return globalDisponible()-pocketSavingsNet();}

/* ── Bolsillos del ahorro ────────────────────────────────────────────────
   El ahorro total se reparte entre las metas (lo que cada una lleva guardado)
   y el "ahorro general", que es lo que no está apartado en ninguna meta. Un
   gasto pagado con ahorro tiene que salir de uno de esos bolsillos. */
function goalsSavedTotal(){return (S.goals||[]).reduce(function(a,g){return a+Math.max(0,g.saved||0);},0);}
function ahorroGeneral(){return Math.max(0,savingsNet(allMovements())-goalsSavedTotal());}
/* Saldo del bolsillo elegido: '' (o nulo) = ahorro general; si no, el id de la meta. */
function saldoBolsilloAhorro(goalId){
  if(!goalId)return ahorroGeneral();
  const g=(S.goals||[]).find(function(x){return String(x.id)===String(goalId);});
  return g?Math.max(0,g.saved||0):0;
}

/* ── Arranque (lo llama db.js después del login) ── */
// Hace que la WebView ocupe TODA la pantalla (detrás de la barra de estado).
// El contenido respeta las barras vía env(safe-area-inset-*) en el CSS.
async function setupFullscreen(){
  try{
    if(!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()))return;
    const SB=window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
    if(!SB)return;
    if(SB.setOverlaysWebView)await SB.setOverlaysWebView({overlay:true});
    if(SB.setStyle)await SB.setStyle({style:'DARK'}); // fondo oscuro → iconos claros
  }catch(e){}
}
async function init(){
  setupFullscreen();
  try{
    const data=await gs('getInitialData');
    S.transactions=data.transactions||[];
    S.categories=data.categories||S.categories;
    S.settings=data.settings||S.settings;
    S.pendings=data.pendings||[];
    S.budgets=data.budgets||[];
    S.recurring=data.recurring||[];
    S.goals=data.goals||[];
    S.palettes=data.palettes||PALETTES_FALLBACK;     // paletas por tipo
    if(window.Chart){Chart.defaults.color=tcol('--ink-2');Chart.defaults.font.family="'Inter',sans-serif";Chart.defaults.font.size=12;
      // Tooltip como HTML superpuesto (fondo opaco, z-index alto): legible, no se mezcla ni se recorta.
      Chart.defaults.plugins.tooltip.enabled=false;
      Chart.defaults.plugins.tooltip.external=externalChartTooltip;
    }
    wireUI(); renderAll();
  }catch(e){
    document.getElementById('boot').innerHTML='<div class="boot-sub">No se pudo cargar: '+(e&&e.message?e.message:e)+'</div>';
    return;
  }
  const boot=document.getElementById('boot');
  document.getElementById('app').classList.remove('hidden');
  requestAnimationFrame(function(){
    try{Object.keys(S.charts).forEach(function(k){if(S.charts[k])S.charts[k].resize();});}catch(e){}
    setTimeout(function(){
      boot.classList.add('gone');
      // Re-disparamos la animación de entrada (gráficas + conteo) ya visible al abrir
      if(S.view==='dashboard'){
        S._kpiPrev={income:0,expense:0,savings:0,balance:0}; S._donutPrev={};
        renderDashboard();
      }
      setTimeout(function(){boot.style.display='none';},520);
    },600);
  });
  notifStartup();
}

/* ── Conexiones de UI ── */
function wireUI(){
  // Tooltip de gráficas: cerrar al hacer scroll y al tocar fuera/otra gráfica (captura = corre primero)
  window.addEventListener('scroll',onScrollDismissTip,true);
  document.addEventListener('pointerdown',onPointerDownDismissTip,true);
  document.getElementById('periodSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('periodSeg',b);S.period=b.dataset.period;deferRender();});
  document.getElementById('prevPeriod').onclick=function(){S.ref=shiftRef(S.ref,S.period,-1);deferRender();};
  document.getElementById('nextPeriod').onclick=function(){S.ref=shiftRef(S.ref,S.period,1);deferRender();};
  document.getElementById('periodLabel').onclick=function(e){e.stopPropagation();toggleCal();};
  document.querySelector('.viewtabs').addEventListener('click',function(e){const b=e.target.closest('.vtab');if(!b)return;switchView(b.dataset.view,b);});
  const hg=document.getElementById('historyGrain');
  if(hg){hg.value=S.histGrain;hg.addEventListener('change',function(){S.histGrain=hg.value;histReset_();renderHistory();});}

  document.getElementById('addBtn').onclick=openActionMenu;
  document.getElementById('actionBackdrop').addEventListener('click',function(e){
    if(e.target.id==='actionBackdrop')closeActionMenu();
    const opt=e.target.closest('.action-opt'); if(opt){if(window.Haptic&&Haptic.light)Haptic.light();closeActionMenu();if(opt.dataset.type==='Pending')openPendModal();else openModal(opt.dataset.type);}
  });

  document.getElementById('modalClose').onclick=closeModal;
  document.getElementById('cancelBtn').onclick=closeModal;
  document.getElementById('modalBackdrop').addEventListener('click',function(e){if(e.target.id==='modalBackdrop')closeModal();});
  document.getElementById('saveBtn').onclick=saveTx;
  document.getElementById('amountInput').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('sourceSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('sourceSeg',b);S.modal.source=b.dataset.source;
    document.getElementById('sourceHint').textContent=b.dataset.source==='Salary'?'Se descuenta de tu disponible actual.':'Es un nuevo ingreso (no afecta tu disponible actual).';});
  document.getElementById('fromSavings').addEventListener('change',function(){setupExpGoalRow_();});
  wireDateFields(); trackKeyboard();
  document.getElementById('newCatSave').onclick=onNewCategoryInModal;
  document.getElementById('chipRow').addEventListener('click',function(e){
    const add=e.target.closest('.add-chip');
    if(add){const shown=document.getElementById('newCatRow').classList.toggle('show');
      document.getElementById('txColorRow').classList.toggle('hidden',!shown);
      add.innerHTML='<span class="chip-dot" style="background:currentColor"></span>'+(shown?'Cerrar':'Nueva');
      add.classList.toggle('open',shown);
      if(shown){S.modal.color=paletteFor(S.modal.type)[0]||'#4F46E5';markSwatch('swatchRow',S.modal.color);document.getElementById('newCatInput').focus({preventScroll:true});}
      return;}
    const chip=e.target.closest('.chip'); if(chip){selectChip(chip);document.getElementById('newCatRow').classList.remove('show');document.getElementById('txColorRow').classList.add('hidden');
      const ac=document.querySelector('#chipRow .add-chip');if(ac){ac.innerHTML='<span class="chip-dot" style="background:currentColor"></span>Nueva';ac.classList.remove('open');}}
  });
  document.getElementById('swatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.modal.color=s.dataset.color;markSwatch('swatchRow',S.modal.color);});
  wireColorWheel('swatchRowCustom',function(){return S.modal.color;},function(c){S.modal.color=c;markSwatch('swatchRow',c);});

  // Export
  document.getElementById('exportBtn').onclick=openExport;
  document.getElementById('exportClose').onclick=closeExport;
  document.getElementById('exportBackdrop').addEventListener('click',function(e){if(e.target.id==='exportBackdrop')closeExport();});
  document.getElementById('scopeSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('scopeSeg',b);S.exportScope=b.dataset.scope;
    document.getElementById('rangeRow').classList.toggle('show',b.dataset.scope==='range');
    const h={current:'Exporta el periodo que ves ahora en el panel.',range:'Elige las fechas de inicio y fin.',all:'Exporta absolutamente todos los movimientos.'};
    document.getElementById('scopeHint').textContent=h[b.dataset.scope];});
  document.getElementById('btnXlsx').onclick=function(){runExport('excel',this);};
  document.getElementById('btnPdf').onclick=function(){runExport('pdf',this);};

  // Navegación inferior (móvil)
  const bn=document.getElementById('bottomNav');
  if(bn)bn.addEventListener('click',function(e){const b=e.target.closest('.bn-item');if(!b)return;if(b.id==='bnMore'){openMore();return;}goToView(b.dataset.view);});
  document.getElementById('moreBackdrop').addEventListener('click',function(e){
    if(e.target.id==='moreBackdrop'){closeMore();return;}
    const opt=e.target.closest('.action-opt');if(opt){closeMore();goToView(opt.dataset.view);}
  });
  const emptyAdd=document.getElementById('emptyAddBtn');
  if(emptyAdd)emptyAdd.onclick=openActionMenu;

  // Pendientes
  document.getElementById('pendSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('pendSeg',b);S.pendFilter=b.dataset.pf;renderPending();});
  document.getElementById('pendClose').onclick=closePendModal;
  document.getElementById('pendCancel').onclick=closePendModal;
  document.getElementById('pendBackdrop').addEventListener('click',function(e){if(e.target.id==='pendBackdrop')closePendModal();});
  document.getElementById('pendSave').onclick=savePending;
  document.getElementById('pendAmount').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('pendKindSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('pendKindSeg',b);S.pend.kind=b.dataset.kind;buildPendChips(S.pend.kind,null);buildPendSwatches();
    const first=S.categories[S.pend.kind][0];S.pend.color=first?first.color:(paletteFor(S.pend.kind)[0]||'#F59E0B');markSwatch('pendSwatchRow',S.pend.color);});
  document.getElementById('pendNewCatSave').onclick=onNewPendCategory;
  document.getElementById('pendChipRow').addEventListener('click',function(e){
    const add=e.target.closest('.add-chip');
    if(add){document.getElementById('pendNewCatRow').classList.toggle('show');document.getElementById('pendNewCatInput').focus({preventScroll:true});return;}
    const chip=e.target.closest('.chip'); if(chip)selectPendChip(chip);
  });
  document.getElementById('pendSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.pend.color=s.dataset.color;markSwatch('pendSwatchRow',S.pend.color);});
  wireColorWheel('pendSwatchRowCustom',function(){return S.pend.color;},function(c){S.pend.color=c;markSwatch('pendSwatchRow',c);});

  // Editar categoría (modal)
  document.getElementById('editCatClose').onclick=closeEditCat;
  document.getElementById('editCatCancel').onclick=closeEditCat;
  document.getElementById('editCatBackdrop').addEventListener('click',function(e){if(e.target.id==='editCatBackdrop')closeEditCat();});
  document.getElementById('editCatSave').onclick=saveEditCat;
  document.getElementById('editCatName').addEventListener('input',function(e){S.editCat.newName=e.target.value;updateEditCatPreview();});
  document.getElementById('editCatSwatches').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.editCat.color=s.dataset.color;markSwatch('editCatSwatches',S.editCat.color);updateEditCatPreview();});
  wireColorWheel('editCatSwatchesCustom',function(){return S.editCat.color;},function(c){S.editCat.color=c;markSwatch('editCatSwatches',c);updateEditCatPreview();});

  // Historial: cabecera, buscador y menú de filtros
  wireHistHead();

  // Confirmación reutilizable
  document.getElementById('confirmCancel').onclick=closeConfirm;
  document.getElementById('confirmBackdrop').addEventListener('click',function(e){if(e.target.id==='confirmBackdrop')closeConfirm();});
  document.getElementById('confirmOk').onclick=function(){const cb=S.confirmCb;if(cb&&cb()===false)return;closeConfirm();};

  // Recurrencias (modal)
  document.getElementById('recurClose').onclick=closeRecurModal;
  document.getElementById('recurCancel').onclick=closeRecurModal;
  document.getElementById('recurBackdrop').addEventListener('click',function(e){if(e.target.id==='recurBackdrop')closeRecurModal();});
  document.getElementById('recurSave').onclick=saveRecur;
  document.getElementById('recurAmount').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('recurKindSeg').addEventListener('click',function(e){const b=e.target.closest('button');if(!b)return;setSeg('recurKindSeg',b);S.recur.type=b.dataset.rk;buildRecurChips(S.recur.type,null);buildRecurSwatches();
    const first=S.categories[S.recur.type][0];S.recur.color=first?first.color:(paletteFor(S.recur.type)[0]||'#64748B');markSwatch('recurSwatchRow',S.recur.color);});
  document.getElementById('recurChipRow').addEventListener('click',function(e){const chip=e.target.closest('.chip');if(chip&&!chip.classList.contains('add-chip'))selectRecurChip(chip);});
  document.getElementById('recurSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.recur.color=s.dataset.color;markSwatch('recurSwatchRow',S.recur.color);});
  wireColorWheel('recurSwatchRowCustom',function(){return S.recur.color;},function(c){S.recur.color=c;markSwatch('recurSwatchRow',c);});

  // Metas (modal)
  document.getElementById('goalClose').onclick=closeGoalModal;
  document.getElementById('goalCancel').onclick=closeGoalModal;
  document.getElementById('goalBackdrop').addEventListener('click',function(e){if(e.target.id==='goalBackdrop')closeGoalModal();});
  document.getElementById('goalSave').onclick=saveGoal;
  document.getElementById('goalTarget').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('goalSaved').addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});
  document.getElementById('goalSwatchRow').addEventListener('click',function(e){const s=e.target.closest('.swatch');if(!s)return;S.goal.color=s.dataset.color;markSwatch('goalSwatchRow',S.goal.color);});
  wireColorWheel('goalSwatchRowCustom',function(){return S.goal.color;},function(c){S.goal.color=c;markSwatch('goalSwatchRow',c);});

  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeModal();closeActionMenu();closeMore();closeExport();closeCal();closePendModal();closeEditCat();closeConfirm();closeRecurModal();closeGoalModal();}});

  // Auto-ocultar barras al hacer scroll (animado)
  setupAutoHideBars();
  // Reajustar gráficos y layout al girar / cambiar tamaño
  setupResizeHandling();
}
/* Al rotar el teléfono o cambiar el tamaño, recalcula gráficos y pestañas
   para que nada quede fuera de la pantalla (sobre todo al volver a vertical). */
function setupResizeHandling(){
  let t=null;
  function reflow(){
    try{ Object.keys(S.charts||{}).forEach(function(k){ if(S.charts[k])S.charts[k].resize(); }); }catch(e){}
    const active=document.querySelector('.vtab.active'); if(active)moveTabInk(active);
    positionAllSegInks();
  }
  function onResize(){ clearTimeout(t); t=setTimeout(reflow,120); }
  window.addEventListener('resize',onResize);
  // En algunos WebView 'resize' tarda en reflejar el nuevo ancho tras girar; reforzamos.
  window.addEventListener('orientationchange',function(){ setTimeout(reflow,250); setTimeout(reflow,500); });
}
/* Oculta la barra superior y la inferior al bajar; las muestra al subir */
function setupAutoHideBars(){
  const appbar=document.querySelector('.appbar');
  const bottomNav=document.getElementById('bottomNav');
  if(!appbar)return;
  const THRESH=6;     // movimiento mínimo para reaccionar (evita parpadeo)
  const TOP_LOCK=72;  // cerca del tope siempre se muestran
  // En esta app el scroll vive en <body> (por overflow-x:hidden + height:100%),
  // no en window; leemos de donde realmente se desplace.
  function scrollPos(){
    return window.scrollY||document.documentElement.scrollTop||document.body.scrollTop||0;
  }
  let lastY=scrollPos(), ticking=false;
  function apply(hide){
    appbar.classList.toggle('bars-hidden',hide);
    if(bottomNav)bottomNav.classList.toggle('bars-hidden',hide);
    document.body.classList.toggle('bars-hidden',hide); // para que el aviso sin conexión siga al menú
  }
  function onScroll(){
    ticking=false;
    if(document.body.classList.contains('no-scroll')){lastY=scrollPos();return;}
    const y=scrollPos();
    if(y<=TOP_LOCK){apply(false);lastY=y;return;}
    const dy=y-lastY;
    if(Math.abs(dy)>THRESH){apply(dy>0);lastY=y;}
  }
  // Fase de captura: atrapa el scroll aunque ocurra en <body> u otro contenedor.
  window.addEventListener('scroll',function(){
    if(!ticking){ticking=true;requestAnimationFrame(onScroll);}
  },{capture:true,passive:true});
}
function setSeg(id,btn){if(window.Haptic&&Haptic.light)Haptic.light();document.querySelectorAll('#'+id+' button').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');moveSegInk(id);}
function moveSegInk(seg){
  if(typeof seg==='string')seg=document.getElementById(seg);
  if(!seg)return;
  const btn=seg.querySelector('button.active'); if(!btn||!btn.offsetWidth)return;
  let ink=seg.querySelector('.seg-ink');
  if(!ink){ink=document.createElement('span');ink.className='seg-ink';seg.appendChild(ink);}
  // Posición y tamaño solo con transform (compositado por GPU) → desliza fluido.
  // El ancho base del .seg-ink es 100px; lo escalamos al ancho real del botón.
  ink.style.transform='translateX('+btn.offsetLeft+'px) scaleX('+(btn.offsetWidth/100)+')';
  seg.classList.add('ink-ready');
}
function positionAllSegInks(){document.querySelectorAll('.segmented').forEach(function(s){moveSegInk(s);});}
/* Anima la salida de un item (colapsa + se desvanece) y luego ejecuta la baja real */
function animateRemove(el, then){
  if(window.Haptic)Haptic.heavy();
  if(!el){then();return;}
  el.style.maxHeight=el.offsetHeight+'px';
  el.classList.add('removing');
  void el.offsetWidth; // fija el estado inicial antes de transicionar
  el.style.maxHeight='0px'; el.style.opacity='0'; el.style.transform='translateX(-26px)';
  el.style.marginTop='0'; el.style.marginBottom='0'; el.style.paddingTop='0'; el.style.paddingBottom='0';
  let done=false; function fin(){if(done)return;done=true;then();}
  el.addEventListener('transitionend',fin,{once:true});
  setTimeout(fin,380);
}
/* Encuentra el elemento de lista que contiene el id, dentro de un contenedor */
function rowEl(containerId,id,itemSel){
  const b=document.querySelector('#'+containerId+' [data-id="'+id+'"]');
  return b?b.closest(itemSel):null;
}
/* Deja que la transición del slider (Día/Semana/Mes/Año) pinte primero y luego
   ejecuta el render pesado del panel en el siguiente frame, para que no se trabe. */
function deferRender(){
  // Sin pulseDash: el conteo de los KPIs y el morph de las gráficas ya hacen la transición.
  // Reanimar los contenedores encima trababa el canvas (compositing doble).
  requestAnimationFrame(function(){requestAnimationFrame(function(){renderAll();});});
}
/* Reanima las tarjetas del panel al cambiar de período/fecha */
function pulseDash(){
  if(S.view!=='dashboard')return;
  document.querySelectorAll('#view-dashboard .kpi-grid, #view-dashboard .donut-grid, #view-dashboard .dash-row').forEach(function(el){
    el.style.animation='none'; void el.offsetWidth; el.style.animation='dashSwap .42s var(--ease) both';
  });
}

/* ── Confirmación reutilizable ── */
function confirmAction(title,message,okLabel,cb){
  document.getElementById('confirmTitle').textContent=title||'¿Confirmar?';
  document.getElementById('confirmMsg').textContent=message||'';
  document.getElementById('confirmOk').textContent=okLabel||'Confirmar';
  S.confirmCb=cb;
  const bk=document.getElementById('confirmBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
}
function closeConfirm(){const bk=document.getElementById('confirmBackdrop');bk.classList.remove('show');S.confirmCb=null;setTimeout(function(){bk.style.display='none';},250);}

/* ── Vistas ── */
function switchView(view,btn){
  if(view==='history'&&S.view!=='history')histReset_();
  S.view=view;
  document.querySelectorAll('.vtab').forEach(function(b){b.classList.remove('active');});btn.classList.add('active');
  ['dashboard','history','pending','categories','budgets','recurring','goals'].forEach(function(v){const el=document.getElementById('view-'+v);if(el)el.classList.toggle('hidden',v!==view);});
  // El calendario y Día/Semana/Mes/Año solo se muestran en el Panel
  const subbar=document.querySelector('.subbar');
  if(subbar)subbar.classList.toggle('hidden',view!=='dashboard');
  moveTabInk(btn);
  syncBottomNav(view);
  renderCurrentView();
  // Transición de entrada al cambiar de vista (se siente más pulido)
  const cur=document.getElementById('view-'+view);
  if(cur){cur.style.animation='none';void cur.offsetWidth;cur.style.animation='viewEnter .34s var(--ease) both';}
  requestAnimationFrame(positionAllSegInks);
}
/* Cambiar de vista desde la barra inferior, reutilizando la pestaña superior */
function goToView(view){
  const vt=document.querySelector('.vtab[data-view="'+view+'"]');
  if(vt)switchView(view,vt);
}
/* Resaltar el ítem correcto en la barra inferior (los secundarios marcan "Más") */
function syncBottomNav(view){
  const main=['dashboard','history','goals'];
  document.querySelectorAll('.bn-item').forEach(function(b){
    if(b.id==='bnMore')b.classList.toggle('active',main.indexOf(view)===-1);
    else b.classList.toggle('active',b.dataset.view===view);
  });
}
function openMore(){const b=document.getElementById('moreBackdrop');b.style.display='flex';requestAnimationFrame(function(){b.classList.add('show');});}
function closeMore(){const b=document.getElementById('moreBackdrop');if(!b)return;b.classList.remove('show');setTimeout(function(){b.style.display='none';},250);}
function renderCurrentView(){
  const v=S.view;
  if(v==='history')renderHistory();
  else if(v==='categories')renderCategories();
  else if(v==='pending')renderPending();
  else if(v==='budgets')renderBudgets();
  else if(v==='recurring')renderRecurring();
  else if(v==='goals')renderGoals();
  else renderDashboard();
}
function moveTabInk(btn){const ink=document.getElementById('vtabInk');ink.style.transform='translateX('+btn.offsetLeft+'px) scaleX('+btn.offsetWidth+')';try{btn.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'});}catch(e){}}

function renderAll(){
  document.getElementById('periodLabel').textContent=periodLabel(S.ref,S.period);
  renderCurrentView();
  const active=document.querySelector('.vtab.active'); if(active)moveTabInk(active);
  requestAnimationFrame(positionAllSegInks);
}

/* ── Panel ── */
function renderDashboard(){
  // Estado vacío para usuarios nuevos (sin ningún movimiento registrado)
  const hasAny=allMovements().length>0;
  const empty=document.getElementById('dashEmpty');
  if(empty)empty.hidden=hasAny;
  const dash=document.getElementById('view-dashboard');
  if(dash)dash.classList.toggle('is-empty',!hasAny);
  if(!hasAny)return;
  const list=periodTx();
  const inc=sumType(list,'Income'),exp=sumType(list,'Expense'),bal=disponibleReal();
  // Ingresos y gastos son del periodo; el ahorro es el saldo acumulado al cierre
  // del periodo que se está viendo (savPer es el movimiento del ahorro en él).
  const sav=savingsBalance(periodBounds(S.ref,S.period).end), savPer=savingsNet(list);
  countUp('income',inc);countUp('expense',exp);countUp('savings',sav);countUp('balance',bal);
  setSub('income',countOf(list,'Income'));setSub('expense',countOf(list,'Expense'));
  const fs=fromSavingsSum(list);
  setSub('savings',fs>0?('−'+money(fs)+' desde ahorro este periodo')
    :(savPer>0?('+'+money(savPer)+' este periodo'):'Total acumulado'));
  renderDeltas(inc,exp,sav);
  setSub('balance',smartLine(exp,savPer));
  ['Expense','Income','Savings'].forEach(renderDonut);
  renderTrend();
  renderPendChart();
}
/* Comparativa contra el mismo periodo anterior (día/semana/mes/año) */
function prevPeriodTx(){
  const prevRef=shiftRef(S.ref,S.period,-1);
  const b=periodBounds(prevRef,S.period);
  return allMovements().filter(function(t){return inBounds(t,b);});
}
function renderDeltas(inc,exp,sav){
  const prev=prevPeriodTx();
  const pInc=sumType(prev,'Income'), pExp=sumType(prev,'Expense');
  // El ahorro se compara contra el saldo al cierre del periodo anterior (cuánto
  // creció o bajó tu ahorro), no contra lo aportado en ese periodo.
  const pSav=savingsBalance(periodBounds(shiftRef(S.ref,S.period,-1),S.period).end);
  setDelta('income',inc,pInc,true);
  setDelta('expense',exp,pExp,false);   // en gastos, subir es "malo" → rojo
  setDelta('savings',sav,pSav,true);
}
function setDelta(key,cur,prev,upIsGood){
  const el=document.querySelector('[data-kpi-delta="'+key+'"]');
  if(!el)return;
  if(!prev){ el.textContent=''; el.className='kpi-delta'; return; }
  const pct=Math.round((cur-prev)/Math.abs(prev)*100);
  if(pct===0){ el.textContent='= igual al periodo anterior'; el.className='kpi-delta flat'; return; }
  const up=pct>0;
  const good=upIsGood?up:!up;
  // Con bases pequeñas el % se dispara a cifras absurdas → mostrar la diferencia en dinero
  el.textContent=(up?'▲ ':'▼ ')+(Math.abs(pct)>200?money(Math.abs(cur-prev)):(Math.abs(pct)+'%'))+' vs. periodo anterior';
  el.className='kpi-delta '+(good?'good':'bad');
}
function pendStatus(p){
  if(p.status==='completed')return {key:'completed',label:'Completado'};
  if(p.dueDate && p.dueDate < ymd(sod(new Date())))return {key:'overdue',label:'Vencido'};
  return {key:'pending',label:'Pendiente'};
}
function renderPendChart(){
  let incP=0,incV=0,incC=0,payP=0,payV=0,payC=0;
  S.pendings.forEach(function(p){
    const k=pendStatus(p).key, isInc=p.kind==='Income';
    if(k==='completed'){isInc?incC++:payC++;}
    else if(k==='overdue'){isInc?incV++:payV++;}
    else {isInc?incP++:payP++;}
  });
  const totInc=incP+incV+incC, totPay=payP+payV+payC;
  document.getElementById('pendCaption').textContent=(totInc+totPay)===0?'sin pendientes':(totInc+' ingreso(s) · '+totPay+' pago(s)');
  const canvas=document.getElementById('pendChart');
  // Sin pendientes: no dibujar ejes/rejilla vacíos — mostrar estado vacío
  const wrap=canvas.parentElement;
  let pes=wrap.querySelector('.pend-empty');
  if((totInc+totPay)===0){
    if(S.charts.pend){S.charts.pend.destroy();S.charts.pend=null;}
    canvas.style.display='none';
    if(!pes){pes=document.createElement('div');pes.className='pend-empty empty';pes.textContent='Sin pendientes por ahora';wrap.appendChild(pes);}
    return;
  }
  canvas.style.display='';
  if(pes)pes.remove();
  // Sus datos no dependen del periodo: si ya existe, solo actualizar (no recrear en cada cambio de día/mes)
  if(S.charts.pend){
    const ch=S.charts.pend;
    ch.data.datasets[0].data=[incP,payP];
    ch.data.datasets[1].data=[incV,payV];
    ch.data.datasets[2].data=[incC,payC];
    ch.update('none');
    return;
  }
  S.charts.pend=new Chart(canvas,{
    type:'bar',
    data:{labels:['Ingresos','Pagos'],datasets:[
      {label:'Pendiente',data:[incP,payP],backgroundColor:tcol('--warn'),borderRadius:5,maxBarThickness:42,minBarLength:4,stack:'s'},
      {label:'Vencido',data:[incV,payV],backgroundColor:tcol('--neg'),borderRadius:5,maxBarThickness:42,minBarLength:4,stack:'s'},
      {label:'Completado',data:[incC,payC],backgroundColor:tcol('--pos'),borderRadius:5,maxBarThickness:42,minBarLength:4,stack:'s'}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:true,labels:{usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:12}},
        tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+c.parsed.x;}}}},
      scales:{x:{stacked:true,beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{precision:0,stepSize:1}},
              y:{stacked:true,grid:{display:false},border:{display:false}}},
      animation:{duration:800,easing:'easeOutQuart'}}
  });
}
function countOf(list,type){const n=list.filter(function(t){return t.type===type;}).length;return n+' '+(n===1?'movimiento':'movimientos');}
function setSub(key,txt){const el=document.querySelector('[data-kpi-sub="'+key+'"]');if(el)el.textContent=txt;}
function countUp(key,to){
  const el=document.querySelector('[data-kpi="'+key+'"]');
  if(!el)return;
  const had=(key in S._kpiPrev);
  const from=S._kpiPrev[key]||0; S._kpiPrev[key]=to;
  // Destello de color cuando el valor cambia (no en la primera carga)
  if(had && Math.round(to)!==Math.round(from)){
    el.classList.remove('kpi-up','kpi-down'); void el.offsetWidth;
    el.classList.add(to>=from?'kpi-up':'kpi-down');
    setTimeout(function(){el.classList.remove('kpi-up','kpi-down');},800);
  }
  if(key==='balance'){writeTicker(el,to);}else{animateMoney(el,from,to);}
}
/* Conteo del valor (texto, barato). */
function animateMoney(el,from,to){
  if(!el)return;
  if(Math.round(from)===Math.round(to)){writeMoney(el,to);return;}
  const dur=800,t0=performance.now();
  function step(now){const p=Math.min((now-t0)/dur,1),e=1-Math.pow(1-p,3);writeMoney(el,from+(to-from)*e);if(p<1)requestAnimationFrame(step);}
  requestAnimationFrame(step);
}
/* Animación de entrada de las gráficas: 100% GPU (opacity + transform), escalonada. Fluida. */
function pulseChart(c,kind,seq){
  if(window._noChartPulse)return; // al cambiar de tema no se repite la animación de entrada
  if(!c)return;
  c.style.animation='none'; void c.offsetWidth;
  var delay=((seq||0)*160)+'ms';
  c.style.animation=(kind==='bars'?'chartPopBars':'chartPopDonut')+' .7s var(--ease) '+delay+' both';
}
var _tipShown=false, _tipChart=null;
/* Oculta el tooltip y limpia el estado de tooltip de las gráficas (excepto la indicada). */
function clearChartTipState(exceptCanvas){
  Object.keys(S.charts||{}).forEach(function(k){
    var ch=S.charts[k]; if(!ch||ch.canvas===exceptCanvas)return;
    try{ ch.setActiveElements([]); if(ch.tooltip)ch.tooltip.setActiveElements([],{x:0,y:0}); }catch(e){}
  });
}
function hideChartTip(){
  var tip=document.getElementById('chartTip'); if(tip)tip.classList.remove('show'); _tipShown=false; _tipChart=null;
}
/* Cierra el tooltip al hacer scroll. */
function onScrollDismissTip(){ if(_tipShown){hideChartTip(); clearChartTipState(null);} }
/* Al tocar otra gráfica, limpia el estado de las demás para que no peleen por el tooltip;
   al tocar fuera de cualquier gráfica, cierra el tooltip. */
function onPointerDownDismissTip(e){
  if(!_tipShown)return;
  var onChart = e.target && e.target.tagName==='CANVAS';
  clearChartTipState(onChart?e.target:null);
  if(!onChart)hideChartTip();
}
/* Tooltip HTML superpuesto para las gráficas: fondo opaco, por encima de todo (no se mezcla),
   y con una animación suave de aparición (la única animación de las gráficas). */
function externalChartTooltip(context){
  var tip=document.getElementById('chartTip');
  if(!tip){tip=document.createElement('div');tip.id='chartTip';tip.className='chart-tip';document.body.appendChild(tip);}
  var tt=context.tooltip;
  if(!tt||tt.opacity===0){tip.classList.remove('show'); _tipShown=false; _tipChart=null; return;}
  var wasShown=tip.classList.contains('show');
  var title=(tt.title||[]).join(' ');
  var body=(tt.body||[]).map(function(b){return b.lines.join(' ');});
  var colors=tt.labelColors||[];
  var html=title?('<div class="ct-title">'+esc(title)+'</div>'):'';
  body.forEach(function(line,i){
    var bg=colors[i]&&colors[i].backgroundColor;
    var dot=(typeof bg==='string')?('<span class="ct-dot" style="background:'+bg+'"></span>'):'';
    html+='<div class="ct-row">'+dot+'<span>'+esc(line.trim())+'</span></div>';
  });
  var changed=(tip._html!==html);
  tip.innerHTML=html; tip._html=html;
  var rect=context.chart.canvas.getBoundingClientRect();
  var tw=tip.offsetWidth, th=tip.offsetHeight, pad=8;
  var left=rect.left+tt.caretX-tw/2, top=rect.top+tt.caretY-th-12;
  if(left<pad)left=pad; if(left+tw>window.innerWidth-pad)left=window.innerWidth-pad-tw;
  if(top<pad)top=rect.top+tt.caretY+16;
  var sameChart=(_tipChart===context.chart); _tipChart=context.chart;
  if(sameChart && wasShown){
    // Mismo gráfico, otro segmento → se desliza
    tip.style.transition='left .2s var(--ease), top .2s var(--ease), opacity .16s var(--ease)';
    tip.style.left=left+'px'; tip.style.top=top+'px';
    if(changed){ tip.style.animation='none'; void tip.offsetWidth; tip.style.animation='ctBump .22s var(--ease)'; }
  }else{
    // Primera vez o GRÁFICO DISTINTO → aparece con animación (fade + pop) en el nuevo lugar
    tip.style.transition='';
    tip.style.left=left+'px'; tip.style.top=top+'px';
    tip.style.animation='none'; void tip.offsetWidth; tip.style.animation='ctAppear .24s var(--ease)';
  }
  tip.classList.add('show'); _tipShown=true;
}
function renderDonut(type){
  // Solo categorías con monto positivo (un retiro de meta es ahorro negativo y no se grafica)
  const list=periodTx(), data=breakdown(list,type).filter(function(d){return d.amount>0;}), total=data.reduce(function(a,d){return a+d.amount;},0);
  document.querySelector('[data-donut-total="'+type+'"]').textContent=money(total);
  const center=document.querySelector('[data-donut-center="'+type+'"]');
  // Número central con conteo animado (igual que los KPIs)
  center.innerHTML='<div class="dc-top">'+tipoES(type)+'</div><div class="dc-val"></div>';
  animateMoney(center.querySelector('.dc-val'), S._donutPrev[type]||0, total); S._donutPrev[type]=total;
  const legend=document.querySelector('[data-legend="'+type+'"]'), canvas=document.querySelector('[data-donut="'+type+'"]');
  if(!data.length){if(S.charts[type]){S.charts[type].destroy();S.charts[type]=null;}legend.innerHTML='<li class="empty">'+TXT.sinDatos+'</li>';const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);return;}
  // Con una sola categoría (100%) el anillo va completo, sin muesca
  const single=data.length<=1;
  // Versión ligera (sin bordes redondeados ni separación, que era lo pesado al animar)
  // Porción mínima visible: montos muy pequeños se dibujan con un mínimo del 3.5%
  // del anillo para que no desaparezcan; el tooltip y la leyenda muestran el monto real.
  const MINSLICE=0.035;
  const ds={data:data.map(function(d){return single?d.amount:Math.max(d.amount,total*MINSLICE);}),backgroundColor:data.map(function(d){return d.color;}),borderColor:tcol('--surface'),borderWidth:single?0:2,hoverOffset:0};
  // Se dibuja el canvas AL INSTANTE (sin animación de Chart.js = cero repintado por frame).
  // La animación de entrada es 100% GPU (opacity + transform) vía pulseChart → sin tirones.
  const seq=({Expense:0,Income:1,Savings:2})[type]||0;
  if(S.charts[type])S.charts[type].destroy();
  S.charts[type]=new Chart(canvas,{
    type:'doughnut',
    data:{labels:data.map(function(d){return d.name;}),datasets:[ds]},
    options:{cutout:'74%',responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){const real=data[c.dataIndex]?data[c.dataIndex].amount:c.parsed;const raw=total?real/total*100:0;const pct=(raw>0&&raw<1)?'<1':Math.round(raw);return ' '+c.label+': '+money(real)+' ('+pct+'%)';}}}},
      animation:false}
  });
  pulseChart(canvas,'donut',seq);
  legend.innerHTML=data.map(function(d,i){const raw=total?d.amount/total*100:0;const pct=(raw>0&&raw<1)?'<1':Math.round(raw);
    return '<li style="animation-delay:'+(i*40)+'ms"><span class="lg-dot" style="background:'+safeColor(d.color)+'"></span><span class="lg-name">'+esc(d.name)+'</span><span class="lg-pct">'+pct+'%</span><span class="lg-amt">'+money(d.amount)+'</span></li>';}).join('');
}
function renderTrend(){
  const ref=S.ref, period=S.period;
  const canvas=document.getElementById('trendChart');

  // ── DÍA: una barra por tipo (Ingresos/Gastos/Ahorro), siempre centrado ──
  if(period==='day'){
    document.getElementById('trendCaption').textContent='este día · '+DOW[ref.getDay()]+' '+ref.getDate()+' '+MON[ref.getMonth()];
    const b={start:sod(ref),end:sod(ref)};
    const list=allMovements().filter(function(t){return inBounds(t,b);});
    const vals=[sumType(list,'Income'),sumType(list,'Expense'),sumType(list,'Savings')];
    if(S.charts.trend && S._trendMode==='day'){
      // Morph suave: misma estructura, solo cambian los valores
      S.charts.trend.data.labels=['Ingresos','Gastos','Ahorro'];
      S.charts.trend.data.datasets[0].data=vals;
      S.charts.trend.update('none');
    }else{
      if(S.charts.trend)S.charts.trend.destroy();
      S.charts.trend=new Chart(canvas,{
        type:'bar',
        data:{labels:['Ingresos','Gastos','Ahorro'],datasets:[{data:vals,backgroundColor:function(c){var cols=[tcol('--pos'),tcol('--neg'),tcol('--sav')];return barGrad(c,cols[c.dataIndex]||cols[0]);},borderRadius:6,maxBarThickness:64,minBarLength:6}]},
        options:{responsive:true,maintainAspectRatio:false,
          categoryPercentage:0.6,barPercentage:0.8,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+c.label+': '+money(c.parsed.y);}}}},
          scales:{x:{grid:{display:false},border:{display:false}},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{callback:function(v){return compact(v);}}}},
          animation:false}
      });
      S._trendMode='day';
    }
    pulseChart(canvas,'bars'); // dibujado por CSS (crece desde abajo)
    return;
  }

  // ── SEMANA / MES / AÑO: barras agrupadas por bucket ──
  const labels=[],inc=[],exp=[],sav=[]; let caption='';
  const MOV=allMovements();
  function bucket(label,start,end){
    const b={start:start,end:end};
    const list=MOV.filter(function(t){return inBounds(t,b);});
    labels.push(label); inc.push(sumType(list,'Income')); exp.push(sumType(list,'Expense')); sav.push(sumType(list,'Savings'));
  }
  if(period==='week'){
    caption='los 7 días de esta semana (lun–dom)';
    const mon=mondayOf(ref);
    for(let i=0;i<7;i++){const d=new Date(mon);d.setDate(mon.getDate()+i);bucket(DOW[d.getDay()]+' '+d.getDate(), sod(d), sod(d));}
  }else if(period==='month'){
    caption='las 4 semanas de '+capFirst(MESES[ref.getMonth()]);
    const y=ref.getFullYear(), m=ref.getMonth(), dim=new Date(y,m+1,0).getDate();
    [[1,7],[8,14],[15,21],[22,dim]].forEach(function(r,i){bucket('Sem '+(i+1), new Date(y,m,r[0]), new Date(y,m,r[1]));});
  }else{
    caption='los 12 meses de '+ref.getFullYear();
    const y=ref.getFullYear();
    for(let mo=0;mo<12;mo++)bucket(MON[mo], new Date(y,mo,1), new Date(y,mo+1,0));
  }
  document.getElementById('trendCaption').textContent=caption;
  if(S.charts.trend && S._trendMode==='grouped'){
    // Morph suave entre semana/mes/año: misma estructura (3 series), solo cambian datos y etiquetas
    const ch=S.charts.trend;
    ch.data.labels=labels;
    ch.data.datasets[0].data=inc; ch.data.datasets[1].data=exp; ch.data.datasets[2].data=sav;
    ch.update('none'); pulseChart(canvas,'bars');
    return;
  }
  if(S.charts.trend)S.charts.trend.destroy();
  S._trendMode='grouped';
  S.charts.trend=new Chart(canvas,{
    type:'bar',
    data:{labels:labels,datasets:[
      {label:'Ingresos',data:inc,backgroundColor:function(c){return barGrad(c,tcol('--pos'));},borderRadius:6,maxBarThickness:30,minBarLength:4},
      {label:'Gastos',data:exp,backgroundColor:function(c){return barGrad(c,tcol('--neg'));},borderRadius:6,maxBarThickness:30,minBarLength:4},
      {label:'Ahorro',data:sav,backgroundColor:function(c){return barGrad(c,tcol('--sav'));},borderRadius:6,maxBarThickness:30,minBarLength:4}]},
    options:{responsive:true,maintainAspectRatio:false,
      categoryPercentage:0.8,barPercentage:0.92,
      plugins:{legend:{display:true,labels:{usePointStyle:true,pointStyle:'circle',boxWidth:8,padding:16,
        color:tcol('--ink-2'),
        generateLabels:function(chart){var cols=[tcol('--pos'),tcol('--neg'),tcol('--sav')];return chart.data.datasets.map(function(ds,i){return {text:ds.label,fillStyle:cols[i],strokeStyle:cols[i],lineWidth:0,pointStyle:'circle',fontColor:tcol('--ink-2'),datasetIndex:i,hidden:!chart.isDatasetVisible(i)};});}}},tooltip:{callbacks:{label:function(c){return ' '+c.dataset.label+': '+money(c.parsed.y);}}}},
      scales:{x:{grid:{display:false},border:{display:false},offset:true},y:{beginAtZero:true,grid:{color:'rgba(255,255,255,.05)'},border:{display:false},ticks:{callback:function(v){return compact(v);}}}},
      animation:false}
  });
  pulseChart(canvas,'bars'); // dibujado por CSS (crece desde abajo)
}
function compact(v){const a=Math.abs(v);if(a>=1e6)return (v/1e6).toFixed(1)+'M';if(a>=1e3)return Math.round(v/1e3)+'k';return v;}
function hexToRgba(hex,a){hex=String(hex).replace('#','');return 'rgba('+parseInt(hex.slice(0,2),16)+','+parseInt(hex.slice(2,4),16)+','+parseInt(hex.slice(4,6),16)+','+a+')';}
/* Gradiente vertical para barras: color sólido arriba → translúcido abajo (look premium).
   Se cachea por gráfica+color+alto: crearlo en cada frame trababa la animación. */
function barGrad(ctx,hex){
  const ch=ctx.chart,area=ch.chartArea; if(!area)return hex;
  const h=Math.round(area.bottom-area.top);
  const cache=ch._gradCache||(ch._gradCache={});
  const key=hex+'@'+h;
  if(cache[key])return cache[key];
  const g=ch.ctx.createLinearGradient(0,area.top,0,area.bottom);
  g.addColorStop(0,hexToRgba(hex,1));g.addColorStop(1,hexToRgba(hex,.40));
  cache[key]=g;
  return g;
}

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
  if(inp)inp.addEventListener('input',function(e){S.histSearch=e.target.value;histReset_();histSyncHead();renderHistory();});
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
  const del=t._fromPending?'data-pend="'+t._pendId+'"':'data-id="'+t.id+'"';
  const rowCls='hist-row'+(t._fromPending?' is-pend':'')+(t._fromPending&&t._pendKey!=='completed'?' is-unrealized':'');
  const statePill=t._fromPending?'<span class="hr-state '+t._pendKey+'">'+t._pendLabel+'</span>':'';
  return '<div class="'+rowCls+'"><span class="hr-ava" style="background:'+safeColor(t.color)+'22;color:'+safeColor(t.color)+'">'+catIcon(t.category,t.type)+'</span>'+
    '<div class="hr-main"><span class="hr-cat">'+esc(t.category)+statePill+'</span><span class="hr-meta">'+meta+'</span></div>'+
    '<span class="hr-amt '+t.type+'">'+sign+money(t.amount)+'</span>'+
    '<button class="hr-edit" '+del+' title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
    '<button class="hr-del" '+del+' title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button></div>';
}

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
    const sws=(paletteFor(type)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');
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
  document.getElementById('editCatSwatches').innerHTML=(paletteFor(type)||[]).map(function(col){
    return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';
  }).join('');
  markSwatch('editCatSwatches',cat.color);
  S.editCat.icon=getCatIconOverrides()[type+'|'+name.toLowerCase()]||'';
  renderEditCatIcons();
  updateEditCatPreview();
  updateEditCatPreview();
  const bk=document.getElementById('editCatBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('editCatName').focus({preventScroll:true});},250);
}
function closeEditCat(){const bk=document.getElementById('editCatBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
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
        '<button class="pend-act done" data-act="done" data-id="'+p.id+'" title="'+(p.status==='completed'?'Reabrir':'Marcar completado')+'" aria-label="'+(p.status==='completed'?'Reabrir':'Completar')+'">'+(p.status==='completed'?ICON.undo:ICON.check)+'</button>'+
        '<button class="pend-act" data-act="edit" data-id="'+p.id+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+p.id+'" title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button>'+
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
  const bk=document.getElementById('pendBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');positionAllSegInks();});
  setTimeout(function(){document.getElementById('pendAmount').focus({preventScroll:true});},250);
}
function closePendModal(){const bk=document.getElementById('pendBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function buildPendChips(kind,selected){
  const row=document.getElementById('pendChipRow'), cats=S.categories[kind]||[];
  row.innerHTML=cats.map(function(c){const on=selected?c.name===selected:false;
    return '<button class="chip'+(on?' active':'')+'" data-name="'+esc(c.name)+'" data-color="'+safeColor(c.color)+'" style="color:'+safeColor(c.color)+'"><span class="chip-ico">'+catIcon(c.name)+'</span><span style="color:var(--txt)">'+esc(c.name)+'</span></button>';
  }).join('')+'<button class="chip add-chip"><span class="chip-dot" style="background:currentColor"></span>Nueva</button>';
  S.pend.category=selected||(cats[0]?cats[0].name:null);
  if(!selected&&row.querySelector('.chip:not(.add-chip)'))row.querySelector('.chip:not(.add-chip)').classList.add('active');
}
function buildPendSwatches(){document.getElementById('pendSwatchRow').innerHTML=(paletteFor(S.pend.kind)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');}
function selectPendChip(chip){
  document.querySelectorAll('#pendChipRow .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');
  S.pend.category=chip.dataset.name;
  if(chip.dataset.color){S.pend.color=chip.dataset.color;markSwatch('pendSwatchRow',S.pend.color);}
}
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

/* ── Menú de acción ── */
function openActionMenu(){const b=document.getElementById('actionBackdrop');b.style.display='flex';requestAnimationFrame(function(){b.classList.add('show');});const ab=document.getElementById('addBtn');if(ab)ab.classList.add('menu-open');}
function closeActionMenu(){const b=document.getElementById('actionBackdrop');b.classList.remove('show');setTimeout(function(){b.style.display='none';},250);const ab=document.getElementById('addBtn');if(ab)ab.classList.remove('menu-open');}

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
  const bk=document.getElementById('modalBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');positionAllSegInks();});
  setTimeout(function(){document.getElementById('amountInput').focus({preventScroll:true});},250);
}
function markChip(rowId,name){const chips=document.querySelectorAll('#'+rowId+' .chip');chips.forEach(function(c){c.classList.toggle('active',c.dataset.name===name);});}
function closeModal(){const bk=document.getElementById('modalBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}

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
  const row=document.getElementById('chipRow'), cats=S.categories[type]||[];
  row.innerHTML=cats.map(function(c,i){return '<button class="chip'+(i===0?' active':'')+'" data-name="'+esc(c.name)+'" data-color="'+safeColor(c.color)+'" style="color:'+safeColor(c.color)+'"><span class="chip-ico">'+catIcon(c.name)+'</span><span style="color:var(--txt)">'+esc(c.name)+'</span></button>';}).join('')+'<button class="chip add-chip"><span class="chip-dot" style="background:currentColor"></span>Nueva</button>';
  S.modal.category=cats.length?cats[0].name:null;
}
function selectChip(chip){
  document.querySelectorAll('#chipRow .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');
  S.modal.category=chip.dataset.name;
  if(chip.dataset.color){S.modal.color=chip.dataset.color;markSwatch('swatchRow',S.modal.color);}
}
function buildSwatches(){document.getElementById('swatchRow').innerHTML=(paletteFor(S.modal.type)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');}
function markSwatch(id,color){
  let matched=false;
  document.querySelectorAll('#'+id+' .swatch').forEach(function(s){var on=s.dataset.color===color;s.classList.toggle('active',on);if(on)matched=true;});
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

/* ── Exportación ── */
function openExport(){
  const bk=document.getElementById('exportBackdrop');
  document.getElementById('exportStatus').textContent='';
  // valores por defecto del rango = periodo actual
  const b=periodBounds(S.ref,S.period);
  setDate_('rangeStart',ymd(b.start));
  setDate_('rangeEnd',ymd(b.end));
  bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');positionAllSegInks();});
}
function closeExport(){const bk=document.getElementById('exportBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
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

/* ═══════════════ PRESUPUESTOS ═══════════════ */
function budgetFor(category){const b=S.budgets.find(function(x){return x.category===category;});return b?b.amount:0;}
function monthExpenseByCategory(){
  // gasto del mes en curso (mes de S.ref) por categoría
  const b=periodBounds(S.ref,'month');
  const map={};
  allMovements().filter(function(t){return t.type==='Expense'&&inBounds(t,b);}).forEach(function(t){
    map[t.category]=(map[t.category]||0)+t.amount;
  });
  return map;
}
/* ═══════════════ NOTIFICACIONES (presupuestos · metas · pendientes) ═══════════════ */
function curMonthKey(){const d=new Date();return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2);}
// Gasto del MES REAL en curso por categoría (independiente del periodo que se esté viendo)
function monthExpenseForCategoryNow(category){
  const b=periodBounds(new Date(),'month');
  return allMovements().filter(function(t){return t.type==='Expense'&&t.category===category&&inBounds(t,b);})
    .reduce(function(a,t){return a+t.amount;},0);
}
// Revisa un presupuesto y avisa al cruzar 80% o 100% (una sola vez por mes). silent=solo registrar estado.
function evalBudget(category,notify){
  notify=notify&&ntOn('budget');   // el seguimiento sigue; solo se calla el aviso
  if(!window.Notif||!category)return;
  const bg=budgetFor(category); if(bg<=0)return;
  const spent=monthExpenseForCategoryNow(category);
  const ratio=spent/bg, mk=curMonthKey();
  const k80='budget80:'+category+':'+mk, k100='budget100:'+category+':'+mk;
  if(ratio<0.8){ Notif.clearSeen(k80); Notif.clearSeen(k100); return; }
  if(ratio<1){ Notif.clearSeen(k100); }
  if(ratio>=1){
    if(!Notif.wasSeen(k100)){ if(notify)Notif.now(k100,'🚨 Presupuesto agotado','Llegaste al 100% de "'+category+'": '+money(spent)+' de '+money(bg)+'.'); Notif.markSeen(k100); Notif.markSeen(k80); }
  }else if(ratio>=0.8){
    if(!Notif.wasSeen(k80)){ if(notify)Notif.now(k80,'⚠️ Cerca del límite del presupuesto','Vas en '+Math.round(ratio*100)+'% de "'+category+'": '+money(spent)+' de '+money(bg)+'.'); Notif.markSeen(k80); }
  }
}
// Revisa una meta y avisa al cruzar 80% o 100%.
function evalGoal(g,notify){
  if(!window.Notif||!g||!g.target||g.target<=0)return;
  notify=notify&&ntOn('goal');
  const ratio=g.saved/g.target;
  const k80='goal80:'+g.id, k100='goal100:'+g.id;
  if(ratio<0.8){ Notif.clearSeen(k80); Notif.clearSeen(k100); return; }
  if(ratio<1){ Notif.clearSeen(k100); }
  if(ratio>=1){
    if(!Notif.wasSeen(k100)){ if(notify)Notif.now(k100,'🎉 ¡Meta cumplida!','Completaste "'+g.name+'": '+money(g.saved)+' de '+money(g.target)+'.'); Notif.markSeen(k100); Notif.markSeen(k80); }
  }else if(ratio>=0.8){
    if(!Notif.wasSeen(k80)){ if(notify)Notif.now(k80,'🔥 Casi logras tu meta','Vas en '+Math.round(ratio*100)+'% de "'+g.name+'": '+money(g.saved)+' de '+money(g.target)+'.'); Notif.markSeen(k80); }
  }
}
// Programa los avisos de un pendiente: recordatorio el día ANTES (9:00) y "vencido" el día DESPUÉS (9:00).
function schedulePendAlerts(p){
  if(!window.Notif||!p||!p.dueDate||p.status==='completed')return;
  if(!ntOn('pend')){ cancelPendAlerts(p.id); return; }   // apagado en Ajustes
  const due=parseYMD(p.dueDate);
  // Recordatorio: un día antes de la fecha acordada
  const remind=new Date(due.getFullYear(),due.getMonth(),due.getDate()-1,9,0,0,0);
  if(remind.getTime()>Date.now())
    Notif.at('pend-reminder:'+p.id,'🔔 Recordatorio',
      (p.kind==='Income'?'Mañana tienes un cobro: ':'Mañana tienes un pago: ')+(p.category||'')+' · '+money(p.amount),remind);
  // Vencido: un día después de la fecha acordada
  const over=new Date(due.getFullYear(),due.getMonth(),due.getDate()+1,9,0,0,0);
  if(over.getTime()>Date.now())
    Notif.at('pend-overdue:'+p.id,'⚠️ Pendiente vencido',(p.category||'Pendiente')+' · '+money(p.amount)+' venció.',over);
}
// Cancela ambos avisos (recordatorio y vencido) de un pendiente.
function cancelPendAlerts(id){
  if(!window.Notif)return;
  Notif.cancel('pend-reminder:'+id);
  Notif.cancel('pend-overdue:'+id);
}
// Recorre los pendientes: avisa los ya vencidos (una vez) y programa los futuros.
function scanPendingsNotif(notify){
  if(!window.Notif)return;
  notify=notify&&ntOn('pend');
  (S.pendings||[]).forEach(function(p){
    if(p.status==='completed'){ cancelPendAlerts(p.id); return; }
    if(!p.dueDate)return;
    const due=parseYMD(p.dueDate);
    const overdueAt=new Date(due.getFullYear(),due.getMonth(),due.getDate()+1,9,0,0,0);
    if(overdueAt.getTime()<=Date.now()){
      const k='pend-overdue-fired:'+p.id;
      if(!Notif.wasSeen(k)){ if(notify)Notif.now('pend-overdue:'+p.id,'⚠️ Pendiente vencido',(p.category||'Pendiente')+' · '+money(p.amount)+' está vencido.'); Notif.markSeen(k); }
    }else{
      schedulePendAlerts(p);
    }
  });
}
// Recordatorio diario: si un día no registras ningún movimiento, avisa a las 20:00.
// Programa los próximos días y cancela solo el día en que sí registras algo.
function scheduleDailyReminders(){
  if(!window.Notif)return;
  const DAYS=14, HOUR=20;
  // Apagado en Ajustes: cancelar los que ya estaban programados y salir
  if(!ntOn('daily')){
    const b=sod(new Date());
    for(let i=0;i<DAYS;i++)Notif.cancel('daily-reminder:'+ymd(new Date(b.getFullYear(),b.getMonth(),b.getDate()+i)));
    return;
  }
  const moved={};
  (S.transactions||[]).forEach(function(t){ if(t.date)moved[t.date]=true; });
  const base=sod(new Date());
  for(let i=0;i<DAYS;i++){
    const d=new Date(base.getFullYear(),base.getMonth(),base.getDate()+i,HOUR,0,0,0);
    const key='daily-reminder:'+ymd(d);
    if(moved[ymd(d)]||d.getTime()<=Date.now()) Notif.cancel(key);
    else Notif.at(key,'📝 Registra tus movimientos','¡No te olvides de registrar tus movimientos del día!',d);
  }
}
// Arranque: pide permiso y revisa el estado actual. En la PRIMERA ejecución solo
// registra el estado (sin avisar) para no llenar de notificaciones al instalar.
/* Vuelve a aplicar TODO el estado de notificaciones según los interruptores de
   Ajustes. Se llama al cambiar cualquiera: apagar cancela lo programado y
   encender lo vuelve a programar (antes solo cancelaba). No manda avisos
   inmediatos — solo reprograma — para que tocar un interruptor no dispare
   una avalancha de notificaciones viejas. */
function aplicarNotifs(){
  if(!window.Notif||!Notif.available())return;
  try{
    scheduleDailyReminders();                       // respeta ntOn('daily')
    (S.pendings||[]).forEach(function(p){           // respeta ntOn('pend')
      if(p.status==='completed')cancelPendAlerts(p.id);
      else schedulePendAlerts(p);
    });
    (S.categories.Expense||[]).forEach(function(c){ evalBudget(c.name,false); });
    (S.goals||[]).forEach(function(g){ evalGoal(g,false); });
  }catch(e){}
}
window.aplicarNotifs=aplicarNotifs;

function notifStartup(){
  if(!window.Notif||!Notif.available())return;
  Notif.init().then(function(ok){
    if(!ok)return;
    const firstRun=!Notif.wasSeen('__baseline__');
    const notify=!firstRun;
    (S.categories.Expense||[]).forEach(function(c){ evalBudget(c.name,notify); });
    (S.goals||[]).forEach(function(g){ evalGoal(g,notify); });
    scanPendingsNotif(notify);
    scheduleDailyReminders();
    if(firstRun)Notif.markSeen('__baseline__');
  });
}

function renderBudgets(){
  const wrap=document.getElementById('budgetList');
  const spent=monthExpenseByCategory();
  const cats=(S.categories.Expense||[]);
  if(!cats.length){wrap.innerHTML=emptyState(ICON.chart,'Sin categorías de gasto','Crea categorías de gasto para asignarles un presupuesto mensual.');return;}
  document.getElementById('budgetCaption').textContent=capFirst(MESES[S.ref.getMonth()])+' '+S.ref.getFullYear();
  // resumen total
  let totBudget=0,totSpent=0;
  cats.forEach(function(c){const bg=budgetFor(c.name);if(bg>0){totBudget+=bg;totSpent+=(spent[c.name]||0);}});
  const totPct=totBudget?Math.min(100,Math.round(totSpent/totBudget*100)):0;
  // Resumen del mes (tarjeta destacada)
  let head='';
  if(totBudget>0){
    head='<div class="budget-total">'+
      '<span class="bt-label">Gastado en '+MESES[S.ref.getMonth()]+'</span>'+
      '<div class="bt-big">'+money(totSpent)+' <span class="bt-of">de '+money(totBudget)+'</span></div>'+
      '<div class="bbar big"><span class="bbar-fill '+barClass(totSpent,totBudget)+'" style="width:'+totPct+'%'+(totPct>0?';min-width:6px':'')+'"></span></div>'+
      '<div class="bt-row"><span>'+totPct+'% usado</span><span class="bt-val">'+
        (totSpent>totBudget?(money(totSpent-totBudget)+' por encima del límite'):(money(totBudget-totSpent)+' disponible'))+'</span></div>'+
    '</div>';
  }
  // Con presupuesto primero (ordenados por % de uso, el más comprometido arriba); sin presupuesto, compactas al final
  const withB=cats.filter(function(c){return budgetFor(c.name)>0;})
    .sort(function(a,b){return (spent[b.name]||0)/budgetFor(b.name)-(spent[a.name]||0)/budgetFor(a.name);});
  const without=cats.filter(function(c){return !budgetFor(c.name);});
  const rows=withB.map(function(c,i){
    const bg=budgetFor(c.name), sp=spent[c.name]||0;
    const pct=bg?Math.min(100,Math.round(sp/bg*100)):0;
    const over=sp>bg;
    const state=over?'<span class="b-tag over">Excedido</span>':(sp/bg>=0.8?'<span class="b-tag warn">Cerca</span>':'<span class="b-tag ok">En rango</span>');
    return '<div class="budget-item" style="animation-delay:'+(i*30)+'ms">'+
      '<div class="bi-head">'+
        '<span class="hr-ava" style="background:'+safeColor(c.color)+'22;color:'+safeColor(c.color)+'">'+catIcon(c.name,'Expense')+'</span>'+
        '<div class="bi-info"><span class="bi-name">'+esc(c.name)+'</span><span class="bi-sub">'+money(sp)+' de '+money(bg)+'</span></div>'+
        state+
        '<div class="bi-acts">'+
          '<button class="pend-act bi-edit" data-cat="'+esc(c.name)+'" data-bg="'+bg+'" aria-label="Editar">'+ICON.edit+'</button>'+
          '<button class="pend-act del bi-del" data-cat="'+esc(c.name)+'" aria-label="Eliminar">'+ICON.trash+'</button>'+
        '</div></div>'+
      '<div class="bbar"><span class="bbar-fill '+barClass(sp,bg)+'" style="width:'+pct+'%'+(pct>0?';min-width:6px':'')+'"></span></div>'+
      '<div class="bi-foot"><span>'+pct+'% usado</span><span>'+(over?(money(sp-bg)+' por encima'):(money(bg-sp)+' disponible'))+'</span></div>'+
    '</div>';
  }).join('');
  const rest=without.length?('<div class="b-sec">Sin presupuesto</div>'+without.map(function(c,i){
    const sp=spent[c.name]||0;
    return '<div class="budget-item compact" style="animation-delay:'+((withB.length+i)*30)+'ms">'+
      '<div class="bi-head">'+
        '<span class="hr-ava" style="background:'+safeColor(c.color)+'22;color:'+safeColor(c.color)+'">'+catIcon(c.name,'Expense')+'</span>'+
        '<div class="bi-info"><span class="bi-name">'+esc(c.name)+'</span><span class="bi-sub">'+(sp?('Gastado '+money(sp)+' este mes'):'Sin gastos este mes')+'</span></div>'+
        '<button class="btn-ghost bi-def bi-edit" data-cat="'+esc(c.name)+'" data-bg="0">＋ Definir</button>'+
      '</div></div>';
  }).join('')):'';
  wrap.innerHTML=head+rows+rest;
  wrap.querySelectorAll('.bi-edit').forEach(function(b){b.onclick=function(){promptBudget(b.dataset.cat,Number(b.dataset.bg)||0);};});
  wrap.querySelectorAll('.bi-del').forEach(function(b){b.onclick=function(){removeBudget(b.dataset.cat);};});
}
/* Eliminar presupuesto: pide confirmación y luego lo baja a cero */
function removeBudget(category){
  const i=S.budgets.findIndex(function(x){return x.category===category;});
  if(i<0)return;
  confirmAction('Eliminar presupuesto','Se quitará el presupuesto de "'+category+'" (queda en cero).','Eliminar',function(){
    const j=S.budgets.findIndex(function(x){return x.category===category;});
    if(j<0)return;
    const prevB=S.budgets.slice();
    S.budgets.splice(j,1);
    renderBudgets();
    if(window.Notif){ const mk=curMonthKey(); Notif.clearSeen('budget80:'+category+':'+mk); Notif.clearSeen('budget100:'+category+':'+mk); }
    gs('setBudget','Expense',category,0).then(function(){toast('Presupuesto eliminado','ok');})
      .catch(function(){S.budgets=prevB;renderBudgets();toast('No se pudo eliminar','err');});
  });
}
function barClass(sp,bg){if(!bg)return '';const r=sp/bg;return r>1?'over':(r>=0.8?'warn':'ok');}
function promptBudget(category,current){
  // usa el modal de confirmación como contenedor simple con input
  const html='<div style="margin-top:10px"><div class="amount-field"><span class="cur">'+esc(S.settings.currencySymbol)+'</span>'+
    '<input type="text" inputmode="numeric" id="budgetInput" value="'+(current?groupDigits(String(current)):'')+'" placeholder="0" autocomplete="off"></div>'+
    '<p class="hint" style="margin-top:8px">Deja en 0 (o vacío) para quitar el presupuesto.</p></div>';
  openMiniInput('Presupuesto · '+category, html, 'Guardar', function(){
    const v=parseInt(String(document.getElementById('budgetInput').value).replace(/\D/g,''),10)||0;
    const prevB=S.budgets.slice();
    const i=S.budgets.findIndex(function(x){return x.category===category;});
    if(v<=0){ if(i>=0)S.budgets.splice(i,1); }
    else if(i>=0)S.budgets[i].amount=v;
    else S.budgets.push({type:'Expense',category:category,amount:v});
    renderBudgets();
    if(window.Notif){
      if(v<=0){ const mk=curMonthKey(); Notif.clearSeen('budget80:'+category+':'+mk); Notif.clearSeen('budget100:'+category+':'+mk); }
      else evalBudget(category,true);
    }
    gs('setBudget','Expense',category,v).then(function(){toast('Presupuesto guardado','ok');})
      .catch(function(){S.budgets=prevB;renderBudgets();toast('No se pudo guardar','err');});
  });
  setTimeout(function(){const el=document.getElementById('budgetInput');if(el){el.focus({preventScroll:true});el.addEventListener('input',function(e){e.target.value=groupDigits(e.target.value);});}},260);
}

/* Mini-input reutilizable (usa el modal de confirmación con cuerpo personalizado) */
function openMiniInput(title,bodyHtml,okLabel,cb){
  document.getElementById('confirmTitle').textContent=title;
  document.getElementById('confirmMsg').innerHTML=bodyHtml;
  document.getElementById('confirmOk').textContent=okLabel||'Guardar';
  S.confirmCb=cb;
  const bk=document.getElementById('confirmBackdrop');bk.style.display='flex';
  // El cuerpo puede traer un .segmented: hay que colocar su burbuja ya visible,
  // si no queda sin posicionar y después no acompaña a la opción activa.
  requestAnimationFrame(function(){bk.classList.add('show');positionAllSegInks();});
}

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
        '<button class="pend-act" data-act="toggle" data-id="'+r.id+'" title="'+(r.active?'Pausar':'Activar')+'" aria-label="'+(r.active?'Pausar':'Activar')+'">'+(r.active?ICON.pause:ICON.play)+'</button>'+
        '<button class="pend-act" data-act="edit" data-id="'+r.id+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+r.id+'" title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('.pend-act').forEach(function(b){b.onclick=function(){
    const id=b.dataset.id,act=b.dataset.act;
    if(act==='toggle')toggleRecur(id);else if(act==='edit')openRecurModal(id);else removeRecur(id);
  };});
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
  const bk=document.getElementById('recurBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');positionAllSegInks();});
  setTimeout(function(){document.getElementById('recurAmount').focus({preventScroll:true});},250);
}
function closeRecurModal(){const bk=document.getElementById('recurBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
function buildRecurChips(type,selected){
  const row=document.getElementById('recurChipRow'),cats=S.categories[type]||[];
  row.innerHTML=cats.map(function(c){const on=selected?c.name===selected:false;
    return '<button class="chip'+(on?' active':'')+'" data-name="'+esc(c.name)+'" data-color="'+safeColor(c.color)+'"><span class="chip-dot" style="background:'+safeColor(c.color)+'"></span><span style="color:var(--txt)">'+esc(c.name)+'</span></button>';}).join('');
  S.recur.category=selected||(cats[0]?cats[0].name:null);
  if(!selected&&row.querySelector('.chip'))row.querySelector('.chip').classList.add('active');
}
function buildRecurSwatches(){document.getElementById('recurSwatchRow').innerHTML=(paletteFor(S.recur.type)||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');}
function selectRecurChip(chip){
  document.querySelectorAll('#recurChipRow .chip').forEach(function(c){c.classList.remove('active');});chip.classList.add('active');
  S.recur.category=chip.dataset.name;
  if(chip.dataset.color){S.recur.color=chip.dataset.color;markSwatch('recurSwatchRow',S.recur.color);}
}
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
        '<button class="btn-ghost goal-contrib" data-id="'+g.id+'">＋ Aportar</button>'+
        '<button class="btn-ghost goal-contrib minus" data-id="'+g.id+'">－ Retirar</button>'+
        '<button class="pend-act edit" data-act="edit" data-id="'+g.id+'" title="Editar" aria-label="Editar">'+ICON.edit+'</button>'+
        '<button class="pend-act del" data-act="del" data-id="'+g.id+'" title="Eliminar" aria-label="Eliminar">'+ICON.trash+'</button>'+
      '</div></div>';
  }).join('');
  wrap.querySelectorAll('.goal-contrib').forEach(function(b){b.onclick=function(){contribGoal(b.dataset.id,b.classList.contains('minus'));};});
  wrap.querySelectorAll('.pend-act').forEach(function(b){b.onclick=function(){const id=b.dataset.id;if(b.dataset.act==='edit')openGoalModal(id);else removeGoal(id);};});
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
  document.getElementById('goalSwatchRow').innerHTML=(paletteFor('Savings')||[]).map(function(col){return '<span class="swatch" data-color="'+col+'" style="background:'+col+'"></span>';}).join('');
  markSwatch('goalSwatchRow',S.goal.color);
  const bk=document.getElementById('goalBackdrop');bk.style.display='flex';requestAnimationFrame(function(){bk.classList.add('show');});
  setTimeout(function(){document.getElementById('goalName').focus({preventScroll:true});},250);
}
function closeGoalModal(){const bk=document.getElementById('goalBackdrop');bk.classList.remove('show');setTimeout(function(){bk.style.display='none';},250);}
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