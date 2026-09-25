/*****************************************************************************************
 * CONTROL FINANZAS MS — db.js  (v3: modo sin internet para movimientos)
 *
 * Capa que conecta el frontend con Supabase. Además:
 *  - Exporta a Excel/PDF en el cliente (SheetJS + jsPDF).
 *  - MODO SIN INTERNET para movimientos: puedes agregar, editar y borrar
 *    movimientos sin señal; se guardan en una "bandeja de salida" local y se
 *    suben solos al volver el internet, SIN duplicarse (gracias a client_id).
 *  - Lectura offline: si abres la app sin internet, muestra tu última copia.
 *
 * ───────────────────────────────────────────────────────────────────────────────────
 *  PASO OBLIGATORIO: pega tu publishable key de Supabase en la línea de abajo.
 *  NUNCA pongas aquí la Secret key (sb_secret_...).
 * ───────────────────────────────────────────────────────────────────────────────────
 */
const SUPABASE_URL = 'https://jjluniqevodygaojmhqn.supabase.co';
const SUPABASE_KEY = 'sb_publishable__VD9Q4rWFEt7fhIj2hw9SA_9n1hv02m';

// Cuánto esperar una petición antes de darla por caída (corta TODAS las peticiones,
// incluidas las que no pasan por netCall_). Clave para no quedarse colgado 20s+.
const NET_TIMEOUT_MS = 3000;
// fetch con corte por tiempo: si el servidor no responde a tiempo, se aborta.
// Datos: corte corto (NET_TIMEOUT_MS) para detectar "sin internet" rápido.
// Auth (login/registro): más holgado, para no cortar la sesión en redes lentas.
function timeoutFetch_(input, init){
  const url = (typeof input==='string') ? input : (input && input.url) || '';
  const ms = /\/auth\/v1\//.test(url) ? 12000 : NET_TIMEOUT_MS;
  const ctrl = new AbortController();
  const t = setTimeout(function(){ try{ ctrl.abort(); }catch(e){} }, ms);
  const opts = Object.assign({}, init || {}, { signal: ctrl.signal });
  return fetch(input, opts).finally(function(){ clearTimeout(t); });
}

