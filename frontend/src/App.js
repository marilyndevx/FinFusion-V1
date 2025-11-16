import React from 'react';
import '@/App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import GroupExpenses from './pages/GroupExpenses';
import Budgets from './pages/Budgets';
import Forecasting from './pages/Forecasting';

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/groups" element={<GroupExpenses />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/forecast" element={<Forecasting />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;