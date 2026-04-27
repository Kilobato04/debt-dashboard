// ============================================================
// APP.JS — Lógica principal del dashboard
// ============================================================

import { CONFIG, CALC } from './config.js';
import { SHEETS } from './sheets.js';

// ── AUTH TOKEN ────────────────────────────────────────────
function checkAuth() {
  const stored = sessionStorage.getItem('debt_token');
  if (stored === CONFIG.appToken) return true;
  const input = prompt("Ingresa tu token de acceso:");
  if (input === CONFIG.appToken) {
    sessionStorage.setItem('debt_token', input);
    return true;
  }
  document.body.innerHTML = `<div class="auth-error">Acceso denegado.</div>`;
  return false;
}

// ── INIT ──────────────────────────────────────────────────
async function init() {
  if (!checkAuth()) return;
  renderCounters();
  renderDebtCards();
  renderMonthlyPlan();
  renderSubscriptions();
  renderPerfectMonth();
  renderTimeline();
  await loadAndRenderHistory();
  bindEvents();
  await SHEETS.syncPending();
}

// ── COUNTERS ──────────────────────────────────────────────
function renderCounters() {
  const totalDebt = CALC.totalDebt();
  const daysToTarget = CALC.daysToTarget();
  const daysToPivote = CALC.daysToPivote();
  const surplus = CALC.surplusForDebt("2026-06");

  set("total-debt", fmt(totalDebt));
  set("days-to-target", daysToTarget);
  set("days-to-pivote", daysToPivote);
  set("monthly-surplus", fmt(surplus));
  set("buro-score", CONFIG.buro.currentScore);
  set("infonavit-balance", fmt(CONFIG.infonavit.currentBalance));

  // Barra de progreso deuda
  const startDebt = 443499;
  const pct = Math.round(((startDebt - totalDebt) / startDebt) * 100);
  setStyle("debt-progress-fill", "width", `${pct}%`);
  set("debt-progress-pct", `${pct}% liquidado`);
}

// ── TARJETAS DE DEUDA ─────────────────────────────────────
function renderDebtCards() {
  const container = document.getElementById("debt-cards");
  if (!container) return;
  container.innerHTML = "";

  Object.entries(CONFIG.debts).forEach(([key, debt]) => {
    const interest = CALC.monthlyInterest(key);
    const isFloat = debt.type === "float";
    const utilPct = debt.creditLimit
      ? Math.round((debt.balance / debt.creditLimit) * 100)
      : null;

    const semaforo = debt.balance === 0 ? "green"
      : debt.rate > 30 ? "red"
      : debt.rate > 15 ? "yellow"
      : "green";

    const card = document.createElement("div");
    card.className = `debt-card debt-card--${semaforo}`;
    card.innerHTML = `
      <div class="debt-card__header">
        <span class="debt-card__label">${debt.label}</span>
        <span class="debt-card__dot debt-card__dot--${semaforo}"></span>
      </div>
      <div class="debt-card__balance">${isFloat ? "~" : ""}${fmt(debt.balance)}</div>
      ${debt.rate > 0 ? `<div class="debt-card__rate">${debt.rate}% anual · <span class="text-red">${fmt(interest)}/mes interés</span></div>` : ""}
      ${debt.minPayment > 0 ? `<div class="debt-card__min">Mín: ${fmt(debt.minPayment)}</div>` : ""}
      ${utilPct !== null ? `<div class="debt-card__util">Utilización: ${utilPct}%</div>` : ""}
      ${isFloat ? `<div class="debt-card__note">Float corriente — no es deuda estructural</div>` : ""}
      <button class="btn-update" data-key="${key}">Actualizar saldo</button>
    `;
    container.appendChild(card);
  });
}

