// ============================================================
// APP.JS — Lógica principal · Sin módulos ES6
// Orden: EI state → helpers → init → renders → events
// ============================================================

// ── EXTRAORDINARY INCOME STATE ────────────────────────────
// Debe declararse PRIMERO — usado en renderCounters y init
var EI = {
  items: [],
  nextId: 1,

  totalForMonth: function(ym) {
    return this.items
      .filter(function(i) {
        return i.status === "pendiente" &&
               i.prob !== "baja" &&
               i.date && i.date.substring(0,7) === ym;
      })
      .reduce(function(s,i){ return s + (parseFloat(i.amount)||0); }, 0);
  },

  totalPending: function() {
    return this.items
      .filter(function(i){ return i.status === "pendiente"; })
      .reduce(function(s,i){ return s + (parseFloat(i.amount)||0); }, 0);
  },

  fromArray: function(arr) {
    this.items = arr || [];
    this.nextId = this.items.length
      ? Math.max.apply(null, this.items.map(function(i){ return i.id||0; })) + 1
      : 1;
  }
};

// ── AUTH ──────────────────────────────────────────────────
function checkAuth() {
  if (sessionStorage.getItem("debt_token") === CONFIG.appToken) return true;
  var input = prompt("Token de acceso:");
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

  await loadSavedState();
  await loadExtraordinaryIncome();

  set("last-updated", new Date().toLocaleDateString("es-MX", {
    day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"
  }));

  renderCounters();
  renderDebtCards();
  renderExtraordinaryIncome();
  bindEIEvents();
  renderMonthlyPlan();
  renderSubscriptions();
  renderTimeline();
  await loadHistory();
  bindEvents();
  SHEETS.syncPending();
}

// ── CARGAR ESTADO GUARDADO ────────────────────────────────
async function loadSavedState() {
  try {
    var cached = sessionStorage.getItem("debt_state");
    if (cached) {
      applyState(JSON.parse(cached));
      loadFromSheets(); // refresh en background
      return;
    }
    await loadFromSheets();
  } catch(err) {
    console.warn("loadSavedState:", err.message);
  }
}

async function loadFromSheets() {
  try {
    var result = await SHEETS.getHistory("monthly_snapshots");
    if (!result.success || !result.data || !result.data.length) return;
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
    sessionStorage.setItem("debt_state", JSON.stringify(state));
    if (state.savedAt) {
      set("last-updated", new Date(state.savedAt).toLocaleDateString("es-MX",{
        day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit"
      }));
    }
    renderCounters();
    renderDebtCards();
  } catch(err) {
    console.warn("loadFromSheets:", err.message);
  }
}

function applyState(state) {
  if (state.banorte       != null) CONFIG.debts.banorte.balance       = state.banorte;
  if (state.banamexNomina != null) CONFIG.debts.banamexNomina.balance = state.banamexNomina;
  if (state.banamexTDC    != null) CONFIG.debts.banamexTDC.balance    = state.banamexTDC;
  if (state.nu            != null) CONFIG.debts.nu.balance            = state.nu;
}

// ── CARGAR INGRESOS EXTRAORDINARIOS ──────────────────────
async function loadExtraordinaryIncome() {
  try {
    var cached = sessionStorage.getItem("debt_ei");
    if (cached) {
      EI.fromArray(JSON.parse(cached));
      loadEIFromSheets(); // refresh en background
      return;
    }
    await loadEIFromSheets();
  } catch(err) {
    console.warn("loadExtraordinaryIncome:", err.message);
  }
}

