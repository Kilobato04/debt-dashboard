// ============================================================
// APP.JS — Lógica principal · Sin módulos ES6
// ============================================================

// ── AUTH ──────────────────────────────────────────────────
function checkAuth() {
  if (sessionStorage.getItem("debt_token") === CONFIG.appToken) return true;
  const input = prompt("Token de acceso:");
  if (input === CONFIG.appToken) {
    sessionStorage.setItem("debt_token", input);
    return true;
  }
  document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#f87171;font-family:sans-serif;">Acceso denegado.</div>';
  return false;
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  if (!checkAuth()) return;

  // Cargar último estado guardado antes de renderizar
  await loadSavedState();

  set("last-updated", new Date().toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
  }));

  renderCounters();
  renderDebtCards();
  renderMonthlyPlan();
  renderSubscriptions();
  renderTimeline();
  await loadHistory();
  bindEvents();
  SHEETS.syncPending();
}

// ── CARGAR ESTADO GUARDADO DESDE SHEETS ───────────────────
async function loadSavedState() {
  try {
    // 1. Intentar cargar desde sessionStorage primero (más rápido)
    var cached = sessionStorage.getItem("debt_state");
    if (cached) {
      applyState(JSON.parse(cached));
      // Luego actualizar en background desde Sheets
      loadFromSheets();
      return;
    }
    // 2. Si no hay cache, cargar directo desde Sheets
    await loadFromSheets();
  } catch(err) {
    console.warn("loadSavedState error:", err.message);
  }
}

async function loadFromSheets() {
  try {
    var result = await SHEETS.getHistory("monthly_snapshots");
    if (!result.success || !result.data || !result.data.length) return;

    // Tomar el snapshot más reciente
    var latest = result.data[result.data.length - 1];
    if (!latest) return;

    var state = {
      banorte:       parseFloat(latest.banorte)       || CONFIG.debts.banorte.balance,
      banamexNomina: parseFloat(latest.banamexNomina) || CONFIG.debts.banamexNomina.balance,
      banamexTDC:    parseFloat(latest.banamexTDC)    || CONFIG.debts.banamexTDC.balance,
      nu:            parseFloat(latest.nu)            || CONFIG.debts.nu.balance,
      savedAt:       latest.timestamp || "",
      notes:         latest.notes || ""
    };

    applyState(state);

    // Guardar en sessionStorage como cache
    sessionStorage.setItem("debt_state", JSON.stringify(state));

    // Actualizar timestamp con la fecha del último guardado
    if (state.savedAt) {
      var d = new Date(state.savedAt);
      set("last-updated", d.toLocaleDateString("es-MX", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit"
      }));
    }

    // Re-renderizar con los datos actualizados
    renderCounters();
    renderDebtCards();

  } catch(err) {
    console.warn("loadFromSheets error:", err.message);
  }
}

function applyState(state) {
  if (state.banorte       != null) CONFIG.debts.banorte.balance       = state.banorte;
  if (state.banamexNomina != null) CONFIG.debts.banamexNomina.balance = state.banamexNomina;
  if (state.banamexTDC    != null) CONFIG.debts.banamexTDC.balance    = state.banamexTDC;
  if (state.nu            != null) CONFIG.debts.nu.balance            = state.nu;
}

// ── COUNTERS ──────────────────────────────────────────────
function renderCounters() {
  const total = CALC.totalDebt();
  const startDebt = 443499;
  const pct = Math.min(100, Math.round(((startDebt - total) / startDebt) * 100));

  set("total-debt", fmt(total));
  set("days-to-target", CALC.daysTo(CONFIG.targetDate));
  set("days-to-pivote", CALC.daysTo(CONFIG.pivoteDate));
  set("monthly-surplus", fmt(CALC.surplusForDebt("2026-06")));
  set("buro-score", CONFIG.buro.currentScore);
  set("infonavit-balance", fmt(CONFIG.infonavit.currentBalance));
  set("debt-progress-pct", pct + "% liquidado");
  setStyle("debt-progress-fill", "width", pct + "%");
}

