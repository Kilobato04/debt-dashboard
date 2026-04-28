// ============================================================
// CONFIG.JS — Variables globales · Sin módulos ES6
// ============================================================

const CONFIG = {
  owner: "Octavio Jimenez",
  targetDate: "2026-10-01",
  pivoteDate: "2026-06-30",
  mortgageStartDate: "2026-06-15",
  secondBuroReview: "2026-08-30",
  appToken: "OSJS2026_DEBT",
  sheetApiBase: "https://script.google.com/macros/s/AKfycbxuOOgmFIPaHTqsiVEjXA7q6YhuFb6S8Rv7nKQQv2NSrW9DEWqtU7eHQZy2rmHDuGaNWg/exec",

  debts: {
    banorte: {
      label: "Banorte TDC",
      balance: 250676,
      rate: 41.55,
      minPayment: 13544,
      dueDay: 14,
      color: "#ef4444",
      type: "revolving"
    },
    banamexNomina: {
      label: "Banamex Nómina",
      balance: 168806,
      rate: 22,
      minPayment: 4092,
      dueDay: 14,
      color: "#f59e0b",
      type: "installment",
      creditLimit: 180000
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
      rate: 0,
      minPayment: 11941,
      dueDay: 4,
      color: "#a78bfa",
      type: "float",
      cutoffDay: 4
    }
  },

  income: {
    nomina: 83096,
    nominaPreOffcycle: 79988,
    vales: 3292,
    offcycleDate: "2026-06-01",
    offcyclePct: 2.5
  },

  expenses: {
    fixed: {
      renta: 17250,
      attPersonal: 532,
      attPersonalAbr: 1420,
      subscriptionsBiz: 1951,
      apple: 218,
      googleOne: 395,
      amazon: 75,
      banamexNominaQuota: 4092,
      banorteMin: 13544
    },
    variable: {
      restaurantes: 5000,
      traslados: 1500,
      despensa: 3000
    }
  },

  extraordinary: [
    { month: "2026-04", label: "Hermana (15-Abr)", amount: 2500, target: "banamexNomina" },
    { month: "2026-04", label: "Hermana (fin Abr)", amount: 2000, target: "banamexNomina" },
    { month: "2026-05", label: "PTU estimado neto", amount: 45000, target: "banamexNomina", note: "Puede ser mayor ⬆️" },
    { month: "2026-06", label: "Smability (1a parte)", amount: 30000, target: "banamexNomina" },
    { month: "2026-07", label: "Smability (2a parte)", amount: 20000, target: "banorte" },
    { month: "2026-08", label: "Smability (3a parte)", amount: 30000, target: "banorte" },
    { month: "2026-09", label: "Apoyo familiar", amount: 35000, target: "banamexNomina", date: "2026-09-30" }
  ],

  buro: {
    currentScore: 685,
    updatedDate: "2026-04-09",
    punctuality: 100,
    projectedJun: 725,
    projectedAug: 745
  },

  infonavit: {
    currentBalance: 818557,
    yield2025: 6.33,
    projectedOct2026: 873684
  },

  mortgage: {
    banamex: { amount: 1700000, rate: 10.25, years: 20, monthlyEst: 16500 },
    infonavit: { amount: 1000000, rate: 9, years: 20, monthlyEst: 8500 },
    totalMonthly: 25000
  }
};

// ── CÁLCULOS DERIVADOS ────────────────────────────────────
const CALC = {
  totalDebt() {
    return Object.values(CONFIG.debts)
      .filter(d => d.type !== "float")
      .reduce((s, d) => s + d.balance, 0);
  },

  monthlyInterest(key) {
    const d = CONFIG.debts[key];
    return +(d.balance * (d.rate / 100 / 12)).toFixed(0);
  },

  monthlyIncome(month) {
    month = month || "2026-06";
    const pre = month < "2026-06";
    const nomina = pre ? CONFIG.income.nominaPreOffcycle : CONFIG.income.nomina;
    const vales = month >= "2026-05" ? CONFIG.income.vales : 0;
    return nomina + vales;
  },

  totalExpenses(month) {
    month = month || "2026-06";
    const f = CONFIG.expenses.fixed;
    const v = CONFIG.expenses.variable;
    const noAmazon = month >= "2026-08";
    return (
      f.renta + f.attPersonal + f.subscriptionsBiz +
      f.apple + f.googleOne + (!noAmazon ? f.amazon : 0) +
      f.banamexNominaQuota + f.banorteMin +
      v.restaurantes + v.traslados + v.despensa
    );
  },

  surplusForDebt(month) {
    month = month || "2026-06";
    return this.monthlyIncome(month) - this.totalExpenses(month);
  },

  daysTo(dateStr) {
    const diff = new Date(dateStr) - new Date();
    return Math.max(0, Math.ceil(diff / 86400000));
  }
};