async function loadEIFromSheets() {
  try {
    var r = await SHEETS.getHistory("extraordinary_income");
    if (r.success && r.data && r.data.length) {
      EI.fromArray(r.data.map(function(row) {
        return {
          id:     parseInt(row.id) || 0,
          desc:   row.desc   || "",
          amount: parseFloat(row.amount) || 0,
          date:   row.date   || "",
          target: row.target || "libre",
          status: row.status || "pendiente",
          prob:   row.prob   || "alta",
          notes:  row.notes  || ""
        };
      }));
      sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
    } else {
      // Seed inicial con el plan actual
      EI.fromArray([
        {id:1,desc:"PTU Arcadis",    amount:45000, date:"2026-05-30",target:"banamexNomina",status:"pendiente",prob:"alta", notes:"Puede ser mayor"},
        {id:2,desc:"Smability (1a)", amount:30000, date:"2026-06-15",target:"banamexNomina",status:"pendiente",prob:"alta", notes:""},
        {id:3,desc:"Smability (2a)", amount:20000, date:"2026-07-15",target:"banorte",       status:"pendiente",prob:"alta", notes:""},
        {id:4,desc:"Smability (3a)", amount:30000, date:"2026-08-15",target:"banorte",       status:"pendiente",prob:"alta", notes:""},
        {id:5,desc:"Apoyo familiar", amount:35000, date:"2026-09-30",target:"banamexNomina",status:"pendiente",prob:"alta", notes:""},
        {id:6,desc:"Apoyo pareja",   amount:200000,date:"2026-06-30",target:"banorte",       status:"pendiente",prob:"media",notes:"$100k May + $100k Jun"},
        {id:7,desc:"Airbnb Mundial", amount:30000, date:"2026-07-01",target:"libre",         status:"pendiente",prob:"baja", notes:"~20 noches. Decisión con pareja"},
      ]);
      sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
    }
  } catch(err) {
    console.warn("loadEIFromSheets:", err.message);
  }
}

// ── COUNTERS ──────────────────────────────────────────────
function renderCounters() {
  var total = CALC.totalDebt();
  var startDebt = 443499;
  var pct = Math.min(100, Math.round(((startDebt - total) / startDebt) * 100));

  set("total-debt", fmt(total));
  set("days-to-target",  CALC.daysTo(CONFIG.targetDate));
  set("days-to-pivote",  CALC.daysTo(CONFIG.pivoteDate));
  set("monthly-surplus", fmt(CALC.surplusForDebt("2026-06")));
  set("buro-score", CONFIG.buro.currentScore);
  set("infonavit-balance", fmt(EI.totalPending()));
  set("debt-progress-pct", pct + "% liquidado");
  setStyle("debt-progress-fill", "width", pct + "%");
}

// ── DEBT CARDS ────────────────────────────────────────────
function renderDebtCards() {
  var c = document.getElementById("debt-cards");
  if (!c) return;
  c.innerHTML = "";
  Object.entries(CONFIG.debts).forEach(function(entry) {
    var key = entry[0], debt = entry[1];
    var interest = CALC.monthlyInterest(key);
    var isFloat  = debt.type === "float";
    var sem      = debt.balance === 0 ? "green" : debt.rate > 30 ? "red" : debt.rate > 15 ? "yellow" : "green";
    var card = document.createElement("div");
    card.className = "debt-card debt-card--" + sem;
    card.innerHTML =
      '<div class="debt-card__header">' +
        '<span class="debt-card__label">' + debt.label + '</span>' +
        '<span class="debt-card__dot debt-card__dot--' + sem + '"></span>' +
      '</div>' +
      '<div class="debt-card__balance" id="bal-' + key + '">' + (isFloat?"~":"") + fmt(debt.balance) + '</div>' +
      '<div class="debt-edit" id="edit-' + key + '" style="display:none">' +
        '<input class="debt-input" id="inp-' + key + '" type="number" value="' + debt.balance + '" min="0" placeholder="Nuevo saldo">' +
        '<input class="debt-input debt-input--note" id="note-' + key + '" type="text" placeholder="Nota (opcional)">' +
        '<div class="debt-edit__btns">' +
          '<button class="btn-save" data-key="' + key + '">Guardar</button>' +
          '<button class="btn-cancel" data-key="' + key + '">Cancelar</button>' +
        '</div>' +
      '</div>' +
      (debt.rate > 0 ? '<div class="debt-card__rate">' + debt.rate + '% · <span class="text-red">' + fmt(interest) + '/mes</span></div>' : '') +
      (debt.minPayment > 0 ? '<div class="debt-card__min">Mín: ' + fmt(debt.minPayment) + '</div>' : '') +
      (isFloat ? '<div class="debt-card__note">Float corriente</div>' : '') +
      '<button class="btn-edit" data-key="' + key + '">Editar saldo</button>';
    c.appendChild(card);
  });
}