// ── DEBT CARDS ────────────────────────────────────────────
function renderDebtCards() {
  const c = document.getElementById("debt-cards");
  if (!c) return;
  c.innerHTML = "";

  Object.entries(CONFIG.debts).forEach(function(entry) {
    const key = entry[0], debt = entry[1];
    const interest = CALC.monthlyInterest(key);
    const isFloat = debt.type === "float";
    const sem = debt.balance === 0 ? "green" : debt.rate > 30 ? "red" : debt.rate > 15 ? "yellow" : "green";

    const card = document.createElement("div");
    card.className = "debt-card debt-card--" + sem;
    card.innerHTML =
      '<div class="debt-card__header">' +
        '<span class="debt-card__label">' + debt.label + '</span>' +
        '<span class="debt-card__dot debt-card__dot--' + sem + '"></span>' +
      '</div>' +
      '<div class="debt-card__balance" id="bal-' + key + '">' + (isFloat ? "~" : "") + fmt(debt.balance) + '</div>' +

      // Inline edit
      '<div class="debt-edit" id="edit-' + key + '" style="display:none">' +
        '<input class="debt-input" id="inp-' + key + '" type="number" value="' + debt.balance + '" min="0" placeholder="Nuevo saldo">' +
        '<input class="debt-input debt-input--note" id="note-' + key + '" type="text" placeholder="Nota (opcional)">' +
        '<div class="debt-edit__btns">' +
          '<button class="btn-save" data-key="' + key + '">Guardar</button>' +
          '<button class="btn-cancel" data-key="' + key + '">Cancelar</button>' +
        '</div>' +
      '</div>' +

      (debt.rate > 0 ? '<div class="debt-card__rate">' + debt.rate + '% anual · <span class="text-red">' + fmt(interest) + '/mes</span></div>' : '') +
      (debt.minPayment > 0 ? '<div class="debt-card__min">Mín: ' + fmt(debt.minPayment) + '</div>' : '') +
      (isFloat ? '<div class="debt-card__note">Float corriente</div>' : '') +
      '<button class="btn-edit" data-key="' + key + '">Editar saldo</button>';

    c.appendChild(card);
  });
}

