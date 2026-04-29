// ============================================================
// APP.JS — Lógica principal
// Orden: EI state → auth → init → load → render → events
// ============================================================

// ── EI STATE (debe ir primero) ────────────────────────────
var EI = {
  items:   [],
  nextId:  1,

  totalForMonth: function(ym) {
    return this.items
      .filter(function(i){
        return i.status === "pendiente" && i.prob !== "baja" &&
               i.date && i.date.substring(0,7) === ym;
      })
      .reduce(function(s,i){ return s+(parseFloat(i.amount)||0); }, 0);
  },

  totalPending: function() {
    return this.items
      .filter(function(i){ return i.status === "pendiente"; })
      .reduce(function(s,i){ return s+(parseFloat(i.amount)||0); }, 0);
  },

  fromArray: function(arr) {
    this.items = arr || [];
    this.nextId = this.items.length
      ? Math.max.apply(null, this.items.map(function(i){ return i.id||0; })) + 1
      : 1;
  }
};

// ── MONTH NOTES STATE ────────────────────────────────────
var MONTH_NOTES = {};

// ── AUTH ─────────────────────────────────────────────────
function checkAuth() {
  if (sessionStorage.getItem("debt_token") === CONFIG.appToken) return true;
  var input = prompt("Token de acceso:");
  if (input === CONFIG.appToken) {
    sessionStorage.setItem("debt_token", input);
    return true;
  }
  document.body.innerHTML = '<div class="auth-error">Acceso denegado.</div>';
  return false;
}

// ── INIT ─────────────────────────────────────────────────
async function init() {
  if (!checkAuth()) return;
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
}

function renderAll() {
  renderCounters();
  renderDebtCards();
  renderExtraordinaryIncome();
  renderBudget();
  renderSubscriptions();
  renderMonthlyPlan();
  renderTimeline();
  loadHistory();
  updateTimestamp();
}

// ── LOAD FUNCTIONS ────────────────────────────────────────
async function loadDebtState() {
  try {
    var cached = sessionStorage.getItem("debt_state");
    if (cached) { applyDebtState(JSON.parse(cached)); }
    // siempre refrescar desde Sheets en background
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
  } catch(e) { console.warn("loadDebtState:", e.message); }
}

function applyDebtState(s) {
  if (s.banorte       != null) CONFIG.debts.banorte.balance       = s.banorte;
  if (s.banamexNomina != null) CONFIG.debts.banamexNomina.balance = s.banamexNomina;
  if (s.banamexTDC    != null) CONFIG.debts.banamexTDC.balance    = s.banamexTDC;
  if (s.nu            != null) CONFIG.debts.nu.balance            = s.nu;
}

async function loadExtraordinaryIncome() {
  try {
    var cached = sessionStorage.getItem("debt_ei");
    if (cached) { EI.fromArray(JSON.parse(cached)); return; }
    var r = await SHEETS.getHistory("extraordinary_income");
    if (r.success && r.data && r.data.length) {
      EI.fromArray(r.data.map(function(row){
        return { id:parseInt(row.id)||0, desc:row.desc||"", amount:parseFloat(row.amount)||0,
                 date:row.date||"", target:row.target||"libre", status:row.status||"pendiente",
                 prob:row.prob||"alta", notes:row.notes||"" };
      }));
    } else {
      EI.fromArray([
        {id:1,desc:"PTU Arcadis",   amount:45000, date:"2026-05-30",target:"banamexNomina",status:"pendiente",prob:"alta", notes:"Puede ser mayor"},
        {id:2,desc:"Smability (1a)",amount:30000, date:"2026-06-15",target:"banamexNomina",status:"pendiente",prob:"alta", notes:""},
        {id:3,desc:"Smability (2a)",amount:20000, date:"2026-07-15",target:"banorte",      status:"pendiente",prob:"alta", notes:""},
        {id:4,desc:"Smability (3a)",amount:30000, date:"2026-08-15",target:"banorte",      status:"pendiente",prob:"alta", notes:""},
        {id:5,desc:"Apoyo familiar",amount:35000, date:"2026-09-30",target:"banamexNomina",status:"pendiente",prob:"alta", notes:""},
        {id:6,desc:"Apoyo pareja",  amount:200000,date:"2026-06-30",target:"banorte",      status:"pendiente",prob:"media",notes:"$100k May + $100k Jun"},
        {id:7,desc:"Airbnb Mundial",amount:30000, date:"2026-07-01",target:"libre",        status:"pendiente",prob:"baja", notes:"~20 noches. Decisión con pareja"},
      ]);
    }
    sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  } catch(e) { console.warn("loadEI:", e.message); }
}

async function loadMonthNotes() {
  try {
    var cached = sessionStorage.getItem("debt_month_notes");
    if (cached) { MONTH_NOTES = JSON.parse(cached); return; }
    var r = await SHEETS.getHistory("month_notes");
    if (r.success && r.data && r.data.length) {
      r.data.forEach(function(row){ MONTH_NOTES[row.monthId] = row.note || ""; });
      sessionStorage.setItem("debt_month_notes", JSON.stringify(MONTH_NOTES));
    }
  } catch(e) { console.warn("loadMonthNotes:", e.message); }
}