// ── EXTRAORDINARY INCOME RENDER ───────────────────────────
function renderExtraordinaryIncome() {
  var c = document.getElementById("ei-container");
  if (!c) return;
  var probColors  = {alta:"green", media:"yellow", baja:"red"};
  var targetLabels = {banorte:"Banorte", banamexNomina:"Bco Nómina", libre:"Libre"};
  var statusLabels = {pendiente:"⏳ Pendiente", recibido:"✅ Recibido"};

  var html =
    '<div class="ei-header">' +
      '<div class="ei-total">' +
        '<span class="text-muted" style="font-size:.63rem;text-transform:uppercase;letter-spacing:.05em;">Total potencial pendiente</span>' +
        '<span class="text-green" style="font-size:1.05rem;font-weight:700;">' + fmt(EI.totalPending()) + '</span>' +
      '</div>' +
      '<button class="btn btn--primary" id="btn-ei-add">+ Agregar</button>' +
    '</div>' +
    '<div class="ei-form" id="ei-form-new" style="display:none;">' + eiFormHTML(null) + '</div>' +
    '<div class="ei-list">';

  if (!EI.items.length) {
    html += '<div class="text-muted" style="padding:.75rem 0;font-size:.72rem;">Sin ingresos registrados.</div>';
  } else {
    EI.items.forEach(function(item) {
      var pc = probColors[item.prob] || "green";
      var done = item.status === "recibido";
      var tgt  = targetLabels[item.target] || item.target;
      var tbc  = item.target === "banorte" ? "red" : item.target === "banamexNomina" ? "yellow" : "gray";
      html +=
        '<div class="ei-row ei-row--' + pc + (done?" ei-row--done":"") + '" id="ei-row-' + item.id + '">' +
          '<div class="ei-row__view" id="ei-view-' + item.id + '">' +
            '<div class="ei-row__left">' +
              '<div style="display:flex;gap:.4rem;align-items:center;">' +
                badge(pc, item.prob) +
                '<span class="ei-row__desc">' + escHtml(item.desc||"—") + '</span>' +
              '</div>' +
              (item.notes ? '<span class="ei-row__note">' + escHtml(item.notes) + '</span>' : '') +
            '</div>' +
            '<div class="ei-row__right">' +
              '<span class="ei-row__amount ' + (done?"text-muted":"text-green") + '">' + fmt(item.amount) + '</span>' +
              '<span class="ei-row__date text-muted">' + fmtDate(item.date) + '</span>' +
              badge(tbc, tgt) +
              '<span class="ei-row__status">' + (statusLabels[item.status]||item.status) + '</span>' +
              '<button class="ei-btn-edit" data-id="' + item.id + '">✏️</button>' +
              '<button class="ei-btn-delete" data-id="' + item.id + '">✕</button>' +
            '</div>' +
          '</div>' +
          '<div class="ei-row__edit" id="ei-edit-' + item.id + '" style="display:none;">' +
            eiFormHTML(item) +
          '</div>' +
        '</div>';
    });
  }
  html += '</div>';
  c.innerHTML = html;
}

