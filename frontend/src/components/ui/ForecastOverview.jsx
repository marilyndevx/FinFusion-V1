import React from 'react';
import { generateForecasts, parseAmountToPaise } from '../../lib/budgetAI';

/**
 * ForecastOverview
 *
 * Props:
 *  - transactions: array of transactions (optional)
 *  - budgets: array of budgets (optional)
 *  - monthsBack: number (default 6)
 *  - alpha: ewma smoothing factor (default 0.4)
 *
 * Behavior:
 *  - If props are empty, tries to read persisted app state from localStorage key 'ai_budgets_data_v3'
 *  - Renders overall forecast and top categories by forecast
 */

export default function ForecastOverview({
  transactions = [],
  budgets = [],
  monthsBack = 6,
  alpha = 0.4,
}) {
  // Defensive: prefer passed props, fallback to persisted app state
  let txs = Array.isArray(transactions) ? transactions : [];
  let buds = Array.isArray(budgets) ? budgets : [];

  if ((!txs || txs.length === 0) || (!buds || buds.length === 0)) {
    try {
      const savedRaw = localStorage.getItem('ai_budgets_data_v3');
      if (savedRaw) {
        const saved = JSON.parse(savedRaw);
        if (Array.isArray(saved.transactions) && (!txs || txs.length === 0)) txs = saved.transactions;
        if (Array.isArray(saved.budgets) && (!buds || buds.length === 0)) buds = saved.budgets;
      }
    } catch (e) {
      // ignore parse errors
      console.warn('ForecastOverview: could not load persisted state', e);
    }
  }

  const out = generateForecasts({ transactions: txs, budgets: buds, monthsBack, alpha });
  const { months = [], nextMonthKey = '', perCategory = {}, total = { history: [], forecast: 0 }, budgetsNextMonth = {} } = out || {};

  // convert perCategory to sorted array
  const categoriesArr = Object.entries(perCategory).map(([category, data]) => {
    const historyVals = (data.history || []).map(h => h.amount || 0);
    return {
      category,
      forecast: data.forecast || 0,
      historyVals,
      lastAmount: (data.history && data.history.length) ? data.history[data.history.length - 1].amount : 0,
      nextMonthBudget: budgetsNextMonth[category] || 0,
    };
  }).sort((a, b) => b.forecast - a.forecast);

  const topCategories = categoriesArr.slice(0, 6);

  // small sparkline SVG
  function Sparkline({ values = [], width = 120, height = 36 }) {
    if (!values || values.length === 0) return <div style={{ width, height }} />;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const pts = values.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={pts} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  const fmtPaiseToINR = (p) => {
    const n = (Number(p || 0) / 100);
    // use en-IN formatting with INR currency
    try {
      return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
    } catch (e) {
      return `₹${n.toFixed(2)}`;
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold">Forecast overview</h3>
            <div className="text-xs text-gray-500">Next month: <span className="font-medium">{nextMonthKey || '—'}</span></div>
            <div className="text-xs text-gray-400 mt-1">Method: EWMA (alpha: {alpha}) over last {monthsBack} months</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">Total forecast</div>
            <div className="text-2xl font-bold">{fmtPaiseToINR(total.forecast)}</div>
            <div className="text-xs text-gray-400 mt-1">Based on {months.length} months</div>
          </div>
        </div>

        <div className="mt-4 border-t pt-3 text-xs text-gray-500">
          Months used: {months && months.length ? months.join(', ') : 'none'}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border">
        <div className="flex items-center justify-between mb-3">
          <div className="font-medium">Top categories</div>
          <div className="text-xs text-gray-400">Showing top {topCategories.length}</div>
        </div>

        {topCategories.length === 0 ? (
          <div className="text-sm text-gray-500">No category history available for forecasting.</div>
        ) : (
          <div className="space-y-3">
            {topCategories.map(cat => (
              <div key={cat.category} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{cat.category}</div>
                  <div className="text-xs text-gray-400">
                    Last month: {fmtPaiseToINR(cat.lastAmount)} • Forecast: {fmtPaiseToINR(cat.forecast)}
                    {cat.nextMonthBudget ? ` • Budget: ${fmtPaiseToINR(cat.nextMonthBudget)}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-28 h-9 text-gray-500"><Sparkline values={cat.historyVals} /></div>
                  <div className="text-sm font-semibold">{fmtPaiseToINR(cat.forecast)}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 text-xs text-gray-400">
          Tip: Ensure transactions have `date` (YYYY-MM-DD) and `amount` (negative paise or type='expense') to be counted as spend.
        </div>
      </div>

      {/* optional debug block — remove in production */}
      <div className="bg-white rounded-2xl p-3 shadow-sm border text-xs text-gray-600">
        <div className="font-medium mb-2">Debug</div>
        <div>Transactions used: {Array.isArray(txs) ? txs.length : 0}</div>
        <div>B udgets used: {Array.isArray(buds) ? buds.length : 0}</div>
      </div>
    </div>
  );
}