async function loadConfigFromSheets() {
  try {
    var r = await SHEETS.getHistory("user_config");
    if (!r.success || !r.data || !r.data.length) return;
    r.data.forEach(function(row) {
      try {
        if (row.section === "fixedExpenses")    CONFIG.fixedExpenses    = JSON.parse(row.payload);
        if (row.section === "variableExpenses") CONFIG.variableExpenses = JSON.parse(row.payload);
        if (row.section === "subscriptions")    CONFIG.subscriptions    = JSON.parse(row.payload);
        if (row.section === "income")           Object.assign(CONFIG.income, JSON.parse(row.payload));
        if (row.section === "debtMeta") {
          var meta = JSON.parse(row.payload);
          Object.keys(meta).forEach(function(k) {
            if (CONFIG.debts[k]) Object.assign(CONFIG.debts[k], meta[k]);
          });
        }
      } catch(_) {}
    });
  } catch(e) { console.warn("loadConfig:", e.message); }
}

// ── SAVE ALL ──────────────────────────────────────────────
async function saveAll(notes) {
  showSavingIndicator(true);
  var r = await SHEETS.save(notes || "");
  showSavingIndicator(false, r.success);
  updateTimestamp();
}

function showSavingIndicator(saving, success) {
  var el = document.getElementById("save-status");
  if (!el) return;
  if (saving) {
    el.textContent = "⏳ Guardando...";
    el.className = "save-status save-status--saving";
  } else if (success) {
    el.textContent = "✅ Guardado en Google Sheets";
    el.className = "save-status save-status--ok";
    setTimeout(function(){ el.textContent = ""; el.className = "save-status"; }, 4000);
  } else {
    el.textContent = "⚠️ Sin conexión — datos locales";
    el.className = "save-status save-status--warn";
  }
}

function updateTimestamp() {
  var cached = sessionStorage.getItem("debt_state");
  if (cached) {
    var s = JSON.parse(cached);
    if (s.savedAt) {
      set("last-updated", new Date(s.savedAt).toLocaleDateString("es-MX",
        {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}));
      return;
    }
  }
  set("last-updated", new Date().toLocaleDateString("es-MX",
    {day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}));
}

// ── COUNTERS ──────────────────────────────────────────────
function renderCounters() {
  var total        = CALC.totalDebt();
  var surplusDebt  = CALC.surplusForDebt();
  var pct          = CALC.pctPaid();

  renderEditableCounter("total-debt", fmt(total), function(newVal) {
    var diff  = newVal - total;
    var keys  = ["banorte","banamexNomina"];
    var bTotal= keys.reduce(function(s,k){ return s+CONFIG.debts[k].balance; },0);
    keys.forEach(function(k){
      var share = bTotal>0 ? CONFIG.debts[k].balance/bTotal : 0.5;
      CONFIG.debts[k].balance = Math.max(0, Math.round(CONFIG.debts[k].balance + diff*share));
    });
    persistAndRender("Ajuste manual deuda total: "+fmt(newVal));
  });

  renderEditableCounter("buro-score", CONFIG.buro.score, function(newVal) {
    CONFIG.buro.score = newVal;
    persistAndRender("Score buró actualizado: "+newVal);
  });

  set("days-to-target",   CALC.daysTo(CONFIG.targetDate));
  set("days-to-pivote",   CALC.daysTo(CONFIG.pivoteDate));
  set("monthly-surplus",  fmt(surplusDebt));
  set("ei-total-counter", fmt(EI.totalPending()));
  set("debt-progress-pct",pct+"% liquidado");
  setStyle("debt-progress-fill","width",pct+"%");
  checkDueDates();
}

function renderEditableCounter(id, displayVal, onSave) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = displayVal;
  el.classList.add("editable-counter");
  el.title = "Clic para editar";
  el.onclick = function() {
    var cur = el.dataset.raw || String(displayVal).replace(/[^0-9.-]/g,"");
    var input = document.createElement("input");
    input.type = "number";
    input.value = cur;
    input.className = "counter-inline-input";
    el.replaceWith(input);
    input.focus(); input.select();

    function commit() {
      var newVal = parseFloat(input.value);
      if (!isNaN(newVal) && newVal >= 0) onSave(newVal);
      var span = document.createElement("span");
      span.id = id;
      input.replaceWith(span);
      renderCounters();
    }
    input.onblur = commit;
    input.onkeydown = function(e) { if(e.key==="Enter") commit(); if(e.key==="Escape") { input.value=cur; commit(); } };
  };
}