function eiFormHTML(item) {
  var id = item ? item.id : "new";
  return (
    '<div class="ei-form__grid">' +
      '<input class="debt-input" id="ei-desc-'+id+'" type="text" placeholder="Descripción" value="'+(item?escHtml(item.desc||""):"")+'"/>' +
      '<input class="debt-input" id="ei-amount-'+id+'" type="number" placeholder="Monto" min="0" value="'+(item?item.amount:"")+'"/>' +
      '<input class="debt-input" id="ei-date-'+id+'" type="date" value="'+(item?item.date:"")+'"/>' +
      '<select class="debt-input" id="ei-target-'+id+'">' +
        opt("banamexNomina","→ Bco Nómina", item&&item.target) +
        opt("banorte",      "→ Banorte",   item&&item.target) +
        opt("libre",        "→ Libre",     item&&item.target) +
      '</select>' +
      '<select class="debt-input" id="ei-prob-'+id+'">' +
        opt("alta", "🟢 Alta",  item&&item.prob) +
        opt("media","🟡 Media", item&&item.prob) +
        opt("baja", "🔴 Baja",  item&&item.prob) +
      '</select>' +
      '<select class="debt-input" id="ei-status-'+id+'">' +
        opt("pendiente","⏳ Pendiente", item&&item.status) +
        opt("recibido", "✅ Recibido",  item&&item.status) +
      '</select>' +
    '</div>' +
    '<input class="debt-input" id="ei-notes-'+id+'" type="text" placeholder="Notas (opcional)" value="'+(item?escHtml(item.notes||""):"")+'"/>' +
    '<div class="ei-form__actions" style="margin-top:.4rem;">' +
      '<button class="btn-save ei-save" data-id="'+id+'">Guardar</button>' +
      '<button class="btn-cancel ei-cancel" data-id="'+id+'">Cancelar</button>' +
    '</div>'
  );
}

function opt(v, label, current) {
  return '<option value="'+v+'"'+(current===v?" selected":"")+'>'+label+'</option>';
}

// ── GUARDAR / ELIMINAR EI ─────────────────────────────────
async function saveEI(id) {
  var isNew  = id === "new";
  var desc   = val("ei-desc-"+id);
  var amount = parseFloat(val("ei-amount-"+id));
  var date   = val("ei-date-"+id);
  var target = val("ei-target-"+id);
  var prob   = val("ei-prob-"+id);
  var status = val("ei-status-"+id);
  var notes  = val("ei-notes-"+id);

  if (!desc || isNaN(amount) || amount < 0) { showToast("⚠️ Completa descripción y monto"); return; }

  if (isNew) {
    EI.items.push({ id:EI.nextId++, desc:desc, amount:amount, date:date, target:target, prob:prob, status:status, notes:notes });
  } else {
    var idx = EI.items.findIndex(function(i){ return i.id === parseInt(id); });
    if (idx > -1) EI.items[idx] = { id:parseInt(id), desc:desc, amount:amount, date:date, target:target, prob:prob, status:status, notes:notes };
  }

  sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  await SHEETS.saveExtraordinaryIncome(EI.items);

  renderExtraordinaryIncome();
  renderCounters();
  bindEIEvents();
  showToast("✅ Ingreso guardado");
}

async function deleteEI(id) {
  if (!confirm("¿Eliminar este ingreso?")) return;
  EI.items = EI.items.filter(function(i){ return i.id !== parseInt(id); });
  sessionStorage.setItem("debt_ei", JSON.stringify(EI.items));
  await SHEETS.saveExtraordinaryIncome(EI.items);
  renderExtraordinaryIncome();
  renderCounters();
  bindEIEvents();
  showToast("✅ Eliminado");
}

// ── BIND EI EVENTS ────────────────────────────────────────
function bindEIEvents() {
  var btnAdd = document.getElementById("btn-ei-add");
  if (btnAdd) {
    btnAdd.replaceWith(btnAdd.cloneNode(true)); // eliminar listeners duplicados
    document.getElementById("btn-ei-add").addEventListener("click", function() {
      var f = document.getElementById("ei-form-new");
      if (f) f.style.display = f.style.display === "none" ? "block" : "none";
    });
  }

  document.querySelectorAll(".ei-btn-edit").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var id = this.dataset.id;
      var view = document.getElementById("ei-view-"+id);
      var edit = document.getElementById("ei-edit-"+id);
      if (view) view.style.display = "none";
      if (edit) edit.style.display = "block";
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
      if (id === "new") {
        var f = document.getElementById("ei-form-new");
        if (f) f.style.display = "none";
      } else {
        var view = document.getElementById("ei-view-"+id);
        var edit = document.getElementById("ei-edit-"+id);
        if (view) view.style.display = "flex";
        if (edit) edit.style.display = "none";
      }
    });
  });
}