// ── PLAN MENSUAL ──────────────────────────────────────────
const MONTHS = [
  {
    id: "apr", label: "Abril", emoji: "🔴", status: "urgent",
    income: [ ["Nómina neta", 79988], ["Hermana (15-Abr)", 2500], ["Hermana (fin-Abr)", 2000] ],
    expenses: [ ["Gastos fijos + variables", -45620], ["TDC Banamex (liquidar)", -14892], ["Banorte mínimo ⚠️", -13544] ],
    surplus: 9454, target: "banamexNomina",
    balances: { banorte: 250676, banamexNomina: 152000, banamexTDC: 0 },
    tasks: [
      { hot: true,  text: "Pagar TDC Banamex completa (ya venció corte)" },
      { hot: true,  text: "Pagar mínimo Banorte antes del 14-Abr: $13,544" },
      { hot: true,  text: "15-Abr: $2,500 hermana → Banamex Nómina" },
      { hot: true,  text: "Pagar Nu antes del 4-May (corte): $11,941" },
      { hot: false, text: "Abrir aclaración Mercado Pago en Banorte (plazo: 25-Jun)" },
      { hot: false, text: "Confirmar PTU con RRHH · offcycle con manager" }
    ]
  },
  {
    id: "may", label: "Mayo", emoji: "🟣", status: "key",
    income: [ ["Nómina neta + vales", 83388], ["PTU estimado ⬆️ puede ser mayor", 45000], ["Nu corte 4-May (pago)", -11941] ],
    expenses: [ ["Gastos fijos + variables", -45620], ["Banorte mínimo", -13544] ],
    surplus: 57283, target: "banamexNomina",
    balances: { banorte: 250676, banamexNomina: 69000, banamexTDC: 0 },
    tasks: [
      { hot: true,  text: "Pagar $13,544 mínimo Banorte antes del 14-May" },
      { hot: true,  text: "PTU → Banamex Nómina ese mismo día" },
      { hot: false, text: "Llamar a Banamex: confirmar condiciones de redisposición para 30-Jun" },
      { hot: false, text: "Preguntar periodo de enfriamiento tras liquidar" }
    ]
  },
  {
    id: "jun", label: "Junio", emoji: "🔄", status: "pivot",
    income: [ ["Nómina + vales + offcycle 2.5%", 86388], ["Smability (1a parte)", 30000] ],
    expenses: [ ["Gastos fijos + variables", -45620], ["Banorte mínimo", -13544] ],
    surplus: 57224, target: "banamexNomina",
    balances: { banorte: 70000, banamexNomina: 180000, banamexTDC: 0 },
    pivote: true,
    tasks: [
      { hot: true,  text: "15-Jun: iniciar expediente hipotecario con broker" },
      { hot: true,  text: "Semana 23-Jun: confirmar redisposición con Banamex" },
      { hot: true,  text: "30-Jun paso 1: liquidar saldo Banamex Nómina" },
      { hot: true,  text: "30-Jun paso 2: redisponer $180k" },
      { hot: true,  text: "30-Jun paso 3: SPEI $180k → Banorte" },
      { hot: false, text: "Si aclaración MP resuelta → aplicar antes del 30-Jun" }
    ]
  },
  {
    id: "jul", label: "Julio", emoji: "🟢", status: "good",
    income: [ ["Nómina + vales + offcycle 2.5%", 86388], ["Smability (2a parte)", 20000] ],
    expenses: [ ["Gastos fijos + variables", -45620], ["Cuota Banamex Nómina", -5500] ],
    surplus: 55268, target: "banorte",
    balances: { banorte: 15000, banamexNomina: 188000, banamexTDC: 0 },
    tasks: [
      { hot: true,  text: "Liquidar Banorte completo (~$15k restantes)" },
      { hot: false, text: "Seguimiento expediente hipotecario" },
      { hot: false, text: "Amazon Prime termina este mes — no renovar" }
    ]
  },
  {
    id: "aug", label: "Agosto", emoji: "🟢", status: "good",
    income: [ ["Nómina + vales + offcycle 2.5%", 86388], ["Smability (3a parte)", 30000] ],
    expenses: [ ["Gastos fijos + variables (sin Amazon)", -45545], ["Cerrar Banorte (~$15k)", -15000] ],
    surplus: 55843, target: "banamexNomina",
    balances: { banorte: 0, banamexNomina: 118000, banamexTDC: 0 },
    tasks: [
      { hot: true,  text: "Smability $30k: cerrar Banorte primero, resto a Banamex" },
      { hot: true,  text: "30-Ago: segunda revisión buró — Banorte $0 · Score ~745" },
      { hot: false, text: "Seguimiento trámite hipotecario" }
    ]
  },
  {
    id: "sep", label: "Septiembre", emoji: "🟢", status: "good",
    income: [ ["Nómina + vales + offcycle 2.5%", 86388], ["Apoyo familiar (30-Sep)", 35000] ],
    expenses: [ ["Gastos fijos + variables", -45545] ],
    surplus: 75843, target: "banamexNomina",
    balances: { banorte: 0, banamexNomina: 38000, banamexTDC: 0 },
    tasks: [
      { hot: true,  text: "30-Sep: apoyo familiar → Banamex Nómina ese día" },
      { hot: true,  text: "Firmar escrituras hipoteca (inicio 1-Oct)" }
    ]
  },
  {
    id: "oct", label: "1-Oct 🏁", emoji: "🏁", status: "win",
    balances: { banorte: 0, banamexNomina: 0, banamexTDC: 0 },
    tasks: []
  }
];

