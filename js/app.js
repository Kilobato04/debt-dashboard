// ============================================================
// APP.JS — Lógica principal
// Depende de: config.js (CONFIG, CALC) · sheets.js (SHEETS)
// Orden: EI state → auth → init → load → render → events
// ============================================================

// ── EI STATE ──────────────────────────────────────────────
var EI = {
  items:  [],
  nextId: 1,

  totalPending: function () {
    return this.items
      .filter(function (i) { return i.status === "pendiente"; })
      .reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
  },

  fromArray: function (arr) {
    this.items  = arr || [];
    this.nextId = this.items.length
      ? Math.max.apply(null, this.items.map(function (i) { return i.id || 0; })) + 1
      : 1;
  }
};

// ── MONTH NOTES STATE ─────────────────────────────────────
var MONTH_NOTES = {};

// ── WATERFALL — proyección dinámica ───────────────────────
// Se genera en drawWaterfall() desde deuda actual + EI + surplus por mes
// No hay datos hardcodeados aquí.

// ── MONTHLY PLAN DATA ─────────────────────────────────────
// MONTHS_DEF — esqueleto estructural por mes
// · nomina/gastos: calculados en tiempo real desde CALC en renderMonthlyPlan()
// · extraExpenses: pagos extra de deuda específicos de ese mes (ej. corte Nu, pivote)
//   Estos son los únicos valores "especiales por mes" que no se pueden derivar de CALC
// · EI: inyectados dinámicamente desde EI.items via eiForMonth()
var MONTHS_DEF = [
  {
    id: "apr", label: "Abril", emoji: "🔴", status: "urgent", ym: "2026-04",
    extraExpenses: [["TDC Banamex (corte)", -14892]],  // corte especial de abril
    balances: { banorte: 250676, banamexNomina: 152000 }
  },
  {
    id: "may", label: "Mayo", emoji: "🟣", status: "key", ym: "2026-05",
    extraExpenses: [],
    balances: { banorte: 250676, banamexNomina: 69000 }
  },
  {
    id: "jun", label: "Junio", emoji: "🔄", status: "pivot", ym: "2026-06",
    extraExpenses: [],
    balances: { banorte: 70000, banamexNomina: 180000 },
    pivote: true
  },
  {
    id: "jul", label: "Julio", emoji: "🟢", status: "good", ym: "2026-07",
    extraExpenses: [["Cuota Banamex (ajuste)", -5500]],
    balances: { banorte: 15000, banamexNomina: 188000 }
  },
  {
    id: "aug", label: "Agosto", emoji: "🟢", status: "good", ym: "2026-08",
    extraExpenses: [["Cerrar Banorte", -15000]],
    balances: { banorte: 0, banamexNomina: 118000 }
  },
  {
    id: "sep", label: "Septiembre", emoji: "🟢", status: "good", ym: "2026-09",
    extraExpenses: [],
    balances: { banorte: 0, banamexNomina: 38000 }
  },
  {
    id: "oct", label: "1-Oct · META 🏁", emoji: "🏁", status: "win", ym: "2026-10",
    balances: { banorte: 0, banamexNomina: 0 }
  }
];

// ============================================================
// AUTH
// ============================================================
function checkAuth() {
  if (sessionStorage.getItem("debt_token") === CONFIG.appToken) return true;
  var input = prompt("🔐 Token de acceso:");
  if (input === CONFIG.appToken) {
    sessionStorage.setItem("debt_token", input);
    return true;
  }
  document.body.innerHTML = '<div class="auth-error">⛔ Acceso denegado.</div>';
  return false;
}

// ============================================================
// INIT
// ============================================================
async function init() {
  if (!checkAuth()) return;

  // Fecha en pantalla LCD
  var now = new Date();
  var MESES = ["ENE","FEB","MAR","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"];
  set("scr-date", now.getDate() + " " + MESES[now.getMonth()] + " " + now.getFullYear());

  showToast("⏳ Cargando datos...", 0);
  await Promise.all([
    loadDebtState(),
    loadExtraordinaryIncome(),
    loadMonthNotes(),
    loadConfigFromSheets()
  ]);
  hideToast();
  renderAll();
  bindAllEvents();
  drawWaterfall();
}

function renderAll() {
  renderCounters();
  renderDebtCards();
  renderBudget();
  renderSubscriptions();
  renderExtraordinaryIncome();
  renderMonthlyPlan();
  renderTimeline();
  drawWaterfall();        // recalcula proyección con datos actuales
  loadHistory();
  updateTimestamp();
}

// ============================================================
// WATERFALL CHART — proyección dinámica desde datos reales
// deuda(mes+1) = deuda(mes) - surplusForDebt(ym) - EI_alta_prob(ym)
// buildProjection() cachea los puntos en WF_PROJECTION para que
// renderMonthlyPlan() los use como balances dinámicos.
// ============================================================
var WF_PROJECTION = [];

function buildProjection() {
  var meses  = ["2026-04","2026-05","2026-06","2026-07","2026-08","2026-09","2026-10"];
  var labels = ["ABR","MAY","JUN","JUL","AGO","SEP","OCT"];
  var deuda  = CALC.totalDebt();
  var puntos = [];

  meses.forEach(function (ym, i) {
    puntos.push({ m: labels[i], ym: ym, debtStart: Math.max(0, Math.round(deuda)) });
    if (i < meses.length - 1) {
      var surplus = CALC.surplusForDebt(ym);
      var eiMes   = EI.items
        .filter(function (it) {
          var d    = normalizeDate(it.date);
          var prob = (it.prob || "").toLowerCase().trim();
          return d && d.substring(0,7) === ym && prob === "alta" && it.status === "pendiente";
        })
        .reduce(function (s, it) { return s + (parseFloat(it.amount)||0); }, 0);
      deuda = Math.max(0, deuda - surplus - eiMes);
    }
  });

  WF_PROJECTION = puntos;
  return puntos;
}

// Deuda proyectada al inicio de un mes (ym = "2026-04" etc.)
function projectedDebtForYM(ym) {
  var p = WF_PROJECTION.find(function (x) { return x.ym === ym; });
  return p ? p.debtStart : null;
}

function drawWaterfall() {
  var c = document.getElementById("wf-chart");
  if (!c) return;

  var puntos  = buildProjection();
  var maxDebt = puntos[0].debtStart || CONFIG.debtBaseline || 443499;
  var H = 80;
  c.innerHTML = "";

  puntos.forEach(function (d) {
    var barH = d.debtStart === 0
      ? 4 : Math.max(4, Math.round((d.debtStart / maxDebt) * H));
    var cls = d.debtStart === 0
      ? "wf-bar--zero"
      : d.debtStart > maxDebt * 0.6 ? "wf-bar--high"
      : d.debtStart > maxDebt * 0.3 ? "wf-bar--mid"
      : "wf-bar--low";
    var valTxt = d.debtStart === 0 ? "$0"
      : d.debtStart >= 1000 ? "$" + Math.round(d.debtStart/1000) + "k"
      : "$" + d.debtStart;

    var wrap = document.createElement("div");
    wrap.className = "wf-bar-wrap";
    wrap.innerHTML =
      '<div class="wf-val">' + valTxt + '</div>' +
      '<div class="wf-bar ' + cls + '" style="height:' + barH + 'px"></div>' +
      '<div class="wf-lbl">' + d.m + '</div>';
    c.appendChild(wrap);
  });
}

