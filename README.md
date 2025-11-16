# 🚀 FinFusion — (V1)

**Version 1 of my final-year fintech project.**  
A privacy-first personal & group finance app for budgeting, transactions, Splitwise-style group splitting, explainable AI suggestions, and EWMA-based forecasting. Built for local prototyping (localStorage) with an easy path to server + DB.

---

## 🔑 Description
A React-based personal finance tracker with budgeting, group-expense management, local AI heuristics for suggestions, and EWMA forecasting — privacy-first and production-ready to plug into a backend.

---

## 📌 Features
- Create & manage monthly budgets by category  
- Add transactions, view category spending per month  
- Group-expense management (add people, split expenses, simplified settlements)  
- EWMA forecasting per-category and total (configurable monthsBack & alpha)  
- Local explainable heuristics to suggest reallocations, spot overspend/underspend  
- Demo/seed mode for quick testing (localStorage-backed)  
- Local-first privacy; optional backend for persistence

---

## 🧩 Tech Stack
- **Frontend:** React, JSX, Tailwind CSS  
- **Persistence (prototype):** `localStorage` (key: `ai_budgets_data_v3`)  
- **Forecasting / AI:** EWMA heuristics in `src/lib/budgetAI.js` (replaceable with server-side ML)  
- **Optional Backend:** Python (Flask / FastAPI) or Node/Express — repo contains `backend/` hints  
- **Charts:** Lightweight SVG sparklines (upgradeable to Recharts/Chart.js)

---

## 📁 Project structure (key files)
/frontend
/src
/components
/ui
AIBudgetSuggestions.jsx
ForecastOverview.jsx
/pages
Budgets.jsx
GroupExpenses.jsx
Forecasting.jsx
/lib
budgetAI.js # generateForecasts, generateSuggestions (EWMA + heuristics)
App.js
index.js
/backend
server.py (or app.js)
requirements.txt / package.json

---

## 🔎 Forecasting & AI (Summary)

**📈 Forecasting**
- Uses **EWMA (Exponentially Weighted Moving Average)**  
- Looks back over `monthsBack` (default **6–12 months**)  
- Adjustable **alpha** (0.2–0.6) for sensitivity tuning


**🤖 AI Suggestions**
- Explainable heuristic engine  
- Detects **overspend** / **underspend**  
- Suggests **budget reallocations**  
- Includes **numeric evidence** for every suggestion  

---

## 🛠️ Run Locally (Dev)

## **Frontend**
```bash
cd frontend
npm install     # first time
npm start       # opens http://localhost:3000

## **Backend**
cd backend
pip install -r requirements.txt
python server.py   # or: uvicorn app:app --reload / node server.js

---
