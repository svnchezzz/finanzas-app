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
