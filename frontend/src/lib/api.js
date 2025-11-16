// frontend/src/lib/api.js
// Standalone, persistent (localStorage) mock API.
// No backend required. Everything survives refreshes.

const LS_KEY = 'fintrack_mock_db_v1';

// --- seed once, then persist ---
function initialSeed() {
  return {
    expenses: [
      { id: 'e1', amount: 189.5, category: 'Food', description: 'Idli + coffee', date: '2025-11-06' },
      { id: 'e2', amount: 720, category: 'Transport', description: 'Metro pass', date: '2025-11-05' },
      { id: 'e3', amount: 1299, category: 'Shopping', description: 'Kurta', date: '2025-11-04' },
    ],
    suggestions: [
      'Try a weekly “no-sugar drinks” challenge — easy ₹150 save.',
      'Club cabs for late nights — split 3 ways saves ~₹200/ride.',
      'Prepaid data pack over postpaid add-ons saves 12–18%.',
    ],
    budgets: [
      { id: 'b_food', category: 'Food', limit: 1500, ai_recommendation: true },
      { id: 'b_trans', category: 'Transport', limit: 1200, ai_recommendation: true },
      { id: 'b_shop', category: 'Shopping', limit: 3000, ai_recommendation: false },
    ],
    groups: [
      {
        id: 'g1',
        name: 'Konkan Trek',
        members: ['Iravati', 'Yugank', 'Mrinalini', 'Vedantya'], // uncommon Indian names
      },
    ],
    groupExpenses: {
      g1: [
        { id: 'ge1', amount: 2600, category: 'Travel', description: 'SUV hire', paid_by: 'Yugank',    date: '2025-11-03' },
        { id: 'ge2', amount:  840, category: 'Food',   description: 'Konkani thali', paid_by: 'Mrinalini', date: '2025-11-03' },
      ],
    },
  };
}