// ── MONTHLY PLAN ──────────────────────────────────────────
var MONTHS = [
  {id:"apr",label:"Abril",emoji:"🔴",status:"urgent",
   income:[["Nómina neta",79988],["Hermana (15-Abr)",2500],["Hermana (fin-Abr)",2000]],
   expenses:[["Gastos fijos + variables",-45620],["TDC Banamex (liquidar)",-14892],["Banorte mínimo",-13544]],
   surplus:8534,balances:{banorte:250676,banamexNomina:152000,banamexTDC:0},
   tasks:[
     {hot:true, t:"Pagar TDC Banamex completa"},
     {hot:true, t:"Pagar mínimo Banorte antes del 14-Abr: $13,544"},
     {hot:true, t:"15-Abr: $2,500 hermana → Banamex Nómina"},
     {hot:true, t:"Pagar Nu antes del 4-May: $11,941"},
     {hot:false,t:"Abrir aclaración Mercado Pago (plazo: 25-Jun)"},
     {hot:false,t:"Confirmar PTU con RRHH"}
   ]},
  {id:"may",label:"Mayo",emoji:"🟣",status:"key",
   income:[["Nómina neta + vales",83388],["PTU estimado ⬆️",45000]],
   expenses:[["Gastos fijos + variables",-45620],["Banorte mínimo",-13544],["Nu corte 4-May",-11941]],
   surplus:57283,balances:{banorte:250676,banamexNomina:69000,banamexTDC:0},
   tasks:[
     {hot:true, t:"PTU → Banamex Nómina ese mismo día"},
     {hot:true, t:"Pagar $13,544 mínimo Banorte antes del 14-May"},
     {hot:false,t:"Llamar a Banamex: confirmar condiciones redisposición 30-Jun"},
     {hot:false,t:"Preguntar periodo de enfriamiento tras liquidar"}
   ]},
  {id:"jun",label:"Junio",emoji:"🔄",status:"pivot",
   income:[["Nómina + vales + offcycle 2.5%",86388],["Smability (1a parte)",30000]],
   expenses:[["Gastos fijos + variables",-45620],["Banorte mínimo",-13544]],
   surplus:57224,balances:{banorte:70000,banamexNomina:180000,banamexTDC:0},pivote:true,
   tasks:[
     {hot:true, t:"15-Jun: iniciar expediente hipotecario con broker"},
     {hot:true, t:"Semana 23-Jun: confirmar redisposición con Banamex"},
     {hot:true, t:"30-Jun paso 1: liquidar Banamex Nómina"},
     {hot:true, t:"30-Jun paso 2: redisponer $180k"},
     {hot:true, t:"30-Jun paso 3: SPEI $180k → Banorte"},
     {hot:false,t:"Si aclaración MP resuelta → aplicar antes del 30-Jun"}
   ]},
  {id:"jul",label:"Julio",emoji:"🟢",status:"good",
   income:[["Nómina + vales + offcycle",86388],["Smability (2a parte)",20000]],
   expenses:[["Gastos fijos + variables",-45620],["Cuota Banamex Nómina",-5500]],
   surplus:55268,balances:{banorte:15000,banamexNomina:188000,banamexTDC:0},
   tasks:[
     {hot:true, t:"Liquidar Banorte completo (~$15k)"},
     {hot:false,t:"Seguimiento expediente hipotecario"},
     {hot:false,t:"Amazon Prime termina — no renovar"}
   ]},
  {id:"aug",label:"Agosto",emoji:"🟢",status:"good",
   income:[["Nómina + vales + offcycle",86388],["Smability (3a parte)",30000]],
   expenses:[["Gastos fijos + variables (sin Amazon)",-45545],["Cerrar Banorte (~$15k)",-15000]],
   surplus:55843,balances:{banorte:0,banamexNomina:118000,banamexTDC:0},
   tasks:[
     {hot:true, t:"Smability $30k: cerrar Banorte primero, resto a Banamex"},
     {hot:true, t:"30-Ago: 2a revisión buró — Banorte $0 · Score ~745"},
     {hot:false,t:"Seguimiento trámite hipotecario"}
   ]},
  {id:"sep",label:"Septiembre",emoji:"🟢",status:"good",
   income:[["Nómina + vales + offcycle",86388],["Apoyo familiar (30-Sep)",35000]],
   expenses:[["Gastos fijos + variables",-45545]],
   surplus:75843,balances:{banorte:0,banamexNomina:38000,banamexTDC:0},
   tasks:[
     {hot:true, t:"30-Sep: apoyo familiar → Banamex Nómina"},
     {hot:true, t:"Firmar escrituras hipoteca (inicio 1-Oct)"}
   ]},
  {id:"oct",label:"1-Oct 🏁",emoji:"🏁",status:"win",
   balances:{banorte:0,banamexNomina:0,banamexTDC:0},tasks:[]}
];