// ── MONTHLY PLAN ──────────────────────────────────────────
var MONTHS = [
  {
    id:"apr", label:"Abril", emoji:"🔴", status:"urgent",
    income:[["Nómina neta",79988],["Hermana (15-Abr)",2500],["Hermana (fin-Abr)",2000]],
    expenses:[["Gastos fijos + variables",-45620],["TDC Banamex (liquidar)",-14892],["Banorte mínimo",-13544]],
    surplus:8534, balances:{banorte:250676,banamexNomina:152000,banamexTDC:0},
    tasks:[
      {hot:true, t:"Pagar TDC Banamex completa"},
      {hot:true, t:"Pagar mínimo Banorte antes del 14-Abr: $13,544"},
      {hot:true, t:"15-Abr: $2,500 hermana → Banamex Nómina"},
      {hot:true, t:"Pagar Nu antes del 4-May: $11,941"},
      {hot:false,t:"Abrir aclaración Mercado Pago (plazo: 25-Jun)"},
      {hot:false,t:"Confirmar PTU con RRHH · offcycle con manager"}
    ]
  },
  {
    id:"may", label:"Mayo", emoji:"🟣", status:"key",
    income:[["Nómina neta + vales",83388],["PTU estimado ⬆️",45000]],
    expenses:[["Gastos fijos + variables",-45620],["Banorte mínimo",-13544],["Nu corte 4-May",-11941]],
    surplus:57283, balances:{banorte:250676,banamexNomina:69000,banamexTDC:0},
    tasks:[
      {hot:true, t:"PTU → Banamex Nómina ese mismo día"},
      {hot:true, t:"Pagar $13,544 mínimo Banorte antes del 14-May"},
      {hot:false,t:"Llamar a Banamex: confirmar condiciones redisposición 30-Jun"},
      {hot:false,t:"Preguntar periodo de enfriamiento tras liquidar"}
    ]
  },
  {
    id:"jun", label:"Junio", emoji:"🔄", status:"pivot",
    income:[["Nómina + vales + offcycle 2.5%",86388],["Smability (1a parte)",30000]],
    expenses:[["Gastos fijos + variables",-45620],["Banorte mínimo",-13544]],
    surplus:57224, balances:{banorte:70000,banamexNomina:180000,banamexTDC:0},
    pivote:true,
    tasks:[
      {hot:true, t:"15-Jun: iniciar expediente hipotecario con broker"},
      {hot:true, t:"Semana 23-Jun: confirmar redisposición con Banamex"},
      {hot:true, t:"30-Jun paso 1: liquidar Banamex Nómina"},
      {hot:true, t:"30-Jun paso 2: redisponer $180k"},
      {hot:true, t:"30-Jun paso 3: SPEI $180k → Banorte"},
      {hot:false,t:"Si aclaración MP resuelta → aplicar antes del 30-Jun"}
    ]
  },
  {
    id:"jul", label:"Julio", emoji:"🟢", status:"good",
    income:[["Nómina + vales + offcycle",86388],["Smability (2a parte)",20000]],
    expenses:[["Gastos fijos + variables",-45620],["Cuota Banamex Nómina",-5500]],
    surplus:55268, balances:{banorte:15000,banamexNomina:188000,banamexTDC:0},
    tasks:[
      {hot:true, t:"Liquidar Banorte completo (~$15k)"},
      {hot:false,t:"Seguimiento expediente hipotecario"},
      {hot:false,t:"Amazon Prime termina este mes — no renovar"}
    ]
  },
  {
    id:"aug", label:"Agosto", emoji:"🟢", status:"good",
    income:[["Nómina + vales + offcycle",86388],["Smability (3a parte)",30000]],
    expenses:[["Gastos fijos + variables (sin Amazon)",-45545],["Cerrar Banorte (~$15k)",-15000]],
    surplus:55843, balances:{banorte:0,banamexNomina:118000,banamexTDC:0},
    tasks:[
      {hot:true, t:"Smability $30k: cerrar Banorte primero, resto a Banamex"},
      {hot:true, t:"30-Ago: 2a revisión buró — Banorte $0 · Score ~745"},
      {hot:false,t:"Seguimiento trámite hipotecario"}
    ]
  },
  {
    id:"sep", label:"Septiembre", emoji:"🟢", status:"good",
    income:[["Nómina + vales + offcycle",86388],["Apoyo familiar (30-Sep)",35000]],
    expenses:[["Gastos fijos + variables",-45545]],
    surplus:75843, balances:{banorte:0,banamexNomina:38000,banamexTDC:0},
    tasks:[
      {hot:true, t:"30-Sep: apoyo familiar → Banamex Nómina"},
      {hot:true, t:"Firmar escrituras hipoteca (inicio 1-Oct)"}
    ]
  },
  {
    id:"oct", label:"1-Oct 🏁", emoji:"🏁", status:"win",
    balances:{banorte:0,banamexNomina:0,banamexTDC:0}, tasks:[]
  }
];

