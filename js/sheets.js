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
      var cb      = "cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
      var settled = false;   // evita doble resolve

      function cleanup(success) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // No eliminar window[cb] hasta después — GAS puede llamarlo
        // levemente después del timeout. Lo limpiamos con un delay corto.
        setTimeout(function () { delete window[cb]; }, 500);
        var el = document.getElementById("jsonp_" + cb);
        if (el) el.remove();
        self._connected = success;
        updateConnectionDot();
      }

      var url = CONFIG.sheetApiBase +
        "?action=getHistory" +
        "&sheet="    + encodeURIComponent(sheet) +
        "&token="    + encodeURIComponent(CONFIG.appToken) +
        "&callback=" + cb;

      // Timeout generoso — GAS en cold start puede tardar 10-15s
      var timer = setTimeout(function () {
        cleanup(false);
        resolve({ success: false, data: [], error: "timeout" });
      }, 20000);

      // Callback global que GAS invocará
      window[cb] = function (data) {
        cleanup(true);
        resolve(data);
      };

      // Inyectar script tag
      var script = document.createElement("script");
      script.id  = "jsonp_" + cb;
      script.src = url;
      script.onerror = function () {
        cleanup(false);
        resolve({ success: false, data: [], error: "load error" });
      };
      document.head.appendChild(script);
    });
  },

  // ── POST via Netlify Function proxy ──────────────────
  // El browser no puede hacer POST directo a GAS (CORS + redirect).
  // /api/sheets-proxy reenvía server-side sin restricciones.
  _post: async function (payload) {
    try {
      var response = await fetch("/api/sheets-proxy", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload)
      });

      var result = await response.json();
      var ok = response.ok && result.success !== false;
      this._connected = ok;
      updateConnectionDot();

      if (!ok) console.warn("Proxy error:", result.error || response.status);
      return ok ? { success: true } : { success: false, error: result.error };

    } catch (err) {
      this._connected = false;
      updateConnectionDot();
      console.warn("Sheets proxy offline:", err.message);
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