function renderMonthlyPlan() {
  var c = document.getElementById("monthly-plan");
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
          badge(m.balances.banorte > 0 ? "red":"green", "Banorte " + fmt(m.balances.banorte)) +
          badge(m.balances.banamexNomina > 0 ? "yellow":"green", "BcoNóm " + fmt(m.balances.banamexNomina)) +
          badge("green","TDC $0") +
        '</div>' +
      '</div>';
    if (m.income) {
      html += '<div class="month-block__section"><div class="month-section-title">↑ Entradas</div>';
      m.income.forEach(function(r){ html += '<div class="month-row"><span>'+r[0]+'</span><span class="text-green">+'+fmt(r[1])+'</span></div>'; });
      html += '</div>';
    }
    if (m.expenses) {
      html += '<div class="month-block__section"><div class="month-section-title">↓ Salidas</div>';
      m.expenses.forEach(function(r){ html += '<div class="month-row"><span>'+r[0]+'</span><span class="text-red">'+fmt(r[1])+'</span></div>'; });
      html += '</div>';
    }
    if (m.surplus) html += '<div class="month-block__surplus"><span>Excedente para deuda</span><span class="text-purple">'+fmt(m.surplus)+'</span></div>';
    if (m.pivote)  html += '<div class="month-block__pivote">🔄 30-Jun: Banamex $0 → Redisponer $180k → SPEI → Banorte</div>';
    if (m.tasks && m.tasks.length) {
      html += '<div class="month-block__tasks">';
      m.tasks.forEach(function(t){ html += '<label class="task'+(t.hot?" task--hot":"")+'"><input type="checkbox"><span>'+t.t+'</span></label>'; });
      html += '</div>';
    }
    if (m.status === "win") html += '<div class="month-block__win">🎯 Banorte $0 · Banamex $0 · Nu flujo · Hipoteca activa ✅</div>';
    div.innerHTML = html;
    c.appendChild(div);
  });
}

// ── SUSCRIPCIONES ─────────────────────────────────────────
var SUBS = [
  {n:"AT&T Personal",          abr:1420,may:532, aug:532, note:"-$888 al terminar equipo ✅",biz:false},
  {n:"AT&T Smability/AireGPT", abr:279, may:279, aug:279, note:"Gasto negocio",             biz:true},
  {n:"Apple (iCloud ×2)",      abr:218, may:218, aug:218, note:"$169 + $49",                 biz:false},
  {n:"Claude (Anthropic)",     abr:373, may:373, aug:373, note:"Trabajo/Smability",          biz:true},
  {n:"Google One",             abr:395, may:395, aug:395, note:"⚠️ Revisar tier",            biz:false},
  {n:"AWS",                    abr:1800,may:1200,aug:1200,note:"Bajado May -$600 ✅",         biz:true},
  {n:"OpenAI (tokens)",        abr:50,  may:50,  aug:50,  note:"~$5 USD c/3 meses",          biz:true},
  {n:"AireGPT (Stripe)",       abr:49,  may:49,  aug:49,  note:"Esencial",                   biz:true},
  {n:"Amazon Prime",           abr:75,  may:75,  aug:0,   note:"Termina Jul ✅",              biz:false},
  {n:"Canva",                  abr:0,   may:0,   aug:0,   note:"Ya pagada ✅",                biz:true},
];

