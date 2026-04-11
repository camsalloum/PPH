import React from 'react';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import './CombinedTrends.css';

// Color scheme definitions (MUST MATCH ColumnConfigGrid.js exactly)
const colorSchemes = [
  { name: 'blue', label: 'Blue', primary: '#288cfa', secondary: '#103766', isDark: true },
  { name: 'green', label: 'Green', primary: '#2E865F', secondary: '#C6F4D6', isDark: true },
  { name: 'yellow', label: 'Yellow', primary: '#FFD700', secondary: '#FFFDE7', isDark: false },
  { name: 'orange', label: 'Orange', primary: '#FF6B35', secondary: '#FFE0B2', isDark: false },
  { name: 'boldContrast', label: 'Bold Contrast', primary: '#003366', secondary: '#FF0000', isDark: true }
];

// Default fallback colors in order
const defaultColors = ['#FFD700', '#288cfa', '#003366', '#91cc75', '#5470c6'];

const PROFIT_KPIS = [
  { label: 'Net Profit', rowIndex: 54 },
  { label: 'EBIT', rowIndex: 'calculated', isEBIT: true },
  { label: 'EBITDA', rowIndex: 56 },
];
const textColors = ['#fff', '#fff', '#fff', '#fff', '#333'];

// Smart variance calculation with Vs Bgt logic
function calcVariance(current, prev, currentType, prevType) {
  const isCurrentActual = (currentType || '').toLowerCase() === 'actual';
  const isPrevActual = (prevType || '').toLowerCase() === 'actual';
  const isCurrentReference = ['budget', 'estimate', 'forecast'].includes((currentType || '').toLowerCase());
  const isPrevReference = ['budget', 'estimate', 'forecast'].includes((prevType || '').toLowerCase());
  
  let actualValue, referenceValue;
  
  if (isCurrentActual && isPrevReference) {
    actualValue = current;
    referenceValue = prev;
  } else if (isPrevActual && isCurrentReference) {
    actualValue = prev;
    referenceValue = current;
  } else {
    actualValue = current;
    referenceValue = prev;
  }
  
  if (referenceValue === 0) return null;
  return ((actualValue - referenceValue) / Math.abs(referenceValue)) * 100;
}