// ============================================================
// LOAD FUNCTIONS
// ============================================================
async function loadDebtState() {
  try {
    var cached = sessionStorage.getItem("debt_state");
    if (cached) applyDebtState(JSON.parse(cached));

    // Siempre refrescar desde Sheets en background
    var r = await SHEETS.getHistory("monthly_snapshots");
    if (!r.success || !r.data || !r.data.length) return;
    var latest = r.data[r.data.length - 1];
    if (!latest) return;

    var state = {
      banorte:       parseNum(latest.banorte,       CONFIG.debts.banorte.balance),
      banamexNomina: parseNum(latest.banamexNomina, CONFIG.debts.banamexNomina.balance),
      banamexTDC:    parseNum(latest.banamexTDC,    CONFIG.debts.banamexTDC.balance),
      nu:            parseNum(latest.nu,            CONFIG.debts.nu.balance),
      buroScore:     parseNum(latest.buroScore,     CONFIG.buro.score),
      savedAt:       latest.timestamp || ""
    };
    applyDebtState(state);
    if (state.buroScore) CONFIG.buro.score = state.buroScore;
    sessionStorage.setItem("debt_state", JSON.stringify(state));
  } catch (e) { console.warn("loadDebtState:", e.message); }
}

function applyDebtState(s) {
  if (s.banorte       != null) CONFIG.debts.banorte.balance       = s.banorte;
  if (s.banamexNomina != null) CONFIG.debts.banamexNomina.balance = s.banamexNomina;
  if (s.banamexTDC    != null) CONFIG.debts.banamexTDC.balance    = s.banamexTDC;
  if (s.nu            != null) CONFIG.debts.nu.balance            = s.nu;
}

async function loadExtraordinaryIncome() {
  try {
    // Cargar cache local primero para render rápido
    var cached = sessionStorage.getItem("debt_ei");
    if (cached) EI.fromArray(JSON.parse(cached).map(function(i){
      i.date = normalizeDate(i.date); return i;
    }));

    // Siempre refrescar desde Sheets (igual que loadDebtState)
    var r = await SHEETS.getHistory("extraordinary_income");
    if (r.success && r.data && r.data.length) {
      var items = r.data.map(function (row) {
        return {
          id:     parseInt(row.id)     || 0,
          desc:   row.desc   || "",
          amount: parseFloat(row.amount) || 0,
          date:   normalizeDate(row.date),
          target: row.target || "libre",
          status: row.status || "pendiente",
          prob:   row.prob   || "alta",
          notes:  row.notes  || ""
        };
      });
      var changed = JSON.stringify(items) !== JSON.stringify(EI.items);
      EI.fromArray(items);
      sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
      // Si Sheets trae datos distintos al cache, re-renderizar lo que depende de EI
      if (changed) {
        renderExtraordinaryIncome();
        renderMonthlyPlan();
        renderCounters();
        drawWaterfall();
      }
    } else if (!cached) {
      // Solo usar defaults si Sheets vacío Y sin cache
      EI.fromArray([
        // ── ABRIL ─────────────────────────────────────────────
        { id:1,  desc:"Hermana (1a quincena Abr)", amount:2500,  date:"2026-04-15", target:"libre",         status:"pendiente", prob:"alta",  notes:"Apoyo fijo mensual" },
        { id:2,  desc:"Hermana (fin Abr)",         amount:2000,  date:"2026-04-30", target:"libre",         status:"pendiente", prob:"alta",  notes:"Apoyo fijo mensual" },
        // ── MAYO ──────────────────────────────────────────────
        { id:3,  desc:"PTU Arcadis",               amount:45000, date:"2026-05-30", target:"banamexNomina", status:"pendiente", prob:"alta",  notes:"Puede ser mayor" },
        // ── JUNIO ─────────────────────────────────────────────
        { id:4,  desc:"Smability (1a)",            amount:30000, date:"2026-06-15", target:"banamexNomina", status:"pendiente", prob:"alta",  notes:"" },
        { id:5,  desc:"Apoyo pareja (Jun)",        amount:40000, date:"2026-06-30", target:"banorte",       status:"pendiente", prob:"media", notes:"Parte del apoyo total acordado" },
        // ── JULIO ─────────────────────────────────────────────
        { id:6,  desc:"Smability (2a)",            amount:20000, date:"2026-07-15", target:"banorte",       status:"pendiente", prob:"alta",  notes:"" },
        { id:7,  desc:"Airbnb Mundial",            amount:30000, date:"2026-07-01", target:"libre",         status:"pendiente", prob:"baja",  notes:"~20 noches. Decisión con pareja" },
        // ── AGOSTO ────────────────────────────────────────────
        { id:8,  desc:"Smability (3a)",            amount:30000, date:"2026-08-15", target:"banorte",       status:"pendiente", prob:"alta",  notes:"" },
        // ── SEPTIEMBRE ────────────────────────────────────────
        { id:9,  desc:"Apoyo familiar",            amount:35000, date:"2026-09-30", target:"banamexNomina", status:"pendiente", prob:"alta",  notes:"" },
      ]);
      sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
    }
  } catch (e) { console.warn("loadEI:", e.message); }
}

async function loadMonthNotes() {
  try {
    var cached = sessionStorage.getItem("debt_month_notes");
    if (cached) { MONTH_NOTES = JSON.parse(cached); return; }

    var r = await SHEETS.getHistory("month_notes");
    if (r.success && r.data && r.data.length) {
      r.data.forEach(function (row) { MONTH_NOTES[row.monthId] = row.note || ""; });
      sessionStorage.setItem("debt_month_notes", JSON.stringify(MONTH_NOTES));
    }
  } catch (e) { console.warn("loadMonthNotes:", e.message); }
}

async function loadConfigFromSheets() {
  try {
    // 1. Cache local primero → render rápido con últimos valores guardados
    var cached = sessionStorage.getItem("debt_user_config");
    if (cached) {
      applyUserConfig(JSON.parse(cached));
    }

    // 2. Refrescar desde Sheets en background
    var r = await SHEETS.getHistory("user_config");
    if (!r.success || !r.data || !r.data.length) return;

    // Construir objeto plano para cache
    var configCache = {};
    r.data.forEach(function (row) {
      try { configCache[row.section] = JSON.parse(row.payload); } catch (_) {}
    });

    applyUserConfig(configCache);
    sessionStorage.setItem("debt_user_config", JSON.stringify(configCache));
  } catch (e) { console.warn("loadConfig:", e.message); }
}

// Aplica un objeto {section: payload} a CONFIG
function applyUserConfig(cfg) {
  if (!cfg) return;
  try {
    if (cfg.fixedExpenses)    CONFIG.fixedExpenses    = cfg.fixedExpenses;
    if (cfg.variableExpenses) CONFIG.variableExpenses = cfg.variableExpenses;
    if (cfg.subscriptions)    CONFIG.subscriptions    = cfg.subscriptions;
    if (cfg.income)           Object.assign(CONFIG.income, cfg.income);
    if (cfg.extraExpenses) {
      // Sobreescribir extraExpenses de cada mes desde Sheets
      cfg.extraExpenses.forEach(function (row) {
        var m = MONTHS_DEF.find(function (x) { return x.id === row.monthId; });
        if (m) m.extraExpenses = row.items || [];
      });
    }
    if (cfg.debtMeta) {
      Object.keys(cfg.debtMeta).forEach(function (k) {
        if (CONFIG.debts[k]) Object.assign(CONFIG.debts[k], cfg.debtMeta[k]);
      });
    }
  } catch (_) {}
}

// ============================================================
// SAVE
// ============================================================
async function saveAll(notes) {
  showSavingIndicator(true);
  var r = await SHEETS.save(notes || "");
  showSavingIndicator(false, r.success);
  updateTimestamp();
}

