// frontend/src/utils/formatCurrency.js
export function formatCurrency(amount) {
    if (amount === null || amount === undefined || amount === '') return '₹0';
    const num = typeof amount === 'string' ? Number(amount.toString().replace(/,/g, '')) : amount;
    if (Number.isNaN(num)) return String(amount);
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(num);
  }
  