/*****************************************************************************************
 * MODO DEMO — datos de ejemplo para grabar videos o mostrar la app sin datos reales.
 * Solo se carga con ?demo=1 en localhost o la red local (ver DEMO_ en db.js).
 * No usa Supabase ni la cuenta del usuario, y los cambios no se guardan.
 * Las fechas se calculan desde hoy, así el panel siempre muestra el mes en curso.
 *****************************************************************************************/
(function(){
  'use strict';
  // Generador pseudoaleatorio con semilla fija: los mismos datos en cada grabación
  let seed = 20260925;
  function rnd(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
  function between(a, b, step){ step = step || 1000; return Math.round((a + rnd() * (b - a)) / step) * step; }
  function pick(arr){ return arr[Math.floor(rnd() * arr.length)]; }
  const pad = function(n){ return ('0' + n).slice(-2); };
  function ymd(d){ return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  const COL = {
    Salario:'#10B981', Freelance:'#14B8A6',
    Arriendo:'#EF4444', Mercado:'#F97316', Restaurantes:'#F59E0B', Transporte:'#FB923C',
    Servicios:'#DC2626', Salidas:'#F43F5E', Gimnasio:'#B91C1C', Suscripciones:'#FBBF24',
    'Fondo de emergencia':'#4F46E5', 'Viaje a Cartagena':'#8B5CF6'
  };
  const categories = {
    Income:  ['Salario','Freelance'].map(function(n){ return { name:n, color:COL[n] }; }),
    Expense: ['Arriendo','Mercado','Restaurantes','Transporte','Servicios','Salidas','Gimnasio','Suscripciones'].map(function(n){ return { name:n, color:COL[n] }; }),
    Savings: ['Fondo de emergencia','Viaje a Cartagena'].map(function(n){ return { name:n, color:COL[n] }; })
  };

  const goals = [
    { id:'g1', name:'Viaje a Cartagena',   target:3500000,  saved:0, color:COL['Viaje a Cartagena'],   note:'Vacaciones de diciembre' },
    { id:'g2', name:'Fondo de emergencia', target:12000000, saved:0, color:COL['Fondo de emergencia'], note:'6 meses de gastos' }
  ];

  const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
  const tx = []; let n = 0;
  function add(date, type, category, amount, note, extra){
    if (date > hoy) return;
    tx.push(Object.assign({ id:'demo-' + (++n), timestamp:date.toISOString(), date:ymd(date), type:type, category:category,
      amount:amount, color:COL[category] || '#64748B', source:type === 'Expense' ? 'Salary' : '', note:note || '', _goalId:null }, extra || {}));
  }

  // Cinco meses de historia, hasta hoy
  for (let m = 4; m >= 0; m--){
    const base = new Date(hoy.getFullYear(), hoy.getMonth() - m, 1, 12);
    const dia = function(d){ return new Date(base.getFullYear(), base.getMonth(), d, 12); };
    add(dia(1), 'Income', 'Salario', 4800000, 'Nómina');
    if (m % 2 === 0) add(dia(between(12, 20, 1)), 'Income', 'Freelance', between(650000, 1400000, 50000), pick(['Diseño de logo','Landing page','Asesoría']));
    add(dia(5), 'Expense', 'Arriendo', 1350000, 'Apartamento');
    add(dia(8), 'Expense', 'Servicios', between(160000, 230000, 1000), 'Luz, agua e internet');
    add(dia(3), 'Expense', 'Suscripciones', 44900, 'Netflix y Spotify');
    add(dia(2), 'Expense', 'Gimnasio', 110000, 'Mensualidad');
    [4, 11, 18, 25].forEach(function(d){ add(dia(d), 'Expense', 'Mercado', between(165000, 265000, 1000), pick(['Mercado semanal','Supermercado','Tienda'])); });
    for (let i = 0; i < 6; i++) add(dia(between(1, 28, 1)), 'Expense', 'Restaurantes', between(28000, 95000, 1000), pick(['Almuerzo','Cena con amigos','Café','Domicilio']));
    for (let i = 0; i < 7; i++) add(dia(between(1, 28, 1)), 'Expense', 'Transporte', between(9000, 48000, 1000), pick(['Uber','Bus','Gasolina','Taxi']));
    for (let i = 0; i < 2; i++) add(dia(between(6, 27, 1)), 'Expense', 'Salidas', between(60000, 180000, 1000), pick(['Cine','Concierto','Salida de fin de semana']));
    add(dia(2), 'Savings', 'Fondo de emergencia', 500000, 'Aporte mensual', { source:'Salary', _goalId:'g2' });
    add(dia(15), 'Savings', 'Viaje a Cartagena', 350000, 'Aporte quincenal', { source:'Salary', _goalId:'g1' });
  }
  tx.forEach(function(t){ const g = goals.find(function(x){ return x.id === t._goalId; }); if (g) g.saved += t.amount; });
  goals[1].saved += 3200000;   // lo que ya tenía ahorrado antes
  goals[0].saved += 900000;

  // Presupuestos a partir de lo gastado este mes: holgados, y uno cerca del límite (se ve realista)
  function presupuestos(){
    const mes = ymd(hoy).slice(0, 7), gasto = {};
    tx.forEach(function(t){ if (t.type === 'Expense' && t.date.slice(0, 7) === mes) gasto[t.category] = (gasto[t.category] || 0) + t.amount; });
    const holgura = { Mercado:1.45, Restaurantes:1.12, Transporte:1.6, Salidas:2.1 };   // Salidas incluye el pendiente ya pagado
    return Object.keys(holgura).map(function(c){
      return { type:'Expense', category:c, amount:Math.ceil(((gasto[c] || 0) * holgura[c] || 200000) / 50000) * 50000 };
    });
  }
  const enDias = function(d){ const x = new Date(hoy); x.setDate(x.getDate() + d); return ymd(x); };
  window.DEMO_DATA = {
    transactions: tx.sort(function(a, b){ return a.date < b.date ? 1 : -1; }),
    categories: categories,
    settings: { currencySymbol:'$', locale:'es-CO', decimals:0, appName:'Control Finanzas MS', palette:[], notifyEmail:'', notifyEnabled:false },
    pendings: [
      { id:'p1', dueDate:enDias(4),  kind:'Income',  category:'Freelance', amount:950000, color:COL.Freelance, method:'Transferencia', status:'pending', note:'Pago cliente — sitio web' },
      { id:'p2', dueDate:enDias(9),  kind:'Expense', category:'Servicios', amount:185000, color:COL.Servicios, method:'PSE', status:'pending', note:'Factura de energía' },
      { id:'p3', dueDate:enDias(-3), kind:'Expense', category:'Salidas',   amount:120000, color:COL.Salidas,   method:'Tarjeta', status:'completed', note:'Boletas concierto' }
    ],
    budgets: presupuestos(),
    recurring: [
      { id:'r1', type:'Income',  category:'Salario',       amount:4800000, color:COL.Salario,       source:'', day:1, note:'Nómina', active:true, lastGen:'' },
      { id:'r2', type:'Expense', category:'Arriendo',      amount:1350000, color:COL.Arriendo,      source:'Salary', day:5, note:'Apartamento', active:true, lastGen:'' },
      { id:'r3', type:'Expense', category:'Suscripciones', amount:44900,   color:COL.Suscripciones, source:'Salary', day:3, note:'Netflix y Spotify', active:true, lastGen:'' },
      { id:'r4', type:'Expense', category:'Gimnasio',      amount:110000,  color:COL.Gimnasio,      source:'Salary', day:2, note:'Mensualidad', active:false, lastGen:'' }
    ],
    goals: goals
  };
  window.DEMO_PROFILE = { id:'demo', email:'ana.gomez@correo.com', user_metadata:{ nickname:'Ana Gómez' } };
})();

/* ═══ Versión en inglés del modo demo (?demo=1&lang=en) ═══════════════════════════════════
   Solo para grabar el video en inglés: traduce los datos de ejemplo, los meses y días que usa
   la app (también en las gráficas), el formato de números, y los textos visibles de la interfaz. */
(function(){
  'use strict';
  if (!/[?&]lang=en\b/.test(location.search) || !window.DEMO_DATA) return;
  const D = window.DEMO_DATA;
  document.documentElement.lang = 'en';

  // 1) Datos de ejemplo en inglés
  const N = { 'Salario':'Salary', 'Freelance':'Freelance', 'Arriendo':'Rent', 'Mercado':'Groceries', 'Restaurantes':'Restaurants',
    'Transporte':'Transport', 'Servicios':'Utilities', 'Salidas':'Going out', 'Gimnasio':'Gym', 'Suscripciones':'Subscriptions',
    'Fondo de emergencia':'Emergency fund', 'Viaje a Cartagena':'Trip to Cartagena' };
  const NOTE = { 'Nómina':'Payroll', 'Diseño de logo':'Logo design', 'Landing page':'Landing page', 'Asesoría':'Consulting',
    'Apartamento':'Apartment', 'Luz, agua e internet':'Power, water & internet', 'Netflix y Spotify':'Netflix & Spotify',
    'Mensualidad':'Monthly fee', 'Mercado semanal':'Weekly groceries', 'Supermercado':'Supermarket', 'Tienda':'Corner store',
    'Almuerzo':'Lunch', 'Cena con amigos':'Dinner with friends', 'Café':'Coffee', 'Domicilio':'Delivery', 'Uber':'Uber', 'Bus':'Bus',
    'Gasolina':'Gas', 'Taxi':'Taxi', 'Cine':'Movies', 'Concierto':'Concert', 'Salida de fin de semana':'Weekend out',
    'Aporte mensual':'Monthly deposit', 'Aporte quincenal':'Biweekly deposit', 'Vacaciones de diciembre':'December vacation',
    '6 meses de gastos':'6 months of expenses', 'Pago cliente — sitio web':'Client payment — website',
    'Factura de energía':'Power bill', 'Boletas concierto':'Concert tickets', 'Transferencia':'Transfer', 'Tarjeta':'Card' };
  const n = function(s){ return N[s] || s; }, nt = function(s){ return NOTE[s] || s; };
  Object.keys(D.categories).forEach(function(t){ D.categories[t].forEach(function(c){ c.name = n(c.name); }); });
  D.transactions.forEach(function(t){ t.category = n(t.category); t.note = nt(t.note); });
  D.goals.forEach(function(g){ g.name = n(g.name); g.note = nt(g.note); });
  D.pendings.forEach(function(p){ p.category = n(p.category); p.note = nt(p.note); p.method = nt(p.method); });
  D.budgets.forEach(function(b){ b.category = n(b.category); });
  D.recurring.forEach(function(r){ r.category = n(r.category); r.note = nt(r.note); });
  D.settings.locale = 'en-US';
  // Íconos: la app los elige por palabras en español; se fijan a mano para los nombres en inglés
  const ICO = { 'Expense|rent':'home', 'Expense|groceries':'cart', 'Expense|restaurants':'food', 'Expense|transport':'bus',
    'Expense|utilities':'bolt', 'Expense|going out':'fun', 'Expense|gym':'gym', 'Expense|subscriptions':'repeat',
    'Income|salary':'money', 'Income|freelance':'briefcase', 'Savings|emergency fund':'bank', 'Savings|trip to cartagena':'travel' };
  try{ const prev = JSON.parse(localStorage.getItem('cfms-caticons') || '{}'); localStorage.setItem('cfms-caticons', JSON.stringify(Object.assign({}, ICO, prev))); }catch(e){}

  // 2) Meses y días (los usan los textos y las gráficas)
  try{
    MESES.splice(0, 12, 'january','february','march','april','may','june','july','august','september','october','november','december');
    MON.splice(0, 12, 'Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec');
    DOW.splice(0, 7, 'Sun','Mon','Tue','Wed','Thu','Fri','Sat');
    Object.assign(PLUR, { day:'days', week:'weeks', month:'months', year:'years' });
  }catch(e){}

  // 3) Textos de la interfaz
  const EX = {
    'Tus finanzas, bajo control.':'Your money, under control.', 'Cargando tus finanzas…':'Loading your finances…',
    'Ajustes':'Settings', 'Tema':'Theme', 'Exportar':'Export', 'Salir':'Log out', 'Agregar':'Add', 'Día':'Day', 'Semana':'Week',
    'Mes':'Month', 'Año':'Year', 'Panel':'Dashboard', 'Historial':'History', 'Pendientes':'Pending', 'Presupuestos':'Budgets',
    'Recurrentes':'Recurring', 'Metas':'Goals', 'Categorías':'Categories', 'Más':'More', 'Agregar movimiento':'Add transaction',
    'Empieza a controlar tus finanzas':'Start taking control of your money', 'Disponible':'Available',
    'Ingresos − gastos − ahorro apartado':'Income − expenses − savings set aside', 'Ingresos':'Income', 'Gastos':'Expenses',
    'Ahorro':'Savings', 'Total acumulado':'Total saved', '= igual al periodo anterior':'= same as previous period', 'Gasto':'Expense',
    'Ingreso':'Income', 'Pago':'Payment', 'Sin datos en este periodo':'No data for this period', 'Tendencia':'Trend',
    'Movimientos':'Transactions', 'Buscar…':'Search…', 'Todos':'All', 'Vencidos':'Overdue', 'Completados':'Completed',
    'Presupuestos por categoría':'Budgets by category',
    'Define un límite mensual a tus categorías de gasto y mira cuánto llevas. Te avisamos cuando te acercas o te pasas.':'Set a monthly limit for your expense categories and see how you are doing. We let you know when you get close or go over.',
    'Movimientos recurrentes':'Recurring transactions', 'Nuevo':'New', 'Nueva':'New',
    'Salario, arriendo, suscripciones… Se registran solos cada mes en el día que elijas.':'Salary, rent, subscriptions… They log themselves every month on the day you choose.',
    'Metas de ahorro':'Savings goals',
    'Ponle un objetivo a tu ahorro y sigue el progreso. Aporta o retira cuando quieras.':'Give your savings a target and track your progress. Add or withdraw anytime.',
    'Ingreso / Pago pendiente':'Pending income / payment', 'Categoría':'Category', 'Nombre de la categoría…':'Category name…',
    'Origen de fondos':'Source of funds', 'Disponible actual':'Current balance', 'Nuevo ingreso':'New income',
    'Se descuenta de tu saldo de salario.':'Deducted from your salary balance.', 'Se descuenta de tu disponible actual.':'Deducted from your current balance.',
    '¿Para una meta de ahorro? (opcional)':'For a savings goal? (optional)', 'Sin meta':'No goal', '+ Crear nueva meta…':'+ Create new goal…',
    'Pagar con dinero del ahorro (sale de tu ahorro y cuenta como gasto)':'Pay with savings (comes out of your savings and counts as an expense)',
    '¿De dónde sale ese ahorro?':'Where do those savings come from?', 'Monto':'Amount', 'Color de la nueva etiqueta':'New label color',
    'Fecha':'Date', 'Nota (opcional)':'Note (optional)', 'ej. taxi a la oficina':'e.g. taxi to the office', 'Cancelar':'Cancel', 'Guardar':'Save',
    'Agregar gasto':'Add expense', 'Agregar ahorro':'Add savings', 'Agregar ingreso':'Add income',
    'Exportar datos':'Export data', '¿Qué quieres exportar?':'What do you want to export?', 'Periodo actual':'Current period', 'Rango':'Range',
    'Todo':'Everything', 'Exporta el periodo que ves ahora en el panel.':'Exports the period you are viewing on the dashboard.',
    'Desde':'From', 'Hasta':'To', 'Formato':'Format', '.xlsx con formato':'formatted .xlsx', 'reporte de lectura':'readable report',
    '¿Es un ingreso o un pago?':'Is it income or a payment?', 'Ingreso por cobrar':'Income to collect', 'Pago por hacer':'Payment to make',
    'Fecha acordada':'Due date', 'Método de pago':'Payment method', 'Transferencia':'Transfer', 'Efectivo':'Cash', 'Tarjeta':'Card',
    'Cheque':'Check', 'Otro':'Other', 'Color':'Color', 'Editar categoría':'Edit category', 'Nombre':'Name',
    'Selecciona un color.':'Pick a color.', 'Icono':'Icon', 'Se asigna solo según el nombre; aquí puedes fijar uno.':'Picked automatically from the name; you can set one here.',
    'Vista previa':'Preview', 'Guardar cambios':'Save changes', '¿Confirmar?':'Confirm?', 'Confirmar':'Confirm',
    'Cambiar foto':'Change photo', 'Quitar foto':'Remove photo', '¿Cómo te llamamos?':'What should we call you?', 'Sesión iniciada':'Signed in',
    'Sesión iniciada · datos sincronizados':'Signed in · data synced',
    'Apariencia':'Appearance', 'Elige cómo se ve la app':'Choose how the app looks', 'Claro':'Light', 'Oscuro':'Dark', 'Sistema':'System',
    'Seguridad':'Security', 'Bloqueo con PIN':'PIN lock', 'Protege la app con un PIN de 4 dígitos':'Protect the app with a 4-digit PIN',
    'Cambiar PIN':'Change PIN', 'Pide el actual y crea uno nuevo':'Asks for the current one and creates a new one',
    'Huella digital':'Fingerprint', 'Desbloquea con tu huella en vez del PIN':'Unlock with your fingerprint instead of the PIN',
    'Se pide al abrir la app y cada vez que vuelves a ella. Al exportar no se pide, porque la salida la provoca la propia app.':'Asked when you open the app and every time you come back to it.',
    'Notificaciones':'Notifications', 'Recordatorio diario':'Daily reminder', 'A las 8 p.m., si no registraste nada ese día':'At 8 p.m., if you logged nothing that day',
    'Alertas de presupuesto':'Budget alerts', 'Avisa al llegar al 80% y al 100%':'Alerts at 80% and 100%', 'Avisos de pendientes':'Pending reminders',
    'Cobros y pagos próximos o vencidos':'Upcoming or overdue income and bills', 'Metas cumplidas':'Goals reached',
    'Avisa al acercarte y al cumplir la meta':'Alerts when you get close and reach the goal', 'Enviar una de prueba':'Send a test one',
    'Comprueba el canal · se envía aunque los tengas apagados':'Checks the channel · sent even if they are turned off',
    'Las notificaciones llegan al teléfono, no al correo.':'Notifications arrive on your phone, not by email.',
    'Solo funcionan en la app instalada; en el navegador no hay notificaciones. Aquí puedes dejar elegido lo que quieres y se aplicará en el celular.':'Notifications arrive on your phone as soon as something needs your attention.',
    'Moneda y formato':'Currency & format', 'Símbolo':'Symbol', 'Va delante de cada cifra':'Shown before every amount', 'Decimales':'Decimals',
    'Sin decimales':'No decimals', 'Con decimales':'With decimals', 'Guardar cambios de formato':'Save format changes', 'Cuenta':'Account',
    'Nueva contraseña':'New password', 'Mínimo 6 caracteres':'At least 6 characters', 'Actualizar':'Update', 'Datos':'Data',
    'Exportar datos':'Export data', 'Descarga tus movimientos en Excel o PDF':'Download your transactions in Excel or PDF',
    'Actualizar desde el servidor':'Refresh from server', 'Vuelve a descargar tus datos':'Download your data again', 'Cerrar sesión':'Log out',
    'Control Finanzas MS · versión 1.0':'Control Finanzas MS · version 1.0', 'Ingresa tu PIN':'Enter your PIN', 'Usar huella':'Use fingerprint',
    'Mostrar':'Show', 'Agrupar por':'Group by', 'Por día':'By day', 'Por semana':'By week', 'Por mes':'By month', 'Por año':'By year',
    'Pendiente':'Pending', 'Completado':'Completed', 'Marcado completado':'Marked as completed', 'Cerca':'Close', 'En rango':'On track',
    'Excedido':'Over', 'Sin presupuesto':'No budget', '＋ Definir':'＋ Set', 'Pausado':'Paused', '＋ Aportar':'＋ Add', '－ Retirar':'－ Withdraw',
    'Aportar':'Add', 'Retirar':'Withdraw', 'Nueva categoría de ingreso':'New income category', 'Nueva categoría de gasto':'New expense category',
    'Nueva categoría de ahorro':'New savings category', 'Auto':'Auto', 'Categoría actualizada':'Category updated', '¡Lograda!':'Reached!',
    'Meta cumplida':'Goal reached', 'Guardado':'Saved', 'Movimiento actualizado':'Transaction updated', 'Formato actualizado':'Format updated'
  };
  const R = [
    [/^(\d+) movimientos$/, '$1 transactions'], [/^1 movimiento$/, '1 transaction'],
    [/^(\d+) pendientes?$/, '$1 pending'],
    [/vs\. periodo anterior/, 'vs. previous period'],
    [/^Gastaste (\d+%) más que el periodo anterior$/, 'You spent $1 more than the previous period'],
    [/^Gastaste (\d+%) menos que el periodo anterior$/, 'You spent $1 less than the previous period'],
    [/^Gastaste lo mismo que el periodo anterior$/, 'You spent the same as the previous period'],
    [/^Ahorraste (.+) este periodo$/, 'You saved $1 this period'], [/ este periodo$/, ' this period'],
    [/^las (\d+) semanas de (.+)$/, 'the $1 weeks of $2'], [/^los (\d+) días de esta semana \(lun–dom\)$/, 'the $1 days of this week (Mon–Sun)'],
    [/^los (\d+) meses de (\d+)$/, 'the $1 months of $2'], [/^este día · /, 'this day · '],
    [/^(\d+) ingreso\(s\) · (\d+) pago\(s\)$/, '$1 income · $2 payment(s)'],
    [/^Ver (\d+) más · quedan (\d+)$/, 'Show $1 more · $2 left'],
    [/ neto$/, ' net'], [/ · Disponible actual$/, ' · Current balance'],
    [/^por pagar · /, 'to pay · '], [/^por cobrar · /, 'to collect · '],
    [/^Guardado · /, 'Saved · '], [/^Ahorro general \((.+) disponible\)$/, 'General savings ($1 available)'],
    [/^(.+) \((.+) disponible\)$/, '$1 ($2 available)'],
    [/^Sale del ahorro que no está apartado en ninguna meta \((.+)\)\.$/, 'Comes from savings not set aside for any goal ($1).'],
    [/^Se descuenta de tu disponible actual \((.+)\)\.$/, 'Deducted from your current balance ($1).'],
    [/^Aportar a "(.+)"$/, 'Add to "$1"'], [/^Retirar de "(.+)"$/, 'Withdraw from "$1"'],
    [/^Aporte registrado · /, 'Contribution saved · '], [/^Aporte sumado a "(.+)"$/, 'Added to "$1"'],
    [/^(.+) de (\$.+)$/, '$1 of $2'], [/^de (\$.+)$/, 'of $1'],
    [/^(\d+%) usado$/, '$1 used'], [/^(.+) disponible$/, '$1 left'], [/^(.+) por encima$/, '$1 over'], [/^(.+) restante$/, '$1 remaining'],
    [/^Gastado (.+) este mes$/, 'Spent $1 this month'], [/^Gastado en (.+)$/, function(_, m){ return 'Spent in ' + m.charAt(0).toUpperCase() + m.slice(1); }],
    [/^cada día (\d+)$/, 'on day $1 of each month'],
    [/^Editar categoría · Gasto$/, 'Edit category · Expense'], [/^Selecciona un color para gasto\.$/, 'Pick a color for expenses.'],
    [/^Gastaste /, 'You spent ']
  ];
  function tr(s){
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), core = m[2];
    if (!core) return s;
    let out = EX[core];
    if (out == null){ out = core; for (let i = 0; i < R.length; i++){ if (R[i][0].test(out)){ out = out.replace(R[i][0], R[i][1]); if (out !== core && R[i][0].source.charAt(0) === '^') break; } } }
    return m[1] + out + m[3];
  }
  function fixNode(nd){
    if (nd.nodeType === 3){
      const p = nd.parentNode; if (!p || /^(SCRIPT|STYLE)$/.test(p.nodeName)) return;
      const v = tr(nd.nodeValue); if (v !== nd.nodeValue) nd.nodeValue = v;
    } else if (nd.nodeType === 1){
      if (/^(SCRIPT|STYLE)$/.test(nd.nodeName)) return;
      ['placeholder','title','aria-label'].forEach(function(a){ const v = nd.getAttribute && nd.getAttribute(a); if (v){ const t = tr(v); if (t !== v) nd.setAttribute(a, t); } });
      nd.childNodes.forEach(fixNode);
    }
  }
  fixNode(document.documentElement);
  new MutationObserver(function(ms){
    ms.forEach(function(m){
      if (m.type === 'characterData') fixNode(m.target);
      else m.addedNodes.forEach(fixNode);
    });
  }).observe(document.documentElement, { childList:true, subtree:true, characterData:true });
})();
