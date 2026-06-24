


/*****************************************************************************************
 * CONTROL FINANZAS MS — db.js
 * Capa que conecta el frontend con Supabase. REEMPLAZA a la función gs() que antes
 * usaba google.script.run. Tu app.js NO cambia su forma de llamar al servidor.
 *
 * NOVEDAD (v2): exportación a Excel y PDF generada en el cliente (SheetJS + jsPDF),
 * con descarga compatible con navegador y con la app de Android (Capacitor Share).
 *
 * ───────────────────────────────────────────────────────────────────────────────────
 *  PASO OBLIGATORIO: pega tu publishable key de Supabase en la línea de abajo.
 *  (Settings → API para la URL · API Keys para la Publishable key sb_publishable_...)
 *  NUNCA pongas aquí la Secret key (sb_secret_...).
 * ───────────────────────────────────────────────────────────────────────────────────
 */
const SUPABASE_URL = 'https://jjluniqevodygaojmhqn.supabase.co';
const SUPABASE_KEY = 'sb_publishable__VD9Q4rWFEt7fhIj2hw9SA_9n1hv02m';   // <-- la que empieza por sb_publishable_

// Cliente de Supabase (la librería global "supabase" viene del <script> del CDN)
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Paletas por tipo (las mismas que tenías en el servidor; el cliente las espera)
const PALETTE_BY_TYPE = {
  Income:  ['#10B981','#059669','#047857','#065F46','#14B8A6','#0891B2','#06B6D4','#0ea5e9'],
  Expense: ['#EF4444','#DC2626','#B91C1C','#F43F5E','#F97316','#FB923C','#F59E0B','#FBBF24'],
  Savings: ['#8B5CF6','#7C3AED','#6D28D9','#4F46E5','#6366F1','#3B82F6','#60A5FA','#93C5FD']
};

let CURRENT_USER_ID = null;   // se llena al iniciar sesión

// Mapas español ↔ interno para la exportación
const TIPO_ES = { Income:'Ingreso', Expense:'Gasto', Savings:'Ahorro' };
const ORIGEN_ES = { Salary:'Salario', Other:'Otra fuente', Savings:'Ahorro' };

/* ═══════════════ Utilidades de mapeo (fila de la BD → objeto que tu app espera) ═══════════════ */
function today_(){ return new Date().toISOString().slice(0,10); }
function normSource_(s){ return (s==='Salary'||s==='Other'||s==='Savings') ? s : null; }
function num_(v){ return Number(v)||0; }