function renderMonthlyPlan() {
  const container = document.getElementById("monthly-plan");
  if (!container) return;
  container.innerHTML = "";

  MONTHS.forEach(m => {
    const totalIn = (m.income || []).reduce((s, [, v]) => s + (v > 0 ? v : 0), 0);
    const totalOut = Math.abs((m.expenses || []).reduce((s, [, v]) => s + (v < 0 ? v : 0), 0));

    const div = document.createElement("div");
    div.className = `month-block month-block--${m.status}`;
    div.id = `month-${m.id}`;
    div.innerHTML = `
      <div class="month-block__header">
        <div class="month-block__title">${m.emoji} ${m.label}</div>
        <div class="month-block__balances">
          <span class="badge badge--red">Banorte ${fmt(m.balances.banorte)}</span>
          <span class="badge badge--yellow">Bco Nóm ${fmt(m.balances.banamexNomina)}</span>
          <span class="badge badge--green">TDC $0</span>
        </div>
      </div>

      ${m.income ? `
      <div class="month-block__section">
        <div class="month-block__section-title">Entradas</div>
        ${m.income.map(([label, val]) => `
          <div class="month-row">
            <span>${label}</span>
            <span class="${val > 0 ? 'text-green' : 'text-red'}">${val > 0 ? "+" : ""}${fmt(val)}</span>
          </div>`).join("")}
      </div>` : ""}

      ${m.expenses ? `
      <div class="month-block__section">
        <div class="month-block__section-title">Salidas</div>
        ${m.expenses.map(([label, val]) => `
          <div class="month-row">
            <span>${label}</span>
            <span class="text-red">${fmt(val)}</span>
          </div>`).join("")}
      </div>` : ""}

      ${m.surplus ? `
      <div class="month-block__surplus">
        <span>Excedente para deuda</span>
        <span class="text-purple">${fmt(m.surplus)}</span>
      </div>` : ""}

      ${m.pivote ? `
      <div class="month-block__pivote">
        🔄 PIVOTE 30-Jun: Banamex $0 → Redisponer $180k → SPEI a Banorte
      </div>` : ""}

      ${m.tasks?.length ? `
      <div class="month-block__tasks">
        ${m.tasks.map(t => `
          <label class="task ${t.hot ? "task--hot" : ""}">
            <input type="checkbox" data-month="${m.id}">
            <span>${t.text}</span>
          </label>`).join("")}
      </div>` : ""}

      ${m.status === "win" ? `
      <div class="month-block__win">
        🎯 Banorte $0 · Banamex $0 · Nu flujo corriente · Hipoteca activa
      </div>` : ""}
    `;
    container.appendChild(div);
  });
}