function renderMonthlyPlan() {
  const c = document.getElementById("monthly-plan");
  if (!c) return;
  c.innerHTML = "";

  MONTHS.forEach(function(m) {
    var div = document.createElement("div");
    div.className = "month-block month-block--" + m.status;
    div.id = "month-" + m.id;

    var html =
      '<div class="month-block__header">' +
        '<div class="month-block__title">' + m.emoji + " " + m.label + '</div>' +
        '<div class="month-block__badges">' +
          badge(m.balances.banorte > 0 ? "red" : "green", "Banorte " + fmt(m.balances.banorte)) +
          badge(m.balances.banamexNomina > 0 ? "yellow" : "green", "BcoNóm " + fmt(m.balances.banamexNomina)) +
          badge("green", "TDC $0") +
        '</div>' +
      '</div>';

    if (m.income) {
      html += '<div class="month-block__section"><div class="month-section-title">↑ Entradas</div>';
      m.income.forEach(function(r) {
        html += '<div class="month-row"><span>' + r[0] + '</span><span class="text-green">+' + fmt(r[1]) + '</span></div>';
      });
      html += '</div>';
    }

    if (m.expenses) {
      html += '<div class="month-block__section"><div class="month-section-title">↓ Salidas</div>';
      m.expenses.forEach(function(r) {
        html += '<div class="month-row"><span>' + r[0] + '</span><span class="text-red">' + fmt(r[1]) + '</span></div>';
      });
      html += '</div>';
    }

    if (m.surplus) {
      html += '<div class="month-block__surplus"><span>Excedente para deuda</span><span class="text-purple">' + fmt(m.surplus) + '</span></div>';
    }

    if (m.pivote) {
      html += '<div class="month-block__pivote">🔄 30-Jun: Banamex $0 → Redisponer $180k → SPEI → Banorte</div>';
    }

    if (m.tasks && m.tasks.length) {
      html += '<div class="month-block__tasks">';
      m.tasks.forEach(function(t) {
        html += '<label class="task' + (t.hot ? " task--hot" : "") + '">' +
          '<input type="checkbox"><span>' + t.t + '</span></label>';
      });
      html += '</div>';
    }

    if (m.status === "win") {
      html += '<div class="month-block__win">🎯 Banorte $0 · Banamex $0 · Nu flujo · Hipoteca activa ✅</div>';
    }

    div.innerHTML = html;
    c.appendChild(div);
  });
}

// ── SUSCRIPCIONES ─────────────────────────────────────────
var SUBS = [
  {n:"AT&T Personal",         abr:1420, may:532,  aug:532,  note:"-$888 al terminar equipo ✅", biz:false},
  {n:"AT&T Smability/AireGPT",abr:279,  may:279,  aug:279,  note:"Gasto negocio",              biz:true},
  {n:"Apple (iCloud ×2)",     abr:218,  may:218,  aug:218,  note:"$169 + $49",                  biz:false},
  {n:"Claude (Anthropic)",    abr:373,  may:373,  aug:373,  note:"Trabajo/Smability",           biz:true},
  {n:"Google One",            abr:395,  may:395,  aug:395,  note:"⚠️ Revisar tier",             biz:false},
  {n:"AWS",                   abr:1800, may:1200, aug:1200, note:"Bajado May -$600 ✅",          biz:true},
  {n:"OpenAI (tokens)",       abr:50,   may:50,   aug:50,   note:"~$5 USD c/3 meses",           biz:true},
  {n:"AireGPT (Stripe)",      abr:49,   may:49,   aug:49,   note:"Esencial",                    biz:true},
  {n:"Amazon Prime",          abr:75,   may:75,   aug:0,    note:"Termina Jul ✅",               biz:false},
  {n:"Canva",                 abr:0,    may:0,    aug:0,    note:"Ya pagada ✅",                 biz:true},
];

