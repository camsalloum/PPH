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
  return str.toLowerCase().replace(/(?:^|\s|[-/(.])\w/g, (match) => match.toUpperCase());
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
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

/**
 * UAE Dirham SVG symbol for inline use
 */
const UAE_DIRHAM_SVG = `<svg class="uae-dirham-symbol" viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="display: inline-block; vertical-align: -0.1em; width: 1em; height: 1em; margin-right: 0.2em;"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>`;

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
    tfoot tr.budget-total td { padding: 6px 8px; border: 1px solid #ddd; border-bottom: 2px solid #888; background-color: #FFFFB8; text-align: right; font-weight: 700; font-size: 12px; }
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
    .new-customer-input { flex: 1; padding: 4px 6px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; }
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
    customRows
  } = params;

  const customRowCounter = customRows.length > 0 && customRows.some(r => r.id) 
    ? Math.max(...customRows.filter(r => r.id).map(r => r.id)) + 1 
    : Date.now();

  return `
    const formData = {
      division: '${division}',
      salesRep: '${normalizedSalesRep.replace(/'/g, "\\'")}',
      actualYear: ${actualYear},
      budgetYear: ${budgetYear},
    };
    
    const mergedCustomers = ${JSON.stringify(mergedCustomersList)};
    const countries = ${JSON.stringify(countriesList)};
    const productGroups = ${JSON.stringify(productGroupsList)};
    const pricingMap = ${JSON.stringify(pricingMap)};
    let customRowCounter = ${customRowCounter};
    
    function formatAmount(value) {
      if (!value || value === 0) return '0';
      if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
      if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
      return value.toFixed(0);
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
      const budgetTotals = Array.from({ length: 12 }, () => 0);
      const budgetAmountTotals = Array.from({ length: 12 }, () => 0);
      const budgetMormTotals = Array.from({ length: 12 }, () => 0);
      
      document.querySelectorAll('tr.actual-row').forEach(row => {
        const cells = row.querySelectorAll('td:nth-child(n+4):not(:last-child)');
        cells.forEach((cell, idx) => {
          const val = parseFloat(cell.textContent.replace(/,/g, '')) || 0;
          if (idx < 12) actualTotals[idx] += val;
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
      
      const actualTotalRow = document.querySelector('tfoot tr.actual-total');
      const budgetTotalRow = document.querySelector('tfoot tr.budget-total');
      const budgetAmountRow = document.querySelector('tfoot tr.budget-amount-total');
      
      if (actualTotalRow) {
        const cells = actualTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatMT(actualTotals[idx]); });
        const totalCell = actualTotalRow.querySelector('td:last-child');
        if (totalCell) totalCell.textContent = formatMT(actualTotals.reduce((sum, val) => sum + val, 0));
      }
      
      if (budgetTotalRow) {
        const cells = budgetTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatMT(budgetTotals[idx]); });
        const totalCell = budgetTotalRow.querySelector('td:last-child');
        if (totalCell) totalCell.textContent = formatMT(budgetTotals.reduce((sum, val) => sum + val, 0));
      }
      
      if (budgetAmountRow) {
        const cells = budgetAmountRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatAmount(budgetAmountTotals[idx]); });
        const totalCell = budgetAmountRow.querySelector('td:last-child');
        if (totalCell) totalCell.textContent = formatAmount(budgetAmountTotals.reduce((sum, val) => sum + val, 0));
      }
      
      const budgetMormRow = document.querySelector('tfoot tr.budget-morm-total');
      if (budgetMormRow) {
        const cells = budgetMormRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { if (idx < 12) cell.textContent = formatAmount(budgetMormTotals[idx]); });
        const totalCell = budgetMormRow.querySelector('td:last-child');
        if (totalCell) totalCell.textContent = formatAmount(budgetMormTotals.reduce((sum, val) => sum + val, 0));
      }
      
      updateProductGroupChart();
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
      const tbody = document.querySelector('table.budget-table tbody');
      const customRowsContainer = document.getElementById('customRowsContainer');
      if (!customRowsContainer) return;
      
      const rowId = customRowCounter++;
      const tr = document.createElement('tr');
      tr.className = 'custom-row';
      tr.dataset.customId = rowId;
      
      // Customer dropdown
      const customerTd = document.createElement('td');
      customerTd.className = 'editable';
      const customerSelect = document.createElement('select');
      customerSelect.className = 'inline-dropdown';
      customerSelect.innerHTML = '<option value="">-- Select Customer --</option>' + 
        mergedCustomers.map(c => '<option value="' + c + '">' + c + '</option>').join('');
      customerSelect.addEventListener('change', function() {
        updateCustomRowInputs(tr);
        debouncedRecalculate();
      });
      customerTd.appendChild(customerSelect);
      tr.appendChild(customerTd);
      
      // Country dropdown
      const countryTd = document.createElement('td');
      countryTd.className = 'editable';
      const countrySelect = document.createElement('select');
      countrySelect.className = 'inline-dropdown';
      countrySelect.innerHTML = '<option value="">-- Select --</option>' + 
        countries.map(c => '<option value="' + c + '">' + c + '</option>').join('');
      countrySelect.addEventListener('change', function() { debouncedRecalculate(); });
      countryTd.appendChild(countrySelect);
      tr.appendChild(countryTd);
      
      // Product Group dropdown
      const pgTd = document.createElement('td');
      pgTd.className = 'editable';
      const pgSelect = document.createElement('select');
      pgSelect.className = 'inline-dropdown';
      pgSelect.innerHTML = '<option value="">-- Select --</option>' + 
        productGroups.map(pg => '<option value="' + pg + '">' + pg + '</option>').join('');
      pgSelect.addEventListener('change', function() {
        updateCustomRowInputs(tr);
        debouncedRecalculate();
      });
      pgTd.appendChild(pgSelect);
      tr.appendChild(pgTd);
      
      // Month inputs (12 months)
      for (let m = 1; m <= 12; m++) {
        const monthTd = document.createElement('td');
        monthTd.className = 'editable';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'budget-input';
        input.value = '';
        input.dataset.month = m;
        input.dataset.customId = rowId;
        input.dataset.customer = '';
        input.dataset.country = '';
        input.dataset.group = '';
        input.addEventListener('input', debouncedRecalculate);
        input.addEventListener('blur', function() { this.value = formatMT(parseFloat(this.value.replace(/,/g, '')) || 0); });
        monthTd.appendChild(input);
        tr.appendChild(monthTd);
      }
      
      // Total cell
      const totalTd = document.createElement('td');
      totalTd.className = 'row-total';
      totalTd.textContent = '0.00';
      tr.appendChild(totalTd);
      
      // Delete button cell
      const deleteTd = document.createElement('td');
      deleteTd.className = 'delete-cell';
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-custom-row';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete row';
      deleteBtn.onclick = function() { deleteCustomRow(rowId); };
      deleteTd.appendChild(deleteBtn);
      tr.appendChild(deleteTd);
      
      customRowsContainer.appendChild(tr);
      debouncedRecalculate();
    }
    
    function updateCustomRowInputs(tr) {
      const customerSelect = tr.querySelector('td:first-child select');
      const countrySelect = tr.querySelector('td:nth-child(2) select');
      const pgSelect = tr.querySelector('td:nth-child(3) select');
      
      const customer = customerSelect ? customerSelect.value : '';
      const country = countrySelect ? countrySelect.value : '';
      const productGroup = pgSelect ? pgSelect.value : '';
      
      tr.querySelectorAll('input').forEach(input => {
        input.dataset.customer = customer;
        input.dataset.country = country;
        input.dataset.group = productGroup;
      });
    }
    
    function deleteCustomRow(rowId) {
      const row = document.querySelector('tr.custom-row[data-custom-id="' + rowId + '"]');
      if (row) {
        row.remove();
        debouncedRecalculate();
      }
    }
    
    function showRecapSummary() {
      const recapContainer = document.getElementById('recapSummary');
      if (!recapContainer) return;
      
      let totalActual = 0, totalBudget = 0, totalBudgetAmount = 0, totalBudgetMorm = 0;
      
      document.querySelectorAll('tr.actual-row').forEach(row => {
        const cells = row.querySelectorAll('td:nth-child(n+4):not(:last-child)');
        cells.forEach(cell => { totalActual += parseFloat(cell.textContent.replace(/,/g, '')) || 0; });
      });
      
      document.querySelectorAll('input:not([disabled])').forEach(input => {
        const val = parseFloat(input.value.replace(/,/g, '')) || 0;
        const productGroup = (input.dataset.group || '').toLowerCase();
        const pricing = pricingMap[productGroup] || { sellingPrice: 0, morm: 0 };
        const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
        const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;
        
        totalBudget += val;
        totalBudgetAmount += val * 1000 * sellingPrice;
        totalBudgetMorm += val * 1000 * mormPrice;
      });
      
      const variance = totalActual > 0 ? ((totalBudget - totalActual) / totalActual * 100) : (totalBudget > 0 ? 100 : 0);
      const varianceClass = variance > 5 ? 'pg-variance-positive' : variance < -5 ? 'pg-variance-negative' : 'pg-variance-neutral';
      
      recapContainer.innerHTML = 
        '<div class="recap-card">' +
          '<div class="recap-title">Actual ' + formData.actualYear + '</div>' +
          '<div class="recap-value">' + totalActual.toFixed(2) + ' MT</div>' +
        '</div>' +
        '<div class="recap-card budget-card">' +
          '<div class="recap-title">Budget ' + formData.budgetYear + '</div>' +
          '<div class="recap-value">' + totalBudget.toFixed(2) + ' MT</div>' +
          '<div class="recap-subtitle"><span class="' + varianceClass + '">' + (variance > 0 ? '+' : '') + variance.toFixed(1) + '%</span> vs actual</div>' +
        '</div>' +
        '<div class="recap-card amount-card">' +
          '<div class="recap-title">Budget Amount</div>' +
          '<div class="recap-value">' + formatAmount(totalBudgetAmount) + ' AED</div>' +
        '</div>' +
        '<div class="recap-card morm-card">' +
          '<div class="recap-title">Budget MORM</div>' +
          '<div class="recap-value">' + formatAmount(totalBudgetMorm) + ' AED</div>' +
        '</div>';
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
        const countrySelect = row.querySelector('td:nth-child(2) select');
        const pgSelect = row.querySelector('td:nth-child(3) select');
        
        const customer = customerSelect ? customerSelect.value : '';
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
    
    function saveDraft() {
      const data = gatherFormData('draft');
      console.log('Saving draft...', data);
      alert('Draft data prepared. Copy this JSON:\\n' + JSON.stringify(data, null, 2));
    }
    
    function saveFinal() {
      if (!confirm('Are you sure you want to save this as final? This action cannot be undone.')) return;
      const data = gatherFormData('final');
      console.log('Saving final...', data);
      alert('Final data prepared. Copy this JSON:\\n' + JSON.stringify(data, null, 2));
    }
    
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', function() {
      recalculateTotals();
      showRecapSummary();
    });
  `;
}

