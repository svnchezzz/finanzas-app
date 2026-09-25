/*****************************************************************************************
 * AJUSTES — Seguridad (bloqueo con PIN) y Cuenta (contraseña, correo, cerrar sesión).
 * El PIN se guarda como hash SHA-256 con sal en localStorage (clave cfms-pin);
 * nunca se guarda el PIN en claro. La cuenta usa el cliente `sb` de db.js.
 *****************************************************************************************/
(function(){
  'use strict';

  /* ── PIN: almacenamiento ── */
  function pinData(){try{return JSON.parse(localStorage.getItem('cfms-pin')||'null');}catch(e){return null;}}
  function pinEnabled(){return !!pinData();}
  async function hashPin(pin,salt){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(salt+'|'+pin));
    return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  }
  async function savePin(pin){
    const salt=Array.from(crypto.getRandomValues(new Uint8Array(8))).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
    localStorage.setItem('cfms-pin',JSON.stringify({salt:salt,hash:await hashPin(pin,salt)}));
  }
  async function checkPin(pin){
    const d=pinData(); if(!d)return true;
    return (await hashPin(pin,d.salt))===d.hash;
  }
  function clearPin(){localStorage.removeItem('cfms-pin');}

  /* ── Freno a la fuerza bruta ──────────────────────────────────────────────
     Un PIN de 4 dígitos son 10.000 combinaciones: sin freno se prueban todas
     en minutos. A partir del 5º fallo se bloquea el teclado con una espera
     que crece (5s, 10s, 20s… hasta 5 min). El contador vive en localStorage
     para que cerrar y reabrir la app no lo reinicie.                       */
  const FALLOS_LIBRES=4, ESPERA_MAX=300000;
  function intentos(){try{return JSON.parse(localStorage.getItem('cfms-pin-try')||'{"n":0,"hasta":0}');}catch(e){return {n:0,hasta:0};}}
  function guardaIntentos(v){try{localStorage.setItem('cfms-pin-try',JSON.stringify(v));}catch(e){}}
  function limpiaIntentos(){try{localStorage.removeItem('cfms-pin-try');}catch(e){}}
  function esperaRestante(){                        // ms que faltan de castigo
    const t=intentos();
    return t.hasta>Date.now() ? t.hasta-Date.now() : 0;
  }
  function anotaFallo(){
    const t=intentos(); t.n=(t.n||0)+1;
    if(t.n>FALLOS_LIBRES){
      const espera=Math.min(ESPERA_MAX, 5000*Math.pow(2, t.n-FALLOS_LIBRES-1));
      t.hasta=Date.now()+espera;
    }
    guardaIntentos(t);
    return esperaRestante();
  }
  function textoEspera(ms){
    const s=Math.ceil(ms/1000);
    if(s<60)return 'Demasiados intentos · espera '+s+'s';
    return 'Demasiados intentos · espera '+Math.ceil(s/60)+' min';
  }

  /* ── Huella digital (plugin nativo "Biometric", ver BiometricPlugin.java) ── */
  const Bio=(function(){
    try{
      if(window.Capacitor&&typeof window.Capacitor.registerPlugin==='function')
        return window.Capacitor.registerPlugin('Biometric');
    }catch(e){}
    return null;
  })();
  let bioHW=false;                                   // ¿el celular tiene huella registrada?
  function bioOn(){return bioHW&&localStorage.getItem('cfms-bio')==='1';}
  async function detectBio(){
    if(!Bio)return false;
    try{const r=await Bio.isAvailable();bioHW=!!(r&&r.available);}catch(e){bioHW=false;}
    if(!bioHW)localStorage.removeItem('cfms-bio');   // sin hardware no tiene sentido guardarlo
    return bioHW;
  }

  /* ── Pantalla de bloqueo ── */
  const lock=document.getElementById('lockScreen');
  const dotsEl=document.getElementById('lockDots');
  const titleEl=document.getElementById('lockTitle');
  const bioBtn=document.getElementById('lockBio');
  let entry='', mode='verify', firstPin='', onOk=null;

  function paintDots(){
    dotsEl.querySelectorAll('span').forEach(function(s,i){s.classList.toggle('on',i<entry.length);});
  }
  function setMode(m,cb){
    mode=m; entry=''; firstPin=''; onOk=cb||null; paintDots();
    titleEl.textContent=m==='new1'?'Crea tu PIN':m==='new2'?'Repite tu PIN':'Ingresa tu PIN';
    // Cancelable salvo el desbloqueo de arranque (verify sin callback)
    const c=document.getElementById('lockCancel');
    if(c)c.hidden=(m==='verify'&&!cb);
    // La huella solo sirve para entrar a la app, no para crear/cambiar el PIN
    if(bioBtn)bioBtn.hidden=!(m==='verify'&&!cb&&bioOn());
    if(m==='verify')pintaEspera();   // si quedaba castigo pendiente, se muestra
  }
  let lockShown=false;
  function showLock(m,cb){
    if(lockShown)return;                             // no apilar pantallas de bloqueo
    lockShown=true;
    setMode(m||'verify',cb);lock.hidden=false;
    requestAnimationFrame(function(){lock.classList.add('show');});
    if(bioBtn&&!bioBtn.hidden)askBio();              // pide la huella de una vez
  }
  function hideLock(){lockShown=false;lock.classList.remove('show');setTimeout(function(){if(!lockShown)lock.hidden=true;},250);}
  function lockOpen(){return lockShown;}
  function unlocked(){hideLock();if(window.Haptic&&Haptic.light)Haptic.light();const cb=onOk;onOk=null;if(cb)cb();}

  /* Muestra el diálogo de huella del sistema. Si falla o se cancela, el
     usuario simplemente sigue con el teclado del PIN, que ya está en pantalla. */
  let bioBusy=false;
  async function askBio(){
    if(!Bio||bioBusy||!bioOn()||mode!=='verify')return;
    bioBusy=true;
    try{
      const r=await Bio.authenticate({title:'Control F. MS',subtitle:'Desbloquea con tu huella',negative:'Usar PIN'});
      if(r&&r.verified&&lockOpen()&&mode==='verify')unlocked();
    }catch(e){ /* cancelado o no reconocido: queda el PIN */ }
    bioBusy=false;
  }
  if(bioBtn)bioBtn.addEventListener('click',askBio);
  function fail(){
    entry='';paintDots();
    dotsEl.classList.remove('shake');void dotsEl.offsetWidth;dotsEl.classList.add('shake');
    if(window.Haptic&&Haptic.error)Haptic.error();
  }
  /* Cuenta atrás visible mientras dura el castigo por fallar demasiado */
  let cuentaAtras=0;
  function pintaEspera(){
    const ms=esperaRestante();
    const pad=document.getElementById('lockPad');
    if(ms>0){
      titleEl.textContent=textoEspera(ms);
      if(pad)pad.classList.add('lock-pad-off');
      if(!cuentaAtras)cuentaAtras=setInterval(pintaEspera,500);
    }else{
      if(cuentaAtras){clearInterval(cuentaAtras);cuentaAtras=0;}
      if(pad)pad.classList.remove('lock-pad-off');
      if(mode==='verify')titleEl.textContent='Ingresa tu PIN';
    }
  }

  async function submit(){
    if(mode==='verify'){
      if(esperaRestante()>0){ entry='';paintDots();pintaEspera(); return; }
      if(await checkPin(entry)){ limpiaIntentos(); unlocked(); }
      else { const espera=anotaFallo(); fail(); if(espera>0)pintaEspera(); }
    }else if(mode==='new1'){
      firstPin=entry;entry='';paintDots();
      mode='new2';titleEl.textContent='Repite tu PIN';
    }else{ // new2
      if(entry===firstPin){
        await savePin(entry);hideLock();syncPinUI();
        if(window.toast)toast('PIN activado','ok');
        if(window.Haptic&&Haptic.success)Haptic.success();
      }else{titleEl.textContent='No coinciden · crea tu PIN';mode='new1';firstPin='';fail();}
    }
  }
  function press(k){
    if(mode==='verify'&&esperaRestante()>0){ pintaEspera(); return; }   // en castigo: no admite teclas
    if(k==='del'){entry=entry.slice(0,-1);paintDots();return;}
    if(entry.length>=4)return;
    entry+=k;paintDots();
    if(window.Haptic&&Haptic.light)Haptic.light();
    if(entry.length===4)setTimeout(submit,120);
  }
  // Teclado 1-9, vacío, 0, borrar
  (function buildPad(){
    const pad=document.getElementById('lockPad'); if(!pad)return;
    let html='';
    for(let i=1;i<=9;i++)html+='<button class="lk" data-k="'+i+'">'+i+'</button>';
    html+='<span></span><button class="lk" data-k="0">0</button>'+
      '<button class="lk lk-del" data-k="del" aria-label="Borrar"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H8l-6 7 6 7h13a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1z"/><path d="m12 9 6 6M18 9l-6 6"/></svg></button>';
    pad.innerHTML=html;
    pad.addEventListener('click',function(e){const b=e.target.closest('.lk');if(b)press(b.dataset.k);});
  })();

  (function(){
    const c=document.getElementById('lockCancel');
    if(c)c.addEventListener('click',function(){hideLock();syncPinUI();});
  })();

  /* ── Cuándo se pide el PIN ──────────────────────────────────────────────
     Al abrir la app y CADA VEZ que se sale de ella y se vuelve a entrar,
     aunque no se haya cerrado (queda en segundo plano) y aunque se vuelva
     al instante: no hay periodo de gracia.                                */
  function hasSession(){
    try{return Object.keys(localStorage).some(function(k){return k.indexOf('sb-')===0&&k.indexOf('auth-token')>-1;});}catch(e){return false;}
  }
  function debeBloquear(){return pinEnabled()&&hasSession();}

  /* Excepción: salidas que provoca la propia app (menú Compartir de Android
     al exportar). Ahí el usuario no "se fue" de la app, así que no se le pide
     el PIN al volver. El permiso cubre una sola vuelta y caduca solo. */
  let permisoHasta=0, permisoTO=0;
  function permitirSalida(ms){permisoHasta=Date.now()+(ms||120000);}
  window.LockSkip=permitirSalida;                    // lo llama db.js al exportar
  function consumirPermiso(){
    // Se limpia poco después de volver, no en el primer chequeo: al regresar
    // pueden dispararse visibilitychange y pageshow, y ambos deben verlo.
    clearTimeout(permisoTO);
    permisoTO=setTimeout(function(){permisoHasta=0;},800);
  }
  function lockNow(){
    if(Date.now()<permisoHasta){consumirPermiso();return;}
    if(debeBloquear())showLock('verify');
  }

  // Se bloquea de inmediato (sin esperar al plugin) para que no se alcance a
  // ver la app; cuando el plugin responde aparece el botón de huella.
  lockNow();
  detectBio().then(function(){
    if(lockOpen()&&mode==='verify'&&!onOk&&bioOn()){bioBtn.hidden=false;askBio();}
    syncPinUI();
  });

  let salio=false;
  document.addEventListener('visibilitychange',function(){
    if(document.hidden){salio=true;return;}
    if(salio){salio=false;lockNow();}
  });
  // Respaldo para WebViews de Android donde visibilitychange no siempre llega
  window.addEventListener('pagehide',function(){salio=true;});
  window.addEventListener('blur',function(){if(document.hidden)salio=true;});
  window.addEventListener('pageshow',function(){if(salio){salio=false;lockNow();}});

  /* ══ Pestaña de Ajustes ═══════════════════════════════════════════════ */
  const panel=document.getElementById('ajustesPanel');
  const scrim=document.getElementById('spScrim');
  let panelTO=0;
  function openAjustes(){
    clearTimeout(panelTO);
    panel.hidden=false; scrim.classList.add('show');
    // Reflow síncrono para fijar el estado inicial antes de animar. No usamos
    // requestAnimationFrame: si la pestaña no se está pintando no dispara y el
    // panel se quedaría abierto pero invisible.
    void panel.offsetWidth;
    panel.classList.add('show');
    const sc=panel.querySelector('.sp-scroll'); if(sc)sc.scrollTop=0;  // siempre arranca arriba
    document.body.classList.add('no-scroll');
    syncPinUI(); syncNotifUI(); syncFmtUI(); syncThemeUI(); loadEmail();
    refreshNtPerm();   // estado real del permiso de Android (asíncrono)
    msgCampo('accPassMsg','');   // sin mensajes viejos
    if(window.Haptic&&Haptic.light)Haptic.light();
  }
  function closeAjustes(){
    panel.classList.remove('show'); scrim.classList.remove('show');
    document.body.classList.remove('no-scroll');
    clearTimeout(panelTO);
    panelTO=setTimeout(function(){panel.hidden=true;},420);
  }
  const openBtn=document.getElementById('ajustesBtn');
  if(openBtn)openBtn.addEventListener('click',openAjustes);
  window.abrirAjustes=openAjustes;   // lo usa el engranaje de la barra superior
  document.getElementById('ajustesClose').addEventListener('click',closeAjustes);
  scrim.addEventListener('click',closeAjustes);
  // El botón atrás de Android y la tecla Escape cierran la pestaña
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!panel.hidden)closeAjustes();
  });

  /* ── Apariencia: claro / oscuro / sistema ── */
  const themeSeg=document.getElementById('themeSeg');
  function temaGuardado(){try{return localStorage.getItem('cfms-theme')||'system';}catch(e){return 'system';}}
  function aplicarTema(pref){
    const real=pref==='system'
      ?(window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')
      :pref;
    const root=document.documentElement;
    try{localStorage.setItem('cfms-theme',pref);}catch(e){}
    if(root.getAttribute('data-theme')===real)return;   // mismo tema: nada que repintar
    window.switchTheme(function(){
      root.setAttribute('data-theme',real);
      const meta=document.querySelector('meta[name="theme-color"]');
      if(meta)meta.setAttribute('content',real==='dark'?'#0A0A0A':'#F7F7F5');
      if(window.Chart){try{Chart.defaults.color=getComputedStyle(root).getPropertyValue('--ink-2').trim();}catch(e){}}
      window._noChartPulse=true;
      if(typeof window.renderAll==='function'){try{window.renderAll();}catch(e){}}
      window._noChartPulse=false;
    });
  }
  function syncThemeUI(){
    if(!themeSeg)return;
    const pref=temaGuardado();
    themeSeg.querySelectorAll('button').forEach(function(b){
      b.classList.toggle('active',b.dataset.theme===pref);
    });
    if(typeof window.moveSegInk==='function')window.moveSegInk(themeSeg);
  }
  if(themeSeg)themeSeg.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b)return;
    if(window.Haptic&&Haptic.light)Haptic.light();
    aplicarTema(b.dataset.theme); syncThemeUI();
  });
  // Si está en "Sistema", seguir al teléfono cuando cambie
  if(window.matchMedia){
    const mq=matchMedia('(prefers-color-scheme: dark)');
    const onSys=function(){if(temaGuardado()==='system')aplicarTema('system');};
    if(mq.addEventListener)mq.addEventListener('change',onSys);
  }

  /* ── Notificaciones: preferencias guardadas en el teléfono ── */
  const NT_DEF={daily:true,budget:true,pend:true,goal:true};
  function ntRead(){
    try{return Object.assign({},NT_DEF,JSON.parse(localStorage.getItem('cfms-notif')||'{}'));}
    catch(e){return Object.assign({},NT_DEF);}
  }
  function ntWrite(p){try{localStorage.setItem('cfms-notif',JSON.stringify(p));}catch(e){}}
  // app/core.js (ntOn) consulta esto antes de mandar cada aviso
  window.NotifPrefs=function(k){const p=ntRead();return k?!!p[k]:p;};

  const NT_IDS={daily:'ntDaily',budget:'ntBudget',pend:'ntPend',goal:'ntGoal'};
  let ntPerm='none';                                 // granted | denied | prompt | none

  function ntFootTxt(){
    if(ntPerm==='granted')return 'Los avisos llegan a este teléfono. Puedes probarlo aquí abajo.';
    if(ntPerm==='denied') return 'Android tiene las notificaciones bloqueadas para esta app. Actívalas en Ajustes de Android → Aplicaciones → Control. F → Notificaciones.';
    if(ntPerm==='prompt') return 'Al encender un aviso, el teléfono te pedirá permiso.';
    return 'Solo funcionan en la app instalada; en el navegador no hay notificaciones. Aquí puedes dejar elegido lo que quieres y se aplicará en el celular.';
  }
  function syncNotifUI(){
    const p=ntRead();
    Object.keys(NT_IDS).forEach(function(k){
      const el=document.getElementById(NT_IDS[k]); if(el)el.checked=!!p[k];
    });
    const foot=document.getElementById('notifFoot');
    if(foot)foot.textContent=ntFootTxt();
    // La fila de prueba solo tiene sentido si el sistema puede mostrarlas
    const test=document.getElementById('ntTest');
    if(test)test.classList.toggle('hidden',ntPerm!=='granted');
  }
  // Consultar el permiso real (sin pedirlo) y refrescar la pantalla
  async function refreshNtPerm(){
    ntPerm=(window.Notif&&Notif.perm)?await Notif.perm():'none';
    syncNotifUI();
  }

  Object.keys(NT_IDS).forEach(function(k){
    const el=document.getElementById(NT_IDS[k]); if(!el)return;
    el.addEventListener('change',async function(){
      // Lo que pidió el usuario, guardado ANTES de cualquier repintado: si se
      // lee el.checked más abajo, un syncNotifUI() intermedio ya lo habrá
      // devuelto al valor almacenado y se acabaría guardando lo contrario.
      const quiere=el.checked;

      // Al ENCENDER: asegurar el permiso del sistema antes de guardar
      if(quiere && window.Notif && Notif.available && Notif.available()){
        const ok=await Notif.request();
        // Se actualiza el permiso SIN repintar todavía (repintar aquí pisaría
        // el interruptor que el usuario acaba de mover).
        ntPerm=(window.Notif&&Notif.perm)?await Notif.perm():'none';
        if(!ok){
          const p0=ntRead(); p0[k]=false; ntWrite(p0);   // no prometer lo que no llegará
          if(window.toast)toast('Android tiene bloqueadas las notificaciones de la app','err');
          syncNotifUI();
          return;
        }
      }
      const p=ntRead(); p[k]=quiere; ntWrite(p);
      if(window.Haptic&&Haptic.light)Haptic.light();
      // Reprogramar YA: apagar cancela, encender vuelve a programar
      if(typeof window.aplicarNotifs==='function'){try{window.aplicarNotifs();}catch(e){}}
      syncNotifUI();
    });
  });

  // Notificación de prueba
  const ntTest=document.getElementById('ntTest');
  if(ntTest)ntTest.addEventListener('click',async function(){
    const sub=document.getElementById('ntTestSub');
    if(!window.Notif||!Notif.available()){ if(window.toast)toast('Solo funciona en la app instalada','err'); return; }
    const ok=await Notif.request(); await refreshNtPerm();
    if(!ok){ if(window.toast)toast('Android tiene bloqueadas las notificaciones','err'); return; }
    Notif.now('test:'+Date.now(),'🔔 Notificación de prueba','Si ves esto, los avisos de Control. F funcionan.');
    if(sub)sub.textContent='Enviada · debería aparecer en un segundo';
    if(window.Haptic&&Haptic.success)Haptic.success();
    setTimeout(function(){if(sub)sub.textContent='Comprueba el canal · se envía aunque los tengas apagados';},4000);
  });

  /* ── Moneda y formato ── */
  const curInput=document.getElementById('curInput');
  const decSeg=document.getElementById('decSeg');
  const fmtSave=document.getElementById('fmtSave');
  function ajustesApp(){return (window.S&&window.S.settings)||{currencySymbol:'$',decimals:0,locale:'es-CO'};}
  function decElegido(){
    const b=decSeg&&decSeg.querySelector('button.active');
    return b?parseInt(b.dataset.dec,10):(ajustesApp().decimals||0);
  }
  function syncFmtUI(){
    const st=ajustesApp();
    if(curInput)curInput.value=st.currencySymbol||'$';
    if(decSeg){
      decSeg.querySelectorAll('button').forEach(function(b){
        b.classList.toggle('active',parseInt(b.dataset.dec,10)===(st.decimals||0));
      });
      if(typeof window.moveSegInk==='function')window.moveSegInk(decSeg);
    }
    pintarEjemplo(); marcarFmtSucio();
  }
  function pintarEjemplo(){
    const el=document.getElementById('decSample'); if(!el)return;
    const sym=(curInput&&curInput.value.trim())||'$';
    const dec=decElegido(), st=ajustesApp();
    let n;
    try{
      n=new Intl.NumberFormat(st.locale||'es-CO',
        {minimumFractionDigits:dec,maximumFractionDigits:dec}).format(1234567.89);
    }catch(e){ n=dec?'1.234.567,89':'1.234.568'; }
    el.textContent='Ejemplo: '+sym+' '+n;
  }
  function fmtSucio(){
    const st=ajustesApp();
    const sym=(curInput&&curInput.value.trim())||'$';
    return sym!==(st.currencySymbol||'$') || decElegido()!==(st.decimals||0);
  }
  function marcarFmtSucio(){ if(fmtSave)fmtSave.classList.toggle('hidden',!fmtSucio()); }
  if(curInput)curInput.addEventListener('input',function(){pintarEjemplo();marcarFmtSucio();});
  if(decSeg)decSeg.addEventListener('click',function(e){
    const b=e.target.closest('button'); if(!b)return;
    if(window.Haptic&&Haptic.light)Haptic.light();
    decSeg.querySelectorAll('button').forEach(function(x){x.classList.remove('active');});
    b.classList.add('active');
    if(typeof window.moveSegInk==='function')window.moveSegInk(decSeg);
    pintarEjemplo(); marcarFmtSucio();
  });
  if(fmtSave)fmtSave.addEventListener('click',async function(){
    const sym=(curInput.value.trim())||'$', dec=decElegido(), st=ajustesApp();
    this.disabled=true; this.textContent='Guardando…';
    try{
      if(typeof window.gs!=='function')throw new Error('Sin conexión con el servidor');
      const nuevo=await window.gs('saveAppSettings',sym,dec,st.locale||'es-CO');
      if(window.S)window.S.settings=Object.assign({},st,nuevo||{currencySymbol:sym,decimals:dec});
      if(typeof window.renderAll==='function')window.renderAll();
      if(window.toast)toast('Formato actualizado','ok');
      if(window.Haptic&&Haptic.success)Haptic.success();
    }catch(e){ if(window.toast)toast('No se pudo guardar: '+(e.message||e),'err'); }
    this.disabled=false; this.textContent='Guardar cambios de formato';
    syncFmtUI();
  });

  /* ── Datos ── */
  const btnExport=document.getElementById('spExport');
  if(btnExport)btnExport.addEventListener('click',function(){
    closeAjustes();
    setTimeout(function(){ if(typeof window.openExport==='function')window.openExport(); },260);
  });
  const btnRefresh=document.getElementById('spRefresh');
  const REFRESH_SUB='Vuelve a descargar tus datos';
  const REFRESH_TXT={
    ok:'Datos al día',
    queued:'Se subieron tus cambios y se recargó',
    offline:'Sin conexión · inténtalo luego',
    error:'No se pudo actualizar'
  };
  let refrescando=false;
  if(btnRefresh)btnRefresh.addEventListener('click',async function(){
    if(refrescando)return;                           // evita doble toque
    const sub=document.getElementById('spRefreshSub');
    refrescando=true; btnRefresh.disabled=true;
    if(sub)sub.textContent='Actualizando…';
    let res='error';
    try{
      res=(typeof window.refreshData==='function')?await window.refreshData():'error';
    }catch(e){ res='error'; }
    if(sub)sub.textContent=REFRESH_TXT[res]||REFRESH_TXT.error;
    if(window.Haptic){
      if(res==='ok'||res==='queued'){ if(Haptic.success)Haptic.success(); }
      else if(Haptic.error)Haptic.error();
    }
    refrescando=false; btnRefresh.disabled=false;
    setTimeout(function(){if(sub)sub.textContent=REFRESH_SUB;},3000);
  });

  /* Seguridad: toggle + cambiar PIN */
  const tgl=document.getElementById('pinToggle');
  const chg=document.getElementById('pinChangeBtn');
  const bioRow=document.getElementById('bioRow');
  const bioTgl=document.getElementById('bioToggle');
  function syncPinUI(){
    tgl.checked=pinEnabled();
    chg.classList.toggle('hidden',!pinEnabled());
    document.getElementById('pinStateTxt').textContent=pinEnabled()
      ?'Se pedirá cada vez que abras o vuelvas a la app':'Protege la app con un PIN de 4 dígitos';
    // La huella es un atajo del PIN: sin PIN no se ofrece
    if(bioRow){
      bioRow.classList.toggle('hidden',!(bioHW&&pinEnabled()));
      if(bioTgl)bioTgl.checked=bioOn();
      const t=document.getElementById('bioStateTxt');
      if(t)t.textContent=bioOn()?'Se pedirá tu huella al desbloquear':'Desbloquea con tu huella en vez del PIN';
    }
  }
  tgl.addEventListener('change',function(){
    if(tgl.checked){showLock('new1');}
    else{
      tgl.checked=true; // se confirma con el PIN actual antes de apagar
      showLock('verify',function(){clearPin();localStorage.removeItem('cfms-bio');syncPinUI();if(window.toast)toast('PIN desactivado','ok');});
    }
  });
  chg.addEventListener('click',function(){
    showLock('verify',function(){showLock('new1');});
  });
  if(bioTgl)bioTgl.addEventListener('change',async function(){
    if(!bioTgl.checked){
      localStorage.removeItem('cfms-bio');syncPinUI();
      if(window.toast)toast('Huella desactivada','ok');
      return;
    }
    bioTgl.checked=false;                            // se confirma con una huella real
    if(!Bio||!(await detectBio())){
      syncPinUI();
      if(window.toast)toast('Este celular no tiene huella registrada','err');
      return;
    }
    try{
      const r=await Bio.authenticate({title:'Activar huella',subtitle:'Confirma tu huella',negative:'Cancelar'});
      if(r&&r.verified){
        localStorage.setItem('cfms-bio','1');
        if(window.toast)toast('Huella activada','ok');
        if(window.Haptic&&Haptic.success)Haptic.success();
      }
    }catch(e){ /* cancelado: se queda apagada */ }
    syncPinUI();
  });

  /* Cuenta */
  /* ── Perfil: apodo y foto, ambos sincronizados con la cuenta de Supabase.
     · Apodo → user_metadata.nickname.
     · Foto  → Storage, bucket "avatars", archivo <uid>/avatar.jpg; su URL pública va en
       user_metadata.avatar_url. En el teléfono se guarda una copia (cfms-avatar:<uid>) para
       verla sin conexión y para dejar pendiente la subida o el borrado si no hay red. ── */
  let profUser=null;
  const avKey=function(){return 'cfms-avatar:'+(profUser?profUser.id:'anon');};
  const nickKey=function(){return 'cfms-nick:'+(profUser?profUser.id:'anon');};
  function lsGet(k){try{return localStorage.getItem(k);}catch(e){return null;}}
  function lsSet(k,v){try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);return true;}catch(e){return false;}}
  function nickActual(){
    const m=profUser&&profUser.user_metadata;
    return (m&&m.nickname)||lsGet(nickKey())||'';
  }
  // Copia local de la foto: {url, data, pend}. pend = 'up' (falta subirla) o 'del' (falta borrarla).
  // Un valor antiguo "data:…" (fotos guardadas antes de sincronizar) cuenta como subida pendiente.
  function fotoCache(){
    const v=lsGet(avKey()); if(!v)return {};
    if(v.indexOf('data:')===0)return {url:null,data:v,pend:'up'};
    try{return JSON.parse(v)||{};}catch(e){return {};}
  }
  function guardaFotoCache(c){ return lsSet(avKey(), c&&(c.data||c.pend)?JSON.stringify(c):null); }
  function fotoMostrar(){
    const c=fotoCache(), meta=profUser&&profUser.user_metadata&&profUser.user_metadata.avatar_url;
    if(c.pend==='up')return c.data;
    if(c.pend==='del')return null;
    if(meta)return (c.url===meta&&c.data)?c.data:meta;
    return null;
  }
  const avPath=function(){return profUser.id+'/avatar.jpg';};
  let sincronizando=false;
  // Sube o borra en el servidor lo que haya quedado pendiente; si hay foto remota sin copia local, la guarda
  async function sincronizarFoto(){
    if(!profUser||sinRed()||sincronizando)return;
    sincronizando=true;
    const c=fotoCache();
    try{
      if(c.pend==='up'&&c.data){
        const blob=await (await fetch(c.data)).blob();
        const up=await sb.storage.from('avatars').upload(avPath(),blob,{upsert:true,contentType:'image/jpeg',cacheControl:'3600'});
        if(up.error)throw up.error;
        const url=sb.storage.from('avatars').getPublicUrl(avPath()).data.publicUrl+'?v='+Date.now();
        const r=await sb.auth.updateUser({data:{avatar_url:url}}); if(r.error)throw r.error;
        profUser.user_metadata=Object.assign({},profUser.user_metadata,{avatar_url:url});
        guardaFotoCache({url:url,data:c.data});
      }else if(c.pend==='del'){
        const rm=await sb.storage.from('avatars').remove([avPath()]); if(rm.error)throw rm.error;
        const r=await sb.auth.updateUser({data:{avatar_url:null}}); if(r.error)throw r.error;
        profUser.user_metadata=Object.assign({},profUser.user_metadata,{avatar_url:null});
        guardaFotoCache(null);
      }else{
        const meta=profUser.user_metadata&&profUser.user_metadata.avatar_url;
        if(meta&&c.url!==meta){            // foto puesta desde otro equipo: copia local para verla sin red
          const b=await (await fetch(meta)).blob();
          const data=await new Promise(function(ok){const fr=new FileReader();fr.onload=function(){ok(fr.result);};fr.readAsDataURL(b);});
          guardaFotoCache({url:meta,data:data});
        }else if(!meta&&c.url){ guardaFotoCache(null); }   // la quitaron desde otro equipo
      }
      paintProfile();
    }catch(e){
      msgCampo('accNickMsg','La foto quedó en este teléfono, pero no se pudo sincronizar: '+errCuenta(e),'err');
    }finally{ sincronizando=false; }
  }
  function paintProfile(){
    const em=profUser?profUser.email:null, nick=nickActual();
    document.getElementById('accNick').textContent=nick||(em?em.split('@')[0]:'Sin sesión');
    document.getElementById('accEmail').textContent=em||'';
    const img=document.getElementById('accAvatarImg'), foto=fotoMostrar();
    if(foto){img.src=foto;img.hidden=false;}else{img.hidden=true;img.removeAttribute('src');}
    document.getElementById('accAvatarRemove').hidden=!foto;
    document.getElementById('accAvatar').dataset.foto=foto?'1':'';
  }
  let profReady=null;
  function loadEmail(){ cerrarEdicionPerfil(); profReady=leerPerfil(); return profReady; }
  // Cada vez que se abre Ajustes el perfil arranca en modo lectura (nombre + lápiz), sin menús abiertos
  function cerrarEdicionPerfil(){
    const row=document.getElementById('accNickRow'), form=document.getElementById('accNickForm'), menu=document.getElementById('accAvMenu');
    if(form)form.hidden=true; if(row)row.hidden=false;
    if(menu)menu.hidden=true; const av=document.getElementById('accAvatar'); if(av)av.setAttribute('aria-expanded','false');
  }
  function perfilListo(){ return profUser ? Promise.resolve() : (profReady||loadEmail()); }
  async function leerPerfil(){
    const elSt=document.getElementById('accStatus');
    try{
      const r=await sb.auth.getSession();
      profUser=r&&r.data&&r.data.session?r.data.session.user:null;
    }catch(e){}
    paintProfile();
    // Con red, pide el usuario al servidor: trae el apodo y la foto que se hayan cambiado en otro equipo
    if(profUser&&!sinRed()){
      try{ const u=await sb.auth.getUser(); if(u&&u.data&&u.data.user){profUser=u.data.user;paintProfile();} }catch(e){}
      sincronizarFoto();
    }
    if(elSt){
      elSt.textContent=!profUser?'No has iniciado sesión'
        :sinRed()?'Sin conexión · los cambios se suben al volver'
        :'Sesión iniciada · datos sincronizados';
    }
  }
  /* Editor de foto: arrastrar para mover, pellizcar / rueda / barra para acercar.
     El círculo marca lo que se verá; fuera de él la imagen queda oscurecida.
     Devuelve un JPEG cuadrado de OUT px (o null si se cancela). */
  const OUT=256;
  function editarFoto(file){
    return new Promise(function(resolve,reject){
      const url=URL.createObjectURL(file), im=new Image();
      im.onerror=function(){URL.revokeObjectURL(url);reject(new Error('No se pudo leer esa imagen.'));};
      im.onload=function(){
        const W=im.naturalWidth, H=im.naturalHeight;
        const ov=document.createElement('div');
        ov.className='crop-ov';
        ov.innerHTML='<div class="crop-card" role="dialog" aria-modal="true" aria-labelledby="cropTitle" tabindex="-1">'+
          '<h2 id="cropTitle">Ajusta tu foto</h2>'+
          '<div class="crop-stage"><div class="crop-mask" aria-hidden="true"></div></div>'+
          '<input type="range" class="crop-zoom" min="1" max="4" step="0.01" value="1" aria-label="Acercar o alejar">'+
          '<p class="crop-hint">Arrastra para mover · pellizca o usa la barra para acercar</p>'+
          '<div class="crop-acts"><button type="button" class="sp-btn crop-cancel">Cancelar</button><button type="button" class="crop-ok">Usar foto</button></div>'+
        '</div>';
        const stage=ov.querySelector('.crop-stage'), zoomEl=ov.querySelector('.crop-zoom');
        im.className='crop-img'; im.alt=''; im.draggable=false;
        stage.insertBefore(im,stage.firstChild);
        document.body.appendChild(ov);
        const prevFocus=document.activeElement;

        const S=stage.clientWidth, D=S-40;              // lado del escenario y diámetro del círculo
        const base=D/Math.min(W,H);                      // escala mínima: la foto cubre el círculo
        let zoom=1, x=0, y=0;                            // desplazamiento del centro de la foto (px de pantalla)
        function clamp(){
          const sc=base*zoom, mx=Math.max(0,(W*sc-D)/2), my=Math.max(0,(H*sc-D)/2);
          x=Math.min(mx,Math.max(-mx,x)); y=Math.min(my,Math.max(-my,y));
        }
        function paint(){
          clamp();
          im.style.width=W+'px'; im.style.height=H+'px';
          im.style.transform='translate(-50%,-50%) translate('+x+'px,'+y+'px) scale('+(base*zoom)+')';
          zoomEl.value=zoom;
        }
        function setZoom(z){ zoom=Math.min(4,Math.max(1,z)); paint(); }
        paint();
        requestAnimationFrame(function(){ov.classList.add('show');ov.querySelector('.crop-ok').focus({preventScroll:true});});

        // Arrastre y pellizco con Pointer Events (un dedo mueve, dos dedos acercan)
        const ptrs=new Map(); let last=null, pinch0=0, zoom0=1;
        stage.addEventListener('pointerdown',function(e){
          try{stage.setPointerCapture(e.pointerId);}catch(err){}   // sin captura igual se puede arrastrar
          ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
          if(ptrs.size===2){const p=Array.from(ptrs.values());pinch0=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);zoom0=zoom;}
          last={x:e.clientX,y:e.clientY};
        });
        stage.addEventListener('pointermove',function(e){
          if(!ptrs.has(e.pointerId))return;
          ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
          if(ptrs.size>=2){
            const p=Array.from(ptrs.values()), d=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
            if(pinch0)setZoom(zoom0*d/pinch0);
          }else if(last){
            x+=e.clientX-last.x; y+=e.clientY-last.y; last={x:e.clientX,y:e.clientY}; paint();
          }
        });
        function up(e){ptrs.delete(e.pointerId); last=null; if(ptrs.size<2)pinch0=0;
          if(ptrs.size===1){const p=ptrs.values().next().value;last={x:p.x,y:p.y};}}
        stage.addEventListener('pointerup',up); stage.addEventListener('pointercancel',up);
        stage.addEventListener('wheel',function(e){e.preventDefault();setZoom(zoom*(e.deltaY<0?1.08:1/1.08));},{passive:false});
        zoomEl.addEventListener('input',function(){setZoom(parseFloat(zoomEl.value)||1);});

        function cerrar(result){
          ov.classList.remove('show');
          setTimeout(function(){ov.remove();URL.revokeObjectURL(url);},220);
          if(prevFocus&&prevFocus.focus)prevFocus.focus({preventScroll:true});
          resolve(result);
        }
        ov.querySelector('.crop-cancel').onclick=function(){cerrar(null);};
        ov.addEventListener('keydown',function(e){
          if(e.key==='Escape'){e.stopPropagation();cerrar(null);}
          else if(e.key==='Tab'){ // el foco no sale del editor
            const f=Array.from(ov.querySelectorAll('input,button')), i=f.indexOf(document.activeElement);
            e.preventDefault(); f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus();
          }
        });
        ov.querySelector('.crop-ok').onclick=function(){
          // Lo que está dentro del círculo, en píxeles de la foto original
          const sc=base*zoom, lado=D/sc, cx=W/2-x/sc, cy=H/2-y/sc;
          const c=document.createElement('canvas'); c.width=c.height=OUT;
          const ctx=c.getContext('2d'); ctx.imageSmoothingQuality='high';
          ctx.drawImage(im,cx-lado/2,cy-lado/2,lado,lado,0,0,OUT,OUT);
          cerrar(c.toDataURL('image/jpeg',.88));
        };
      };
      im.src=url;
    });
  }
  (function wireProfile(){
    const file=document.getElementById('accAvatarFile');
    const av=document.getElementById('accAvatar'), menu=document.getElementById('accAvMenu');
    function elegirFoto(){menuFoto(false);file.value='';file.click();}
    // Tocar la foto: sin foto abre el selector; con foto, menú Cambiar / Quitar
    function menuFoto(on){
      menu.hidden=!on; av.setAttribute('aria-expanded',on?'true':'false');
      if(on)document.getElementById('accPhotoChange').focus({preventScroll:true});
    }
    av.addEventListener('click',function(){ if(av.dataset.foto)menuFoto(menu.hidden); else elegirFoto(); });
    document.getElementById('accPhotoChange').addEventListener('click',elegirFoto);
    document.addEventListener('pointerdown',function(e){ if(!menu.hidden&&!menu.contains(e.target)&&!av.contains(e.target))menuFoto(false); },true);
    menu.addEventListener('keydown',function(e){ if(e.key==='Escape'){e.stopPropagation();menuFoto(false);av.focus();} });
    window.addEventListener('online',function(){ if(profUser)sincronizarFoto(); });   // sube/borra lo pendiente al volver la red
    file.addEventListener('change',async function(){
      const f=file.files&&file.files[0]; if(!f)return;
      if(!/^image\//.test(f.type)){msgCampo('accNickMsg','Elige una imagen.','err');return;}
      try{
        const data=await editarFoto(f);
        if(!data)return;                                 // canceló
        await perfilListo();
        if(!guardaFotoCache({url:null,data:data,pend:'up'}))throw new Error('No hay espacio para guardar la foto.');
        paintProfile(); msgCampo('accNickMsg','');
        if(window.Haptic&&Haptic.success)Haptic.success();
        sincronizarFoto();
      }catch(e){msgCampo('accNickMsg',e.message||'No se pudo usar esa imagen.','err');}
    });
    document.getElementById('accAvatarRemove').addEventListener('click',async function(){
      menuFoto(false); await perfilListo();
      const c=fotoCache();
      // Si nunca llegó a subirse basta con olvidarla; si ya está en el servidor, queda pendiente de borrar
      guardaFotoCache(c.pend==='up'&&!(profUser.user_metadata&&profUser.user_metadata.avatar_url)?null:{pend:'del'});
      paintProfile(); av.focus({preventScroll:true});
      sincronizarFoto();
    });

    const row=document.getElementById('accNickRow'), form=document.getElementById('accNickForm'), inp=document.getElementById('accNickInput');
    function editar(on){
      row.hidden=on; form.hidden=!on; msgCampo('accNickMsg','');
      if(on){inp.value=nickActual();inp.focus();inp.select();}
    }
    document.getElementById('accNickEdit').addEventListener('click',function(){editar(true);});
    inp.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();editar(false);document.getElementById('accNickEdit').focus();}});
    // Tocar fuera del campo cancela la edición (no guarda)
    document.addEventListener('pointerdown',function(e){ if(!form.hidden&&!form.contains(e.target))editar(false); },true);
    form.addEventListener('submit',async function(e){
      e.preventDefault();
      const nick=inp.value.replace(/\s+/g,' ').trim().slice(0,30);
      await perfilListo();
      if(!profUser){msgCampo('accNickMsg','No se pudo leer tu sesión. Cierra y vuelve a abrir Ajustes.','err');return;}
      lsSet(nickKey(),nick||null);            // se ve al instante, también sin conexión
      profUser.user_metadata=Object.assign({},profUser.user_metadata,{nickname:nick});
      editar(false); paintProfile();
      if(sinRed()){msgCampo('accNickMsg','Guardado en este teléfono; se sincroniza cuando vuelvas a conectarte y lo guardes otra vez.','ok');return;}
      try{
        const r=await sb.auth.updateUser({data:{nickname:nick}});
        if(r.error)throw r.error;
        if(window.Haptic&&Haptic.success)Haptic.success();
      }catch(err){msgCampo('accNickMsg','Se guardó en este teléfono, pero no se pudo sincronizar: '+errCuenta(err),'err');}
    });
  })();

  /* Traduce los mensajes de Supabase, que llegan en inglés y sin contexto. */
  function errCuenta(e){
    const m=String((e&&e.message)||e||'');
    if(/different from the old password/i.test(m)) return 'Esa ya es tu contraseña actual. Escribe una distinta.';
    if(/should be at least|at least 6/i.test(m))   return 'La contraseña es demasiado corta.';
    if(/only request this after|rate limit|too many/i.test(m))
      return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.';
    if(/already registered|already been registered/i.test(m)) return 'Ese correo ya está usado por otra cuenta.';
    if(/invalid.*email|email.*invalid/i.test(m))   return 'Ese correo no es válido.';
    if(/session|jwt|token/i.test(m))               return 'Tu sesión caducó. Cierra sesión y entra de nuevo.';
    if(/fetch|network|failed to fetch/i.test(m))   return 'Sin conexión con el servidor. Inténtalo luego.';
    return m||'No se pudo completar el cambio.';
  }
  function msgCampo(id,texto,tipo){
    const el=document.getElementById(id); if(!el)return;
    el.textContent=texto||'';
    el.classList.toggle('show',!!texto);
    el.classList.toggle('ok',tipo==='ok');
    el.classList.toggle('err',tipo==='err');
  }
  function sinRed(){return typeof navigator!=='undefined'&&navigator.onLine===false;}

  /* Ver/ocultar la contraseña: sin esto se teclea a ciegas y un error de
     dedo te cambia la clave a algo que no sabes, dejándote fuera. */
  const passInp=document.getElementById('accNewPass');
  const passEye=document.getElementById('accPassEye');
  if(passEye)passEye.addEventListener('click',function(){
    const ver=passInp.type==='password';
    passInp.type=ver?'text':'password';
    passEye.classList.toggle('on',ver);
    passEye.setAttribute('aria-label',ver?'Ocultar contraseña':'Mostrar contraseña');
    passEye.title=passEye.getAttribute('aria-label');
  });

  document.getElementById('accPassBtn').addEventListener('click',async function(){
    const p=passInp.value;
    if(p.length<6){msgCampo('accPassMsg','La contraseña debe tener al menos 6 caracteres.','err');return;}
    if(sinRed()){msgCampo('accPassMsg','Sin conexión: no se puede cambiar la contraseña ahora.','err');return;}
    this.disabled=true; const t=this.textContent; this.textContent='Guardando…';
    msgCampo('accPassMsg','');
    try{
      const r=await sb.auth.updateUser({password:p});
      if(r.error)throw r.error;
      passInp.value='';
      passInp.type='password'; if(passEye)passEye.classList.remove('on');
      msgCampo('accPassMsg','Contraseña actualizada. Úsala la próxima vez que entres.','ok');
      if(window.toast)toast('Contraseña actualizada','ok');
      if(window.Haptic&&Haptic.success)Haptic.success();
    }catch(e){
      msgCampo('accPassMsg',errCuenta(e),'err');
      if(window.Haptic&&Haptic.error)Haptic.error();
    }
    this.disabled=false; this.textContent=t;
  });

  document.getElementById('accLogout').addEventListener('click',function(){
    closeAjustes();
    if(window.logout)window.logout();
  });
})();