function showSavingIndicator(saving, success) {
  var el  = document.getElementById("save-status");
  var tag = document.getElementById("save-tag");

  if (saving) {
    if (el)  { el.textContent = "⏳ Guardando..."; el.className = "save-status save-status--saving"; }
    if (tag) { tag.textContent = "⏳ GUARDANDO EN GOOGLE SHEETS..."; tag.style.color = "var(--cy)"; }
  } else if (success) {
    var now = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    if (el)  { el.textContent = "✅ Guardado en Google Sheets"; el.className = "save-status save-status--ok"; }
    if (tag) { tag.textContent = "✓ GUARDADO · " + now; tag.style.color = "var(--cg)"; }
    setTimeout(function () {
      if (el) { el.textContent = ""; el.className = "save-status"; }
    }, 4000);
  } else {
    if (el)  { el.textContent = "⚠️ Sin conexión — datos locales"; el.className = "save-status save-status--warn"; }
    if (tag) { tag.textContent = "⚠ SIN CONEXIÓN · DATOS LOCALES"; tag.style.color = "var(--cr)"; }
  }
}

function updateTimestamp() {
  var cached = sessionStorage.getItem("debt_state");
  if (cached) {
    var s = JSON.parse(cached);
    if (s.savedAt) {
      set("last-updated", new Date(s.savedAt).toLocaleDateString("es-MX",
        { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }));
      return;
    }
  }
  set("last-updated", new Date().toLocaleDateString("es-MX",
    { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }));
}

// ============================================================
// RENDER — COUNTERS (pantalla LCD)
// ============================================================
function renderCounters() {
  var total   = CALC.totalDebt();
  var surplus = CALC.surplusForDebt();
  var pct     = CALC.pctPaid();
  var income  = CALC.monthlyIncome();
  var mins    = CALC.totalMinPayments();

  set("total-debt",       fmt(total));
  set("scr-banorte",      fmt(CONFIG.debts.banorte.balance));
  set("scr-nomina",       fmt(CONFIG.debts.banamexNomina.balance));
  set("monthly-surplus",  fmt(surplus));
  set("buro-score",       CONFIG.buro.score);
  set("days-to-target",   CALC.daysTo(CONFIG.targetDate));
  set("days-to-pivote",   CALC.daysTo(CONFIG.pivoteDate));
  set("ei-total-counter", fmt(EI.totalPending()));
  set("debt-progress-pct", pct + "% LIQUIDADO ▸ META $0 · 01.10.2026");
  setStyle("debt-progress-fill", "width", pct + "%");

  // Ratios de salud financiera
  var burden  = Math.round((mins / income) * 100);
  var surpPct = Math.round((surplus / income) * 100);
  set("ratio-debt-income", (total / income).toFixed(1) + "x");
  set("ratio-burden",      burden + "%");
  set("ratio-surplus",     surpPct + "%");
  setHiClass("hi-ratio",   total / income > 5  ? "hi--r" : total / income > 3 ? "hi--y" : "hi--g");
  setHiClass("hi-burden",  burden > 35          ? "hi--r" : burden > 25      ? "hi--y" : "hi--g");
  setHiClass("hi-surplus", surpPct < 10         ? "hi--r" : surpPct < 20     ? "hi--y" : "hi--g");

  checkDueDates();
}

function setHiClass(id, cls) {
  var el = document.getElementById(id);
  if (el) el.className = "hi " + cls;
}

function checkDueDates() {
  Object.entries(CONFIG.debts).forEach(function (entry) {
    var key = entry[0], debt = entry[1];
    if (!debt.dueDate) return;
    var days = CALC.daysTo(debt.dueDate);
    var el   = document.getElementById("due-alert-" + key);
    if (!el) return;
    el.style.display = (days <= 7 && days >= 0) ? "block" : "none";
    if (days <= 7) el.textContent = "⚠️ Vence en " + days + " días";
  });
}

// ============================================================
// RENDER — DEBT CARDS (panel Saldos)
// ============================================================
function renderDebtCards() {
  var c = document.getElementById("debt-cards");
  if (!c) return;
  c.innerHTML = "";

  Object.entries(CONFIG.debts).forEach(function (entry) {
    var key = entry[0], d = entry[1];
    var interest = CALC.monthlyInterest(key);
    var isFloat  = d.type === "float";
    var colorCls = d.balance === 0 ? "g" : d.rate > 30 ? "r" : d.rate > 15 ? "y" : "g";

    var wrap = document.createElement("div");
    wrap.style.cssText = "padding:.35rem 0;border-bottom:1px solid rgba(74,77,50,.2);";
    wrap.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:baseline;">' +
        '<div class="drow__lbl">' + d.label +
          '<span>' + (d.rate > 0 ? d.rate + '% anual' : 'Sin interés') +
            (d.dueDate ? ' · vence ' + fmtDate(d.dueDate) : '') +
          '</span>' +
        '</div>' +
        '<span class="drow__val drow__val--' + colorCls + '" id="bal-' + key + '">' +
          (isFloat ? "~" : "") + fmt(d.balance) +
        '</span>' +
      '</div>' +
      '<div id="due-alert-' + key + '" class="debt-card__due-alert" style="display:none;"></div>' +
      (d.rate > 0 ? '<div class="debt-card__rate">Interés estimado: <span class="text-red">' + fmt(interest) + '/mes</span></div>' : '') +
      '<div class="debt-card__min">Pago mínimo: <span id="min-display-' + key + '">' + fmt(d.minPayment) + '</span></div>' +
      (isFloat ? '<div class="debt-card__note">Float — se mueve mensual</div>' : '') +
      '<button class="btn-edit" data-key="' + key + '" style="margin-top:.3rem;">✏ Editar</button>' +

      // Edit inline
      '<div class="debt-edit" id="edit-' + key + '" style="display:none;">' +
        '<label class="debt-edit__label">Saldo actual</label>' +
        '<input class="debt-input" id="inp-' + key + '" type="number" value="' + d.balance + '" min="0">' +
        '<label class="debt-edit__label">Pago mínimo</label>' +
        '<input class="debt-input" id="min-' + key + '" type="number" value="' + d.minPayment + '" min="0">' +
        '<label class="debt-edit__label">Fecha límite pago</label>' +
        '<input class="debt-input" id="due-' + key + '" type="date" value="' + (d.dueDate || "") + '">' +
        '<label class="debt-edit__label">Nota (opcional)</label>' +
        '<input class="debt-input" id="note-' + key + '" type="text" placeholder="Nota...">' +
        '<div class="debt-edit__btns">' +
          '<button class="btn-save" data-key="' + key + '">Guardar</button>' +
          '<button class="btn-cancel" data-key="' + key + '">Cancelar</button>' +
        '</div>' +
      '</div>';

    c.appendChild(wrap);
  });
}

