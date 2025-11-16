/**
 * budgetAI.js
 *
 * Utilities:
 *  - parseAmountToPaise(raw)
 *  - generateForecasts({ transactions, budgets, monthsBack, alpha, referenceDate })
 *  - generateSuggestions({ transactions, budgets, monthsBack, alpha, referenceDate, rules })
 *
 * All amounts are paise internally. Suggestion outputs are JS objects you can render.
 */

/* ----------------- helpers ----------------- */
export function parseAmountToPaise(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Math.round(raw);
  let s = String(raw).trim();
  s = s.replace(/[,\s₹£$€]/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const asNum = Number(s);
    // Heuristic: if value looks like rupees (has decimal or < 1e6), convert to paise
    if (s.indexOf('.') >= 0 || Math.abs(asNum) < 1000000) {
      return Math.round(asNum * 100);
    } else {
      return Math.round(asNum);
    }
  }
  return 0;
}

function monthKeyFrom(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  const d = new Date(s.includes('T') ? s : (s + 'T00:00:00'));
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function normalizeTransactions(transactions = []) {
  const out = [];
  for (const t of transactions) {
    try {
      const date = t && (t.date || t.createdAt || t.txDate) ? String(t.date || t.createdAt || t.txDate) : null;
      const mk = monthKeyFrom(date);
      const rawAmt = t && (t.amount ?? t.value ?? t.amt) ? t.amount ?? t.value ?? t.amt : 0;
      let amtPaise = parseAmountToPaise(rawAmt);
      let isExpense = false;
      if (typeof t?.type === 'string') {
        const tp = t.type.toLowerCase();
        if (tp.includes('exp') || tp.includes('debit') || tp.includes('withdraw')) isExpense = true;
        if (tp.includes('inc') || tp.includes('credit') || tp.includes('deposit')) isExpense = false;
      }
      if (amtPaise < 0) {
        isExpense = true;
        amtPaise = Math.abs(amtPaise);
      }
      const category = (t && (t.category || t.cat || t.tag)) ? String(t.category || t.cat || t.tag) : 'Uncategorized';
      out.push({
        date,
        monthKey: mk,
        amountPaise: Math.round(amtPaise || 0),
        isExpense,
        category,
        raw: t,
      });
    } catch (e) {
      console.warn('normalizeTransactions: skipping tx', t, e);
    }
  }
  return out;
}

/* ----------------- generateForecasts (same as before) ----------------- */
export function generateForecasts({
  transactions = [],
  budgets = [],
  monthsBack = 6,
  alpha = 0.4,
  referenceDate = null,
} = {}) {
  monthsBack = Math.max(1, Number(monthsBack) || 6);
  alpha = Number(alpha) || 0.4;
  alpha = Math.min(1, Math.max(0.01, alpha));

  const now = referenceDate ? new Date(referenceDate) : new Date();
  const endYear = now.getFullYear();
  const endMonthZeroBased = now.getMonth();
  const months = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(endYear, endMonthZeroBased - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  const nextM = new Date(endYear, endMonthZeroBased + 1, 1);
  const nextMonthKey = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, '0')}`;

  const txs = normalizeTransactions(Array.isArray(transactions) ? transactions : []);
  const categoriesSet = new Set();
  (Array.isArray(budgets) ? budgets : []).forEach(b => {
    if (!b) return;
    const cat = b.category || b.cat || b.name || 'Uncategorized';
    categoriesSet.add(String(cat));
  });
  txs.forEach(tx => { if (tx && tx.category) categoriesSet.add(String(tx.category)); });
  if (categoriesSet.size === 0) categoriesSet.add('Uncategorized');
  const categories = Array.from(categoriesSet);

  const monthTotals = {};
  months.forEach(mk => {
    monthTotals[mk] = {};
    categories.forEach(c => { monthTotals[mk][c] = 0; });
  });

  for (const tx of txs) {
    if (!tx.monthKey) continue;
    if (!monthTotals[tx.monthKey]) continue;
    const cat = tx.category || 'Uncategorized';
    if (!tx.isExpense) continue;
    if (!monthTotals[tx.monthKey].hasOwnProperty(cat)) monthTotals[tx.monthKey][cat] = 0;
    monthTotals[tx.monthKey][cat] += Number(tx.amountPaise || 0);
  }

  const perCategory = {};
  for (const cat of categories) {
    const history = months.map(mk => {
      const amt = (monthTotals[mk] && monthTotals[mk][cat]) ? Math.round(monthTotals[mk][cat]) : 0;
      return { monthKey: mk, amount: amt };
    });
    let ewma = history.length ? history[0].amount : 0;
    for (let i = 1; i < history.length; i++) {
      ewma = alpha * history[i].amount + (1 - alpha) * ewma;
    }
    perCategory[cat] = { history, forecast: Math.round(ewma) };
  }

  const totalHistory = months.map(mk => {
    let sum = 0;
    for (const cat of categories) {
      sum += (monthTotals[mk] && monthTotals[mk][cat]) ? monthTotals[mk][cat] : 0;
    }
    return { monthKey: mk, amount: Math.round(sum) };
  });
  let totalEwma = totalHistory.length ? totalHistory[0].amount : 0;
  for (let i = 1; i < totalHistory.length; i++) {
    totalEwma = alpha * totalHistory[i].amount + (1 - alpha) * totalEwma;
  }

  const budgetsNextMonth = {};
  (Array.isArray(budgets) ? budgets : []).forEach(b => {
    const cat = b.category || b.cat || b.name || 'Uncategorized';
    let val = 0;
    if (b.monthly_limits && typeof b.monthly_limits === 'object' && b.monthly_limits[nextMonthKey]) {
      val = parseAmountToPaise(b.monthly_limits[nextMonthKey]);
    } else if (typeof b.monthly_limit_paise === 'number') {
      val = Math.round(b.monthly_limit_paise);
    } else if (typeof b.monthly_limit === 'number') {
      val = parseAmountToPaise(b.monthly_limit);
    } else if (typeof b.limit === 'number') {
      val = parseAmountToPaise(b.limit);
    }
    budgetsNextMonth[cat] = val;
  });

  return {
    months,
    nextMonthKey,
    perCategory,
    total: { history: totalHistory, forecast: Math.round(totalEwma) },
    budgetsNextMonth,
  };
}

/* ----------------- generateSuggestions ----------------- */

/**
 * generateSuggestions
 *
 * A rule-based suggestions generator that:
 *  - highlights categories forecasted to exceed budget
 *  - suggests budgets for categories missing budgets
 *  - suggests achievable cuts and top categories to target for savings
 *
 * Input:
 *  {
 *    transactions: [],
 *    budgets: [],
 *    monthsBack: 6,
 *    alpha: 0.4,
 *    referenceDate: null,
 *    rules: { overspendThresholdPct: 10, suggestCutPct: 10, topSavingsCategories: 3 }
 *  }
 *
 * Output:
 *  [
 *    { id, type, category, message, recommendedLimitPaise, confidence (0-1), meta: {...} }, ...
 *  ]
 */
export function generateSuggestions({
  transactions = [],
  budgets = [],
  monthsBack = 6,
  alpha = 0.4,
  referenceDate = null,
  rules = {},
} = {}) {
  // default rules
  const opts = {
    overspendThresholdPct: typeof rules.overspendThresholdPct === 'number' ? rules.overspendThresholdPct : 10, // percent
    suggestCutPct: typeof rules.suggestCutPct === 'number' ? rules.suggestCutPct : 15, // percent suggested cut when overspending
    topSavingsCategories: typeof rules.topSavingsCategories === 'number' ? rules.topSavingsCategories : 3,
    safetyBufferPct: typeof rules.safetyBufferPct === 'number' ? rules.safetyBufferPct : 5, // when recommending new budgets
  };

  // run forecast to obtain perCategory, budgetsNextMonth, months etc
  const f = generateForecasts({ transactions, budgets, monthsBack, alpha, referenceDate });
  const { perCategory = {}, budgetsNextMonth = {}, months = [], nextMonthKey = '' } = f;

  const suggestions = [];
  const ts = normalizeTransactions(Array.isArray(transactions) ? transactions : []);
  // compute recent month totals per category (last month in months)
  const lastMonthKey = months.length ? months[months.length - 1] : null;
  const recentTotalsByCat = {};
  for (const tx of ts) {
    if (!tx.monthKey) continue;
    if (!lastMonthKey) continue;
    if (tx.monthKey !== lastMonthKey) continue;
    if (!tx.isExpense) continue;
    recentTotalsByCat[tx.category] = (recentTotalsByCat[tx.category] || 0) + tx.amountPaise;
  }

  // 1) Overspend / budget exceed suggestions
  for (const [category, info] of Object.entries(perCategory)) {
    const forecast = Number(info.forecast || 0);
    const budgetForCat = budgetsNextMonth.hasOwnProperty(category) ? Number(budgetsNextMonth[category] || 0) : 0;

    // if budget exists and forecast > budget * (1 + threshold)
    if (budgetForCat > 0) {
      const pctOver = budgetForCat === 0 ? 0 : Math.round((forecast - budgetForCat) / Math.max(1, budgetForCat) * 100);
      if (forecast > budgetForCat && pctOver >= opts.overspendThresholdPct) {
        // suggest either increasing budget or cutting forecast
        const recommendedLimit = Math.round(Math.max(forecast, budgetForCat) * (1 + opts.safetyBufferPct / 100));
        const cutSuggestionPaise = Math.round(forecast * (1 - opts.suggestCutPct / 100));

        suggestions.push({
          id: `overspend-${category}-${nextMonthKey}`,
          type: 'overspend',
          category,
          message: `Forecast for ${category} is ${pctOver}% over the budget for ${nextMonthKey}. Consider increasing the budget or reducing spending.`,
          recommendedLimitPaise: recommendedLimit,
          alternativeTargetPaise: cutSuggestionPaise, // target if cutting by suggestCutPct
          confidence: Math.min(0.95, 0.5 + Math.min(50, pctOver) / 100),
          meta: { forecast, budgetForCat, pctOver, monthsUsed: months.length },
        });
      }
    } else {
      // 2) missing budget suggestion: if forecast is non-trivial, suggest a budget
      if (forecast > 0) {
        // take forecast, add small safety buffer
        const suggested = Math.round(forecast * (1 + opts.safetyBufferPct / 100));
        suggestions.push({
          id: `missing-budget-${category}-${nextMonthKey}`,
          type: 'missing_budget',
          category,
          message: `No budget set for ${category} but forecast shows spending next month. Suggest creating a budget.`,
          recommendedLimitPaise: suggested,
          confidence: 0.6,
          meta: { forecast, monthsUsed: months.length },
        });
      }
    }
  }

  // 3) Flag categories with volatile or rising trend (basic check: compare last month vs average)
  for (const [category, info] of Object.entries(perCategory)) {
    const history = Array.isArray(info.history) ? info.history.map(h => Number(h.amount || 0)) : [];
    if (history.length < 2) continue;
    const last = history[history.length - 1];
    const avg = Math.round(history.reduce((a, b) => a + b, 0) / history.length);
    if (avg === 0) continue;
    const changePct = Math.round(((last - avg) / avg) * 100);
    if (changePct >= 25) {
      suggestions.push({
        id: `rising-${category}-${nextMonthKey}`,
        type: 'rising_trend',
        category,
        message: `${category} shows a rising trend (last month ${Math.max(0, changePct)}% above its average). Monitor or create a buffer.`,
        recommendedLimitPaise: Math.round(last * (1 + opts.safetyBufferPct / 100)),
        confidence: 0.5,
        meta: { last, avg, changePct },
      });
    } else if (changePct <= -50) {
      suggestions.push({
        id: `drop-${category}-${nextMonthKey}`,
        type: 'drop_trend',
        category,
        message: `${category} spending dropped recently. Consider reallocating budget if appropriate.`,
        recommendedLimitPaise: Math.round(Math.max(last, avg) * (1 + opts.safetyBufferPct / 100)),
        confidence: 0.4,
        meta: { last, avg, changePct },
      });
    }
  }

  // 4) Top savings opportunities: pick categories with largest forecast amounts and suggest small % cuts
  const catArray = Object.entries(perCategory).map(([category, info]) => ({ category, forecast: Number(info.forecast || 0) }));
  catArray.sort((a, b) => b.forecast - a.forecast);
  const topSavings = catArray.filter(c => c.forecast > 0).slice(0, opts.topSavingsCategories);
  for (const c of topSavings) {
    const cutPct = Math.min(25, opts.suggestCutPct + Math.round((c.forecast / Math.max(1, catArray[0]?.forecast || 1)) * 10));
    const cutAmount = Math.round(c.forecast * cutPct / 100);
    if (cutAmount <= 0) continue;
    suggestions.push({
      id: `save-${c.category}-${nextMonthKey}`,
      type: 'savings_opportunity',
      category: c.category,
      message: `You could save around ${cutPct}% (~${cutAmount} paise) on ${c.category} with small changes.`,
      recommendedLimitPaise: Math.round(c.forecast - cutAmount),
      confidence: 0.45,
      meta: { forecast: c.forecast, cutPct, cutAmount },
    });
  }

  // 5) Low-activity categories (suggest merge or remove budgets)
  for (const [category, info] of Object.entries(perCategory)) {
    const total = (info.history || []).reduce((a, b) => a + (b.amount || 0), 0);
    if (total === 0) {
      suggestions.push({
        id: `inactive-${category}-${nextMonthKey}`,
        type: 'inactive',
        category,
        message: `${category} has had no spending in the past ${months.length} months. Consider removing or merging its budget.`,
        recommendedLimitPaise: 0,
        confidence: 0.35,
        meta: { monthsUsed: months.length },
      });
    }
  }

  // 6) generic summary suggestion for the whole budget
  const totalForecast = (f.total && f.total.forecast) ? f.total.forecast : 0;
  const recentTotalLastMonth = lastMonthKey ? (Object.values(recentTotalsByCat || {}).reduce((a, b) => a + b, 0)) : 0;
  suggestions.push({
    id: `summary-${nextMonthKey}`,
    type: 'summary',
    category: 'All',
    message: `Total forecast for ${nextMonthKey} is ${totalForecast} paise. Last month's recorded spending: ${recentTotalLastMonth} paise.`,
    recommendedLimitPaise: Math.round(totalForecast * (1 + opts.safetyBufferPct / 100)),
    confidence: 0.5,
    meta: { totalForecast, recentTotalLastMonth },
  });

  // sort suggestions: critical ones first (overspend), then missing budgets, savings, trends, inactive, summary
  const priority = { overspend: 1, missing_budget: 2, rising_trend: 3, savings_opportunity: 4, drop_trend: 5, inactive: 6, summary: 99 };
  suggestions.sort((a, b) => (priority[a.type] || 50) - (priority[b.type] || 50));

  return suggestions;
}
