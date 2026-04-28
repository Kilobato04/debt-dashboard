// ============================================================
// CONFIG.JS — Valores por defecto · Sobreescritos por Sheets
// ============================================================

var CONFIG = {
  appToken:    "OSJS2026_DEBT",
  targetDate:  "2026-10-01",
  pivoteDate:  "2026-06-30",
  sheetApiBase:"https://script.google.com/macros/s/AKfycbxuOOgmFIPaHTqsiVEjXA7q6YhuFb6S8Rv7nKQQv2NSrW9DEWqtU7eHQZy2rmHDuGaNWg/exec",

  // ── DEUDAS ────────────────────────────────────────────
  debts: {
    banorte:      { label:"Banorte TDC",    balance:250676, rate:41.55, minPayment:13544, dueDate:"2026-05-14", color:"red",    type:"revolving" },
    banamexNomina:{ label:"Banamex Nómina", balance:168806, rate:22,    minPayment:4092,  dueDate:"2026-05-14", color:"yellow", type:"installment", creditLimit:180000 },
    banamexTDC:   { label:"Banamex TDC",    balance:0,      rate:0,     minPayment:0,     dueDate:"2026-05-07", color:"green",  type:"revolving" },
    nu:           { label:"Nu",             balance:10000,  rate:0,     minPayment:11941, dueDate:"2026-05-04", color:"purple", type:"float" }
  },

  // ── INGRESOS ──────────────────────────────────────────
  income: {
    nomina:            83096,   // neto mensual con offcycle (Jun+)
    nominaPreOffcycle: 79988,   // neto mensual sin offcycle (Abr-May)
    vales:             3292,    // desde Mayo
    otros:             0        // campo libre
  },

  // ── GASTOS FIJOS ──────────────────────────────────────
  // Nota: los pagos mínimos de deudas NO van aquí — se toman de CONFIG.debts
  fixedExpenses: [
    { id:"renta",     label:"Renta + servicios",      amount:17250 },
    { id:"att",       label:"AT&T personal",           amount:532   },
    { id:"bizSubs",   label:"Subs trabajo/Smability",  amount:1951  },
    { id:"apple",     label:"Apple (iCloud ×2)",       amount:218   },
    { id:"googleOne", label:"Google One",              amount:395   },
    { id:"amazon",    label:"Amazon Prime",            amount:75    },
    { id:"otros_f",   label:"Otros fijos",             amount:0     },
  ],

  // ── GASTOS VARIABLES ──────────────────────────────────
  variableExpenses: [
    { id:"restaurantes", label:"Restaurantes / salidas", amount:5000 },
    { id:"traslados",    label:"Traslados / Uber",        amount:1500 },
    { id:"despensa",     label:"Despensa / súper",        amount:3000 },
    { id:"otros_v",      label:"Otros variables",         amount:0    },
  ],

  // ── SUSCRIPCIONES ─────────────────────────────────────
  subscriptions: [
    { id:"att_p",   label:"AT&T Personal",          abr:1420, current:532,  biz:false, note:"-$888 al terminar equipo ✅" },
    { id:"att_b",   label:"AT&T Smability/AireGPT", abr:279,  current:279,  biz:true,  note:"Gasto negocio" },
    { id:"apple_s", label:"Apple (iCloud ×2)",      abr:218,  current:218,  biz:false, note:"$169 + $49" },
    { id:"claude",  label:"Claude (Anthropic)",     abr:373,  current:373,  biz:true,  note:"Trabajo/Smability" },
    { id:"google",  label:"Google One",             abr:395,  current:395,  biz:false, note:"⚠️ Revisar tier" },
    { id:"aws",     label:"AWS",                    abr:1800, current:1200, biz:true,  note:"Bajado May -$600 ✅" },
    { id:"openai",  label:"OpenAI (tokens)",        abr:50,   current:50,   biz:true,  note:"~$5 USD c/3 meses" },
    { id:"airegpt", label:"AireGPT (Stripe)",       abr:49,   current:49,   biz:true,  note:"Esencial" },
    { id:"amazon_p",label:"Amazon Prime",           abr:75,   current:75,   biz:false, note:"Termina Jul ✅" },
    { id:"canva",   label:"Canva",                  abr:0,    current:0,    biz:true,  note:"Ya pagada ✅" },
  ],

  // ── BURÓ ──────────────────────────────────────────────
  buro: { score:685, updatedDate:"2026-04-09", punctuality:100 },

  // ── HIPOTECA ──────────────────────────────────────────
  mortgage: {
    banamex:   { amount:1700000, rate:10.25, years:20, monthlyEst:16500 },
    infonavit: { amount:1000000, rate:9,     years:20, monthlyEst:8500  }
  }
};