function checkDueDates() {
  Object.entries(CONFIG.debts).forEach(function(entry) {
    var key = entry[0], debt = entry[1];
    if (!debt.dueDate) return;
    var days = CALC.daysTo(debt.dueDate);
    var el = document.getElementById("due-alert-"+key);
    if (!el) return;
    if (days <= 5 && days >= 0) {
      el.textContent = "⚠️ Vence en " + days + " días";
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  });
}

// ── DEBT CARDS ────────────────────────────────────────────
function renderDebtCards() {
  var c = document.getElementById("debt-cards");
  if (!c) return;
  c.innerHTML = "";
  Object.entries(CONFIG.debts).forEach(function(entry) {
    var key = entry[0], d = entry[1];
    var interest = CALC.monthlyInterest(key);
    var isFloat  = d.type === "float";
    var sem = d.balance === 0 ? "green" : d.rate > 30 ? "red" : d.rate > 15 ? "yellow" : "green";
    var card = document.createElement("div");
    card.className = "debt-card debt-card--"+sem;
    card.innerHTML =
      '<div class="debt-card__header">' +
        '<span class="debt-card__label">'+d.label+'</span>' +
        '<span class="debt-card__dot debt-card__dot--'+sem+'"></span>' +
      '</div>' +
      '<div class="debt-card__balance" id="bal-'+key+'">'+(isFloat?"~":"")+fmt(d.balance)+'</div>' +
      '<div id="due-alert-'+key+'" class="debt-card__due-alert" style="display:none;"></div>' +

      // Inline edit
      '<div class="debt-edit" id="edit-'+key+'" style="display:none;">' +
        '<label class="debt-edit__label">Saldo actual</label>' +
        '<input class="debt-input" id="inp-'+key+'" type="number" value="'+d.balance+'" min="0">' +
        '<label class="debt-edit__label">Pago mínimo</label>' +
        '<input class="debt-input" id="min-'+key+'" type="number" value="'+d.minPayment+'" min="0">' +
        '<label class="debt-edit__label">Fecha límite pago</label>' +
        '<input class="debt-input" id="due-'+key+'" type="date" value="'+(d.dueDate||"")+'">' +
        '<label class="debt-edit__label">Nota</label>' +
        '<input class="debt-input" id="note-'+key+'" type="text" placeholder="Nota opcional">' +
        '<div class="debt-edit__btns">' +
          '<button class="btn-save" data-key="'+key+'">Guardar</button>' +
          '<button class="btn-cancel" data-key="'+key+'">Cancelar</button>' +
        '</div>' +
      '</div>' +

      (d.rate > 0 ? '<div class="debt-card__rate">'+d.rate+'% · <span class="text-red">'+fmt(interest)+'/mes interés</span></div>' : '') +
      '<div class="debt-card__min">Mín: <span id="min-display-'+key+'">'+fmt(d.minPayment)+'</span></div>' +
      '<div class="debt-card__due">Vence: '+(d.dueDate ? fmtDate(d.dueDate) : "—")+'</div>' +
      (isFloat ? '<div class="debt-card__note">Float corriente</div>' : '') +
      '<button class="btn-edit" data-key="'+key+'">Editar</button>';
    c.appendChild(card);
  });
}

// ── BUDGET SECTION ────────────────────────────────────────
function renderBudget() {
  var ym       = currentYM();
  var income   = CALC.monthlyIncome(ym);
  var fixed    = CALC.totalFixed();
  var variable = CALC.totalVariable();
  var mins     = CALC.totalMinPayments();
  var surplus  = income - fixed - variable - mins;

  // Render tablas editables
  renderBudgetTable("income-body", [
    { id:"nomina", label:"Nómina neta mensual", amount: ym >= "2026-06" ? CONFIG.income.nomina : CONFIG.income.nominaPreOffcycle },
    { id:"vales",  label:"Vales de despensa",   amount: CONFIG.income.vales },
    { id:"otros",  label:"Otros ingresos",      amount: CONFIG.income.otros || 0 },
  ], saveBudgetIncome);

  renderBudgetTable("fixed-expenses-body",    CONFIG.fixedExpenses,    saveBudgetFixed);
  renderBudgetTable("variable-expenses-body", CONFIG.variableExpenses, saveBudgetVariable);

  // Mínimos readonly desde CONFIG.debts
  var minsBody = document.getElementById("mins-body");
  if (minsBody) {
    minsBody.innerHTML = Object.entries(CONFIG.debts)
      .filter(function(e){ return (e[1].minPayment||0) > 0; })
      .map(function(e){
        var d = e[1];
        return '<tr><td>'+d.label+' (mín)</td>' +
          '<td class="text-right text-yellow">'+fmt(d.minPayment)+'</td><td></td></tr>';
      }).join("");
  }

  // Chips de totales (fila superior)
  set("budget-total-income",   fmt(income));
  set("budget-total-fixed",    fmt(fixed));
  set("budget-total-variable", fmt(variable));
  set("budget-total-mins",     fmt(mins));

  // Balance del mes (sección inferior)
  set("bal-income",   "+"+fmt(income));
  set("bal-fixed",    "-"+fmt(fixed));
  set("bal-variable", "-"+fmt(variable));
  set("bal-mins",     "-"+fmt(mins));

  var balResult = document.getElementById("budget-surplus");
  var balRow    = document.getElementById("bal-result-row");
  if (balResult) {
    balResult.textContent = fmt(Math.abs(surplus));
    balResult.className   = surplus >= 0 ? "text-purple" : "text-red";
  }
  if (balRow) {
    var label = balRow.querySelector("span:first-child");
    if (label) label.textContent = surplus >= 0
      ? "💜 Excedente para abono extra"
      : "🔴 Gap — necesitas "+fmt(Math.abs(surplus))+" adicionales";
  }

  // Sync con counter y plan mensual
  set("monthly-surplus", fmt(surplus));
}

function renderBudgetTable(tbodyId, items, saveCallback) {
  var tb = document.getElementById(tbodyId);
  if (!tb) return;
  tb.innerHTML = "";
  items.forEach(function(item) {
    var tr = document.createElement("tr");
    tr.innerHTML =
      '<td><input class="budget-input budget-input--label" data-id="'+item.id+'" data-field="label" value="'+escHtml(item.label||"")+'"></td>' +
      '<td><input class="budget-input budget-input--amount" data-id="'+item.id+'" data-field="amount" type="number" min="0" value="'+(item.amount||0)+'"></td>' +
      (item.note !== undefined ? '<td class="text-muted" style="font-size:.65rem;">'+escHtml(item.note||"")+'</td>' : '') +
      '<td><button class="budget-save" data-id="'+item.id+'">✓</button></td>';
    tb.appendChild(tr);

    // bind save
    tr.querySelector(".budget-save").addEventListener("click", function() {
      var labelEl  = tr.querySelector('[data-field="label"]');
      var amountEl = tr.querySelector('[data-field="amount"]');
      var idx = items.findIndex(function(i){ return i.id === item.id; });
      if (idx > -1) {
        if (labelEl)  items[idx].label  = labelEl.value;
        if (amountEl) items[idx].amount = parseFloat(amountEl.value)||0;
      }
      saveCallback(items);
    });
  });
}

async function saveBudgetFixed(items) {
  CONFIG.fixedExpenses = items;
  await SHEETS.saveConfig("fixedExpenses", JSON.stringify(items), "Gastos fijos actualizados");
  await saveAll("Gastos fijos actualizados");
  renderBudget(); renderCounters();
  showSaveConfirm();
}

async function saveBudgetVariable(items) {
  CONFIG.variableExpenses = items;
  await SHEETS.saveConfig("variableExpenses", JSON.stringify(items), "Gastos variables actualizados");
  await saveAll("Gastos variables actualizados");
  renderBudget(); renderCounters();
  showSaveConfirm();
}

async function saveBudgetIncome(items) {
  items.forEach(function(i){
    if (i.id==="nomina") CONFIG.income.nomina = i.amount;
    if (i.id==="vales")  CONFIG.income.vales  = i.amount;
    if (i.id==="otros")  CONFIG.income.otros  = i.amount;
  });
  await SHEETS.saveConfig("income", JSON.stringify(CONFIG.income), "Ingresos actualizados");
  await saveAll("Ingresos actualizados");
  renderBudget(); renderCounters();
  showSaveConfirm();
}

// ── SUBSCRIPTIONS ─────────────────────────────────────────
function renderSubscriptions() {
  var tb = document.getElementById("subs-tbody");
  var tf = document.getElementById("subs-tfoot");
  if (!tb) return;
  tb.innerHTML = "";
  var tAbr=0, tCur=0;
  CONFIG.subscriptions.forEach(function(s) {
    tAbr += s.abr||0; tCur += s.current||0;
    var tr = document.createElement("tr");
    if (s.biz) tr.className = "sub-row--biz";
    tr.innerHTML =
      '<td><input class="budget-input budget-input--label" data-id="'+s.id+'" value="'+escHtml(s.label||"")+'"></td>' +
      '<td class="text-right"><input class="budget-input budget-input--amount" data-id="'+s.id+'" data-field="abr" type="number" min="0" value="'+(s.abr||0)+'"></td>' +
      '<td class="text-right"><input class="budget-input budget-input--amount" data-id="'+s.id+'" data-field="current" type="number" min="0" value="'+(s.current||0)+'"></td>' +
      '<td class="text-muted" style="font-size:.65rem;">'+escHtml(s.note||"")+'</td>' +
      '<td><button class="budget-save" data-id="'+s.id+'">✓</button></td>';
    tb.appendChild(tr);

    tr.querySelector(".budget-save").addEventListener("click", function() {
      var idx = CONFIG.subscriptions.findIndex(function(i){ return i.id === s.id; });
      if (idx > -1) {
        var lbl = tr.querySelector('[data-id="'+s.id+'"]:not([data-field])');
        var abrEl = tr.querySelector('[data-field="abr"]');
        var curEl = tr.querySelector('[data-field="current"]');
        if (lbl)   CONFIG.subscriptions[idx].label   = lbl.value;
        if (abrEl) CONFIG.subscriptions[idx].abr     = parseFloat(abrEl.value)||0;
        if (curEl) CONFIG.subscriptions[idx].current = parseFloat(curEl.value)||0;
      }
      saveSubs();
    });
  });

  if (tf) tf.innerHTML =
    '<td><strong>Total</strong></td>' +
    '<td class="text-right text-red"><strong>'+fmt(tAbr)+'</strong></td>' +
    '<td class="text-right text-yellow"><strong>'+fmt(tCur)+'</strong></td>' +
    '<td colspan="2" class="text-green text-muted">-'+fmt(tAbr-tCur)+' vs inicio</td>';
}

async function saveSubs() {
  await SHEETS.saveConfig("subscriptions", JSON.stringify(CONFIG.subscriptions), "Suscripciones actualizadas");
  await saveAll("Suscripciones actualizadas");
  renderSubscriptions();
  showSaveConfirm();
}

// ── EXTRAORDINARY INCOME ──────────────────────────────────
function renderExtraordinaryIncome() {
  var c = document.getElementById("ei-container");
  if (!c) return;
  var probColors   = {alta:"green",media:"yellow",baja:"red"};
  var targetLabels = {banorte:"Banorte",banamexNomina:"Bco Nómina",libre:"Libre"};
  var statusLabels = {pendiente:"⏳ Pendiente",recibido:"✅ Recibido"};

  var html =
    '<div class="ei-header">' +
      '<div class="ei-total">' +
        '<span class="text-muted" style="font-size:.63rem;text-transform:uppercase;letter-spacing:.05em;">Total potencial pendiente</span>' +
        '<span class="text-green" style="font-size:1.05rem;font-weight:700;" id="ei-total-counter">'+fmt(EI.totalPending())+'</span>' +
      '</div>' +
      '<button class="btn btn--primary" id="btn-ei-add">+ Agregar</button>' +
    '</div>' +
    '<div class="ei-form" id="ei-form-new" style="display:none;">'+eiFormHTML(null)+'</div>' +
    '<div class="ei-list">';

  if (!EI.items.length) {
    html += '<div class="text-muted" style="padding:.75rem 0;font-size:.72rem;">Sin ingresos registrados.</div>';
  } else {
    EI.items.forEach(function(item) {
      var pc   = probColors[item.prob]||"green";
      var done = item.status === "recibido";
      html +=
        '<div class="ei-row ei-row--'+pc+(done?" ei-row--done":"")+ '" id="ei-row-'+item.id+'">' +
          '<div class="ei-row__view" id="ei-view-'+item.id+'">' +
            '<div class="ei-row__left">' +
              '<div style="display:flex;gap:.4rem;align-items:center;">'+badge(pc,item.prob)+'<span class="ei-row__desc">'+escHtml(item.desc||"—")+'</span></div>' +
              (item.notes?'<span class="ei-row__note">'+escHtml(item.notes)+'</span>':"") +
            '</div>' +
            '<div class="ei-row__right">' +
              '<span class="ei-row__amount '+(done?"text-muted":"text-green")+'">'+fmt(item.amount)+'</span>' +
              '<span class="ei-row__date text-muted">'+fmtDate(item.date)+'</span>' +
              badge(item.target==="banorte"?"red":item.target==="banamexNomina"?"yellow":"gray", targetLabels[item.target]||item.target) +
              '<span class="ei-row__status">'+(statusLabels[item.status]||item.status)+'</span>' +
              '<button class="ei-btn-edit" data-id="'+item.id+'">✏️</button>' +
              '<button class="ei-btn-delete" data-id="'+item.id+'">✕</button>' +
            '</div>' +
          '</div>' +
          '<div class="ei-row__edit" id="ei-edit-'+item.id+'" style="display:none;">'+eiFormHTML(item)+'</div>' +
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
      '<input class="debt-input" id="ei-desc-'+id+'" type="text" placeholder="Descripción" value="'+(item?escHtml(item.desc||""):"")+'"/>' +
      '<input class="debt-input" id="ei-amount-'+id+'" type="number" placeholder="Monto" min="0" value="'+(item?item.amount:"")+'"/>' +
      '<input class="debt-input" id="ei-date-'+id+'" type="date" value="'+(item?item.date:"")+'"/>' +
      '<select class="debt-input" id="ei-target-'+id+'">'+
        opt("banamexNomina","→ Bco Nómina",item&&item.target)+
        opt("banorte","→ Banorte",item&&item.target)+
        opt("libre","→ Libre",item&&item.target)+
      '</select>' +
      '<select class="debt-input" id="ei-prob-'+id+'">'+
        opt("alta","🟢 Alta",item&&item.prob)+
        opt("media","🟡 Media",item&&item.prob)+
        opt("baja","🔴 Baja",item&&item.prob)+
      '</select>' +
      '<select class="debt-input" id="ei-status-'+id+'">'+
        opt("pendiente","⏳ Pendiente",item&&item.status)+
        opt("recibido","✅ Recibido",item&&item.status)+
      '</select>' +
    '</div>' +
    '<input class="debt-input" id="ei-notes-'+id+'" type="text" placeholder="Notas (opcional)" style="margin-top:.35rem;" value="'+(item?escHtml(item.notes||""):"")+'"/>' +
    '<div class="ei-form__actions" style="margin-top:.4rem;">'+
      '<button class="btn-save ei-save" data-id="'+id+'">Guardar</button>'+
      '<button class="btn-cancel ei-cancel" data-id="'+id+'">Cancelar</button>'+
    '</div>'
  );
}

function bindEIEvents() {
  var btnAdd = document.getElementById("btn-ei-add");
  if (btnAdd) {
    var clone = btnAdd.cloneNode(true);
    btnAdd.replaceWith(clone);
    clone.addEventListener("click", function() {
      var f = document.getElementById("ei-form-new");
      if (f) f.style.display = f.style.display==="none" ? "block" : "none";
    });
  }
  document.querySelectorAll(".ei-btn-edit").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = this.dataset.id;
      hide("ei-view-"+id); show("ei-edit-"+id);
    });
  });
  document.querySelectorAll(".ei-btn-delete").forEach(function(btn) {
    btn.addEventListener("click", function() { deleteEI(this.dataset.id); });
  });
  document.querySelectorAll(".ei-save").forEach(function(btn) {
    btn.addEventListener("click", function() { saveEI(this.dataset.id); });
  });
  document.querySelectorAll(".ei-cancel").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = this.dataset.id;
      if (id==="new") { hide("ei-form-new"); }
      else { show("ei-view-"+id); hide("ei-edit-"+id); }
    });
  });
}

