// ============================================================
// SHEETS.JS — Conexión Google Sheets via Apps Script
// Solución CORS: POST con no-cors + GET con JSONP
// ============================================================

import { CONFIG } from './config.js';

const SHEETS = {

  // ── GUARDAR SNAPSHOT ──────────────────────────────────
  async saveSnapshot(data) {
    return await this._post({
      action: "saveSnapshot",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: {
        date: data.date || new Date().toISOString().split('T')[0],
        banorte: data.banorte,
        banamexNomina: data.banamexNomina,
        banamexTDC: data.banamexTDC,
        nu: data.nu,
        totalDebt: data.totalDebt,
        notes: data.notes || ""
      }
    });
  },

  // ── ACTUALIZAR SALDO ──────────────────────────────────
  async updateDebt(debtKey, newBalance, notes = "") {
    return await this._post({
      action: "updateDebt",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: { debtKey, newBalance, notes }
    });
  },

  // ── REGISTRAR TRANSACCIÓN ─────────────────────────────
  async logTransaction(tx) {
    return await this._post({
      action: "logTransaction",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: {
        date: tx.date || new Date().toISOString().split('T')[0],
        type: tx.type,
        source: tx.source,
        target: tx.target,
        amount: tx.amount,
        notes: tx.notes || ""
      }
    });
  },

  // ── OBTENER HISTORIAL (JSONP) ──────────────────────────
  async getHistory(sheet = "audit_log") {
    return new Promise((resolve) => {
      const cbName = `cb_${Date.now()}`;
      const url = `${CONFIG.sheetApiBase}?action=getHistory&sheet=${sheet}&token=${CONFIG.appToken}&callback=${cbName}`;

      const timeout = setTimeout(() => {
        delete window[cbName];
        const script = document.getElementById(`jsonp_${cbName}`);
        if (script) script.remove();
        console.warn("SHEETS getHistory timeout — usando fallback local");
        resolve({ success: false, data: [], error: "timeout" });
      }, 8000);

      window[cbName] = (data) => {
        clearTimeout(timeout);
        delete window[cbName];
        const script = document.getElementById(`jsonp_${cbName}`);
        if (script) script.remove();
        resolve(data);
      };

      const script = document.createElement("script");
      script.id = `jsonp_${cbName}`;
      script.src = url;
      script.onerror = () => {
        clearTimeout(timeout);
        delete window[cbName];
        script.remove();
        resolve({ success: false, data: [], error: "script load error" });
      };
      document.head.appendChild(script);
    });
  },

  // ── OBTENER ÚLTIMO SNAPSHOT ───────────────────────────
  async getLatestSnapshot() {
    const history = await this.getHistory("monthly_snapshots");
    if (!history.success || !history.data.length) return null;
    return history.data[history.data.length - 1];
  },

  // ── REVERTIR ÚLTIMO ───────────────────────────────────
  async revertLast() {
    return await this._post({
      action: "revertLast",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString()
    });
  },

  // ── POST con no-cors (fire & forget) ──────────────────
  // Apps Script no devuelve headers CORS en POST,
  // así que usamos no-cors y asumimos éxito si no hay network error.
  // El dato se guarda igual en el Sheet aunque no podamos leer la respuesta.
  async _post(payload) {
    // Guardar siempre en local primero como backup
    this._localBackup(payload);

    try {
      await fetch(CONFIG.sheetApiBase, {
        method: "POST",
        mode: "no-cors",           // evita el bloqueo CORS
        headers: { "Content-Type": "text/plain" }, // no-cors solo permite simple headers
        body: JSON.stringify(payload)
      });
      // Con no-cors no podemos leer la respuesta, pero si no hay error = éxito
      this._clearLocalBackup(payload);
      return { success: true, mode: "no-cors" };

    } catch (err) {
      console.warn("SHEETS _post error — datos guardados localmente:", err.message);
      return { success: false, error: err.message, fallback: true };
    }
  },

  // ── BACKUP LOCAL ──────────────────────────────────────
  _localBackup(payload) {
    try {
      const key = `debt_pending`;
      const existing = JSON.parse(sessionStorage.getItem(key) || '[]');
      const entry = { id: Date.now(), payload, savedAt: new Date().toISOString() };
      existing.push(entry);
      sessionStorage.setItem(key, JSON.stringify(existing));
    } catch (_) {}
  },

  _clearLocalBackup(payload) {
    try {
      const key = `debt_pending`;
      const existing = JSON.parse(sessionStorage.getItem(key) || '[]');
      // Eliminar entradas con el mismo action que acabamos de enviar
      const cleaned = existing.filter(e => e.payload.action !== payload.action);
      sessionStorage.setItem(key, JSON.stringify(cleaned));
    } catch (_) {}
  },

  // ── SINCRONIZAR PENDIENTES ────────────────────────────
  async syncPending() {
    try {
      const pending = JSON.parse(sessionStorage.getItem('debt_pending') || '[]');
      if (!pending.length) return { synced: 0 };
      let synced = 0;
      for (const item of pending) {
        const res = await this._post(item.payload);
        if (res.success) synced++;
      }
      return { synced, remaining: pending.length - synced };
    } catch (_) {
      return { synced: 0 };
    }
  }
};

export { SHEETS };
