// ============================================================
// SHEETS.JS — Conexión Google Sheets via Apps Script Webhook
// ============================================================

import { CONFIG } from './config.js';

const SHEETS = {

  // ── GUARDAR SNAPSHOT MENSUAL ───────────────────────────
  async saveSnapshot(data) {
    const payload = {
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
    };
    return await this._post(payload);
  },

  // ── ACTUALIZAR SALDO DE DEUDA ──────────────────────────
  async updateDebt(debtKey, newBalance, notes = "") {
    const payload = {
      action: "updateDebt",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: { debtKey, newBalance, notes }
    };
    return await this._post(payload);
  },

  // ── REGISTRAR TRANSACCIÓN ──────────────────────────────
  async logTransaction(tx) {
    const payload = {
      action: "logTransaction",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString(),
      data: {
        date: tx.date || new Date().toISOString().split('T')[0],
        type: tx.type,       // "payment" | "income" | "expense"
        source: tx.source,
        target: tx.target,
        amount: tx.amount,
        notes: tx.notes || ""
      }
    };
    return await this._post(payload);
  },

  // ── OBTENER HISTORIAL ──────────────────────────────────
  async getHistory(sheet = "monthly_snapshots") {
    try {
      const url = `${CONFIG.sheetApiBase}?action=getHistory&sheet=${sheet}&token=${CONFIG.appToken}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error("SHEETS getHistory error:", err);
      return { success: false, data: [], error: err.message };
    }
  },

  // ── OBTENER ÚLTIMO SNAPSHOT ────────────────────────────
  async getLatestSnapshot() {
    const history = await this.getHistory("monthly_snapshots");
    if (!history.success || !history.data.length) return null;
    return history.data[history.data.length - 1];
  },

  // ── REVERTIR AL ANTERIOR ───────────────────────────────
  async revertLast() {
    const payload = {
      action: "revertLast",
      token: CONFIG.appToken,
      timestamp: new Date().toISOString()
    };
    return await this._post(payload);
  },

  // ── POST INTERNO ───────────────────────────────────────
  async _post(payload) {
    try {
      const res = await fetch(CONFIG.sheetApiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Unknown error");
      return json;
    } catch (err) {
      console.error("SHEETS _post error:", err);
      // Guardar en localStorage como fallback
      this._localFallback(payload);
      return { success: false, error: err.message, fallback: true };
    }
  },

  // ── FALLBACK LOCAL ─────────────────────────────────────
  _localFallback(payload) {
    const key = `debt_fallback_${Date.now()}`;
    const existing = JSON.parse(sessionStorage.getItem('debt_pending') || '[]');
    existing.push({ key, payload, savedAt: new Date().toISOString() });
    sessionStorage.setItem('debt_pending', JSON.stringify(existing));
    console.warn("Guardado en fallback local — sincronizar cuando haya conexión");
  },

  // ── SINCRONIZAR PENDIENTES ─────────────────────────────
  async syncPending() {
    const pending = JSON.parse(sessionStorage.getItem('debt_pending') || '[]');
    if (!pending.length) return { synced: 0 };
    const results = [];
    for (const item of pending) {
      const res = await this._post(item.payload);
      if (res.success) results.push(item.key);
    }
    const remaining = pending.filter(p => !results.includes(p.key));
    sessionStorage.setItem('debt_pending', JSON.stringify(remaining));
    return { synced: results.length, remaining: remaining.length };
  }
};

export { SHEETS };