function renderSubscriptions() {
  var tb = document.getElementById("subs-tbody");
  var tf = document.getElementById("subs-tfoot");
  if (!tb) return;
  tb.innerHTML = "";
  var ta=0, tm=0, tg=0;
  SUBS.forEach(function(s) {
    ta+=s.abr; tm+=s.may; tg+=s.aug;
    var tr = document.createElement("tr");
    if (s.biz) tr.className = "sub-row--biz";
    tr.innerHTML =
      "<td>" + s.n + "</td>" +
      "<td class='text-right" + (s.abr>500?" text-red":"") + "'>" + (s.abr>0?fmt(s.abr):"—") + "</td>" +
      "<td class='text-right" + (s.may<s.abr?" text-green":"") + "'>" + (s.may>0?fmt(s.may):"—") + "</td>" +
      "<td class='text-right" + (s.aug<s.may?" text-green":"") + "'>" + (s.aug>0?fmt(s.aug):"—") + "</td>" +
      "<td class='text-muted'>" + s.note + "</td>";
    tb.appendChild(tr);
  });
  if (tf) tf.innerHTML =
    "<td><strong>Total</strong></td>" +
    "<td class='text-right text-red'><strong>" + fmt(ta) + "</strong></td>" +
    "<td class='text-right text-yellow'><strong>" + fmt(tm) + "</strong></td>" +
    "<td class='text-right text-green'><strong>" + fmt(tg) + "</strong></td>" +
    "<td class='text-green text-muted'>-" + fmt(ta-tg) + " vs Abr</td>";
}

// ── TIMELINE ──────────────────────────────────────────────
function renderTimeline() {
  var events = [
    {d:"15-Jun", l:"Iniciar expediente hipotecario con broker",          s:"upcoming"},
    {d:"30-Jun", l:"PIVOTE — Banorte: $250k → $70k",                    s:"pivote"},
    {d:"Jul",    l:"Seguimiento + Banorte liquidándose (~$15k)",         s:"upcoming"},
    {d:"30-Ago", l:"2ª revisión buró — Score ~745 · Tasa blindada",     s:"critical"},
    {d:"Sep",    l:"Firma escrituras hipoteca",                          s:"upcoming"},
    {d:"1-Oct",  l:"🏁 Hipoteca activa · Deuda = $0",                   s:"win"},
  ];
  var c = document.getElementById("timeline");
  if (!c) return;
  c.innerHTML = events.map(function(e) {
    return '<div class="timeline-item timeline-item--' + e.s + '">' +
      '<div class="timeline-dot"></div>' +
      '<div class="timeline-content">' +
        '<div class="timeline-date">' + e.d + '</div>' +
        '<div class="timeline-label">' + e.l + '</div>' +
      '</div></div>';
  }).join("");
}

// ── HISTORIAL ─────────────────────────────────────────────
async function loadHistory() {
  var c = document.getElementById("history-log");
  if (!c) return;
  var result = await SHEETS.getHistory("audit_log");
  if (!result.success || !result.data || !result.data.length) {
    c.innerHTML = '<div class="text-muted">Sin historial aún. Los cambios aparecerán aquí.</div>';
    return;
  }
  c.innerHTML = result.data.slice(-10).reverse().map(function(r) {
    return '<div class="history-row">' +
      '<span class="history-date">' + (r.timestamp||"").split("T")[0] + '</span>' +
      '<span class="history-action">' + (r.action||"—") + '</span>' +
      '<span class="history-detail">' + (r.notes||"") + '</span>' +
    '</div>';
  }).join("");
}