// ============================================================
// RENDER — BUDGET (panel Budget)
// ============================================================
function renderBudget() {
  var ym       = currentYM();
  var income   = CALC.monthlyIncome(ym);
  var fixed    = CALC.totalFixed();
  var variable = CALC.totalVariable();
  var mins     = CALC.totalMinPayments();
  var surplus  = income - fixed - variable - mins;

  // Tablas editables
  renderBudgetTable("income-body", [
    { id: "nomina", label: "Nómina neta mensual", amount: ym >= "2026-06" ? CONFIG.income.nomina : CONFIG.income.nominaPreOffcycle },
    { id: "vales",  label: "Vales de despensa",   amount: CONFIG.income.vales },
    { id: "otros",  label: "Otros ingresos",      amount: CONFIG.income.otros || 0 }
  ], saveBudgetIncome);

  renderBudgetTable("fixed-expenses-body",    CONFIG.fixedExpenses,    saveBudgetFixed);
  renderBudgetTable("variable-expenses-body", CONFIG.variableExpenses, saveBudgetVariable);

  // Mínimos (readonly)
  var minsBody = document.getElementById("mins-body");
  if (minsBody) {
    minsBody.innerHTML = Object.entries(CONFIG.debts)
      .filter(function (e) { return (e[1].minPayment || 0) > 0; })
      .map(function (e) {
        return '<tr>' +
          '<td style="font-size:.65rem;color:#7a8a50;">' + e[1].label + ' (mín)</td>' +
          '<td style="text-align:right;font-family:var(--lcd);font-size:.85rem;color:var(--cy);">' + fmt(e[1].minPayment) + '</td>' +
          '<td></td></tr>';
      }).join("");
  }

  // Chips
  set("budget-total-income",   fmt(income));
  set("budget-total-fixed",    fmt(fixed));
  set("budget-total-variable", fmt(variable));
  set("budget-total-mins",     fmt(mins));

  // Balance
  set("bal-income",   "+" + fmt(income));
  set("bal-fixed",    "-" + fmt(fixed));
  set("bal-variable", "-" + fmt(variable));
  set("bal-mins",     "-" + fmt(mins));

  var balEl  = document.getElementById("budget-surplus");
  var balRow = document.getElementById("bal-result-row");
  if (balEl) {
    balEl.textContent = fmt(Math.abs(surplus));
    balEl.className   = surplus >= 0 ? "text-purple" : "text-red";
  }
  if (balRow) {
    var lbl = balRow.querySelector("span");
    if (lbl) lbl.textContent = surplus >= 0
      ? "💜 Excedente para abono extra"
      : "🔴 Gap — necesitas " + fmt(Math.abs(surplus)) + " adicionales";
    balRow.className = surplus >= 0 ? "surplus-row" : "gap-row";
  }
  set("monthly-surplus", fmt(surplus));
}

function renderBudgetTable(tbodyId, items, saveCallback) {
  var tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.innerHTML = "";
  items.forEach(function (item) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input class="budget-input budget-input--label" data-id="' + item.id + '" data-field="label" value="' + escHtml(item.label || "") + '"></td>' +
      '<td><input class="budget-input budget-input--amount" data-id="' + item.id + '" data-field="amount" type="number" min="0" value="' + (item.amount || 0) + '"></td>' +
      '<td><button class="budget-save" data-id="' + item.id + '">✓</button></td>';
    tb.appendChild(tr);
    tr.querySelector(".budget-save").addEventListener("click", function () {
      var lEl = tr.querySelector('[data-field="label"]');
      var aEl = tr.querySelector('[data-field="amount"]');
      var idx = items.findIndex(function (i) { return i.id === item.id; });
      if (idx > -1) {
        if (lEl) items[idx].label  = lEl.value;
        if (aEl) items[idx].amount = parseFloat(aEl.value) || 0;
      }
      saveCallback(items);
    });
  });
}

async function saveBudgetFixed(items) {
  CONFIG.fixedExpenses = items;
  persistUserConfigCache("fixedExpenses", items);
  await SHEETS.saveConfig("fixedExpenses", JSON.stringify(items), "Gastos fijos actualizados");
  await saveAll("Gastos fijos actualizados");
  renderBudget(); renderCounters();
}
async function saveBudgetVariable(items) {
  CONFIG.variableExpenses = items;
  persistUserConfigCache("variableExpenses", items);
  await SHEETS.saveConfig("variableExpenses", JSON.stringify(items), "Gastos variables actualizados");
  await saveAll("Gastos variables actualizados");
  renderBudget(); renderCounters();
}
async function saveBudgetIncome(items) {
  items.forEach(function (i) {
    if (i.id === "nomina") {
      CONFIG.income.nomina            = i.amount;
      CONFIG.income.nominaPreOffcycle = i.amount;
    }
    if (i.id === "vales") CONFIG.income.vales = i.amount;
    if (i.id === "otros") CONFIG.income.otros = i.amount;
  });
  // Persistir en sessionStorage inmediatamente — independiente de Sheets
  persistUserConfigCache("income", CONFIG.income);
  await SHEETS.saveConfig("income", JSON.stringify(CONFIG.income), "Ingresos actualizados");
  await saveAll("Ingresos actualizados");
  renderBudget(); renderCounters(); renderMonthlyPlan();
}

// ── Helper: actualiza una sección del cache user_config ──────
function persistUserConfigCache(section, value) {
  try {
    var cached = sessionStorage.getItem("debt_user_config");
    var cfg    = cached ? JSON.parse(cached) : {};
    cfg[section] = value;
    sessionStorage.setItem("debt_user_config", JSON.stringify(cfg));
  } catch (_) {}
}

// ============================================================
// RENDER — SUBSCRIPTIONS
// ============================================================
function renderSubscriptions() {
  var tb = document.getElementById("subs-tbody");
  var tf = document.getElementById("subs-tfoot");
  if (!tb) return;
  tb.innerHTML = "";
  var tAbr = 0, tCur = 0;

  CONFIG.subscriptions.forEach(function (s) {
    tAbr += s.abr || 0;
    tCur += s.current || 0;
    var tr = document.createElement("tr");
    if (s.biz) tr.className = "sub-row--biz";
    tr.innerHTML =
      '<td><input class="budget-input budget-input--label" data-id="' + s.id + '" value="' + escHtml(s.label || "") + '"></td>' +
      '<td><input class="budget-input budget-input--amount" data-id="' + s.id + '" data-field="abr" type="number" min="0" value="' + (s.abr || 0) + '"></td>' +
      '<td><input class="budget-input budget-input--amount" data-id="' + s.id + '" data-field="current" type="number" min="0" value="' + (s.current || 0) + '"></td>' +
      '<td><button class="budget-save" data-id="' + s.id + '">✓</button></td>';
    tb.appendChild(tr);
    tr.querySelector(".budget-save").addEventListener("click", function () {
      var idx = CONFIG.subscriptions.findIndex(function (i) { return i.id === s.id; });
      if (idx > -1) {
        var lbl = tr.querySelector('[data-id="' + s.id + '"]:not([data-field])');
        var aEl = tr.querySelector('[data-field="abr"]');
        var cEl = tr.querySelector('[data-field="current"]');
        if (lbl) CONFIG.subscriptions[idx].label   = lbl.value;
        if (aEl) CONFIG.subscriptions[idx].abr     = parseFloat(aEl.value) || 0;
        if (cEl) CONFIG.subscriptions[idx].current = parseFloat(cEl.value) || 0;
      }
      saveSubs();
    });
  });

  if (tf) tf.innerHTML =
    '<td><strong>Total</strong></td>' +
    '<td style="text-align:right;font-family:var(--lcd);color:var(--cr);"><strong>' + fmt(tAbr) + '</strong></td>' +
    '<td style="text-align:right;font-family:var(--lcd);color:var(--cy);"><strong>' + fmt(tCur) + '</strong></td>' +
    '<td style="font-size:.58rem;color:var(--cg);">-' + fmt(tAbr - tCur) + '</td>';
}

async function saveSubs() {
  await SHEETS.saveConfig("subscriptions", JSON.stringify(CONFIG.subscriptions), "Suscripciones actualizadas");
  await saveAll("Suscripciones actualizadas");
  renderSubscriptions();
  showToast("✓ Suscripciones guardadas");
}