// ── SUSCRIPCIONES ─────────────────────────────────────────
const SUBS = [
  { name: "AT&T Personal", abr: 1420, may: 532, aug: 532, note: "-$888 al terminar equipo ✅", type: "personal" },
  { name: "AT&T Smability/AireGPT", abr: 279, may: 279, aug: 279, note: "Gasto negocio", type: "biz" },
  { name: "Apple (iCloud × 2)", abr: 218, may: 218, aug: 218, note: "$169 + $49", type: "personal" },
  { name: "Claude (Anthropic)", abr: 373, may: 373, aug: 373, note: "Trabajo/Smability", type: "biz" },
  { name: "Google One", abr: 395, may: 395, aug: 395, note: "⚠️ Revisar tier", type: "personal" },
  { name: "AWS", abr: 1800, may: 1200, aug: 1200, note: "Bajado May -$600 ✅", type: "biz" },
  { name: "OpenAI (tokens)", abr: 50, may: 50, aug: 50, note: "~$5 USD c/3 meses", type: "biz" },
  { name: "AireGPT (Stripe)", abr: 49, may: 49, aug: 49, note: "Esencial", type: "biz" },
  { name: "Amazon Prime", abr: 75, may: 75, aug: 0, note: "Termina Jul ✅", type: "personal" },
  { name: "Canva", abr: 0, may: 0, aug: 0, note: "Ya pagada ✅", type: "biz" },
];