function renderSubscriptions() {
  var tb = document.getElementById("subs-tbody");
  var tf = document.getElementById("subs-tfoot");
  if (!tb) return;
  tb.innerHTML = "";
  var ta=0,tm=0,tg=0;
  SUBS.forEach(function(s) {
    ta+=s.abr; tm+=s.may; tg+=s.aug;
    var tr = document.createElement("tr");
    if (s.biz) tr.className = "sub-row--biz";
    tr.innerHTML =
      "<td>"+s.n+"</td>" +
      "<td class='text-right"+(s.abr>500?" text-red":"")+"'>"+(s.abr>0?fmt(s.abr):"—")+"</td>" +
      "<td class='text-right"+(s.may<s.abr?" text-green":"")+"'>"+(s.may>0?fmt(s.may):"—")+"</td>" +
      "<td class='text-right"+(s.aug<s.may?" text-green":"")+"'>"+(s.aug>0?fmt(s.aug):"—")+"</td>" +
      "<td class='text-muted'>"+s.note+"</td>";
    tb.appendChild(tr);
  });
  if (tf) tf.innerHTML =
    "<td><strong>Total</strong></td>" +
    "<td class='text-right text-red'><strong>"+fmt(ta)+"</strong></td>" +
    "<td class='text-right text-yellow'><strong>"+fmt(tm)+"</strong></td>" +
    "<td class='text-right text-green'><strong>"+fmt(tg)+"</strong></td>" +
    "<td class='text-green text-muted'>-"+fmt(ta-tg)+" vs Abr</td>";
}

// ── TIMELINE ──────────────────────────────────────────────
function renderTimeline() {
  var events = [
    {d:"15-Jun",l:"Iniciar expediente hipotecario con broker",s:"upcoming"},
    {d:"30-Jun",l:"PIVOTE — Banorte: $250k → $70k",          s:"pivote"},
    {d:"Jul",   l:"Seguimiento + Banorte liquidándose",       s:"upcoming"},
    {d:"30-Ago",l:"2ª revisión buró — Score ~745 · Tasa blindada", s:"critical"},
    {d:"Sep",   l:"Firma escrituras hipoteca",                s:"upcoming"},
    {d:"1-Oct", l:"🏁 Hipoteca activa · Deuda = $0",         s:"win"},
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

// ── HISTORIAL ─────────────────────────────────────────────
async function loadHistory() {
  var c = document.getElementById("history-log");
  if (!c) return;
  var r = await SHEETS.getHistory("audit_log");
  if (!r.success || !r.data || !r.data.length) {
    c.innerHTML = '<div class="text-muted">Sin historial aún.</div>';
    return;
  }
  c.innerHTML = r.data.slice(-10).reverse().map(function(row){
    return '<div class="history-row">' +
      '<span class="history-date">'+(row.timestamp||"").split("T")[0]+'</span>' +
      '<span class="history-action">'+(row.action||"—")+'</span>' +
      '<span class="history-detail">'+(row.notes||"")+'</span>' +
    '</div>';
  }).join("");
}

// ── EVENTOS DEUDAS ────────────────────────────────────────
function bindEvents() {
  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-edit")) return;
    if (e.target.classList.contains("ei-btn-edit")) return;
    var key = e.target.dataset.key;
    document.getElementById("edit-"+key).style.display = "block";
    document.getElementById("bal-"+key).style.display  = "none";
    e.target.style.display = "none";
    var inp = document.getElementById("inp-"+key);
    if (inp) { inp.focus(); inp.select(); }
  });

  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-cancel")) return;
    if (e.target.classList.contains("ei-cancel")) return;
    closeEdit(e.target.dataset.key);
  });

  document.addEventListener("click", function(e) {
    if (!e.target.classList.contains("btn-save")) return;
    if (e.target.classList.contains("ei-save")) return;
    saveDebt(e.target.dataset.key);
  });

  document.addEventListener("keydown", function(e) {
    if (e.key !== "Enter" || !e.target.classList.contains("debt-input")) return;
    var id = e.target.id;
    if (id.startsWith("ei-")) return;
    saveDebt(id.replace("inp-","").replace("note-",""));
  });

  var btnRev = document.getElementById("btn-revert");
  if (btnRev) btnRev.addEventListener("click", async function() {
    if (!confirm("¿Revertir al snapshot anterior?")) return;
    var r = await SHEETS.revertLast();
    showToast(r.success ? "✅ Revertido" : "❌ Error");
    if (r.success) {
      sessionStorage.removeItem("debt_state");
      await loadSavedState();
      renderCounters();
      renderDebtCards();
      await loadHistory();
    }
  });

  var btnSync = document.getElementById("btn-sync");
  if (btnSync) btnSync.addEventListener("click", async function() {
    var r = await SHEETS.syncPending();
    showToast("✅ Sync: "+r.synced+" · Pendientes: "+r.remaining);
  });
}

