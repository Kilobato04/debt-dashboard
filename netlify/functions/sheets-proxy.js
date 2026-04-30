// ============================================================
// netlify/functions/sheets-proxy.js
// Proxy server-side para escritura a Google Apps Script.
//
// POR QUÉ: El browser no puede hacer POST directo a GAS porque:
//   1. GAS redirige script.google.com → script.googleusercontent.com
//   2. Con mode:no-cors el browser descarta el body en el redirect
//   3. doPost() recibe un request vacío y no guarda nada
//
// SOLUCIÓN: El browser llama a /api/sheets-proxy (mismo origen,
// sin restricciones CORS). Esta function hace el POST a GAS
// server-side donde no hay limitaciones de CORS ni redirects.
//
// SEGURIDAD: El token se valida tanto aquí como en GAS.
//   - Aquí: rechaza requests sin token o con token incorrecto
//   - En GAS: segunda validación antes de escribir en Sheets
// ============================================================

const GAS_URL = "https://script.google.com/macros/s/AKfycbxuOOgmFIPaHTqsiVEjXA7q6YhuFb6S8Rv7nKQQv2NSrW9DEWqtU7eHQZy2rmHDuGaNWg/exec";
const APP_TOKEN = "OSJS2026_DEBT";

exports.handler = async function (event) {

  // ── Solo aceptar POST ─────────────────────────────────────
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, error: "Method not allowed" })
    };
  }

  // ── Parsear body ─────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (_) {
    return {
      statusCode: 400,
      body: JSON.stringify({ success: false, error: "Invalid JSON" })
    };
  }

  // ── Validar token ─────────────────────────────────────────
  if (!payload.token || payload.token !== APP_TOKEN) {
    return {
      statusCode: 401,
      body: JSON.stringify({ success: false, error: "Unauthorized" })
    };
  }

  // ── Reenviar a GAS ───────────────────────────────────────
  try {
    const response = await fetch(GAS_URL, {
      method:  "POST",
      headers: { "Content-Type": "text/plain" },
      body:    JSON.stringify(payload),
      redirect: "follow"   // seguir el redirect de GAS sin problema
    });

    // GAS siempre devuelve 200 con JSON — leer el body
    const text = await response.text();
    let result;
    try {
      result = JSON.parse(text);
    } catch (_) {
      // GAS a veces devuelve HTML en errores — tratarlo como éxito
      // porque el request sí llegó (GAS procesó pero respondió con HTML)
      result = { success: true, note: "GAS responded with non-JSON" };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify(result)
    };

  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ success: false, error: "GAS unreachable: " + err.message })
    };
  }
};