// ============================================================
// RENDER — EXTRAORDINARY INCOME (panel Extras)
// ============================================================
function renderExtraordinaryIncome() {
  var c = document.getElementById("ei-container");
  if (!c) return;

  var probColors   = { alta: "green", media: "yellow", baja: "red" };
  var targetLabels = { banorte: "Banorte", banamexNomina: "Bco Nómina", libre: "Libre" };
  var statusLabels = { pendiente: "⏳ Pendiente", recibido: "✅ Recibido" };

  var html =
    '<div class="ei-header">' +
      '<div class="ei-total">' +
        '<span class="text-muted" style="font-size:.6rem;text-transform:uppercase;letter-spacing:.05em;">Total potencial pendiente</span>' +
        '<span class="text-green" style="font-family:var(--lcd);font-size:1.1rem;" id="ei-total-counter">' + fmt(EI.totalPending()) + '</span>' +
      '</div>' +
      '<button class="btn--primary" id="btn-ei-add">+ Agregar</button>' +
    '</div>' +
    '<div class="ei-form" id="ei-form-new" style="display:none;">' + eiFormHTML(null) + '</div>' +
    '<div class="ei-list">';

  if (!EI.items.length) {
    html += '<div class="text-muted" style="padding:.75rem 0;font-size:.72rem;">Sin ingresos registrados.</div>';
  } else {
    EI.items.forEach(function (item) {
      var pc   = probColors[item.prob] || "green";
      var done = item.status === "recibido";
      html +=
        '<div class="ei-row' + (done ? " ei-row--done" : "") + '" id="ei-row-' + item.id + '">' +
          '<div class="ei-row__view" id="ei-view-' + item.id + '">' +
            '<div class="ei-row__left">' +
              '<div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;">' +
                badge(pc, item.prob.toUpperCase()) +
                '<span class="ei-row__desc">' + escHtml(item.desc || "—") + '</span>' +
              '</div>' +
              (item.notes ? '<span class="ei-row__note">' + escHtml(item.notes) + '</span>' : '') +
            '</div>' +
            '<div class="ei-row__right">' +
              '<span class="ei-row__amount ' + (done ? "text-muted" : pc === "red" ? "text-red" : pc === "yellow" ? "text-yellow" : "text-green") + '">' + fmt(item.amount) + '</span>' +
              '<span class="ei-row__date">' + fmtDate(item.date) + '</span>' +
              badge(item.target === "banorte" ? "red" : item.target === "banamexNomina" ? "yellow" : "gray", targetLabels[item.target] || item.target) +
              '<span class="ei-row__status">' + (statusLabels[item.status] || item.status) + '</span>' +
              '<div style="display:flex;gap:.25rem;margin-top:.15rem;">' +
                '<button class="ei-btn-edit" data-id="' + item.id + '">✏</button>' +
                '<button class="ei-btn-delete" data-id="' + item.id + '">✕</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ei-row__edit" id="ei-edit-' + item.id + '" style="display:none;"><div class="ei-form">' + eiFormHTML(item) + '</div></div>' +
        '</div>';
    });
  }
  html += '</div>';
  c.innerHTML = html;
  bindEIEvents();
}

function eiFormHTML(item) {
  var id = item ? item.id : "new";
  return (
    '<div class="ei-form__grid">' +
      '<input class="debt-input" id="ei-desc-' + id + '" type="text" placeholder="Descripción" value="' + (item ? escHtml(item.desc || "") : "") + '"/>' +
      '<input class="debt-input" id="ei-amount-' + id + '" type="number" placeholder="Monto" min="0" value="' + (item ? item.amount : "") + '"/>' +
      '<input class="debt-input" id="ei-date-' + id + '" type="date" value="' + (item ? item.date : "") + '"/>' +
      '<select class="debt-input" id="ei-target-' + id + '">' +
        opt("banamexNomina", "→ Bco Nómina", item && item.target) +
        opt("banorte",       "→ Banorte",    item && item.target) +
        opt("libre",         "→ Libre",      item && item.target) +
      '</select>' +
      '<select class="debt-input" id="ei-prob-' + id + '">' +
        opt("alta",  "🟢 Alta",  item && item.prob) +
        opt("media", "🟡 Media", item && item.prob) +
        opt("baja",  "🔴 Baja",  item && item.prob) +
      '</select>' +
      '<select class="debt-input" id="ei-status-' + id + '">' +
        opt("pendiente", "⏳ Pendiente", item && item.status) +
        opt("recibido",  "✅ Recibido",  item && item.status) +
      '</select>' +
    '</div>' +
    '<input class="debt-input" id="ei-notes-' + id + '" type="text" placeholder="Notas (opcional)" style="margin-top:.35rem;" value="' + (item ? escHtml(item.notes || "") : "") + '"/>' +
    '<div class="ei-form__actions">' +
      '<button class="btn-save ei-save" data-id="' + id + '">Guardar</button>' +
      '<button class="btn-cancel ei-cancel" data-id="' + id + '">Cancelar</button>' +
    '</div>'
  );
}

function bindEIEvents() {
  var btnAdd = document.getElementById("btn-ei-add");
  if (btnAdd) {
    var clone = btnAdd.cloneNode(true);
    btnAdd.replaceWith(clone);
    clone.addEventListener("click", function () {
      var f = document.getElementById("ei-form-new");
      if (f) f.style.display = f.style.display === "none" ? "block" : "none";
    });
  }
  document.querySelectorAll(".ei-btn-edit").forEach(function (btn) {
    btn.addEventListener("click", function () { hide("ei-view-" + this.dataset.id); show("ei-edit-" + this.dataset.id); });
  });
  document.querySelectorAll(".ei-btn-delete").forEach(function (btn) {
    btn.addEventListener("click", function () { deleteEI(this.dataset.id); });
  });
  document.querySelectorAll(".ei-save").forEach(function (btn) {
    btn.addEventListener("click", function () { saveEI(this.dataset.id); });
  });
  document.querySelectorAll(".ei-cancel").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = this.dataset.id;
      if (id === "new") hide("ei-form-new");
      else { show("ei-view-" + id); hide("ei-edit-" + id); }
    });
  });
}

async function saveEI(id) {
  var isNew  = id === "new";
  var desc   = val("ei-desc-" + id);
  var amount = parseFloat(val("ei-amount-" + id));
  var date   = val("ei-date-" + id);
  var target = val("ei-target-" + id);
  var prob   = val("ei-prob-" + id);
  var status = val("ei-status-" + id);
  var notes  = val("ei-notes-" + id);

  if (!desc || isNaN(amount) || amount < 0) { showToast("⚠️ Completa descripción y monto"); return; }

  if (isNew) {
    EI.items.push({ id: EI.nextId++, desc, amount, date, target, prob, status, notes });
  } else {
    var idx = EI.items.findIndex(function (i) { return i.id === parseInt(id); });
    if (idx > -1) EI.items[idx] = { id: parseInt(id), desc, amount, date, target, prob, status, notes };
  }
  sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  await SHEETS.saveExtraordinaryIncome(EI.items);
  await saveAll("EI actualizado: " + desc);
  renderExtraordinaryIncome();
  renderCounters();
  showToast("✓ Ingreso guardado");
}

async function deleteEI(id) {
  if (!confirm("¿Eliminar este ingreso?")) return;
  EI.items = EI.items.filter(function (i) { return i.id !== parseInt(id); });
  sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  await SHEETS.saveExtraordinaryIncome(EI.items);
  await saveAll("EI eliminado");
  renderExtraordinaryIncome();
  renderCounters();
}

