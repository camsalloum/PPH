/**
 * @fileoverview Management Allocation HTML Export Generator
 * @description Generates a comprehensive HTML report for Management Allocation
 * showing Product Groups with Actual vs Budget, and Sales Rep breakdowns
 * 
 * Features:
 * - Product Group summary with actual/budget comparisons
 * - Sales rep breakdown per product group
 * - Interactive charts (ECharts)
 * - No customer-level details
 * 
 * Created: January 2026
 */

const logger = require('./logger');

/**
 * Helper function to convert string to Proper Case
 * FIXED: Now handles parentheses and periods to match INITCAP behavior
 */
const toProperCase = (str) => {
  if (!str) return '';
  return str.toLowerCase().replace(/(?:^|\s|[-/(.])/\w/g, (match) => match.toUpperCase());
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
 * Format number with K/M suffix for compact display
 */
const formatCompact = (val) => {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '0';
  const num = parseFloat(String(val).replace(/,/g, ''));
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

/**
 * Generate CSS styles for the HTML export
 */
function generateStyles() {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; margin: 0; padding: 0; }
    body { 
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
      padding: 20px; 
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
      min-height: 100vh;
    }
    
    /* Print styles */
    @media print {
      body { background: white; padding: 10px; }
      .no-print { display: none !important; }
      .card { break-inside: avoid; page-break-inside: avoid; }
      .chart-container { break-inside: avoid; page-break-inside: avoid; }
      .charts-section { 
        grid-template-columns: 1fr; 
        break-inside: avoid; 
        page-break-inside: avoid; 
      }
      .chart-card {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 20px;
      }
    }
    
    .container { max-width: 1400px; margin: 0 auto; }
    
    /* Header */
    .header { 
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 24px 32px;
      border-radius: 16px;
      margin-bottom: 24px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.15);
    }
    .header-top { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      margin-bottom: 16px;
    }
    .header h1 { 
      font-size: 28px; 
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .header-badge {
      background: rgba(255,255,255,0.15);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
    }
    .header-info { 
      display: flex; 
      gap: 32px; 
      flex-wrap: wrap;
      font-size: 14px;
      opacity: 0.9;
    }
    .header-info div strong { 
      color: #64b5f6;
      font-weight: 600;
    }
    
    /* Summary Cards */
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .summary-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
      position: relative;
      overflow: hidden;
    }
    .summary-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
    }
    .summary-card.actual::before { background: linear-gradient(90deg, #667eea, #764ba2); }
    .summary-card.budget::before { background: linear-gradient(90deg, #11998e, #38ef7d); }
    .summary-card.remaining::before { background: linear-gradient(90deg, #f093fb, #f5576c); }
    .summary-card.submitted::before { background: linear-gradient(90deg, #4facfe, #00f2fe); }
    .summary-card.allocation::before { background: linear-gradient(90deg, #fa709a, #fee140); }
    
    .summary-card .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #666;
      margin-bottom: 8px;
    }
    .summary-card .value {
      font-size: 28px;
      font-weight: 700;
      color: #1a1a2e;
    }
    .summary-card .subtitle {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
    
    /* Charts Section */
    .charts-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 24px;
    }
    @media (max-width: 1024px) {
      .charts-section { grid-template-columns: 1fr; }
    }
    .chart-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    }
    .chart-card h3 {
      font-size: 16px;
      color: #1a1a2e;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #f0f0f0;
    }
    .chart-container {
      width: 100%;
      height: 350px;
    }
    
    /* Product Groups Table */
    .table-section {
      background: white;
      border-radius: 12px;
      padding: 24px;
      box-shadow: 0 4px 15px rgba(0,0,0,0.08);
      margin-bottom: 24px;
    }
    .table-section h2 {
      font-size: 18px;
      color: #1a1a2e;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .table-section h2 .icon {
      width: 32px;
      height: 32px;
      background: linear-gradient(135deg, #667eea, #764ba2);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 16px;
    }
    
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 13px;
    }
    thead th {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      color: white;
      padding: 14px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    thead th:first-child { border-radius: 8px 0 0 0; }
    thead th:last-child { border-radius: 0 8px 0 0; }
    
    tbody tr { transition: all 0.2s ease; }
    tbody tr:hover { background: #f8f9ff; }
    tbody tr.pg-row { cursor: pointer; }
    tbody tr.pg-row:hover { background: #e8f4ff; }
    
    tbody td {
      padding: 14px 12px;
      border-bottom: 1px solid #eef2f7;
    }
    tbody tr:last-child td { border-bottom: none; }
    
    .pg-name {
      font-weight: 600;
      color: #1a1a2e;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .pg-name .expand-icon {
      width: 20px;
      height: 20px;
      background: #e8f4ff;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: #1890ff;
      transition: transform 0.2s ease;
    }
    .pg-name .expand-icon.expanded { transform: rotate(90deg); }
    
    .value-actual { color: #667eea; font-weight: 500; }
    .value-budget { color: #11998e; font-weight: 500; }
    .value-submitted { color: #4facfe; font-weight: 500; }
    .value-allocation { color: #fa709a; font-weight: 600; }
    .value-variance { font-weight: 600; }
    .value-variance.positive { color: #52c41a; }
    .value-variance.negative { color: #ff4d4f; }
    
    /* Sales Rep Breakdown (expandable) */
    .salesrep-breakdown {
      display: none;
      padding: 0;
    }
    .salesrep-breakdown.expanded { display: table-row; }
    .salesrep-breakdown td {
      padding: 0;
      background: #fafbfc;
    }
    .salesrep-table {
      width: calc(100% - 40px);
      margin: 12px 20px 16px 40px;
      border: 1px solid #e8ecf0;
      border-radius: 8px;
      overflow: hidden;
    }
    .salesrep-table thead th {
      background: #f0f4f8;
      color: #1a1a2e;
      font-size: 11px;
      padding: 10px 12px;
    }
    .salesrep-table tbody td {
      padding: 10px 12px;
      font-size: 12px;
    }
    .salesrep-name {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .salesrep-avatar {
      width: 28px;
      height: 28px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-size: 11px;
      font-weight: 600;
    }
    
    /* Progress bars */
    .progress-bar {
      width: 100%;
      height: 6px;
      background: #e8ecf0;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 6px;
    }
    .progress-bar .fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .progress-bar .fill.actual { background: linear-gradient(90deg, #667eea, #764ba2); }
    .progress-bar .fill.allocation { background: linear-gradient(90deg, #fa709a, #fee140); }
    
    /* Footer */
    .footer {
      text-align: center;
      padding: 20px;
      color: #999;
      font-size: 12px;
    }
    
    /* Totals row */
    tbody tr.totals-row {
      background: linear-gradient(135deg, #f8f9ff 0%, #f0f4ff 100%);
      font-weight: 600;
    }
    tbody tr.totals-row td {
      border-top: 2px solid #1a1a2e;
      padding: 16px 12px;
    }
    tbody tr.totals-row .pg-name {
      font-size: 14px;
    }
    
    /* Actions */
    .actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .btn {
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
    }
    .btn-secondary {
      background: white;
      color: #1a1a2e;
      border: 1px solid #ddd;
    }
    .btn-secondary:hover {
      background: #f5f5f5;
    }
  `;
}

/**
 * Generate the main HTML export content
 */
function generateManagementAllocationHtml(options) {
  const {
    division = 'FP',
    divisionName = 'Flexible Packaging',
    actualYear,
    budgetYear,
    productGroups = [],
    totals = {},
    groups = [],
    generatedAt = new Date().toISOString()
  } = options;

  // Calculate chart data
  const topPGsByActual = [...productGroups]
    .sort((a, b) => (b.actual_kgs || 0) - (a.actual_kgs || 0))
    .slice(0, 10);
  
  const topPGsByAllocation = [...productGroups]
    .sort((a, b) => (b.allocated_kgs || 0) - (a.allocated_kgs || 0))
    .slice(0, 10);

  // Calculate variance data
  const varianceData = productGroups.map(pg => ({
    name: pg.pgcombine,
    actual: (pg.actual_kgs || 0) / 1000,
    allocation: (pg.allocated_kgs || 0) / 1000,
    variance: ((pg.allocated_kgs || 0) - (pg.actual_kgs || 0)) / 1000,
    variancePercent: pg.actual_kgs > 0 
      ? (((pg.allocated_kgs || 0) - (pg.actual_kgs || 0)) / pg.actual_kgs * 100).toFixed(1)
      : 'N/A'
  }));

  // Group allocation distribution - filter to only groups with data
  const groupAllocationData = groups.map(g => {
    const totalAlloc = productGroups.reduce((sum, pg) => {
      const groupData = pg.groupBreakdown?.find(gb => gb.groupId === g.id);
      return sum + (groupData?.allocated_kgs || 0);
    }, 0);
    return { id: g.id, name: g.name, value: totalAlloc / 1000, members: g.members };
  }).filter(g => g.value > 0).sort((a, b) => b.value - a.value);

  // Only show groups that have allocations
  const activeGroups = groupAllocationData;

  const styles = generateStyles();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sales Budget by Product Groups - ${division} ${budgetYear}</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
  <style>${styles}</style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="header-top">
        <h1>📊 Sales Budget by Product Groups with Sales Reps Allocation</h1>
      </div>
      <div class="header-info">
        <div><strong>Division:</strong> ${toProperCase(divisionName)} (${division})</div>
        <div><strong>Actual Year:</strong> ${actualYear}</div>
        <div><strong>Budget Year:</strong> ${budgetYear}</div>
        <div><strong>Sales Rep Groups:</strong> ${groups.length}</div>
        <div><strong>Product Groups:</strong> ${productGroups.length}</div>
        <div><strong>Generated:</strong> ${new Date(generatedAt).toLocaleString()}</div>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="summary-grid">
      <div class="summary-card actual">
        <div class="label">${actualYear} Actual</div>
        <div class="value">${formatMT((totals.actualKgs || 0) / 1000)}</div>
        <div class="subtitle">MT (Metric Tonnes)</div>
      </div>
      <div class="summary-card allocation">
        <div class="label">${budgetYear} Sales Budget</div>
        <div class="value">${formatMT((totals.allocatedKgs || 0) / 1000)}</div>
        <div class="subtitle">MT</div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="charts-section" style="grid-template-columns: 1fr;">
      <div class="chart-card">
        <h3>🎯 ${actualYear} Actual vs ${budgetYear} Sales Budget Comparison</h3>
        <div id="chart-comparison" class="chart-container" style="height: 450px;"></div>
      </div>
    </div>

        <!-- Sales Rep Allocation - Data Table with Visual Bars -->
    <div class="table-section" style="margin-top: 24px;">
      <h2 style="margin-bottom: 20px;">
        <span class="icon">👥</span>
        Sales Rep Allocation Matrix
      </h2>
      <p style="color: #666; font-size: 13px; margin-bottom: 16px;">
        Bars show <strong>percentage share</strong> within each product group. MT values shown for reference.
      </p>
      <div style="overflow-x: auto;">
        <table class="allocation-matrix" style="min-width: 100%;">
          <thead>
            <tr>
              <th style="width: 180px; text-align: left;">Product Group</th>
              <th style="width: 90px; text-align: right;">Total MT</th>
              ${activeGroups.map((g, idx) => `<th style="min-width: 150px;">
                <div style="display: flex; align-items: center; gap: 6px; justify-content: center;">
                  <span style="width: 12px; height: 12px; border-radius: 3px; background: ${['#667eea', '#52c41a', '#fa709a', '#4facfe', '#ffd93d', '#ff6b9d', '#a8edea', '#f093fb'][idx % 8]};"></span>
                  ${g.name}
                </div>
                <div style="font-size: 10px; color: #999; font-weight: normal;">(${g.members?.length || 0} members)</div>
              </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${productGroups
              .filter(pg => pg.allocated_kgs > 0)
              .sort((a, b) => (b.allocated_kgs || 0) - (a.allocated_kgs || 0))
              .map(pg => {
                const totalMT = (pg.allocated_kgs || 0) / 1000;
                const breakdown = pg.groupBreakdown || [];
                
                return `<tr>
                  <td style="font-weight: 600; white-space: nowrap;">${pg.pgcombine}</td>
                  <td style="text-align: right; font-weight: 700; color: #1a1a2e; white-space: nowrap;">${formatMT(totalMT)} MT</td>
                  ${activeGroups.map((g, idx) => {
                    const gb = breakdown.find(b => b.groupId === g.id);
                    const mt = gb ? (gb.allocated_kgs || 0) / 1000 : 0;
                    const percent = totalMT > 0 ? (mt / totalMT * 100) : 0;
                    const color = ['#667eea', '#52c41a', '#fa709a', '#4facfe', '#ffd93d', '#ff6b9d', '#a8edea', '#f093fb'][idx % 8];
                    
                    if (mt === 0) {
                      return '<td style="text-align: center; color: #ddd;">-</td>';
                    }
                    
                    return `<td style="padding: 8px 6px;">
                      <div style="position: relative; height: 36px; background: #f5f5f5; border-radius: 6px; overflow: hidden;">
                        <div style="position: absolute; left: 0; top: 0; height: 100%; width: ${Math.max(percent, 5)}%; background: linear-gradient(90deg, ${color}, ${color}cc); border-radius: 6px;"></div>
                        <div style="position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; height: 36px; padding: 0 10px; font-size: 12px; font-weight: 600;">
                          <span style="color: ${percent > 35 ? '#fff' : '#333'};">${mt.toFixed(1)}</span>
                          <span style="color: ${percent > 35 ? 'rgba(255,255,255,0.85)' : '#888'}; font-size: 11px;">${percent.toFixed(0)}%</span>
                        </div>
                      </div>
                    </td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
          </tbody>
          <tfoot>
            <tr style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
              <td style="color: #fff; font-weight: 700;">TOTAL</td>
              <td style="text-align: right; color: #4facfe; font-weight: 700;">${formatMT((totals.allocatedKgs || 0) / 1000)} MT</td>
              ${activeGroups.map((g, idx) => {
                const color = ['#667eea', '#52c41a', '#fa709a', '#4facfe', '#ffd93d', '#ff6b9d', '#a8edea', '#f093fb'][idx % 8];
                const pct = totals.allocatedKgs > 0 ? (g.value / (totals.allocatedKgs / 1000) * 100).toFixed(1) : 0;
                return `<td style="text-align: center; padding: 12px 6px;">
                  <div style="color: ${color}; font-size: 15px; font-weight: 700;">${formatMT(g.value)} MT</div>
                  <div style="color: rgba(255,255,255,0.7); font-size: 11px;">${pct}% of total</div>
                </td>`;
              }).join('')}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Summary Charts Row -->
    <div class="charts-section" style="grid-template-columns: 1fr 1fr; margin-top: 24px;">
      <div class="chart-card">
        <h3>🥧 Total Allocation by Sales Rep</h3>
        <div id="chart-rep-pie" class="chart-container" style="height: 350px;"></div>
      </div>
      <div class="chart-card">
        <h3>📊 Top Product Groups by Allocation</h3>
        <div id="chart-top-pg" class="chart-container" style="height: 350px;"></div>
      </div>
    </div>
<!-- Product Groups Table -->
    <div class="table-section">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2>
          <span class="icon">📦</span>
          Product Group Details by Sales Rep
        </h2>
        <div class="actions no-print">
          <button class="btn btn-secondary" onclick="expandAllRows()">📂 Expand All</button>
          <button class="btn btn-secondary" onclick="collapseAllRows()">📁 Collapse All</button>
          <button class="btn btn-primary" onclick="window.print()">🖨️ Print Report</button>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th style="width: 200px;">Product Group</th>
            <th style="width: 120px; text-align: right;">${actualYear} Actual</th>
            <th style="width: 130px; text-align: right;">${budgetYear} Sales Budget</th>
            <th style="width: 100px; text-align: right;">Variance</th>
            <th style="width: 80px; text-align: right;">Var %</th>
          </tr>
        </thead>
        <tbody>
          ${productGroups.map((pg, idx) => {
            const actualMT = (pg.actual_kgs || 0) / 1000;
            const allocatedMT = (pg.allocated_kgs || 0) / 1000;
            const varianceMT = allocatedMT - actualMT;
            const variancePercent = actualMT > 0 ? ((varianceMT / actualMT) * 100).toFixed(1) : 'N/A';
            const hasBreakdown = pg.groupBreakdown && pg.groupBreakdown.some(gb => (gb.allocated_kgs || 0) > 0 || (gb.actual_kgs || 0) > 0);
            
            return `
              <tr class="pg-row" onclick="toggleRow(${idx})" data-idx="${idx}">
                <td>
                  <div class="pg-name">
                    ${hasBreakdown ? `<span class="expand-icon" id="icon-${idx}">▶</span>` : '<span style="width: 20px;"></span>'}
                    ${pg.pgcombine}
                  </div>
                </td>
                <td style="text-align: right;" class="value-actual">${formatMT(actualMT)} MT</td>
                <td style="text-align: right;" class="value-allocation">${formatMT(allocatedMT)} MT</td>
                <td style="text-align: right;" class="value-variance ${varianceMT >= 0 ? 'positive' : 'negative'}">${varianceMT >= 0 ? '+' : ''}${formatMT(varianceMT)} MT</td>
                <td style="text-align: right;" class="value-variance ${varianceMT >= 0 ? 'positive' : 'negative'}">${variancePercent !== 'N/A' ? (varianceMT >= 0 ? '+' : '') + variancePercent + '%' : 'N/A'}</td>
              </tr>
              ${hasBreakdown ? `
              <tr class="salesrep-breakdown" id="breakdown-${idx}">
                <td colspan="5">
                  <table class="salesrep-table">
                    <thead>
                      <tr>
                        <th style="width: 200px;">Sales Rep Group</th>
                        <th style="width: 100px; text-align: center;">Members</th>
                        <th style="width: 120px; text-align: right;">${actualYear} Actual</th>
                        <th style="width: 130px; text-align: right;">${budgetYear} Sales Budget</th>
                        <th style="width: 100px; text-align: right;">Variance</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${(pg.groupBreakdown || [])
                        .filter(gb => (gb.allocated_kgs || 0) > 0 || (gb.actual_kgs || 0) > 0)
                        .map(gb => {
                          const gbActualMT = (gb.actual_kgs || 0) / 1000;
                          const gbAllocatedMT = (gb.allocated_kgs || 0) / 1000;
                          const gbVariance = gbAllocatedMT - gbActualMT;
                          const initials = (gb.groupName || 'XX').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
                          return `
                            <tr>
                              <td>
                                <div class="salesrep-name">
                                  <span class="salesrep-avatar">${initials}</span>
                                  <span>${gb.groupName}</span>
                                </div>
                              </td>
                              <td style="text-align: center;">${gb.members?.length || 0}</td>
                              <td style="text-align: right;" class="value-actual">${formatMT(gbActualMT)} MT</td>
                              <td style="text-align: right;" class="value-allocation">${formatMT(gbAllocatedMT)} MT</td>
                              <td style="text-align: right;" class="value-variance ${gbVariance >= 0 ? 'positive' : 'negative'}">${gbVariance >= 0 ? '+' : ''}${formatMT(gbVariance)} MT</td>
                            </tr>
                          `;
                        }).join('')}
                    </tbody>
                  </table>
                </td>
              </tr>
              ` : ''}
            `;
          }).join('')}
          
          <!-- Totals Row -->
          <tr class="totals-row">
            <td><div class="pg-name">📊 TOTAL (${productGroups.length} Product Groups)</div></td>
            <td style="text-align: right;" class="value-actual">${formatMT((totals.actualKgs || 0) / 1000)} MT</td>
            <td style="text-align: right;" class="value-allocation">${formatMT((totals.allocatedKgs || 0) / 1000)} MT</td>
            <td style="text-align: right;" class="value-variance ${(totals.allocatedKgs - totals.actualKgs) >= 0 ? 'positive' : 'negative'}">
              ${(totals.allocatedKgs - totals.actualKgs) >= 0 ? '+' : ''}${formatMT(((totals.allocatedKgs || 0) - (totals.actualKgs || 0)) / 1000)} MT
            </td>
            <td style="text-align: right;" class="value-variance ${(totals.allocatedKgs - totals.actualKgs) >= 0 ? 'positive' : 'negative'}">
              ${totals.actualKgs > 0 ? ((((totals.allocatedKgs || 0) - (totals.actualKgs || 0)) / totals.actualKgs) * 100).toFixed(1) + '%' : 'N/A'}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <script>
    // Chart data - use topPGsByAllocation for comparison (has data)
    const comparisonData = ${JSON.stringify(topPGsByAllocation.map(pg => ({
      name: pg.pgcombine,
      actual: (pg.actual_kgs || 0) / 1000,
      allocation: (pg.allocated_kgs || 0) / 1000
    })))};

    // Sales rep breakdown data with totals
    const salesRepData = ${JSON.stringify(productGroups
      .filter(pg => pg.allocated_kgs > 0)
      .map(pg => {
        const totalAlloc = (pg.allocated_kgs || 0) / 1000;
        return {
          pgcombine: pg.pgcombine,
          total: totalAlloc,
          groupBreakdown: (pg.groupBreakdown || [])
            .filter(gb => (gb.allocated_kgs || 0) > 0)
            .map(gb => ({
              groupName: gb.groupName,
              allocated_kgs: (gb.allocated_kgs || 0) / 1000,
              members: gb.members?.length || 0
            }))
        };
      })
      .filter(pg => pg.groupBreakdown.length > 0)
      .sort((a, b) => b.total - a.total)
    )};

    // Only active groups (those with allocations)
    const groupsData = ${JSON.stringify(groupAllocationData.map(g => ({
      name: g.name,
      members: g.members?.length || 0,
      total: g.value
    })))};

    // Initialize charts
    document.addEventListener('DOMContentLoaded', function() {
      initCharts();
    });

        function initCharts() {
      const colors = [
        '#667eea', '#52c41a', '#fa709a', '#4facfe', '#ffd93d', 
        '#ff6b9d', '#a8edea', '#f093fb', '#c471ed', '#96c93d'
      ];
      
      // Actual vs Sales Budget Comparison
      const chartComparison = echarts.init(document.getElementById('chart-comparison'));
      chartComparison.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        legend: { data: ['${actualYear} Actual', '${budgetYear} Sales Budget'], top: 0 },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '50px', containLabel: true },
        xAxis: { 
          type: 'category', 
          data: comparisonData.map(d => d.name),
          axisLabel: { rotate: 45, fontSize: 11, interval: 0 }
        },
        yAxis: { type: 'value', axisLabel: { formatter: '{value} MT' } },
        series: [
          { name: '${actualYear} Actual', type: 'bar', data: comparisonData.map(d => d.actual.toFixed(2)), itemStyle: { color: '#667eea' }, label: { show: true, position: 'top', fontSize: 10 } },
          { name: '${budgetYear} Sales Budget', type: 'bar', data: comparisonData.map(d => d.allocation.toFixed(2)), itemStyle: { color: '#52c41a' }, label: { show: true, position: 'top', fontSize: 10 } }
        ]
      });

      // Sales Rep Pie Chart - use pre-computed totals
      const chartRepPie = echarts.init(document.getElementById('chart-rep-pie'));
      
      chartRepPie.setOption({
        tooltip: { trigger: 'item', formatter: '{b}<br/>{c} MT ({d}%)' },
        legend: { orient: 'horizontal', bottom: 0, type: 'scroll', textStyle: { fontSize: 10 } },
        series: [{
          type: 'pie',
          radius: ['35%', '65%'],
          center: ['50%', '45%'],
          itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, fontSize: 11, fontWeight: 'bold', formatter: '{b}\\n{c} MT\\n({d}%)' },
          emphasis: { label: { fontSize: 13 }, itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.3)' } },
          data: groupsData.map((g, idx) => ({ 
            value: g.total.toFixed(2), 
            name: g.name, 
            itemStyle: { color: colors[idx % colors.length] } 
          }))
        }]
      });

      // Top Product Groups - already sorted in salesRepData
      const chartTopPG = echarts.init(document.getElementById('chart-top-pg'));
      const topPGs = salesRepData.slice(0, 12);
      
      chartTopPG.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', top: '10px', containLabel: true },
        xAxis: { type: 'category', data: topPGs.map(p => p.pgcombine), axisLabel: { rotate: 45, fontSize: 10, interval: 0 } },
        yAxis: { type: 'value', axisLabel: { formatter: '{value} MT' } },
        series: [{
          type: 'bar',
          data: topPGs.map(p => p.total.toFixed(2)),
          itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#667eea' }, { offset: 1, color: '#764ba2' }]) },
          label: { show: true, position: 'top', fontSize: 10, fontWeight: 'bold' }
        }]
      });

      window.addEventListener('resize', function() {
        chartComparison.resize();
        chartRepPie.resize();
        chartTopPG.resize();
      });
    }

    // Toggle row expansion
    function toggleRow(idx) {
      const breakdown = document.getElementById('breakdown-' + idx);
      const icon = document.getElementById('icon-' + idx);
      if (!breakdown) return;
      
      if (breakdown.classList.contains('expanded')) {
        breakdown.classList.remove('expanded');
        if (icon) icon.classList.remove('expanded');
      } else {
        breakdown.classList.add('expanded');
        if (icon) icon.classList.add('expanded');
      }
    }

    function expandAllRows() {
      document.querySelectorAll('.salesrep-breakdown').forEach(el => el.classList.add('expanded'));
      document.querySelectorAll('.expand-icon').forEach(el => el.classList.add('expanded'));
    }

    function collapseAllRows() {
      document.querySelectorAll('.salesrep-breakdown').forEach(el => el.classList.remove('expanded'));
      document.querySelectorAll('.expand-icon').forEach(el => el.classList.remove('expanded'));
    }
  </script>
</body>
</html>`;
}

module.exports = {
  generateManagementAllocationHtml
};
