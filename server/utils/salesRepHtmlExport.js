/**
 * @fileoverview Sales Rep Budget HTML Export Generator
 * @description Generates dynamic HTML form for sales rep budget planning
 * Identical functionality to the pre-refactoring version
 */

const logger = require('./logger');

/**
 * Helper function to convert string to Proper Case
 * FIXED: Now handles parentheses and periods to match INITCAP behavior
 */
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-\/(.])(\w)/g, (match, letter) => match.slice(0, -1) + letter.toUpperCase());
};

/**
 * Format MT value with 2 decimal places and thousands separator
 */
const formatMT = (val) => {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0.00';
  const num = parseFloat(String(val).replace(/,/g, ''));
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * Format Amount with K/M suffix
 */
const formatAmount = (val) => {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

/**
 * UAE Dirham SVG symbol for inline use
 */
const UAE_DIRHAM_SVG = `<svg class="uae-dirham-symbol" viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="display: inline-block; vertical-align: -0.1em; width: 1em; height: 1em; margin-right: 0.2em;"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>`;

/**
 * Currency symbols mapping by code
 */
const CURRENCY_SYMBOLS = {
  'AED': 'د.إ', 'USD': '$', 'EUR': '€', 'GBP': '£', 'SAR': '﷼', 'KWD': 'د.ك',
  'QAR': '﷼', 'BHD': '.د.ب', 'OMR': '﷼', 'JOD': 'د.ا', 'LBP': 'ل.ل', 'IQD': 'ع.د',
  'TRY': '₺', 'CHF': 'CHF', 'JPY': '¥', 'CNY': '¥', 'INR': '₹', 'PKR': '₨',
  'AUD': 'A$', 'NZD': 'NZ$', 'SGD': 'S$', 'HKD': 'HK$', 'MYR': 'RM', 'THB': '฿',
  'IDR': 'Rp', 'PHP': '₱', 'VND': '₫', 'KRW': '₩', 'TWD': 'NT$', 'CAD': 'C$',
  'MXN': '$', 'BRL': 'R$', 'ZAR': 'R', 'EGP': 'E£', 'NGN': '₦'
};

/**
 * Get currency symbol HTML based on currency info
 * @param {object} currency - Currency object with code, symbol, name
 * @returns {string} HTML string for currency symbol
 */
function getCurrencySymbolHtml(currency) {
  if (!currency || currency.code === 'AED') {
    return UAE_DIRHAM_SVG;
  }
  // Get symbol from mapping, fallback to provided symbol, then to code
  const symbol = CURRENCY_SYMBOLS[currency.code] || currency.symbol || currency.code;
  return `<span style="font-weight: inherit; margin-right: 0.15em;">${symbol}</span>`;
}

/**
 * Generate CSS styles for the HTML export
 */
function generateStyles() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 12px; background: #f5f5f5; display: flex; flex-direction: column; }
    .header { background: #fff; padding: 12px 20px; margin-bottom: 12px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0; }
    .header-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
    .header h1 { margin: 0; color: #333; font-size: 18px; }
    .header-actions { display: flex; gap: 8px; align-items: center; }
    .header-bottom { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    .header-info { display: flex; gap: 20px; flex-wrap: wrap; }
    .header-info div { font-size: 12px; color: #666; }
    .header-info strong { color: #333; }
    .header-legend { display: flex; gap: 16px; align-items: center; }
    .header-legend-item { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #555; }
    .header-legend-color { display: inline-block; width: 14px; height: 14px; border: 1px solid; border-radius: 2px; }
    .header-legend-color.actual { background-color: #cce4ff; border-color: #91caff; }
    .header-legend-color.budget { background-color: #FFEB3B; border-color: #ffc53d; }
    .header-tip { font-size: 10px; color: #8c8c8c; }
    .recap-container { flex-shrink: 0; }
    .table-container { background: #fff; padding: 0; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); width: 100%; flex: 1; min-height: 500px; overflow-x: auto; overflow-y: auto; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; table-layout: fixed; }
    .add-row-btn { background: #1677ff; color: #fff; border: none; padding: 4px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; display: inline-flex; align-items: center; gap: 4px; }
    .add-row-btn:hover { background: #4096ff; }
    .floating-add-row { position: sticky; bottom: 0; left: 0; right: 0; background: linear-gradient(transparent, #f5f5f5 30%); padding: 12px 16px; display: flex; justify-content: center; z-index: 100; }
    .floating-add-row .add-row-btn { padding: 8px 24px; font-size: 13px; font-weight: 600; box-shadow: 0 2px 8px rgba(22, 119, 255, 0.3); }
    thead tr.header-row { position: -webkit-sticky; position: sticky; top: 0; z-index: 1001; background: #fff; }
    thead th.column-header { background-color: #1677ff; color: #fff; padding: 8px; border: 1px solid #fff; text-align: center; min-width: 0; white-space: normal; word-break: break-word; line-height: 1.3; }
    thead th.column-header.sticky-col { position: -webkit-sticky; position: sticky; left: 0; z-index: 1003; background-color: #1677ff; }
    tbody td { padding: 8px; border: 1px solid #ddd; }
    tbody td:last-child { text-align: center; }
    tbody td:nth-child(1) { background-color: #fff; position: -webkit-sticky; position: sticky; left: 0; z-index: 5; font-weight: 600; white-space: normal; word-break: break-word; line-height: 1.3; }
    tbody tr.actual-row { background-color: #e6f4ff; }
    tbody tr.actual-row td:nth-child(n+4) { background-color: #e6f4ff; text-align: right; font-weight: 500; padding: 6px 8px; }
    tbody tr.budget-row { background-color: #FFFFB8; }
    tbody tr.budget-row td { background-color: #FFFFB8 !important; padding: 2px; text-align: right; font-weight: 500; font-size: 12px; }
    tbody tr.custom-row { background-color: #FFFFB8; }
    tbody tr.custom-row td:nth-child(2), tbody tr.custom-row td:nth-child(3) { padding: 4px; }
    tbody tr.custom-row td:nth-child(n+4) { background-color: #FFFFB8 !important; padding: 2px; }
    tbody input { width: 100%; border: none; padding: 4px 6px; text-align: right; font-size: 12px; font-weight: 500; background-color: transparent !important; box-shadow: none; }
    tbody input:focus { outline: none; }
    tbody input:disabled { background-color: #f5f5f5 !important; cursor: not-allowed; }
    tbody select { width: 100%; padding: 4px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; }
    tbody .delete-btn { background: #ff4d4f; color: #fff; border: none; padding: 2px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-left: 4px; }
    tbody .delete-btn:hover { background: #ff7875; }
    tfoot tr.actual-total { background-color: #cce4ff; }
    tfoot tr.actual-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #cce4ff; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.actual-total td:first-child { padding: 8px; position: -webkit-sticky; position: sticky; left: 0; z-index: 6; text-align: left; background-color: #cce4ff; font-weight: 700; }
    tfoot tr.actual-total td:last-child { background-color: #90CAF9; text-align: center; font-weight: 700; }
    tfoot tr.actual-amount-total { background-color: #d4edda; }
    tfoot tr.actual-amount-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #d4edda; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.actual-amount-total td:first-child { padding: 8px; position: -webkit-sticky; position: sticky; left: 0; z-index: 6; text-align: left; background-color: #d4edda; }
    tfoot tr.actual-amount-total td:last-child { background-color: #c3e6cb; text-align: right; }
    tfoot tr.actual-morm-total { background-color: #ffe0b2; }
    tfoot tr.actual-morm-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #ffe0b2; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.actual-morm-total td:first-child { padding: 8px; position: -webkit-sticky; position: sticky; left: 0; z-index: 6; text-align: left; background-color: #ffe0b2; }
    tfoot tr.budget-total { background-color: #FFFFB8; }
    tfoot tr.budget-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #FFFFB8; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.budget-total td:first-child { padding: 8px; position: -webkit-sticky; position: sticky; left: 0; z-index: 6; text-align: left; background-color: #FFFFB8; }
    tfoot tr.budget-total td:last-child { background-color: #FFEB3B; text-align: center; }
    tfoot tr.budget-amount-total { background-color: #d4edda; }
    tfoot tr.budget-amount-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #d4edda; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.budget-amount-total td:first-child { padding: 8px; position: -webkit-sticky; position: sticky; left: 0; z-index: 6; text-align: left; background-color: #d4edda; }
    tfoot tr.budget-amount-total td:last-child { background-color: #c3e6cb; text-align: center; }
    tfoot tr.budget-morm-total { background-color: #ffe0b2; }
    tfoot tr.budget-morm-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #ffe0b2; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.budget-morm-total td:first-child { padding: 8px; position: -webkit-sticky; position: sticky; left: 0; z-index: 6; text-align: left; background-color: #ffe0b2; }
    .btn { background: #1677ff; color: #fff; border: none; padding: 4px 15px; border-radius: 4px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; gap: 4px; }
    .btn:hover { background: #4096ff; }
    .btn:disabled { background: #ccc; cursor: not-allowed; }
    .customer-cell { display: flex; align-items: center; gap: 4px; width: 100%; }
    .customer-cell select { flex: 1; }
    .new-customer-input { flex: 1; padding: 6px 8px; border: 2px solid #1890ff; border-radius: 4px; font-size: 12px; background-color: #f0f9ff; box-shadow: 0 0 0 3px rgba(24,144,255,0.15); text-align: left; }
    .new-customer-input::placeholder { color: #8c8c8c; font-style: italic; }
    .new-customer-input:focus { outline: none; border-color: #1890ff; background-color: #fff; }
    .recap-container { background: linear-gradient(135deg, #f0f9ff 0%, #e6f4ff 100%); border: 1px solid #91caff; border-radius: 8px; padding: 10px 16px; margin-bottom: 10px; box-shadow: 0 2px 6px rgba(24,144,255,0.1); }
    .recap-title { font-size: 13px; font-weight: 600; color: #0958d9; margin-bottom: 8px; }
    .recap-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .recap-stat { background: #fff; padding: 12px 16px; border-radius: 6px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .recap-stat-header { font-size: 13px; font-weight: 600; color: #333; margin-bottom: 8px; }
    .recap-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .recap-item { display: flex; align-items: center; gap: 6px; }
    .recap-item-label { font-size: 12px; color: #666; }
    .recap-item-value { font-size: 18px; font-weight: 700; }
    .recap-item-value.actual { color: #1890ff; }
    .recap-item-value.budget { color: #d48806; }
    .recap-variance-value { font-size: 14px; font-weight: 600; padding: 3px 8px; border-radius: 4px; }
    .recap-variance-value.positive { color: #52c41a; background: #f6ffed; }
    .recap-variance-value.negative { color: #ff4d4f; background: #fff2f0; }
    .recap-variance-value.neutral { color: #666; background: #fafafa; }
    .product-group-chart-container { background: linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%); border: 1px solid #ffc53d; border-radius: 8px; padding: 16px 20px; margin: 12px; box-shadow: 0 2px 6px rgba(212, 136, 6, 0.1); flex-shrink: 0; }
    .product-group-chart-title { font-size: 14px; font-weight: 600; color: #d48806; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .product-group-chart-wrapper { background: #fff; border-radius: 6px; padding: 16px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .product-group-table { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); margin-top: 16px; }
    .product-group-table th { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 14px 16px; text-align: left; font-weight: 600; color: #fff; font-size: 14px; }
    .product-group-table th:nth-child(2), .product-group-table th:nth-child(3), .product-group-table th:nth-child(4) { text-align: right; }
    .product-group-table td { padding: 14px 16px; border-bottom: 1px solid #e8e8e8; font-size: 14px; }
    .product-group-table td:first-child { font-weight: 600; color: #333; }
    .product-group-table td:nth-child(2), .product-group-table td:nth-child(3), .product-group-table td:nth-child(4) { text-align: right; font-weight: 500; font-family: 'Segoe UI', monospace; }
    .product-group-table tbody tr:hover { background-color: #f0f7ff; }
    .product-group-table tbody tr:nth-child(even) { background-color: #fafbfc; }
    .product-group-table tfoot { background: linear-gradient(135deg, #f5f7fa 0%, #e4e8eb 100%); border-top: 2px solid #667eea; }
    .product-group-table tfoot td { padding: 14px 16px; font-size: 15px; color: #333; }
    .pg-variance-positive { color: #52c41a; font-weight: 700; }
    .pg-variance-negative { color: #ff4d4f; font-weight: 700; }
    .pg-variance-neutral { color: #666; font-weight: 600; }
    .pg-variance-new { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; }
  `;
}

/**
 * Generate the JavaScript code for the HTML export
 */
function generateJavaScript(params) {
  const {
    division,
    normalizedSalesRep,
    actualYear,
    budgetYear,
    mergedCustomersList,
    countriesList,
    productGroupsList,
    pricingMap,
    customRows,
    currency = { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
    allocationTargets = null
  } = params;

  const customRowCounter = customRows.length > 0 && customRows.some(r => r.id) 
    ? Math.max(...customRows.filter(r => r.id).map(r => r.id)) + 1 
    : Date.now();
    
  // Calculate total allocation in MT for variance tracking
  const totalAllocationMT = allocationTargets 
    ? Object.values(allocationTargets).reduce((sum, v) => sum + (parseFloat(v) || 0), 0) / 1000 
    : 0;

  return `
    const formData = {
      division: '${division}',
      salesRep: '${normalizedSalesRep.replace(/'/g, "\\'")}',
      actualYear: ${actualYear},
      budgetYear: ${budgetYear},
      currency: ${JSON.stringify(currency)},
    };
    
    const mergedCustomers = ${JSON.stringify(mergedCustomersList)};
    const countries = ${JSON.stringify(countriesList)};
    const productGroups = ${JSON.stringify(productGroupsList)};
    const pricingMap = ${JSON.stringify(pricingMap)};
    const allocationTargetMT = ${totalAllocationMT}; // Total allocation target in MT
    let customRowCounter = ${customRowCounter};
    
    function formatAmount(value) {
      if (!value || value === 0) return '0.00';
      if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
      if (value >= 1000) return (value / 1000).toFixed(2) + 'K';
      return value.toFixed(2);
    }
    
    function formatMT(value) {
      if (!value && value !== 0) return '';
      const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
      if (isNaN(num)) return '';
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => { clearTimeout(timeout); func(...args); };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }
    
    const debouncedRecalculate = debounce(() => {
      recalculateTotals();
      showRecapSummary();
    }, 250);
    
    function recalculateTotals() {
      const actualTotals = Array.from({ length: 12 }, () => 0);
      const actualAmountTotals = Array.from({ length: 12 }, () => 0);
      const actualMormTotals = Array.from({ length: 12 }, () => 0);
      const budgetTotals = Array.from({ length: 12 }, () => 0);
      const budgetAmountTotals = Array.from({ length: 12 }, () => 0);
      const budgetMormTotals = Array.from({ length: 12 }, () => 0);
      
      document.querySelectorAll('tr.actual-row').forEach(row => {
        const productGroupCell = row.querySelector('td:nth-child(3)');
        const productGroup = productGroupCell ? productGroupCell.textContent.trim().toLowerCase() : '';
        const pricing = pricingMap[productGroup] || { sellingPrice: 0, morm: 0 };
        const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
        const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;
        
        const cells = row.querySelectorAll('td:nth-child(n+4):not(:last-child)');
        cells.forEach((cell, idx) => {
          const val = parseFloat(cell.textContent.replace(/,/g, '')) || 0;
          if (idx < 12) {
            actualTotals[idx] += val;
            actualAmountTotals[idx] += val * 1000 * sellingPrice;
            actualMormTotals[idx] += val * 1000 * mormPrice;
          }
        });
      });
      
      document.querySelectorAll('input:not([disabled])').forEach(input => {
        const month = parseInt(input.dataset.month);
        const val = parseFloat(input.value.replace(/,/g, '')) || 0;
        const productGroup = (input.dataset.group || '').toLowerCase();
        const pricing = pricingMap[productGroup] || { sellingPrice: 0, morm: 0 };
        const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
        const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;
        
        if (month >= 1 && month <= 12 && !isNaN(val)) {
          budgetTotals[month - 1] += val;
          budgetAmountTotals[month - 1] += val * 1000 * sellingPrice;
          budgetMormTotals[month - 1] += val * 1000 * mormPrice;
        }
      });
      
      document.querySelectorAll('tr.budget-row, tr.custom-row').forEach(row => {
        const inputs = row.querySelectorAll('input');
        let rowTotal = 0;
        inputs.forEach(input => {
          const val = parseFloat(input.value.replace(/,/g, '')) || 0;
          rowTotal += val;
        });
        const totalCell = row.querySelector('td:last-child');
        if (totalCell) totalCell.textContent = formatMT(rowTotal);
      });
      
      // Update footer rows
      const actualTotalRow = document.querySelector('tfoot tr.actual-total');
      const actualAmountRow = document.querySelector('tfoot tr.actual-amount-total');
      const actualMormRow = document.querySelector('tfoot tr.actual-morm-total');
      const budgetTotalRow = document.querySelector('tfoot tr.budget-total');
      const budgetAmountRow = document.querySelector('tfoot tr.budget-amount-total');
      const budgetMormRow = document.querySelector('tfoot tr.budget-morm-total');
      
      if (actualTotalRow) {
        const cells = actualTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatMT(actualTotals[idx]); });
        const totalCell = actualTotalRow.querySelector('td:last-child');
        if (totalCell) totalCell.innerHTML = '<strong>' + formatMT(actualTotals.reduce((sum, val) => sum + val, 0)) + '</strong>';
      }
      
      if (actualAmountRow) {
        const cells = actualAmountRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatAmount(actualAmountTotals[idx]); });
        const totalCell = actualAmountRow.querySelector('td:last-child');
        if (totalCell) totalCell.innerHTML = '<strong>' + formatAmount(actualAmountTotals.reduce((sum, val) => sum + val, 0)) + '</strong>';
      }
      
      if (actualMormRow) {
        const cells = actualMormRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatAmount(actualMormTotals[idx]); });
        const totalCell = actualMormRow.querySelector('td:last-child');
        if (totalCell) totalCell.innerHTML = '<strong>' + formatAmount(actualMormTotals.reduce((sum, val) => sum + val, 0)) + '</strong>';
      }
      
      if (budgetTotalRow) {
        const cells = budgetTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatMT(budgetTotals[idx]); });
        const totalCell = budgetTotalRow.querySelector('td:last-child');
        if (totalCell) totalCell.innerHTML = '<strong>' + formatMT(budgetTotals.reduce((sum, val) => sum + val, 0)) + '</strong>';
      }
      
      if (budgetAmountRow) {
        const cells = budgetAmountRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatAmount(budgetAmountTotals[idx]); });
        const totalCell = budgetAmountRow.querySelector('td:last-child');
        if (totalCell) totalCell.innerHTML = '<strong>' + formatAmount(budgetAmountTotals.reduce((sum, val) => sum + val, 0)) + '</strong>';
      }
      
      if (budgetMormRow) {
        const cells = budgetMormRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatAmount(budgetMormTotals[idx]); });
        const totalCell = budgetMormRow.querySelector('td:last-child');
        if (totalCell) totalCell.innerHTML = '<strong>' + formatAmount(budgetMormTotals.reduce((sum, val) => sum + val, 0)) + '</strong>';
      }
      
      updateProductGroupChart();
      
      // Update allocation variance if allocation targets are set
      if (allocationTargetMT > 0) {
        const totalBudgetMT = budgetTotals.reduce((sum, val) => sum + val, 0);
        const budgetEl = document.getElementById('allocationBudgetTotal');
        const varianceEl = document.getElementById('allocationVariance');
        
        if (budgetEl) {
          budgetEl.textContent = totalBudgetMT.toFixed(2) + ' MT';
        }
        
        if (varianceEl) {
          const variance = totalBudgetMT - allocationTargetMT;
          varianceEl.textContent = (variance >= 0 ? '+' : '') + variance.toFixed(2) + ' MT';
          
          // Color coding: green if within 1%, red if under, blue if over
          const pctDiff = Math.abs(variance / allocationTargetMT) * 100;
          if (pctDiff < 1) {
            varianceEl.style.color = '#52c41a'; // Green - matched!
          } else if (variance < 0) {
            varianceEl.style.color = '#ff4d4f'; // Red - under target
          } else {
            varianceEl.style.color = '#1677ff'; // Blue - over target
          }
        }
      }
    }
    
    let productGroupChartInstance = null;
    
    function updateProductGroupChart() {
      const productGroupData = {};
      
      document.querySelectorAll('tr.actual-row').forEach(row => {
        const productGroupCell = row.querySelector('td:nth-child(3)');
        if (!productGroupCell) return;
        const productGroup = productGroupCell.textContent.trim();
        if (!productGroupData[productGroup]) productGroupData[productGroup] = { actual: 0, budget: 0 };
        const cells = row.querySelectorAll('td:nth-child(n+4):not(:last-child)');
        cells.forEach(cell => {
          const val = parseFloat(cell.textContent.replace(/,/g, '')) || 0;
          productGroupData[productGroup].actual += val;
        });
      });
      
      document.querySelectorAll('tr.budget-row, tr.custom-row').forEach(row => {
        let productGroup;
        if (row.classList.contains('budget-row')) {
          const firstInput = row.querySelector('input[data-group]');
          productGroup = firstInput ? firstInput.dataset.group : '';
        } else {
          const productGroupCell = row.querySelector('td:nth-child(3)');
          if (productGroupCell) {
            const selectElem = productGroupCell.querySelector('select, span');
            productGroup = selectElem ? (selectElem.tagName === 'SELECT' ? selectElem.value : selectElem.textContent.trim()) : productGroupCell.textContent.trim();
          }
        }
        if (!productGroup) return;
        if (!productGroupData[productGroup]) productGroupData[productGroup] = { actual: 0, budget: 0 };
        const inputs = row.querySelectorAll('input[data-month]');
        inputs.forEach(input => {
          const val = parseFloat(input.value.replace(/,/g, '')) || 0;
          productGroupData[productGroup].budget += val;
        });
      });
      
      const filteredData = Object.entries(productGroupData)
        .filter(([_, data]) => data.actual > 0 || data.budget > 0)
        .sort((a, b) => (b[1].actual + b[1].budget) - (a[1].actual + a[1].budget));
      
      const hasProductGroupData = filteredData.length > 0;
      document.getElementById('productGroupChartContainer').style.display = hasProductGroupData ? 'block' : 'none';
      
      const labels = filteredData.map(([pg]) => pg);
      const actualData = filteredData.map(([_, data]) => data.actual.toFixed(2));
      const budgetData = filteredData.map(([_, data]) => data.budget.toFixed(2));
      
      const tableBody = document.getElementById('productGroupTableBody');
      tableBody.innerHTML = filteredData.map(([pg, data]) => {
        let varianceClass, varianceText;
        if (data.actual === 0 && data.budget > 0) {
          varianceClass = 'pg-variance-new'; varianceText = 'NEW';
        } else if (data.actual > 0) {
          const variance = ((data.budget - data.actual) / data.actual) * 100;
          varianceClass = variance > 5 ? 'pg-variance-positive' : variance < -5 ? 'pg-variance-negative' : 'pg-variance-neutral';
          varianceText = (variance > 0 ? '+' : '') + variance.toFixed(1) + '%';
        } else {
          varianceClass = 'pg-variance-neutral'; varianceText = '0.0%';
        }
        return '<tr><td>' + pg + '</td><td>' + data.actual.toFixed(2) + '</td><td>' + data.budget.toFixed(2) + '</td><td><span class="' + varianceClass + '">' + varianceText + '</span></td></tr>';
      }).join('');
      
      const totalActual = filteredData.reduce((sum, [_, data]) => sum + data.actual, 0);
      const totalBudget = filteredData.reduce((sum, [_, data]) => sum + data.budget, 0);
      let totalVarianceClass, totalVarianceText;
      if (totalActual === 0 && totalBudget > 0) {
        totalVarianceClass = 'pg-variance-new'; totalVarianceText = 'NEW';
      } else if (totalActual > 0) {
        const totalVariance = ((totalBudget - totalActual) / totalActual) * 100;
        totalVarianceClass = totalVariance > 5 ? 'pg-variance-positive' : totalVariance < -5 ? 'pg-variance-negative' : 'pg-variance-neutral';
        totalVarianceText = (totalVariance > 0 ? '+' : '') + totalVariance.toFixed(1) + '%';
      } else {
        totalVarianceClass = 'pg-variance-neutral'; totalVarianceText = '0.0%';
      }
      
      document.getElementById('pgTotalActual').innerHTML = '<strong>' + totalActual.toFixed(2) + '</strong>';
      document.getElementById('pgTotalBudget').innerHTML = '<strong>' + totalBudget.toFixed(2) + '</strong>';
      document.getElementById('pgTotalVariance').innerHTML = '<strong><span class="' + totalVarianceClass + '">' + totalVarianceText + '</span></strong>';
      
      updateCustomerSummaryTable();
      
      if (hasProductGroupData) {
        const ctx = document.getElementById('productGroupChart').getContext('2d');
        if (productGroupChartInstance) {
          productGroupChartInstance.data.labels = labels;
          productGroupChartInstance.data.datasets[0].data = actualData;
          productGroupChartInstance.data.datasets[1].data = budgetData;
          productGroupChartInstance.update();
        } else {
          productGroupChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [
                { label: 'Actual ' + formData.actualYear + ' (MT)', data: actualData, backgroundColor: 'rgba(24, 144, 255, 0.7)', borderColor: 'rgba(24, 144, 255, 1)', borderWidth: 1 },
                { label: 'Budget ' + formData.budgetYear + ' (MT)', data: budgetData, backgroundColor: 'rgba(255, 235, 59, 0.7)', borderColor: 'rgba(212, 136, 6, 1)', borderWidth: 1 }
              ]
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              plugins: { legend: { display: true, position: 'top' } },
              scales: { y: { beginAtZero: true, ticks: { callback: function(value) { return value.toFixed(0) + ' MT'; } } } }
            }
          });
        }
      }
    }
    
    function updateCustomerSummaryTable() {
      const actualCustomerTotals = {};
      const budgetCustomerTotals = {};
      
      document.querySelectorAll('tr.actual-row').forEach(row => {
        const customer = row.querySelector('td:first-child')?.textContent.trim();
        if (!customer) return;
        let total = 0;
        const cells = row.querySelectorAll('td');
        for (let i = 3; i < cells.length - 1; i++) {
          total += parseFloat(cells[i].textContent.replace(/,/g, '')) || 0;
        }
        actualCustomerTotals[customer] = (actualCustomerTotals[customer] || 0) + total;
      });
      
      document.querySelectorAll('tr.budget-row input[data-customer][data-month], tr.custom-row input[data-customer][data-month]').forEach(input => {
        const customer = input.getAttribute('data-customer');
        if (!customer) return;
        const value = parseFloat(input.value.replace(/,/g, '')) || 0;
        budgetCustomerTotals[customer] = (budgetCustomerTotals[customer] || 0) + value;
      });
      
      const allCustomers = Array.from(new Set([...Object.keys(actualCustomerTotals), ...Object.keys(budgetCustomerTotals)]))
        .sort((a, b) => ((actualCustomerTotals[b] || 0) + (budgetCustomerTotals[b] || 0)) - ((actualCustomerTotals[a] || 0) + (budgetCustomerTotals[a] || 0)));
      
      const customerRows = allCustomers.map(cust => {
        const actual = actualCustomerTotals[cust] || 0;
        const budget = budgetCustomerTotals[cust] || 0;
        let varianceClass, varianceText;
        if (actual === 0 && budget > 0) {
          varianceClass = 'pg-variance-new'; varianceText = 'NEW';
        } else if (actual > 0) {
          const variance = ((budget - actual) / actual) * 100;
          varianceClass = variance > 5 ? 'pg-variance-positive' : variance < -5 ? 'pg-variance-negative' : 'pg-variance-neutral';
          varianceText = (variance > 0 ? '+' : '') + variance.toFixed(1) + '%';
        } else {
          varianceClass = 'pg-variance-neutral'; varianceText = '0.0%';
        }
        return '<tr><td>' + cust + '</td><td>' + actual.toFixed(2) + '</td><td>' + budget.toFixed(2) + '</td><td><span class="' + varianceClass + '">' + varianceText + '</span></td></tr>';
      }).join('');
      
      document.getElementById('customerSummaryTableBody').innerHTML = customerRows;
      
      const totalActualCust = allCustomers.reduce((sum, cust) => sum + (actualCustomerTotals[cust] || 0), 0);
      const totalBudgetCust = allCustomers.reduce((sum, cust) => sum + (budgetCustomerTotals[cust] || 0), 0);
      let totalVarianceClassCust, totalVarianceTextCust;
      if (totalActualCust === 0 && totalBudgetCust > 0) {
        totalVarianceClassCust = 'pg-variance-new'; totalVarianceTextCust = 'NEW';
      } else if (totalActualCust > 0) {
        const totalVarianceCust = ((totalBudgetCust - totalActualCust) / totalActualCust) * 100;
        totalVarianceClassCust = totalVarianceCust > 5 ? 'pg-variance-positive' : totalVarianceCust < -5 ? 'pg-variance-negative' : 'pg-variance-neutral';
        totalVarianceTextCust = (totalVarianceCust > 0 ? '+' : '') + totalVarianceCust.toFixed(1) + '%';
      } else {
        totalVarianceClassCust = 'pg-variance-neutral'; totalVarianceTextCust = '0.0%';
      }
      
      document.getElementById('custTotalActual').innerHTML = '<strong>' + totalActualCust.toFixed(2) + '</strong>';
      document.getElementById('custTotalBudget').innerHTML = '<strong>' + totalBudgetCust.toFixed(2) + '</strong>';
      document.getElementById('custTotalVariance').innerHTML = '<strong><span class="' + totalVarianceClassCust + '">' + totalVarianceTextCust + '</span></strong>';
    }
  `;
}

/**
 * Generate additional JavaScript functions (custom row management, save buttons, etc.)
 */
function generateJavaScriptPart2(params) {
  const { productGroupsList, months } = params;
  
  return `
    function addCustomRow() {
      var rowId = customRowCounter++;
      var tbody = document.getElementById('tableBody');
      if (!tbody) return;
      
      var budgetCells = '';
      for (var m = 1; m <= 12; m++) {
        budgetCells += '<td><input type="text" data-customer="" data-country="" data-group="" data-month="' + m + '" placeholder="0" class="custom-input" disabled /></td>';
      }
      
      var customerOptions = mergedCustomers.map(function(c) {
        return '<option value="' + c.replace(/"/g, '&quot;') + '">' + c + '</option>';
      }).join('');
      var countryOptions = countries.map(function(c) {
        return '<option value="' + c.replace(/"/g, '&quot;') + '">' + c + '</option>';
      }).join('');
      var productGroupOptions = productGroups.map(function(pg) {
        return '<option value="' + pg.replace(/"/g, '&quot;') + '">' + pg + '</option>';
      }).join('');
      
      var newRow = document.createElement('tr');
      newRow.className = 'custom-row';
      newRow.setAttribute('data-row-id', rowId);
      newRow.innerHTML = '<td style="padding: 8px; border: 1px solid #ddd; background-color: #fff; position: sticky; left: 0; z-index: 5; font-weight: 600; white-space: normal; word-break: break-word; line-height: 1.3;">' +
        '<div class="customer-cell" style="display: flex; align-items: center; gap: 4px;">' +
        '<select class="customer-select" style="flex: 1;">' +
        '<option value="" disabled selected></option>' +
        '<option value="__NEW__" style="font-style: italic; color: #1890ff;">+ Add New Customer</option>' +
        customerOptions +
        '</select>' +
        '<input type="text" class="new-customer-input" placeholder="Type customer name here..." style="flex: 1; font-weight: 600; display:none;" />' +
        '<button class="delete-btn" onclick="removeCustomRow(this)">×</button>' +
        '</div>' +
        '</td>' +
        '<td>' +
        '<select class="country-select" style="width: 100%;">' +
        '<option value="" disabled selected>Select country</option>' +
        countryOptions +
        '</select>' +
        '</td>' +
        '<td>' +
        '<select class="product-group-select" style="width: 100%;">' +
        '<option value="" disabled selected>Select product group</option>' +
        productGroupOptions +
        '</select>' +
        '</td>' +
        budgetCells +
        '<td class="custom-row-total" style="background-color: #FFEB3B; text-align: center; font-weight: 700;">0.00</td>';

      tbody.appendChild(newRow);
      attachRowListeners(newRow);
      debouncedRecalculate();
    }
    
    function removeCustomRow(btn) {
      var row = btn.closest('tr.custom-row');
      if (!row) return;
      if (confirm('Remove this custom row?')) {
        row.remove();
        debouncedRecalculate();
      }
    }
    
    function attachRowListeners(row) {
      // Customer select change handler
      var customerSelect = row.querySelector('.customer-select');
      if (customerSelect) {
        customerSelect.addEventListener('change', function() {
          var newCustomerInput = row.querySelector('.new-customer-input');
          if (this.value === '__NEW__') {
            if (newCustomerInput) {
              newCustomerInput.style.display = 'block';
              this.style.display = 'none';
              newCustomerInput.focus();
            }
          } else {
            if (newCustomerInput) {
              newCustomerInput.style.display = 'none';
              newCustomerInput.value = '';
            }
            this.style.display = 'block';
            updateCustomRowInputs(row, this.value);
          }
          debouncedRecalculate();
        });
      }
      
      // New customer input blur handler
      var newCustomerInput = row.querySelector('.new-customer-input');
      if (newCustomerInput) {
        newCustomerInput.addEventListener('blur', function() {
          if (!this.value.trim()) {
            this.style.display = 'none';
            if (customerSelect) {
              customerSelect.value = '';
              customerSelect.style.display = 'block';
            }
          }
          // Update data attributes so customer summary table updates immediately
          updateCustomRowInputs(row, null);
          debouncedRecalculate();
        });
        // Update customer summary as user types (live update)
        newCustomerInput.addEventListener('input', function() {
          updateCustomRowInputs(row, null);
          debouncedRecalculate();
        });
        newCustomerInput.addEventListener('keypress', function(e) {
          if (e.key === 'Enter') {
            this.blur();
          }
        });
      }
      
      // Country select change handler
      var countrySelect = row.querySelector('.country-select');
      if (countrySelect) {
        countrySelect.addEventListener('change', function() {
          updateCustomRowInputs(row, null);
          debouncedRecalculate();
        });
      }
      
      // Product group select change handler
      var pgSelect = row.querySelector('.product-group-select');
      if (pgSelect) {
        pgSelect.addEventListener('change', function() {
          updateCustomRowInputs(row, null);
          // Enable inputs once product group is selected
          if (this.value) {
            row.querySelectorAll('input.custom-input').forEach(function(input) {
              input.disabled = false;
            });
          }
          debouncedRecalculate();
        });
      }
      
      // Month input handlers
      row.querySelectorAll('input.custom-input').forEach(function(input) {
        input.addEventListener('input', debouncedRecalculate);
        input.addEventListener('blur', function() {
          var val = parseFloat(this.value.replace(/,/g, '')) || 0;
          this.value = formatMT(val);
        });
      });
    }
    
    function updateCustomRowInputs(row, customerValue) {
      var customerSelect = row.querySelector('.customer-select');
      var newCustomerInput = row.querySelector('.new-customer-input');
      var countrySelect = row.querySelector('.country-select');
      var pgSelect = row.querySelector('.product-group-select');
      
      var customer = '';
      if (newCustomerInput && newCustomerInput.style.display !== 'none' && newCustomerInput.value.trim()) {
        customer = newCustomerInput.value.trim();
      } else if (customerSelect && customerSelect.value && customerSelect.value !== '__NEW__') {
        customer = customerSelect.value;
      }
      
      var country = countrySelect ? countrySelect.value : '';
      var productGroup = pgSelect ? pgSelect.value : '';
      
      row.querySelectorAll('input[data-month]').forEach(function(input) {
        input.dataset.customer = customer;
        input.dataset.country = country;
        input.dataset.group = productGroup;
      });
    }
    
    function showRecapSummary() {
      // Budget data from inputs
      var budgetInputs = document.querySelectorAll('input[data-month]');
      var budgetCustomerSet = new Set();
      var budgetTotalMT = 0;
      var budgetTotalAmount = 0;
      
      budgetInputs.forEach(function(input) {
        var value = parseFloat((input.value || '').replace(/,/g, '')) || 0;
        if (value > 0) {
          var customer = input.dataset.customer;
          var productGroup = (input.dataset.group || '').toLowerCase();
          
          if (customer) budgetCustomerSet.add(customer);
          budgetTotalMT += value;
          
          // Calculate budget amount using pricing
          var pricing = pricingMap[productGroup] || { sellingPrice: 0 };
          var sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
          budgetTotalAmount += value * 1000 * sellingPrice;
        }
      });
      
      // Actual data from actual rows (table cells, not inputs)
      var actualCustomerSet = new Set();
      var actualTotalMT = 0;
      var actualTotalAmount = 0;
      
      document.querySelectorAll('tr.actual-row').forEach(function(row) {
        var customerCell = row.querySelector('td:first-child');
        if (customerCell) {
          var customerName = customerCell.textContent.trim();
          if (customerName) actualCustomerSet.add(customerName);
        }
        
        // Get actual MT values (columns 4-15, excluding last Total column)
        var cells = row.querySelectorAll('td:nth-child(n+4):not(:last-child)');
        cells.forEach(function(cell) {
          var val = parseFloat((cell.textContent || '').replace(/,/g, '')) || 0;
          if (val > 0) actualTotalMT += val;
        });
      });
      
      // Get actual amount from footer row
      var actualAmountRow = document.querySelector('tfoot tr.actual-amount-total');
      if (actualAmountRow) {
        var totalCell = actualAmountRow.querySelector('td:last-child');
        if (totalCell) {
          var text = totalCell.textContent || '';
          if (text.indexOf('M') !== -1) {
            actualTotalAmount = parseFloat(text.replace('M', '')) * 1000000;
          } else if (text.indexOf('K') !== -1) {
            actualTotalAmount = parseFloat(text.replace('K', '')) * 1000;
          } else {
            actualTotalAmount = parseFloat(text.replace(/,/g, '')) || 0;
          }
        }
      }
      
      // Format helpers
      var formatMTFull = function(val) {
        return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      };
      var formatAmountCompact = function(val) {
        if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
        if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
        return val.toFixed(0);
      };
      
      // Calculate variances
      var mtVariancePct = actualTotalMT > 0 ? (((budgetTotalMT - actualTotalMT) / actualTotalMT) * 100) : 0;
      var amountVariancePct = actualTotalAmount > 0 ? (((budgetTotalAmount - actualTotalAmount) / actualTotalAmount) * 100) : 0;
      var customerVariance = budgetCustomerSet.size - actualCustomerSet.size;
      
      // Update DOM elements
      document.getElementById('recapActualMT').textContent = formatMTFull(actualTotalMT);
      document.getElementById('recapBudgetMT').textContent = formatMTFull(budgetTotalMT);
      
      document.getElementById('recapActualAmount').textContent = formatAmountCompact(actualTotalAmount);
      document.getElementById('recapBudgetAmount').textContent = formatAmountCompact(budgetTotalAmount);
      
      document.getElementById('recapActualCustomers').textContent = actualCustomerSet.size;
      document.getElementById('recapBudgetCustomers').textContent = budgetCustomerSet.size;
      
      // Update variances
      var mtVarEl = document.getElementById('recapMTVariance');
      mtVarEl.textContent = (mtVariancePct >= 0 ? '+' : '') + mtVariancePct.toFixed(0) + '%';
      mtVarEl.className = 'recap-variance-value ' + (mtVariancePct > 0 ? 'positive' : (mtVariancePct < 0 ? 'negative' : 'neutral'));
      
      var amountVarEl = document.getElementById('recapAmountVariance');
      amountVarEl.textContent = (amountVariancePct >= 0 ? '+' : '') + amountVariancePct.toFixed(0) + '%';
      amountVarEl.className = 'recap-variance-value ' + (amountVariancePct > 0 ? 'positive' : (amountVariancePct < 0 ? 'negative' : 'neutral'));
      
      var custVarEl = document.getElementById('recapCustomerVariance');
      custVarEl.textContent = (customerVariance >= 0 ? '+' : '') + customerVariance;
      custVarEl.className = 'recap-variance-value ' + (customerVariance > 0 ? 'positive' : (customerVariance < 0 ? 'negative' : 'neutral'));
      
      // Always show the recap container
      document.getElementById('recapContainer').style.display = 'block';
    }
    
    function gatherFormData(status) {
      const budgetData = [];
      const customRowsData = [];
      
      // Gather budget row data
      document.querySelectorAll('tr.budget-row').forEach(row => {
        const firstInput = row.querySelector('input[data-customer]');
        if (!firstInput) return;
        
        const customer = firstInput.dataset.customer || '';
        const country = firstInput.dataset.country || '';
        const productGroup = firstInput.dataset.group || '';
        
        const rowData = {
          customer,
          country,
          productGroup,
          months: {}
        };
        
        row.querySelectorAll('input[data-month]').forEach(input => {
          const month = parseInt(input.dataset.month);
          const value = parseFloat(input.value.replace(/,/g, '')) || 0;
          if (month >= 1 && month <= 12) {
            rowData.months[month] = value;
          }
        });
        
        budgetData.push(rowData);
      });
      
      // Gather custom row data
      document.querySelectorAll('tr.custom-row').forEach(row => {
        const customerSelect = row.querySelector('td:first-child select');
        const newCustomerInput = row.querySelector('td:first-child .new-customer-input');
        const countrySelect = row.querySelector('td:nth-child(2) select');
        const pgSelect = row.querySelector('td:nth-child(3) select');
        
        // Get customer name - check new customer input first, then select
        var customer = '';
        if (newCustomerInput && newCustomerInput.style.display !== 'none' && newCustomerInput.value.trim()) {
          customer = newCustomerInput.value.trim();
        } else if (customerSelect && customerSelect.value && customerSelect.value !== '__NEW__') {
          customer = customerSelect.value;
        }
        const country = countrySelect ? countrySelect.value : '';
        const productGroup = pgSelect ? pgSelect.value : '';
        
        if (!customer && !productGroup) return; // Skip empty rows
        
        const rowData = {
          id: parseInt(row.dataset.customId) || Date.now(),
          customer,
          country,
          productGroup,
          months: {}
        };
        
        row.querySelectorAll('input[data-month]').forEach(input => {
          const month = parseInt(input.dataset.month);
          const value = parseFloat(input.value.replace(/,/g, '')) || 0;
          if (month >= 1 && month <= 12) {
            rowData.months[month] = value;
          }
        });
        
        customRowsData.push(rowData);
      });
      
      return {
        division: formData.division,
        salesRep: formData.salesRep,
        budgetYear: formData.budgetYear,
        status: status,
        budgetData: budgetData,
        customRowsData: customRowsData
      };
    }
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
      recalculateTotals();
      showRecapSummary();
      
      // Ensure all inputs are enabled on page load (for draft files)
      document.querySelectorAll('input[data-month]').forEach(function(input) {
        input.removeAttribute('disabled');
        input.disabled = false;
      });
      
      // Add Row button listener (floating at bottom of table)
      var addRowBtnBottom = document.getElementById('addRowBtnBottom');
      if (addRowBtnBottom) {
        addRowBtnBottom.addEventListener('click', addCustomRow);
      }
      
      // Event delegation for budget inputs in table container
      var tableContainer = document.querySelector('.table-container');
      if (tableContainer) {
        tableContainer.addEventListener('input', function(e) {
          if (e.target.matches('input[data-month]')) {
            debouncedRecalculate();
          }
        });
        tableContainer.addEventListener('blur', function(e) {
          if (e.target.matches('input[data-month]')) {
            var val = parseFloat(e.target.value.replace(/,/g, '')) || 0;
            e.target.value = formatMT(val);
          }
        }, true);
      }
      
      // Save Draft Button - keeps form editable
      document.getElementById('saveDraftBtn').addEventListener('click', function() {
        // Validate: Check for custom rows with empty customer
        var customRows = document.querySelectorAll('tr.custom-row');
        var rowsWithEmptyCustomer = [];
        customRows.forEach(function(row) {
          var customerSelect = row.querySelector('.customer-select');
          var customerInput = row.querySelector('.new-customer-input');
          var hasCustomer = false;
          if (customerSelect && customerSelect.value && customerSelect.value !== '' && customerSelect.value !== '__NEW__') {
            hasCustomer = true;
          } else if (customerInput && customerInput.style.display !== 'none' && customerInput.value && customerInput.value.trim()) {
            hasCustomer = true;
          }
          if (!hasCustomer) {
            rowsWithEmptyCustomer.push(row);
          }
        });
        
        if (rowsWithEmptyCustomer.length > 0) {
          alert('⚠️ Customer Required!\\n\\nPlease select a customer for all custom rows or delete empty rows before saving draft.\\n\\nEmpty rows found: ' + rowsWithEmptyCustomer.length);
          return;
        }
        
        // Recalculate totals first
        recalculateTotals();
        
        // CRITICAL: Update value attributes in the DOM so they persist in the saved file
        document.querySelectorAll('input').forEach(function(input) {
          input.setAttribute('value', input.value);
        });
        
        document.querySelectorAll('select').forEach(function(select) {
          var options = select.querySelectorAll('option');
          options.forEach(function(opt) {
            if (opt.selected) {
              opt.setAttribute('selected', 'selected');
            } else {
              opt.removeAttribute('selected');
            }
          });
        });
        
        // Clone the entire document AS-IS (keep everything editable)
        var clonedDoc = document.cloneNode(true);
        
        // Ensure inputs are enabled in draft
        clonedDoc.querySelectorAll('input').forEach(function(input) {
          input.removeAttribute('disabled');
        });
        
        // Add draft metadata
        var draftMetadata = {
          isDraft: true,
          division: formData.division,
          salesRep: formData.salesRep,
          actualYear: formData.actualYear,
          budgetYear: formData.budgetYear,
          savedAt: new Date().toISOString(),
          version: '1.0',
          dataFormat: 'budget_draft'
        };
        
        // Remove existing draft metadata script if exists
        var existingDraftScript = clonedDoc.getElementById('draftMetadata');
        if (existingDraftScript) existingDraftScript.remove();
        
        // Embed draft metadata
        var draftScript = clonedDoc.createElement('script');
        draftScript.id = 'draftMetadata';
        draftScript.textContent = '/* DRAFT METADATA */\\nvar draftMetadata = ' + JSON.stringify(draftMetadata, null, 2) + ';';
        clonedDoc.body.appendChild(draftScript);
        
        // Get HTML content with IPD signature
        var htmlContent = '<!DOCTYPE html>\\n<!-- IPD_BUDGET_SYSTEM_v1.1 :: TYPE=SALES_REP_BUDGET :: DO_NOT_EDIT_THIS_LINE -->\\n' + clonedDoc.documentElement.outerHTML;
        
        // Generate filename
        var now = new Date();
        var timestamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '_' +
          String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        var filename = 'DRAFT_' + formData.division.replace(/[^a-zA-Z0-9]/g, '_') + '_' + 
          formData.salesRep.replace(/[^a-zA-Z0-9]/g, '_') + '_' + formData.budgetYear + '_' + timestamp + '.html';
        
        // Trigger download
        var blob = new Blob([htmlContent], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Draft saved!\\n\\nYou can open this file later to continue editing.\\n\\nFilename: ' + filename + '\\n\\n💡 This is a DRAFT file - it cannot be uploaded to the system.\\nUse "Save Final" when ready to submit.');
      });
      
      // Save Final Button - creates static HTML for upload
      document.getElementById('saveFinalBtn').addEventListener('click', function() {
        // Validate: Check for custom rows with empty customer
        var customRows = document.querySelectorAll('tr.custom-row');
        var rowsWithEmptyCustomer = [];
        customRows.forEach(function(row) {
          var customerSelect = row.querySelector('.customer-select');
          var customerInput = row.querySelector('.new-customer-input');
          var hasCustomer = false;
          if (customerSelect && customerSelect.value && customerSelect.value !== '' && customerSelect.value !== '__NEW__') {
            hasCustomer = true;
          } else if (customerInput && customerInput.style.display !== 'none' && customerInput.value && customerInput.value.trim()) {
            hasCustomer = true;
          }
          if (!hasCustomer) {
            rowsWithEmptyCustomer.push(row);
          }
        });
        
        if (rowsWithEmptyCustomer.length > 0) {
          alert('⚠️ Customer Required!\\n\\nPlease select a customer for all custom rows or delete empty rows before saving final.\\n\\nEmpty rows found: ' + rowsWithEmptyCustomer.length);
          return;
        }
        
        // Validate: Check if any budget data is entered
        var budgetInputs = document.querySelectorAll('input:not([disabled])[data-month]');
        var hasData = Array.from(budgetInputs).some(function(input) {
          var val = input.value.replace(/,/g, '');
          return val && parseFloat(val) > 0;
        });
        
        if (!hasData) {
          alert('⚠️ No budget data entered!\\n\\nPlease enter at least one budget value before saving final version.');
          return;
        }
        
        // Confirm finalization
        if (!confirm('📋 Finalize Budget?\\n\\nThis will create a final version that:\\n• Cannot be edited\\n• Can be uploaded to the system\\n• Will calculate Amount and MoRM values\\n\\nDo you want to proceed?')) {
          return;
        }
        
        // Recalculate totals first
        recalculateTotals();
        
        // CRITICAL: Update value attributes in the DOM so they persist in the saved file
        document.querySelectorAll('input').forEach(function(input) {
          input.setAttribute('value', input.value);
        });
        
        document.querySelectorAll('select').forEach(function(select) {
          var options = select.querySelectorAll('option');
          options.forEach(function(opt) {
            if (opt.selected) {
              opt.setAttribute('selected', 'selected');
            } else {
              opt.removeAttribute('selected');
            }
          });
        });
        
        // Clone the document
        var clonedDoc = document.cloneNode(true);
        
        // Replace all budget inputs with hardcoded text
        clonedDoc.querySelectorAll('input[data-month]').forEach(function(input) {
          var value = input.value || '0';
          var td = input.parentElement;
          td.innerHTML = value;
          td.style.textAlign = 'right';
          td.style.fontWeight = '500';
          td.style.padding = '6px 8px';
        });
        
        // Remove all interactive elements
        clonedDoc.querySelectorAll('.delete-btn').forEach(function(btn) { btn.remove(); });
        
        // Replace new customer inputs with text FIRST (before handling selects)
        clonedDoc.querySelectorAll('.new-customer-input').forEach(function(input) {
          if (input.style.display !== 'none' && input.value) {
            var span = clonedDoc.createElement('span');
            span.textContent = input.value;
            span.style.fontWeight = '600';
            if (input.parentNode) input.parentNode.insertBefore(span, input);
          }
          input.remove();
        });
        
        // Now handle selects - customer-selects with __NEW__ should be removed (customer name already added above)
        clonedDoc.querySelectorAll('select').forEach(function(select) {
          // If this is a customer select with __NEW__ selected, just remove it (the input was already converted)
          if (select.classList.contains('customer-select') && select.value === '__NEW__') {
            select.remove();
          } else {
            var value = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : '';
            select.outerHTML = '<span>' + value + '</span>';
          }
        });
        
        // Remove buttons
        var addBtn = clonedDoc.getElementById('addRowBtn');
        if (addBtn) addBtn.remove();
        var saveDraftBtn = clonedDoc.getElementById('saveDraftBtn');
        if (saveDraftBtn) saveDraftBtn.remove();
        var saveFinalBtn = clonedDoc.getElementById('saveFinalBtn');
        if (saveFinalBtn) saveFinalBtn.remove();
        
        // Remove tip message
        clonedDoc.querySelectorAll('div').forEach(function(div) {
          var hasMarginTop = div.style.marginTop === '8px' || (div.getAttribute('style') && div.getAttribute('style').indexOf('margin-top: 8px') !== -1);
          var hasTipText = div.innerHTML && div.innerHTML.indexOf('💡 <strong>Tip:</strong>') !== -1;
          if (hasMarginTop && hasTipText) div.remove();
        });
        
        // Convert chart canvas to static image
        var originalCanvas = document.getElementById('productGroupChart');
        if (originalCanvas && typeof productGroupChartInstance !== 'undefined' && productGroupChartInstance) {
          try {
            var chartImageUrl = originalCanvas.toDataURL('image/png', 1.0);
            var clonedCanvas = clonedDoc.getElementById('productGroupChart');
            if (clonedCanvas) {
              var img = clonedDoc.createElement('img');
              img.src = chartImageUrl;
              img.alt = 'Product Group Chart';
              img.style.cssText = 'max-width: 100%; height: auto; display: block;';
              clonedCanvas.parentNode.replaceChild(img, clonedCanvas);
            }
          } catch (e) {
            console.error('Failed to convert chart to image:', e);
          }
        }
        
        // Remove all scripts except savedBudgetData
        clonedDoc.querySelectorAll('script').forEach(function(script) {
          if (!script.id || script.id !== 'savedBudgetData') {
            script.remove();
          }
        });
        
        // Collect budget data for backend import
        var budgetDataArray = [];
        document.querySelectorAll('input:not([disabled])[data-month]').forEach(function(input) {
          var val = input.value.replace(/,/g, '');
          if (val && parseFloat(val) > 0) {
            budgetDataArray.push({
              customer: input.dataset.customer,
              country: input.dataset.country,
              productGroup: input.dataset.group,
              month: parseInt(input.dataset.month),
              value: parseFloat(val) * 1000
            });
          }
        });
        
        // Add metadata script with currency information
        var metadata = {
          division: formData.division,
          salesRep: formData.salesRep,
          actualYear: formData.actualYear,
          budgetYear: formData.budgetYear,
          currency: formData.currency || { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' },
          savedAt: new Date().toISOString(),
          version: '1.1',
          dataFormat: 'budget_import'
        };
        
        var savedDataScript = clonedDoc.createElement('script');
        savedDataScript.id = 'savedBudgetData';
        savedDataScript.textContent = '/* BUDGET DATA FOR DATABASE IMPORT */\\n' +
          'const budgetMetadata = ' + JSON.stringify(metadata, null, 2) + ';\\n' +
          'const savedBudget = ' + JSON.stringify(budgetDataArray, null, 2) + ';';
        clonedDoc.body.appendChild(savedDataScript);
        
        // Get HTML content with IPD signature
        var htmlContent = '<!DOCTYPE html>\\n<!-- IPD_BUDGET_SYSTEM_v1.1 :: TYPE=SALES_REP_BUDGET :: DO_NOT_EDIT_THIS_LINE -->\\n' + clonedDoc.documentElement.outerHTML;
        
        // Generate filename
        var now = new Date();
        var timestamp = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0') + '_' +
          String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
        var filename = 'FINAL_' + formData.division.replace(/[^a-zA-Z0-9]/g, '_') + '_' + 
          formData.salesRep.replace(/[^a-zA-Z0-9]/g, '_') + '_' + formData.budgetYear + '_' + timestamp + '.html';
        
        // Trigger download
        var blob = new Blob([htmlContent], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        
        alert('✅ Final version saved!\\n\\nThis file can be uploaded to the system.\\n\\nFilename: ' + filename);
      });
    });
  `;
}

/**
 * Main function to generate the Sales Rep HTML Export
 */
async function generateSalesRepHtmlExport(params) {
  const {
    division,
    actualYear,
    salesRep,
    tableData = [],
    customRowsData = [],
    budgetData = {},
    mergedCustomers = [],
    countries = [],
    productGroups = [],
    pricingData = {},
    currency = { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' }, // Default to AED
    // Management Allocation specific (optional)
    allocationTargets = null,
    groupName = null,
    groupMembers = null // Array of member names for group exports
  } = params;
  
  // Get currency symbol HTML
  const currencySymbolHtml = getCurrencySymbolHtml(currency);
  
  // Determine if this is a group export
  const isGroupExport = groupMembers && groupMembers.length > 0;

  const budgetYear = actualYear + 1;
  const normalizedSalesRep = toProperCase(salesRep);
  const divisionUpper = (division || 'FP').toUpperCase();
  
  // Build pricing map (lowercase keys for matching)
  const pricingMap = {};
  Object.entries(pricingData).forEach(([pg, data]) => {
    pricingMap[pg.toLowerCase()] = data;
  });

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Generate table rows HTML
  const tableRowsHtml = generateTableRows({
    tableData,
    budgetData,
    customRowsData,
    months,
    formatMT
  });

  // Generate totals HTML
  const totalsHtml = generateTotalsSection({
    tableData,
    budgetData,
    customRowsData,
    months,
    pricingMap,
    actualYear,
    budgetYear,
    formatMT,
    formatAmount,
    currencySymbolHtml
  });

  // Generate JavaScript
  const jsCode = generateJavaScript({
    division,
    normalizedSalesRep,
    actualYear,
    budgetYear,
    mergedCustomersList: mergedCustomers,
    countriesList: countries,
    productGroupsList: productGroups,
    pricingMap,
    customRows: customRowsData,
    currency, // Pass currency for metadata
    allocationTargets // Pass allocation targets for variance calculation
  });

  const jsCodePart2 = generateJavaScriptPart2({
    productGroupsList: productGroups,
    months
  });

  // Generate Management Allocation Targets section if allocationTargets provided
  let allocationTargetsHtml = '';
  if (allocationTargets && Object.keys(allocationTargets).length > 0) {
    // Calculate total allocation (in KGS, convert to MT for display)
    const totalAllocationKgs = Object.values(allocationTargets).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
    const totalAllocationMT = totalAllocationKgs / 1000;
    
    // Calculate total actual from tableData (already in MT)
    const totalActualMT = tableData.reduce((sum, row) => {
      let rowTotal = 0;
      for (let m = 1; m <= 12; m++) {
        rowTotal += parseFloat(row.monthlyActual?.[m] || 0);
      }
      return sum + rowTotal;
    }, 0);
    
    allocationTargetsHtml = `
  <div class="allocation-targets-container" style="background: linear-gradient(135deg, #004B93 0%, #0066CC 100%); border: 1px solid #003366; border-radius: 8px; padding: 16px 20px; margin-bottom: 12px; box-shadow: 0 2px 6px rgba(0,75,147,0.3);">
    <div style="font-size: 14px; font-weight: 600; color: #fff; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
      📌 Management Allocation Targets (by Product Group)
      ${groupName ? `<span style="font-size: 12px; font-weight: normal; color: rgba(255,255,255,0.8); margin-left: 8px;">Group: ${groupName}</span>` : ''}
    </div>
    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; max-height: 180px; overflow-y: auto; margin-bottom: 16px;">
      ${Object.entries(allocationTargets)
        .filter(([_, kgs]) => parseFloat(kgs) > 0)
        .sort((a, b) => (parseFloat(b[1]) || 0) - (parseFloat(a[1]) || 0))
        .map(([pg, kgs]) => `
        <div style="background: rgba(255,255,255,0.15); padding: 10px 8px; border-radius: 6px; text-align: center; border: 1px solid rgba(255,255,255,0.3);">
          <div style="font-weight: 600; color: #fff; font-size: 11px; margin-bottom: 4px; line-height: 1.3;">${pg}</div>
          <div style="color: #FFD700; font-weight: 700; font-size: 14px;">${(parseFloat(kgs) / 1000).toFixed(2)} MT</div>
        </div>
      `).join('')}
    </div>
    <div style="display: flex; gap: 32px; flex-wrap: wrap; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.3);">
      <div style="text-align: center;">
        <div style="font-size: 11px; color: rgba(255,255,255,0.8); text-transform: uppercase;">Total Target Allocation</div>
        <div style="font-size: 22px; font-weight: bold; color: #FFD700;">${totalAllocationMT.toFixed(2)} MT</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: rgba(255,255,255,0.8); text-transform: uppercase;">Your ${actualYear} Actual</div>
        <div style="font-size: 22px; font-weight: bold; color: #90EE90;">${totalActualMT.toFixed(2)} MT</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: rgba(255,255,255,0.8); text-transform: uppercase;">Your Budget (Filled)</div>
        <div style="font-size: 22px; font-weight: bold; color: #fff;" id="allocationBudgetTotal">0.00 MT</div>
      </div>
      <div style="text-align: center;">
        <div style="font-size: 11px; color: rgba(255,255,255,0.8); text-transform: uppercase;">Variance vs Target</div>
        <div style="font-size: 22px; font-weight: bold; color: #ff6b6b;" id="allocationVariance">-${totalAllocationMT.toFixed(2)} MT</div>
      </div>
    </div>
    <div style="margin-top: 12px; padding: 8px 12px; background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.3); border-radius: 4px; color: #fff; font-size: 12px;">
      ⚠️ Fill in your customer-level budget below. Your total should match the Management Allocation targets shown above.
    </div>
  </div>`;
  }

  // Generate the full HTML document with IPD marker for import detection
  const html = `<!DOCTYPE html>
<!-- IPD_BUDGET_SYSTEM_v1.1 :: TYPE=SALES_REP_BUDGET :: DO_NOT_EDIT_THIS_LINE -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Budget Planning - ${divisionUpper} - ${normalizedSalesRep} - ${actualYear}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
${generateStyles()}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <h1>Budget Planning Form</h1>
      <div class="header-actions">
        <button class="btn" id="saveDraftBtn" style="background: #1677ff; padding: 4px 12px; font-size: 11px;">💾 Save Draft</button>
        <button class="btn" id="saveFinalBtn" style="background: #52c41a; padding: 4px 12px; font-size: 11px;">✓ Save Final</button>
      </div>
    </div>
    <div class="header-bottom">
      <div class="header-info">
        <div><strong>Division:</strong> ${divisionUpper}</div>
        <div><strong>${isGroupExport ? 'Group' : 'Sales Rep'}:</strong> ${normalizedSalesRep}</div>
        ${isGroupExport ? `<div><strong>Members:</strong> ${groupMembers.join(', ')}</div>` : ''}
        <div><strong>Actual Year:</strong> ${actualYear}</div>
        <div><strong>Budget Year:</strong> ${budgetYear}</div>
      </div>
      <div class="header-legend">
        <div class="header-legend-item">
          <span class="header-legend-color actual"></span>
          <span>Actual ${actualYear} (MT)</span>
        </div>
        <div class="header-legend-item">
          <span class="header-legend-color budget"></span>
          <span>Budget ${budgetYear} (MT)</span>
        </div>
        <span class="header-tip">💡 Save Draft to continue later, Save Final to submit</span>
      </div>
    </div>
  </div>

${allocationTargetsHtml}

  <div id="recapContainer" class="recap-container" style="display: none;">
    <div class="recap-title">📊 Budget vs Actual Summary</div>
    <div class="recap-stats">
      <div class="recap-stat">
        <div class="recap-stat-header">📦 Volume (MT)</div>
        <div class="recap-row">
          <div class="recap-item">
            <span class="recap-item-label">Act:</span>
            <span class="recap-item-value actual" id="recapActualMT">0</span>
          </div>
          <div class="recap-item">
            <span class="recap-item-label">Bud:</span>
            <span class="recap-item-value budget" id="recapBudgetMT">0</span>
          </div>
          <span class="recap-variance-value neutral" id="recapMTVariance">0%</span>
        </div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-header">${currencySymbolHtml} Amount</div>
        <div class="recap-row">
          <div class="recap-item">
            <span class="recap-item-label">Act:</span>
            <span class="recap-item-value actual" id="recapActualAmount">0</span>
          </div>
          <div class="recap-item">
            <span class="recap-item-label">Bud:</span>
            <span class="recap-item-value budget" id="recapBudgetAmount">0</span>
          </div>
          <span class="recap-variance-value neutral" id="recapAmountVariance">0%</span>
        </div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-header">👥 Customers</div>
        <div class="recap-row">
          <div class="recap-item">
            <span class="recap-item-label">Act:</span>
            <span class="recap-item-value actual" id="recapActualCustomers">0</span>
          </div>
          <div class="recap-item">
            <span class="recap-item-label">Bud:</span>
            <span class="recap-item-value budget" id="recapBudgetCustomers">0</span>
          </div>
          <span class="recap-variance-value neutral" id="recapCustomerVariance">0%</span>
        </div>
      </div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <colgroup>
        <col style="width: 19%;">
        <col style="width: 9%;">
        <col style="width: 8%;">
        ${Array.from({ length: 12 }, () => '<col style="width: 4.5%;">').join('\n        ')}
        <col style="width: 8%;">
      </colgroup>
      <thead>
        <tr class="header-row">
          <th rowspan="2" class="column-header sticky-col">Customer Name</th>
          <th rowspan="2" class="column-header" style="width: 10%;">Country Name</th>
          <th rowspan="2" class="column-header" style="width: 12%;">Product Group</th>
          ${Array.from({ length: 12 }, (_, i) => '<th class="column-header" style="width: 5%;">' + (i + 1) + '</th>').join('')}
          <th rowspan="2" class="column-header" style="background-color: #0958d9; width: 8%; font-weight: 700;">Total</th>
        </tr>
      </thead>
      <tbody id="tableBody">
${tableRowsHtml}
      </tbody>
      <tfoot>
${totalsHtml}
      </tfoot>
    </table>
    <div class="floating-add-row">
      <button class="add-row-btn" id="addRowBtnBottom">+ Add New Row</button>
    </div>
  </div>

  <div id="productGroupChartContainer" class="product-group-chart-container" style="display: none;">
    <div class="product-group-chart-title">📊 Product Group Breakdown: Actual vs Budget (MT)</div>
    <div class="product-group-chart-wrapper">
      <canvas id="productGroupChart" style="max-height: 400px;"></canvas>
    </div>
    <table class="product-group-table" id="productGroupTable">
      <thead>
        <tr>
          <th>Product Group</th>
          <th>Actual (MT)</th>
          <th>Budget (MT)</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody id="productGroupTableBody"></tbody>
      <tfoot id="productGroupTableFoot">
        <tr>
          <td><strong>TOTAL</strong></td>
          <td id="pgTotalActual"><strong>0.00</strong></td>
          <td id="pgTotalBudget"><strong>0.00</strong></td>
          <td id="pgTotalVariance"><strong>0.0%</strong></td>
        </tr>
      </tfoot>
    </table>
    <div class="product-group-chart-title" style="margin-top:32px;">📋 Customer Breakdown: Actual vs Budget (MT)</div>
    <table class="product-group-table" id="customerSummaryTable" style="margin-bottom:32px;">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Actual (MT)</th>
          <th>Budget (MT)</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody id="customerSummaryTableBody"></tbody>
      <tfoot id="customerSummaryTableFoot">
        <tr>
          <td><strong>TOTAL</strong></td>
          <td id="custTotalActual"><strong>0.00</strong></td>
          <td id="custTotalBudget"><strong>0.00</strong></td>
          <td id="custTotalVariance"><strong>0.0%</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <script>
${jsCode}
${jsCodePart2}
  </script>
</body>
</html>`;

  return html;
}

/**
 * Generate table rows HTML for actual and budget data
 * Uses rowspan="2" to merge customer/country/productGroup cells between actual and budget rows
 */
function generateTableRows(params) {
  const { tableData, budgetData, customRowsData, months, formatMT } = params;
  
  // Sort tableData by customer -> country -> productGroup for consistent ordering
  const sortedTableData = [...tableData].sort((a, b) => {
    const customerCompare = (a.customer || '').localeCompare(b.customer || '');
    if (customerCompare !== 0) return customerCompare;
    const countryCompare = (a.country || '').localeCompare(b.country || '');
    if (countryCompare !== 0) return countryCompare;
    return (a.productGroup || '').localeCompare(b.productGroup || '');
  });
  
  let html = '';
  
  // Generate actual rows and corresponding budget rows (paired with rowspan)
  sortedTableData.forEach((row) => {
    // Calculate actual values for this row
    let actualRowTotal = 0;
    const actualCells = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const value = row.monthlyActual?.[month] || row[`month${month}`] || row[`m${month}`] || 0;
      actualRowTotal += parseFloat(value) || 0;
      const formatted = formatMT(value);
      return `<td>${formatted}</td>`;
    }).join('');
    
    // Calculate budget values for this row
    let budgetRowTotal = 0;
    const budgetCells = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const key = `${row.customer}|${row.country}|${row.productGroup}|${month}`;
      const preFilledValue = budgetData[key] || '';
      if (preFilledValue) {
        budgetRowTotal += parseFloat(String(preFilledValue).replace(/,/g, '')) || 0;
      }
      return `<td><input type="text" data-customer="${(row.customer || '').replace(/"/g, '&quot;')}" data-country="${(row.country || '').replace(/"/g, '&quot;')}" data-group="${(row.productGroup || '').replace(/"/g, '&quot;')}" data-month="${month}" placeholder="0" value="${preFilledValue}" /></td>`;
    }).join('');
    
    // Actual row with rowspan="2" for the 3 left columns
    html += `        <tr class="actual-row">
          <td rowspan="2">${row.customer || ''}</td>
          <td rowspan="2">${row.country || ''}</td>
          <td rowspan="2">${row.productGroup || ''}</td>
          ${actualCells}
          <td style="background-color: #cce4ff; text-align: center; font-weight: 700;">${formatMT(actualRowTotal)}</td>
        </tr>
        <tr class="budget-row">
          ${budgetCells}
          <td class="budget-row-total" style="background-color: #FFEB3B; text-align: center; font-weight: 700;">${formatMT(budgetRowTotal)}</td>
        </tr>\n`;
  });
  
  // Generate custom rows (if any exist from previously saved drafts)
  if (customRowsData && customRowsData.length > 0) {
    customRowsData.forEach((row, idx) => {
      let customRowTotal = 0;
      const budgetCells = Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const val = row.months ? (row.months[month] || row.months[`month${month}`] || 0) : 0;
        customRowTotal += parseFloat(val) || 0;
        return `<td><input type="text" data-customer="${(row.customer || '').replace(/"/g, '&quot;')}" data-country="${(row.country || '').replace(/"/g, '&quot;')}" data-group="${(row.productGroup || '').replace(/"/g, '&quot;')}" data-month="${month}" placeholder="0" value="${formatMT(val)}" class="custom-input" /></td>`;
      }).join('');
      
      html += `        <tr class="custom-row" data-row-id="${row.id || idx}">
          <td style="padding: 8px; border: 1px solid #ddd; background-color: #fff; position: sticky; left: 0; z-index: 5; font-weight: 600;">
            <div class="customer-cell" style="display: flex; align-items: center; gap: 4px;">
              <span style="flex: 1; font-weight: 600;">${row.customer || ''}</span>
              <button class="delete-btn" onclick="removeCustomRow(this)">×</button>
            </div>
          </td>
          <td>${row.country || ''}</td>
          <td>${row.productGroup || ''}</td>
          ${budgetCells}
          <td class="custom-row-total" style="background-color: #FFEB3B; text-align: center; font-weight: 700;">${formatMT(customRowTotal)}</td>
        </tr>\n`;
    });
  }

  return html;
}

/**
 * Generate totals section HTML (tfoot) with all 6 rows:
 * - Actual Volume, Actual Amount, Actual MoRM
 * - Budget Volume, Budget Amount, Budget MoRM
 */
function generateTotalsSection(params) {
  const { tableData, budgetData, customRowsData, months, pricingMap, actualYear, budgetYear, formatMT, formatAmount, currencySymbolHtml } = params;
  
  // Calculate actual totals per month
  const actualTotals = Array(12).fill(0);
  const actualAmountTotals = Array(12).fill(0);
  const actualMormTotals = Array(12).fill(0);
  
  // Group tableData and calculate actual values
  tableData.forEach(row => {
    const productGroup = row.productGroup || '';
    const pricing = pricingMap[(productGroup).toLowerCase()] || { sellingPrice: 0, morm: 0 };
    const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
    const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;
    
    for (let m = 1; m <= 12; m++) {
      const val = parseFloat(row.monthlyActual?.[m] || row[`month${m}`] || row[`m${m}`] || 0);
      actualTotals[m - 1] += val;
      actualAmountTotals[m - 1] += val * 1000 * sellingPrice;
      actualMormTotals[m - 1] += val * 1000 * mormPrice;
    }
  });
  
  const totalActual = actualTotals.reduce((sum, v) => sum + v, 0);
  const totalActualAmount = actualAmountTotals.reduce((sum, v) => sum + v, 0);
  const totalActualMorm = actualMormTotals.reduce((sum, v) => sum + v, 0);

  // Calculate budget totals
  const budgetTotals = Array(12).fill(0);
  const budgetAmountTotals = Array(12).fill(0);
  const budgetMormTotals = Array(12).fill(0);

  // Process budgetData - structure is key: customer|country|productGroup|month => value
  Object.entries(budgetData).forEach(([key, value]) => {
    const parts = key.split('|');
    if (parts.length === 4) {
      const productGroup = parts[2] || '';
      const month = parseInt(parts[3]);
      const val = parseFloat(String(value).replace(/,/g, '')) || 0;
      
      const pricing = pricingMap[productGroup.toLowerCase()] || { sellingPrice: 0, morm: 0 };
      const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
      const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;

      if (month >= 1 && month <= 12) {
        budgetTotals[month - 1] += val;
        budgetAmountTotals[month - 1] += val * 1000 * sellingPrice;
        budgetMormTotals[month - 1] += val * 1000 * mormPrice;
      }
    }
  });

  // Add custom rows to budget totals
  (customRowsData || []).forEach(row => {
    const productGroup = row.productGroup || '';
    const pricing = pricingMap[productGroup.toLowerCase()] || { sellingPrice: 0, morm: 0 };
    const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
    const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;

    for (let m = 1; m <= 12; m++) {
      const val = row.months ? parseFloat(row.months[m] || row.months[`month${m}`] || 0) : 0;
      budgetTotals[m - 1] += val;
      budgetAmountTotals[m - 1] += val * 1000 * sellingPrice;
      budgetMormTotals[m - 1] += val * 1000 * mormPrice;
    }
  });

  const totalBudget = budgetTotals.reduce((sum, v) => sum + v, 0);
  const totalBudgetAmount = budgetAmountTotals.reduce((sum, v) => sum + v, 0);
  const totalBudgetMorm = budgetMormTotals.reduce((sum, v) => sum + v, 0);

  // Generate 6 footer rows
  return `        <tr class="actual-total">
          <td colspan="3"><strong>Total Actual Volume (MT)</strong></td>
          ${actualTotals.map(v => `<td>${formatMT(v)}</td>`).join('\n          ')}
          <td style="background-color: #90CAF9; text-align: center; font-weight: 700;"><strong>${formatMT(totalActual)}</strong></td>
        </tr>
        <tr class="actual-amount-total">
          <td colspan="3"><strong>Total Actual Amount (${currencySymbolHtml})</strong></td>
          ${actualAmountTotals.map(v => `<td>${formatAmount(v)}</td>`).join('\n          ')}
          <td style="text-align: center;"><strong>${formatAmount(totalActualAmount)}</strong></td>
        </tr>
        <tr class="actual-morm-total" style="display: none;">
          <td colspan="3"><strong>Total Actual MoRM (${currencySymbolHtml})</strong></td>
          ${actualMormTotals.map(v => `<td>${formatAmount(v)}</td>`).join('\n          ')}
          <td style="text-align: center;"><strong>${formatAmount(totalActualMorm)}</strong></td>
        </tr>
        <tr class="budget-total">
          <td colspan="3"><strong>Total Budget Volume (MT)</strong></td>
          ${budgetTotals.map(v => `<td>${formatMT(v)}</td>`).join('\n          ')}
          <td style="background-color: #FFEB3B; text-align: center; font-weight: 700;" id="budgetYearTotal"><strong>${formatMT(totalBudget)}</strong></td>
        </tr>
        <tr class="budget-amount-total">
          <td colspan="3"><strong>Total Budget Amount (${currencySymbolHtml})</strong></td>
          ${budgetAmountTotals.map(v => `<td>${formatAmount(v)}</td>`).join('\n          ')}
          <td id="budgetAmountYearTotal" style="text-align: center;"><strong>${formatAmount(totalBudgetAmount)}</strong></td>
        </tr>
        <tr class="budget-morm-total" style="display: none;">
          <td colspan="3"><strong>Total Budget MoRM (${currencySymbolHtml})</strong></td>
          ${budgetMormTotals.map(v => `<td>${formatAmount(v)}</td>`).join('\n          ')}
          <td id="budgetMormYearTotal" style="text-align: center;"><strong>${formatAmount(totalBudgetMorm)}</strong></td>
        </tr>`;
}

// Final exports
module.exports = {
  generateSalesRepHtmlExport,
  toProperCase,
  formatMT,
  formatAmount,
  UAE_DIRHAM_SVG,
  getCurrencySymbolHtml,
  generateStyles
};
