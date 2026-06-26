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

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: timeoutFetch_ } });

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
  amount:num_(r.amount), color:r.color||'#64748B', source:r.source||'', note:r.note||'' }; }

function mapPending_(r){ return {
  id:String(r.id), dueDate:r.due_date||'', kind:r.kind, category:r.category||'', amount:num_(r.amount),
  color:r.color||'#64748B', method:r.method||'', status:r.status, note:r.note||'' }; }

function mapBudget_(r){ return { type:r.type, category:r.category, amount:num_(r.monthly_amount) }; }

function mapRecurring_(r){ return {
  id:String(r.id), type:r.type, category:r.category||'', amount:num_(r.amount), color:r.color||'#64748B',
  source:r.source||'', day:r.day_of_month||1, note:r.note||'', active:!!r.active, lastGen:r.last_generated||'' }; }

function mapGoal_(r){ return {
  id:String(r.id), name:r.name, target:num_(r.target), saved:num_(r.saved), color:r.color||'#8B5CF6', note:r.note||'' }; }

function mapSettings_(r){ return {
  currencySymbol:r?.currency_symbol||'$', locale:r?.locale||'es-CO', decimals:r?.decimals||0,
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
    color:tx.color||'#64748B', source:normSource_(tx.source), note:tx.note||'' };
}
async function txUpsert_(cid, tx){
  const { data, error } = await netCall_(sb.from('transactions')
    .upsert(buildTxPayload_(cid, tx), { onConflict:'client_id' }).select().single());
  if (error) throw error; return data;
}
async function applyOp_(item){
  if (item.op==='add'){ await txUpsert_(item.client_id, item.payload); }
  else if (item.op==='update'){
    const { error } = await netCall_(sb.from('transactions').update(buildTxPayload_(item.client_id, item.payload)).eq('client_id', item.client_id));
    if (error) throw error;
  } else if (item.op==='delete'){
    const { error } = await netCall_(sb.from('transactions').delete().eq('client_id', item.client_id));
    if (error) throw error;
  }
}
let _flushing=false;
async function flushQueue_(){
  if (_flushing || isOffline_()) return;
  let q=loadQueue_();
  if (!q.length){ updateBar_(); return; }
  _flushing=true; updateBar_();
  let subioAlgo=false;
  try{
    while(q.length){
      const item=q[0];
      try{ await applyOp_(item); subioAlgo=true; }
      catch(e){
        if (isNetErr_(e)) break;                       // se fue el internet: parar y reintentar luego
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
  const css=document.createElement('style');
  css.textContent='#offline-bar{position:fixed;left:0;right:0;bottom:0;z-index:80;display:none;'
    +'text-align:center;padding:9px 14px;font:600 13px \'Inter\',system-ui,sans-serif;color:#fff;'
    +'box-shadow:0 -4px 14px rgba(0,0,0,.35);padding-bottom:calc(9px + env(safe-area-inset-bottom,0px));'
    +'transition:transform .34s var(--ease);will-change:transform}'
    +'#offline-bar.show{display:block}'
    +'@media(max-width:680px){'
    +'#offline-bar{transform:translateY(calc(-64px - env(safe-area-inset-bottom,0px)));padding-bottom:9px}'
    +'body.bars-hidden #offline-bar{transform:translateY(0);padding-bottom:calc(9px + env(safe-area-inset-bottom,0px))}'
    +'}';
  document.head.appendChild(css);
  const bar=document.createElement('div'); bar.id='offline-bar'; document.body.appendChild(bar);
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
  bar.style.background='#B45309';
  bar.textContent=offlineText_(loadQueue_().length);
  bar.classList.add('show');
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
      bar.style.background='#1D4ED8';
      bar.textContent='Subiendo '+n+' cambio'+(n===1?'':'s')+'…';
      bar.classList.add('show');
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

const API = {
  async getInitialData(){
    // Si NO hay internet, ni intentes el servidor: usa la copia local de una vez.
    if (isOffline_()){
      const snapOff = loadSnapshot_();
      if (snapOff){ setOfflineBar_(); return snapOff; }
    }
    try{
      const data = await fetchAll_();     // hay internet
      saveSnapshotData_(data);            // guarda copia local
      updateBar_();
      setTimeout(function(){ flushQueue_(); }, 1200);
      return data;
    }catch(e){
      const snap = loadSnapshot_();
      if (snap){ setOfflineBar_(); return snap; }   // falló la red: usa la copia local
      throw e;                                       // no hay copia y no hay red
    }
  },

  /* ── Movimientos (con soporte sin internet) ── */
  async addTransaction(tx){
    const cid = tx.client_id || uuid_();
    const local = { id:cid, timestamp:new Date().toISOString(), date:tx.date||today_(), type:tx.type,
      category:tx.category, amount:num_(tx.amount), color:tx.color||'#64748B', source:tx.source||'', note:tx.note||'' };
    if (isOffline_()){ enqueue_({op:'add', client_id:cid, payload:tx}); snapSoon_(); return local; }
    try{
      const saved = await txUpsert_(cid, tx); snapSoon_(); return mapTx_(saved);
    }catch(e){
      if (isNetErr_(e)){ enqueue_({op:'add', client_id:cid, payload:tx}); snapSoon_(); return local; }
      throw e;
    }
  },
  async updateTransaction(id, tx){
    if (isOffline_()){ enqueue_({op:'update', client_id:id, payload:tx}); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('transactions').update(buildTxPayload_(id, tx)).eq('client_id', id));
      if (error) throw error; snapSoon_(); return true;
    }catch(e){
      if (isNetErr_(e)){ enqueue_({op:'update', client_id:id, payload:tx}); snapSoon_(); return true; }
      throw e;
    }
  },
  async deleteTransaction(id){
    if (isOffline_()){ enqueueDelete_(id); snapSoon_(); return true; }
    try{
      const { error } = await netCall_(sb.from('transactions').delete().eq('client_id', id));
      if (error) throw error; snapSoon_(); return true;
    }catch(e){
      if (isNetErr_(e)){ enqueueDelete_(id); snapSoon_(); return true; }
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
    const payload = { due_date:p.dueDate||null, kind:p.kind, category:p.category||'', amount:num_(p.amount),
      color:p.color||'#64748B', method:p.method||'', status:p.status==='completed'?'completed':'pending', note:p.note||'' };
    const { data, error } = await sb.from('pendings').insert(payload).select().single();
    if (error) throw error;
    return mapPending_(data);
  },
  async updatePending(id, p){
    const payload = { due_date:p.dueDate||null, kind:p.kind, category:p.category||'', amount:num_(p.amount),
      color:p.color||'#64748B', method:p.method||'', status:p.status==='completed'?'completed':'pending', note:p.note||'' };
    const { error } = await sb.from('pendings').update(payload).eq('id',id);
    if (error) throw error; return true;
  },
  async deletePending(id){
    const { error } = await sb.from('pendings').delete().eq('id',id);
    if (error) throw error; return true;
  },
  async setPendingStatus(id, completed){
    const { error } = await sb.from('pendings').update({status:completed?'completed':'pending'}).eq('id',id);
    if (error) throw error; return true;
  },

  /* ── Presupuestos ── */
  async setBudget(type, category, amount){
    amount = num_(amount);
    if (amount<=0){
      await sb.from('budgets').delete().eq('type',type).eq('category',category);
      return { type, category, amount:0, deleted:true };
    }
    const { data:ex } = await sb.from('budgets').select('id').eq('type',type).eq('category',category).maybeSingle();
    if (ex) await sb.from('budgets').update({monthly_amount:amount}).eq('id',ex.id);
    else    await sb.from('budgets').insert({type,category,monthly_amount:amount});
    return { type, category, amount };
  },
  async deleteBudget(type, category){ return API.setBudget(type, category, 0); },

  /* ── Recurrencias ── */
  async addRecurring(rc){
    const payload = { type:rc.type, category:rc.category||'', amount:num_(rc.amount), color:rc.color||'#64748B',
      source:normSource_(rc.source), day_of_month:rc.day||1, note:rc.note||'', active:rc.active!==false };
    const { data, error } = await sb.from('recurring').insert(payload).select().single();
    if (error) throw error;
    return mapRecurring_(data);
  },
  async updateRecurring(id, rc){
    const payload = { type:rc.type, category:rc.category||'', amount:num_(rc.amount), color:rc.color||'#64748B',
      source:normSource_(rc.source), day_of_month:rc.day||1, note:rc.note||'', active:rc.active!==false };
    const { error } = await sb.from('recurring').update(payload).eq('id',id);
    if (error) throw error; return true;
  },
  async deleteRecurring(id){
    const { error } = await sb.from('recurring').delete().eq('id',id);
    if (error) throw error; return true;
  },

  /* ── Metas ── */
  async addGoal(g){
    const payload = { name:g.name||'Meta', target:num_(g.target), saved:num_(g.saved), color:g.color||'#8B5CF6', note:g.note||'' };
    const { data, error } = await sb.from('goals').insert(payload).select().single();
    if (error) throw error;
    return mapGoal_(data);
  },
  async updateGoal(id, g){
    const payload = { name:g.name||'Meta', target:num_(g.target), saved:num_(g.saved), color:g.color||'#8B5CF6', note:g.note||'' };
    const { error } = await sb.from('goals').update(payload).eq('id',id);
    if (error) throw error; return true;
  },
  async deleteGoal(id){
    const { error } = await sb.from('goals').delete().eq('id',id);
    if (error) throw error; return true;
  },
  async contributeGoal(id, amount){
    const { data:g, error:e1 } = await sb.from('goals').select('saved').eq('id',id).single();
    if (e1) throw e1;
    const nuevo = Math.max(0, num_(g.saved)+num_(amount));
    const { error:e2 } = await sb.from('goals').update({saved:nuevo}).eq('id',id);
    if (e2) throw e2;
    return { id:String(id), saved:nuevo };
  },

  /* ── Ajustes ── */
  async saveAppSettings(currencySymbol, decimals, locale){
    const payload = { currency_symbol:currencySymbol||'$', decimals:parseInt(decimals,10)||0, locale:locale||'es-CO' };
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
    const cuerpo = list.map(function(t){ return [ fmtFechaCorta_(t.date), TIPO_ES[t.type]||t.type, t.category, t.amount, t.note||'' ]; });
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
    const pCuerpo = pl.map(function(p){ return [ p.dueDate?fmtFechaCorta_(p.dueDate):'', p.kind==='Income'?'Ingreso':'Pago', p.category, p.amount, p.method||'', estadoPend_(p) ]; });
    const pws = XLSX.utils.aoa_to_sheet(pEnc.concat(pCuerpo));
    pws['!cols'] = [{wch:14},{wch:10},{wch:24},{wch:14},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb, pws, 'Pendientes');

    const b64 = XLSX.write(wb, { type:'base64', bookType:'xlsx' });
    return { filename:'Control_Finanzas_MS_'+fileStamp_()+'.xlsx', mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b64:b64 };
  },

  async exportPdf(scope){
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

/* ═══════════════ gs(): el puente que tu app.js usa ═══════════════ */
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
  #login-ov{position:fixed;inset:0;z-index:500;display:none;align-items:center;justify-content:center;
    background:radial-gradient(1200px 600px at 80% -10%,rgba(79,70,229,.18),transparent 60%),#0a0e1a}
  #login-ov.show{display:flex}
  #login-card{width:min(380px,92vw);background:linear-gradient(160deg,#121a2e,#0e1424);
    border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:28px;
    box-shadow:0 18px 50px -18px rgba(0,0,0,.7);font-family:'Inter',system-ui,sans-serif;color:#eef2ff}
  #login-card h1{font-family:'Space Grotesk','Inter',sans-serif;font-size:22px;margin:0 0 4px}
  #login-card p.sub{color:#8a97b8;font-size:13px;margin:0 0 20px}
  #login-card label{display:block;font-size:12px;font-weight:600;color:#8a97b8;text-transform:uppercase;letter-spacing:.7px;margin:14px 0 7px}
  #login-card input{width:100%;background:#0e1424;border:1px solid rgba(255,255,255,.12);color:#eef2ff;
    border-radius:12px;padding:12px 14px;font-size:16px;font-family:inherit}
  #login-card input:focus{outline:0;border-color:#6366F1}
  #login-card .lbtn{width:100%;border:0;border-radius:12px;padding:13px;margin-top:18px;cursor:pointer;
    font-family:inherit;font-weight:700;font-size:15px;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff}
  #login-card .lbtn.ghost{background:transparent;border:1px solid rgba(255,255,255,.12);margin-top:10px}
  #login-msg{font-size:13px;color:#F43F5E;margin-top:12px;min-height:18px;text-align:center}
  #signup-ov{position:fixed;inset:0;z-index:600;display:none;align-items:center;justify-content:center;padding:24px;
    background:rgba(5,8,16,.66)}
  #signup-ov.show{display:flex}
  #signup-card{width:min(400px,92vw);background:linear-gradient(160deg,#121a2e,#0e1424);
    border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:30px 26px;text-align:center;
    box-shadow:0 24px 60px -20px rgba(0,0,0,.8);font-family:'Inter',system-ui,sans-serif;color:#eef2ff;
    animation:supop .35s cubic-bezier(.34,1.32,.5,1) both}
  @keyframes supop{from{opacity:0;transform:translateY(12px) scale(.97)}to{opacity:1;transform:none}}
  #signup-card .mail{width:58px;height:58px;border-radius:16px;margin:0 auto 18px;display:flex;align-items:center;justify-content:center;
    background:linear-gradient(135deg,#6366F1,#0EA5E9);box-shadow:0 12px 30px -10px rgba(99,102,241,.6)}
  #signup-card .mail svg{width:30px;height:30px;stroke:#fff;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
  #signup-card h2{font-family:'Space Grotesk','Inter',sans-serif;font-size:21px;margin:0 0 10px}
  #signup-card p{color:#8a97b8;font-size:14px;line-height:1.6;margin:0 auto 6px;max-width:310px}
  #signup-card p b{color:#eef2ff}
  #signup-card .lbtn{width:100%;border:0;border-radius:12px;padding:13px;margin-top:22px;cursor:pointer;
    font-family:inherit;font-weight:700;font-size:15px;background:linear-gradient(135deg,#4F46E5,#6366F1);color:#fff}`;
  document.head.appendChild(css);

  const ov = document.createElement('div');
  ov.id = 'login-ov';
  ov.innerHTML = `
    <div id="login-card">
      <h1>Control Finanzas MS</h1>
      <p class="sub">Escribe tu correo y contraseña. Si es tu primera vez, pulsa "Crear cuenta nueva".</p>
      <label>Correo electrónico</label>
      <input type="email" id="login-email" placeholder="tucorreo@ejemplo.com" autocomplete="email">
      <label>Contraseña</label>
      <input type="password" id="login-pass" placeholder="••••••••" autocomplete="current-password">
      <button class="lbtn" id="login-in">Entrar</button>
      <button class="lbtn ghost" id="login-up">Crear cuenta nueva</button>
      <div id="login-msg"></div>
    </div>`;
  document.body.appendChild(ov);

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
    document.getElementById('login-msg').textContent='Confirma tu correo y luego pulsa "Entrar".';
    document.getElementById('login-msg').style.color='#10B981';
  }
  document.getElementById('signup-ok').onclick = closeSignup_;
  sup.addEventListener('click', function(ev){ if(ev.target.id==='signup-ov') closeSignup_(); });

  const msg = ()=>document.getElementById('login-msg');
  const email = ()=>document.getElementById('login-email').value.trim();
  const pass  = ()=>document.getElementById('login-pass').value;

  document.getElementById('login-in').onclick = async ()=>{
    msg().style.color='#F43F5E'; msg().textContent='Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email:email(), password:pass() });
    if (error) msg().textContent = traducirError_(error.message);
    else startApp_();
  };
  document.getElementById('login-up').onclick = async ()=>{
    msg().style.color='#F43F5E';
    if (!email() || !pass()){
      msg().textContent = 'Escribe tu correo y contraseña arriba, luego pulsa "Crear cuenta nueva".';
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
  return m;
}
function showLogin_(){ document.getElementById('login-ov').classList.add('show'); }

async function startApp_(){
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

  if (session) startApp_();
  else showLogin_();
});

/* ═══════════════════════════════════════════════════════════════════════
   EXTRAS: refrescar tirando hacia abajo + actualizar solo al reconectar
   (Pegar este bloque AL FINAL de db.js)
   ═══════════════════════════════════════════════════════════════════════ */

/* Recargar los datos del servidor y repintar la pantalla */
async function refreshData_(){
  if (isOffline_()){ if(window.toast) toast('Sin conexión','info'); return; }
  // si hay cambios sin subir, súbelos (flushQueue_ ya recarga y repinta al terminar)
  if (loadQueue_().length){ await flushQueue_(); return; }
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
  }catch(e){ if (window.toast) toast('No se pudo actualizar','err'); }
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