function renderSubscriptions() {
  const tbody = document.getElementById("subs-tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  let totAbr = 0, totMay = 0, totAug = 0;

  SUBS.forEach(s => {
    totAbr += s.abr; totMay += s.may; totAug += s.aug;
    const tr = document.createElement("tr");
    tr.className = s.type === "biz" ? "sub-row--biz" : "";
    tr.innerHTML = `
      <td>${s.name}</td>
      <td class="text-right ${s.abr > 500 ? 'text-red' : ''}">${s.abr > 0 ? fmt(s.abr) : "—"}</td>
      <td class="text-right ${s.may < s.abr ? 'text-green' : ''}">${s.may > 0 ? fmt(s.may) : "—"}</td>
      <td class="text-right ${s.aug < s.may ? 'text-green' : ''}">${s.aug > 0 ? fmt(s.aug) : "—"}</td>
      <td class="text-muted">${s.note}</td>
    `;
    tbody.appendChild(tr);
  });

  const tfoot = document.getElementById("subs-tfoot");
  if (tfoot) tfoot.innerHTML = `
    <td><strong>Total</strong></td>
    <td class="text-right text-red"><strong>${fmt(totAbr)}</strong></td>
    <td class="text-right text-yellow"><strong>${fmt(totMay)}</strong></td>
    <td class="text-right text-green"><strong>${fmt(totAug)}</strong></td>
    <td class="text-green text-muted">-${fmt(totAbr - totAug)} vs Abr</td>
  `;
}

// ── MES PERFECTO ──────────────────────────────────────────
function renderPerfectMonth() {
  const surplus = CALC.surplusForDebt("2026-06");
  set("perfect-surplus", fmt(surplus));
  set("perfect-total-income", fmt(CALC.monthlyIncome("2026-06")));
  set("perfect-total-expenses", fmt(CALC.totalMonthlyExpenses("2026-06")));
}

// ── TIMELINE HIPOTECA ─────────────────────────────────────
function renderTimeline() {
  const events = [
    { date: "15-Jun", label: "Iniciar expediente hipotecario", status: "upcoming" },
    { date: "30-Jun", label: "PIVOTE — Banorte: $250k → $70k", status: "pivote" },
    { date: "15-Jul", label: "Seguimiento expediente + Banorte liquidándose", status: "upcoming" },
    { date: "30-Ago", label: "2a revisión buró — Score ~745 · Tasa blindada", status: "critical" },
    { date: "Sep",    label: "Firma escrituras hipoteca", status: "upcoming" },
    { date: "1-Oct",  label: "🏁 Hipoteca activa · Deuda = $0", status: "win" },
  ];

  const container = document.getElementById("timeline");
  if (!container) return;
  container.innerHTML = events.map(e => `
    <div class="timeline-item timeline-item--${e.status}">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-date">${e.date}</div>
        <div class="timeline-label">${e.label}</div>
      </div>
    </div>
  `).join("");
}

// ── HISTORIAL DESDE SHEETS ────────────────────────────────
async function loadAndRenderHistory() {
  const container = document.getElementById("history-log");
  if (!container) return;
  container.innerHTML = `<div class="loading">Cargando historial...</div>`;

  const result = await SHEETS.getHistory("audit_log");
  if (!result.success || !result.data.length) {
    container.innerHTML = `<div class="text-muted">Sin historial aún. Los cambios aparecerán aquí.</div>`;
    return;
  }

  container.innerHTML = result.data.slice(-10).reverse().map(row => `
    <div class="history-row">
      <span class="history-date">${row.timestamp?.split('T')[0] || "—"}</span>
      <span class="history-action">${row.action || "—"}</span>
      <span class="history-detail">${row.notes || ""}</span>
    </div>
  `).join("");
}

// ── EVENTOS ───────────────────────────────────────────────
function bindEvents() {
  // Actualizar saldo de deuda
  document.addEventListener("click", async e => {
    if (!e.target.classList.contains("btn-update")) return;
    const key = e.target.dataset.key;
    const debt = CONFIG.debts[key];
    if (!debt) return;
    const val = prompt(`Nuevo saldo para ${debt.label} (actual: ${fmt(debt.balance)}):`);
    if (!val || isNaN(+val)) return;
    const newBalance = +val;
    const notes = prompt("Nota (opcional):") || "";

    // Actualizar config en memoria
    CONFIG.debts[key].balance = newBalance;

    // Guardar en Sheets
    const res = await SHEETS.updateDebt(key, newBalance, notes);
    await SHEETS.saveSnapshot({
      date: new Date().toISOString().split('T')[0],
      banorte: CONFIG.debts.banorte.balance,
      banamexNomina: CONFIG.debts.banamexNomina.balance,
      banamexTDC: CONFIG.debts.banamexTDC.balance,
      nu: CONFIG.debts.nu.balance,
      totalDebt: CALC.totalDebt(),
      notes
    });

    // Re-render
    renderCounters();
    renderDebtCards();

    const msg = res.success ? "✅ Saldo actualizado y guardado" : "⚠️ Guardado localmente (sin conexión)";
    showToast(msg);
  });

  // Revertir último cambio
  document.getElementById("btn-revert")?.addEventListener("click", async () => {
    if (!confirm("¿Revertir al snapshot anterior?")) return;
    const res = await SHEETS.revertLast();
    showToast(res.success ? "✅ Revertido al estado anterior" : "❌ Error al revertir");
    if (res.success) await loadAndRenderHistory();
  });

  // Sincronizar pendientes
  document.getElementById("btn-sync")?.addEventListener("click", async () => {
    const res = await SHEETS.syncPending();
    showToast(`✅ Sincronizados: ${res.synced} · Pendientes: ${res.remaining}`);
  });

  // Escenario pareja toggle
  document.getElementById("toggle-partner")?.addEventListener("change", e => {
    CONFIG.scenarioPartner.enabled = e.target.checked;
    document.getElementById("partner-scenario").style.display = e.target.checked ? "block" : "none";
  });

  // Escenario Airbnb toggle
  document.getElementById("toggle-airbnb")?.addEventListener("change", e => {
    CONFIG.airbnb.enabled = e.target.checked;
    document.getElementById("airbnb-scenario").style.display = e.target.checked ? "block" : "none";
  });
}

// ── HELPERS ───────────────────────────────────────────────
function fmt(n) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n);
}

function set(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function setStyle(id, prop, val) {
  const el = document.getElementById(id);
  if (el) el.style[prop] = val;
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("toast--visible");
  setTimeout(() => toast.classList.remove("toast--visible"), 3000);
}

// ── START ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
