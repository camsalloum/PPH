/**
 * @fileoverview Bulk Import HTML Export Generator
 * @description Generates merged HTML form for bulk imported sales rep budgets
 * Uses identical format/styling as Sales Rep HTML Export for consistency
 */

const { generateStyles, UAE_DIRHAM_SVG, toProperCase } = require('./salesRepHtmlExport');

/**
 * Format MT value (convert KG to MT by dividing by 1000)
 */
const formatMT = (val) => {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0.00';
  const num = parseFloat(String(val).replace(/,/g, '')) / 1000; // Convert KG to MT
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
 * Generate merged bulk import HTML export
 * @param {object} params - Export parameters
 * @returns {string} Complete HTML document
 */
function generateMergedBulkHtml(params) {
  const {
    division,
    budgetYear,
    actualYear,
    salesReps = [],
    tableData = [],
    pricingMap = {},
    productGroups = [],
    batchId
  } = params;
  
  const divisionUpper = (division || 'FP').toUpperCase();
  const currencySymbolHtml = UAE_DIRHAM_SVG;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  // Group data by customer/country/productGroup for display
  const groupedByCustomer = {};
  tableData.forEach(row => {
    const key = `${row.customer}|||${row.country}|||${row.productGroup}`;
    if (!groupedByCustomer[key]) {
      groupedByCustomer[key] = {
        customer: row.customer,
        country: row.country,
        productGroup: row.productGroup,
        salesRep: row.salesRep,
        months: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 }
      };
    }
    // Aggregate monthly values (these are in KG)
    for (let m = 1; m <= 12; m++) {
      groupedByCustomer[key].months[m] += row.months[m] || 0;
    }
  });
  
  const aggregatedData = Object.values(groupedByCustomer);
  
  // Calculate totals (in KG, will display as MT)
  const monthlyTotalsKG = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
  const monthlyTotalsAmount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
  const monthlyTotalsMoRM = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
  let grandTotalKG = 0;
  let grandTotalAmount = 0;
  let grandTotalMoRM = 0;
  
  // Calculate product group totals
  const productGroupTotals = {};
  
  // Calculate customer totals  
  const customerTotals = {};
  
  // Calculate sales rep totals
  const salesRepTotals = {};
  
  aggregatedData.forEach(row => {
    let rowTotalKG = 0;
    const pricing = pricingMap[(row.productGroup || '').toLowerCase()] || { sellingPrice: 0, morm: 0 };
    
    for (let m = 1; m <= 12; m++) {
      const val = row.months[m] || 0;
      monthlyTotalsKG[m] += val;
      monthlyTotalsAmount[m] += val * pricing.sellingPrice;
      monthlyTotalsMoRM[m] += val * pricing.morm;
      rowTotalKG += val;
    }
    grandTotalKG += rowTotalKG;
    
    const rowAmount = rowTotalKG * pricing.sellingPrice;
    const rowMoRM = rowTotalKG * pricing.morm;
    grandTotalAmount += rowAmount;
    grandTotalMoRM += rowMoRM;
    
    // Product group totals
    const pg = row.productGroup || 'Unknown';
    if (!productGroupTotals[pg]) {
      productGroupTotals[pg] = { totalKG: 0, totalAmount: 0, totalMoRM: 0 };
    }
    productGroupTotals[pg].totalKG += rowTotalKG;
    productGroupTotals[pg].totalAmount += rowAmount;
    productGroupTotals[pg].totalMoRM += rowMoRM;
    
    // Customer totals
    const cust = row.customer || 'Unknown';
    if (!customerTotals[cust]) {
      customerTotals[cust] = { totalKG: 0, totalAmount: 0 };
    }
    customerTotals[cust].totalKG += rowTotalKG;
    customerTotals[cust].totalAmount += rowAmount;
    
    // Sales rep totals
    const rep = row.salesRep || 'Unknown';
    if (!salesRepTotals[rep]) {
      salesRepTotals[rep] = { totalKG: 0, totalAmount: 0, recordCount: 0 };
    }
    salesRepTotals[rep].totalKG += rowTotalKG;
    salesRepTotals[rep].totalAmount += rowAmount;
    salesRepTotals[rep].recordCount += 1;
  });
  
  // Generate table rows HTML - group by customer like Sales Rep export
  let tableRowsHtml = '';
  const sortedData = [...aggregatedData].sort((a, b) => {
    if (a.customer < b.customer) return -1;
    if (a.customer > b.customer) return 1;
    if (a.productGroup < b.productGroup) return -1;
    if (a.productGroup > b.productGroup) return 1;
    return 0;
  });
  
  sortedData.forEach((row, idx) => {
    let rowTotalKG = 0;
    for (let m = 1; m <= 12; m++) {
      rowTotalKG += row.months[m] || 0;
    }
    
    tableRowsHtml += `
        <tr class="budget-row" data-row-index="${idx}" data-sales-rep="${row.salesRep || ''}">
          <td style="background: #FFFFB8; position: sticky; left: 0; z-index: 5; font-weight: 600; text-align: left;">${toProperCase(row.customer)}</td>
          <td style="text-align: center;">${row.country || ''}</td>
          <td style="text-align: center;">${row.productGroup || ''}</td>
          ${months.map((_, i) => {
            const val = row.months[i + 1] || 0;
            return `<td style="text-align: right; padding: 6px 8px;">${formatMT(val)}</td>`;
          }).join('\n          ')}
          <td style="text-align: center; font-weight: 700; background-color: #FFEB3B;">${formatMT(rowTotalKG)}</td>
        </tr>`;
  });
  
  // Generate budget totals row
  const budgetTotalsHtml = `
        <tr class="budget-total">
          <td style="background-color: #FFFFB8; position: sticky; left: 0; z-index: 6;"><strong>Total Budget ${budgetYear} (MT)</strong></td>
          <td colspan="2"></td>
          ${months.map((_, i) => `<td style="text-align: right;">${formatMT(monthlyTotalsKG[i + 1])}</td>`).join('\n          ')}
          <td style="text-align: center; background-color: #FFEB3B;"><strong>${formatMT(grandTotalKG)}</strong></td>
        </tr>
        <tr class="budget-amount-total">
          <td style="background-color: #d4edda; position: sticky; left: 0; z-index: 6;"><strong>Total Budget Amount (${currencySymbolHtml})</strong></td>
          <td colspan="2"></td>
          ${months.map((_, i) => `<td style="text-align: right; background-color: #d4edda;">${formatAmount(monthlyTotalsAmount[i + 1])}</td>`).join('\n          ')}
          <td style="text-align: center; background-color: #c3e6cb;"><strong>${formatAmount(grandTotalAmount)}</strong></td>
        </tr>
        <tr class="budget-morm-total">
          <td style="background-color: #ffe0b2; position: sticky; left: 0; z-index: 6;"><strong>Total Budget MoRM (${currencySymbolHtml})</strong></td>
          <td colspan="2"></td>
          ${months.map((_, i) => `<td style="text-align: right; background-color: #ffe0b2;">${formatAmount(monthlyTotalsMoRM[i + 1])}</td>`).join('\n          ')}
          <td style="text-align: center; background-color: #ffcc80;"><strong>${formatAmount(grandTotalMoRM)}</strong></td>
        </tr>`;
  
  // Product group data for chart and table
  const pgData = Object.entries(productGroupTotals).map(([pg, data]) => ({
    name: pg,
    totalMT: data.totalKG / 1000,
    totalAmount: data.totalAmount,
    totalMoRM: data.totalMoRM
  })).sort((a, b) => b.totalMT - a.totalMT);
  
  // Customer data for table
  const custData = Object.entries(customerTotals).map(([cust, data]) => ({
    name: cust,
    totalMT: data.totalKG / 1000,
    totalAmount: data.totalAmount
  })).sort((a, b) => b.totalMT - a.totalMT);
  
  // Sales rep data for recap
  const repData = Object.entries(salesRepTotals).map(([rep, data]) => ({
    name: rep,
    totalMT: data.totalKG / 1000,
    totalAmount: data.totalAmount,
    recordCount: data.recordCount
  })).sort((a, b) => b.totalMT - a.totalMT);
  
  // Generate product group table rows
  const pgTableRows = pgData.map(pg => `
          <tr>
            <td>${pg.name}</td>
            <td>${pg.totalMT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${formatAmount(pg.totalAmount)}</td>
            <td>${formatAmount(pg.totalMoRM)}</td>
          </tr>`).join('');
  
  // Generate customer table rows
  const custTableRows = custData.map(c => `
          <tr>
            <td>${toProperCase(c.name)}</td>
            <td>${c.totalMT.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
            <td>${formatAmount(c.totalAmount)}</td>
          </tr>`).join('');
  
  // Generate sales rep data for filtering
  const repDataJson = JSON.stringify(repData);

  const html = `<!DOCTYPE html>
<!-- IPD_BUDGET_SYSTEM_v1.1 :: TYPE=MERGED_BULK_BUDGET :: DO_NOT_EDIT_THIS_LINE -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Merged Budget - ${divisionUpper} - ${budgetYear}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <style>
${generateStyles()}
    .filter-bar {
      margin-bottom: 20px;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      box-shadow: 0 8px 20px rgba(102, 126, 234, 0.3);
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .filter-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .filter-group label {
      font-weight: 700;
      font-size: 12px;
      color: white;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-shadow: 1px 1px 2px rgba(0,0,0,0.2);
    }
    .filter-group select {
      padding: 10px 14px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      background: white;
      color: #333;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }
    .filter-group select:hover {
      border-color: rgba(255, 255, 255, 0.8);
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transform: translateY(-1px);
    }
    .filter-group select:focus {
      outline: none;
      border-color: #52c41a;
      box-shadow: 0 0 0 3px rgba(82, 196, 26, 0.2);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <h1>📦 Total Budget</h1>
    </div>
    <div class="header-bottom">
      <div class="header-info">
        <div><strong>Division:</strong> ${divisionUpper}</div>
        <div><strong>Budget Year:</strong> ${budgetYear}</div>
        <div><strong>Sales Reps:</strong> ${salesReps.length}</div>
      </div>
    </div>
  </div>

  <div id="recapContainer" class="recap-container">
    <div class="recap-title">📊 Budget Summary</div>
    <div class="recap-stats" style="grid-template-columns: repeat(3, 1fr);">
      <div class="recap-stat">
        <div class="recap-stat-header">📦 Total Volume</div>
        <div class="recap-row">
          <div class="recap-item">
            <span class="recap-item-value budget" id="recapTotalMT">${(grandTotalKG / 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })} MT</span>
          </div>
        </div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-header">${currencySymbolHtml} Total Amount</div>
        <div class="recap-row">
          <div class="recap-item">
            <span class="recap-item-value" style="color: #52c41a;" id="recapTotalAmount">${formatAmount(grandTotalAmount)}</span>
          </div>
        </div>
      </div>
      <div class="recap-stat">
        <div class="recap-stat-header">${currencySymbolHtml} Total MoRM</div>
        <div class="recap-row">
          <div class="recap-item">
            <span class="recap-item-value" style="color: #fa8c16;" id="recapTotalMoRM">${formatAmount(grandTotalMoRM)}</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="filter-bar">
    <div class="filter-group">
      <label>👤 Sales Rep</label>
      <select id="salesRepFilter">
        <option value="">All Sales Reps (${salesReps.length})</option>
        ${salesReps.map(rep => `<option value="${rep}">${toProperCase(rep)}</option>`).join('\n        ')}
      </select>
    </div>
    <div class="filter-group">
      <label>🏢 Customer</label>
      <select id="customerFilter">
        <option value="">All Customers (${[...new Set(aggregatedData.map(r => r.customer))].length})</option>
        ${[...new Set(aggregatedData.map(r => r.customer))].sort().map(cust => `<option value="${cust}">${toProperCase(cust)}</option>`).join('\n        ')}
      </select>
    </div>
    <div class="filter-group">
      <label>🌍 Country</label>
      <select id="countryFilter">
        <option value="">All Countries (${[...new Set(aggregatedData.map(r => r.country))].length})</option>
        ${[...new Set(aggregatedData.map(r => r.country))].sort().map(country => `<option value="${country}">${country}</option>`).join('\n        ')}
      </select>
    </div>
    <div class="filter-group">
      <label>📦 Product Group</label>
      <select id="productGroupFilter">
        <option value="">All Product Groups (${[...new Set(aggregatedData.map(r => r.productGroup))].length})</option>
        ${[...new Set(aggregatedData.map(r => r.productGroup))].sort().map(pg => `<option value="${pg}">${pg}</option>`).join('\n        ')}
      </select>
    </div>
  </div>

  <div class="table-container">
    <table>
      <colgroup>
        <col style="width: 18%;">
        <col style="width: 10%;">
        <col style="width: 12%;">
        ${months.map(() => '<col style="width: 5%;">').join('')}
        <col style="width: 8%;">
      </colgroup>
      <thead>
        <tr class="header-row">
          <th class="column-header sticky-col">Customer Name</th>
          <th class="column-header">Country</th>
          <th class="column-header">Product Group</th>
          ${months.map((m, i) => `<th class="column-header">${i + 1}</th>`).join('\n          ')}
          <th class="column-header" style="background-color: #0958d9; font-weight: 700;">Total</th>
        </tr>
      </thead>
      <tbody id="tableBody">
${tableRowsHtml}
      </tbody>
      <tfoot>
${budgetTotalsHtml}
      </tfoot>
    </table>
  </div>

  <!-- Sales Rep Distribution Chart -->
  <div class="product-group-chart-container" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);">
    <div style="display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
      <div style="font-size: 28px; font-weight: 700; color: white; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 36px;">👥</span>
        <span>Sales Rep Budget Distribution</span>
      </div>
    </div>
    <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 5px 15px rgba(0,0,0,0.1);">
      <div style="position: relative; height: 450px; display: flex; justify-content: center; align-items: center;">
        <canvas id="salesRepPieChart"></canvas>
      </div>
      <div id="salesRepLegend" style="margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; padding: 16px; background: #f8f9fa; border-radius: 8px;"></div>
    </div>
  </div>

  <div id="productGroupChartContainer" class="product-group-chart-container">
    <div class="product-group-chart-title">📊 Product Group Breakdown (MT)</div>
    <div class="product-group-chart-wrapper">
      <canvas id="productGroupChart" style="max-height: 400px;"></canvas>
    </div>
    <table class="product-group-table" id="productGroupTable">
      <thead>
        <tr>
          <th>Product Group</th>
          <th>Budget (MT)</th>
          <th>Amount (${currencySymbolHtml})</th>
          <th>MoRM (${currencySymbolHtml})</th>
        </tr>
      </thead>
      <tbody>
${pgTableRows}
      </tbody>
      <tfoot>
        <tr>
          <td><strong>TOTAL</strong></td>
          <td><strong>${(grandTotalKG / 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
          <td><strong>${formatAmount(grandTotalAmount)}</strong></td>
          <td><strong>${formatAmount(grandTotalMoRM)}</strong></td>
        </tr>
      </tfoot>
    </table>
    
    <div class="product-group-chart-title" style="margin-top: 32px;">📋 Customer Breakdown (MT)</div>
    <table class="product-group-table" id="customerSummaryTable">
      <thead>
        <tr>
          <th>Customer</th>
          <th>Budget (MT)</th>
          <th>Amount (${currencySymbolHtml})</th>
        </tr>
      </thead>
      <tbody>
${custTableRows}
      </tbody>
      <tfoot>
        <tr>
          <td><strong>TOTAL</strong></td>
          <td><strong>${(grandTotalKG / 1000).toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
          <td><strong>${formatAmount(grandTotalAmount)}</strong></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <!-- Hidden data for potential re-import -->
  <script type="application/json" id="budgetData">
${JSON.stringify(tableData.flatMap(row => {
    const entries = [];
    for (let m = 1; m <= 12; m++) {
      if (row.months[m] > 0) {
        entries.push({
          customer: row.customer,
          country: row.country,
          productGroup: row.productGroup,
          month: m,
          value: row.months[m],
          salesRep: row.salesRep
        });
      }
    }
    return entries;
  }))}
  </script>
  
  <script type="application/json" id="metaData">
${JSON.stringify({
    division: divisionUpper,
    budgetYear,
    actualYear,
    salesReps,
    batchId,
    exportedAt: new Date().toISOString(),
    recordCount: aggregatedData.length,
    totalKG: grandTotalKG,
    totalMT: grandTotalKG / 1000,
    totalAmount: grandTotalAmount,
    totalMoRM: grandTotalMoRM
  })}
  </script>

  <script>
    // All data for recalculation
    const allTableData = ${JSON.stringify(sortedData.map(row => ({
      customer: row.customer,
      country: row.country,
      productGroup: row.productGroup,
      salesRep: row.salesRep,
      months: row.months
    })))};
    
    const pricingMap = ${JSON.stringify(pricingMap)};
    
    // Format helpers
    function formatMT(kg) {
      const mt = kg / 1000;
      return mt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    function formatAmount(val) {
      if (!val || val === 0) return '0';
      if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
      if (val >= 1000) return (val / 1000).toFixed(2) + 'K';
      return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    // Chart instances
    let pgChart = null;
    let salesRepPieChart = null;
    
    // Generate vibrant gradient colors for sales reps
    function generateSalesRepColors(count) {
      const colors = [
        { bg: 'rgba(255, 99, 132, 0.9)', border: 'rgba(255, 99, 132, 1)' },
        { bg: 'rgba(54, 162, 235, 0.9)', border: 'rgba(54, 162, 235, 1)' },
        { bg: 'rgba(255, 206, 86, 0.9)', border: 'rgba(255, 206, 86, 1)' },
        { bg: 'rgba(75, 192, 192, 0.9)', border: 'rgba(75, 192, 192, 1)' },
        { bg: 'rgba(153, 102, 255, 0.9)', border: 'rgba(153, 102, 255, 1)' },
        { bg: 'rgba(255, 159, 64, 0.9)', border: 'rgba(255, 159, 64, 1)' },
        { bg: 'rgba(199, 125, 255, 0.9)', border: 'rgba(199, 125, 255, 1)' },
        { bg: 'rgba(83, 211, 87, 0.9)', border: 'rgba(83, 211, 87, 1)' },
        { bg: 'rgba(237, 100, 166, 0.9)', border: 'rgba(237, 100, 166, 1)' },
        { bg: 'rgba(130, 202, 250, 0.9)', border: 'rgba(130, 202, 250, 1)' },
        { bg: 'rgba(255, 183, 77, 0.9)', border: 'rgba(255, 183, 77, 1)' },
        { bg: 'rgba(129, 212, 250, 0.9)', border: 'rgba(129, 212, 250, 1)' }
      ];
      
      const result = { backgrounds: [], borders: [] };
      for (let i = 0; i < count; i++) {
        const color = colors[i % colors.length];
        result.backgrounds.push(color.bg);
        result.borders.push(color.border);
      }
      return result;
    }
    
    // Initialize Sales Rep Pie Chart
    function initSalesRepPieChart(repData) {
      if (!repData || repData.length === 0) return;
      
      const colors = generateSalesRepColors(repData.length);
      const ctx = document.getElementById('salesRepPieChart');
      if (!ctx) return;
      
      // Calculate percentages
      const total = repData.reduce((sum, rep) => sum + rep.totalMT, 0);
      const chartData = repData.map(rep => ({
        name: rep.name,
        value: rep.totalMT,
        percentage: total > 0 ? ((rep.totalMT / total) * 100).toFixed(1) : 0,
        amount: rep.totalAmount
      }));
      
      salesRepPieChart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: chartData.map(d => d.name),
          datasets: [{
            data: chartData.map(d => d.value),
            backgroundColor: colors.backgrounds,
            borderColor: colors.borders,
            borderWidth: 3,
            hoverOffset: 20,
            offset: 5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          layout: {
            padding: 20
          },
          plugins: {
            legend: {
              display: false
            },
            tooltip: {
              backgroundColor: 'rgba(0, 0, 0, 0.85)',
              titleColor: '#fff',
              bodyColor: '#fff',
              titleFont: { size: 16, weight: 'bold' },
              bodyFont: { size: 14 },
              padding: 16,
              cornerRadius: 8,
              displayColors: true,
              boxWidth: 20,
              boxHeight: 20,
              boxPadding: 8,
              callbacks: {
                title: function(context) {
                  return context[0].label;
                },
                label: function(context) {
                  const dataIndex = context.dataIndex;
                  const data = chartData[dataIndex];
                  return [
                    'Volume: ' + data.value.toFixed(2) + ' MT',
                    'Percentage: ' + data.percentage + '%',
                    'Amount: ' + formatAmount(data.amount)
                  ];
                }
              }
            },
            datalabels: false
          },
          animation: {
            animateRotate: true,
            animateScale: true,
            duration: 1500,
            easing: 'easeOutQuart'
          }
        }
      });
      
      // Create custom legend with stats
      const legendContainer = document.getElementById('salesRepLegend');
      if (legendContainer) {
        legendContainer.innerHTML = chartData.map((data, idx) => {
          const color = colors.backgrounds[idx];
          return \`
            <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: white; border-radius: 8px; border-left: 4px solid \${colors.borders[idx]}; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: all 0.3s ease; cursor: pointer;" 
                 onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 8px rgba(0,0,0,0.1)'"
                 onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.05)'">
              <div style="width: 20px; height: 20px; border-radius: 50%; background: \${color}; border: 2px solid \${colors.borders[idx]}; flex-shrink: 0;"></div>
              <div style="flex-grow: 1;">
                <div style="font-weight: 700; font-size: 14px; color: #333; margin-bottom: 4px;">\${data.name}</div>
                <div style="display: flex; gap: 12px; font-size: 12px; color: #666;">
                  <span style="font-weight: 600; color: #1890ff;">\${data.value.toFixed(2)} MT</span>
                  <span style="font-weight: 600; color: #52c41a;">\${data.percentage}%</span>
                </div>
              </div>
            </div>
          \`;
        }).join('');
      }
    }
    
    // Recalculate and update display
    function updateDisplay(filters = {}) {
      const { salesRep = '', customer = '', country = '', productGroup = '' } = filters;
      
      // Filter data based on all active filters
      const filteredData = allTableData.filter(r => {
        if (salesRep && r.salesRep !== salesRep) return false;
        if (customer && r.customer !== customer) return false;
        if (country && r.country !== country) return false;
        if (productGroup && r.productGroup !== productGroup) return false;
        return true;
      });
      
      // Calculate totals
      let totalKG = 0;
      let totalAmount = 0;
      let totalMoRM = 0;
      const monthlyKG = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
      const monthlyAmount = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
      const monthlyMoRM = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0, 12: 0 };
      const pgTotals = {};
      const custTotals = {};
      
      filteredData.forEach(row => {
        let rowKG = 0;
        const pricing = pricingMap[(row.productGroup || '').toLowerCase()] || { sellingPrice: 0, morm: 0 };
        
        for (let m = 1; m <= 12; m++) {
          const kg = row.months[m] || 0;
          rowKG += kg;
          monthlyKG[m] += kg;
          monthlyAmount[m] += kg * pricing.sellingPrice;
          monthlyMoRM[m] += kg * pricing.morm;
        }
        totalKG += rowKG;
        
        const rowAmount = rowKG * pricing.sellingPrice;
        const rowMoRM = rowKG * pricing.morm;
        totalAmount += rowAmount;
        totalMoRM += rowMoRM;
        
        // Product group
        const pg = row.productGroup || 'Unknown';
        if (!pgTotals[pg]) pgTotals[pg] = { kg: 0, amount: 0, morm: 0 };
        pgTotals[pg].kg += rowKG;
        pgTotals[pg].amount += rowAmount;
        pgTotals[pg].morm += rowMoRM;
        
        // Customer
        const cust = row.customer || 'Unknown';
        if (!custTotals[cust]) custTotals[cust] = { kg: 0, amount: 0 };
        custTotals[cust].kg += rowKG;
        custTotals[cust].amount += rowAmount;
      });
      
      // Update recap cards
      document.getElementById('recapTotalMT').textContent = formatMT(totalKG) + ' MT';
      document.getElementById('recapTotalAmount').textContent = formatAmount(totalAmount);
      document.getElementById('recapTotalMoRM').textContent = formatAmount(totalMoRM);
      
      // Update table rows visibility based on filters
      const rows = document.querySelectorAll('tbody tr[data-row-index]');
      rows.forEach(row => {
        const rowData = allTableData[parseInt(row.dataset.rowIndex)];
        if (!rowData) {
          row.style.display = 'none';
          return;
        }
        
        let visible = true;
        if (salesRep && rowData.salesRep !== salesRep) visible = false;
        if (customer && rowData.customer !== customer) visible = false;
        if (country && rowData.country !== country) visible = false;
        if (productGroup && rowData.productGroup !== productGroup) visible = false;
        
        row.style.display = visible ? '' : 'none';
      });
      
      // Update totals row in table footer
      const footerRows = document.querySelectorAll('tfoot tr');
      if (footerRows.length >= 3) {
        // Update budget total row (first row in footer) - MT row
        // Structure: td[0]=label, td[1]=colspan(2), td[2-13]=12 months, td[14]=total
        const budgetRow = footerRows[0];
        const budgetCells = budgetRow.querySelectorAll('td');
        for (let i = 0; i < 12; i++) {
          budgetCells[i + 2].textContent = formatMT(monthlyKG[i + 1]);
        }
        budgetRow.querySelector('td:last-child strong').textContent = formatMT(totalKG);
        
        // Update amount total row (second row in footer)
        const amountRow = footerRows[1];
        const amountCells = amountRow.querySelectorAll('td');
        for (let i = 0; i < 12; i++) {
          amountCells[i + 2].textContent = formatAmount(monthlyAmount[i + 1]);
        }
        amountRow.querySelector('td:last-child strong').textContent = formatAmount(totalAmount);
        
        // Update MoRM total row (third row in footer)
        const mormRow = footerRows[2];
        const mormCells = mormRow.querySelectorAll('td');
        for (let i = 0; i < 12; i++) {
          mormCells[i + 2].textContent = formatAmount(monthlyMoRM[i + 1]);
        }
        mormRow.querySelector('td:last-child strong').textContent = formatAmount(totalMoRM);
      }
      
      // Update Product Group table
      const pgTableBody = document.querySelector('#productGroupTable tbody');
      const pgData = Object.entries(pgTotals)
        .map(([name, data]) => ({ name, mt: data.kg / 1000, amount: data.amount, morm: data.morm }))
        .sort((a, b) => b.mt - a.mt);
      
      pgTableBody.innerHTML = pgData.map(pg => 
        '<tr><td>' + pg.name + '</td><td>' + pg.mt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + 
        '</td><td>' + formatAmount(pg.amount) + '</td><td>' + formatAmount(pg.morm) + '</td></tr>'
      ).join('');
      
      // Update PG table footer
      document.querySelector('#productGroupTable tfoot td:nth-child(2) strong').textContent = formatMT(totalKG);
      document.querySelector('#productGroupTable tfoot td:nth-child(3) strong').textContent = formatAmount(totalAmount);
      document.querySelector('#productGroupTable tfoot td:nth-child(4) strong').textContent = formatAmount(totalMoRM);
      
      // Update Customer table
      const custTableBody = document.querySelector('#customerSummaryTable tbody');
      const custData = Object.entries(custTotals)
        .map(([name, data]) => ({ name, mt: data.kg / 1000, amount: data.amount }))
        .sort((a, b) => b.mt - a.mt);
      
      custTableBody.innerHTML = custData.map(c => {
        const properName = c.name.toLowerCase().replace(/(?:^|\\s|[-\\/])\\w/g, m => m.toUpperCase());
        return '<tr><td>' + properName + '</td><td>' + c.mt.toLocaleString('en-US', { minimumFractionDigits: 2 }) + 
        '</td><td>' + formatAmount(c.amount) + '</td></tr>';
      }).join('');
      
      // Update Customer table footer
      document.querySelector('#customerSummaryTable tfoot td:nth-child(2) strong').textContent = formatMT(totalKG);
      document.querySelector('#customerSummaryTable tfoot td:nth-child(3) strong').textContent = formatAmount(totalAmount);
      
      // Update chart
      updateChart(pgData);
    }
    
    function updateChart(pgData) {
      const colors = [
        'rgba(102, 126, 234, 0.8)',
        'rgba(118, 75, 162, 0.8)',
        'rgba(240, 147, 43, 0.8)',
        'rgba(46, 204, 113, 0.8)',
        'rgba(52, 152, 219, 0.8)',
        'rgba(155, 89, 182, 0.8)',
        'rgba(241, 196, 15, 0.8)',
        'rgba(230, 126, 34, 0.8)',
        'rgba(231, 76, 60, 0.8)',
        'rgba(149, 165, 166, 0.8)'
      ];
      
      if (pgChart) {
        pgChart.data.labels = pgData.map(d => d.name);
        pgChart.data.datasets[0].data = pgData.map(d => d.mt);
        pgChart.data.datasets[0].backgroundColor = pgData.map((_, i) => colors[i % colors.length]);
        pgChart.data.datasets[0].borderColor = pgData.map((_, i) => colors[i % colors.length].replace('0.8', '1'));
        pgChart.update();
      } else if (pgData.length > 0) {
        const ctx = document.getElementById('productGroupChart').getContext('2d');
        pgChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: pgData.map(d => d.name),
            datasets: [{
              label: 'Budget (MT)',
              data: pgData.map(d => d.mt),
              backgroundColor: pgData.map((_, i) => colors[i % colors.length]),
              borderColor: pgData.map((_, i) => colors[i % colors.length].replace('0.8', '1')),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: {
                callbacks: {
                  label: function(context) {
                    return context.dataset.label + ': ' + context.raw.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ' MT';
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: { display: true, text: 'Volume (MT)' }
              }
            }
          }
        });
      }
    }
    
    // Calculate sales rep data for pie chart
    function calculateSalesRepData() {
      const repTotals = {};
      allTableData.forEach(row => {
        const rep = row.salesRep || 'Unknown';
        if (!repTotals[rep]) {
          repTotals[rep] = { totalKG: 0, totalAmount: 0 };
        }
        let rowKG = 0;
        for (let m = 1; m <= 12; m++) {
          rowKG += row.months[m] || 0;
        }
        repTotals[rep].totalKG += rowKG;
        const pricing = pricingMap[(row.productGroup || '').toLowerCase()] || { sellingPrice: 0, morm: 0 };
        repTotals[rep].totalAmount += rowKG * pricing.sellingPrice;
      });
      
      return Object.entries(repTotals)
        .map(([name, data]) => ({
          name: name,
          totalMT: data.totalKG / 1000,
          totalAmount: data.totalAmount
        }))
        .sort((a, b) => b.totalMT - a.totalMT);
    }
    
    // Get current filter values
    function getCurrentFilters() {
      return {
        salesRep: document.getElementById('salesRepFilter').value,
        customer: document.getElementById('customerFilter').value,
        country: document.getElementById('countryFilter').value,
        productGroup: document.getElementById('productGroupFilter').value
      };
    }
    
    // Update dropdown options based on current filters
    function updateDropdownOptions(changedFilter) {
      const filters = getCurrentFilters();
      
      // Helper function to get available data for a specific dropdown
      function getAvailableDataFor(excludeFilter) {
        let data = allTableData;
        
        // Apply all filters EXCEPT the one being updated
        if (filters.salesRep && excludeFilter !== 'salesRep') {
          data = data.filter(r => r.salesRep === filters.salesRep);
        }
        if (filters.customer && excludeFilter !== 'customer') {
          data = data.filter(r => r.customer === filters.customer);
        }
        if (filters.country && excludeFilter !== 'country') {
          data = data.filter(r => r.country === filters.country);
        }
        if (filters.productGroup && excludeFilter !== 'productGroup') {
          data = data.filter(r => r.productGroup === filters.productGroup);
        }
        
        return data;
      }
      
      // Update Customer dropdown
      const customerData = getAvailableDataFor('customer');
      const customers = [...new Set(customerData.map(r => r.customer))].sort();
      const customerSelect = document.getElementById('customerFilter');
      const currentCustomer = customerSelect.value;
      const customerValid = customers.includes(currentCustomer);
      customerSelect.innerHTML = '<option value="">All Customers (' + customers.length + ')</option>' +
        customers.map(c => '<option value="' + c + '"' + (c === currentCustomer && customerValid ? ' selected' : '') + '>' + 
          c.toLowerCase().replace(/(?:^|\\s|[-\\/])\\w/g, m => m.toUpperCase()) + '</option>').join('');
      if (!customerValid && currentCustomer) customerSelect.value = '';
      
      // Update Country dropdown
      const countryData = getAvailableDataFor('country');
      const countries = [...new Set(countryData.map(r => r.country))].sort();
      const countrySelect = document.getElementById('countryFilter');
      const currentCountry = countrySelect.value;
      const countryValid = countries.includes(currentCountry);
      countrySelect.innerHTML = '<option value="">All Countries (' + countries.length + ')</option>' +
        countries.map(c => '<option value="' + c + '"' + (c === currentCountry && countryValid ? ' selected' : '') + '>' + c + '</option>').join('');
      if (!countryValid && currentCountry) countrySelect.value = '';
      
      // Update Product Group dropdown
      const pgData = getAvailableDataFor('productGroup');
      const productGroups = [...new Set(pgData.map(r => r.productGroup))].sort();
      const pgSelect = document.getElementById('productGroupFilter');
      const currentPG = pgSelect.value;
      const pgValid = productGroups.includes(currentPG);
      pgSelect.innerHTML = '<option value="">All Product Groups (' + productGroups.length + ')</option>' +
        productGroups.map(pg => '<option value="' + pg + '"' + (pg === currentPG && pgValid ? ' selected' : '') + '>' + pg + '</option>').join('');
      if (!pgValid && currentPG) pgSelect.value = '';
      
      // Update Sales Rep dropdown
      const repData = getAvailableDataFor('salesRep');
      const salesReps = [...new Set(repData.map(r => r.salesRep))].sort();
      const repSelect = document.getElementById('salesRepFilter');
      const currentRep = repSelect.value;
      const repValid = salesReps.includes(currentRep);
      repSelect.innerHTML = '<option value="">All Sales Reps (' + salesReps.length + ')</option>' +
        salesReps.map(rep => '<option value="' + rep + '"' + (rep === currentRep && repValid ? ' selected' : '') + '>' + 
          rep.toLowerCase().replace(/(?:^|\\s|[-\\/])\\w/g, m => m.toUpperCase()) + '</option>').join('');
      if (!repValid && currentRep) repSelect.value = '';
    }
    
    // Apply filters and update dependent dropdowns
    function applyFilters(changedFilter) {
      updateDropdownOptions(changedFilter);
      updateDisplay(getCurrentFilters());
    }
    
    // Attach event listeners to all filters
    document.getElementById('salesRepFilter').addEventListener('change', function() {
      applyFilters('salesRep');
    });
    document.getElementById('customerFilter').addEventListener('change', function() {
      applyFilters('customer');
    });
    document.getElementById('countryFilter').addEventListener('change', function() {
      applyFilters('country');
    });
    document.getElementById('productGroupFilter').addEventListener('change', function() {
      applyFilters('productGroup');
    });
    
    // Initialize charts on load
    const salesRepData = calculateSalesRepData();
    initSalesRepPieChart(salesRepData);
    updateDisplay({});
  </script>
</body>
</html>`;

  return html;
}

module.exports = {
  generateMergedBulkHtml
};