// ============================================================
// RENDER — MONTHLY PLAN (panel Meses)
// ── HELPER: normaliza fecha a string YYYY-MM-DD ───────────
function normalizeDate(d) {
  if (!d) return "";

  // Date object JS nativo
  if (d instanceof Date) return d.toISOString().substring(0, 10);

  var s = String(d).trim();
  if (!s || s === "0") return "";

  // Número puro — puede ser serial Sheets o timestamp Unix
  if (/^\d+$/.test(s)) {
    var n = parseInt(s);
    // Serial Google Sheets: días desde 30-Dic-1899 (rango 2009-2036 ≈ 40000-55000)
    if (n > 39999 && n < 55000) {
      var epoch = new Date(1899, 11, 30);
      epoch.setDate(epoch.getDate() + n);
      return epoch.toISOString().substring(0, 10);
    }
    // Timestamp Unix ms (13 dígitos)
    if (n > 1e12) return new Date(n).toISOString().substring(0, 10);
  }

  // "DD/MM/YYYY" — locale es-MX de Sheets
  var mxMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mxMatch) return mxMatch[3] + "-" + mxMatch[2].padStart(2,"0") + "-" + mxMatch[1].padStart(2,"0");

  // Cualquier formato parseable por JS ("Apr 24 2026", "April 24, 2026", etc.)
  var parsed = Date.parse(s);
  if (!isNaN(parsed)) return new Date(parsed).toISOString().substring(0, 10);

  // Ya es YYYY-MM-DD
  return s.substring(0, 10);
}

// ── HELPER: EI del mes filtrado por ym ────────────────────
// Incluye alta+media prob — baja se omite del cashflow
function eiForMonth(ym) {
  return EI.items.filter(function (i) {
    var d    = normalizeDate(i.date);
    var prob = (i.prob || "").toLowerCase().trim();
    return d && d.substring(0, 7) === ym && prob !== "baja";
  });
}

// ============================================================
function renderMonthlyPlan() {
  var c = document.getElementById("monthly-plan");
  if (!c) return;
  c.innerHTML = "";

  MONTHS_DEF.forEach(function (m) {
    var div = document.createElement("div");
    div.className = "month-block month-block--" + m.status;
    div.id        = "month-" + m.id;
    var savedNote = MONTH_NOTES[m.id] || "";

    // ── Entradas desde CALC + EI ─────────────────────────────
    var nomina    = CALC.monthlyIncome(m.ym);           // nómina real del mes
    var eiItems   = m.ym ? eiForMonth(m.ym) : [];
    var eiTotal   = eiItems.reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);

    // ── Salidas desde CALC + mínimos reales + extras del mes ─
    var fixed     = CALC.totalFixed();
    var variable  = CALC.totalVariable();
    var mins      = CALC.totalMinPayments();
    var extraExp  = (m.extraExpenses || []).reduce(function (s, r) { return s + (r[1] || 0); }, 0);
    var totalOut  = fixed + variable + mins + extraExp;  // todo negativo

    // ── Surplus real ─────────────────────────────────────────
    var surplus   = nomina + eiTotal - totalOut;

    // Balances proyectados dinámicamente desde buildProjection()
    var proyDeuda = projectedDebtForYM(m.ym);
    // Si hay proyección disponible, usarla; si no, usar balances del plan como referencia
    var balBanorte = (proyDeuda !== null)
      ? Math.max(0, Math.round(Math.min(proyDeuda, CONFIG.debts.banorte.balance)))
      : m.balances.banorte;
    var balNomina  = (proyDeuda !== null)
      ? Math.max(0, Math.round(Math.min(proyDeuda, CONFIG.debts.banamexNomina.balance)))
      : m.balances.banamexNomina;

    var html =
      '<div class="month-block__header">' +
        '<div class="month-block__title">' + m.emoji + " " + m.label + '</div>' +
        '<div class="month-block__badges">' +
          badge(balBanorte > 0 ? "red"    : "green", "BNRT " + fmtK(balBanorte)) +
          badge(balNomina  > 0 ? "yellow" : "green", "NÓM "  + fmtK(balNomina)) +
        '</div>' +
      '</div>';

    // ── Panel entradas ───────────────────────────────────────
    if (m.ym) {
      html += '<div class="month-block__section"><div class="month-section-title">↑ Entradas</div>';

      // Nómina desde CALC
      var nominaLabel = m.ym >= "2026-06" ? "Nómina + offcycle + vales" : m.ym >= "2026-05" ? "Nómina + vales" : "Nómina neta";
      html += '<div class="month-row"><span>' + nominaLabel + '</span><span class="text-green">+' + fmt(nomina) + '</span></div>';

      // EI del mes — dinámico, cada item con indicador de prob y estado
      eiItems.forEach(function (i) {
        var isMed   = i.prob === "media";
        var isDone  = i.status === "recibido";
        var valCls  = isDone ? "text-muted" : isMed ? "text-yellow" : "text-green";
        var icon    = isDone ? "✅" : isMed ? "◐" : "★";
        html += '<div class="month-row">' +
          '<span style="color:' + (isMed ? 'var(--cy)' : 'var(--cg)') + '">' + icon + ' ' + escHtml(i.desc) + '</span>' +
          '<span class="' + valCls + '">+' + fmt(i.amount) + '</span>' +
        '</div>';
      });

      html += '</div>';

      // ── Panel salidas ─────────────────────────────────────
      html += '<div class="month-block__section"><div class="month-section-title">↓ Salidas</div>';
      html += '<div class="month-row"><span>Gastos fijos vida</span><span class="text-red">-' + fmt(fixed) + '</span></div>';
      html += '<div class="month-row"><span>Gastos variables</span><span class="text-red">-' + fmt(variable) + '</span></div>';
      html += '<div class="month-row"><span>Mínimos deuda</span><span class="text-red">-' + fmt(mins) + '</span></div>';

      // Pagos extra específicos del mes (ej. corte especial, cierre Banorte)
      (m.extraExpenses || []).forEach(function (r) {
        html += '<div class="month-row"><span>' + r[0] + '</span><span class="text-red">' + fmt(r[1]) + '</span></div>';
      });
      html += '</div>';

      // ── Surplus ───────────────────────────────────────────
      html += '<div class="month-block__surplus">' +
        '<span>Excedente para deuda</span>' +
        '<span style="color:' + (surplus >= 0 ? 'var(--cp)' : 'var(--cr)') + '">' + fmt(surplus) + '</span>' +
      '</div>';
    }

    if (m.pivote)           html += '<div class="month-block__pivote">🔄 30-Jun: Banamex $0 → Redisponer $180k → SPEI → Banorte</div>';
    if (m.status === "win") html += '<div class="month-block__win">🎯 Banorte $0 · Banamex $0 · Nu flujo · Hipoteca activa ✅</div>';

    // ── Pagos extra editables (cortes especiales, cierres, etc.) ─
    if (m.ym) {
      html += '<div class="month-extra-edit" id="extra-edit-' + m.id + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:.4rem;">' +
          '<span style="font-size:.48rem;color:var(--sd);letter-spacing:.08em;text-transform:uppercase;">Pagos extra del mes</span>' +
          '<button class="month-note-save" data-month-extra="' + m.id + '" style="font-size:.48rem;">+ Agregar</button>' +
        '</div>' +
        '<div id="extra-items-' + m.id + '">' +
          (m.extraExpenses || []).map(function (r, idx) {
            return '<div class="extra-item-row" style="display:flex;gap:.35rem;margin-top:.25rem;align-items:center;">' +
              '<input class="budget-input budget-input--label" style="flex:1;" ' +
                'id="extra-label-' + m.id + '-' + idx + '" value="' + escHtml(r[0] || "") + '">' +
              '<input class="budget-input budget-input--amount" style="width:80px;" ' +
                'id="extra-amt-' + m.id + '-' + idx + '" type="number" value="' + Math.abs(r[1] || 0) + '">' +
              '<button class="budget-save" data-save-extra="' + m.id + '">✓</button>' +
              '<button style="background:transparent;border:none;color:var(--cr);cursor:pointer;font-size:.7rem;" ' +
                'data-del-extra="' + m.id + '" data-idx="' + idx + '">✕</button>' +
            '</div>';
          }).join("") +
        '</div>' +
      '</div>';
    }

    html +=
      '<textarea class="month-note-input" data-month="' + m.id + '" maxlength="300" placeholder="Notas del mes (máx. 300 caracteres)...">' + escHtml(savedNote) + '</textarea>' +
      '<div class="month-note-footer">' +
        '<span class="month-note-count" id="note-count-' + m.id + '">' + (300 - savedNote.length) + ' restantes</span>' +
        '<button class="month-note-save" data-month="' + m.id + '">Guardar nota</button>' +
      '</div>';

    div.innerHTML = html;
    c.appendChild(div);
  });

  document.querySelectorAll(".month-note-input").forEach(function (ta) {
    ta.addEventListener("input", function () {
      var el = document.getElementById("note-count-" + this.dataset.month);
      if (el) el.textContent = (300 - this.value.length) + " restantes";
    });
  });
  document.querySelectorAll(".month-note-save").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var monthId = this.dataset.month;
      var ta   = document.querySelector('.month-note-input[data-month="' + monthId + '"]');
      var note = ta ? ta.value : "";
      MONTH_NOTES[monthId] = note;
      sessionStorage.setItem("debt_month_notes", JSON.stringify(MONTH_NOTES));
      await SHEETS.saveMonthNote(monthId, note);
      await saveAll("Nota mes " + monthId);
      showToast("✓ Nota guardada");
    });
  });
}

