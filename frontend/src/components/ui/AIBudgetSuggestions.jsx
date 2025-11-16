import React from 'react';
import { generateSuggestions } from '../../lib/budgetAI';

/**
 * AIBudgetSuggestions.jsx
 *
 * Props:
 *  - transactions: []
 *  - budgets: []
 *  - monthsBack: number (optional)
 *  - alpha: number (optional)
 *
 * Renders suggestions returned by generateSuggestions.
 */

function fmtPaiseToINR(p) {
  const n = Number(p || 0) / 100;
  try {
    return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
  } catch (e) {
    return `₹${n.toFixed(2)}`;
  }
}

export default function AIBudgetSuggestions({ transactions = [], budgets = [], monthsBack = 6, alpha = 0.4 }) {
  // generate suggestions
  const suggestions = generateSuggestions({ transactions, budgets, monthsBack, alpha });

  if (!Array.isArray(suggestions) || suggestions.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border text-sm text-gray-500">
        No suggestions available.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">AI Budget Suggestions</h4>
        <div className="text-xs text-gray-400">Rule-based</div>
      </div>

      <div className="space-y-2">
        {suggestions.map(s => (
          <div key={s.id} className="p-3 border rounded-md">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-medium">{s.type === 'summary' ? 'Summary' : (s.category || 'General')}</div>
                <div className="text-xs text-gray-600 mt-1">{s.message}</div>
              </div>

              <div className="text-right">
                {typeof s.recommendedLimitPaise === 'number' && s.recommendedLimitPaise > 0 ? (
                  <div className="text-sm font-semibold">{fmtPaiseToINR(s.recommendedLimitPaise)}</div>
                ) : (
                  <div className="text-xs text-gray-400">No budget suggested</div>
                )}
                <div className="text-xs text-gray-400 mt-1">Confidence: {(s.confidence || 0).toFixed(2)}</div>
              </div>
            </div>

            {/* optional meta block */}
            {s.meta && (
              <div className="mt-2 text-xs text-gray-500">
                {Object.entries(s.meta).map(([k, v]) => (
                  <span key={k} className="mr-3">{k}: {typeof v === 'number' ? v : String(v)}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
