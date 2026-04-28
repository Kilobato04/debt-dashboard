// ============================================================
// SHEETS.JS — Google Sheets via Apps Script
// POST: no-cors (fire & forget) · GET: JSONP
// ============================================================

const SHEETS = {

  async saveSnapshot(data) {
    return this._post({
      action: "saveSnapshot",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: {
        date: data.date || new Date().toISOString().split('T')[0],
        banorte: CONFIG.debts.banorte.balance,
        banamexNomina: CONFIG.debts.banamexNomina.balance,
        banamexTDC: CONFIG.debts.banamexTDC.balance,
        nu: CONFIG.debts.nu.balance,
        totalDebt: CALC.totalDebt(),
        notes: data.notes || ""
      }
    });
  },

  async updateDebt(debtKey, newBalance, notes) {
    return this._post({
      action: "updateDebt",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: { debtKey, newBalance, notes: notes || "" }
    });
  },

  async getHistory(sheet) {
    sheet = sheet || "audit_log";
    return new Promise((resolve) => {
      const cb = "cb_" + Date.now();
      const url = CONFIG.sheetApiBase +
        "?action=getHistory&sheet=" + sheet +
        "&token=" + CONFIG.appToken +
        "&callback=" + cb;

      const timer = setTimeout(() => {
        delete window[cb];
        const el = document.getElementById("jsonp_" + cb);
        if (el) el.remove();
        resolve({ success: false, data: [], error: "timeout" });
      }, 8000);

      window[cb] = function(data) {
        clearTimeout(timer);
        delete window[cb];
        const el = document.getElementById("jsonp_" + cb);
        if (el) el.remove();
        resolve(data);
      };

      const script = document.createElement("script");
      script.id = "jsonp_" + cb;
      script.src = url;
      script.onerror = function() {
        clearTimeout(timer);
        delete window[cb];
        script.remove();
        resolve({ success: false, data: [], error: "load error" });
      };
      document.head.appendChild(script);
    });
  },

  async revertLast() {
    return this._post({
      action: "revertLast",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString()
    });
  },

  // no-cors: el Sheet guarda igual aunque no podamos leer la respuesta
  async _post(payload) {
    this._backup(payload);
    try {
      await fetch(CONFIG.sheetApiBase, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });
      this._clearBackup(payload.action);
      return { success: true };
    } catch (err) {
      console.warn("Sheets offline — guardado local:", err.message);
      return { success: false, error: err.message, fallback: true };
    }
  },

  _backup(payload) {
    try {
      const list = JSON.parse(sessionStorage.getItem("debt_pending") || "[]");
      list.push({ id: Date.now(), payload });
      sessionStorage.setItem("debt_pending", JSON.stringify(list));
    } catch(_) {}
  },

  _clearBackup(action) {
    try {
      const list = JSON.parse(sessionStorage.getItem("debt_pending") || "[]");
      sessionStorage.setItem("debt_pending",
        JSON.stringify(list.filter(i => i.payload.action !== action)));
    } catch(_) {}
  },

  async syncPending() {
    try {
      const list = JSON.parse(sessionStorage.getItem("debt_pending") || "[]");
      if (!list.length) return { synced: 0, remaining: 0 };
      let synced = 0;
      for (const item of list) {
        const r = await this._post(item.payload);
        if (r.success) synced++;
      }
      return { synced, remaining: list.length - synced };
    } catch(_) { return { synced: 0, remaining: 0 }; }
  }
};