// ── CÁLCULOS ──────────────────────────────────────────────
var CALC = {

  // Deuda total (excluye Nu float)
  totalDebt: function() {
    return Object.values(CONFIG.debts)
      .filter(function(d){ return d.type !== "float"; })
      .reduce(function(s,d){ return s+(d.balance||0); }, 0);
  },

  // Interés mensual de una deuda
  monthlyInterest: function(key) {
    var d = CONFIG.debts[key];
    return Math.round((d.balance||0) * (d.rate/100/12));
  },

  // Total gastos fijos de vida (SIN mínimos de deuda)
  totalFixed: function() {
    return CONFIG.fixedExpenses.reduce(function(s,e){ return s+(e.amount||0); }, 0);
  },

  // Total gastos variables de vida
  totalVariable: function() {
    return CONFIG.variableExpenses.reduce(function(s,e){ return s+(e.amount||0); }, 0);
  },

  // Total mínimos de deuda (separados de gastos de vida)
  totalMinPayments: function() {
    return Object.values(CONFIG.debts)
      .reduce(function(s,d){ return s+(d.minPayment||0); }, 0);
  },

  // Ingreso mensual base según mes
  monthlyIncome: function(ym) {
    ym = ym || currentYM();
    var nomina = ym >= "2026-06" ? CONFIG.income.nomina : CONFIG.income.nominaPreOffcycle;
    var vales  = ym >= "2026-05" ? CONFIG.income.vales  : 0;
    var otros  = CONFIG.income.otros || 0;
    return nomina + vales + otros;
  },

  // Excedente real = ingresos - gastos de vida (fijos + variables)
  // Los mínimos de deuda se muestran por separado — son obligaciones, no gasto de vida
  surplusAfterLife: function(ym) {
    ym = ym || currentYM();
    return this.monthlyIncome(ym) - this.totalFixed() - this.totalVariable();
  },

  // Excedente disponible para abonar EXTRA a deuda
  // (después de cubrir gastos de vida Y mínimos obligatorios)
  surplusForDebt: function(ym) {
    ym = ym || currentYM();
    return this.surplusAfterLife(ym) - this.totalMinPayments();
  },

  // Días hasta una fecha
  daysTo: function(dateStr) {
    return Math.max(0, Math.ceil((new Date(dateStr) - new Date()) / 86400000));
  },

  // % liquidado desde el inicio del plan
  pctPaid: function() {
    var start   = 443499;
    var current = this.totalDebt();
    return Math.min(100, Math.max(0, Math.round(((start-current)/start)*100)));
  },

  // Salidas del mes incluyendo mínimos — para la vista de plan mensual
  monthSalidas: function(ym) {
    ym = ym || currentYM();
    return {
      fixed:    this.totalFixed(),
      variable: this.totalVariable(),
      minBanorte:      CONFIG.debts.banorte.minPayment      || 0,
      minBanamexNomina:CONFIG.debts.banamexNomina.minPayment || 0,
      minBanamexTDC:   CONFIG.debts.banamexTDC.minPayment   || 0,
      minNu:           CONFIG.debts.nu.minPayment            || 0,
      total: this.totalFixed() + this.totalVariable() + this.totalMinPayments()
    };
  }
};

function currentYM() {
  return new Date().toISOString().substring(0,7);
}
