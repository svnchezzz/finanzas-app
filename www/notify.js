/*****************************************************************************************
 * CONTROL FINANZAS MS — notificaciones locales del teléfono (Capacitor)
 * Expone window.Notif con: init, now, at, cancel, wasSeen, markSeen, clearSeen, available.
 * Si el plugin no está disponible (p.ej. en navegador), todo queda como no-op silencioso.
 *****************************************************************************************/
(function(){
  var CHANNEL='control_f';

  function plugin(){
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
  }

  // Convierte una clave de texto en un entero positivo de 31 bits y estable
  // (LocalNotifications exige ids numéricos; la misma clave => el mismo id).
  function nid(key){
    var h=5381;
    for(var i=0;i<key.length;i++){ h=((h<<5)+h+key.charCodeAt(i))|0; }
    return Math.abs(h)%2000000000 + 1;
  }

  // ── Anti-duplicados (persistente en el teléfono) ──
  function sk(k){ return 'notifSeen:'+k; }
  function wasSeen(k){ try{ return localStorage.getItem(sk(k))==='1'; }catch(e){ return false; } }
  function markSeen(k){ try{ localStorage.setItem(sk(k),'1'); }catch(e){} }
  function clearSeen(k){ try{ localStorage.removeItem(sk(k)); }catch(e){} }

  // Pide permiso y crea el canal de Android. Devuelve true si quedó listo.
  async function init(){
    var p=plugin(); if(!p) return false;
    try{
      var perm=await p.checkPermissions();
      if(perm.display!=='granted'){ perm=await p.requestPermissions(); }
      if(perm.display!=='granted') return false;
      if(p.createChannel){
        try{
          await p.createChannel({
            id:CHANNEL, name:'Control. F',
            description:'Avisos de pendientes, presupuestos y metas',
            importance:5, visibility:1
          });
        }catch(e){}
      }
      return true;
    }catch(e){ return false; }
  }

  // Notificación inmediata (un pelín en el futuro para que dispare seguro).
  async function now(key, title, body){
    var p=plugin(); if(!p) return;
    try{
      await p.schedule({ notifications:[{
        id:nid(key), title:title, body:body, channelId:CHANNEL,
        schedule:{ at:new Date(Date.now()+500) }
      }]});
    }catch(e){}
  }

  // Notificación programada para una fecha futura.
  async function at(key, title, body, when){
    var p=plugin(); if(!p) return;
    if(!(when instanceof Date) || isNaN(when.getTime())) return;
    if(when.getTime()<=Date.now()) return;
    try{
      await p.schedule({ notifications:[{
        id:nid(key), title:title, body:body, channelId:CHANNEL,
        schedule:{ at:when, allowWhileIdle:true }
      }]});
    }catch(e){}
  }

  // Cancela una notificación programada por su clave.
  async function cancel(key){
    var p=plugin(); if(!p) return;
    try{ await p.cancel({ notifications:[{ id:nid(key) }] }); }catch(e){}
  }

  window.Notif={
    init:init, now:now, at:at, cancel:cancel,
    wasSeen:wasSeen, markSeen:markSeen, clearSeen:clearSeen,
    available:function(){ return !!plugin(); }
  };
})();