async function saveEI(id) {
  var isNew  = id === "new";
  var desc   = val("ei-desc-"+id);
  var amount = parseFloat(val("ei-amount-"+id));
  var date   = val("ei-date-"+id);
  var target = val("ei-target-"+id);
  var prob   = val("ei-prob-"+id);
  var status = val("ei-status-"+id);
  var notes  = val("ei-notes-"+id);
  if (!desc || isNaN(amount)||amount<0) { showToast("⚠️ Completa descripción y monto"); return; }
  if (isNew) {
    EI.items.push({id:EI.nextId++,desc:desc,amount:amount,date:date,target:target,prob:prob,status:status,notes:notes});
  } else {
    var idx = EI.items.findIndex(function(i){ return i.id===parseInt(id); });
    if (idx>-1) EI.items[idx]={id:parseInt(id),desc:desc,amount:amount,date:date,target:target,prob:prob,status:status,notes:notes};
  }
  sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  await SHEETS.saveExtraordinaryIncome(EI.items);
  await saveAll("EI actualizado: "+desc);
  renderExtraordinaryIncome();
  renderCounters();
  showSaveConfirm();
}

async function deleteEI(id) {
  if (!confirm("¿Eliminar este ingreso?")) return;
  EI.items = EI.items.filter(function(i){ return i.id!==parseInt(id); });
  sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  await SHEETS.saveExtraordinaryIncome(EI.items);
  await saveAll("EI eliminado");
  renderExtraordinaryIncome();
  renderCounters();
  showSaveConfirm();
}