// Export for use in Part 3
module.exports = {
  toProperCase,
  formatMT,
  formatAmount,
  UAE_DIRHAM_SVG,
  generateStyles,
  generateJavaScript,
  generateJavaScriptPart2
};

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
    pricingData = {}
  } = params;

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
    formatAmount
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
    customRows: customRowsData
  });

  const jsCodePart2 = generateJavaScriptPart2({
    productGroupsList: productGroups,
    months
  });

  // Generate the full HTML document
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${divisionUpper} Budget ${budgetYear} - ${normalizedSalesRep}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
${generateStyles()}
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${divisionUpper} Division - Sales Rep Budget Form</h1>
      <div class="subtitle">${normalizedSalesRep} - Budget Year ${budgetYear}</div>
    </div>
    <div class="header-right">
      <button class="add-row-btn" onclick="addCustomRow()">+ Add Custom Row</button>
      <button class="save-draft-btn" onclick="saveDraft()">Save Draft</button>
      <button class="save-final-btn" onclick="saveFinal()">Save Final</button>
    </div>
  </div>

  <div class="table-container">
    <table class="budget-table">
      <colgroup>
        <col style="width: 180px;">
        <col style="width: 80px;">
        <col style="width: 100px;">
        ${months.map(() => '<col style="width: 70px;">').join('\n        ')}
        <col style="width: 80px;">
      </colgroup>
      <thead>
        <tr>
          <th rowspan="2">Customer</th>
          <th rowspan="2">Country</th>
          <th rowspan="2">Product Group</th>
          ${months.map(m => `<th>${m}</th>`).join('\n          ')}
          <th rowspan="2">Total</th>
        </tr>
        <tr>
          ${months.map((_, i) => `<th class="month-subheader">${i + 1}</th>`).join('\n          ')}
        </tr>
      </thead>
      <tbody>
