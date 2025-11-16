import React, { useState, useMemo, useEffect } from "react";

/**
 * SplitwiseModule.jsx — Pretty UI upgrade
 * - Same logic as before (multi-group split, balances, simplification)
 * - Upgraded styling with Tailwind-friendly classes, avatars, soft shadows, gradients and micro-interactions
 * - Drop into src/components or src/pages. Replace your existing GroupExpenses.jsx with this file.
 *
 * Props:
 *  - primaryPersonId (optional)
 *  - initialGroups (optional)
 *  - onChange (optional)
 */

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function computeBalancesForGroup(people, expenses) {
  const balances = {};
  people.forEach((p) => (balances[p.id] = 0));

  expenses.forEach((exp) => {
    const amount = Number(exp.amount) || 0;
    const payer = exp.paidBy;

    let splits = exp.splits && exp.splits.length ? exp.splits : [];
    if (!splits.length) {
      const each = +(amount / Math.max(1, people.length)).toFixed(2);
      splits = people.map((p) => ({ personId: p.id, share: each }));
    }

    balances[payer] += amount;
    splits.forEach((s) => {
      balances[s.personId] -= Number(s.share) || 0;
    });
  });

  Object.keys(balances).forEach((k) => {
    balances[k] = Math.round((balances[k] + Number.EPSILON) * 100) / 100;
  });

  return balances;
}

export function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([id, bal]) => {
    if (bal < -0.005) debtors.push({ id, amount: -bal });
    else if (bal > 0.005) creditors.push({ id, amount: bal });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const tx = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i];
    const c = creditors[j];
    const transfer = Math.min(d.amount, c.amount);
    tx.push({ from: d.id, to: c.id, amount: Math.round((transfer + Number.EPSILON) * 100) / 100 });
    d.amount = Math.round((d.amount - transfer + Number.EPSILON) * 100) / 100;
    c.amount = Math.round((c.amount - transfer + Number.EPSILON) * 100) / 100;
    if (Math.abs(d.amount) < 0.01) i++;
    if (Math.abs(c.amount) < 0.01) j++;
  }
  return tx;
}

