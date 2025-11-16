// forecasting_integration.jsx
// This file contains two pieces you can drop into your project.
// 1) Additions to src/lib/budgetAI.js: generateForecasts function (EWMA-based)
// 2) New component: src/components/ForecastOverview.jsx
// Instructions at the bottom explain how to wire these into your Budgets.jsx page.

/* ---------------------- 1) budgetAI.js additions ---------------------- */

// Paste the following into your existing src/lib/budgetAI.js (append at the end or merge)

/*
export function generateForecasts({ transactions = [], budgets = [], monthsBack = 6, alpha = 0.4 }) {
  // returns { perCategory: { [category]: { history: [{monthKey, amount}], forecast: amount } }, total: { history: [...], forecast } }
}
*/

/* ---------------------- 2) new component: ForecastOverview.jsx ---------------------- */

// Save this as src/components/ForecastOverview.jsx
// A lightweight, dependency-free component that shows per-category forecasts and simple sparklines.

import React from 'react';
import { generateForecasts } from '../lib/budgetAI';

export default function ForecastOverview({ transactions = [], budgets = [], monthsBack = 6, alpha = 0.4 }){
  const { months, perCategory, total } = generateForecasts({ transactions, budgets, monthsBack, alpha });

  // simple sparkline generator (SVG polyline)
  function sparkline(values, width = 120, height = 36){
    if (!values.length) return null;
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const step = width / (values.length - 1 || 1);
    const points = values.map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <polyline fill="none" stroke="#6366f1" strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }

  // build display rows: top N categories by forecast amount
  const categories = Object.entries(perCategory).map(([cat, data]) => ({ category: cat, forecast: data.forecast, history: data.history.map(h=>h.amount) }));
  categories.sort((a,b) => b.forecast - a.forecast);

  const topCategories = categories.slice(0, 6);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold">Forecast overview</h4>
        <div className="text-xs text-gray-400">Next-month estimates (EWMA)</div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="flex items-center justify-between border-b pb-2 mb-2">
          <div className="text-sm text-gray-500">Total (next month)</div>
          <div className="text-lg font-semibold">₹{(total.forecast/100).toFixed(2)}</div>
        </div>

        {topCategories.map(c => (
          <div key={c.category} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{c.category}</div>
              <div className="text-xs text-gray-400">Forecast: ₹{(c.forecast/100).toFixed(2)}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-28 h-9">{sparkline(c.history)}</div>
              <div className="text-sm font-semibold">₹{(c.forecast/100).toFixed(2)}</div>
            </div>
          </div>
        ))}

        <div className="mt-3 text-xs text-gray-500">Note: forecasts are conservative EWMA estimates based on the last {monthsBack} months. Adjust alpha to increase sensitivity.</div>
      </div>
    </div>
  );
}

/* ---------------------- Wiring instructions ---------------------- */

/*
1) Copy the generateForecasts function into src/lib/budgetAI.js (append it). If you already have budgetAI.js in src/lib, just paste the function code there and export it.

2) Add the new component file at src/components/ForecastOverview.jsx with the component code above.

3) In your Budgets.jsx page, import the component and render it where you'd like (e.g., inside the right-hand aside, above Quick insights):

import ForecastOverview from '../components/ForecastOverview';

... later in JSX:
<ForecastOverview transactions={state.transactions} budgets={state.budgets} monthsBack={6} alpha={0.4} />

4) The component reads the last `monthsBack` months of transactions and computes EWMA forecasts for each category and a total forecast. It renders a small sparkline and forecast numbers.

5) Tune `monthsBack` (6, 12) and `alpha` (0.2–0.6) to get sensitivity/seasonality appropriate to your data.

*/