// ============================================================
// RENDER — TIMELINE
// ============================================================
function renderTimeline() {
  var events = [
    { d: "15-Jun", l: "Iniciar expediente hipotecario",   s: "upcoming" },
    { d: "30-Jun", l: "PIVOTE — Banorte: $250k → $70k",   s: "pivote"   },
    { d: "Jul",    l: "Seguimiento + Banorte terminando",  s: "upcoming" },
    { d: "30-Ago", l: "2ª revisión buró — Tasa blindada",  s: "critical" },
    { d: "Sep",    l: "Firma escrituras hipoteca",         s: "upcoming" },
    { d: "1-Oct",  l: "🏁 Hipoteca activa · Deuda = $0",  s: "win"      }
  ];
  var c = document.getElementById("timeline");
  if (!c) return;
  c.innerHTML = events.map(function (e) {
    return '<div class="timeline-item timeline-item--' + e.s + '">' +
      '<div class="timeline-dot"></div>' +
      '<div><div class="timeline-date">' + e.d + '</div><div class="timeline-label">' + e.l + '</div></div>' +
    '</div>';
  }).join("");
}

// ============================================================
// RENDER — HISTORY (panel Salud)
// ============================================================
async function loadHistory() {
  var c = document.getElementById("history-log");
  if (!c) return;
  c.innerHTML = '<div class="text-muted" style="font-size:.6rem;">Cargando historial...</div>';
  var r = await SHEETS.getHistory("audit_log");
  if (!r.success || !r.data || !r.data.length) {
    c.innerHTML = '<div class="text-muted" style="font-size:.6rem;">Sin historial aún.</div>';
    return;
  }
  c.innerHTML = r.data.slice(-20).reverse().map(function (row) {
    return '<div class="history-row">' +
      '<span class="history-date">'   + String(row.timestamp || "").split("T")[0].substring(5) + '</span>' +
      '<span class="history-action">' + (row.action || "—") + '</span>' +
      '<span class="history-detail">' + (row.notes  || "")  + '</span>' +
    '</div>';
  }).join("");
}

// ============================================================
// SCENARIOS (panel Salud)
// Calcula deuda estimada al 1-Oct según toggles activos.
// Base = deuda actual. Cada toggle ajusta EI o gastos.
// ============================================================
function recalcScenarios() {
  // Base: deuda actual total
  var base = CALC.totalDebt();

  // Surplus mensual base × meses restantes hasta Oct
  var hoy       = new Date();
  var oct       = new Date("2026-10-01");
  var mesesLeft = Math.max(1, Math.round((oct - hoy) / (1000 * 60 * 60 * 24 * 30.5)));
  var surplusBase = CALC.surplusForDebt() * mesesLeft;

  // EI alta+media prob pendiente (ya en el plan base)
  var eiBase = EI.items
    .filter(function (i) { return i.status === "pendiente" && i.prob !== "baja"; })
    .reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);

  // Ajustes por escenario
  var adj = 0;

  // Toggle 1: PTU llega $15k menos
  if (chk("scen-1")) {
    var ptu = EI.items.find(function (i) { return i.desc.toLowerCase().includes("ptu"); });
    adj -= ptu ? Math.min(15000, ptu.amount) : 15000;
  }

  // Toggle 2: Mínimo Banorte sube $2k — impacta surplus los meses restantes
  if (chk("scen-2")) adj -= 2000 * mesesLeft;

  // Toggle 3: Apoyo pareja activo — suma EI de baja prob con "pareja"
  if (chk("scen-3")) {
    var pareja = EI.items.filter(function (i) {
      return i.desc.toLowerCase().includes("pareja") && i.prob === "baja";
    });
    adj += pareja.reduce(function (s, i) { return s + (parseFloat(i.amount) || 0); }, 0);
    // Si no hay ninguno en baja, tomar cualquier pareja pendiente como adicional
    if (!pareja.length) adj += 200000;
  }

  // Toggle 4: Airbnb activo — suma EI de baja prob con "airbnb"
  if (chk("scen-4")) {
    var airbnb = EI.items.find(function (i) { return i.desc.toLowerCase().includes("airbnb"); });
    adj += airbnb ? parseFloat(airbnb.amount) || 30000 : 30000;
  }

  // Deuda estimada = base - surplus_base - ei_base - ajustes_positivos + ajustes_negativos
  var deudaOct = Math.max(0, base - surplusBase - eiBase - adj);
  var el = document.getElementById("scen-oct");
  if (el) {
    el.textContent = fmt(deudaOct);
    el.className   = "drow__val " + (deudaOct > 0 ? "drow__val--r" : "drow__val--g");
  }
}

function chk(id) { var el = document.getElementById(id); return el && el.checked; }

// ============================================================
// PERSIST & RENDER
// ============================================================
async function persistAndRender(notes) {
  var state = {
    banorte:       CONFIG.debts.banorte.balance,
    banamexNomina: CONFIG.debts.banamexNomina.balance,
    banamexTDC:    CONFIG.debts.banamexTDC.balance,
    nu:            CONFIG.debts.nu.balance,
    buroScore:     CONFIG.buro.score,
    savedAt:       new Date().toISOString()
  };
  sessionStorage.setItem("debt_state", JSON.stringify(state));
  await saveAll(notes || "");
  renderAll();
}