// ── MONTHLY PLAN ──────────────────────────────────────────
var MONTHS_DEF = [
  {id:"apr",label:"Abril",emoji:"🔴",status:"urgent",
   income:[[" Nómina neta",79988],["Hermana (15-Abr)",2500],["Hermana (fin-Abr)",2000]],
   expenses:[["Gastos + variables",-45620],["TDC Banamex",-14892],["Banorte mínimo",-13544]],
   surplus:8534,balances:{banorte:250676,banamexNomina:152000}},
  {id:"may",label:"Mayo",emoji:"🟣",status:"key",
   income:[["Nómina + vales",83388],["PTU ⬆️",45000]],
   expenses:[["Gastos + variables",-45620],["Banorte mínimo",-13544],["Nu corte",-11941]],
   surplus:57283,balances:{banorte:250676,banamexNomina:69000}},
  {id:"jun",label:"Junio",emoji:"🔄",status:"pivot",
   income:[["Nómina + offcycle",86388],["Smability (1a)",30000]],
   expenses:[["Gastos + variables",-45620],["Banorte mínimo",-13544]],
   surplus:57224,balances:{banorte:70000,banamexNomina:180000},pivote:true},
  {id:"jul",label:"Julio",emoji:"🟢",status:"good",
   income:[["Nómina + offcycle",86388],["Smability (2a)",20000]],
   expenses:[["Gastos + variables",-45620],["Cuota Banamex",-5500]],
   surplus:55268,balances:{banorte:15000,banamexNomina:188000}},
  {id:"aug",label:"Agosto",emoji:"🟢",status:"good",
   income:[["Nómina + offcycle",86388],["Smability (3a)",30000]],
   expenses:[["Gastos (sin Amazon)",-45545],["Cerrar Banorte",-15000]],
   surplus:55843,balances:{banorte:0,banamexNomina:118000}},
  {id:"sep",label:"Septiembre",emoji:"🟢",status:"good",
   income:[["Nómina + offcycle",86388],["Apoyo familiar",35000]],
   expenses:[["Gastos + variables",-45545]],
   surplus:75843,balances:{banorte:0,banamexNomina:38000}},
  {id:"oct",label:"1-Oct 🏁",emoji:"🏁",status:"win",balances:{banorte:0,banamexNomina:0}}
];