function loadDB() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) {
    const seed = initialSeed();
    localStorage.setItem(LS_KEY, JSON.stringify(seed));
    return seed;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const seed = initialSeed();
    localStorage.setItem(LS_KEY, JSON.stringify(seed));
    return seed;
  }
}
function saveDB(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}
const wait = (ms = 120) => new Promise(r => setTimeout(r, ms));
// ---------- AI helpers (percentiles, EWMA, rounding) ----------
function roundTo50(v) { return Math.max(0, Math.round(v / 50) * 50); }
function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function percentile(arr, p) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * clamp(p, 0, 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  const frac = idx - lo;
  return a[lo] * (1 - frac) + a[hi] * frac;
}
function ewma(series, alpha = 0.3) {
  if (!series.length) return [];
  const out = [];
  let s = series[0];
  for (let i = 0; i < series.length; i++) {
    s = alpha * series[i] + (1 - alpha) * (i === 0 ? series[i] : s);
    out.push(s);
  }
  return out;
}
function dateOnly(iso) { return (iso || '').slice(0, 10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function ymd(d) { return new Date(d).toISOString().slice(0, 10); }

// --- helpers: derive analytics, balances, forecast ---
function deriveAnalytics(db) {
  const total_monthly = (db.expenses || []).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const map = {};
  (db.expenses || []).forEach(e => {
    map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0);
  });
  const by_category = Object.entries(map).map(([category, amount]) => ({ category, amount }));
  return { total_monthly, by_category };
}
// Tier-2 Budgets: percentile + buffer, optional total cap, rounded, with explain
function computeAIBudgets(db, {
  window = 90,
  mode = 'balanced', // 'strict' | 'balanced' | 'relaxed'
  totalCap = null     // number | null
} = {}) {
  const expenses = (db.expenses || [])
    .filter(e => !!e.date && !isNaN(Number(e.amount)));

  // filter by window
  const cutoff = addDays(new Date(), -window);
  const inWin = expenses.filter(e => new Date(e.date) >= cutoff);

  // build per-category daily series
  const cats = new Map(); // cat -> [amounts...]
  for (const e of inWin) {
    const key = e.category || 'Other';
    if (!cats.has(key)) cats.set(key, []);
    cats.get(key).push(Number(e.amount));
  }

  // decide percentile + buffer by mode
  const modeCfg = {
    strict:   { p: 0.50, buf: -0.10 },
    balanced: { p: 0.75, buf:  0.12 },
    relaxed:  { p: 0.85, buf:  0.20 },
  }[mode] || { p: 0.75, buf: 0.12 };

  // min floors (₹)
  const floors = {
    Food: 1500, Transport: 800, Shopping: 1500,
    Entertainment: 800, Utilities: 1000, Healthcare: 1000, Other: 400
  };

  // compute raw budgets per category
  const items = [];
  let rawTotal = 0;
  for (const [cat, arr] of cats.entries()) {
    // monthlyized expected = percentile * scale factor
    const p = percentile(arr, modeCfg.p);
    // crude monthly scaler: avg transactions per month
    const txPerMonth = Math.max(1, Math.round((arr.length / window) * 30));
    let expected = p * txPerMonth;

    // buffer
    expected *= (1 + modeCfg.buf);
    // floors + nice rounding
    expected = roundTo50(Math.max(expected, floors[cat] || 400));

    rawTotal += expected;
    items.push({
      id: `b_${cat.toLowerCase()}`,
      category: cat,
      limit: expected,
      period: 'monthly',
      ai_recommendation: true,
      explain: `${window}d p${Math.round(modeCfg.p*100)} + ${(modeCfg.buf*100).toFixed(0)}% buffer → ₹${expected}`
    });
  }

  // categories with no history → seed small defaults
  const known = new Set(items.map(i => i.category));
  const defaults = ['Food','Transport','Shopping','Entertainment','Utilities','Healthcare','Other'];
  for (const cat of defaults) {
    if (known.has(cat)) continue;
    const seed = floors[cat] || 400;
    items.push({
      id: `b_${cat.toLowerCase()}`,
      category: cat,
      limit: seed,
      period: 'monthly',
      ai_recommendation: true,
      explain: `No history; seeded default floor ₹${seed}`
    });
    rawTotal += seed;
  }

  // optional: fit into totalCap proportionally
  if (totalCap && rawTotal > 0) {
    const scale = totalCap / rawTotal;
    for (const it of items) {
      const scaled = roundTo50(Math.max(floors[it.category] || 400, it.limit * scale));
      it.limit = scaled;
      it.explain += ` | Scaled to cap ₹${totalCap}`;
    }
  }

  // deterministic sort for pretty UI
  items.sort((a, b) => a.category.localeCompare(b.category));
  return items;
}

// Tier-1 Forecast: daily agg → EWMA + weekday factor + trend
function deriveForecast(db, { days = 30, window = 90, alpha = 0.35 } = {}) {
  const expenses = (db.expenses || []).filter(e => !!e.date && !isNaN(Number(e.amount)));
  if (expenses.length < 3) {
    // not enough history – flat baseline from budgets or 3k default
    const baseline = Math.max(100, Math.round(((deriveAnalytics(db).total_monthly || 3000) / 30)));
    const out = Array.from({ length: days }, (_, i) => {
      const d = addDays(new Date(), i);
      return { date: ymd(d), predicted_amount: baseline };
    });
    return { trend: 'insufficient_data', forecast: out, explain: 'Not enough history; using flat baseline.' };
  }

  // group historical spend by day (last `window` days)
  const cutoff = addDays(new Date(), -window);
  const byDay = new Map();
  for (const e of expenses) {
    const d = new Date(e.date);
    if (isNaN(d)) continue;
    if (d < cutoff) continue;
    const key = ymd(d);
    byDay.set(key, (byDay.get(key) || 0) + Number(e.amount));
  }

  // build a dense daily series from start→today
  const start = new Date(Math.min(...[...byDay.keys()].map(k => +new Date(k))));
  const end = new Date();
  const series = [];
  const daysArr = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    const k = ymd(d);
    series.push(byDay.get(k) || 0);
    daysArr.push(k);
  }

  if (!series.length) {
    return { trend: 'insufficient_data', forecast: [], explain: 'No spend found in window.' };
  }

  // EWMA smooth
  const smoothed = ewma(series, alpha);

  // weekday factors from history (mon..sun)
  const weekdaySums = Array(7).fill(0);
  const weekdayCounts = Array(7).fill(0);
  for (let i = 0; i < daysArr.length; i++) {
    const wd = new Date(daysArr[i]).getDay(); // 0=Sun
    weekdaySums[wd] += series[i];
    weekdayCounts[wd] += 1;
  }
  const weekdayMeans = weekdaySums.map((s, i) => (weekdayCounts[i] ? s / weekdayCounts[i] : 0));
  const globalMean = weekdayMeans.reduce((a, b) => a + b, 0) / (weekdayMeans.filter(x => x > 0).length || 1);
  const weekdayFactor = weekdayMeans.map(m => (m && globalMean ? clamp(m / globalMean, 0.6, 1.4) : 1));

  // base level = last smoothed value
  const base = smoothed[smoothed.length - 1] || (globalMean || 100);

  // trend = compare last 14d vs prior 14d
  const tail = series.slice(-28);
  const first14 = tail.slice(0, 14).reduce((s, v) => s + v, 0) / Math.max(14, tail.slice(0, 14).length || 1);
  const last14  = tail.slice(-14).reduce((s, v) => s + v, 0) / Math.max(14, tail.slice(-14).length || 1);
  const lift = globalMean ? (last14 - first14) / Math.max(1, first14 || globalMean) : 0;
  const trend =
    lift > 0.08 ? 'increasing' :
    lift < -0.08 ? 'decreasing' : 'stable';

  // project next `days`
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(new Date(), i);
    const wd = d.getDay();
    const val = Math.round(base * weekdayFactor[wd] || base);
    out.push({ date: ymd(d), predicted_amount: Math.max(0, val) });
  }

  return {
    trend,
    forecast: out,
    explain: `EWMA(α=${alpha}) + weekday factor; last 14d vs prior 14d ${(lift*100).toFixed(1)}%.`
  };
}

