/*****************************************************************************************
 * WIDGET DE ANDROID ("Control. F · Saldo")
 *  - Le pasa al widget de la pantalla de inicio el disponible y los ingresos/gastos del mes.
 *    Con PIN activado, el widget muestra puntos en vez de cifras.
 *  - "+ Agregar" en el widget abre la app directo en el menú de agregar (tras el PIN).
 * Plugin nativo FinWidget (android/.../FinWidgetPlugin.java); en el navegador no hace nada.
 *****************************************************************************************/
(function(){
  'use strict';
  function plugin(){ return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.FinWidget; }
  if(!plugin()) return;

  var timer=null, last='';
  function hora(){ var d=new Date(); return ('0'+d.getHours()).slice(-2)+':'+('0'+d.getMinutes()).slice(-2); }
  function push(){
    var S=window.S; if(!S||!S._loaded) return;
    try{
      var b=periodBounds(new Date(),'month');
      var mes=allMovements().filter(function(t){ return inBounds(t,b); });
      var hidden=false; try{ hidden=!!localStorage.getItem('cfms-pin'); }catch(e){}
      var data={ balance:money(disponibleReal()), income:money(sumType(mes,'Income')), expense:money(sumType(mes,'Expense')),
                 month:capFirst(MESES[new Date().getMonth()]), hidden:hidden };
      var key=JSON.stringify(data); if(key===last) return;   // sin cambios: no redibujar el widget
      last=key; data.updated='Act. '+hora();
      plugin().update(data).catch(function(){});
    }catch(e){}
  }
  // Se actualiza poco después de cada repintado de la app y al mandarla al fondo
  window.widgetSync=function(){ clearTimeout(timer); timer=setTimeout(push,800); };
  document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='hidden'){ last=''; push(); } });

  /* ── "+ Agregar" desde el widget ── */
  function abrirAgregar(){
    var tries=0;
    (function esperar(){
      var lock=document.getElementById('lockScreen');
      var listo=window.S&&S._loaded&&typeof openActionMenu==='function'&&!(lock&&!lock.hidden);
      if(listo){ openActionMenu(); return; }
      if(++tries<240) setTimeout(esperar,250);   // hasta 1 min: lo que tarde en cargar o en poner el PIN
    })();
  }
  window.addEventListener('finWidgetAdd',abrirAgregar);
  plugin().takeLaunchAction().then(function(r){ if(r&&r.action==='add') abrirAgregar(); }).catch(function(){});
})();