function renderMonthlyPlan() {
  var c = document.getElementById("monthly-plan");
  if (!c) return;
  c.innerHTML = "";
  MONTHS_DEF.forEach(function(m) {
    var div = document.createElement("div");
    div.className = "month-block month-block--"+m.status;
    div.id = "month-"+m.id;
    var savedNote = MONTH_NOTES[m.id] || "";
    var html =
      '<div class="month-block__header">' +
        '<div class="month-block__title">'+m.emoji+" "+m.label+'</div>' +
        '<div class="month-block__badges">' +
          badge(m.balances.banorte>0?"red":"green","Banorte "+fmt(m.balances.banorte||0)) +
          badge(m.balances.banamexNomina>0?"yellow":"green","BcoNóm "+fmt(m.balances.banamexNomina||0)) +
        '</div>' +
      '</div>';

    if (m.income) {
      html += '<div class="month-block__section"><div class="month-section-title">↑ Entradas</div>';
      m.income.forEach(function(r){ html+='<div class="month-row"><span>'+r[0]+'</span><span class="text-green">+'+fmt(r[1])+'</span></div>'; });
      html += '</div>';
    }
    if (m.expenses) {
      html += '<div class="month-block__section"><div class="month-section-title">↓ Salidas</div>';
      m.expenses.forEach(function(r){ html+='<div class="month-row"><span>'+r[0]+'</span><span class="text-red">'+fmt(r[1])+'</span></div>'; });
      html += '</div>';
    }
    if (m.surplus) html += '<div class="month-block__surplus"><span>Excedente</span><span class="text-purple">'+fmt(m.surplus)+'</span></div>';
    if (m.pivote)  html += '<div class="month-block__pivote">🔄 30-Jun: Banamex $0 → Redisponer $180k → SPEI → Banorte</div>';
    if (m.status==="win") html += '<div class="month-block__win">🎯 Banorte $0 · Banamex $0 · Nu flujo · Hipoteca activa ✅</div>';

    // Notas libres
    html +=
      '<div class="month-block__notes">' +
        '<textarea class="month-note-input" data-month="'+m.id+'" maxlength="300" placeholder="Notas del mes (máx. 300 caracteres)...">'+escHtml(savedNote)+'</textarea>' +
        '<div class="month-note-footer">' +
          '<span class="month-note-count" id="note-count-'+m.id+'">'+(300-savedNote.length)+' restantes</span>' +
          '<button class="month-note-save" data-month="'+m.id+'">Guardar nota</button>' +
        '</div>' +
      '</div>';

    div.innerHTML = html;
    c.appendChild(div);
  });

  // Bind note events
  document.querySelectorAll(".month-note-input").forEach(function(ta) {
    ta.addEventListener("input", function() {
      var rem = 300 - this.value.length;
      var el = document.getElementById("note-count-"+this.dataset.month);
      if (el) el.textContent = rem + " restantes";
    });
  });
  document.querySelectorAll(".month-note-save").forEach(function(btn) {
    btn.addEventListener("click", async function() {
      var monthId = this.dataset.month;
      var ta = document.querySelector('.month-note-input[data-month="'+monthId+'"]');
      var note = ta ? ta.value : "";
      MONTH_NOTES[monthId] = note;
      sessionStorage.setItem("debt_month_notes", JSON.stringify(MONTH_NOTES));
      await SHEETS.saveMonthNote(monthId, note);
      await saveAll("Nota mes "+monthId);
      showSaveConfirm();
    });
  });
}