// ¿Se abrió la app desde el enlace de "cambiar contraseña" del correo? Se lee ANTES de crear el
// cliente, porque Supabase consume y limpia esos datos de la URL al iniciar.
const RECOVERY_LINK_ = /(^|[#&?])type=recovery(&|$)/.test(location.hash + '&' + location.search.slice(1));
const LINK_ERROR_ = /(^|[#&?])error_code=/.test(location.hash + '&' + location.search.slice(1));
let recoveryPending_ = RECOVERY_LINK_, appStarted_ = false;

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: timeoutFetch_ } });

// Con enlaces tipo PKCE (?code=…) no hay type=recovery en la URL: Supabase avisa con este evento.
sb.auth.onAuthStateChange(function(ev){
  if (ev !== 'PASSWORD_RECOVERY') return;
  recoveryPending_ = true;
  if (document.getElementById('login-ov')) showResetPassword_();
});

// A dónde vuelve el enlace del correo de recuperación: en la web, esta misma página (la app pide la
// contraseña nueva); en el APK, la página de GitHub Pages que la pide (docs/restablecer.html).
function authRedirectUrl_(){
  const nativo = window.Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform();
  return nativo ? 'https://svnchezzz.github.io/finanzas-app/restablecer.html' : location.origin + location.pathname;
}

const PALETTE_BY_TYPE = {
  Income:  ['#10B981','#059669','#047857','#065F46','#14B8A6','#0891B2','#06B6D4','#0ea5e9'],
  Expense: ['#EF4444','#DC2626','#B91C1C','#F43F5E','#F97316','#FB923C','#F59E0B','#FBBF24'],
  Savings: ['#8B5CF6','#7C3AED','#6D28D9','#4F46E5','#6366F1','#3B82F6','#60A5FA','#93C5FD']
};

let CURRENT_USER_ID = null;

const TIPO_ES = { Income:'Ingreso', Expense:'Gasto', Savings:'Ahorro' };
const ORIGEN_ES = { Salary:'Salario', Other:'Otra fuente', Savings:'Ahorro' };

/* ═══════════════ Utilidades de mapeo ═══════════════ */
function today_(){ return new Date().toISOString().slice(0,10); }
function normSource_(s){ return (s==='Salary'||s==='Other'||s==='Savings') ? s : null; }
function num_(v){ return Number(v)||0; }

/* IMPORTANTE: el "id" que usa la app para un movimiento es su client_id
   (código único), no el id interno del servidor. Así todo encaja igual,
   haya sido creado con o sin internet. */
function mapTx_(r){ return {
  id:String(r.client_id || r.id), timestamp:r.created_at, date:r.date, type:r.type, category:r.category,
  amount:num_(r.amount), color:r.color||'#64748B', source:r.source||'', note:r.note||'', _goalId:(r.goal_id!=null?String(r.goal_id):null) }; }

function mapPending_(r){ return {
  id:String(r.id), dueDate:r.due_date||'', kind:r.kind, category:r.category||'', amount:num_(r.amount),
  color:r.color||'#64748B', method:r.method||'', status:r.status, note:r.note||'' }; }

function mapBudget_(r){ return { type:r.type, category:r.category, amount:num_(r.monthly_amount) }; }

function mapRecurring_(r){ return {
  id:String(r.id), type:r.type, category:r.category||'', amount:num_(r.amount), color:r.color||'#64748B',
  source:r.source||'', day:r.day_of_month||1, note:r.note||'', active:!!r.active, lastGen:r.last_generated||'' }; }

function mapGoal_(r){ return {
  id:String(r.id), name:r.name, target:num_(r.target), saved:num_(r.saved), color:r.color||'#8B5CF6', note:r.note||'' }; }

/* El símbolo de moneda acaba dentro de HTML a través de money(), que se usa en
   decenas de sitios. Se limpia aquí, en el único punto por donde entra desde el
   servidor, en vez de escapar en cada uso: fuera caracteres de marcado y
   máximo 4 caracteres (basta para $, €, COP, S/…). */
/* Neutraliza celdas que una hoja de cálculo interpretaría como fórmula.
   En .xlsx un texto no se evalúa como fórmula, pero el archivo se comparte y
   es habitual reguardarlo como CSV, donde =, +, - y @ SÍ se ejecutan (incluso
   DDE). Se antepone un apóstrofo, que las hojas de cálculo tratan como
   "esto es texto". Barato y sin efectos sobre los datos legítimos. */
function celdaSegura_(v){
  if (typeof v!=='string') return v;                 // números y fechas, intactos
  return /^[=+\-@\t\r]/.test(v) ? "'"+v : v;
}
function filaSegura_(fila){ return fila.map(celdaSegura_); }

function limpiaSimbolo_(s){
  const v=String(s==null?'':s).replace(/[<>"'`&\\/]/g,'').trim().slice(0,4);
  return v||'$';
}
function mapSettings_(r){ return {
  currencySymbol:limpiaSimbolo_(r?.currency_symbol), locale:r?.locale||'es-CO', decimals:r?.decimals||0,
  appName:'Control Finanzas MS', palette:[],
  notifyEmail:r?.notify_email||'', notifyEnabled:!!r?.notify_enabled }; }

/* ═══════════════ Utilidades MODO SIN INTERNET ═══════════════ */
function uuid_(){
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){
    const r=Math.random()*16|0, v=c==='x'?r:(r&0x3|0x8); return v.toString(16);
  });
}
let _netDown=false;          // true = el servidor no responde (sin internet REAL, aunque el WiFi esté encendido)

// "Sin conexión" = sin interfaz de red  O  el servidor no responde (internet real caído)
function isOffline_(){ return (typeof navigator!=='undefined' && navigator.onLine===false) || _netDown; }
function isNetErr_(e){
  if (typeof navigator!=='undefined' && navigator.onLine===false) return true;
  const m = ((e && (e.message||e.msg)) || '') + '';
  return /fetch|network|Failed to fetch|NetworkError|timeout|abort|ECONN|ENOTFOUND/i.test(m);
}
// Error de sesión/autenticación (token vencido, refresco fallido, respuesta 401…).
// Ocurre p.ej. tras horas sin abrir la app: el token caduca y, si además no hay
// internet real, no se puede refrescar. En estos casos NO debemos perder el
// movimiento: lo tratamos como "guardar local y reintentar luego".
function isAuthErr_(e){
  if (!e) return false;
  const m = ((e.message||e.msg||e.error_description||e.error||e.hint||'') + '');
  const code = (e.code!=null ? e.code : (e.status!=null ? e.status : '')) + '';
  return code==='401' || /jwt|token|refresh|session|unauthorized|not authenticated|invalid claim|expired/i.test(m);
}
// ¿Conviene conservar el cambio y reintentarlo? (sin internet O sesión por refrescar)
function isRetriable_(e){ return isNetErr_(e) || isAuthErr_(e); }
// Corre una promesa de red con límite de tiempo; si tarda demasiado, la da por caída.
function withTimeout_(p, ms){
  return new Promise(function(resolve, reject){
    const t=setTimeout(function(){ reject(new Error('network timeout')); }, ms||NET_TIMEOUT_MS);
    Promise.resolve(p).then(function(v){ clearTimeout(t); resolve(v); },
                            function(e){ clearTimeout(t); reject(e); });
  });
}
// Envuelve una petición real: marca internet ok/caído según el resultado.
async function netCall_(p, ms){
  try{ const v=await withTimeout_(p, ms); markNet_(true); return v; }
  catch(e){ if (isNetErr_(e)) markNet_(false); throw e; }
}
// Cambia el estado de internet real y reacciona (avisa / reintenta subir lo pendiente).
function markNet_(ok){
  const was=_netDown;
  _netDown=!ok;
  if (ok && was){            // volvió el internet real
    _offlineNotified=false;
    if (typeof updateBar_==='function') updateBar_();
    if (typeof flushQueue_==='function') flushQueue_();
  } else if (!ok && !was){   // se acaba de caer el internet real
    if (typeof updateBar_==='function') updateBar_();
  }
}
// Sondea el servidor aunque creamos estar caídos (para detectar el regreso del internet).
async function recheckNet_(){
  if (typeof sb==='undefined' || !sb) return;
  if (typeof navigator!=='undefined' && navigator.onLine===false){ markNet_(false); return; }
  try{ await withTimeout_(sb.from('settings').select('currency_symbol').limit(1), 6000); markNet_(true); }
  catch(e){ markNet_(isNetErr_(e) ? false : true); }  // si el server respondió (otro error), hay internet
}

/* Bandeja de salida (cola de cambios pendientes de subir) */
function qKey_(){ return 'cf_outbox_' + (CURRENT_USER_ID || 'anon'); }
function loadQueue_(){ try{ return JSON.parse(localStorage.getItem(qKey_())||'[]'); }catch(e){ return []; } }
function saveQueue_(q){ try{ localStorage.setItem(qKey_(), JSON.stringify(q)); }catch(e){} }
function enqueue_(item){ const q=loadQueue_(); q.push(item); saveQueue_(q); updateBar_(); }
function enqueueDelete_(cid){
  let q=loadQueue_();
  const teniaAdd = q.some(function(it){ return it.client_id===cid && it.op==='add'; });
  q = q.filter(function(it){ return it.client_id!==cid; });   // quita add/update previos de ese movimiento
  if(!teniaAdd) q.push({op:'delete', client_id:cid});          // solo hace falta borrarlo en el servidor si ya estaba (o iba a estar) allá
  saveQueue_(q); updateBar_();
}

/* ═══════ Sin internet en pendientes, metas, recurrencias y presupuestos ═════
   Esas tablas no tienen columna client_id como los movimientos: su id lo pone
   el servidor. Para poder crearlas sin internet se les da un id local
   provisional ("tmp:xxx") con el que la app trabaja mientras tanto; al subir,
   el id real del servidor sustituye al provisional en el resto de la cola.
   Los presupuestos no necesitan nada de esto: su clave es tipo+categoría.   */
function tmpId_(){ return 'tmp:' + uuid_(); }
function esTmp_(id){ return typeof id==='string' && id.indexOf('tmp:')===0; }

/* Encola una operación de una entidad que no es "movimiento". */
function enqEnt_(ent, op, extra){
  enqueue_(Object.assign({ent:ent, op:op}, extra||{}));
}
/* Borrar: si el alta aún no se ha subido, se cancelan ambas y no se manda nada. */
function enqEntDelete_(ent, id){
  let q=loadQueue_();
  const teniaAlta = q.some(function(it){ return it.ent===ent && it.op==='add' && it.tmp===id; });
  q = q.filter(function(it){ return !(it.ent===ent && (it.tmp===id || it.id===id)); });
  if(!teniaAlta) q.push({ent:ent, op:'delete', id:id});
  saveQueue_(q); updateBar_();
}
/* ¿Debe irse a la cola en vez de fallar? (sin internet, o error de red/sesión) */
function aCola_(e){ return e===undefined ? isOffline_() : isRetriable_(e); }

/* Copia local de tus datos (para abrir la app sin internet) */
function cacheKey_(){ return 'cf_cache_' + (CURRENT_USER_ID || 'anon'); }
function saveSnapshotData_(data){
  try{
    const blob = JSON.stringify({ at:Date.now(), data:data });
    localStorage.setItem(cacheKey_(), blob);
    localStorage.setItem('cf_cache_last', blob);   // respaldo: última copia, sin depender del usuario
  }catch(e){}
}
function loadSnapshot_(){
  // 1) intenta la copia de este usuario; 2) si no, la última copia guardada
  try{
    const raw = localStorage.getItem(cacheKey_());
    if(raw) return JSON.parse(raw).data;
  }catch(e){}
  try{
    const raw2 = localStorage.getItem('cf_cache_last');
    if(raw2) return JSON.parse(raw2).data;
  }catch(e){}
  return null;
}
let _snapT=null;
function snapSoon_(){ clearTimeout(_snapT); _snapT=setTimeout(snapshotState_, 0); }
function snapshotState_(){
  try{
    const S=window.S; if(!S) return;
    saveSnapshotData_({ transactions:S.transactions, categories:S.categories, settings:S.settings,
      pendings:S.pendings, budgets:S.budgets, recurring:S.recurring, goals:S.goals, palettes:S.palettes });
  }catch(e){}
}

/* Construcción de datos de un movimiento para el servidor */
function buildTxPayload_(cid, tx){
  return { client_id:cid, date:tx.date||today_(), type:tx.type, category:tx.category, amount:num_(tx.amount),
    color:tx.color||'#64748B', source:normSource_(tx.source), note:tx.note||'', goal_id:(tx._goalId!=null?String(tx._goalId):null) };
}
async function txUpsert_(cid, tx){
  const { data, error } = await netCall_(sb.from('transactions')
    .upsert(buildTxPayload_(cid, tx), { onConflict:'client_id' }).select().single());
  if (error) throw error; return data;
}
/* Cómo se manda cada entidad al servidor: tabla y cómo se arma la fila. */
const ENT_={
  pending:{ tabla:'pendings', fila:function(p){ return { due_date:p.dueDate||null, kind:p.kind, category:p.category||'',
      amount:num_(p.amount), color:p.color||'#64748B', method:p.method||'',
      status:p.status==='completed'?'completed':'pending', note:p.note||'' }; } },
  goal:{ tabla:'goals', fila:function(g){ return { name:g.name||'Meta', target:num_(g.target),
      saved:num_(g.saved), color:g.color||'#8B5CF6', note:g.note||'' }; } },
  recur:{ tabla:'recurring', fila:function(rc){ return { type:rc.type, category:rc.category||'', amount:num_(rc.amount),
      color:rc.color||'#64748B', source:normSource_(rc.source), day_of_month:rc.day||1,
      note:rc.note||'', active:rc.active!==false }; } }
};

/* Aplica una operación de la cola. `mapa` traduce los ids provisionales a los
   reales que devolvió el servidor durante esta misma subida. */
async function applyOp_(item, mapa){
  mapa = mapa || {};

  // ── Movimientos (formato original de la cola: sin campo `ent`) ──
  if (!item.ent){
    if (item.op==='add'){ await txUpsert_(item.client_id, item.payload); }
    else if (item.op==='update'){
      const { error } = await netCall_(sb.from('transactions').update(buildTxPayload_(item.client_id, item.payload)).eq('client_id', item.client_id));
      if (error) throw error;
    } else if (item.op==='delete'){
      const { error } = await netCall_(sb.from('transactions').delete().eq('client_id', item.client_id));
      if (error) throw error;
    }
    return;
  }

  // ── Presupuestos: clave natural tipo+categoría, sin ids que reconciliar ──
  if (item.ent==='budget'){
    await API.setBudget(item.type, item.category, item.amount);
    return;
  }

  const def=ENT_[item.ent]; if(!def) return;

  if (item.op==='add'){
    const { data, error } = await netCall_(sb.from(def.tabla).insert(def.fila(item.payload)).select().single());
    if (error) throw error;
    if (item.tmp) mapa[item.tmp]=String(data.id);   // a partir de aquí, el id real
    return;
  }

  // update/delete/status/contribute necesitan un id real
  let id=item.id;
  if (esTmp_(id)){
    id = mapa[id];
    if (!id) return;   // su alta se descartó: no hay nada que actualizar
  }

  if (item.op==='update'){
    const { error } = await netCall_(sb.from(def.tabla).update(def.fila(item.payload)).eq('id', id));
    if (error) throw error;
  } else if (item.op==='delete'){
    const { error } = await netCall_(sb.from(def.tabla).delete().eq('id', id));
    if (error) throw error;
  } else if (item.op==='status'){
    const { error } = await netCall_(sb.from('pendings').update({status:item.completed?'completed':'pending'}).eq('id', id));
    if (error) throw error;
  } else if (item.op==='contribute'){
    // Se guarda el CAMBIO, no el total: así no se pisa lo que hayas aportado
    // desde otro dispositivo mientras estabas sin internet.
    const { data:g, error:e1 } = await netCall_(sb.from('goals').select('saved').eq('id', id).single());
    if (e1) throw e1;
    const { error:e2 } = await netCall_(sb.from('goals').update({saved:Math.max(0, num_(g.saved)+num_(item.amount))}).eq('id', id));
    if (e2) throw e2;
  }
}
let _flushing=false;
async function flushQueue_(){
  if (_flushing || isOffline_()) return;
  let q=loadQueue_();
  if (!q.length){ updateBar_(); return; }
  _flushing=true; updateBar_();
  let subioAlgo=false;
  const mapa={};                 // id provisional → id real, durante esta subida
  try{
    while(q.length){
      const item=q[0];
      try{ await applyOp_(item, mapa); subioAlgo=true; }
      catch(e){
        if (isRetriable_(e)) break;                    // sin internet o sesión por refrescar: parar y reintentar luego
        if (window.toast) toast('Un cambio no se pudo subir y se omitió','err');
        console.error('Cambio omitido al sincronizar:', item, e);
      }
      q.shift(); saveQueue_(q);
    }
  } finally {
    _flushing=false; updateBar_();
  }
  // Al terminar de subir: recargar datos frescos del servidor y repintar la pantalla
  if (subioAlgo && !loadQueue_().length && !isOffline_()){
    try{
      const data = await fetchAll_();
      saveSnapshotData_(data);
      if (window.S){
        window.S.transactions = data.transactions;
        window.S.categories   = data.categories;
        window.S.settings     = data.settings;
        window.S.pendings     = data.pendings;
        window.S.budgets      = data.budgets;
        window.S.recurring    = data.recurring;
        window.S.goals        = data.goals;
        window.S.palettes     = data.palettes;
        if (typeof window.renderAll === 'function') window.renderAll();
      }
      if (window.toast) toast('Cambios sincronizados','ok');
    }catch(e){ /* si falla, igual quedó subido; se verá al reiniciar */ }
  }
}

/* Barra de aviso abajo: sin conexión / subiendo cambios */
function ensureBar_(){
  if(document.getElementById('offline-bar')) return;
  // El estilo vive en styles.css (allí están las variables de tema); aquí solo
  // se crea el elemento. Antes se inyectaba CSS con colores fijos.
  const bar=document.createElement('div');
  bar.id='offline-bar';
  bar.setAttribute('role','status');
  bar.setAttribute('aria-live','polite');
  bar.innerHTML='<span class="ob-ico"></span><span class="ob-txt"></span>';
  document.body.appendChild(bar);
}
/* Iconos del aviso: nube tachada (sin conexión) y flechas girando (subiendo) */
const OB_ICO_={
  off:'<svg viewBox="0 0 24 24"><path d="M17.5 19H7a4.5 4.5 0 0 1-1-8.9"/>'
     +'<path d="M8.6 6.4A6 6 0 0 1 18 9.5h.2a4.2 4.2 0 0 1 2.6 7.4"/><path d="M3 3l18 18"/></svg>',
  sync:'<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>'
};
/* Pinta el aviso en un estado u otro sin duplicar código. */
function setBar_(modo, texto){
  const bar=document.getElementById('offline-bar'); if(!bar) return;
  const ico=bar.querySelector('.ob-ico'), txt=bar.querySelector('.ob-txt');
  if(!bar.classList.contains(modo)){          // solo redibuja el icono si cambia
    bar.classList.remove('off','sync');
    bar.classList.add(modo);
    if(ico) ico.innerHTML=OB_ICO_[modo]||'';
  }
  if(txt) txt.textContent=texto;
  bar.classList.add('show');
}
let _barHideT=null;          // temporizador para ocultar el aviso
let _offlineNotified=false;  // evita repetir el aviso durante el mismo corte
const OFFLINE_MS=4000;       // cuánto se ve el aviso de sin conexión

function offlineText_(n){
  return n>0
    ? ('Sin conexión — '+n+' cambio'+(n===1?'':'s')+' se subirá'+(n===1?'':'n')+' al reconectar')
    : 'Sin conexión — mostrando tus últimos datos guardados';
}
/* Muestra el aviso de sin conexión unos segundos y luego lo oculta solo */
function flashOffline_(){
  if(_offlineNotified) return;          // ya se avisó en este corte de internet
  _offlineNotified=true;
  ensureBar_();
  const bar=document.getElementById('offline-bar'); if(!bar) return;
  setBar_('off', offlineText_(loadQueue_().length));
  if(_barHideT)clearTimeout(_barHideT);
  _barHideT=setTimeout(function(){ bar.classList.remove('show'); }, OFFLINE_MS);
}
function updateBar_(){
  ensureBar_();
  const bar=document.getElementById('offline-bar'); if(!bar) return;
  const n=loadQueue_().length;
  if (isOffline_()){
    flashOffline_();
  } else {
    _offlineNotified=false;             // de vuelta en línea: rearmar el aviso
    if(_barHideT){clearTimeout(_barHideT);_barHideT=null;}
    if (n>0){
      setBar_('sync', 'Subiendo '+n+' cambio'+(n===1?'':'s')+'…');
    } else {
      bar.classList.remove('show');
    }
  }
}
function setOfflineBar_(){ flashOffline_(); }
window.addEventListener('online',  function(){ _netDown=false; _offlineNotified=false; updateBar_(); flushQueue_(); });
window.addEventListener('offline', function(){ markNet_(false); });

// Plugin nativo de red (Capacitor): detección instantánea y fiable de "sin red".
// Cuando el teléfono pierde la red, pasamos a offline de inmediato (sin esperar timeouts).
function initNetPlugin_(){
  try{
    var N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Network;
    if(!N) return false;
    N.getStatus().then(function(s){ if(s && s.connected===false) markNet_(false); }).catch(function(){});
    N.addListener('networkStatusChange', function(s){
      if(s && s.connected===false){ markNet_(false); }   // sin red: offline al instante
      else { recheckNet_(); }                             // volvió la red: verifica el servidor y sube pendientes
    });
    return true;
  }catch(e){ return false; }
}
// El puente de Capacitor puede no estar listo al cargar el script: reintenta un par de veces.
if(!initNetPlugin_()){
  var _netTries=0;
  var _netInit=setInterval(function(){ _netTries++; if(initNetPlugin_()||_netTries>20) clearInterval(_netInit); }, 300);
}
// Sondeo periódico: el evento 'online' NO se dispara cuando hay WiFi pero sin internet real,
// así que revisamos nosotros si el servidor responde y, al volver, subimos lo pendiente.
setInterval(function(){
  if (_netDown){ recheckNet_(); }                 // caído: ¿ya volvió el internet?
  else if (loadQueue_().length){ flushQueue_(); }  // en línea con pendientes: súbelos
}, 15000);

/* ═══════════════ Funciones de datos ═══════════════ */
async function fetchAll_(){
  const [tx, cats, set, pend, bud, rec, goals] = await netCall_(Promise.all([
    sb.from('transactions').select('*'),
    sb.from('categories').select('*'),
    sb.from('settings').select('*').maybeSingle(),
    sb.from('pendings').select('*'),
    sb.from('budgets').select('*'),
    sb.from('recurring').select('*'),
    sb.from('goals').select('*')
  ]));
  for (const r of [tx,cats,set,pend,bud,rec,goals]) if (r.error) throw r.error;
  const grouped = { Income:[], Expense:[], Savings:[] };
  (cats.data||[]).forEach(function(c){ if(grouped[c.type]) grouped[c.type].push({name:c.name, color:c.color}); });
  return {
    transactions: (tx.data||[]).map(mapTx_),
    categories: grouped,
    settings: mapSettings_(set.data),
    pendings: (pend.data||[]).map(mapPending_),
    budgets: (bud.data||[]).map(mapBudget_),
    recurring: (rec.data||[]).map(mapRecurring_),
    goals: (goals.data||[]).map(mapGoal_),
    palettes: PALETTE_BY_TYPE
  };
}

/* Vuelca datos frescos del servidor en la app y repinta la pantalla.
   Actualiza los mismos campos que fija init() en app/core.js. */
function applyFreshData_(data){
  if (!window.S || !data) return;
  window.S.transactions = data.transactions;
  window.S.categories   = data.categories;
  window.S.settings     = data.settings;
  window.S.pendings     = data.pendings;
  window.S.budgets      = data.budgets;
  window.S.recurring    = data.recurring;
  window.S.goals        = data.goals;
  window.S.palettes     = data.palettes;
  if (typeof window.renderAll === 'function') window.renderAll();
}

// Cuánto esperamos al servidor antes de pintar la copia local y seguir en segundo
// plano. Evita quedarse 10s+ en blanco cuando hay "WiFi sin internet real" o el
// token está venciéndose (su refresco puede tardar hasta 12s).
const FIRST_PAINT_MS = 3500;

const API = {
  async getInitialData(){
    // Si NO hay internet, ni intentes el servidor: usa la copia local de una vez.
    if (isOffline_()){
      const snapOff = loadSnapshot_();
      if (snapOff){ setOfflineBar_(); return snapOff; }
    }

    // Descarga del servidor; la guardamos como copia local en cuanto llegue.
    const fresh = fetchAll_().then(function(data){ saveSnapshotData_(data); return data; });
    const snap = loadSnapshot_();

    // Con copia local disponible: NO colgamos la pantalla esperando. Si el servidor
    // tarda más de FIRST_PAINT_MS, pintamos la copia local ya y dejamos la descarga
    // corriendo por detrás; cuando llegue, refrescamos la pantalla.
    if (snap){
      const race = await Promise.race([
        fresh.then(function(d){ return { ok:true, data:d }; },
                   function(e){ return { ok:false, err:e }; }),
        new Promise(function(resolve){ setTimeout(function(){ resolve({ timeout:true }); }, FIRST_PAINT_MS); })
      ]);
      if (race && race.ok){                 // el servidor respondió a tiempo
        updateBar_();
        setTimeout(function(){ flushQueue_(); }, 1200);
        return race.data;
      }
      if (race && race.ok === false){       // falló rápido (sin internet real): copia local
        setOfflineBar_();
        return snap;
      }
      // Tardó demasiado: mostramos la copia local ahora y refrescamos al llegar los datos.
      fresh.then(function(data){
        if (loadQueue_().length){ updateBar_(); flushQueue_(); }  // hay cambios locales: subir y repintar
        else { applyFreshData_(data); updateBar_(); }
      }, function(e){
        if (isNetErr_(e)) markNet_(false);   // era WiFi sin internet: marca offline y muestra el aviso
      });
      setOfflineBar_();
      return snap;
    }

    // Sin copia local: no queda más que esperar al servidor.
    try{
      const data = await fresh;
      updateBar_();
      setTimeout(function(){ flushQueue_(); }, 1200);
      return data;
    }catch(e){
      throw e;   // no hay copia y no hay red
    }
  },

  /* ── Movimientos (con soporte sin internet) ── */
  async addTransaction(tx){
    const cid = tx.client_id || uuid_();
    const local = { id:cid, timestamp:new Date().toISOString(), date:tx.date||today_(), type:tx.type,
      category:tx.category, amount:num_(tx.amount), color:tx.color||'#64748B', source:tx.source||'', note:tx.note||'', _goalId:tx._goalId||null };
    if (isOffline_()){ enqueue_({op:'add', client_id:cid, payload:tx}); snapSoon_(); return local; }
    try{
      const saved = await txUpsert_(cid, tx); snapSoon_(); return mapTx_(saved);
    }catch(e){
      if (isRetriable_(e)){ enqueue_({op:'add', client_id:cid, payload:tx}); snapSoon_(); return local; }
      throw e;
    }
  },
  async updateTransaction(id, tx){
    if (isOffline_()){ enqueue_({op:'update', client_id:id, payload:tx}); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('transactions').update(buildTxPayload_(id, tx)).eq('client_id', id));
      if (error) throw error; snapSoon_(); return true;
    }catch(e){
      if (isRetriable_(e)){ enqueue_({op:'update', client_id:id, payload:tx}); snapSoon_(); return true; }
      throw e;
    }
  },
  async deleteTransaction(id){
    if (isOffline_()){ enqueueDelete_(id); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('transactions').delete().eq('client_id', id));
      if (error) throw error; snapSoon_(); return true;
    }catch(e){
      if (isRetriable_(e)){ enqueueDelete_(id); snapSoon_(); return true; }
      throw e;
    }
  },

  /* ── Categorías (requieren conexión) ── */
  async addCategory(type, name, color){
    const { data, error } = await sb.from('categories').insert({type,name,color}).select().single();
    if (error){
      const { data:ex } = await sb.from('categories').select('*').eq('type',type).eq('name',name).maybeSingle();
      if (ex) return { type:ex.type, name:ex.name, color:ex.color };
      throw error;
    }
    return { type:data.type, name:data.name, color:data.color };
  },
  async updateCategory(type, oldName, newName, newColor){
    const u1 = await sb.from('categories').update({name:newName,color:newColor}).eq('type',type).eq('name',oldName);
    if (u1.error) throw u1.error;
    await sb.from('transactions').update({category:newName,color:newColor}).eq('category',oldName);
    return { type, name:newName, color:newColor };
  },
  async deleteCategory(type, name){
    const { error } = await sb.from('categories').delete().eq('type',type).eq('name',name);
    if (error) throw error; return true;
  },

  /* ── Pendientes ── */
  async addPending(p){
    // Objeto con el que la app trabaja mientras el alta no se haya subido
    const local = function(tmp){ return { id:tmp, dueDate:p.dueDate||null, kind:p.kind, category:p.category||'',
      amount:num_(p.amount), color:p.color||'#64748B', method:p.method||'',
      status:p.status==='completed'?'completed':'pending', note:p.note||'' }; };
    if (aCola_()){ const t=tmpId_(); enqEnt_('pending','add',{tmp:t,payload:p}); snapSoon_(); return local(t); }
    try{
      const { data, error } = await netCall_(sb.from('pendings').insert(ENT_.pending.fila(p)).select().single());
      if (error) throw error;
      return mapPending_(data);
    }catch(e){
      if (aCola_(e)){ const t=tmpId_(); enqEnt_('pending','add',{tmp:t,payload:p}); snapSoon_(); return local(t); }
      throw e;
    }
  },
  async updatePending(id, p){
    if (aCola_()){ enqEnt_('pending','update',{id:id,payload:p}); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('pendings').update(ENT_.pending.fila(p)).eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEnt_('pending','update',{id:id,payload:p}); snapSoon_(); return true; }
      throw e;
    }
  },
  async deletePending(id){
    if (aCola_()){ enqEntDelete_('pending',id); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('pendings').delete().eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEntDelete_('pending',id); snapSoon_(); return true; }
      throw e;
    }
  },
  async setPendingStatus(id, completed){
    if (aCola_()){ enqEnt_('pending','status',{id:id,completed:!!completed}); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('pendings').update({status:completed?'completed':'pending'}).eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEnt_('pending','status',{id:id,completed:!!completed}); snapSoon_(); return true; }
      throw e;
    }
  },

  /* ── Presupuestos ── */
  async setBudget(type, category, amount){
    amount = num_(amount);
    // Sin ids que reconciliar: la clave es tipo+categoría, así que basta con
    // reencolar el último valor. Si ya había uno en cola, se reemplaza.
    const encolar = function(){
      let q=loadQueue_();
      q = q.filter(function(it){ return !(it.ent==='budget' && it.type===type && it.category===category); });
      q.push({ent:'budget', op:'set', type:type, category:category, amount:amount});
      saveQueue_(q); updateBar_(); snapSoon_();
      return { type, category, amount, deleted:amount<=0 };
    };
    if (aCola_()) return encolar();
    try{
      if (amount<=0){
        const { error } = await netCall_(sb.from('budgets').delete().eq('type',type).eq('category',category));
        if (error) throw error;
        return { type, category, amount:0, deleted:true };
      }
      const { data:ex, error:e0 } = await netCall_(sb.from('budgets').select('id').eq('type',type).eq('category',category).maybeSingle());
      if (e0) throw e0;
      if (ex){ const { error } = await netCall_(sb.from('budgets').update({monthly_amount:amount}).eq('id',ex.id)); if(error) throw error; }
      else   { const { error } = await netCall_(sb.from('budgets').insert({type,category,monthly_amount:amount})); if(error) throw error; }
      return { type, category, amount };
    }catch(e){
      if (aCola_(e)) return encolar();
      throw e;
    }
  },
  async deleteBudget(type, category){ return API.setBudget(type, category, 0); },

  /* ── Recurrencias ── */
  async addRecurring(rc){
    const local = function(tmp){ return { id:tmp, type:rc.type, category:rc.category||'', amount:num_(rc.amount),
      color:rc.color||'#64748B', source:normSource_(rc.source), day:rc.day||1,
      note:rc.note||'', active:rc.active!==false }; };
    if (aCola_()){ const t=tmpId_(); enqEnt_('recur','add',{tmp:t,payload:rc}); snapSoon_(); return local(t); }
    try{
      const { data, error } = await netCall_(sb.from('recurring').insert(ENT_.recur.fila(rc)).select().single());
      if (error) throw error;
      return mapRecurring_(data);
    }catch(e){
      if (aCola_(e)){ const t=tmpId_(); enqEnt_('recur','add',{tmp:t,payload:rc}); snapSoon_(); return local(t); }
      throw e;
    }
  },
  async updateRecurring(id, rc){
    if (aCola_()){ enqEnt_('recur','update',{id:id,payload:rc}); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('recurring').update(ENT_.recur.fila(rc)).eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEnt_('recur','update',{id:id,payload:rc}); snapSoon_(); return true; }
      throw e;
    }
  },
  async deleteRecurring(id){
    if (aCola_()){ enqEntDelete_('recur',id); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('recurring').delete().eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEntDelete_('recur',id); snapSoon_(); return true; }
      throw e;
    }
  },

  /* ── Metas ── */
  async addGoal(g){
    const local = function(tmp){ return { id:tmp, name:g.name||'Meta', target:num_(g.target),
      saved:num_(g.saved), color:g.color||'#8B5CF6', note:g.note||'' }; };
    if (aCola_()){ const t=tmpId_(); enqEnt_('goal','add',{tmp:t,payload:g}); snapSoon_(); return local(t); }
    try{
      const { data, error } = await netCall_(sb.from('goals').insert(ENT_.goal.fila(g)).select().single());
      if (error) throw error;
      return mapGoal_(data);
    }catch(e){
      if (aCola_(e)){ const t=tmpId_(); enqEnt_('goal','add',{tmp:t,payload:g}); snapSoon_(); return local(t); }
      throw e;
    }
  },
  async updateGoal(id, g){
    if (aCola_()){ enqEnt_('goal','update',{id:id,payload:g}); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('goals').update(ENT_.goal.fila(g)).eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEnt_('goal','update',{id:id,payload:g}); snapSoon_(); return true; }
      throw e;
    }
  },
  async deleteGoal(id){
    if (aCola_()){ enqEntDelete_('goal',id); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('goals').delete().eq('id',id));
      if (error) throw error; return true;
    }catch(e){
      if (aCola_(e)){ enqEntDelete_('goal',id); snapSoon_(); return true; }
      throw e;
    }
  },
  async contributeGoal(id, amount){
    // Sin internet se encola el APORTE (el cambio), no el total resultante: al
    // subirlo se suma sobre lo que haya en el servidor, así no se pierde un
    // aporte hecho desde otro dispositivo mientras no había red.
    const localSuma = function(){
      const g=(window.S&&window.S.goals||[]).find(function(x){ return String(x.id)===String(id); });
      const nuevo=Math.max(0, num_(g?g.saved:0)+num_(amount));
      enqEnt_('goal','contribute',{id:id, amount:num_(amount)}); snapSoon_();
      return { id:String(id), saved:nuevo };
    };
    if (aCola_()) return localSuma();
    try{
      const { data:g, error:e1 } = await netCall_(sb.from('goals').select('saved').eq('id',id).single());
      if (e1) throw e1;
      const nuevo = Math.max(0, num_(g.saved)+num_(amount));
      const { error:e2 } = await netCall_(sb.from('goals').update({saved:nuevo}).eq('id',id));
      if (e2) throw e2;
      return { id:String(id), saved:nuevo };
    }catch(e){
      if (aCola_(e)) return localSuma();
      throw e;
    }
  },

  /* ── Ajustes ── */
  async saveAppSettings(currencySymbol, decimals, locale){
    const payload = { currency_symbol:limpiaSimbolo_(currencySymbol), decimals:parseInt(decimals,10)||0, locale:locale||'es-CO' };
    const { data, error } = await sb.from('settings').update(payload).eq('user_id',CURRENT_USER_ID).select().single();
    if (error) throw error;
    return mapSettings_(data);
  },
  async saveNotifySettings(email, enabled){
    const payload = { notify_email:email||'', notify_enabled:!!enabled };
    const { error } = await sb.from('settings').update(payload).eq('user_id',CURRENT_USER_ID);
    if (error) throw error;
    return { notifyEmail:email||'', notifyEnabled:!!enabled };
  },
  async probarNotificacion(){
    throw new Error('Las notificaciones por correo están desactivadas por ahora.');
  },

  /* ═══════════════ EXPORTACIÓN (cliente) ═══════════════ */
  async exportExcel(scope){
    await loadLib_('vendor/xlsx-js-style.min.js');
    if (!window.XLSX) throw new Error('Falta la librería de Excel. Recarga la app.');
    const list = exportFilter_(scope);
    const sum = summary_(list);
    const enc = [
      ['Control Finanzas MS — Movimientos'],
      [scopeLabel_(scope) + '  ·  Generado: ' + nowStamp_()],
      [],
      ['Ingresos', sum.ingresos], ['Gastos', sum.gastos], ['Ahorro', sum.ahorro], ['Disponible', sum.disponible],
      [],
      ['Fecha', 'Tipo', 'Categoría', 'Monto', 'Nota']
    ];
    const cuerpo = list.map(function(t){ return filaSegura_([ fmtFechaCorta_(t.date), TIPO_ES[t.type]||t.type, t.category, t.amount, t.note||'' ]); });
    const ws = XLSX.utils.aoa_to_sheet(enc.concat(cuerpo));
    ws['!cols'] = [{wch:12},{wch:10},{wch:24},{wch:14},{wch:34}];
    // Colores: ingresos=verde, gastos=rojo, ahorro=azul, disponible=morado
    const COL = { verde:'16A34A', rojo:'DC2626', azul:'2563EB', morado:'9333EA' };
    function cellStyle_(addr, style){ if(ws[addr]) ws[addr].s = style; }
    [['4',COL.verde],['5',COL.rojo],['6',COL.azul],['7',COL.morado]].forEach(function(p){
      ['A','B'].forEach(function(c){ cellStyle_(c+p[0], { font:{ bold:true, color:{ rgb:p[1] } } }); });
    });
    ['A','B','C','D','E'].forEach(function(c){ cellStyle_(c+'9', { font:{ bold:true } }); }); // encabezados
    list.forEach(function(t,i){
      const r = 10 + i;
      const rgb = t.type==='Income'?COL.verde:(t.type==='Expense'?COL.rojo:COL.azul);
      cellStyle_('B'+r, { font:{ color:{ rgb:rgb } } });             // Tipo
      cellStyle_('D'+r, { font:{ bold:true, color:{ rgb:rgb } } });  // Monto
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

    const pl = exportPendFilter_(scope);
    const pEnc = [ ['Control Finanzas MS — Ingresos / Pagos pendientes'], [scopeLabel_(scope)+'  ·  Generado: '+nowStamp_()], [], ['Fecha acordada','Tipo','Categoría','Monto','Método','Estado'] ];
    const pCuerpo = pl.map(function(p){ return filaSegura_([ p.dueDate?fmtFechaCorta_(p.dueDate):'', p.kind==='Income'?'Ingreso':'Pago', p.category, p.amount, p.method||'', estadoPend_(p) ]); });
    const pws = XLSX.utils.aoa_to_sheet(pEnc.concat(pCuerpo));
    pws['!cols'] = [{wch:14},{wch:10},{wch:24},{wch:14},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb, pws, 'Pendientes');

    const b64 = XLSX.write(wb, { type:'base64', bookType:'xlsx' });
    return { filename:'Control_Finanzas_MS_'+fileStamp_()+'.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b64:b64 };
  },

  async exportPdf(scope){
    await loadLib_('vendor/jspdf.umd.min.js');
    await loadLib_('vendor/jspdf.plugin.autotable.min.js');
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Falta la librería de PDF. Recarga la app.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const list = exportFilter_(scope), sum = summary_(list);
    let titleX = 40;
    const logo = await loadImageDataUrl_('logo.png');
    if (logo){ try{ doc.addImage(logo, 'PNG', 40, 26, 24, 24); titleX = 72; }catch(e){} }
    doc.setFontSize(16); doc.setTextColor(40,40,40); doc.text('Control Finanzas MS', titleX, 44);
    doc.setFontSize(10); doc.setTextColor(120,120,120); doc.text('Reporte de movimientos · '+scopeLabel_(scope)+' · '+nowStamp_(), 40, 64);
    doc.setFontSize(11);
    // Colores: ingresos=verde, gastos=rojo, ahorro=azul, disponible=morado
    doc.setTextColor(22,163,74);  doc.text('Ingresos: '+money_(sum.ingresos), 40, 86);
    doc.setTextColor(220,38,38);  doc.text('Gastos: '+money_(sum.gastos), 200, 86);
    doc.setTextColor(37,99,235);  doc.text('Ahorro: '+money_(sum.ahorro), 340, 86);
    doc.setTextColor(147,51,234); doc.text('Disponible: '+money_(sum.disponible), 460, 86);
    doc.setTextColor(20,20,20);
    doc.autoTable({
      startY: 100,
      head: [['Fecha','Tipo','Categoría','Monto','Nota']],
      body: list.map(function(t){ return [ fmtFechaCorta_(t.date), TIPO_ES[t.type]||t.type, t.category, money_(t.amount), t.note||'' ]; }),
      styles:{ fontSize:8, cellPadding:4 }, headStyles:{ fillColor:[15,23,42], textColor:255 },
      alternateRowStyles:{ fillColor:[248,250,252] }, columnStyles:{ 3:{ halign:'right' } },
      didParseCell:function(data){
        if(data.section!=='body') return;
        const t=list[data.row.index]; if(!t) return;
        const c=t.type==='Income'?[22,163,74]:(t.type==='Expense'?[220,38,38]:[37,99,235]);
        if(data.column.index===1 || data.column.index===3){ data.cell.styles.textColor=c; data.cell.styles.fontStyle='bold'; }
      }
    });
    const pl = exportPendFilter_(scope);
    if (pl.length){
      doc.autoTable({
        startY: (doc.lastAutoTable?doc.lastAutoTable.finalY:120)+24,
        head: [['Fecha acordada','Tipo','Categoría','Monto','Método','Estado']],
        body: pl.map(function(p){ return [ p.dueDate?fmtFechaCorta_(p.dueDate):'—', p.kind==='Income'?'Ingreso':'Pago', p.category, money_(p.amount), p.method||'', estadoPend_(p) ]; }),
        styles:{ fontSize:8, cellPadding:4 }, headStyles:{ fillColor:[245,158,11], textColor:255 }, columnStyles:{ 3:{ halign:'right' } }
      });
    }
    const dataUri = doc.output('datauristring');
    const b64 = dataUri.substring(dataUri.indexOf(',')+1);
    return { filename:'Control_Finanzas_MS_'+fileStamp_()+'.pdf', mimeType:'application/pdf', b64:b64 };
  }
};

/* ═══════════════ Helpers de exportación ═══════════════ */
// Las librerías de Excel/PDF (~830 KB) solo se descargan y parsean la primera vez que se exporta
const libs_ = {};
function loadLib_(src){
  if (!libs_[src]) libs_[src] = new Promise(function(resolve, reject){
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = function(){ delete libs_[src]; reject(new Error('No se pudo cargar '+src+'. Recarga la app.')); };
    document.head.appendChild(s);
  });
  return libs_[src];
}
/* Carga una imagen del propio paquete (p.ej. logo.png) como dataURL para incrustarla en el PDF */
function loadImageDataUrl_(url){
  return new Promise(function(resolve){
    try{
      fetch(url).then(function(r){ return r.ok?r.blob():null; }).then(function(b){
        if(!b){ resolve(null); return; }
        const fr=new FileReader();
        fr.onload=function(){ resolve(fr.result); };
        fr.onerror=function(){ resolve(null); };
        fr.readAsDataURL(b);
      }).catch(function(){ resolve(null); });
    }catch(e){ resolve(null); }
  });
}
function pad2_(n){ return ('0'+n).slice(-2); }
function fileStamp_(){ const d=new Date(); return d.getFullYear()+pad2_(d.getMonth()+1)+pad2_(d.getDate())+'-'+pad2_(d.getHours())+pad2_(d.getMinutes()); }
function nowStamp_(){ const d=new Date(); return pad2_(d.getDate())+'/'+pad2_(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad2_(d.getHours())+':'+pad2_(d.getMinutes()); }
function fmtFechaCorta_(ymd){ const p=String(ymd).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function scopeLabel_(scope){ if(!scope||scope.mode==='all') return 'Toda la base de datos'; return (scope.label?scope.label+'  ·  ':'')+fmtFechaCorta_(scope.start)+' a '+fmtFechaCorta_(scope.end); }
function money_(n){ n=Math.round(n||0); const st=(window.S&&window.S.settings)||{}; const sym=st.currencySymbol||'$'; const loc=st.locale||'es-CO'; return (n<0?'-':'')+sym+' '+Math.abs(n).toLocaleString(loc); }
function estadoPend_(p){ if(p.status==='completed') return 'Completado'; if(p.dueDate && p.dueDate<today_()) return 'Vencido'; return 'Pendiente'; }
function exportFilter_(scope){
  let all = ((window.S&&window.S.transactions)?window.S.transactions:[]).slice();
  if (scope && scope.mode==='range' && scope.start && scope.end) all = all.filter(function(t){ return t.date>=scope.start && t.date<=scope.end; });
  all.sort(function(a,b){ return a.date===b.date ? ((a.timestamp||'')<(b.timestamp||'')?-1:1) : (a.date<b.date?-1:1); });
  return all;
}
function exportPendFilter_(scope){
  let all = ((window.S&&window.S.pendings)?window.S.pendings:[]).slice();
  if (scope && scope.mode==='range' && scope.start && scope.end) all = all.filter(function(p){ return p.dueDate && p.dueDate>=scope.start && p.dueDate<=scope.end; });
  all.sort(function(a,b){ return (a.dueDate||'')<(b.dueDate||'')?-1:1; });
  return all;
}
function summary_(list){
  function s(t){ return list.filter(function(x){return x.type===t;}).reduce(function(a,x){return a+x.amount;},0); }
  const ing=s('Income'), gas=s('Expense'), aho=s('Savings');
  return { ingresos:ing, gastos:gas, ahorro:aho, disponible:ing-gas-aho, n:list.length };
}

/* ═══════════════ gs(): el puente que app/*.js usa ═══════════════ */
window.isOffline = isOffline_;

window.gs = function(fn){
  const args = [].slice.call(arguments, 1);
  if (typeof API[fn] !== 'function') return Promise.reject(new Error('Función no disponible: '+fn));
  return API[fn].apply(null, args);
};

/* ═══════════════ Descarga del archivo exportado ═══════════════ */
function getDownloadsPlugin_(){
  try{
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Downloads) return window.Capacitor.Plugins.Downloads;
    if (window.Capacitor && typeof window.Capacitor.registerPlugin==='function') return window.Capacitor.registerPlugin('Downloads');
  }catch(e){}
  return null;
}
window.downloadB64 = async function(res){
  // Exportar abre el menú Compartir de Android (la app pasa a segundo plano):
  // avisamos al bloqueo para que no pida el PIN al volver. Ver settings.js.
  if (window.LockSkip) window.LockSkip();
  if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()){
    // 1) Guardar directo en la carpeta Descargas del celular
    let savedToDownloads = false;
    try{
      const D = getDownloadsPlugin_();
      if (D && D.saveBase64){
        await D.saveBase64({ filename:res.filename, data:res.b64, mimeType:res.mimeType });
        savedToDownloads = true;
        if(window.toast) toast('Guardado en Descargas: '+res.filename,'ok');
      }
    }catch(e){ /* si falla, queda el compartir como respaldo */ }
    // 2) Abrir el menú Compartir de Android automáticamente
    try{
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem && window.Capacitor.Plugins.Share){
        const { Filesystem, Share } = window.Capacitor.Plugins;
        const w = await Filesystem.writeFile({ path: res.filename, data: res.b64, directory: 'CACHE' });
        await Share.share({ title: res.filename, url: w.uri });
        return;
      }
    }catch(e){ /* el usuario pudo cancelar el compartir; si ya se guardó, está bien */ }
    if (savedToDownloads) return;   // se guardó en Descargas aunque no se pudiera compartir
  }
  try{
    const bin=atob(res.b64), len=bin.length, bytes=new Uint8Array(len);
    for(let i=0;i<len;i++)bytes[i]=bin.charCodeAt(i);
    const blob=new Blob([bytes],{type:res.mimeType}), url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=res.filename;
    document.body.appendChild(a);a.click();
    setTimeout(function(){URL.revokeObjectURL(url);a.remove();},1500);
  }catch(e){ if(window.toast) toast('Descarga bloqueada por el navegador','err'); }
};

/* ═══════════════ LOGIN ═══════════════ */
function injectLogin_(){
  const css = document.createElement('style');
  css.textContent = `
  #login-ov{position:fixed;inset:0;z-index:500;display:none;align-items:center;justify-content:center;background:var(--bg,#F7F7F5)}
  #login-ov.show{display:flex}
  #login-card{width:min(380px,92vw);background:var(--surface,#fff);
    border:1px solid var(--line,#E7E7E4);border-radius:var(--r-l,20px);padding:28px;
    box-shadow:var(--modal-shadow,0 16px 48px rgba(0,0,0,.12));font-family:var(--sans,'Inter',system-ui,sans-serif);color:var(--ink,#0A0A0A)}
  #login-card h1{font-size:22px;font-weight:700;letter-spacing:-.02em;margin:0 0 4px}
  #login-card p.sub{color:var(--ink-2,#5C5C5C);font-size:13px;margin:0 0 20px}
  #login-card label{display:block;font-size:11px;font-weight:600;color:var(--ink-2,#5C5C5C);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 7px}
  #login-card input{width:100%;background:var(--surface-2,#F1F1EF);border:1px solid var(--line,#E7E7E4);color:var(--ink,#0A0A0A);
    border-radius:var(--r-s,10px);padding:12px 14px;font-size:16px;font-family:inherit}
  #login-card input:focus{outline:0;border-color:var(--ink,#0A0A0A)}
  #login-card .lbtn{width:100%;border:0;border-radius:var(--r-m,14px);padding:14px;margin-top:18px;cursor:pointer;
    font-family:inherit;font-weight:600;font-size:15px;background:var(--accent,#0A0A0A);color:var(--on-accent,#fff);transition:transform .12s ease,opacity .2s ease}
  #login-card .lbtn:active{transform:scale(.97);opacity:.9}
  #login-card .lbtn.ghost{background:transparent;border:1px solid var(--line,#E7E7E4);color:var(--ink,#0A0A0A);margin-top:10px}
  #login-msg{font-size:13px;color:var(--neg,#C93B3B);margin-top:12px;min-height:18px;text-align:center}
  #login-card .lswitch{width:100%;border:0;background:transparent;color:var(--ink-2,#5C5C5C);font-family:inherit;font-size:13px;margin-top:14px;cursor:pointer;padding:8px}
  #login-card .lswitch b{color:var(--ink,#0A0A0A)}
  #login-card[data-mode="in"] #login-up{display:none}
  /* Animaciones (solo transform/opacity): la tarjeta entra al mostrarse, el contenido
     entra escalonado al cambiar de vista y los mensajes aparecen con un leve deslizamiento */
  #login-ov.show #login-card{animation:lcIn .5s cubic-bezier(.16,1,.3,1) both}
  @keyframes lcIn{from{opacity:0;transform:translateY(16px) scale(.98)}}
  #login-card.swap>*{animation:lgIn .4s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--i,0) * 35ms)}
  @keyframes lgIn{from{opacity:0;transform:translateY(8px)}}
  #login-msg.pop{animation:msgIn .32s cubic-bezier(.16,1,.3,1) both}
  #login-msg.pop.err{animation:msgIn .32s cubic-bezier(.16,1,.3,1) both,msgShake .36s ease .05s}
  @keyframes msgIn{from{opacity:0;transform:translateY(-5px)}}
  @keyframes msgShake{20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(2px)}}
  @media (prefers-reduced-motion:reduce){#login-card,#login-card *{animation:none!important}}
  #login-card .lforgot{display:block;margin:8px 0 0 auto;border:0;background:transparent;padding:6px 0;cursor:pointer;
    font-family:inherit;font-size:12.5px;font-weight:500;color:var(--ink-2,#5C5C5C)}
  #login-card .lforgot:hover{color:var(--ink,#0A0A0A)}
  #login-send,#login-reset,#login-card .lreset{display:none}
  #login-card[data-mode="up"] .lforgot{display:none}
  #login-card[data-mode="forgot"] :is(.lpass,.lforgot,#login-in,#login-up){display:none}
  #login-card[data-mode="forgot"] #login-send{display:block}
  #login-card[data-mode="reset"] :is(.lmail,.lforgot,#login-in,#login-up,#login-switch){display:none}
  #login-card[data-mode="reset"] .lreset{display:block}
  #login-card[data-mode="reset"] #login-reset{display:block}
  #login-card[data-mode="up"] #login-in{display:none}
  #signup-ov{position:fixed;inset:0;z-index:600;display:none;align-items:center;justify-content:center;padding:24px;
    background:var(--scrim,rgba(10,10,10,.35))}
  #signup-ov.show{display:flex}
  #signup-card{width:min(400px,92vw);background:var(--surface,#fff);
    border:1px solid var(--line,#E7E7E4);border-radius:var(--r-l,20px);padding:30px 26px;text-align:center;
    box-shadow:var(--modal-shadow,0 16px 48px rgba(0,0,0,.12));font-family:var(--sans,'Inter',system-ui,sans-serif);color:var(--ink,#0A0A0A);
    animation:supop .35s cubic-bezier(.34,1.3,.64,1) both}
  @keyframes supop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
  #signup-card .mail{width:58px;height:58px;border-radius:16px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;
    background:var(--surface-2,#F1F1EF);border:1px solid var(--line,#E7E7E4)}
  #signup-card .mail svg{width:30px;height:30px;stroke:var(--ink,#0A0A0A);stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
  #signup-card h2{font-size:21px;font-weight:700;letter-spacing:-.02em;margin:0 0 10px}
  #signup-card p{color:var(--ink-2,#5C5C5C);font-size:14px;line-height:1.6;margin:0 auto 6px;max-width:310px}
  #signup-card p b{color:var(--ink,#0A0A0A)}
  #signup-card .lbtn{width:100%;border:0;border-radius:var(--r-m,14px);padding:14px;margin-top:22px;cursor:pointer;
    font-family:inherit;font-weight:600;font-size:15px;background:var(--accent,#0A0A0A);color:var(--on-accent,#fff)}`;
  document.head.appendChild(css);

  const ov = document.createElement('div');
  ov.id = 'login-ov';
  ov.innerHTML = `
    <div id="login-card" data-mode="in">
      <h1 id="login-title">Bienvenido</h1>
      <p class="sub" id="login-sub">Inicia sesión para continuar con tus finanzas.</p>
      <label for="login-email" class="lmail">Correo electrónico</label>
      <input type="email" id="login-email" class="lmail" placeholder="tucorreo@ejemplo.com" autocomplete="email">
      <label for="login-pass" class="lpass" id="login-pass-lbl">Contraseña</label>
      <input type="password" id="login-pass" class="lpass" placeholder="••••••••" autocomplete="current-password">
      <label for="login-pass2" class="lreset">Repite la contraseña</label>
      <input type="password" id="login-pass2" class="lreset" placeholder="••••••••" autocomplete="new-password">
      <button class="lforgot" id="login-forgot" type="button">¿Olvidaste tu contraseña?</button>
      <button class="lbtn" id="login-in">Entrar</button>
      <button class="lbtn" id="login-up">Crear cuenta</button>
      <button class="lbtn" id="login-send">Enviar enlace</button>
      <button class="lbtn" id="login-reset">Guardar nueva contraseña</button>
      <div id="login-msg"></div>
      <button class="lswitch" id="login-switch" type="button">¿No tienes cuenta? <b>Crear cuenta</b></button>
    </div>`;
  document.body.appendChild(ov);

  // Vistas: iniciar sesión · crear cuenta · olvidé mi contraseña · poner contraseña nueva (desde el correo)
  const MODOS_ = {
    in:     ['Bienvenido', 'Inicia sesión para continuar con tus finanzas.', '¿No tienes cuenta? <b>Crear cuenta</b>'],
    up:     ['Crear cuenta', 'Crea tu cuenta con tu correo y una contraseña de al menos 6 caracteres.', '¿Ya tienes cuenta? <b>Inicia sesión</b>'],
    forgot: ['Recuperar contraseña', 'Escribe tu correo y te enviaremos un enlace para crear una contraseña nueva.', '<b>Volver a iniciar sesión</b>'],
    reset:  ['Nueva contraseña', 'Escribe tu nueva contraseña (mínimo 6 caracteres).', '']
  };
  function setLoginMode_(m){
    const mode = m===true ? 'up' : m===false ? 'in' : m;
    const t = MODOS_[mode];
    document.getElementById('login-card').setAttribute('data-mode',mode);
    document.getElementById('login-title').textContent=t[0];
    document.getElementById('login-sub').textContent=t[1];
    document.getElementById('login-switch').innerHTML=t[2];
    document.getElementById('login-pass-lbl').textContent = mode==='reset' ? 'Nueva contraseña' : 'Contraseña';
    document.getElementById('login-pass').setAttribute('autocomplete', mode==='in' ? 'current-password' : 'new-password');
    // Reinicia la entrada escalonada solo de lo que queda visible en la nueva vista
    const card=document.getElementById('login-card');
    card.classList.remove('swap'); void card.offsetWidth;
    let i=0; Array.prototype.forEach.call(card.children,function(el){ if(el.offsetParent!==null) el.style.setProperty('--i',i++); });
    card.classList.add('swap');
  }
  window.setLoginMode_ = setLoginMode_;
  document.getElementById('login-switch').onclick = function(){
    setLoginMode_(document.getElementById('login-card').getAttribute('data-mode')==='in' ? 'up' : 'in');
    document.getElementById('login-msg').textContent='';
  };
  document.getElementById('login-forgot').onclick = function(){
    setLoginMode_('forgot');
    document.getElementById('login-msg').textContent='';
    document.getElementById('login-email').focus();
  };

  // Recuadro de "confirma tu correo" tras crear la cuenta
  const sup = document.createElement('div');
  sup.id = 'signup-ov';
  sup.innerHTML = `
    <div id="signup-card">
      <div class="mail"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg></div>
      <h2>¡Casi listo!</h2>
      <p>Te enviamos un correo de confirmación a <b id="signup-email">tu correo</b>.</p>
      <p>Ábrelo y confirma tu dirección (revisa también la carpeta de spam). Después vuelve aquí e <b>inicia sesión</b>.</p>
      <button class="lbtn" id="signup-ok">Entendido</button>
    </div>`;
  document.body.appendChild(sup);
  function closeSignup_(){
    sup.classList.remove('show');
    const p=document.getElementById('login-pass'); if(p) p.value='';
    setLoginMode_(false);   // vuelve al cuadro de "Iniciar sesión"
    document.getElementById('login-msg').textContent='Confirma tu correo y luego pulsa "Entrar".';
    document.getElementById('login-msg').style.color='var(--pos,#0E8A4A)';
  }
  document.getElementById('signup-ok').onclick = closeSignup_;
  sup.addEventListener('click', function(ev){ if(ev.target.id==='signup-ov') closeSignup_(); });

  const msg = ()=>document.getElementById('login-msg');
  // Cada mensaje nuevo entra animado; los de error además tiemblan un poco
  new MutationObserver(function(){
    const m=msg(); if(!m.textContent) return;
    m.classList.remove('pop','err'); void m.offsetWidth;
    m.classList.add('pop'); if(/neg/.test(m.style.color)) m.classList.add('err');
  }).observe(msg(), { childList:true, characterData:true, subtree:true });
  const email = ()=>document.getElementById('login-email').value.trim();
  const pass  = ()=>document.getElementById('login-pass').value;

  document.getElementById('login-in').onclick = async ()=>{
    msg().style.color='var(--neg,#C93B3B)'; msg().textContent='Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email:email(), password:pass() });
    if (error) msg().textContent = traducirError_(error.message);
    else { if (window.playIntro) window.playIntro(); startApp_(); }
  };
  // Olvidé mi contraseña: Supabase manda un correo con un enlace que vuelve a la app en modo "reset"
  document.getElementById('login-send').onclick = async function(){
    msg().style.color='var(--neg,#C93B3B)';
    if (!/^\S+@\S+\.\S+$/.test(email())){ msg().textContent='Escribe el correo de tu cuenta.'; return; }
    if (isOffline_()){ msg().textContent='Sin conexión: conéctate para recibir el correo.'; return; }
    this.disabled=true; msg().textContent='Enviando…';
    const { error } = await sb.auth.resetPasswordForEmail(email(), { redirectTo: authRedirectUrl_() });
    this.disabled=false;
    if (error){ msg().textContent = traducirError_(error.message); return; }
    msg().style.color='var(--pos,#0E8A4A)';
    // Mismo mensaje exista o no la cuenta: no se revela qué correos están registrados
    msg().textContent='Si ese correo tiene cuenta, te llegará un enlace para cambiar la contraseña. Revisa también spam.';
  };
  // Contraseña nueva (llegando desde el enlace del correo, ya con sesión de recuperación)
  document.getElementById('login-reset').onclick = async function(){
    msg().style.color='var(--neg,#C93B3B)';
    const p1=pass(), p2=document.getElementById('login-pass2').value;
    if (p1.length < 6){ msg().textContent='La contraseña debe tener al menos 6 caracteres.'; return; }
    if (p1 !== p2){ msg().textContent='Las contraseñas no coinciden.'; return; }
    this.disabled=true; msg().textContent='Guardando…';
    const { error } = await sb.auth.updateUser({ password:p1 });
    this.disabled=false;
    if (error){ msg().textContent = traducirError_(error.message); return; }
    recoveryPending_ = false;
    try{ history.replaceState(null, '', location.pathname); }catch(e){}
    document.getElementById('login-pass').value=''; document.getElementById('login-pass2').value='';
    msg().textContent='';
    if (window.Haptic && Haptic.success) Haptic.success();
    if (appStarted_){ document.getElementById('login-ov').classList.remove('show'); if (window.toast) toast('Contraseña actualizada','ok'); }
    else { if (window.playIntro) window.playIntro(); startApp_(); }
  };

  document.getElementById('login-up').onclick = async ()=>{
    msg().style.color='var(--neg,#C93B3B)';
    if (!email() || !pass()){
      msg().textContent = 'Escribe tu correo y una contraseña para crear tu cuenta.';
      return;
    }
    if (pass().length < 6){
      msg().textContent = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    msg().textContent='Creando cuenta…';
    const { data, error } = await sb.auth.signUp({ email:email(), password:pass(),
      options:{ emailRedirectTo:'https://svnchezzz.github.io/finanzas-app/' } });
    if (error) { msg().textContent = traducirError_(error.message); return; }
    if (data.session) startApp_();
    else {
      document.getElementById('signup-email').textContent = email() || 'tu correo';
      msg().textContent = '';
      sup.classList.add('show');
    }
  };
}
function traducirError_(m){
  if (/Invalid login/i.test(m)) return 'Correo o contraseña incorrectos.';
  if (/already registered/i.test(m)) return 'Ese correo ya tiene cuenta. Pulsa "Entrar".';
  if (/at least 6/i.test(m)) return 'La contraseña debe tener al menos 6 caracteres.';
  if (/rate limit|only request this after|too many/i.test(m)) return 'Espera un momento antes de pedir otro correo.';
  if (/different from the old|same.*password/i.test(m)) return 'La nueva contraseña debe ser distinta a la anterior.';
  if (/session.*missing|expired|invalid.*(token|flow)/i.test(m)) return 'El enlace venció o ya se usó. Pide uno nuevo.';
  if (/Email not confirmed/i.test(m)) return 'Confirma tu correo antes de entrar (revisa tu bandeja y spam).';
  return m;
}
function showLogin_(){ document.getElementById('login-ov').classList.add('show'); }
function showResetPassword_(){
  window.setLoginMode_('reset');
  const m=document.getElementById('login-msg'); if (m) m.textContent='';
  showLogin_();
  setTimeout(function(){ const p=document.getElementById('login-pass'); if (p) p.focus({ preventScroll:true }); }, 50);
}

async function startApp_(){
  appStarted_ = true;
  // Obtener el usuario SIN llamar a internet (lee la sesión guardada en el teléfono)
  let uid = null;
  try{
    const { data:{ session } } = await sb.auth.getSession();
    uid = (session && session.user) ? session.user.id : null;
  }catch(e){ uid = null; }
  CURRENT_USER_ID = uid;

  const ov = document.getElementById('login-ov'); if (ov) ov.classList.remove('show');
  addLogoutButton_();
  if (typeof window.init === 'function') window.init();
  updateBar_();
  setTimeout(function(){ if(!isOffline_()) flushQueue_(); }, 1500);
}

function addLogoutButton_(){
  if (document.getElementById('logout-btn')) return;
  const panel = document.querySelector('.ovf-panel');
  const target = panel || document.querySelector('.appbar-actions');
  if (!target) return;
  const b = document.createElement('button');
  b.id='logout-btn'; b.className='btn-ghost'; b.title='Salir'; b.setAttribute('aria-label','Salir');
  b.innerHTML='<span class="bi"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg></span><span class="btn-label">Salir</span>';
  b.onclick = window.logout;
  target.appendChild(b);
}

window.logout = async function(){
  await sb.auth.signOut();
  location.reload();
};

/* ═══════════════ Arranque ═══════════════ */
document.addEventListener('DOMContentLoaded', async ()=>{
  injectLogin_();

  // ¿Hay una sesión guardada localmente? (Supabase la guarda en el teléfono)
  let haySesionLocal = false;
  try{
    for (let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.indexOf('-auth-token') >= 0 && localStorage.getItem(k)){ haySesionLocal = true; break; }
    }
  }catch(e){}

  // Pide la sesión a Supabase, pero sin colgarse: máximo 4 segundos de espera.
  let session = null;
  try{
    const conTiempoLimite = Promise.race([
      sb.auth.getSession().then(function(r){ return r.data.session; }),
      new Promise(function(resolve){ setTimeout(function(){ resolve('TIMEOUT'); }, 4000); })
    ]);
    const r = await conTiempoLimite;
    if (r !== 'TIMEOUT') session = r;
    else session = haySesionLocal ? 'LOCAL' : null;
  }catch(e){
    session = haySesionLocal ? 'LOCAL' : null;
  }

  // Llegó desde el enlace del correo: primero se pone la contraseña nueva, luego entra
  if (recoveryPending_ && session && session !== 'LOCAL'){ showResetPassword_(); return; }
  if (LINK_ERROR_) try{ history.replaceState(null, '', location.pathname); }catch(e){}
  if (LINK_ERROR_ && !session){
    showLogin_();
    const m=document.getElementById('login-msg');
    m.style.color='var(--neg,#C93B3B)'; m.textContent='El enlace venció o ya se usó. Pide uno nuevo con "¿Olvidaste tu contraseña?".';
    return;
  }
  if (session) startApp_();
  else showLogin_();
});

/* ═══════════════════════════════════════════════════════════════════════
   EXTRAS: refrescar tirando hacia abajo + actualizar solo al reconectar
   (Pegar este bloque AL FINAL de db.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Recargar los datos del servidor y repintar la pantalla.
   Devuelve cómo terminó: 'ok' | 'offline' | 'queued' | 'error'. Quien llame
   puede así decir la verdad al usuario en vez de dar por hecho que salió bien
   (antes se tragaba todo y siempre parecía exitoso). */
async function refreshData_(){
  if (isOffline_()){ if(window.toast) toast('Sin conexión','info'); return 'offline'; }
  // si hay cambios sin subir, súbelos (flushQueue_ ya recarga y repinta al terminar)
  if (loadQueue_().length){ await flushQueue_(); return 'queued'; }
  try{
    const data = await fetchAll_();
    saveSnapshotData_(data);
    if (window.S){
      window.S.transactions = data.transactions;
      window.S.categories   = data.categories;
      window.S.settings     = data.settings;
      window.S.pendings     = data.pendings;
      window.S.budgets      = data.budgets;
      window.S.recurring    = data.recurring;
      window.S.goals        = data.goals;
      window.S.palettes     = data.palettes;
      if (typeof window.renderAll === 'function') window.renderAll();
    }
    if (window.toast) toast('Actualizado','ok');
    return 'ok';
  }catch(e){ if (window.toast) toast('No se pudo actualizar','err'); return 'error'; }
}
window.refreshData = refreshData_;

/* Pull-to-refresh (gesto de tirar hacia abajo) eliminado por completo. */

/* Actualizar solo cuando vuelve el internet mientras usas la app */
(function(){
  try{
    const N = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Network;
    if (N && N.addListener){
      N.addListener('networkStatusChange', function(st){
        updateBar_();
        if (st && st.connected){ setTimeout(function(){ flushQueue_(); }, 600); }
      });
    }
  }catch(e){}
})();