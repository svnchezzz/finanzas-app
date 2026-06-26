/*****************************************************************************************
 * CONTROL FINANZAS MS — vibración táctil (haptics)
 * Expone window.Haptic con: light, medium, heavy, success, warning, error.
 * Usa el plugin @capacitor/haptics si está disponible; si no, cae a navigator.vibrate
 * (funciona en el WebView con el permiso VIBRATE). En navegador sin soporte: no-op.
 *****************************************************************************************/
(function(){
  function hp(){ return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) || null; }
  function vibe(ms){ try{ if(navigator.vibrate) navigator.vibrate(ms); }catch(e){} }
  function impact(style, fallbackMs){
    var p=hp();
    if(p && p.impact){ try{ p.impact({style:style}); return; }catch(e){} }
    vibe(fallbackMs);
  }
  function notif(type, fallbackPattern){
    var p=hp();
    if(p && p.notification){ try{ p.notification({type:type}); return; }catch(e){} }
    vibe(fallbackPattern);
  }
  window.Haptic={
    light:function(){ impact('LIGHT', 10); },
    medium:function(){ impact('MEDIUM', 20); },
    heavy:function(){ impact('HEAVY', 32); },
    success:function(){ notif('SUCCESS', [10,40,14]); },
    warning:function(){ notif('WARNING', [18,55,18]); },
    error:function(){ notif('ERROR', [28,55,28,55,28]); }   // doble buzz
  };
})();