${tableRowsHtml}
        <tbody id="customRowsContainer">
${generateCustomRowsHtml(customRowsData, months, formatMT)}
        </tbody>
      </tbody>
      <tfoot>
${totalsHtml}
      </tfoot>
    </table>
  </div>

  <div id="recapSummary" class="recap-summary"></div>

  <div id="productGroupChartContainer" class="chart-container" style="display: none;">
    <h3>Product Group Summary</h3>
    <div class="chart-flex">
      <div class="chart-wrapper">
        <canvas id="productGroupChart"></canvas>
      </div>
      <div class="table-wrapper">
        <table class="summary-table">
          <thead>
            <tr>
              <th>Product Group</th>
              <th>Actual ${actualYear}</th>
              <th>Budget ${budgetYear}</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody id="productGroupTableBody"></tbody>
          <tfoot>
            <tr class="total-row">
              <td><strong>Total</strong></td>
              <td id="pgTotalActual"><strong>0.00</strong></td>
              <td id="pgTotalBudget"><strong>0.00</strong></td>
              <td id="pgTotalVariance"><strong>0.0%</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>

  <div class="chart-container customer-summary">
    <h3>Customer Summary</h3>
    <table class="summary-table">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Actual ${actualYear}</th>
          <th>Budget ${budgetYear}</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody id="customerSummaryTableBody"></tbody>
      <tfoot>
        <tr class="total-row">
          <td><strong>Total</strong></td>
          <td id="custTotalActual"><strong>0.00</strong></td>
          <td id="custTotalBudget"><strong>0.00</strong></td>
          <td id="custTotalVariance"><strong>0.0%</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="footer">
    <p>Generated on ${new Date().toLocaleString()} | ${divisionUpper} Division Budget System</p>
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
 */