// ============================================================
// BIND ALL EVENTS
// ============================================================
function bindAllEvents() {
  // ── Nav buttons
  document.querySelectorAll(".nav-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var panelId = this.dataset.panel;
      document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("on"); });
      document.querySelectorAll(".nav-btn").forEach(function (b) { b.classList.remove("on"); });
      var target = document.getElementById("panel-" + panelId);
      if (target) target.classList.add("on");
      this.classList.add("on");
      var labels = { saldos: "SALDOS", budget: "BUDGET", extras: "EXTRAS", meses: "CASHFLOW", health: "SALUD" };
      set("scr-mode-lbl", labels[panelId] || panelId.toUpperCase());
    });
  });

  // ── Debt card: open edit
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("btn-edit") && !e.target.classList.contains("ei-btn-edit")) {
      var key = e.target.dataset.key;
      hide("bal-" + key);
      show("edit-" + key);
      e.target.style.display = "none";
      var inp = document.getElementById("inp-" + key);
      if (inp) { inp.focus(); inp.select(); }
    }
  });

  // ── Debt card: cancel
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("btn-cancel") && !e.target.classList.contains("ei-cancel")) {
      closeDebtEdit(e.target.dataset.key);
    }
  });

  // ── Debt card: save
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("btn-save") && !e.target.classList.contains("ei-save")) {
      saveDebt(e.target.dataset.key);
    }
  });

  // ── Enter en inputs de deuda
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" || !e.target.classList.contains("debt-input")) return;
    var id = e.target.id || "";
    if (id.startsWith("ei-")) return;
    var key = id.replace(/^(inp|min|due|note)-/, "");
    if (key && CONFIG.debts[key]) saveDebt(key);
  });

  // ── Guardar todo
  var btnSave = document.getElementById("btn-save-all");
  if (btnSave) btnSave.addEventListener("click", function () { persistAndRender("Guardado manual"); });

  // ── Revertir
  var btnRev = document.getElementById("btn-revert");
  if (btnRev) btnRev.addEventListener("click", async function () {
    if (!confirm("¿Revertir al snapshot anterior en Google Sheets?")) return;
    var r = await SHEETS.revertLast();
    if (r.success) {
      sessionStorage.removeItem("debt_state");
      await loadDebtState();
      renderAll();
      showToast("↩ Revertido al snapshot anterior");
    } else {
      showToast("⚠️ No se pudo revertir");
    }
    showSavingIndicator(false, r.success);
  });

  // ── Refrescar historial
  var btnHist = document.getElementById("btn-refresh-history");
  if (btnHist) btnHist.addEventListener("click", loadHistory);

  // ── Extra expenses: agregar fila
  document.addEventListener("click", function (e) {
    var monthId = e.target.dataset.monthExtra;
    if (!monthId) return;
    var m = MONTHS_DEF.find(function (x) { return x.id === monthId; });
    if (!m) return;
    m.extraExpenses = m.extraExpenses || [];
    m.extraExpenses.push(["Nuevo pago", 0]);
    renderMonthlyPlan();
    drawWaterfall();
    renderBudget();
  });

  // ── Extra expenses: guardar fila
  document.addEventListener("click", function (e) {
    var monthId = e.target.dataset.saveExtra;
    if (!monthId) return;
    saveExtraExpenses(monthId);
  });

  // ── Extra expenses: eliminar fila
  document.addEventListener("click", function (e) {
    var monthId = e.target.dataset.delExtra;
    if (!monthId) return;
    var idx = parseInt(e.target.dataset.idx);
    var m   = MONTHS_DEF.find(function (x) { return x.id === monthId; });
    if (!m) return;
    m.extraExpenses.splice(idx, 1);
    saveExtraExpenses(monthId);
  });
}

async function saveExtraExpenses(monthId) {
  var m = MONTHS_DEF.find(function (x) { return x.id === monthId; });
  if (!m) return;

  // Leer valores actuales de los inputs del DOM
  var container = document.getElementById("extra-items-" + monthId);
  if (container) {
    var rows = container.querySelectorAll(".extra-item-row");
    var updated = [];
    rows.forEach(function (row, idx) {
      var lbl = row.querySelector('[id^="extra-label-"]');
      var amt = row.querySelector('[id^="extra-amt-"]');
      if (lbl && amt) {
        var amount = parseFloat(amt.value) || 0;
        updated.push([lbl.value || "Pago extra", -Math.abs(amount)]);
      }
    });
    m.extraExpenses = updated;
  }

  // Persistir en cache local
  var allExtra = MONTHS_DEF
    .filter(function (x) { return x.extraExpenses && x.extraExpenses.length; })
    .map(function (x) { return { monthId: x.id, items: x.extraExpenses }; });
  persistUserConfigCache("extraExpenses", allExtra);

  // Guardar en Sheets
  await SHEETS.saveConfig("extraExpenses", JSON.stringify(allExtra), "Pagos extra " + monthId);
  await saveAll("Pagos extra actualizados: " + monthId);

  renderMonthlyPlan();
  drawWaterfall();
  renderBudget();
  showToast("✓ Pagos extra guardados");
}

function closeDebtEdit(key) {
  show("bal-" + key);
  hide("edit-" + key);
  var btn = document.querySelector(".btn-edit[data-key='" + key + "']");
  if (btn) btn.style.display = "";
}

async function saveDebt(key) {
  var newBal = parseFloat(val("inp-" + key));
  var newMin = parseFloat(val("min-" + key));
  var newDue = val("due-" + key);
  var notes  = val("note-" + key);
  if (isNaN(newBal) || newBal < 0) { showToast("⚠️ Monto inválido"); return; }

  var old = CONFIG.debts[key].balance;
  CONFIG.debts[key].balance    = newBal;
  if (!isNaN(newMin)) CONFIG.debts[key].minPayment = newMin;
  if (newDue)         CONFIG.debts[key].dueDate    = newDue;

  var balEl = document.getElementById("bal-" + key);
  if (balEl) balEl.textContent = fmt(newBal);
  var minEl = document.getElementById("min-display-" + key);
  if (minEl) minEl.textContent = fmt(CONFIG.debts[key].minPayment);

  closeDebtEdit(key);

  // Guardar metadatos de deuda (mínimos, fechas)
  var meta = {};
  Object.keys(CONFIG.debts).forEach(function (k) {
    meta[k] = { minPayment: CONFIG.debts[k].minPayment, dueDate: CONFIG.debts[k].dueDate };
  });
  await SHEETS.saveConfig("debtMeta", JSON.stringify(meta), key + " meta actualizado");
  await persistAndRender(key + ": $" + old + " → $" + newBal + (notes ? ". " + notes : ""));
}

// ============================================================
// HELPERS
// ============================================================
function fmt(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n || 0);
}
function fmtK(n) {
  if (!n) return "$0";
  return n >= 1000 ? "$" + Math.round(n / 1000) + "k" : fmt(n);
}
function fmtDate(d) {
  if (!d) return "—";
  var p  = String(d).split("-");
  var mo = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return (p[2] || "") + " " + (mo[parseInt(p[1]) - 1] || "") + " " + (p[0] || "");
}
function parseNum(v, fallback) { var n = parseFloat(v); return isNaN(n) ? fallback : n; }
function val(id)      { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
function set(id, v)   { var el = document.getElementById(id); if (el) el.textContent = v; }
function setStyle(id, p, v) { var el = document.getElementById(id); if (el) el.style[p] = v; }
function show(id)     { var el = document.getElementById(id); if (el) el.style.display = ""; }
function hide(id)     { var el = document.getElementById(id); if (el) el.style.display = "none"; }
function badge(c, t)  { return '<span class="badge badge--' + c + '">' + t + '</span>'; }
function opt(v, label, cur) { return '<option value="' + v + '"' + (cur === v ? " selected" : "") + '>' + label + '</option>'; }
function escHtml(s)   { return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }

function showToast(msg, dur) {
  var t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("toast--visible");
  if (dur === 0) return;
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove("toast--visible"); }, dur || 3000);
}
function hideToast() { var t = document.getElementById("toast"); if (t) t.classList.remove("toast--visible"); }

// ── ARRANQUE ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