function deriveGroupBalances(groupId, db) {
  const group = (db.groups || []).find(g => g.id === groupId);
  if (!group) return { settlements: [] };
  const members = group.members || [];
  const expenses = (db.groupExpenses?.[groupId] || []);
  if (members.length === 0 || expenses.length === 0) return { settlements: [] };

  // Equal split among members
  const totals = Object.fromEntries(members.map(m => [m, 0]));
  let total = 0;
  expenses.forEach(e => {
    total += Number(e.amount) || 0;
    totals[e.paid_by] = (totals[e.paid_by] || 0) + (Number(e.amount) || 0);
  });
  const share = total / members.length;
  const balance = members.map(m => ({ member: m, bal: (totals[m] || 0) - share }));

  const debtors = balance.filter(b => b.bal < -0.01).sort((a,b)=>a.bal-b.bal);    // owes
  const creditors= balance.filter(b => b.bal >  0.01).sort((a,b)=>b.bal-a.bal);    // receives
  const settlements = [];
  let i=0, j=0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(creditors[j].bal, -debtors[i].bal);
    settlements.push({ from: debtors[i].member, to: creditors[j].member, amount: Math.round(pay*100)/100 });
    debtors[i].bal += pay;
    creditors[j].bal -= pay;
    if (Math.abs(debtors[i].bal) < 0.01) i++;
    if (Math.abs(creditors[j].bal) < 0.01) j++;
  }
  return { settlements };
}

// --- Expenses ---
export async function getExpenses() {
  await wait();
  const db = loadDB();
  return db.expenses || [];
}
export async function postExpense(payload) {
  await wait();
  const db = loadDB();
  const id = `e${crypto.randomUUID?.() || Math.random().toString(36).slice(2,9)}`;
  const item = { id, ...payload, amount: Number(payload.amount) || 0 };
  db.expenses = [item, ...(db.expenses || [])];
  saveDB(db);
  return item;
}
export async function deleteExpense(id) {
  await wait();
  const db = loadDB();
  db.expenses = (db.expenses || []).filter(e => e.id !== id);
  saveDB(db);
  return { ok: true };
}

// --- Suggestions / Analytics / Forecast ---
export async function getSuggestions() {
  await wait();
  const db = loadDB();
  return { suggestions: db.suggestions || [] };
}
export async function getAnalyticsSpending() {
  await wait();
  const db = loadDB();
  return deriveAnalytics(db);
}
export async function getForecast() {
  await wait();
  const db = loadDB();
  return deriveForecast(db, { days: 30, window: 90, alpha: 0.35 });
}


// --- Budgets ---
export async function getBudgets() {
  await wait();
  const db = loadDB();
  return db.budgets || [];
}

export async function generateBudgets({ window = 90, mode = 'balanced', totalCap = null } = {}) {
  await wait(250);
  const db = loadDB();
  const budgets = computeAIBudgets(db, { window, mode, totalCap });
  db.budgets = budgets; // overwrite AI budgets
  saveDB(db);
  return { ok: true, budgets, meta: { window, mode, totalCap } };
}


// --- Groups ---
export async function getGroups() {
  await wait();
  const db = loadDB();
  return db.groups || [];
}
export async function getGroupExpenses(groupId) {
  await wait();
  const db = loadDB();
  return db.groupExpenses?.[groupId] || [];
}
export async function getGroupBalances(groupId) {
  await wait();
  const db = loadDB();
  return deriveGroupBalances(groupId, db);
}
export async function postGroupExpense(payload) {
  await wait();
  const db = loadDB();
  const id = `ge${crypto.randomUUID?.() || Math.random().toString(36).slice(2,9)}`;
  const item = { id, ...payload, amount: Number(payload.amount) || 0 };
  if (!db.groupExpenses) db.groupExpenses = {};
  if (!db.groupExpenses[payload.group_id]) db.groupExpenses[payload.group_id] = [];
  db.groupExpenses[payload.group_id].unshift(item);
  saveDB(db);
  return item;
}
