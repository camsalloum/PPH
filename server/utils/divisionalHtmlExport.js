/**
 * @fileoverview Divisional Budget HTML Export Generator
 * @description Generates dynamic HTML form for divisional budget planning
 * Matches the live version with interactive totals calculation
 */

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
 * Generate the complete HTML export for divisional budget
 * @param {Object} params - Export parameters
 * @param {string} params.division - Division code (from company_divisions)
 * @param {number} params.actualYear - Actual year for reference data
 * @param {number} params.budgetYear - Budget year
 * @param {Array} params.tableData - Table data with product groups and monthly actuals
 * @param {Object} params.budgetData - Current budget values keyed by "ProductGroup|Month"
 * @param {Object} params.servicesChargesData - Services Charges actual data
 * @param {Object} params.servicesChargesBudget - Services Charges budget keyed by "Services Charges|Month|AMOUNT"
 * @param {Object} params.pricingData - Pricing data keyed by product group
 * @param {Object} params.materialPercentages - Material percentages for substrate calculation
 * @param {Object} params.currency - Currency object with code, symbol, name
 * @returns {string} Complete HTML document
 */
function generateDivisionalBudgetHtml({
  division,
  actualYear,
  budgetYear,
  tableData = [],
  budgetData = {},
  servicesChargesData = null,
  servicesChargesBudget = {},
  pricingData = {},
  materialPercentages = {},
  currency = { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham' }
}) {
  // Get currency symbol HTML
  const currencySymbolHtml = getCurrencySymbolHtml(currency);
  
  // Format helpers
  const formatMT = (val) => {
    if (val === null || val === undefined || isNaN(parseFloat(val))) return '0.00';
    const num = parseFloat(String(val).replace(/,/g, ''));
    return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatAed = (val) => {
    if (val === null || val === undefined || isNaN(parseFloat(val))) return '0';
    const num = parseFloat(String(val).replace(/,/g, ''));
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  // Calculate actual totals for summary cards
  let actualVolumeTotal = 0;
  let actualAmountTotal = 0;
  let actualMormTotal = 0;
  
  const monthlyActualTotals = {};
  const monthlyActualAmountTotals = {};
  const monthlyActualMormTotals = {};
  
  // Product group actuals for chart/tables
  const productGroupActuals = {};
  
  for (let m = 1; m <= 12; m++) {
    monthlyActualTotals[m] = 0;
    monthlyActualAmountTotals[m] = 0;
    monthlyActualMormTotals[m] = 0;
  }

  // Sort tableData: alphabetical, but Others second-to-last, Services Charges always last
  const sortedTableData = [...tableData].sort((a, b) => {
    const aName = (a.productGroup || '').toUpperCase().trim();
    const bName = (b.productGroup || '').toUpperCase().trim();
    
    // Services Charges always last
    if (aName === 'SERVICES CHARGES') return 1;
    if (bName === 'SERVICES CHARGES') return -1;
    
    // "Other" or "Others" second to last
    const isAOther = aName === 'OTHER' || aName === 'OTHERS';
    const isBOther = bName === 'OTHER' || bName === 'OTHERS';
    if (isAOther && !isBOther) return 1;
    if (isBOther && !isAOther) return -1;
    
    // Alphabetical for all others
    return aName.localeCompare(bName);
  });

  // Build table rows
  let tableRowsHtml = '';
  
  sortedTableData.forEach((row) => {
    const productGroup = row.productGroup;
    let rowActualTotal = 0;
    let rowActualAmount = 0;
    let rowActualMorm = 0;
    
    // Actual Row
    let actualCells = '';
    for (let month = 1; month <= 12; month++) {
      const monthData = (row.monthlyActual || {})[month] || {};
      const actualMT = monthData.MT || 0;
      const actualAmount = monthData.AMOUNT || 0;
      const actualMorm = monthData.MORM || 0;
      
      rowActualTotal += actualMT;
      rowActualAmount += actualAmount;
      rowActualMorm += actualMorm;
      monthlyActualTotals[month] += actualMT;
      monthlyActualAmountTotals[month] += actualAmount;
      monthlyActualMormTotals[month] += actualMorm;
      
      actualVolumeTotal += actualMT;
      actualAmountTotal += actualAmount;
      actualMormTotal += actualMorm;
      
      actualCells += `<td>${formatMT(actualMT)}</td>`;
    }
    
    // Store product group actuals for chart/tables
    productGroupActuals[productGroup] = {
      mt: rowActualTotal,
      amount: rowActualAmount,
      morm: rowActualMorm
    };
    
    tableRowsHtml += `
        <tr class="actual-row" data-pg="${productGroup}">
          <td rowspan="2">${productGroup}</td>
          ${actualCells}
          <td style="background-color: #b3d9ff; text-align: center; font-weight: 700;">${formatMT(rowActualTotal)}</td>
        </tr>`;
    
    // Budget Row
    let budgetCells = '';
    for (let month = 1; month <= 12; month++) {
      const budgetKey = `${productGroup}|${month}`;
      const budgetValue = budgetData[budgetKey] || '';
      budgetCells += `<td><input type="text" data-group="${productGroup}" data-month="${month}" placeholder="0" value="${budgetValue}" /></td>`;
    }
    
    tableRowsHtml += `
        <tr class="budget-row">
          ${budgetCells}
          <td class="product-budget-total" data-group="${productGroup}" style="background-color: #FFEB3B; text-align: center; font-weight: 700;">0.00</td>
        </tr>`;
  });

  // Services Charges Row - Show if there's actual data OR budget data
  // Check if there's any services charges budget data
  const hasServicesChargesBudget = Object.keys(servicesChargesBudget || {}).some(key => {
    const value = servicesChargesBudget[key];
    return value !== '' && value !== null && value !== undefined && parseFloat(value) !== 0;
  });
  
  const hasServicesChargesActual = servicesChargesData && servicesChargesData.monthlyActual && 
    Object.keys(servicesChargesData.monthlyActual).length > 0;
  
  if (hasServicesChargesActual || hasServicesChargesBudget) {
    let scActualCells = '';
    let scActualTotal = 0;
    
    for (let month = 1; month <= 12; month++) {
      const monthData = hasServicesChargesActual ? (servicesChargesData.monthlyActual[month] || {}) : {};
      const actualAmount = monthData.AMOUNT || 0;
      scActualTotal += actualAmount;
      // Services Charges: Amount = MoRM (100%)
      monthlyActualAmountTotals[month] += actualAmount;
      monthlyActualMormTotals[month] += actualAmount;
      actualAmountTotal += actualAmount;
      actualMormTotal += actualAmount;
      
      scActualCells += `<td style="font-size: 11px;">${formatAed(actualAmount)}</td>`;
    }
    
    tableRowsHtml += `
        <tr class="actual-row" style="border-top: 2px solid #1890ff; background-color: #f0f5ff;">
          <td rowspan="2" style="font-style: italic;">Services Charges<br><span style="font-size: 10px; color: #666; font-weight: 400;">(Amount in k)</span></td>
          ${scActualCells}
          <td style="background-color: #d4f7d4; text-align: center; font-weight: 700; font-size: 11px;">${formatAed(scActualTotal)}</td>
        </tr>`;
    
    // Add Services Charges to productGroupActuals for chart/tables (Amount = MoRM for Services Charges)
    productGroupActuals['Services Charges'] = {
      mt: 0,  // Services Charges has no MT
      amount: scActualTotal,
      morm: scActualTotal  // Amount = MoRM for Services Charges
    };
    
    // Services Charges Budget Row
    let scBudgetCells = '';
    for (let month = 1; month <= 12; month++) {
      const key = `Services Charges|${month}|AMOUNT`;
      const rawBudgetValue = servicesChargesBudget[key] || '';
      // Frontend stores values in k (thousands) - use as-is for display
      const budgetValue = rawBudgetValue !== '' ? rawBudgetValue : '';
      scBudgetCells += `<td style="background-color: #fffbe6;">
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 2px;">
            <input type="text" data-group="Services Charges" data-month="${month}" data-metric="AMOUNT" placeholder="0" value="${budgetValue}" style="width: 50px; font-size: 11px;" />
            <span style="font-size: 10px; color: #666;">k</span>
          </div>
        </td>`;
    }
    
    tableRowsHtml += `
        <tr class="budget-row services-charges-budget-row" data-pg="Services Charges" style="background-color: #fffbe6;">
          ${scBudgetCells}
          <td class="sc-budget-total" style="background-color: #fffbe6; text-align: center; font-weight: 700; font-size: 11px;">0</td>
        </tr>`;
  }

  // Build Actual totals rows for footer
  let actualVolumeCells = '';
  let actualAmountCells = '';
  let actualMormCells = '';
  
  for (let month = 1; month <= 12; month++) {
    actualVolumeCells += `<td>${formatMT(monthlyActualTotals[month])}</td>`;
    actualAmountCells += `<td>${formatAed(monthlyActualAmountTotals[month])}</td>`;
    actualMormCells += `<td>${formatAed(monthlyActualMormTotals[month])}</td>`;
  }

  // Build pricing map for JavaScript
  const pricingMapJs = {};
  Object.keys(pricingData).forEach(key => {
    const p = pricingData[key];
    pricingMapJs[key.toLowerCase().trim()] = {
      sellingPrice: p.asp || p.sellingPrice || 0,
      morm: p.morm || 0
    };
  });

  return `<!DOCTYPE html>
<!-- IPD_BUDGET_SYSTEM_v1.0 :: TYPE=DIVISIONAL_BUDGET :: DO_NOT_EDIT_THIS_LINE -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="division" content="${division}">
  <meta name="actualYear" content="${actualYear}">
  <meta name="budgetYear" content="${budgetYear}">
  <meta name="exportType" content="divisional">
  <title>Divisional Budget Planning - ${division} - ${budgetYear}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
    .header { background: #fff; padding: 16px 20px; margin-bottom: 16px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); flex-shrink: 0; }
    .header h1 { margin-bottom: 8px; color: #333; font-size: 20px; }
    .header-info { display: flex; gap: 30px; flex-wrap: wrap; font-size: 13px; color: #666; }
    .header-info strong { color: #333; }
    
    .summary-container { background: #f8f9fa; padding: 12px 16px; margin-bottom: 12px; border-radius: 4px; }
    .summary-title { font-size: 13px; font-weight: 600; color: #1890ff; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
    .summary-cards { display: flex; gap: 16px; flex-wrap: wrap; }
    .summary-card { flex: 1; min-width: 280px; background: #fff; border-radius: 6px; padding: 12px 16px; border: 1px solid #e8e8e8; }
    .summary-card-title { font-size: 12px; font-weight: 600; color: #666; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
    .summary-card-values { display: flex; align-items: baseline; gap: 24px; }
    .summary-label { font-size: 11px; color: #999; }
    .summary-value { font-size: 16px; font-weight: 600; }
    .summary-value.actual { color: #1890ff; }
    .summary-value.budget { color: #d4b106; }
    .summary-variance { margin-left: auto; font-size: 14px; font-weight: 700; }
    .summary-variance.positive { color: #52c41a; }
    .summary-variance.negative { color: #ff4d4f; }
    
    .table-container {
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      overflow: auto;
      margin-bottom: 16px;
      max-height: 600px;
    }
    table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; table-layout: fixed; }
    
    thead th.legend-header {
      position: sticky; top: 0; z-index: 1002;
      background: #fff; padding: 12px 24px;
      border-bottom: 1px solid #e8e8e8; text-align: left;
    }
    thead tr.header-row { position: sticky; top: 49px; z-index: 1001; background: #fff; }
    thead th.column-header {
      background-color: #1677ff; color: #fff;
      padding: 8px; border: 1px solid #fff;
      text-align: center; white-space: normal; word-break: break-word; line-height: 1.3;
    }
    thead th.column-header.sticky-col {
      position: sticky; left: 0; z-index: 1003; background-color: #1677ff;
    }
    
    tbody td { padding: 8px; border: 1px solid #ddd; }
    tbody td:first-child {
      background-color: #fff; position: sticky; left: 0; z-index: 5;
      font-weight: 600; white-space: normal; word-break: break-word; line-height: 1.3;
    }
    tbody tr.actual-row { background-color: #e6f4ff; }
    tbody tr.actual-row td:nth-child(n+2) { background-color: #e6f4ff; text-align: right; font-weight: 500; padding: 6px 8px; }
    tbody tr.budget-row { background-color: #FFFFB8; }
    tbody tr.budget-row td { background-color: #FFFFB8 !important; padding: 2px; text-align: right; }
    tbody input {
      width: 100%; border: none; padding: 4px 6px;
      text-align: right; font-size: 12px; font-weight: 500;
      background-color: transparent !important; box-shadow: none;
    }
    tbody input:focus { outline: 2px solid #1677ff; background-color: #fff !important; }
    
    tfoot tr.actual-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #cce4ff; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.actual-total td:first-child { position: sticky; left: 0; z-index: 6; text-align: left; }
    tfoot tr.actual-total td:last-child { background-color: #b3d9ff; text-align: center; }
    
    tfoot tr.actual-amount-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #d4edda; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.actual-amount-total td:first-child { position: sticky; left: 0; z-index: 6; text-align: left; background-color: #d4edda; }
    tfoot tr.actual-amount-total td:last-child { background-color: #c3e6cb; text-align: center; }
    
    tfoot tr.actual-morm-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #ffe0b2; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.actual-morm-total td:first-child { position: sticky; left: 0; z-index: 6; text-align: left; background-color: #ffe0b2; }
    tfoot tr.actual-morm-total td:last-child { background-color: #ffb74d; text-align: center; }
    
    tfoot tr.budget-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #cce4ff; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.budget-total td:first-child { position: sticky; left: 0; z-index: 6; text-align: left; background-color: #cce4ff; }
    tfoot tr.budget-total td:last-child { background-color: #b3d9ff; text-align: center; }
    
    tfoot tr.budget-amount-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #d4edda; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.budget-amount-total td:first-child { position: sticky; left: 0; z-index: 6; text-align: left; background-color: #d4edda; }
    tfoot tr.budget-amount-total td:last-child { background-color: #c3e6cb; text-align: center; }
    
    tfoot tr.budget-morm-total td { padding: 6px 8px; border: 1px solid #ddd; background-color: #ffe0b2; text-align: right; font-weight: 700; font-size: 12px; }
    tfoot tr.budget-morm-total td:first-child { position: sticky; left: 0; z-index: 6; text-align: left; background-color: #ffe0b2; }
    tfoot tr.budget-morm-total td:last-child { background-color: #ffb74d; text-align: center; }
    
    .btn { background: #1677ff; color: #fff; border: none; padding: 6px 16px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 500; }
    .btn:hover { background: #4096ff; }
    .btn-success { background: #52c41a; }
    .btn-success:hover { background: #73d13d; }
    
    /* Product Group Chart Section */
    .product-group-chart-container {
      background: linear-gradient(135deg, #fff9e6 0%, #fffbf0 100%);
      border: 1px solid #ffc53d;
      border-radius: 8px;
      padding: 16px 20px;
      margin: 12px 0;
      box-shadow: 0 2px 6px rgba(212, 136, 6, 0.1);
      flex-shrink: 0;
    }
    .product-group-chart-title {
      font-size: 14px;
      font-weight: 600;
      color: #d48806;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1;
    }
    .product-group-chart-title svg {
      width: 18px;
      height: 18px;
      vertical-align: middle;
      flex-shrink: 0;
    }
    .product-group-chart-wrapper {
      background: #fff;
      border-radius: 6px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    .product-group-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      margin-top: 16px;
    }
    .product-group-table th {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      padding: 12px 14px;
      text-align: left;
      font-weight: 600;
      color: #fff;
      font-size: 13px;
      letter-spacing: 0.3px;
    }
    .product-group-table th:nth-child(2),
    .product-group-table th:nth-child(3),
    .product-group-table th:nth-child(4) {
      text-align: right;
    }
    .product-group-table td {
      padding: 12px 14px;
      border-bottom: 1px solid #e8e8e8;
      font-size: 13px;
    }
    .product-group-table td:first-child {
      font-weight: 600;
      color: #333;
    }
    .product-group-table td:nth-child(2),
    .product-group-table td:nth-child(3),
    .product-group-table td:nth-child(4) {
      text-align: right;
      font-weight: 500;
      font-family: 'Segoe UI', monospace;
    }
    .product-group-table tbody tr:hover {
      background-color: #f0f7ff;
    }
    .product-group-table tbody tr:nth-child(even) {
      background-color: #fafbfc;
    }
    .pg-variance-positive { color: #52c41a; font-weight: 600; }
    .pg-variance-negative { color: #ff4d4f; font-weight: 600; }
    .pg-variance-neutral { color: #666; font-weight: 500; }
    .pg-variance-new { color: #1890ff; font-weight: 600; background: #e6f7ff; padding: 2px 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Divisional Budget Planning - ${division}</h1>
    <div class="header-info">
      <div><strong>Division:</strong> ${division}</div>
      <div><strong>Actual Year:</strong> ${actualYear}</div>
      <div><strong>Budget Year:</strong> ${budgetYear}</div>
    </div>
  </div>

  <!-- Budget vs Actual Summary -->
  <div class="summary-container">
    <div class="summary-title">📊 Budget vs Actual Summary</div>
    <div class="summary-cards">
      <!-- Volume Card -->
      <div class="summary-card">
        <div class="summary-card-title">📦 Volume (MT)</div>
        <div class="summary-card-values">
          <div><span class="summary-label">Act: </span><span class="summary-value actual">${formatMT(actualVolumeTotal)}</span></div>
          <div><span class="summary-label">Bud: </span><span id="summaryBudgetVolume" class="summary-value budget">0.00</span></div>
          <span id="summaryVolumeVariance" class="summary-variance negative">0%</span>
        </div>
      </div>
      <!-- Amount Card -->
      <div class="summary-card">
        <div class="summary-card-title">Amount (${currencySymbolHtml})</div>
        <div class="summary-card-values">
          <div><span class="summary-label">Act: </span><span class="summary-value actual">${formatAed(actualAmountTotal)}</span></div>
          <div><span class="summary-label">Bud: </span><span id="summaryBudgetAmount" class="summary-value budget">0</span></div>
          <span id="summaryAmountVariance" class="summary-variance negative">0%</span>
        </div>
      </div>
      <!-- MoRM Card -->
      <div class="summary-card">
        <div class="summary-card-title">MoRM (${currencySymbolHtml})</div>
        <div class="summary-card-values">
          <div><span class="summary-label">Act: </span><span class="summary-value actual">${formatAed(actualMormTotal)}</span></div>
          <div><span class="summary-label">Bud: </span><span id="summaryBudgetMorm" class="summary-value budget">0</span></div>
          <span id="summaryMormVariance" class="summary-variance negative">0%</span>
        </div>
      </div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <colgroup>
        <col style="width: 20%;" />
        ${Array(12).fill('<col style="width: 5.7%;" />').join('')}
        <col style="width: 8%;" />
      </colgroup>
      <thead>
        <tr>
          <th colspan="14" class="legend-header">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 24px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 16px; height: 16px; background-color: #e6f4ff; border: 1px solid #99c8ff;"></span>
                  <span>Actual ${actualYear} Volume (MT)</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="display: inline-block; width: 16px; height: 16px; background-color: #FFFFB8; border: 1px solid #d4b106;"></span>
                  <span>Budget ${budgetYear} Volume (MT)</span>
                </div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button class="btn" id="saveDraftBtn">💾 Save Draft</button>
                <button class="btn btn-success" id="saveFinalBtn">✓ Save Final</button>
              </div>
            </div>
          </th>
        </tr>
        <tr class="header-row">
          <th rowspan="2" class="column-header sticky-col">Product Group</th>
          ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m => `<th class="column-header">${m}</th>`).join('')}
          <th class="column-header">Year Total</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        ${tableRowsHtml}
      </tbody>
      <tfoot>
        <tr class="actual-total">
          <td>Total Actual Volume (MT)</td>
          ${actualVolumeCells}
          <td>${formatMT(actualVolumeTotal)}</td>
        </tr>
        <tr class="actual-amount-total">
          <td>Total Actual Amount (${currencySymbolHtml})</td>
          ${actualAmountCells}
          <td>${formatAed(actualAmountTotal)}</td>
        </tr>
        <tr class="actual-morm-total">
          <td>Total Actual MoRM (${currencySymbolHtml})</td>
          ${actualMormCells}
          <td>${formatAed(actualMormTotal)}</td>
        </tr>
        <tr class="budget-total">
          <td>Total Budget Volume (MT)</td>
          ${Array(12).fill('<td>0.00</td>').join('')}
          <td id="budgetYearTotal">0.00</td>
        </tr>
        <tr class="budget-amount-total">
          <td>Total Budget Amount (${currencySymbolHtml})</td>
          ${Array(12).fill('<td>0</td>').join('')}
          <td id="budgetAmountYearTotal">0</td>
        </tr>
        <tr class="budget-morm-total">
          <td>Total Budget MoRM (${currencySymbolHtml})</td>
          ${Array(12).fill('<td>0</td>').join('')}
          <td id="budgetMormYearTotal">0</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Product Group Chart & Tables Section -->
  <div id="productGroupChartContainer" class="product-group-chart-container">
    <div class="product-group-chart-title">📊 Product Group Breakdown: Actual vs Budget (MT)</div>
    <div class="product-group-chart-wrapper">
      <canvas id="productGroupChart" style="max-height: 350px;"></canvas>
    </div>
    
    <!-- MT Table -->
    <table class="product-group-table" id="mtTable" style="margin-bottom: 24px;">
      <thead>
        <tr>
          <th>Product Group</th>
          <th>Actual (MT)</th>
          <th>Budget (MT)</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody id="mtTableBody">
        <!-- Populated by JavaScript -->
      </tbody>
      <tfoot>
        <tr style="background: #f0f0f0;">
          <td><strong>TOTAL</strong></td>
          <td id="mtTotalActual"><strong>0.00</strong></td>
          <td id="mtTotalBudget"><strong>0.00</strong></td>
          <td id="mtTotalVariance"><strong>0%</strong></td>
        </tr>
      </tfoot>
    </table>
    
    <!-- Amount Table -->
    <div class="product-group-chart-title" style="margin-top: 24px;">Amount Breakdown (${currencySymbolHtml})</div>
    <table class="product-group-table" id="amountTable">
      <thead>
        <tr>
          <th>Product Group</th>
          <th>Actual Amount</th>
          <th>Budget Amount</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody id="amountTableBody">
        <!-- Populated by JavaScript -->
      </tbody>
      <tfoot>
        <tr style="background: #f0f0f0;">
          <td><strong>TOTAL</strong></td>
          <td id="amtTotalActual"><strong>0</strong></td>
          <td id="amtTotalBudget"><strong>0</strong></td>
          <td id="amtTotalVariance"><strong>0%</strong></td>
        </tr>
      </tfoot>
    </table>
    
    <!-- MoRM Table -->
    <div class="product-group-chart-title" style="margin-top: 24px;">MoRM Breakdown (${currencySymbolHtml})</div>
    <table class="product-group-table" id="mormTable">
      <thead>
        <tr>
          <th>Product Group</th>
          <th>Actual MoRM</th>
          <th>Budget MoRM</th>
          <th>Variance</th>
        </tr>
      </thead>
      <tbody id="mormTableBody">
        <!-- Populated by JavaScript -->
      </tbody>
      <tfoot>
        <tr style="background: #f0f0f0;">
          <td><strong>TOTAL</strong></td>
          <td id="mormTotalActual"><strong>0</strong></td>
          <td id="mormTotalBudget"><strong>0</strong></td>
          <td id="mormTotalVariance"><strong>0%</strong></td>
        </tr>
      </tfoot>
    </table>
    
    <!-- Substrated MT Used or Required Table -->
    <div class="product-group-chart-title" style="margin-top: 24px; color: #1565c0;">📦 Substrated MT Used or Required</div>
    <table class="product-group-table" id="substrateTable" style="border: 2px solid #1976d2;">
      <thead>
        <tr style="background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);">
          <th style="color: #fff;">Substrate</th>
          <th style="color: #fff;">Budget MT</th>
        </tr>
      </thead>
      <tbody id="substrateTableBody">
        <tr><td>PE</td><td id="substratePE">0.00</td></tr>
        <tr><td>PP</td><td id="substratePP">0.00</td></tr>
        <tr><td>PET</td><td id="substratePET">0.00</td></tr>
        <tr><td>Alu</td><td id="substrateAlu">0.00</td></tr>
        <tr><td>Paper</td><td id="substratePaper">0.00</td></tr>
        <tr><td>PVC/PET</td><td id="substratePVCPET">0.00</td></tr>
        <tr><td>Mix</td><td id="substrateMix">0.00</td></tr>
      </tbody>
    </table>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
    // Form metadata
    const formData = {
      division: '${division}',
      actualYear: ${actualYear},
      budgetYear: ${budgetYear}
    };
    
    // Actual totals for variance calculation
    const actualVolumeTotal = ${actualVolumeTotal};
    const actualAmountTotal = ${actualAmountTotal};
    const actualMormTotal = ${actualMormTotal};
    
    // Product group actual data for chart/tables
    const productGroupActuals = ${JSON.stringify(productGroupActuals)};
    
    // Pricing data for Amount and MoRM calculations
    const pricingMap = ${JSON.stringify(pricingMapJs)};
    
    // Material percentages for substrate calculation
    const materialPercentagesMap = ${JSON.stringify(materialPercentages)};
    
    // Helper to find pricing (case-insensitive)
    function findPricing(productGroup) {
      if (!productGroup || !pricingMap) return { sellingPrice: 0, morm: 0 };
      const normalizedKey = productGroup.toLowerCase().trim();
      if (pricingMap[normalizedKey]) return pricingMap[normalizedKey];
      // Try partial match
      for (const key of Object.keys(pricingMap)) {
        if (key.includes(normalizedKey) || normalizedKey.includes(key)) {
          return pricingMap[key];
        }
      }
      return { sellingPrice: 0, morm: 0 };
    }
    
    function formatMT(value) {
      if (!value && value !== 0) return '0.00';
      const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
      if (isNaN(num)) return '0.00';
      return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    function formatAed(value) {
      if (!value || value === 0) return '0';
      if (value >= 1000000) return (value / 1000000).toFixed(2) + 'M';
      if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
      return Math.round(value).toLocaleString('en-US');
    }
    
    // Debounce utility
    function debounce(func, wait) {
      let timeout;
      return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
      };
    }
    
    const debouncedRecalculate = debounce(recalculateTotals, 250);
    
    function recalculateTotals() {
      const budgetTotals = Array(12).fill(0);
      const budgetAmountTotals = Array(12).fill(0);
      const mormTotals = Array(12).fill(0);
      const productGroupTotals = {};
      const groupMonthVals = {};
      
      // Services Charges totals
      let scBudgetTotal = 0;
      
      document.querySelectorAll('input[data-month]').forEach(input => {
        const month = parseInt(input.dataset.month);
        const productGroup = input.dataset.group;
        const metric = input.dataset.metric;
        const val = parseFloat(input.value.replace(/,/g, '')) || 0;
        
        if (month < 1 || month > 12) return;
        
        if (productGroup === 'Services Charges') {
          // Services Charges: value is in thousands, Amount = MoRM
          const scAmount = val * 1000;
          budgetAmountTotals[month - 1] += scAmount;
          mormTotals[month - 1] += scAmount;
          scBudgetTotal += val;
        } else {
          // Regular product group
          if (!groupMonthVals[productGroup]) groupMonthVals[productGroup] = Array(12).fill(0);
          groupMonthVals[productGroup][month - 1] = val;
          
          budgetTotals[month - 1] += val;
          productGroupTotals[productGroup] = (productGroupTotals[productGroup] || 0) + val;
          
          // Calculate Amount and MoRM (MT * 1000 * price)
          const pricing = findPricing(productGroup);
          budgetAmountTotals[month - 1] += val * 1000 * (pricing.sellingPrice || 0);
          mormTotals[month - 1] += val * 1000 * (pricing.morm || 0);
        }
      });
      
      // Update Budget Volume monthly cells
      const budgetTotalRow = document.querySelector('tfoot tr.budget-total');
      if (budgetTotalRow) {
        const cells = budgetTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { cell.textContent = formatMT(budgetTotals[idx]); });
      }
      
      // Update Budget Volume year total
      const budgetYearTotal = budgetTotals.reduce((sum, val) => sum + val, 0);
      const budgetYearTotalCell = document.getElementById('budgetYearTotal');
      if (budgetYearTotalCell) budgetYearTotalCell.textContent = formatMT(budgetYearTotal);
      
      // Update Budget Amount monthly cells
      const budgetAmountTotalRow = document.querySelector('tfoot tr.budget-amount-total');
      if (budgetAmountTotalRow) {
        const cells = budgetAmountTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { cell.textContent = formatAed(budgetAmountTotals[idx]); });
      }
      
      // Update Budget Amount year total
      const budgetAmountYearTotal = budgetAmountTotals.reduce((sum, val) => sum + val, 0);
      const budgetAmountYearTotalCell = document.getElementById('budgetAmountYearTotal');
      if (budgetAmountYearTotalCell) budgetAmountYearTotalCell.textContent = formatAed(budgetAmountYearTotal);
      
      // Update MoRM monthly cells
      const mormTotalRow = document.querySelector('tfoot tr.budget-morm-total');
      if (mormTotalRow) {
        const cells = mormTotalRow.querySelectorAll('td:not(:first-child):not(:last-child)');
        cells.forEach((cell, idx) => { cell.textContent = formatAed(mormTotals[idx]); });
      }
      
      // Update MoRM year total
      const mormYearTotal = mormTotals.reduce((sum, val) => sum + val, 0);
      const mormYearTotalCell = document.getElementById('budgetMormYearTotal');
      if (mormYearTotalCell) mormYearTotalCell.textContent = formatAed(mormYearTotal);
      
      // Update product group row year totals
      document.querySelectorAll('.product-budget-total').forEach(cell => {
        const productGroup = cell.dataset.group;
        const vals = groupMonthVals[productGroup] || [];
        const total = vals.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        cell.textContent = formatMT(total);
      });
      
      // Update Services Charges total
      const scTotalCell = document.querySelector('.sc-budget-total');
      if (scTotalCell) scTotalCell.textContent = formatAed(scBudgetTotal * 1000);
      
      // Calculate and update Substrated MT Used or Required
      const substrateTypes = ['PE', 'PP', 'PET', 'Alu', 'Paper', 'PVC/PET', 'Mix'];
      const substrateTotals = {};
      substrateTypes.forEach(s => substrateTotals[s] = 0);
      
      // Calculate substrate requirements for each product group
      Object.keys(productGroupTotals).forEach(pg => {
        const totalMT = productGroupTotals[pg] || 0;
        const pgKey = pg.toLowerCase().trim();
        const percentages = materialPercentagesMap[pgKey];
        if (percentages) {
          substrateTypes.forEach(subType => {
            const pct = percentages[subType] || 0;
            substrateTotals[subType] += (totalMT * pct) / 100;
          });
        }
      });
      
      // Update substrate table
      const substrateIds = { 'PE': 'substratePE', 'PP': 'substratePP', 'PET': 'substratePET', 
                            'Alu': 'substrateAlu', 'Paper': 'substratePaper', 
                            'PVC/PET': 'substratePVCPET', 'Mix': 'substrateMix' };
      Object.keys(substrateIds).forEach(subType => {
        const elem = document.getElementById(substrateIds[subType]);
        if (elem) elem.textContent = Math.round(substrateTotals[subType]).toLocaleString();
      });
      
      // Update Summary Cards
      const summaryBudgetVolume = document.getElementById('summaryBudgetVolume');
      if (summaryBudgetVolume) summaryBudgetVolume.textContent = formatMT(budgetYearTotal);
      
      const summaryVolumeVariance = document.getElementById('summaryVolumeVariance');
      if (summaryVolumeVariance) {
        const variance = actualVolumeTotal ? ((budgetYearTotal - actualVolumeTotal) / Math.abs(actualVolumeTotal) * 100).toFixed(0) : 0;
        summaryVolumeVariance.textContent = variance + '%';
        summaryVolumeVariance.className = 'summary-variance ' + (parseFloat(variance) >= 0 ? 'positive' : 'negative');
      }
      
      const summaryBudgetAmount = document.getElementById('summaryBudgetAmount');
      if (summaryBudgetAmount) summaryBudgetAmount.textContent = formatAed(budgetAmountYearTotal);
      
      const summaryAmountVariance = document.getElementById('summaryAmountVariance');
      if (summaryAmountVariance) {
        const variance = actualAmountTotal ? ((budgetAmountYearTotal - actualAmountTotal) / Math.abs(actualAmountTotal) * 100).toFixed(0) : 0;
        summaryAmountVariance.textContent = variance + '%';
        summaryAmountVariance.className = 'summary-variance ' + (parseFloat(variance) >= 0 ? 'positive' : 'negative');
      }
      
      const summaryBudgetMorm = document.getElementById('summaryBudgetMorm');
      if (summaryBudgetMorm) summaryBudgetMorm.textContent = formatAed(mormYearTotal);
      
      const summaryMormVariance = document.getElementById('summaryMormVariance');
      if (summaryMormVariance) {
        const variance = actualMormTotal ? ((mormYearTotal - actualMormTotal) / Math.abs(actualMormTotal) * 100).toFixed(0) : 0;
        summaryMormVariance.textContent = variance + '%';
        summaryMormVariance.className = 'summary-variance ' + (parseFloat(variance) >= 0 ? 'positive' : 'negative');
      }
      
      // Update product group chart and tables
      updateProductGroupChart(groupMonthVals, budgetAmountTotals, mormTotals, scBudgetTotal);
    }
    
    // Product Group Chart Instance
    let productGroupChartInstance = null;
    
    function updateProductGroupChart(groupMonthVals, budgetAmountTotals, budgetMormTotals, scBudgetTotal) {
      // Calculate budget totals per product group
      const productGroupBudgets = {};
      
      // Sum budget MT per product group
      Object.keys(groupMonthVals || {}).forEach(pg => {
        const vals = groupMonthVals[pg] || [];
        const totalMT = vals.reduce((sum, v) => sum + (parseFloat(v) || 0), 0);
        productGroupBudgets[pg] = { mt: totalMT, amount: 0, morm: 0 };
        
        // Calculate Amount and MoRM
        const pricing = findPricing(pg);
        productGroupBudgets[pg].amount = totalMT * 1000 * (pricing.sellingPrice || 0);
        productGroupBudgets[pg].morm = totalMT * 1000 * (pricing.morm || 0);
      });
      
      // Add Services Charges budget (Amount = MoRM, value is in thousands)
      if (scBudgetTotal > 0) {
        const scBudgetAmount = scBudgetTotal * 1000;
        productGroupBudgets['Services Charges'] = {
          mt: 0,
          amount: scBudgetAmount,
          morm: scBudgetAmount
        };
      }
      
      // Merge with actual data to get all product groups
      const allProductGroups = new Set([
        ...Object.keys(productGroupActuals),
        ...Object.keys(productGroupBudgets)
      ]);
      
      // Filter to only product groups with data (not Services Charges)
      const filteredGroups = Array.from(allProductGroups)
        .filter(pg => pg !== 'Services Charges')
        .filter(pg => {
          const actual = productGroupActuals[pg] || { mt: 0, amount: 0, morm: 0 };
          const budget = productGroupBudgets[pg] || { mt: 0, amount: 0, morm: 0 };
          return actual.mt > 0 || budget.mt > 0;
        })
        .sort((a, b) => {
          const totalA = (productGroupActuals[a]?.mt || 0) + (productGroupBudgets[a]?.mt || 0);
          const totalB = (productGroupActuals[b]?.mt || 0) + (productGroupBudgets[b]?.mt || 0);
          return totalB - totalA;
        });
      
      const hasData = filteredGroups.length > 0;
      const container = document.getElementById('productGroupChartContainer');
      
      // Always show if we have actual data (which we always do in divisional)
      if (container) container.style.display = 'block';
      
      if (!hasData) return;
      
      // Prepare chart data - split labels for better display
      const labels = filteredGroups.map(pg => {
        // Split names like "Shrink Film Printed" into ["Shrink Film", "Printed"]
        const words = pg.split(' ');
        if (words.length >= 3) {
          // Find common suffixes to split on
          const lastWord = words[words.length - 1];
          if (['Printed', 'Plain', 'Label'].includes(lastWord)) {
            return [words.slice(0, -1).join(' '), lastWord];
          }
        }
        if (words.length === 2) {
          return [words[0], words[1]];
        }
        return pg;
      });
      const actualMTData = filteredGroups.map(pg => (productGroupActuals[pg]?.mt || 0).toFixed(2));
      const budgetMTData = filteredGroups.map(pg => (productGroupBudgets[pg]?.mt || 0).toFixed(2));
      
      // Helper for variance display
      function getVariance(actual, budget) {
        if (actual === 0 && budget > 0) return { text: 'NEW', class: 'pg-variance-new' };
        if (actual === 0) return { text: '0.0%', class: 'pg-variance-neutral' };
        const variance = ((budget - actual) / actual) * 100;
        const text = (variance > 0 ? '+' : '') + variance.toFixed(1) + '%';
        const cls = variance > 5 ? 'pg-variance-positive' : variance < -5 ? 'pg-variance-negative' : 'pg-variance-neutral';
        return { text, class: cls };
      }
      
      // Update MT Table
      const mtTableBody = document.getElementById('mtTableBody');
      if (mtTableBody) {
        let mtTotalActual = 0, mtTotalBudget = 0;
        mtTableBody.innerHTML = filteredGroups.map(pg => {
          const actual = productGroupActuals[pg]?.mt || 0;
          const budget = productGroupBudgets[pg]?.mt || 0;
          mtTotalActual += actual;
          mtTotalBudget += budget;
          const v = getVariance(actual, budget);
          return '<tr><td>' + pg + '</td><td>' + actual.toFixed(2) + '</td><td>' + budget.toFixed(2) + '</td><td><span class="' + v.class + '">' + v.text + '</span></td></tr>';
        }).join('');
        
        document.getElementById('mtTotalActual').innerHTML = '<strong>' + mtTotalActual.toFixed(2) + '</strong>';
        document.getElementById('mtTotalBudget').innerHTML = '<strong>' + mtTotalBudget.toFixed(2) + '</strong>';
        const mtV = getVariance(mtTotalActual, mtTotalBudget);
        document.getElementById('mtTotalVariance').innerHTML = '<strong><span class="' + mtV.class + '">' + mtV.text + '</span></strong>';
      }
      
      // Update Amount Table
      const amountTableBody = document.getElementById('amountTableBody');
      if (amountTableBody) {
        let amtTotalActual = 0, amtTotalBudget = 0;
        let amtRows = filteredGroups.map(pg => {
          const actual = productGroupActuals[pg]?.amount || 0;
          const budget = productGroupBudgets[pg]?.amount || 0;
          amtTotalActual += actual;
          amtTotalBudget += budget;
          const v = getVariance(actual, budget);
          return '<tr><td>' + pg + '</td><td>' + formatAed(actual) + '</td><td>' + formatAed(budget) + '</td><td><span class="' + v.class + '">' + v.text + '</span></td></tr>';
        }).join('');
        
        // Add Services Charges row (Amount = MoRM for Services Charges)
        const scActualAmt = productGroupActuals['Services Charges']?.amount || 0;
        const scBudgetAmt = productGroupBudgets['Services Charges']?.amount || 0;
        if (scActualAmt > 0 || scBudgetAmt > 0) {
          amtTotalActual += scActualAmt;
          amtTotalBudget += scBudgetAmt;
          const scV = getVariance(scActualAmt, scBudgetAmt);
          amtRows += '<tr style="background: #f0f5ff; font-style: italic;"><td>Services Charges</td><td>' + formatAed(scActualAmt) + '</td><td>' + formatAed(scBudgetAmt) + '</td><td><span class="' + scV.class + '">' + scV.text + '</span></td></tr>';
        }
        
        amountTableBody.innerHTML = amtRows;
        
        document.getElementById('amtTotalActual').innerHTML = '<strong>' + formatAed(amtTotalActual) + '</strong>';
        document.getElementById('amtTotalBudget').innerHTML = '<strong>' + formatAed(amtTotalBudget) + '</strong>';
        const amtV = getVariance(amtTotalActual, amtTotalBudget);
        document.getElementById('amtTotalVariance').innerHTML = '<strong><span class="' + amtV.class + '">' + amtV.text + '</span></strong>';
      }
      
      // Update MoRM Table
      const mormTableBody = document.getElementById('mormTableBody');
      if (mormTableBody) {
        let mormTotalActual = 0, mormTotalBudgetSum = 0;
        let mormRows = filteredGroups.map(pg => {
          const actual = productGroupActuals[pg]?.morm || 0;
          const budget = productGroupBudgets[pg]?.morm || 0;
          mormTotalActual += actual;
          mormTotalBudgetSum += budget;
          const v = getVariance(actual, budget);
          return '<tr><td>' + pg + '</td><td>' + formatAed(actual) + '</td><td>' + formatAed(budget) + '</td><td><span class="' + v.class + '">' + v.text + '</span></td></tr>';
        }).join('');
        
        // Add Services Charges row (Amount = MoRM for Services Charges)
        const scActualMorm = productGroupActuals['Services Charges']?.morm || 0;
        const scBudgetMorm = productGroupBudgets['Services Charges']?.morm || 0;
        if (scActualMorm > 0 || scBudgetMorm > 0) {
          mormTotalActual += scActualMorm;
          mormTotalBudgetSum += scBudgetMorm;
          const scV = getVariance(scActualMorm, scBudgetMorm);
          mormRows += '<tr style="background: #f0f5ff; font-style: italic;"><td>Services Charges</td><td>' + formatAed(scActualMorm) + '</td><td>' + formatAed(scBudgetMorm) + '</td><td><span class="' + scV.class + '">' + scV.text + '</span></td></tr>';
        }
        
        mormTableBody.innerHTML = mormRows;
        
        document.getElementById('mormTotalActual').innerHTML = '<strong>' + formatAed(mormTotalActual) + '</strong>';
        document.getElementById('mormTotalBudget').innerHTML = '<strong>' + formatAed(mormTotalBudgetSum) + '</strong>';
        const mormV = getVariance(mormTotalActual, mormTotalBudgetSum);
        document.getElementById('mormTotalVariance').innerHTML = '<strong><span class="' + mormV.class + '">' + mormV.text + '</span></strong>';
      }
      
      // Update or create Chart.js bar chart
      const ctx = document.getElementById('productGroupChart');
      if (!ctx) return;
      
      if (productGroupChartInstance) {
        productGroupChartInstance.data.labels = labels;
        productGroupChartInstance.data.datasets[0].data = actualMTData;
        productGroupChartInstance.data.datasets[1].data = budgetMTData;
        productGroupChartInstance.update();
      } else {
        productGroupChartInstance = new Chart(ctx.getContext('2d'), {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [
              {
                label: 'Actual ' + formData.actualYear + ' (MT)',
                data: actualMTData,
                backgroundColor: 'rgba(24, 144, 255, 0.7)',
                borderColor: 'rgba(24, 144, 255, 1)',
                borderWidth: 1
              },
              {
                label: 'Budget ' + formData.budgetYear + ' (MT)',
                data: budgetMTData,
                backgroundColor: 'rgba(255, 235, 59, 0.7)',
                borderColor: 'rgba(212, 136, 6, 1)',
                borderWidth: 1
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return context.dataset.label + ': ' + parseFloat(context.parsed.y).toFixed(2) + ' MT';
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: {
                  maxRotation: 0,
                  minRotation: 0,
                  font: { size: 11 },
                  autoSkip: false
                }
              },
              y: {
                beginAtZero: true,
                ticks: {
                  callback: function(value) { return value.toFixed(0) + ' MT'; }
                }
              }
            }
          }
        });
      }
    }
    
    // Clone document preserving input values
    function cloneWorkingDocument() {
      const htmlClone = document.documentElement.cloneNode(true);
      const liveInputs = document.querySelectorAll('input');
      const clonedInputs = htmlClone.querySelectorAll('input');
      clonedInputs.forEach((input, idx) => {
        if (liveInputs[idx]) input.setAttribute('value', liveInputs[idx].value || '');
      });
      const tempDoc = document.implementation.createHTMLDocument(document.title);
      const importedHtml = tempDoc.importNode(htmlClone, true);
      tempDoc.replaceChild(importedHtml, tempDoc.documentElement);
      return tempDoc;
    }
    
    // Event delegation for inputs
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
      tableContainer.addEventListener('input', function(e) {
        if (e.target.matches('input[data-month]')) {
          e.target.value = e.target.value.replace(/[^0-9.,]/g, '');
          debouncedRecalculate();
        }
      });
      
      tableContainer.addEventListener('blur', function(e) {
        if (e.target.matches('input[data-month]')) {
          const val = e.target.value;
          if (val && e.target.dataset.group !== 'Services Charges') {
            e.target.value = formatMT(val);
          }
          recalculateTotals();
        }
      }, true);
    }
    
    // Save Draft Button
    document.getElementById('saveDraftBtn').addEventListener('click', function() {
      recalculateTotals();
      const clonedDoc = cloneWorkingDocument();
      
      // Ensure inputs are enabled
      clonedDoc.querySelectorAll('input').forEach(input => input.removeAttribute('disabled'));
      
      const draftMetadata = {
        isDraft: true,
        division: formData.division,
        actualYear: formData.actualYear,
        budgetYear: formData.budgetYear,
        savedAt: new Date().toISOString()
      };
      
      const existingScript = clonedDoc.getElementById('draftMetadata');
      if (existingScript) existingScript.remove();
      
      const draftScript = clonedDoc.createElement('script');
      draftScript.id = 'draftMetadata';
      draftScript.textContent = 'var draftMetadata = ' + JSON.stringify(draftMetadata, null, 2) + ';';
      clonedDoc.body.appendChild(draftScript);
      
      const htmlContent = '<!DOCTYPE html>\\n<!-- IPD_BUDGET_SYSTEM_v1.0 :: TYPE=DIVISIONAL_BUDGET :: DO_NOT_EDIT_THIS_LINE -->\\n' + clonedDoc.documentElement.outerHTML;
      
      const now = new Date();
      const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
      const filename = 'DRAFT_Divisional_' + formData.division + '_' + formData.budgetYear + '_' + dateStr + '_' + timeStr + '.html';
      
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      alert('✅ Draft saved!\\n\\nYou can open this file later to continue editing.\\n\\nFilename: ' + filename + '\\n\\n💡 This is a DRAFT file - it cannot be uploaded to the system.\\nUse "Save Final" when ready to submit.');
    });
    
    // Save Final Button
    document.getElementById('saveFinalBtn').addEventListener('click', function() {
      const budgetInputs = document.querySelectorAll('input[data-month]');
      const hasData = Array.from(budgetInputs).some(input => {
        const val = input.value.replace(/,/g, '');
        return val && parseFloat(val) > 0;
      });
      
      if (!hasData) {
        alert('⚠️ No budget data entered!\\n\\nPlease enter at least one budget value before saving final version.');
        return;
      }
      
      if (!confirm('📋 Finalize Divisional Budget?\\n\\nThis will create a final version that:\\n• Cannot be edited\\n• Can be uploaded to the system\\n\\nDo you want to proceed?')) {
        return;
      }
      
      recalculateTotals();
      
      // Convert chart canvas to static image BEFORE cloning (uses live chart)
      let chartImageUrl = null;
      const originalCanvas = document.getElementById('productGroupChart');
      if (originalCanvas) {
        try {
          chartImageUrl = originalCanvas.toDataURL('image/png');
        } catch (e) {
          console.warn('Could not convert chart to image:', e);
        }
      }
      
      const clonedDoc = cloneWorkingDocument();
      
      // Convert inputs to static text
      clonedDoc.querySelectorAll('input[data-month]').forEach(input => {
        const value = input.value || '0';
        
        // For Services Charges, the structure is: td > div > input + span
        // For regular inputs, the structure is: td > input
        if (input.dataset.group === 'Services Charges') {
          // Services Charges: parent is div, grandparent is td
          const parentDiv = input.parentElement;
          const td = parentDiv.parentElement;
          td.innerHTML = '<span style="font-weight: 500;">' + value + '</span> <span style="font-size: 10px; color: #666;">k</span>';
          td.style.textAlign = 'right';
          td.style.fontWeight = '500';
          td.style.padding = '6px 8px';
        } else {
          // Regular product groups: parent is td
          const td = input.parentElement;
          td.innerHTML = value;
          td.style.textAlign = 'right';
          td.style.fontWeight = '500';
          td.style.padding = '6px 8px';
        }
      });
      
      // Replace chart canvas with static image
      const clonedCanvas = clonedDoc.getElementById('productGroupChart');
      if (chartImageUrl && clonedCanvas) {
        const img = clonedDoc.createElement('img');
        img.src = chartImageUrl;
        img.style.maxHeight = '350px';
        img.style.width = '100%';
        img.alt = 'Product Group Breakdown Chart';
        clonedCanvas.parentNode.replaceChild(img, clonedCanvas);
      }
      
      // Remove buttons
      const saveDraftBtn = clonedDoc.getElementById('saveDraftBtn');
      if (saveDraftBtn) saveDraftBtn.remove();
      const saveFinalBtn = clonedDoc.getElementById('saveFinalBtn');
      if (saveFinalBtn) saveFinalBtn.remove();
      
      // Remove scripts except budget data
      clonedDoc.querySelectorAll('script').forEach(script => {
        if (!script.id || script.id !== 'savedBudgetData') script.remove();
      });
      
      // Build budget data for import
      const budgetData = [];
      const servicesChargesData = [];
      
      document.querySelectorAll('input[data-month]').forEach(input => {
        const val = input.value.replace(/,/g, '');
        if (val && parseFloat(val) > 0) {
          if (input.dataset.group === 'Services Charges') {
            servicesChargesData.push({
              productGroup: 'Services Charges',
              month: parseInt(input.dataset.month),
              metric: 'AMOUNT',
              value: parseFloat(val) * 1000
            });
          } else {
            budgetData.push({
              productGroup: input.dataset.group,
              month: parseInt(input.dataset.month),
              value: parseFloat(val) * 1000
            });
          }
        }
      });
      
      const metadata = {
        division: formData.division,
        actualYear: formData.actualYear,
        budgetYear: formData.budgetYear,
        savedAt: new Date().toISOString(),
        dataFormat: 'divisional_budget_import'
      };
      
      const savedDataScript = clonedDoc.createElement('script');
      savedDataScript.id = 'savedBudgetData';
      savedDataScript.textContent = 
        '/* DIVISIONAL BUDGET DATA FOR DATABASE IMPORT */\\n' +
        'const budgetMetadata = ' + JSON.stringify(metadata, null, 2) + ';\\n' +
        'const savedBudget = ' + JSON.stringify(budgetData, null, 2) + ';\\n' +
        'const savedServicesCharges = ' + JSON.stringify(servicesChargesData, null, 2) + ';';
      clonedDoc.body.appendChild(savedDataScript);
      
      const htmlContent = '<!DOCTYPE html>\\n<!-- IPD_BUDGET_SYSTEM_v1.0 :: TYPE=DIVISIONAL_BUDGET :: DO_NOT_EDIT_THIS_LINE -->\\n' + clonedDoc.documentElement.outerHTML;
      
      const now = new Date();
      const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
      const timeStr = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
      const filename = 'FINAL_Divisional_' + formData.division + '_' + formData.budgetYear + '_' + dateStr + '_' + timeStr + '.html';
      
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      
      alert('✅ Final divisional budget saved!\\n\\nFilename: ' + filename + '\\n\\nThis file is ready for upload to the system.');
    });
    
    // Initial calculation
    recalculateTotals();
  </script>
</body>
</html>`;
}

module.exports = { generateDivisionalBudgetHtml };