const Profitchart = ({ tableData, selectedPeriods, computeCellValue, style, hideHeader = false }) => {
  if (!selectedPeriods || selectedPeriods.length === 0 || typeof computeCellValue !== 'function') {
    return (
      <div className="profit-trend-container trend-no-data">
        <h2 className="trend-heading">Profit Trend</h2>
        <p>No data available. Please select a period.</p>
      </div>
    );
  }

  const periodsToUse = selectedPeriods.slice(0, 5);

  const processedData = selectedPeriods.map(period => {
    // Sales row calculation
    const sales = computeCellValue(3, period);

    const profitAfterSG = computeCellValue(18, period);
    const financeCost = computeCellValue(20, period);
    const otherIncome = computeCellValue(19, period);
    const netProfit = profitAfterSG - financeCost + otherIncome;

    return {
      sales,
      profitAfterSG,
      financeCost,
      otherIncome,
      netProfit,
      periodName: `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`.trim(),
      period
    };
  });

  return (
    <div className="profit-trend-container" style={style || {}}>
      {PROFIT_KPIS.map((kpi, rowIdx) => {
        // Build cards for this KPI
        const cards = periodsToUse.map((period, idx) => {
          let value;
          if (kpi.isEBIT) {
            // Calculate EBIT as Net Profit + Bank Interest (Row 54 + Row 42)
            const netProfit = computeCellValue(54, period);
            const bankInterest = computeCellValue(42, period);
            value = (typeof netProfit === 'number' ? netProfit : 0) + (typeof bankInterest === 'number' ? bankInterest : 0);
          } else {
            value = computeCellValue(kpi.rowIndex, period);
          }
          
          const sales = computeCellValue(3, period);
          const salesVolume = computeCellValue(7, period);
          const percentOfSales = (typeof sales === 'number' && sales !== 0) ? (value / sales) * 100 : 0;
          const perKg = (typeof salesVolume === 'number' && salesVolume !== 0) ? value / salesVolume : 0;
          
          // Use period-based colors (same logic as other components)
          let color;
          if (period.customColor) {
            const scheme = colorSchemes.find(s => s.name === period.customColor);
            if (scheme) {
              color = scheme.primary;
            }
          } else {
            // Default color assignment based on month/type (same as tables)
            if (period.month === 'Q1' || period.month === 'Q2' || period.month === 'Q3' || period.month === 'Q4') {
              color = '#FF6B35'; // Orange (light red)
            } else if (period.month === 'January') {
              color = '#FFD700'; // Yellow
            } else if (period.month === 'Year') {
              color = '#288cfa'; // Blue
            } else if (period.type === 'Budget') {
              color = '#2E865F'; // Green
            } else {
              color = defaultColors[idx % defaultColors.length];
            }
          }
          
          return {
            periodName: `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`.trim(),
            value: typeof value === 'number' && !isNaN(value) ? value : 0,
            percentOfSales: percentOfSales,
            perKg: perKg,
            color: color,
            textColor: color === '#FFD700' ? '#333' : '#fff', // Dark text for yellow, white for others
            periodType: period.type, // Store period type for variance calculation
          };
        });
        // Calculate variances between cards with smart Vs Bgt logic
        const variances = cards.map((card, idx) => {
          if (idx === 0) return null;
          return calcVariance(card.value, cards[idx - 1].value, card.periodType, cards[idx - 1].periodType);
        });
        return (
          <div key={kpi.label} className={rowIdx < PROFIT_KPIS.length - 1 ? 'trend-kpi-section' : ''}>
            {/* Always show KPI title */}
            <h3 className="trend-kpi-title">{kpi.label}</h3>

            <div className="trend-cards-row profit-row">
              {cards.map((card, idx) => (
                <React.Fragment key={card.periodName}>
                  {/* Card */}
                  <div 
                    className="trend-card"
                    style={{
                      backgroundColor: card.color,
                      borderColor: card.color,
                      color: card.textColor,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-5px) scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0) scale(1)';
                      e.currentTarget.style.boxShadow = '0 2px 6px rgba(0,0,0,0.07)';
                    }}>
                    <div className="trend-card-title" style={{ color: card.textColor }}>{card.periodName}</div>
                    <div className="trend-card-value" style={{ color: card.textColor }}>
                      <CurrencySymbol style={{ color: card.textColor, fontSize: 22 }} />
                      {card.value ? (card.value / 1000000).toFixed(2) + 'M' : '0.00M'}
                    </div>
                    <div className="trend-card-metrics" style={{ color: card.textColor }}>
                      <div>{card.percentOfSales.toFixed(1)}%/Sls</div>
                      <div>
                        <CurrencySymbol style={{ color: card.textColor, fontSize: 12 }} />
                        {card.perKg.toFixed(1)}/kg
                      </div>
                    </div>
                  </div>
                  {/* Variance badge between cards */}
                  {idx < cards.length - 1 && (
                    <div className="trend-connector">
                      {variances[idx + 1] === null || isNaN(variances[idx + 1]) ? (
                        <span className="trend-variance-na"></span>
                      ) : (
                        <>
                          <span className={`trend-variance-arrow ${variances[idx + 1] > 0 ? 'trend-variance-positive' : variances[idx + 1] < 0 ? 'trend-variance-negative' : 'trend-variance-neutral'}`}>
                            {variances[idx + 1] > 0 ? '▲' : variances[idx + 1] < 0 ? '▼' : '–'}
                          </span>
                          <span className={`trend-variance-value ${variances[idx + 1] > 0 ? 'trend-variance-positive' : variances[idx + 1] < 0 ? 'trend-variance-negative' : 'trend-variance-neutral'}`}>
                            {Math.abs(variances[idx + 1]).toFixed(1)}
                          </span>
                          <span className={`trend-variance-percent ${variances[idx + 1] > 0 ? 'trend-variance-positive' : variances[idx + 1] < 0 ? 'trend-variance-negative' : 'trend-variance-neutral'}`}>
                            %
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Profitchart; 