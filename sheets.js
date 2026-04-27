// ============================================================
// CONFIG.JS — Variables globales del plan financiero
// Debt Dashboard · Octavio Jimenez · 2026
// ============================================================

const CONFIG = {

  // ── META ────────────────────────────────────────────────
  owner: "Octavio Jimenez",
  targetDate: "2026-10-01",
  pivoteDate: "2026-06-30",
  mortgageStartDate: "2026-06-15",
  secondBuroReview: "2026-08-30",
  appToken: "OSJS2026_DEBT",   // token simple de acceso

  // ── GOOGLE SHEETS ───────────────────────────────────────
  sheetId: "1UXaZTSf5as2RS45esEXyI0x8oRe5ATZCpCPIOHqXrNc",
  sheetApiBase: "https://script.google.com/macros/s/YOUR_WEBAPP_ID/exec",

  // ── DEUDAS ACTUALES ─────────────────────────────────────
  debts: {
    banorte: {
      label: "Banorte TDC",
      balance: 250676,
      rate: 41.55,          // % anual
      minPayment: 13544,
      dueDay: 14,
      color: "#ef4444",
      type: "revolving"
    },
    banamexNomina: {
      label: "Banamex Nómina",
      balance: 168806,
      rate: 22,             // % anual estimada
      minPayment: 4092,
      dueDay: 14,
      color: "#f59e0b",
      type: "installment",
      creditLimit: 180000   // límite para redisposición
    },
    banamexTDC: {
      label: "Banamex TDC",
      balance: 0,
      rate: 0,
      minPayment: 0,
      dueDay: 7,
      color: "#22c55e",
      type: "revolving"
    },
    nu: {
      label: "Nu (float)",
      balance: 10000,
      rate: 0,              // se paga completa — no genera interés
      minPayment: 11941,
      dueDay: 4,
      color: "#a78bfa",
      type: "float",
      cutoffDay: 4
    }
  },

  // ── INGRESOS MENSUALES ──────────────────────────────────
  income: {
    nomina: 83096,          // neto quincenal × 2 (con offcycle 2.5% desde Jun)
    nominaPreOffcycle: 79988, // neto mensual antes de offcycle (Abr-May)
    vales: 3292,
    offcycleDate: "2026-06-01",
    offcyclePct: 2.5
  },

  // ── GASTOS FIJOS MENSUALES ──────────────────────────────
  expenses: {
    fixed: {
      renta: 17250,
      attPersonal: 532,       // desde mayo (sin equipo)
      attPersonalAbr: 1420,   // solo abril
      subscriptionsBiz: 1951, // AWS+Claude+OpenAI+AireGPT+AT&T Biz
      apple: 218,             // iCloud $169 + $49
      googleOne: 395,
      amazon: 75,             // hasta julio
      banamexNominaQuota: 4092,
      banorteMin: 13544
    },
    variable: {
      restaurantes: 5000,
      traslados: 1500,
      despensa: 3000
    }
  },

  // ── INGRESOS EXTRAORDINARIOS ────────────────────────────
  extraordinary: [
    { month: "2026-04", label: "Hermana (15-Abr)", amount: 2500, target: "banamexNomina" },
    { month: "2026-04", label: "Hermana (fin Abr)", amount: 2000, target: "banamexNomina" },
    { month: "2026-05", label: "PTU estimado neto", amount: 45000, target: "banamexNomina", note: "Puede ser mayor" },
    { month: "2026-06", label: "Smability (1a parte)", amount: 30000, target: "banamexNomina" },
    { month: "2026-07", label: "Smability (2a parte)", amount: 20000, target: "banorte" },
    { month: "2026-08", label: "Smability (3a parte)", amount: 30000, target: "banorte" },
    { month: "2026-09", label: "Apoyo familiar", amount: 35000, target: "banamexNomina", date: "2026-09-30" }
  ],

  // ── ESCENARIO OPCIONAL: PAREJA ──────────────────────────
  scenarioPartner: {
    enabled: false,
    label: "Apoyo pareja $200k",
    entries: [
      { date: "2026-05-31", amount: 100000, target: "banorte" },
      { date: "2026-06-30", amount: 100000, target: "banorte" }
    ],
    payback: { startMonth: "2026-07", monthly: 66667, months: 3 },
    interestSaved: 3775,
    note: "Banorte en $0 el 30-Jun antes de revisiones de buró. Trade-off: deuda total Oct +$44k vs sin apoyo."
  },

  // ── HIPOTECA ────────────────────────────────────────────
  mortgage: {
    banamex: { amount: 1700000, rate: 10.25, years: 20, monthlyEst: 16500 },
    infonavit: { amount: 1000000, rate: 9, years: 20, monthlyEst: 8500 },
    totalMonthly: 25000,
    brokerNote: "Segunda revisión de buró ~30-Ago. Tasa sujeta a confirmación.",
    preApproved: true
  },

  // ── INFONAVIT ───────────────────────────────────────────
  infonavit: {
    currentBalance: 818557,
    yield2025: 6.33,
    projectedOct2026: 873684
  },

  // ── PIVOTE 30-JUN ───────────────────────────────────────
  pivote: {
    banamexRedisposition: 180000,
    target: "banorte",
    steps: [
      "Liquidar saldo Banamex Nómina con excedente",
      "Redisponer $180k de Banamex Nómina",
      "SPEI $180k → Banorte",
      "Confirmar Banorte reducido · guardar comprobante"
    ]
  },

  // ── AIRBNB MUNDIAL (OPCIONAL) ───────────────────────────
  airbnb: {
    enabled: false,
    estimatedNights: 20,
    estimatedNetIncome: 30000,
    period: "Jun-Jul 2026",
    note: "Decisión pendiente con pareja. No sumado al plan base."
  },

  // ── BURÓ ────────────────────────────────────────────────
  buro: {
    currentScore: 685,
    updatedDate: "2026-04-09",
    punctuality: 100,
    projectedJun: 725,
    projectedAug: 745
  }
};