// ── TIMELINE ──────────────────────────────────────────────
function renderTimeline() {
  var events = [
    {d:"15-Jun",l:"Iniciar expediente hipotecario",      s:"upcoming"},
    {d:"30-Jun",l:"PIVOTE — Banorte: $250k → $70k",      s:"pivote"},
    {d:"Jul",   l:"Seguimiento + Banorte liquidándose",   s:"upcoming"},
    {d:"30-Ago",l:"2ª revisión buró — Tasa blindada",     s:"critical"},
    {d:"Sep",   l:"Firma escrituras hipoteca",            s:"upcoming"},
    {d:"1-Oct", l:"🏁 Hipoteca activa · Deuda = $0",     s:"win"},
  ];
  var c = document.getElementById("timeline");
  if (!c) return;
  c.innerHTML = events.map(function(e){
    return '<div class="timeline-item timeline-item--'+e.s+'">' +
      '<div class="timeline-dot"></div>' +
      '<div class="timeline-content"><div class="timeline-date">'+e.d+'</div><div class="timeline-label">'+e.l+'</div></div>' +
    '</div>';
  }).join("");
}

// ── HISTORY ───────────────────────────────────────────────
async function loadHistory() {
  var c = document.getElementById("history-log");
  if (!c) return;
  var r = await SHEETS.getHistory("audit_log");
  if (!r.success||!r.data||!r.data.length) {
    c.innerHTML = '<div class="text-muted">Sin historial aún.</div>';
    return;
  }
  c.innerHTML = r.data.slice(-15).reverse().map(function(row){
    return '<div class="history-row">' +
      '<span class="history-date">'+(row.timestamp||"").split("T")[0]+'</span>' +
      '<span class="history-action">'+(row.action||"—")+'</span>' +
      '<span class="history-detail">'+(row.notes||"")+'</span>' +
    '</div>';
  }).join("");
}