function mapTx_(r){ return {
  id:String(r.id), timestamp:r.created_at, date:r.date, type:r.type, category:r.category,
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

/* ═══════════════ Utilidades para exportación ═══════════════ */
function pad2_(n){ return ('0'+n).slice(-2); }
function fileStamp_(){ const d=new Date(); return d.getFullYear()+pad2_(d.getMonth()+1)+pad2_(d.getDate())+'-'+pad2_(d.getHours())+pad2_(d.getMinutes()); }
function nowStamp_(){ const d=new Date(); return pad2_(d.getDate())+'/'+pad2_(d.getMonth()+1)+'/'+d.getFullYear()+' '+pad2_(d.getHours())+':'+pad2_(d.getMinutes()); }
function fmtFechaCorta_(ymd){ const p=String(ymd).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function scopeLabel_(scope){ if(!scope||scope.mode==='all') return 'Toda la base de datos'; return (scope.label?scope.label+'  ·  ':'')+fmtFechaCorta_(scope.start)+' a '+fmtFechaCorta_(scope.end); }
function money_(n){ n=Math.round(n||0); const st=(window.S&&window.S.settings)||{}; const sym=st.currencySymbol||'$'; const loc=st.locale||'es-CO'; return (n<0?'-':'')+sym+' '+Math.abs(n).toLocaleString(loc); }
function estadoPend_(p){ if(p.status==='completed') return 'Completado'; if(p.dueDate && p.dueDate<today_()) return 'Vencido'; return 'Pendiente'; }
function exportFilter_(scope){
  let all = ((window.S&&window.S.transactions)?window.S.transactions:[]).slice();
  if (scope && scope.mode==='range' && scope.start && scope.end)
    all = all.filter(function(t){ return t.date>=scope.start && t.date<=scope.end; });
  all.sort(function(a,b){ return a.date===b.date ? ((a.timestamp||'')<(b.timestamp||'')?-1:1) : (a.date<b.date?-1:1); });
  return all;
}
function exportPendFilter_(scope){
  let all = ((window.S&&window.S.pendings)?window.S.pendings:[]).slice();
  if (scope && scope.mode==='range' && scope.start && scope.end)
    all = all.filter(function(p){ return p.dueDate && p.dueDate>=scope.start && p.dueDate<=scope.end; });
  all.sort(function(a,b){ return (a.dueDate||'')<(b.dueDate||'')?-1:1; });
  return all;
}
function summary_(list){
  function s(t){ return list.filter(function(x){return x.type===t;}).reduce(function(a,x){return a+x.amount;},0); }
  const ing=s('Income'), gas=s('Expense'), aho=s('Savings');
  return { ingresos:ing, gastos:gas, ahorro:aho, disponible:ing-gas-aho, n:list.length };
}

/* ═══════════════ Funciones de datos (equivalentes a las del servidor) ═══════════════ */
const API = {
  async getInitialData(){
    const [tx, cats, set, pend, bud, rec, goals] = await Promise.all([
      sb.from('transactions').select('*'),
      sb.from('categories').select('*'),
      sb.from('settings').select('*').maybeSingle(),
      sb.from('pendings').select('*'),
      sb.from('budgets').select('*'),
      sb.from('recurring').select('*'),
      sb.from('goals').select('*')
    ]);
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
  },

  /* ── Transacciones ── */
  async addTransaction(tx){
    const payload = { date:tx.date||today_(), type:tx.type, category:tx.category, amount:num_(tx.amount),
      color:tx.color||'#64748B', source:normSource_(tx.source), note:tx.note||'' };
    const { data, error } = await sb.from('transactions').insert(payload).select().single();
    if (error) throw error;
    return mapTx_(data);
  },
  async updateTransaction(id, tx){
    const payload = { date:tx.date||today_(), type:tx.type, category:tx.category, amount:num_(tx.amount),
      color:tx.color||'#64748B', source:normSource_(tx.source), note:tx.note||'' };
    const { data, error } = await sb.from('transactions').update(payload).eq('id',id).select().single();
    if (error) throw error;
    return mapTx_(data);
  },
  async deleteTransaction(id){
    const { error } = await sb.from('transactions').delete().eq('id',id);
    if (error) throw error; return true;
  },

  /* ── Categorías ── */
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

  /* ── Notificaciones (pendiente: paso 2) ── */
  async probarNotificacion(){
    throw new Error('Las notificaciones por correo se activan en el siguiente paso (Edge Function).');
  },

  /* ═══════════════ EXPORTACIÓN (cliente) ═══════════════ */
  async exportExcel(scope){
    if (!window.XLSX) throw new Error('Falta la librería de Excel. Recarga la app.');
    const list = exportFilter_(scope);
    const sum = summary_(list);

    // Hoja: Movimientos
    const enc = [
      ['Control Finanzas MS — Movimientos'],
      [scopeLabel_(scope) + '  ·  Generado: ' + nowStamp_()],
      [],
      ['Ingresos', sum.ingresos],
      ['Gastos', sum.gastos],
      ['Ahorro', sum.ahorro],
      ['Disponible', sum.disponible],
      [],
      ['Fecha', 'Tipo', 'Categoría', 'Monto', 'Origen', 'Nota']
    ];
    const cuerpo = list.map(function(t){
      return [ fmtFechaCorta_(t.date), TIPO_ES[t.type]||t.type, t.category, t.amount, ORIGEN_ES[t.source]||'', t.note||'' ];
    });
    const ws = XLSX.utils.aoa_to_sheet(enc.concat(cuerpo));
    ws['!cols'] = [{wch:12},{wch:10},{wch:24},{wch:14},{wch:14},{wch:34}];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');

    // Hoja: Pendientes
    const pl = exportPendFilter_(scope);
    const pEnc = [
      ['Control Finanzas MS — Ingresos / Pagos pendientes'],
      [scopeLabel_(scope) + '  ·  Generado: ' + nowStamp_()],
      [],
      ['Fecha acordada', 'Tipo', 'Categoría', 'Monto', 'Método', 'Estado']
    ];
    const pCuerpo = pl.map(function(p){
      return [ p.dueDate?fmtFechaCorta_(p.dueDate):'', p.kind==='Income'?'Ingreso':'Pago', p.category, p.amount, p.method||'', estadoPend_(p) ];
    });
    const pws = XLSX.utils.aoa_to_sheet(pEnc.concat(pCuerpo));
    pws['!cols'] = [{wch:14},{wch:10},{wch:24},{wch:14},{wch:14},{wch:12}];
    XLSX.utils.book_append_sheet(wb, pws, 'Pendientes');

    const b64 = XLSX.write(wb, { type:'base64', bookType:'xlsx' });
    return {
      filename: 'Control_Finanzas_MS_' + fileStamp_() + '.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      b64: b64
    };
  },

  async exportPdf(scope){
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Falta la librería de PDF. Recarga la app.');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const list = exportFilter_(scope), sum = summary_(list);

    doc.setFontSize(16); doc.setTextColor(40,40,40);
    doc.text('Control Finanzas MS', 40, 42);
    doc.setFontSize(10); doc.setTextColor(120,120,120);
    doc.text('Reporte de movimientos · ' + scopeLabel_(scope) + ' · ' + nowStamp_(), 40, 60);

    doc.setFontSize(11); doc.setTextColor(20,20,20);
    doc.text('Ingresos: ' + money_(sum.ingresos), 40, 86);
    doc.text('Gastos: ' + money_(sum.gastos), 200, 86);
    doc.text('Ahorro: ' + money_(sum.ahorro), 340, 86);
    doc.text('Disponible: ' + money_(sum.disponible), 460, 86);

    doc.autoTable({
      startY: 100,
      head: [['Fecha','Tipo','Categoría','Monto','Origen','Nota']],
      body: list.map(function(t){
        return [ fmtFechaCorta_(t.date), TIPO_ES[t.type]||t.type, t.category, money_(t.amount), ORIGEN_ES[t.source]||'', t.note||'' ];
      }),
      styles:{ fontSize:8, cellPadding:4 },
      headStyles:{ fillColor:[15,23,42], textColor:255 },
      alternateRowStyles:{ fillColor:[248,250,252] },
      columnStyles:{ 3:{ halign:'right' } }
    });

    const pl = exportPendFilter_(scope);
    if (pl.length){
      doc.autoTable({
        startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 120) + 24,
        head: [['Fecha acordada','Tipo','Categoría','Monto','Método','Estado']],
        body: pl.map(function(p){
          return [ p.dueDate?fmtFechaCorta_(p.dueDate):'—', p.kind==='Income'?'Ingreso':'Pago', p.category, money_(p.amount), p.method||'', estadoPend_(p) ];
        }),
        styles:{ fontSize:8, cellPadding:4 },
        headStyles:{ fillColor:[245,158,11], textColor:255 },
        columnStyles:{ 3:{ halign:'right' } }
      });
    }

    const dataUri = doc.output('datauristring');
    const b64 = dataUri.substring(dataUri.indexOf(',') + 1);
    return { filename: 'Control_Finanzas_MS_' + fileStamp_() + '.pdf', mimeType:'application/pdf', b64: b64 };
  }
};

/* ═══════════════ gs(): el puente que tu app.js ya usa ═══════════════ */
window.gs = function(fn){
  const args = [].slice.call(arguments, 1);
  if (typeof API[fn] !== 'function') return Promise.reject(new Error('Función no disponible: '+fn));
  return API[fn].apply(null, args);
};

/* ═══════════════ Descarga del archivo exportado ═══════════════
   Reemplaza el downloadB64 de app.js por uno que:
   - en la app de Android (Capacitor), guarda el archivo y abre el menú "Compartir";
   - en el navegador, descarga normal. */
window.downloadB64 = async function(res){
  try{
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
        && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem && window.Capacitor.Plugins.Share){
      const { Filesystem, Share } = window.Capacitor.Plugins;
      const w = await Filesystem.writeFile({ path: res.filename, data: res.b64, directory: 'CACHE' });
      await Share.share({ title: res.filename, url: w.uri });
      return;
    }
  }catch(e){ /* si falla el modo nativo, cae al método de navegador */ }

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
  #login-msg{font-size:13px;color:#F43F5E;margin-top:12px;min-height:18px;text-align:center}`;
  document.head.appendChild(css);

  const ov = document.createElement('div');
  ov.id = 'login-ov';
  ov.innerHTML = `
    <div id="login-card">
      <h1>Control Finanzas MS</h1>
      <p class="sub">Inicia sesión para ver tus finanzas.</p>
      <label>Correo electrónico</label>
      <input type="email" id="login-email" placeholder="tucorreo@ejemplo.com" autocomplete="email">
      <label>Contraseña</label>
      <input type="password" id="login-pass" placeholder="••••••••" autocomplete="current-password">
      <button class="lbtn" id="login-in">Entrar</button>
      <button class="lbtn ghost" id="login-up">Crear cuenta nueva</button>
      <div id="login-msg"></div>
    </div>`;
  document.body.appendChild(ov);

  const msg = ()=>document.getElementById('login-msg');
  const email = ()=>document.getElementById('login-email').value.trim();
  const pass  = ()=>document.getElementById('login-pass').value;

  document.getElementById('login-in').onclick = async ()=>{
    msg().textContent='Entrando…';
    const { error } = await sb.auth.signInWithPassword({ email:email(), password:pass() });
    if (error) msg().textContent = traducirError_(error.message);
    else startApp_();
  };
  document.getElementById('login-up').onclick = async ()=>{
    msg().textContent='Creando cuenta…';
    const { data, error } = await sb.auth.signUp({ email:email(), password:pass() });
    if (error) { msg().textContent = traducirError_(error.message); return; }
    if (data.session) startApp_();
    else msg().textContent = 'Cuenta creada. Si pide confirmar correo, revisa tu bandeja y luego entra.';
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
  const { data:{ user } } = await sb.auth.getUser();
  CURRENT_USER_ID = user ? user.id : null;
  const ov = document.getElementById('login-ov'); if (ov) ov.classList.remove('show');
  addLogoutButton_();
  if (typeof window.init === 'function') window.init();
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
  const { data:{ session } } = await sb.auth.getSession();
  if (session) startApp_();
  else showLogin_();
});

/* Esconder la barra de estado del sistema en Android */
document.addEventListener('DOMContentLoaded', function(){
  try{
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar){
      const SB = window.Capacitor.Plugins.StatusBar;
      SB.hide();
      if (SB.setOverlaysWebView) SB.setOverlaysWebView({ overlay: false });
    }
  }catch(e){}
});

