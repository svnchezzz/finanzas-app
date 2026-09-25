/*****************************************************************************************
 * ACCESIBILIDAD — foco en modales, hojas y el panel de Ajustes.
 * No cambia cómo se abren/cierran: observa la clase "show" de cada contenedor y
 *  - al abrir: guarda el elemento que tenía el foco y lo pasa al diálogo,
 *  - mientras está abierto: Tab / Shift+Tab no salen del diálogo de arriba,
 *  - al cerrar: devuelve el foco a donde estaba (p. ej. el botón que lo abrió).
 *****************************************************************************************/
(function(){
  'use strict';
  const FOCUSABLE = 'button:not([disabled]),[href],input:not([type="hidden"]):not([disabled]),'+
                    'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const stack = [];   // diálogos abiertos, el último es el de arriba

  function visible(el){ return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); }
  function dialogOf(host){ return host.matches('[role="dialog"]') ? host : (host.querySelector('[role="dialog"]') || host); }

  function onOpen(host){
    if (stack.some(function(x){ return x.host===host; })) return;
    const dlg = dialogOf(host);
    stack.push({ host:host, dlg:dlg, prev:document.activeElement });
    if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex','-1');
    // Si el código ya enfocó un campo dentro (p. ej. el monto), se respeta
    if (!dlg.contains(document.activeElement)) dlg.focus({ preventScroll:true });
  }
  function onClose(host){
    const i = stack.findIndex(function(x){ return x.host===host; });
    if (i < 0) return;
    const prev = stack.splice(i,1)[0].prev;
    // Solo se devuelve el foco si nadie lo movió ya a otro sitio visible
    const a = document.activeElement;
    const lost = !a || a===document.body || host.contains(a);
    if (lost && prev && prev.focus && document.contains(prev) && visible(prev)) prev.focus({ preventScroll:true });
  }

  function watch(host){
    if (host._a11y) return; host._a11y = true;
    new MutationObserver(function(){
      if (host.classList.contains('show')) onOpen(host); else onClose(host);
    }).observe(host, { attributes:true, attributeFilter:['class'] });
  }

  document.addEventListener('keydown', function(e){
    if (e.key !== 'Tab' || !stack.length) return;
    const dlg = stack[stack.length-1].dlg;
    const items = Array.prototype.filter.call(dlg.querySelectorAll(FOCUSABLE), visible);
    if (!items.length){ e.preventDefault(); dlg.focus({ preventScroll:true }); return; }
    const first = items[0], last = items[items.length-1], a = document.activeElement;
    if (!dlg.contains(a)){ e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a===first || a===dlg)){ e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a===last){ e.preventDefault(); first.focus(); }
  });

  function init(){
    document.querySelectorAll('.modal-backdrop, .sheet-backdrop, #ajustesPanel').forEach(watch);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