export default function SplitwiseModule({ primaryPersonId = null, initialGroups = null, onChange = null }) {
  const sampleGroups = [
    {
      id: 'g1',
      name: 'Trip to Goa',
      people: [
        { id: 'u1', name: 'Mel (you)' },
        { id: 'u2', name: 'Asha' },
        { id: 'u3', name: 'Riya' },
      ],
      expenses: [
        { id: 'ex1', title: 'Beach dinner', amount: 4200, paidBy: 'u1', splits: [] },
        { id: 'ex2', title: 'Boat ride', amount: 1500, paidBy: 'u2', splits: [] },
      ],
    },
    {
      id: 'g2',
      name: 'Apartment Utilities',
      people: [
        { id: 'u1', name: 'Mel (you)' },
        { id: 'u4', name: 'Sam' },
      ],
      expenses: [
        { id: 'ex3', title: 'Electricity', amount: 1200, paidBy: 'u4', splits: [] },
      ],
    },
  ];

  const [groups, setGroups] = useState(initialGroups || sampleGroups);
  const [selectedGroupId, setSelectedGroupId] = useState((initialGroups && initialGroups[0]?.id) || groups[0].id);

  const [newGroupName, setNewGroupName] = useState('');
  const [newPersonName, setNewPersonName] = useState('');
  const [newExpenseTitle, setNewExpenseTitle] = useState('');
  const [newExpenseAmount, setNewExpenseAmount] = useState('');
  const [newExpensePaidBy, setNewExpensePaidBy] = useState('');
  const [useCustomSplits, setUseCustomSplits] = useState(false);
  const [customSplits, setCustomSplits] = useState({});

  useEffect(() => {
    if (onChange) onChange(groups);
  }, [groups]);

  const currentGroup = useMemo(() => groups.find((g) => g.id === selectedGroupId) || groups[0], [groups, selectedGroupId]);
  const groupBalances = useMemo(() => computeBalancesForGroup(currentGroup.people, currentGroup.expenses), [currentGroup]);
  const groupTransactions = useMemo(() => simplifyDebts(groupBalances), [groupBalances]);

  const overall = useMemo(() => {
    const totalBalances = {};
    groups.forEach((g) => {
      const b = computeBalancesForGroup(g.people, g.expenses);
      Object.entries(b).forEach(([id, bal]) => {
        totalBalances[id] = (totalBalances[id] || 0) + bal;
      });
    });
    Object.keys(totalBalances).forEach((k) => (totalBalances[k] = Math.round((totalBalances[k] + Number.EPSILON) * 100) / 100));
    return totalBalances;
  }, [groups]);

  function addGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    const g = { id: uid('g'), name, people: [], expenses: [] };
    setGroups((s) => [...s, g]);
    setSelectedGroupId(g.id);
    setNewGroupName('');
  }

  function removeGroup(groupId) {
    const next = groups.filter((g) => g.id !== groupId);
    setGroups(next);
    if (selectedGroupId === groupId && next.length) setSelectedGroupId(next[0].id);
  }

  function addPersonToCurrent(name) {
    const n = (name || newPersonName).trim();
    if (!n) return;
    const p = { id: uid('u'), name: n };
    setGroups((gs) => gs.map((g) => (g.id === currentGroup.id ? { ...g, people: [...g.people, p] } : g)));
    setNewPersonName('');
  }

  function addExpenseToCurrent() {
    const amount = Number(newExpenseAmount);
    if (!newExpenseTitle.trim() || !amount || isNaN(amount)) return alert('provide title and valid amount');
    if (!newExpensePaidBy) return alert('choose payer');

    let splits = [];
    if (useCustomSplits) {
      splits = currentGroup.people.map((p) => ({ personId: p.id, share: Number(customSplits[p.id] || 0) }));
    } else {
      const each = Math.round((amount / Math.max(1, currentGroup.people.length) + Number.EPSILON) * 100) / 100;
      splits = currentGroup.people.map((p) => ({ personId: p.id, share: each }));
    }

    const exp = { id: uid('e'), title: newExpenseTitle.trim(), amount, paidBy: newExpensePaidBy, splits };
    setGroups((gs) => gs.map((g) => (g.id === currentGroup.id ? { ...g, expenses: [...g.expenses, exp] } : g)));

    setNewExpenseTitle('');
    setNewExpenseAmount('');
    setUseCustomSplits(false);
    setCustomSplits({});
  }

  function removeExpenseFromCurrent(expId) {
    setGroups((gs) => gs.map((g) => (g.id === currentGroup.id ? { ...g, expenses: g.expenses.filter((e) => e.id !== expId) } : g)));
  }

  function nameOf(id) {
    for (const g of groups) {
      const p = g.people.find((x) => x.id === id);
      if (p) return p.name;
    }
    return id;
  }

  function exportGroupSimplified() {
    const text = groupTransactions
      .map((t) => `${nameOf(t.from)} -> ${nameOf(t.to)}: ₹${t.amount.toFixed(2)}`)
      .join('\n');
    navigator.clipboard?.writeText(text).then(() => alert('Copied group simplified transactions'), () => alert('Copy failed'));
  }

  // small helpers for avatar
  function avatarInitials(name) {
    return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-gray-50 py-8 px-6">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Groups</h1>
            <p className="text-sm text-gray-500 mt-1">Manage group expenses, track balances, and settle up with ease.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right mr-4 hidden sm:block">
              <div className="text-xs text-gray-500">Primary</div>
              <div className="font-semibold">{primaryPersonId ? nameOf(primaryPersonId) : '—'}</div>
            </div>
            <button onClick={() => setNewGroupName('')} className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl shadow-md hover:shadow-lg transition"> 
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
              New group
            </button>
          </div>
        </header>

        <div className="grid grid-cols-4 gap-6">
          <aside className="col-span-1 sticky top-6">
            <div className="bg-white rounded-2xl p-4 shadow-md">
              <h3 className="text-sm font-medium mb-2">Your groups</h3>
              <ul className="space-y-2">
                {groups.map((g) => (
                  <li key={g.id} className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition ${g.id === selectedGroupId ? 'bg-indigo-50 ring-1 ring-indigo-200' : 'hover:bg-gray-50'}`} onClick={() => setSelectedGroupId(g.id)}>
                    <div>
                      <div className="text-sm font-semibold">{g.name}</div>
                      <div className="text-xs text-gray-400">{g.people.length} members • {g.expenses.length} expenses</div>
                    </div>
                    <div className="text-gray-300 text-sm">›</div>
                  </li>
                ))}
              </ul>

              <div className="mt-4">
                <input placeholder="New group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2 text-sm" />
                <button onClick={addGroup} className="mt-2 w-full py-2 rounded-lg bg-indigo-600 text-white font-medium">Create group</button>
              </div>
            </div>

            <div className="mt-4 bg-white rounded-2xl p-4 shadow-md">
              <h4 className="text-sm font-medium mb-2">Overall balances</h4>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(overall).slice(0, 6).map(([id, bal]) => (
                  <div key={id} className="flex items-center justify-between p-2 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-700">{avatarInitials(nameOf(id))}</div>
                      <div className="text-sm">{nameOf(id)}</div>
                    </div>
                    <div className={`font-semibold ${bal > 0 ? 'text-green-600' : 'text-orange-600'}`}>{bal > 0 ? `+₹${bal.toFixed(2)}` : `-₹${Math.abs(bal).toFixed(2)}`}</div>
                  </div>
                ))}
              </div>
            </div>

          </aside>

          <main className="col-span-3">
            <div className="bg-white rounded-2xl p-5 shadow-lg mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">{currentGroup.name}</h2>
                  <div className="text-sm text-gray-400 mt-1">{currentGroup.people.length} members • {currentGroup.expenses.length} expenses</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-500">Group total</div>
                  <div className="text-2xl font-extrabold text-indigo-600">₹{Object.values(groupBalances).reduce((a,b)=>a+b,0).toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                {currentGroup.people.map((p) => (
                  <div key={p.id} className={`flex items-center gap-3 p-3 rounded-xl ${primaryPersonId === p.id ? 'ring-2 ring-indigo-200 bg-indigo-50' : 'bg-gray-50'} shadow-sm`}> 
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-semibold ${primaryPersonId === p.id ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700'} shadow`}>{avatarInitials(p.name)}</div>
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className={`text-xs ${groupBalances[p.id] > 0 ? 'text-green-600' : 'text-orange-600'}`}>{groupBalances[p.id] ? (groupBalances[p.id] > 0 ? `+₹${groupBalances[p.id].toFixed(2)}` : `-₹${Math.abs(groupBalances[p.id]).toFixed(2)}`) : '₹0.00'}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <section className="bg-white rounded-2xl p-5 shadow-md">
                <h3 className="font-semibold mb-3">Add expense</h3>
                <div className="space-y-3">
                  <input value={newExpenseTitle} onChange={(e)=>setNewExpenseTitle(e.target.value)} placeholder="Title" className="w-full border border-gray-200 rounded-lg p-2" />
                  <input value={newExpenseAmount} onChange={(e)=>setNewExpenseAmount(e.target.value)} placeholder="Amount" className="w-full border border-gray-200 rounded-lg p-2" />
                  <select value={newExpensePaidBy} onChange={(e)=>setNewExpensePaidBy(e.target.value)} className="w-full border border-gray-200 rounded-lg p-2">
                    <option value="">Select payer</option>
                    {currentGroup.people.map((p)=> <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>

                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={useCustomSplits} onChange={(e)=>setUseCustomSplits(e.target.checked)} /> Custom splits</label>

                  {useCustomSplits && (
                    <div className="space-y-2">
                      {currentGroup.people.map((p)=> (
                        <div key={p.id} className="flex items-center gap-2">
                          <div className="w-28 text-sm">{p.name}</div>
                          <input placeholder="share" value={customSplits[p.id]||''} onChange={(e)=>setCustomSplits(s=>({ ...s, [p.id]: e.target.value }))} className="border p-2 rounded flex-1" />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={addExpenseToCurrent} className="px-4 py-2 rounded-lg bg-gradient-to-r from-green-500 to-emerald-500 text-white font-medium shadow">Add</button>
                    <button onClick={()=>{ setNewExpenseTitle(''); setNewExpenseAmount(''); setUseCustomSplits(false); setCustomSplits({}); }} className="px-4 py-2 rounded-lg bg-gray-100">Reset</button>
                  </div>

                  <hr />

                  <h4 className="font-medium">Expenses</h4>
                  <ul className="divide-y mt-2">
                    {currentGroup.expenses.map((e)=> (
                      <li key={e.id} className="py-3 flex items-start justify-between">
                        <div>
                          <div className="font-semibold">{e.title} <span className="text-sm text-gray-400">• ₹{Number(e.amount).toFixed(2)}</span></div>
                          <div className="text-xs text-gray-400">paid by {nameOf(e.paidBy)}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={()=>removeExpenseFromCurrent(e.id)} className="text-sm text-red-500">Remove</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </section>

              <section className="bg-white rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Balances & Settlements</h3>
                  <button onClick={exportGroupSimplified} className="text-sm px-3 py-1 rounded-lg bg-indigo-600 text-white">Copy</button>
                </div>

                <div className="space-y-3">
                  {currentGroup.people.map((p)=> (
                    <div key={p.id} className="flex items-center justify-between p-3 rounded-lg border">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold">{avatarInitials(p.name)}</div>
                        <div>
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-400">{p.id === newExpensePaidBy ? 'recent payer' : ''}</div>
                        </div>
                      </div>
                      <div className={`font-semibold ${groupBalances[p.id] > 0 ? 'text-green-600' : 'text-orange-600'}`}>{groupBalances[p.id] ? (groupBalances[p.id] > 0 ? `+₹${groupBalances[p.id].toFixed(2)}` : `-₹${Math.abs(groupBalances[p.id]).toFixed(2)}`) : '₹0.00'}</div>
                    </div>
                  ))}

                  <div className="mt-4">
                    <h4 className="font-medium mb-2">Simplified transactions</h4>
                    {groupTransactions.length ? (
                      <ul className="space-y-2">
                        {groupTransactions.map((t, idx) => (
                          <li key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold">{avatarInitials(nameOf(t.from))}</div>
                              <div className="text-sm">{nameOf(t.from)} pays <span className="font-semibold">{nameOf(t.to)}</span></div>
                            </div>
                            <div className="font-semibold">₹{t.amount.toFixed(2)}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-gray-400">No settlements — everyone is settled up.</div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-6 bg-white rounded-2xl p-4 shadow-md">
              <h4 className="font-semibold mb-3">Add member</h4>
              <div className="flex gap-2">
                <input value={newPersonName} onChange={(e)=>setNewPersonName(e.target.value)} placeholder="Name" className="border border-gray-200 p-2 rounded-lg flex-1" />
                <button onClick={()=>addPersonToCurrent()} className="px-4 py-2 rounded-lg bg-indigo-600 text-white">Add</button>
              </div>
            </div>

          </main>
        </div>
      </div>
    </div>
  );
}