/* Bloquea el scroll del fondo cuando hay un menú o modal abierto */
(function(){
  function anyOpen(){ return !!document.querySelector('.modal-backdrop.show, .sheet-backdrop.show'); }
  function sync(){ document.body.classList.toggle('no-scroll', anyOpen()); }
  const mo = new MutationObserver(sync);
  document.addEventListener('DOMContentLoaded', function(){
    document.querySelectorAll('.modal-backdrop, .sheet-backdrop').forEach(function(el){
      mo.observe(el, { attributes:true, attributeFilter:['class'] });
    });
  });
})();

/* ═══════════════════════════════════════════════════════════════════════
   MODO SIN INTERNET — Etapa 1: lectura offline + aviso de conexión
   (La Etapa 2 —registrar sin señal— se agrega después.)

   Qué hace: cada vez que la app carga tus datos con internet, guarda una
   copia local en el teléfono. Si abres la app SIN internet, muestra esa
   última copia guardada en vez de quedarse cargando para siempre.

   Requisito: tienes que haber abierto la app CON internet al menos una vez
   (para que exista esa copia local).
   ═══════════════════════════════════════════════════════════════════════ */

function cacheKey_(){ return 'cf_cache_' + (CURRENT_USER_ID || 'anon'); }

function saveSnapshot_(data){
  try{ localStorage.setItem(cacheKey_(), JSON.stringify({ at: Date.now(), data: data })); }catch(e){}
}
function loadSnapshot_(){
  try{
    const raw = localStorage.getItem(cacheKey_());
    if(!raw) return null;
    return JSON.parse(raw).data;
  }catch(e){ return null; }
}