// ── PERSIST & RENDER ──────────────────────────────────────
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
  showSaveConfirm();
}

function showSaveConfirm() {
  showSavingIndicator(false, true);
}

// ── BIND ALL EVENTS ───────────────────────────────────────
function bindAllEvents() {
  // Debt card — open edit
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-edit")||e.target.classList.contains("ei-btn-edit")) return;
    var key = e.target.dataset.key;
    hide("bal-"+key); show("edit-"+key);
    e.target.style.display="none";
    var inp=document.getElementById("inp-"+key); if(inp){inp.focus();inp.select();}
  });

  // Debt card — cancel
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-cancel")||e.target.classList.contains("ei-cancel")) return;
    closeDebtEdit(e.target.dataset.key);
  });

  // Debt card — save
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-save")||e.target.classList.contains("ei-save")) return;
    saveDebt(e.target.dataset.key);
  });

  // Enter en inputs de deuda
  document.addEventListener("keydown", function(e) {
    if (e.key!=="Enter"||!e.target.classList.contains("debt-input")) return;
    var id = e.target.id;
    if (id.startsWith("ei-")) return;
    var key = id.replace(/^(inp|min|due|note)-/,"");
    saveDebt(key);
  });

  // Save button (reemplaza sync)
  var btnSave = document.getElementById("btn-save-all");
  if (btnSave) btnSave.addEventListener("click", function() {
    persistAndRender("Guardado manual");
  });

  // Revert
  var btnRev = document.getElementById("btn-revert");
  if (btnRev) btnRev.addEventListener("click", async function() {
    if (!confirm("¿Revertir al snapshot anterior?")) return;
    var r = await SHEETS.revertLast();
    if (r.success) {
      sessionStorage.removeItem("debt_state");
      await loadDebtState();
      renderAll();
    }
    showSavingIndicator(false, r.success);
  });
}

function closeDebtEdit(key) {
  show("bal-"+key); hide("edit-"+key);
  var btn=document.querySelector(".btn-edit[data-key='"+key+"']");
  if(btn) btn.style.display="block";
}

async function saveDebt(key) {
  var newBal = parseFloat(val("inp-"+key));
  var newMin = parseFloat(val("min-"+key));
  var newDue = val("due-"+key);
  var notes  = val("note-"+key);
  if (isNaN(newBal)||newBal<0) { showToast("⚠️ Monto inválido"); return; }

  var old = CONFIG.debts[key].balance;
  CONFIG.debts[key].balance    = newBal;
  if (!isNaN(newMin)) CONFIG.debts[key].minPayment = newMin;
  if (newDue)         CONFIG.debts[key].dueDate    = newDue;

  // Actualizar display inmediato
  var balEl = document.getElementById("bal-"+key);
  if (balEl) balEl.textContent = fmt(newBal);
  var minEl = document.getElementById("min-display-"+key);
  if (minEl) minEl.textContent = fmt(CONFIG.debts[key].minPayment);

  closeDebtEdit(key);

  // Guardar meta de deuda (mínimos, fechas)
  var meta = {};
  Object.keys(CONFIG.debts).forEach(function(k){
    meta[k] = { minPayment:CONFIG.debts[k].minPayment, dueDate:CONFIG.debts[k].dueDate };
  });
  await SHEETS.saveConfig("debtMeta", JSON.stringify(meta), key+" meta actualizado");
  await persistAndRender(key+": $"+old+" → $"+newBal+(notes?". "+notes:""));
}

// ── HELPERS ───────────────────────────────────────────────
function fmt(n){ return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(n); }
function fmtDate(d){ if(!d) return "—"; var p=d.split("-"); var mo=["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]; return (p[2]||"")+" "+(mo[parseInt(p[1])-1]||"")+" "+(p[0]||""); }
function parseNum(v,fallback){ var n=parseFloat(v); return isNaN(n)?fallback:n; }
function val(id){ var el=document.getElementById(id); return el?el.value.trim():""; }
function set(id,v){ var el=document.getElementById(id); if(el) el.textContent=v; }
function setStyle(id,p,v){ var el=document.getElementById(id); if(el) el.style[p]=v; }
function show(id){ var el=document.getElementById(id); if(el) el.style.display=""; }
function hide(id){ var el=document.getElementById(id); if(el) el.style.display="none"; }
function badge(c,t){ return '<span class="badge badge--'+c+'">'+t+'</span>'; }
function opt(v,label,cur){ return '<option value="'+v+'"'+(cur===v?" selected":"")+'>'+label+'</option>'; }
function escHtml(s){ return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function showToast(msg,dur){
  var t=document.getElementById("toast"); if(!t) return;
  t.textContent=msg; t.classList.add("toast--visible");
  if(dur===0) return;
  clearTimeout(t._timer);
  t._timer=setTimeout(function(){t.classList.remove("toast--visible");},(dur||3000));
}
function hideToast(){ var t=document.getElementById("toast"); if(t) t.classList.remove("toast--visible"); }

document.addEventListener("DOMContentLoaded", init);
