import AIBudgetSuggestions from '../components/ui/AIBudgetSuggestions.jsx';
import ForecastOverview from '../components/ui/ForecastOverview.jsx';

import React, { useEffect, useMemo, useState } from 'react';

/**
 * Budgets.jsx (Month-picker by name + Pretty UI)
 * - Month-wise budgets: each budget holds monthly limits per `YYYY-MM` key so you can set different limits per month
 * - Month selector now has a month-name dropdown (Jan..Dec) and a year selector for easy navigation
 * - Add / edit budgets and transactions; data persisted to localStorage
 * - Prettier styling: gradient background, cards, animated progress bars, and month selector
 */

const STORAGE_KEY = 'ai_budgets_data_v3';
const USE_API = false; // flip to true when your server endpoints are ready

// ---------- Helpers & Mock ----------
const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const now = new Date();
const THIS_MONTH_KEY = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

const MOCK = {
  budgets: [
    { id: 'b_groceries', category: 'Groceries', monthly_limits: { [THIS_MONTH_KEY]: 40000 } },
    { id: 'b_transport', category: 'Transport', monthly_limits: { [THIS_MONTH_KEY]: 25000 } },
    { id: 'b_entertainment', category: 'Entertainment', monthly_limits: { [THIS_MONTH_KEY]: 15000 } },
    { id: 'b_utilities', category: 'Utilities', monthly_limits: { [THIS_MONTH_KEY]: 20000 } },
  ],
  transactions: [
    { id: 't1', date: `${THIS_MONTH_KEY}-01`, amount: -12000, merchant: 'SuperMart', category: 'Groceries', notes: '' },
    { id: 't2', date: `${THIS_MONTH_KEY}-03`, amount: -8000, merchant: 'Cafe', category: 'Entertainment', notes: '' },
    { id: 't3', date: `${THIS_MONTH_KEY}-05`, amount: -5000, merchant: 'Auto-Rickshaw', category: 'Transport', notes: '' },
  ],
};

function uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 9)}`; }
function paiseToRupees(n) { return (n / 100).toFixed(2); }
function rupeesToPaise(n) { const num = typeof n === 'string' ? parseFloat(n) : n; return Math.round((num || 0) * 100); }

export default function Budgets() {
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
      const oldRaw = localStorage.getItem('ai_budgets_data_v2') || localStorage.getItem('ai_budgets_data_v1');
      if (oldRaw) {
        const parsed = JSON.parse(oldRaw);
        return parsed;
      }
    } catch (e) {}
    return { budgets: MOCK.budgets, transactions: MOCK.transactions };
  });

  // selected year and month index (0-based)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonthIdx, setSelectedMonthIdx] = useState(now.getMonth());

  // form states
  const [newBudgetCategory, setNewBudgetCategory] = useState('');
  const [newBudgetAmount, setNewBudgetAmount] = useState('');
  const [newTxMerchant, setNewTxMerchant] = useState('');
  const [newTxAmount, setNewTxAmount] = useState('');
  const [newTxDate, setNewTxDate] = useState('');
  const [newTxCategory, setNewTxCategory] = useState(state.budgets[0]?.category || 'Groceries');

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }, [state]);

  // compute selectedMonth key like '2025-11'
  const selectedMonthKey = `${selectedYear}-${String(selectedMonthIdx+1).padStart(2,'0')}`;

  // monthTransactions
  const monthTransactions = useMemo(() => {
    const [y, m] = selectedMonthKey.split('-').map(Number);
    return state.transactions.filter(t => { const d = new Date(t.date + 'T00:00:00'); return d.getFullYear() === y && d.getMonth()+1 === m; });
  }, [state.transactions, selectedMonthKey]);

  const categoryTotals = useMemo(() => {
    const map = {};
    monthTransactions.forEach(t => { map[t.category] = (map[t.category] || 0) + (Number(t.amount) || 0); });
    return map; // paise
  }, [monthTransactions]);

  function getBudgetLimitForMonth(budget, monthKey) { return budget.monthly_limits?.[monthKey] || 0; }

  const totalBudgetThisMonth = useMemo(() => state.budgets.reduce((a,b) => a + getBudgetLimitForMonth(b, selectedMonthKey), 0), [state.budgets, selectedMonthKey]);
  const totalSpentThisMonth = useMemo(() => Object.values(categoryTotals).reduce((a,b)=>a+b,0), [categoryTotals]);

  // actions
  function addBudget() {
    const cat = newBudgetCategory.trim(); if (!cat) return alert('Enter a category');
    const amt = rupeesToPaise(newBudgetAmount); if (!amt || amt <= 0) return alert('Enter valid amount');
    const b = { id: uid('b'), category: cat, monthly_limits: { [selectedMonthKey]: amt } };
    setState(s => ({ ...s, budgets: [...s.budgets, b] }));
    setNewBudgetCategory(''); setNewBudgetAmount('');
  }

  function deleteBudget(id) { if (!confirm('Delete this budget?')) return; setState(s => ({ ...s, budgets: s.budgets.filter(b=>b.id!==id) })); }

  function setBudgetForMonth(bid, monthKey, amtPaise) {
    setState(s => ({ ...s, budgets: s.budgets.map(b => b.id===bid ? { ...b, monthly_limits: { ...b.monthly_limits, [monthKey]: amtPaise } } : b) }));
  }

  function addTransaction() {
    const merchant = newTxMerchant.trim() || 'Unknown';
    const date = newTxDate || `${selectedMonthKey}-01`;
    const amtPaise = rupeesToPaise(newTxAmount);
    if (!amtPaise) return alert('Enter a valid amount');
    const signed = amtPaise > 0 ? -amtPaise : amtPaise; // ensure expense negative
    const tx = { id: uid('tx'), date, amount: signed, merchant, category: newTxCategory, notes: '' };
    setState(s => ({ ...s, transactions: [...s.transactions, tx] }));
    setNewTxMerchant(''); setNewTxAmount(''); setNewTxDate('');
  }

  function removeTransaction(id) { if (!confirm('Delete this transaction?')) return; setState(s => ({ ...s, transactions: s.transactions.filter(t=>t.id!==id) })); }

  function exportData() { const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `budgets_export_${selectedMonthKey}.json`; a.click(); URL.revokeObjectURL(url); }
  function importData(file) { const reader = new FileReader(); reader.onload = (e) => { try { const parsed = JSON.parse(e.target.result); if (parsed.budgets && parsed.transactions) { setState(parsed); alert('Imported'); } else alert('Invalid file'); } catch(err){ alert('Import failed'); } }; reader.readAsText(file); }

  // generate years dropdown (last 3 years)
  const yearOptions = useMemo(()=>{ const cur = new Date().getFullYear(); return [cur, cur-1, cur-2]; },[]);

  function prevMonth(){ let idx = selectedMonthIdx-1; let yr = selectedYear; if (idx < 0) { idx = 11; yr -= 1; } setSelectedMonthIdx(idx); setSelectedYear(yr); }
  function nextMonth(){ let idx = selectedMonthIdx+1; let yr = selectedYear; if (idx > 11) { idx = 0; yr += 1; } setSelectedMonthIdx(idx); setSelectedYear(yr); }

  function progressColor(pct){ if (pct < 70) return 'bg-emerald-400'; if (pct < 100) return 'bg-amber-400'; return 'bg-red-500'; }
  function avatarInitials(name){ return name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase(); }

  // ---------- Moved handler: apply a suggested reallocation (uses this component's state)
  function handleApplyReallocation({ toCategory, amount }) {
    if (!toCategory || !amount) return alert('Reallocation data missing');
    // find a donor budget with spare for the selected month
    const donorIdx = state.budgets.findIndex(b => {
      const lim = (b.monthly_limits && b.monthly_limits[selectedMonthKey]) || 0;
      const spent = Math.abs(state.transactions
        .filter(t => t.date?.startsWith(selectedMonthKey) && t.category === b.category)
        .reduce((a, b2) => a + Math.abs(b2.amount || 0), 0));
      return (lim - spent) > amount;
    });
    if (donorIdx === -1) return alert('No suitable donor category found');

    const donor = state.budgets[donorIdx];
    const donorNew = {
      ...donor,
      monthly_limits: {
        ...(donor.monthly_limits || {}),
        [selectedMonthKey]: ((donor.monthly_limits && donor.monthly_limits[selectedMonthKey]) || 0) - amount
      }
    };

    const targetIdx = state.budgets.findIndex(b => b.category === toCategory);
    if (targetIdx === -1) return alert('Target category not found');

    const target = state.budgets[targetIdx];
    const targetNew = {
      ...target,
      monthly_limits: {
        ...(target.monthly_limits || {}),
        [selectedMonthKey]: ((target.monthly_limits && target.monthly_limits[selectedMonthKey]) || 0) + amount
      }
    };

    const newBudgets = state.budgets.slice();
    newBudgets[donorIdx] = donorNew;
    newBudgets[targetIdx] = targetNew;
    setState(s => ({ ...s, budgets: newBudgets }));
    alert(`Moved ₹${(amount/100).toFixed(2)} from ${donor.category} to ${toCategory}`);
  }

  // ---------- Temporary demo seed helper (use to verify forecasting quickly) ----------
function seedDemoTxs() {
  const now2 = new Date();
  const mk = `${now2.getFullYear()}-${String(now2.getMonth()+1).padStart(2,'0')}`;
  const demo = [
    { id: `d1_${Date.now()}`, date: `${mk}-02`, amount: -12000, merchant: 'Demo Grocer', category: 'Groceries', notes: '' },
    { id: `d2_${Date.now()}`, date: `${mk}-05`, amount: -5000, merchant: 'Demo Coffee', category: 'Entertainment', notes: '' },
    { id: `d3_${Date.now()}`, date: `${mk}-07`, amount: -3000, merchant: 'Demo Taxi', category: 'Transport', notes: '' }
  ];

  // 1) update React state
  setState(s => {
    const newState = { ...s, transactions: [...(s.transactions || []), ...demo] };
    try {
      // 2) explicitly persist to the same key ForecastOverview reads
      localStorage.setItem('ai_budgets_data_v3', JSON.stringify(newState));
    } catch (e) {
      console.warn('Failed to write seeded state to localStorage', e);
    }
    return newState;
  });

  // 3) reload so other routes/components pick up persisted data immediately
  setTimeout(() => {
    // small delay to ensure state + storage write finished
    window.location.reload();
  }, 120);
}


  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900">Budgets</h1>
            <p className="text-sm text-gray-500 mt-1">Select a month to view spending and set monthly limits.</p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="px-3 py-2 rounded-lg bg-gray-100">‹</button>
            <select value={selectedMonthIdx} onChange={(e)=>setSelectedMonthIdx(Number(e.target.value))} className="border rounded-lg p-2 bg-white">
              {monthNames.map((mn, idx) => <option key={mn} value={idx}>{mn}</option>)}
            </select>
            <select value={selectedYear} onChange={(e)=>setSelectedYear(Number(e.target.value))} className="border rounded-lg p-2 bg-white">
              {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={nextMonth} className="px-3 py-2 rounded-lg bg-gray-100">›</button>

            <button onClick={exportData} className="px-3 py-2 rounded-lg bg-indigo-600 text-white">Export</button>
            <label className="px-3 py-2 rounded-lg bg-gray-100 cursor-pointer">Import<input type="file" accept="application/json" onChange={(e)=>importData(e.target.files[0])} className="hidden" /></label>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <main className="md:col-span-2 space-y-6">
            <section className="bg-white rounded-2xl p-4 shadow">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-gray-500">Month total ({monthNames[selectedMonthIdx]} {selectedYear})</div>
                  <div className="text-2xl font-extrabold text-indigo-600">₹{paiseToRupees(totalBudgetThisMonth)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-500">Spent</div>
                  <div className="text-2xl font-extrabold text-red-600">₹{paiseToRupees(Math.abs(totalSpentThisMonth))}</div>
                </div>
              </div>

              <div className="space-y-3">
                {state.budgets.map(b => {
                  const limit = getBudgetLimitForMonth(b, selectedMonthKey);
                  const spent = Math.abs(categoryTotals[b.category] || 0);
                  const pct = limit ? Math.min(100, Math.round((spent / limit) * 100)) : 0;
                  return (
                    <div key={b.id} className="p-3 rounded-lg border flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center font-semibold text-gray-700">{avatarInitials(b.category)}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">{b.category}</div>
                          <div className="text-sm text-gray-500">₹{paiseToRupees(spent)} / ₹{paiseToRupees(limit)}</div>
                        </div>
                        <div className="mt-2 h-3 w-full bg-gray-100 rounded overflow-hidden">
                          <div className={`${progressColor(pct)} h-3 transition-all`} style={{ width: `${pct}%` }} />
                        </div>

                        <div className="mt-2 flex items-center gap-2">
                          <input type="number" value={limit ? (limit/100) : ''} onChange={(e)=>setBudgetForMonth(b.id, selectedMonthKey, rupeesToPaise(e.target.value))} className="w-36 border rounded p-1 text-sm" />
                          <div className="text-xs text-gray-400">Set limit for {monthNames[selectedMonthIdx]} {selectedYear}</div>
                          <button onClick={()=>deleteBudget(b.id)} className="ml-auto text-xs text-red-500">Delete</button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>

              <hr className="my-4" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input placeholder="Category" value={newBudgetCategory} onChange={(e)=>setNewBudgetCategory(e.target.value)} className="border p-2 rounded" />
                <input placeholder={`Limit for ${monthNames[selectedMonthIdx]} (₹)`} value={newBudgetAmount} onChange={(e)=>setNewBudgetAmount(e.target.value)} className="border p-2 rounded" />
                <button onClick={addBudget} className="px-3 py-2 rounded-lg bg-emerald-500 text-white">Add budget</button>
              </div>
            </section>

            <section className="bg-white rounded-2xl p-4 shadow">
              <h3 className="font-semibold mb-3">Transactions ({monthTransactions.length})</h3>
              <div className="space-y-2 max-h-96 overflow-auto">
                {monthTransactions.slice().reverse().map(t => (
                  <div key={t.id} className="p-3 rounded-lg border flex items-center justify-between">
                    <div>
                      <div className="font-medium">{t.merchant}</div>
                      <div className="text-xs text-gray-400">{t.date} • {t.category}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${t.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>{t.amount < 0 ? `-₹${Math.abs(t.amount)/100}` : `+₹${t.amount/100}`}</div>
                      <div className="text-xs mt-1"><button onClick={()=>removeTransaction(t.id)} className="text-xs text-red-500">Remove</button></div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

          </main>

          <aside className="space-y-6">

            {/* Add transaction */}
            <div className="bg-white rounded-2xl p-4 shadow">
              <h4 className="font-semibold mb-3">Add transaction</h4>

              <input
                placeholder="Merchant"
                value={newTxMerchant}
                onChange={(e)=>setNewTxMerchant(e.target.value)}
                className="border p-2 rounded w-full mb-2"
              />

              <input
                placeholder="Amount (₹)"
                value={newTxAmount}
                onChange={(e)=>setNewTxAmount(e.target.value)}
                className="border p-2 rounded w-full mb-2"
              />

              <input
                type="date"
                value={newTxDate}
                onChange={(e)=>setNewTxDate(e.target.value)}
                className="border p-2 rounded w-full mb-2"
              />

              <select
                value={newTxCategory}
                onChange={(e)=>setNewTxCategory(e.target.value)}
                className="border p-2 rounded w-full mb-2"
              >
                {state.budgets.map(b => (
                  <option key={b.id} value={b.category}>{b.category}</option>
                ))}
              </select>

              <button
                onClick={addTransaction}
                className="w-full py-2 rounded bg-indigo-600 text-white"
              >
                Add transaction
              </button>

              {/* demo seed button for quick testing */}
              <div className="mt-3">
                <button onClick={seedDemoTxs} className="w-full py-2 rounded bg-gray-100">Seed demo transactions</button>
              </div>
            </div>

            {/* ⭐ Forecast overview (AI) */}
            <div className="bg-white rounded-2xl p-4 shadow">
              <ForecastOverview
                transactions={state.transactions}
                budgets={state.budgets}
                monthsBack={12}
                alpha={0.4}
              />
            </div>

            {/* Your next sections (e.g., Quick insights, AI suggestions, etc.) */}


            {/* AI Suggestions panel (powered by local heuristics) */}
            <div className="mt-4">
              <AIBudgetSuggestions
                budgets={state.budgets}
                transactions={state.transactions}
                monthKey={selectedMonthKey}
                onApplyReallocation={handleApplyReallocation}
                onDismiss={(s) => {
                  // optional: persist dismissed suggestion id or simply log
                  console.log('dismissed suggestion', s.id);
                }}
              />
            </div>


            <div className="bg-white rounded-2xl p-4 shadow">
              <h4 className="font-semibold mb-3">Quick insights</h4>
              <div className="text-sm text-gray-500 mb-2">Top categories this month</div>
              <ul className="space-y-2">
                {Object.entries(categoryTotals).sort((a,b)=>Math.abs(b[1])-Math.abs(a[1])).slice(0,5).map(([cat, amt]) => (
                  <li key={cat} className="flex items-center justify-between">
                    <div className="text-sm">{cat}</div>
                    <div className="font-semibold">₹{Math.abs(amt)/100}</div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 text-xs text-gray-500">Tip: use the month dropdown to switch between months quickly.</div>
            </div>
          </aside>

        </div>
      </div>
    </div>
  );
}