/* Barra de aviso "sin conexión" (abajo de la pantalla) */
function ensureOfflineBar_(){
  if(document.getElementById('offline-bar')) return;
  const css = document.createElement('style');
  css.textContent = `
  #offline-bar{position:fixed;left:0;right:0;bottom:0;z-index:600;display:none;
    text-align:center;padding:9px 14px;font:600 13px 'Inter',system-ui,sans-serif;
    color:#fff;background:#B45309;box-shadow:0 -4px 14px rgba(0,0,0,.35);
    padding-bottom:calc(9px + env(safe-area-inset-bottom,0px))}
  #offline-bar.show{display:block}`;
  document.head.appendChild(css);
  const bar = document.createElement('div');
  bar.id = 'offline-bar';
  bar.textContent = 'Sin conexión — mostrando tus últimos datos guardados';
  document.body.appendChild(bar);
}
function setOffline_(isOff){
  ensureOfflineBar_();
  const bar = document.getElementById('offline-bar');
  if(bar) bar.classList.toggle('show', !!isOff);
}

/* Detectar cuando se va o vuelve la conexión */
window.addEventListener('online',  function(){ setOffline_(false); });
window.addEventListener('offline', function(){ setOffline_(true); });

/* Envolver la carga inicial: si no hay internet, usar la copia local */
(function(){
  const _origGetInitial = API.getInitialData;
  API.getInitialData = async function(){
    try{
      const data = await _origGetInitial.call(API);
      saveSnapshot_(data);      // guarda copia local cuando sí hay internet
      setOffline_(false);
      return data;
    }catch(e){
      const snap = loadSnapshot_();
      if(snap){ setOffline_(true); return snap; }   // sin internet: muestra la copia
      throw e;                                       // sin copia y sin internet: no hay nada que mostrar
    }
  };
})();