// ── EVENTOS ───────────────────────────────────────────────
function bindEvents() {

  // Abrir edición inline
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-edit")) return;
    var key = e.target.dataset.key;
    document.getElementById("edit-" + key).style.display = "block";
    document.getElementById("bal-" + key).style.display = "none";
    e.target.style.display = "none";
    var inp = document.getElementById("inp-" + key);
    if (inp) { inp.focus(); inp.select(); }
  });

  // Cancelar
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-cancel")) return;
    closeEdit(e.target.dataset.key);
  });

  // Guardar con botón
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-save")) return;
    saveDebt(e.target.dataset.key);
  });

  // Guardar con Enter
  document.addEventListener("keydown", function(e) {
    if (e.key !== "Enter") return;
    if (!e.target.classList.contains("debt-input")) return;
    var key = e.target.id.replace("inp-","").replace("note-","");
    saveDebt(key);
  });

  // Revertir
  var btnRev = document.getElementById("btn-revert");
  if (btnRev) btnRev.addEventListener("click", async function() {
    if (!confirm("¿Revertir al snapshot anterior?")) return;
    var r = await SHEETS.revertLast();
    showToast(r.success ? "✅ Revertido" : "❌ Error al revertir");
    if (r.success) await loadHistory();
  });

  // Sync
  var btnSync = document.getElementById("btn-sync");
  if (btnSync) btnSync.addEventListener("click", async function() {
    var r = await SHEETS.syncPending();
    showToast("✅ Sync: " + r.synced + " · Pendientes: " + r.remaining);
  });

  // Escenarios
  var tp = document.getElementById("toggle-partner");
  if (tp) tp.addEventListener("change", function(e) {
    document.getElementById("partner-scenario").style.display = e.target.checked ? "block" : "none";
  });

  var ta = document.getElementById("toggle-airbnb");
  if (ta) ta.addEventListener("change", function(e) {
    document.getElementById("airbnb-scenario").style.display = e.target.checked ? "block" : "none";
  });
}

// ── HELPERS EDICIÓN ───────────────────────────────────────
function closeEdit(key) {
  document.getElementById("edit-" + key).style.display = "none";
  document.getElementById("bal-" + key).style.display = "block";
  var btn = document.querySelector(".btn-edit[data-key='" + key + "']");
  if (btn) btn.style.display = "block";
}

async function saveDebt(key) {
  var inp = document.getElementById("inp-" + key);
  var noteEl = document.getElementById("note-" + key);
  if (!inp) return;
  var newBal = parseFloat(inp.value);
  if (isNaN(newBal) || newBal < 0) { showToast("⚠️ Monto inválido"); return; }
  var notes = noteEl ? noteEl.value : "";
  var old = CONFIG.debts[key].balance;

  // Actualizar en memoria
  CONFIG.debts[key].balance = newBal;

  // Actualizar display inmediatamente
  var balEl = document.getElementById("bal-" + key);
  if (balEl) balEl.textContent = fmt(newBal);

  closeEdit(key);
  showToast("⏳ Guardando...");

  // Guardar en Sheets
  await SHEETS.updateDebt(key, newBal, key + ": $" + old + " → $" + newBal + (notes ? ". " + notes : ""));
  await SHEETS.saveSnapshot({ notes: "Actualización " + key + (notes ? ": " + notes : "") });

  // Invalidar cache de sessionStorage para que el próximo refresh cargue desde Sheets
  sessionStorage.removeItem("debt_state");

  // Guardar nuevo estado en sessionStorage
  var newState = {
    banorte:       CONFIG.debts.banorte.balance,
    banamexNomina: CONFIG.debts.banamexNomina.balance,
    banamexTDC:    CONFIG.debts.banamexTDC.balance,
    nu:            CONFIG.debts.nu.balance,
    savedAt:       new Date().toISOString(),
    notes:         notes
  };
  sessionStorage.setItem("debt_state", JSON.stringify(newState));

  renderCounters();
  renderDebtCards();

  var ts = new Date().toLocaleDateString("es-MX", {day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"});
  set("last-updated", ts);
  showToast("✅ " + CONFIG.debts[key].label + " actualizado");
}

// ── UTILIDADES ────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat("es-MX", {style:"currency",currency:"MXN",maximumFractionDigits:0}).format(n);
}
function set(id, val) { var el = document.getElementById(id); if (el) el.textContent = val; }
function setStyle(id, prop, val) { var el = document.getElementById(id); if (el) el.style[prop] = val; }
function badge(color, text) {
  return '<span class="badge badge--' + color + '">' + text + '</span>';
}
function showToast(msg) {
  var t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("toast--visible");
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.classList.remove("toast--visible"); }, 3000);
}

// ── START ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
