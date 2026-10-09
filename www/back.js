/*****************************************************************************************
 * NAVEGACIÓN HACIA ATRÁS Y HOJAS ARRASTRABLES
 *  - Botón/gesto Atrás de Android: cierra la capa de arriba (hoja, menú, Ajustes);
 *    sin capas abiertas vuelve al Panel, y desde el Panel deja la app en segundo plano.
 *  - En celular las hojas se cierran arrastrando la asa hacia abajo.
 * Necesita @capacitor/app en el teléfono; en el navegador solo actúa el arrastre.
 *****************************************************************************************/
(function(){
  'use strict';

  /* ── Atrás ─────────────────────────────────────────────────────────── */
  function has(sel){ return !!document.querySelector(sel); }
  function anyLayerOpen(){
    return has('.modal-backdrop.show') || has('.sheet-backdrop.show') ||
           has('#ajustesPanel:not([hidden])') || has('.cal-pop.show') ||
           has('.cw-pop.show') || has('.crop-ov') || has('.ios-menu.show') ||
           (has('#ovfMenu[open]') && !window.matchMedia('(min-width:681px)').matches);
  }
  function closeTopLayer(){
    // El menú de filtros del historial no escucha Escape: se cierra aparte
    if(has('.ios-menu.show') && typeof histMenuToggle==='function'){ histMenuToggle(false); return; }
    // El resto de capas ya se cierran con Escape (shell.js, settings.js, editor de foto)
    var a=document.activeElement;
    var target=a && a!==document.body ? a : document;
    target.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  }
  function onBack(){
    var lock=document.getElementById('lockScreen');
    if(lock && !lock.hidden){ minimize(); return; }       // el bloqueo nunca se salta con Atrás
    if(anyLayerOpen()){ closeTopLayer(); return; }
    if(typeof S!=='undefined' && S.view && S.view!=='dashboard'){
      var b=document.querySelector('.bn-item[data-view="dashboard"]') || document.querySelector('.vtab[data-view="dashboard"]');
      if(b){ b.click(); return; }
    }
    minimize();
  }
  function appPlugin(){ return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App; }
  function minimize(){
    var App=appPlugin(); if(!App) return;
    if(App.minimizeApp) App.minimizeApp().catch(function(){ App.exitApp(); }); else App.exitApp();
  }
  var App=appPlugin();
  if(App && App.addListener) App.addListener('backButton',onBack);
  window.navAtras=onBack;   // para probar en el navegador: navAtras()

  /* ── Hojas: arrastrar la asa para cerrar ──────────────────────────── */
  var mq=window.matchMedia('(max-width:680px)');
  function closeButtonOf(modal){ return modal.querySelector('.modal-head .icon-btn'); }

  function makeDraggable(modal){
    if(modal.id==='confirmModal' || modal.querySelector('.sheet-grab')) return;
    var grab=document.createElement('div');
    grab.className='sheet-grab';
    grab.setAttribute('aria-hidden','true');   // el botón Cerrar ya es la alternativa accesible
    modal.insertBefore(grab,modal.firstChild);

    var startY=0,lastY=0,lastT=0,vel=0,dragging=false;
    grab.addEventListener('pointerdown',function(e){
      if(!mq.matches) return;
      dragging=true; startY=lastY=e.clientY; lastT=e.timeStamp; vel=0;
      modal.classList.add('dragging');
      try{ grab.setPointerCapture(e.pointerId); }catch(_){}
    });
    grab.addEventListener('pointermove',function(e){
      if(!dragging) return;
      var dt=Math.max(1,e.timeStamp-lastT);
      vel=(e.clientY-lastY)/dt; lastY=e.clientY; lastT=e.timeStamp;
      modal.style.transform='translateY('+Math.max(0,e.clientY-startY)+'px)';
    });
    function end(){
      if(!dragging) return;
      dragging=false;
      modal.classList.remove('dragging');
      var dy=Math.max(0,lastY-startY);
      modal.style.transform='';
      if(dy>110 || (dy>30 && vel>0.6)){ var c=closeButtonOf(modal); if(c) c.click(); }
    }
    grab.addEventListener('pointerup',end);
    grab.addEventListener('pointercancel',end);
  }
  function init(){ document.querySelectorAll('.modal').forEach(makeDraggable); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
