/*****************************************************************************************
 * CONTROL FINANZAS MS — cliente
 * Toda la agregación y los gráficos se calculan aquí (cliente) para que sea rápido.
 * El servidor (Supabase, vía db.js) sólo se usa para: carga inicial, agregar/borrar
 * movimiento, categorías, y guardar pendientes/presupuestos/metas/recurrencias.
 *
 * NOTA: la función gs() y el arranque automático viven ahora en db.js.
 * El cliente está dividido en www/app/*.js por pantallas; este archivo es la base.
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
    document.getElementById('boot').innerHTML='<div class="boot-sub">No se pudo cargar: '+esc(e&&e.message?e.message:String(e))+'</div>';
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