function closeEdit(key) {
  document.getElementById("edit-"+key).style.display = "none";
  document.getElementById("bal-"+key).style.display  = "block";
  var btn = document.querySelector(".btn-edit[data-key='"+key+"']");
  if (btn) btn.style.display = "block";
}

async function saveDebt(key) {
  var inp   = document.getElementById("inp-"+key);
  var noteEl= document.getElementById("note-"+key);
  if (!inp) return;
  var newBal = parseFloat(inp.value);
  if (isNaN(newBal) || newBal < 0) { showToast("⚠️ Monto inválido"); return; }
  var notes = noteEl ? noteEl.value : "";
  var old   = CONFIG.debts[key].balance;

  CONFIG.debts[key].balance = newBal;
  var balEl = document.getElementById("bal-"+key);
  if (balEl) balEl.textContent = fmt(newBal);
  closeEdit(key);
  showToast("⏳ Guardando...");

  await SHEETS.updateDebt(key, newBal, key+": $"+old+" → $"+newBal+(notes?". "+notes:""));
  await SHEETS.saveSnapshot({ notes:"Actualización "+key+(notes?": "+notes:"") });

  sessionStorage.setItem("debt_state", JSON.stringify({
    banorte:       CONFIG.debts.banorte.balance,
    banamexNomina: CONFIG.debts.banamexNomina.balance,
    banamexTDC:    CONFIG.debts.banamexTDC.balance,
    nu:            CONFIG.debts.nu.balance,
    savedAt:       new Date().toISOString(),
    notes:         notes
  }));

  renderCounters();
  renderDebtCards();
  set("last-updated", new Date().toLocaleDateString("es-MX",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}));
  showToast("✅ "+CONFIG.debts[key].label+" actualizado");
}

// ── UTILIDADES ────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(n);
}
function fmtDate(d) {
  if (!d) return "—";
  var p = d.split("-");
  var months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return (p[2]||"")+" "+(months[parseInt(p[1])-1]||"")+" "+(p[0]||"");
}
function val(id)       { var el=document.getElementById(id); return el?el.value.trim():""; }
function set(id,v)     { var el=document.getElementById(id); if(el) el.textContent=v; }
function setStyle(id,p,v){ var el=document.getElementById(id); if(el) el.style[p]=v; }
function badge(c,t)    { return '<span class="badge badge--'+c+'">'+t+'</span>'; }
function escHtml(s)    { return String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;"); }
function showToast(msg) {
  var t=document.getElementById("toast");
  if(!t) return;
  t.textContent=msg;
  t.classList.add("toast--visible");
  clearTimeout(t._timer);
  t._timer=setTimeout(function(){ t.classList.remove("toast--visible"); },3000);
}

// ── START ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
