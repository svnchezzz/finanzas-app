/* ═══════════════ INTRO / INICIO DE SESIÓN ═══════════════
   Animación de entrada: se dibuja el contorno del logo (barras + flecha) con
   nodos tipo pluma → se rellena de abajo hacia arriba con acento azul →
   aparece la marca "Control. F" → el logo hace zoom con desenfoque y revela la app.
   Se reproduce solo al abrir la app (no al iniciar ni cerrar sesión). Tocar la pantalla la salta.
   Todas las animaciones son transform/opacity: las mueve la GPU aunque la app esté cargando.
   API: window.playIntro() → Promise que se resuelve al terminar. */
(function(){
  // Colores por tema: sigue el tema de la app (claro por defecto, como el login)
  function isDark(){ return document.documentElement.getAttribute('data-theme')==='dark'; }
  const BASE = 86;
  const T = 1.5;   // factor de ritmo: >1 = más lento
  const ms = function(v){ return Math.round(v*T); };
  // Barras [x0, x1, top] en un viewBox de 120×120
  const BARS = [[18,32,62],[38,52,50],[58,72,40],[78,92,28]];
  const ARROW = [[12,98],[42,76],[60,88],[97,53]];
  const HEAD = [[106,44],[89,47],[103,61]];

  function barPath(b){
    const x0=b[0], x1=b[1], t=b[2];
    return 'M'+x0+' '+BASE+'V'+(t+3)+'Q'+x0+' '+t+' '+(x0+3)+' '+t+'H'+(x1-3)+'Q'+x1+' '+t+' '+x1+' '+(t+3)+'V'+BASE+'Z';
  }
  const arrowD = 'M'+ARROW.map(function(p){return p.join(' ');}).join('L');
  const headD  = 'M'+HEAD.map(function(p){return p.join(' ');}).join('L')+'Z';

  /* Contorno "dibujándose" SIN animar el SVG (eso lo calcula el hilo principal y se traba en
     teléfonos de gama media mientras la app carga). Cada trazo va en su propia capa HTML que se
     revela con dos transform opuestos (barras de abajo arriba, flecha de izquierda a derecha):
     todo lo mueve la GPU. Los nodos de la pluma son divs que escalan con transform. */
  const U = function(v){ return (v/120*100).toFixed(3)+'%'; };        // unidades del viewBox → % del logo
  function piece(d, box, dir, delay){
    const x=box[0], y=box[1], w=box[2]-box[0], h=box[3]-box[1];
    return '<div class="ci-pc" data-dir="'+dir+'" data-d="'+ms(delay)+'" style="left:'+U(x)+';top:'+U(y)+';width:'+U(w)+';height:'+U(h)+'">'+
      '<div class="ci-pc-c"><div class="ci-pc-s" style="left:'+(-x/w*100).toFixed(3)+'%;top:'+(-y/h*100).toFixed(3)+'%;width:'+(120/w*100).toFixed(3)+'%;height:'+(120/h*100).toFixed(3)+'%">'+
      '<svg class="ci-svg" viewBox="0 0 120 120" aria-hidden="true"><path class="ci-stroke" d="'+d+'"/></svg></div></div></div>';
  }
  function outlineSvg(){
    let s = '';
    BARS.forEach(function(b,i){ s += piece(barPath(b), [b[0]-1, b[2]-1, b[1]+1, BASE+1], 'up', i*110); });
    s += piece(arrowD, [10, 50, 100, 100], 'right', 420);
    s += piece(headD, [87, 42, 108, 63], 'right', 720);
    // Nodos de la pluma: esquinas superiores de las barras y vértices de la flecha
    BARS.forEach(function(b,i){
      [[b[0],b[2]],[b[1],b[2]]].forEach(function(p,j){
        s += '<div class="ci-nd" data-d="'+ms(i*110+180+j*90)+'" style="left:'+U(p[0])+';top:'+U(p[1])+'"></div>';
      });
    });
    ARROW.concat([HEAD[0]]).forEach(function(p,i){
      s += '<div class="ci-nd" data-d="'+ms(420+i*110)+'" style="left:'+U(p[0])+';top:'+U(p[1])+'"></div>';
    });
    return s;
  }
  function fillSvg(glow){
    let s = '<svg class="ci-svg" viewBox="0 0 120 120" aria-hidden="true">';
    BARS.forEach(function(b){ s += '<path class="'+(glow?'ci-head':'ci-bar')+'" d="'+barPath(b)+'"/>'; });
    s += '<path class="ci-arr" d="'+arrowD+'" stroke-width="8" stroke-linejoin="round" stroke-linecap="round"/>';
    s += '<path class="ci-head" d="'+headD+'" stroke-width="2" stroke-linejoin="round"/>';
    return s + '</svg>';
  }

  const css = `
  #cintro{--ci-bg:#F7F7F5;--ci-ink:#0A0A0A;--ci-acc:#33689E;--ci-grid:rgba(0,0,0,.05);--ci-halo:51,104,158;--ci-sub:rgba(10,10,10,.5);
    position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;
    overflow:hidden;cursor:pointer;-webkit-tap-highlight-color:transparent;font-family:'Space Grotesk','Inter',system-ui,sans-serif}
  #cintro .ci-bg{position:absolute;inset:0;background:var(--ci-bg);will-change:opacity}
  #cintro .ci-grid{position:absolute;inset:-40px;opacity:0;
    background-image:linear-gradient(var(--ci-grid) 1px,transparent 1px),linear-gradient(90deg,var(--ci-grid) 1px,transparent 1px);
    background-size:28px 28px;background-position:center;
    -webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0,transparent 70%);mask-image:radial-gradient(circle at 50% 50%,#000 0,transparent 70%)}
  #cintro .ci-halo{position:absolute;left:50%;top:50%;width:360px;height:360px;margin:-180px 0 0 -180px;border-radius:50%;opacity:0;
    background:radial-gradient(circle,rgba(var(--ci-halo),.12) 0,rgba(var(--ci-halo),.035) 40%,transparent 70%)}
  #cintro .ci-stage{position:relative;display:flex;flex-direction:column;align-items:center}
  #cintro .ci-logo{position:relative;width:132px;height:132px;transform:translateY(46px);will-change:transform,opacity}
  #cintro .ci-logo>*{position:absolute;inset:0}
  #cintro .ci-svg{width:100%;height:100%;display:block;overflow:visible}
  #cintro .ci-pc{position:absolute;overflow:hidden;will-change:transform}
  #cintro .ci-pc[data-dir="up"]{transform:translateY(100%)}
  #cintro .ci-pc[data-dir="up"]>.ci-pc-c{transform:translateY(-100%)}
  #cintro .ci-pc[data-dir="right"]{transform:translateX(-100%)}
  #cintro .ci-pc[data-dir="right"]>.ci-pc-c{transform:translateX(100%)}
  #cintro .ci-pc-c{position:absolute;inset:0;will-change:transform}
  #cintro .ci-pc-s{position:absolute}
  #cintro .ci-stroke{fill:none;stroke:var(--ci-ink);stroke-opacity:.85;stroke-width:1.1;stroke-linejoin:round}
  #cintro .ci-nd{position:absolute;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--ci-bg);
    box-shadow:0 0 0 .9px var(--ci-ink);opacity:0;will-change:transform,opacity}
  #cintro .ci-grid,#cintro .ci-halo{will-change:opacity,transform}
  #cintro .ci-bar{fill:var(--ci-ink)}
  #cintro .ci-arr{fill:none;stroke:var(--ci-acc)}
  #cintro .ci-head{fill:var(--ci-acc);stroke:var(--ci-acc)}
  /* Relleno de abajo hacia arriba con dos transform opuestos (máscara en GPU, sin clip-path) */
  #cintro .ci-fill{overflow:hidden;transform:translateY(100%);will-change:transform}
  #cintro .ci-fill-in{position:absolute;inset:0;transform:translateY(-100%);will-change:transform}
  /* Brillo y desenfoque pre-renderizados: solo se anima su opacidad */
  #cintro .ci-glow{filter:blur(6px);opacity:0;will-change:opacity}
  #cintro .ci-blur{filter:blur(4px);opacity:0;will-change:opacity}
  #cintro .ci-word{margin-top:10px;display:flex;align-items:baseline;font-weight:700;font-size:30px;letter-spacing:-.03em;color:var(--ci-ink);line-height:1}
  #cintro .ci-word span{display:inline-block;opacity:0;white-space:pre;will-change:transform,opacity}
  #cintro .ci-word .ci-ms{align-self:center;margin-left:10px;padding:4px 8px;border-radius:6px;background:var(--ci-ink);color:var(--ci-bg);
    font-family:'Inter',system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:.08em;line-height:1}
  #cintro .ci-line{width:34px;height:2px;border-radius:2px;margin-top:10px;background:var(--ci-acc);transform:scaleX(0);opacity:.9}
  #cintro .ci-tag{margin-top:10px;font-family:'Inter',system-ui,sans-serif;font-size:12px;letter-spacing:.02em;color:var(--ci-sub);opacity:0}
  #cintro.dark{--ci-bg:#0A0A0A;--ci-ink:#F5F5F3;--ci-acc:#4F7FB8;--ci-grid:rgba(255,255,255,.045);--ci-halo:79,127,184;--ci-sub:rgba(245,245,243,.55)}
`;

  let styled = false;
  function build(){
    if (!styled){ const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); styled = true; }
    const ov = document.createElement('div');
    ov.id = 'cintro';
    if (isDark()) ov.className = 'dark';
    ov.setAttribute('aria-hidden','true');
    const word = 'Control.'.split('').map(function(c){return '<span>'+c+'</span>';}).join('')
               + '<span> </span><span>F</span><span class="ci-ms">MS</span>';
    ov.innerHTML =
      '<div class="ci-bg"></div><div class="ci-grid"></div><div class="ci-halo"></div>'+
      '<div class="ci-stage">'+
        '<div class="ci-logo"><div class="ci-glow">'+fillSvg(true)+'</div><div class="ci-out">'+outlineSvg()+'</div>'+
          '<div class="ci-fill"><div class="ci-fill-in">'+fillSvg()+'</div></div><div class="ci-blur">'+fillSvg()+'</div></div>'+
        '<div class="ci-word">'+word+'</div>'+
        '<div class="ci-line"></div>'+
        '<div class="ci-tag">Tus finanzas, bajo control.</div>'+
      '</div>';
    return ov;
  }

  let running = null;
  window.playIntro = function(){
    if (running) return running;
    if (!document.body || !Element.prototype.animate) return Promise.resolve();
    const ov = build();
    const dark = ov.classList.contains('dark');
    document.body.appendChild(ov);
    const $ = function(s){return ov.querySelector(s);};
    const $$ = function(s){return Array.prototype.slice.call(ov.querySelectorAll(s));};
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const E = 'cubic-bezier(.16,1,.3,1)', SOFT = 'cubic-bezier(.65,0,.35,1)';
    const anims = [];
    function a(el, kf, o){ const x = el.animate(kf, Object.assign({fill:'forwards', easing:E}, o)); anims.push(x); return x; }

    running = new Promise(function(resolve){
      let done = false, tEnd = 0;
      function cleanup(){ clearTimeout(tEnd); unDark(); ov.remove(); running = null; resolve(); }
      function finish(){
        if (done) return; done = true;
        clearTimeout(tEnd);
        anims.forEach(function(x){ try{x.pause();}catch(e){} });
        ov.animate([{opacity:getComputedStyle(ov).opacity},{opacity:0}],{duration:ms(260),easing:'ease-out',fill:'forwards'})
          .finished.then(cleanup, cleanup);
      }
      function unDark(){ document.documentElement.classList.remove('ci-on'); }
      ov.addEventListener('click', finish);

      if (reduce){
        $('.ci-out').style.display = 'none';
        $('.ci-fill').style.transform = 'none';
        $('.ci-fill-in').style.transform = 'none';
        tEnd = setTimeout(finish, 900);
        return;
      }

      // 1) Cuadrícula y trazado del contorno: capas reveladas con transform + nodos que escalan (GPU)
      $$('.ci-pc').forEach(function(pc){
        const up = pc.dataset.dir==='up', d = +pc.dataset.d;
        const o = {duration:ms(620), delay:d, easing:SOFT};
        a(pc, up ? [{transform:'translateY(100%)'},{transform:'translateY(0)'}] : [{transform:'translateX(-100%)'},{transform:'translateX(0)'}], o);
        a(pc.firstChild, up ? [{transform:'translateY(-100%)'},{transform:'translateY(0)'}] : [{transform:'translateX(100%)'},{transform:'translateX(0)'}], o);
      });
      $$('.ci-nd').forEach(function(n){
        a(n, [{opacity:0, transform:'scale(0)'},{opacity:1, transform:'scale(1.5)', offset:.6},{opacity:1, transform:'scale(1)'}],
          {duration:ms(320), delay:+n.dataset.d, easing:'cubic-bezier(.34,1.3,.64,1)'});
      });
      a($('.ci-grid'), [{opacity:0},{opacity:1}], {duration:ms(700)});
      // 2) Relleno de abajo hacia arriba + halo azul — 1.15s → 1.85s
      a($('.ci-fill'), [{transform:'translateY(100%)'},{transform:'translateY(0)'}], {duration:ms(650), delay:ms(1150), easing:SOFT});
      a($('.ci-fill-in'), [{transform:'translateY(-100%)'},{transform:'translateY(0)'}], {duration:ms(650), delay:ms(1150), easing:SOFT});
      a($('.ci-glow'), [{opacity:0},{opacity:dark?.5:.4},{opacity:dark?.2:.14}], {duration:ms(900), delay:ms(1650)});
      a($('.ci-out'), [{opacity:1},{opacity:0}], {duration:ms(400), delay:ms(1550)});
      a($('.ci-halo'), [{opacity:0, transform:'scale(.6)'},{opacity:1, transform:'scale(1)'}], {duration:ms(900), delay:ms(1450)});
      // 3) El logo sube y aparece la marca — 2.0s → 3.1s
      a($('.ci-logo'), [{transform:'translateY(46px) scale(1)'},{transform:'translateY(0) scale(.8)'}], {duration:ms(720), delay:ms(2000)});
      $$('.ci-word span').forEach(function(s,i){
        a(s, [{opacity:0, transform:'translateY(10px) scale(.96)'},{opacity:1, transform:'translateY(0) scale(1)'}], {duration:ms(520), delay:ms(2180+i*38)});
      });
      a($('.ci-line'), [{transform:'scaleX(0)'},{transform:'scaleX(1)'}], {duration:ms(520), delay:ms(2560)});
      a($('.ci-tag'), [{opacity:0, transform:'translateY(6px)'},{opacity:1, transform:'none'}], {duration:ms(500), delay:ms(2650)});
      // 4) Salida: el texto se va, el logo vuelve al centro y hace zoom con desenfoque — 3.55s → 4.55s
      [$('.ci-word'), $('.ci-line'), $('.ci-tag')].forEach(function(el){
        a(el, [{opacity:1, translate:'0 0'},{opacity:0, translate:'0 8px'}], {duration:ms(320), delay:ms(3550), easing:'ease-in'});
      });
      a($('.ci-logo'), [
        {transform:'translateY(0) scale(.8)', opacity:1, offset:0},
        {transform:'translateY(46px) scale(1)', opacity:1, offset:.4},
        {transform:'translateY(46px) scale(3.2)', opacity:0, offset:1}
      ], {duration:ms(900), delay:ms(3650), easing:SOFT});
      a($('.ci-blur'), [{opacity:0, offset:0},{opacity:0, offset:.4},{opacity:1, offset:.7}], {duration:ms(900), delay:ms(3650), easing:'linear'});
      a($('.ci-fill'), [{opacity:1, offset:0},{opacity:1, offset:.4},{opacity:0, offset:.7}], {duration:ms(900), delay:ms(3650), easing:'linear'});
      a($('.ci-glow'), [{opacity:dark?.2:.14},{opacity:0}], {duration:ms(400), delay:ms(3650)});
      a($('.ci-halo'), [{opacity:1},{opacity:0}], {duration:ms(500), delay:ms(3700)});
      a($('.ci-grid'), [{opacity:1},{opacity:0}], {duration:ms(500), delay:ms(3800)});
      a($('.ci-bg'), [{opacity:1},{opacity:0}], {duration:ms(500), delay:ms(4050), easing:'ease-out'});
      setTimeout(unDark, ms(4050));
      tEnd = setTimeout(function(){ done = true; cleanup(); }, ms(4600));
    });
    return running;
  };

  // Tras cerrar sesión no se repite la intro: la app va directo al login (db.js)
  try{
    if (sessionStorage.getItem('cfms-after-logout')){
      sessionStorage.removeItem('cfms-after-logout');
      window.__afterLogout = true;
      document.documentElement.classList.remove('ci-on');
      document.documentElement.classList.add('no-boot');
      return;
    }
  }catch(e){}

  // Al abrir la app: cubre la pantalla de carga mientras se inicia todo
  if (document.body) window.playIntro();
  else document.addEventListener('DOMContentLoaded', function(){ window.playIntro(); });
})();