function generateTableRows(params) {
  const { tableData, budgetData, customRowsData, months, formatMT } = params;
  
  let html = '';
  
  // Group tableData by customer-country-productGroup for actual rows
  const groupedData = {};
  tableData.forEach(row => {
    const key = `${row.customer}|${row.country}|${row.productGroup}`;
    if (!groupedData[key]) {
      groupedData[key] = {
        customer: row.customer,
        country: row.country,
        productGroup: row.productGroup,
        months: Array(12).fill(0)
      };
    }
    // Sum monthly values
    for (let m = 1; m <= 12; m++) {
      const val = parseFloat(row[`month${m}`] || row[`m${m}`] || 0);
      groupedData[key].months[m - 1] += val;
    }
  });

  // Generate actual rows and corresponding budget rows
  Object.values(groupedData).forEach(data => {
    const actualTotal = data.months.reduce((sum, v) => sum + v, 0);
    
    // Actual row
    html += `        <tr class="actual-row">
          <td>${data.customer}</td>
          <td>${data.country}</td>
          <td>${data.productGroup}</td>
          ${data.months.map(v => `<td>${formatMT(v)}</td>`).join('\n          ')}
          <td class="row-total">${formatMT(actualTotal)}</td>
        </tr>\n`;

    // Budget row (editable)
    const budgetKey = `${data.customer}|${data.country}|${data.productGroup}`;
    const budgetRowData = budgetData[budgetKey] || {};
    const budgetMonths = Array(12).fill(0).map((_, i) => budgetRowData[`month${i + 1}`] || budgetRowData[i + 1] || 0);
    const budgetTotal = budgetMonths.reduce((sum, v) => sum + parseFloat(v || 0), 0);

    html += `        <tr class="budget-row">
          <td class="budget-label">Budget</td>
          <td></td>
          <td></td>
          ${budgetMonths.map((v, i) => `<td class="editable"><input type="text" class="budget-input" value="${formatMT(v)}" data-month="${i + 1}" data-customer="${data.customer}" data-country="${data.country}" data-group="${data.productGroup}" oninput="debouncedRecalculate()" onblur="this.value = formatMT(parseFloat(this.value.replace(/,/g, '')) || 0)"></td>`).join('\n          ')}
          <td class="row-total">${formatMT(budgetTotal)}</td>
        </tr>\n`;
  });

  return html;
}

/**
 * Generate custom rows HTML
 */
