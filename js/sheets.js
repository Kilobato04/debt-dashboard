// ============================================================
// SHEETS.JS — Persistencia Google Sheets via Apps Script
// POST: no-cors (fire-and-forget)
// GET:  JSONP (lee datos con callback)
// Depende de: config.js (CONFIG.appToken, CONFIG.sheetApiBase)
// ============================================================

var SHEETS = {
  _connected: false,

  // ── GUARDAR SNAPSHOT COMPLETO ──────────────────────────
  save: async function (notes) {
    notes = notes || "";
    return this._post({
      action:    "saveSnapshot",
      token:     CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: {
        date:          new Date().toISOString().split("T")[0],
        banorte:       CONFIG.debts.banorte.balance,
        banamexNomina: CONFIG.debts.banamexNomina.balance,
        banamexTDC:    CONFIG.debts.banamexTDC.balance,
        nu:            CONFIG.debts.nu.balance,
        totalDebt:     CALC.totalDebt(),
        buroScore:     CONFIG.buro.score,
        notes:         notes
      }
    });
  },

  // ── GUARDAR CONFIG (ingresos, gastos, subs, debtMeta) ──
  saveConfig: async function (section, data, notes) {
    return this._post({
      action:    "saveConfig",
      token:     CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data:      { section: section, payload: data, notes: notes || "" }
    });
  },

  // ── GUARDAR INGRESOS EXTRAORDINARIOS ──────────────────
  saveExtraordinaryIncome: async function (items) {
    return this._post({
      action:    "saveExtraordinaryIncome",
      token:     CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data:      { items: items }
    });
  },

  // ── GUARDAR NOTA MENSUAL ───────────────────────────────
  saveMonthNote: async function (monthId, note) {
    return this._post({
      action:    "saveMonthNote",
      token:     CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data:      { monthId: monthId, note: note }
    });
  },

  // ── REVERTIR ÚLTIMO SNAPSHOT ──────────────────────────
  revertLast: async function () {
    return this._post({
      action:    "revertLast",
      token:     CONFIG.appToken,
      timestamp: new Date().toISOString()
    });
  },

  // ── LEER HOJA (JSONP) ──────────────────────────────────
  // sheet: "monthly_snapshots" | "audit_log" | "extraordinary_income"
  //        "month_notes" | "user_config"
  getHistory: async function (sheet) {
    sheet = sheet || "audit_log";
    var self = this;
    return new Promise(function (resolve) {
      var cb  = "cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      var url = CONFIG.sheetApiBase +
        "?action=getHistory" +
        "&sheet="    + encodeURIComponent(sheet) +
        "&token="    + encodeURIComponent(CONFIG.appToken) +
        "&callback=" + cb;

      // Timeout de seguridad
      var timer = setTimeout(function () {
        delete window[cb];
        var el = document.getElementById("jsonp_" + cb);
        if (el) el.remove();
        self._connected = false;
        updateConnectionDot();
        resolve({ success: false, data: [], error: "timeout" });
      }, 8000);

      // Callback global que Sheets invocará
      window[cb] = function (data) {
        clearTimeout(timer);
        delete window[cb];
        var el = document.getElementById("jsonp_" + cb);
        if (el) el.remove();
        self._connected = true;
        updateConnectionDot();
        resolve(data);
      };

      // Inyectar script tag
      var script = document.createElement("script");
      script.id  = "jsonp_" + cb;
      script.src = url;
      script.onerror = function () {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
        self._connected = false;
        updateConnectionDot();
        resolve({ success: false, data: [], error: "load error" });
      };
      document.head.appendChild(script);
    });
  },

  // ── POST no-cors (fire-and-forget) ────────────────────
  _post: async function (payload) {
    try {
      await fetch(CONFIG.sheetApiBase, {
        method:  "POST",
        mode:    "no-cors",
        headers: { "Content-Type": "text/plain" },
        body:    JSON.stringify(payload)
      });
      this._connected = true;
      updateConnectionDot();
      return { success: true };
    } catch (err) {
      this._connected = false;
      updateConnectionDot();
      console.warn("Sheets offline:", err.message);
      return { success: false, error: err.message };
    }
  }
};

// ── INDICADOR DE CONEXIÓN ──────────────────────────────────
function updateConnectionDot() {
  var dot = document.getElementById("conn-dot");
  var lbl = document.getElementById("conn-label");
  if (!dot) return;
  if (SHEETS._connected) {
    dot.className = "conn-dot conn-dot--green";
    if (lbl) lbl.textContent = "Google Sheets ✓ · DEBT TRACKER PRO";
  } else {
    dot.className = "conn-dot conn-dot--red";
    if (lbl) lbl.textContent = "Sin conexión · datos locales";
  }
}