// ── CÁLCULOS DERIVADOS ────────────────────────────────────
const CALC = {

  totalDebt() {
    return Object.values(CONFIG.debts)
      .filter(d => d.type !== "float")
      .reduce((sum, d) => sum + d.balance, 0);
  },

  monthlyInterest(debtKey) {
    const d = CONFIG.debts[debtKey];
    return +(d.balance * (d.rate / 100 / 12)).toFixed(2);
  },

  totalMonthlyExpenses(month = "2026-06") {
    const f = CONFIG.expenses.fixed;
    const v = CONFIG.expenses.variable;
    const isPostAmazon = month >= "2026-08";
    const isPreOffcycle = month < "2026-06";

    return (
      f.renta +
      (month === "2026-04" ? f.attPersonalAbr : f.attPersonal) +
      f.subscriptionsBiz +
      f.apple +
      f.googleOne +
      (!isPostAmazon ? f.amazon : 0) +
      f.banamexNominaQuota +
      (isPreOffcycle ? f.banorteMin : f.banorteMin) +
      v.restaurantes +
      v.traslados +
      v.despensa
    );
  },

  monthlyIncome(month = "2026-06") {
    const isPreOffcycle = month < "2026-06";
    const nomina = isPreOffcycle ? CONFIG.income.nominaPreOffcycle : CONFIG.income.nomina;
    const vales = month >= "2026-05" ? CONFIG.income.vales : 0;
    return nomina + vales;
  },

  surplusForDebt(month = "2026-06") {
    return this.monthlyIncome(month) - this.totalMonthlyExpenses(month);
  },

  daysToTarget() {
    const today = new Date();
    const target = new Date(CONFIG.targetDate);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  },

  daysToPivote() {
    const today = new Date();
    const pivote = new Date(CONFIG.pivoteDate);
    return Math.max(0, Math.ceil((pivote - today) / (1000 * 60 * 60 * 24)));
  }
};

export { CONFIG, CALC };