function generateCustomRowsHtml(customRowsData, months, formatMT) {
  if (!customRowsData || customRowsData.length === 0) return '';
  
  let html = '';
  customRowsData.forEach(row => {
    const monthValues = months.map((_, i) => {
      const monthKey = `month${i + 1}`;
      return row.months ? (row.months[i + 1] || row.months[monthKey] || 0) : 0;
    });
    const rowTotal = monthValues.reduce((sum, v) => sum + parseFloat(v || 0), 0);

    html += `          <tr class="custom-row" data-custom-id="${row.id || Date.now()}">
            <td class="editable"><span class="saved-value">${row.customer || ''}</span></td>
            <td class="editable"><span class="saved-value">${row.country || ''}</span></td>
            <td class="editable"><span class="saved-value">${row.productGroup || ''}</span></td>
            ${monthValues.map((v, i) => `<td class="editable"><input type="text" class="budget-input" value="${formatMT(v)}" data-month="${i + 1}" data-customer="${row.customer || ''}" data-country="${row.country || ''}" data-group="${row.productGroup || ''}" data-custom-id="${row.id || ''}" oninput="debouncedRecalculate()" onblur="this.value = formatMT(parseFloat(this.value.replace(/,/g, '')) || 0)"></td>`).join('\n            ')}
            <td class="row-total">${formatMT(rowTotal)}</td>
            <td class="delete-cell"><button class="delete-custom-row" onclick="deleteCustomRow(${row.id || 0})" title="Delete row">×</button></td>
          </tr>\n`;
  });
  
  return html;
}

/**
 * Generate totals section HTML
 */
function generateTotalsSection(params) {
  const { tableData, budgetData, customRowsData, months, pricingMap, actualYear, budgetYear, formatMT, formatAmount } = params;
  
  // Calculate actual totals
  const actualTotals = Array(12).fill(0);
  const groupedData = {};
  tableData.forEach(row => {
    const key = `${row.customer}|${row.country}|${row.productGroup}`;
    if (!groupedData[key]) {
      groupedData[key] = { productGroup: row.productGroup, months: Array(12).fill(0) };
    }
    for (let m = 1; m <= 12; m++) {
      const val = parseFloat(row[`month${m}`] || row[`m${m}`] || 0);
      groupedData[key].months[m - 1] += val;
      actualTotals[m - 1] += val;
    }
  });
  const totalActual = actualTotals.reduce((sum, v) => sum + v, 0);

  // Calculate budget totals
  const budgetTotals = Array(12).fill(0);
  const budgetAmountTotals = Array(12).fill(0);
  const budgetMormTotals = Array(12).fill(0);

  Object.entries(budgetData).forEach(([key, data]) => {
    const productGroup = key.split('|')[2] || '';
    const pricing = pricingMap[productGroup.toLowerCase()] || { sellingPrice: 0, morm: 0 };
    const sellingPrice = typeof pricing === 'object' ? (pricing.sellingPrice || 0) : pricing;
    const mormPrice = typeof pricing === 'object' ? (pricing.morm || 0) : 0;

    for (let m = 1; m <= 12; m++) {
      const val = parseFloat(data[`month${m}`] || data[m] || 0);
      budgetTotals[m - 1] += val;
      budgetAmountTotals[m - 1] += val * 1000 * sellingPrice;
      budgetMormTotals[m - 1] += val * 1000 * mormPrice;
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

  return `        <tr class="actual-total">
          <td colspan="3"><strong>Total Actual ${actualYear} (MT)</strong></td>
          ${actualTotals.map(v => `<td>${formatMT(v)}</td>`).join('\n          ')}
          <td><strong>${formatMT(totalActual)}</strong></td>
        </tr>
        <tr class="budget-total">
          <td colspan="3"><strong>Total Budget ${budgetYear} (MT)</strong></td>
          ${budgetTotals.map(v => `<td>${formatMT(v)}</td>`).join('\n          ')}
          <td><strong>${formatMT(totalBudget)}</strong></td>
        </tr>
        <tr class="budget-amount-total">
          <td colspan="3"><strong>Budget Amount (AED)</strong></td>
          ${budgetAmountTotals.map(v => `<td>${formatAmount(v)}</td>`).join('\n          ')}
          <td><strong>${formatAmount(totalBudgetAmount)}</strong></td>
        </tr>
        <tr class="budget-morm-total">
          <td colspan="3"><strong>Budget MORM (AED)</strong></td>
          ${budgetMormTotals.map(v => `<td>${formatAmount(v)}</td>`).join('\n          ')}
          <td><strong>${formatAmount(totalBudgetMorm)}</strong></td>
        </tr>`;
}

// Final exports
module.exports = {
  generateSalesRepHtmlExport,
  toProperCase,
  formatMT,
  formatAmount,
  UAE_DIRHAM_SVG,
  generateStyles
};
