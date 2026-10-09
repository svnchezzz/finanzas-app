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
  errBorrar:'No se pudo eliminar',sinDatos:'Sin datos en estas fechas'};

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
  setTimeout(function(){o.classList.remove('show');},800); // debe durar lo mismo que sfIn/sfBadge
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
  tag:_ci('<path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><path d="M7 7h.01"/>'),
  music:_ci('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
  movie:_ci('<rect x="2.5" y="6" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="m7 6 2 4M12 6l2 4M17 6l2 4"/>'),
  tv:_ci('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="m17 2-5 5-5-5"/>'),
  ticket:_ci('<path d="M3 9a3 3 0 0 0 0 6v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3a3 3 0 0 0 0-6V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"/><path d="M13 5v2M13 11v2M13 17v2"/>'),
  drinks:_ci('<path d="M8 22h8M12 11v11"/><path d="M3 3h18l-9 8z"/>'),
  pizza:_ci('<path d="M12 2 3 20c6 2.7 12 2.7 18 0z"/><path d="M5.6 15.5c4.2 1.5 8.6 1.5 12.8 0"/><circle cx="12" cy="10" r="1"/><circle cx="10" cy="15.5" r=".8"/>'),
  key:_ci('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>'),
  building:_ci('<rect x="4" y="2.5" width="16" height="19" rx="2"/><path d="M9.5 21.5v-4h5v4"/><path d="M8.5 7h.01M12 7h.01M15.5 7h.01M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 15h.01M15.5 15h.01"/>'),
  water:_ci('<path d="M12 2.7S5 10 5 14.5a7 7 0 0 0 14 0C19 10 12 2.7 12 2.7z"/>'),
  fuel:_ci('<path d="M3.5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16"/><path d="M2 21h13"/><path d="M3.5 10h10"/><path d="M13.5 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>'),
  parking:_ci('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>'),
  plane:_ci('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
  bike:_ci('<circle cx="5.5" cy="17" r="3.5"/><circle cx="18.5" cy="17" r="3.5"/><path d="M15 5.5h2.5L18.5 17"/><path d="M5.5 17 9 9.5h8M9 9.5 12 17h-1"/>'),
  pill:_ci('<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"/><path d="m8.5 8.5 7 7"/>'),
  shield:_ci('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>'),
  receipt:_ci('<path d="M5 2v20l2-1.3 2 1.3 2-1.3 2 1.3 2-1.3 2 1.3 2-1.3V2l-2 1.3L15 2l-2 1.3L11 2 9 3.3 7 2z"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>'),
  handshake:_ci('<path d="m11 17 2 2a1 1 0 1 0 3-3"/><path d="m14 14 2.5 2.5a1 1 0 1 0 3-3l-3.9-3.9a3 3 0 0 0-4.2 0l-.9.9a1 1 0 1 1-3-3l2.8-2.8a5.8 5.8 0 0 1 7.1-.9l.5.3a2 2 0 0 0 1.4.3L21 4"/><path d="m21 3 1 11h-2"/><path d="M3 3 2 14l6.5 6.5a1 1 0 1 0 3-3"/><path d="M3 4h8"/>'),
  piggy:_ci('<path d="M19 9.5c-.6-2.6-3.4-4.5-7-4.5-4 0-7 2.6-7 6 0 1.8.8 3.3 2 4.4V19h3v-2h4v2h3v-3.2c.9-.6 1.6-1.4 2-2.3h2v-4z"/><path d="M15 9.5h.01"/><path d="M10 5.2V3.5"/>'),
  donate:_ci('<path d="M11 14h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 16"/><path d="m7 20 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.75-2.91l-4.2 3.9"/><path d="m2 15 6 6"/><path d="M19.5 8.5c.7-.7 1.5-1.6 1.5-2.7A2.73 2.73 0 0 0 16 4a2.78 2.78 0 0 0-5 1.8c0 1.2.8 2 1.5 2.8L16 12z"/>'),
  beauty:_ci('<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>'),
  baby:_ci('<circle cx="12" cy="8.5" r="5"/><path d="M10 8h.01M14 8h.01"/><path d="M10.5 10.5a2 2 0 0 0 3 0"/><path d="M6 21a6 6 0 0 1 12 0"/>'),
  book:_ci('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  tools:_ci('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>'),
  clean:_ci('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>'),
  laptop:_ci('<rect x="4" y="4" width="16" height="11" rx="1.5"/><path d="M2 19h20"/>'),
  camera:_ci('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.4"/>'),
  plant:_ci('<path d="M12 22V11"/><path d="M12 11C12 6 8 3 3 3c0 5 4 8 9 8z"/><path d="M12 14c0-4 3-7 8-7 0 4-3 7-8 7z"/>'),
  ball:_ci('<circle cx="12" cy="12" r="9"/><path d="m12 7.5 4 2.9-1.5 4.6h-5L8 10.4z"/><path d="M12 3v4.5M21 10.5l-5 0M18 19.5l-3.5-4.5M6 19.5l3.5-4.5M3 10.5h5"/>'),
  heart:_ci('<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>')
};
/* Nombre de cada ícono (lectores de pantalla y la cuadrícula de elección) */
const CAT_LABEL={home:'Hogar',bus:'Transporte',car:'Carro',food:'Comida',cart:'Mercado',health:'Salud',edu:'Educación',fun:'Videojuegos',
  travel:'Viajes',clothes:'Ropa',bolt:'Energía',wifi:'Internet',phone:'Celular',paw:'Mascotas',gift:'Regalos',money:'Salario',
  briefcase:'Trabajo',invest:'Inversión',bank:'Banco',card:'Tarjeta',cash:'Efectivo',repeat:'Suscripción',gym:'Gimnasio',coffee:'Café',
  tag:'Etiqueta',music:'Música',movie:'Cine',tv:'Streaming',ticket:'Eventos',drinks:'Bebidas',pizza:'Comida rápida',key:'Arriendo',
  building:'Administración',water:'Agua',fuel:'Gasolina',parking:'Parqueadero',plane:'Vuelos',bike:'Bicicleta',pill:'Medicamentos',
  shield:'Seguros',receipt:'Impuestos',handshake:'Préstamos',piggy:'Ahorro',donate:'Donaciones',beauty:'Belleza',baby:'Hijos',
  book:'Libros',tools:'Reparaciones',clean:'Aseo',laptop:'Tecnología',camera:'Fotografía',plant:'Plantas',ball:'Deportes',heart:'Pareja'};
const CAT_KEYS=[
  // Específicos primero: ganan sobre los generales de abajo
  [/(musica|cancion|instrumento|guitarra|piano|spotify|deezer|youtube music)/,'music'],
  [/(cine|pelicula|teatro)/,'movie'],
  [/(netflix|disney|hbo|\bmax\b|prime video|streaming|television|\btv\b|cable)/,'tv'],
  [/(concierto|evento|boleta|entrada|festival)/,'ticket'],
  [/(peluqueria|barberia|belleza|unas|manicure|\bspa\b|cosmetic|maquillaje|corte de pelo)/,'beauty'],
  [/(\bbar\b|trago|cerveza|licor|vino|coctel|rumba|discoteca)/,'drinks'],
  [/(pizza|hamburguesa|comida rapida|snack|antojo|perro caliente)/,'pizza'],
  [/(arriendo|alquiler|\brenta\b)/,'key'],
  [/(administracion|conjunto|condominio|edificio)/,'building'],
  [/(agua|acueducto)/,'water'],
  [/(gasolina|combustible|tanqueo|diesel|acpm)/,'fuel'],
  [/(parqueadero|parqueo|estacionamiento)/,'parking'],
  [/(vuelo|avion|aerolinea|tiquete)/,'plane'],
  [/(bici|patineta|scooter)/,'bike'],
  [/(medicamento|medicina|drogueria|farmacia|pastilla|vitamina)/,'pill'],
  [/(seguro|soat|poliza)/,'shield'],
  [/(impuesto|predial|dian|retencion|\biva\b|declaracion)/,'receipt'],
  [/(prestamo|deuda|abono|credito personal)/,'handshake'],
  [/(alcancia|cesantia|ahorro)/,'piggy'],
  [/(donacion|diezmo|ofrenda|caridad|iglesia)/,'donate'],
  [/(bebe|hijo|hija|nino|nina|panal|guarderia|jardin infantil)/,'baby'],
  [/(libro|lectura|papeleria|utiles)/,'book'],
  [/(reparacion|arreglo|mantenimiento|plomero|ferreteria|herramienta)/,'tools'],
  [/(aseo|limpieza|lavanderia|detergente|empleada)/,'clean'],
  [/(computador|portatil|tecnologia|software|laptop|electronic|videojuego|consola)/,'laptop'],
  [/(foto|camara)/,'camera'],
  [/(planta|jardin|vivero)/,'plant'],
  [/(futbol|deporte|partido|cancha|tenis|basket|natacion)/,'ball'],
  [/(pareja|novi|cita|aniversario)/,'heart'],
  [/(casa|hogar|arriendo|\brenta\b|hipoteca|alquiler|mueble)/,'home'],
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
  let html='<button type="button" class="icon-opt auto'+(cur?'':' active')+'" data-ico="" title="Sugerido según el nombre" aria-label="Ícono sugerido según el nombre">'+
    (typeof autoCatIcon_==='function'?autoCatIcon_():CAT_SVG.tag)+'<em>Auto</em></button>';
  Object.keys(CAT_SVG).forEach(function(k){
    const lb=CAT_LABEL[k]||k;
    html+='<button type="button" class="icon-opt'+(cur===k?' active':'')+'" data-ico="'+k+'" title="'+lb+'" aria-label="'+lb+'" aria-pressed="'+(cur===k)+'">'+CAT_SVG[k]+'</button>';
  });
  g.innerHTML=html;
  g.querySelectorAll('.icon-opt').forEach(function(b){
    b.addEventListener('click',function(){
      S.editCat.icon=this.dataset.ico||'';
      g.querySelectorAll('.icon-opt').forEach(function(x){x.classList.remove('active');x.setAttribute('aria-pressed','false');});
      this.classList.add('active');this.setAttribute('aria-pressed','true');
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
    const P=perTxt();
    if(pct>200)return exp>pExp?('Gastaste '+money(exp-pExp)+' más '+P.que):('Gastaste '+money(pExp-exp)+' menos '+P.que);
    if(pct>0)return exp<pExp?('Gastaste '+pct+'% menos '+P.que):('Gastaste '+pct+'% más '+P.que);
  }
  if(sav>0)return 'Ahorraste '+money(sav)+' '+perTxt().este;
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
  arrowDown:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>',
  arrowUp:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
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

/* Nombre de lo que se compara, en vez de "periodo": "ayer", "la semana anterior",
   "el mes anterior"… y de lo que se ve ("hoy", "este mes", "en septiembre"). */
function perTxt(period,ref){
  period=period||S.period; ref=ref||S.ref;
  const now=new Date(), b=periodBounds(ref,period), actual=now>=b.start&&now<=sod(new Date(b.end.getTime()+864e5-1));
  if(period==='day')return actual
    ?{este:'hoy',vs:'vs. ayer',que:'que ayer',igual:'igual que ayer'}
    :{este:'ese día',vs:'vs. día anterior',que:'que el día anterior',igual:'igual al día anterior'};
  if(period==='week')return {este:actual?'esta semana':'esa semana',vs:'vs. semana anterior',que:'que la semana anterior',igual:'igual a la semana anterior'};
  if(period==='month')return {este:actual?'este mes':'en '+MESES[ref.getMonth()],vs:'vs. mes anterior',que:'que el mes anterior',igual:'igual al mes anterior'};
  return {este:actual?'este año':'en '+ref.getFullYear(),vs:'vs. año anterior',que:'que el año anterior',igual:'igual al año anterior'};
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
    S._loaded=true;                                  // desde aquí db.js puede guardar la copia local
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
