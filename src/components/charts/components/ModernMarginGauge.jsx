import React, { useState, useEffect } from 'react';
import CurrencySymbol from '../../dashboard/CurrencySymbol';
import { getColumnColorPalette } from '../../dashboard/utils/colorUtils';
import './ModernMarginGauge.css';


// Default fallback colors in order (only used if column palette fails)
const defaultColors = ['#FFD700', '#288cfa', '#003366', '#91cc75', '#5470c6'];

// Single Gauge Component
const SingleGauge = ({ value, absoluteValue, perKgValue, title, color = '#288cfa', gradientFrom, gradientTo, index }) => {
  // Default color fallback in case color is undefined
  const safeColor = color || '#288cfa';
  const safeGradientFrom = gradientFrom || safeColor;
  const safeGradientTo = gradientTo || safeColor;

  // Calculate the angle for the needle
  const needleAngle = -120 + (value / 100) * 240;
  const progressOffset = 418 - (value / 100) * 418;
  
  // Calculate the tip of the needle
  const angleRad = (Math.PI / 180) * needleAngle;
  const tipX = 100 + 70 * Math.sin(angleRad); // 70 is the needle length
  const tipY = 120 - 70 * Math.cos(angleRad); // SVG y axis is down, moved center to y=120
  const PERCENT_OFFSET = 45; // Increased from 32 to 45 for more space from arc
  const percentY = tipY - PERCENT_OFFSET;
  
  // Log the exact values for debugging
  if (process.env.NODE_ENV === 'development') {
  }
  
  return (
    <div className="modern-gauge-card">
      <div className="gauge-body">
        {/* Gauge visualization with percentage at needle tip */}
        <div className="gauge-container">
          {/* SVG Gauge with Arc, Needle, and Percentage */}
          <svg viewBox="0 0 200 140" className="gauge-svg">
            {/* Define gradient for arc */}
            <defs>
              <linearGradient id={`gaugeGradient${index}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor={safeGradientFrom} />
                <stop offset="100%" stopColor={safeGradientTo} />
              </linearGradient>
            </defs>
            {/* Arc background */}
            <path
              d="M20,120 A80,80 0 0,1 180,120"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="18"
              strokeLinecap="round"
              className="gauge-track"
            />
            {/* Arc progress with gradient */}
            <path
              d="M20,120 A80,80 0 0,1 180,120"
              fill="none"
              stroke={`url(#gaugeGradient${index})`}
              strokeWidth="18"
              strokeLinecap="round"
              strokeDasharray="418"
              strokeDashoffset={progressOffset}
              className="gauge-progress"
            />
            {/* Needle */}
            <g transform={`rotate(${needleAngle} 100 120)`}>
              <line
                x1="100"
                y1="120"
                x2="100"
                y2="50"
                stroke="#333"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <circle cx="100" cy="120" r="8" fill="#fff" stroke="#333" strokeWidth="4" />
            </g>
            {/* Percentage value at the tip with %/Sales format */}
            <text
              x={tipX}
              y={percentY}
              textAnchor="middle"
              fontSize="18"
              fontWeight="bold"
              fill={safeGradientTo}
              style={{ userSelect: 'none' }}
            >
              {value.toFixed(2)} %/Sls
            </text>
          </svg>
        </div>
        
        {/* Absolute value as main display */}
        <div className="gauge-absolute" style={{ fontSize: 28, fontWeight: 'bold', color: safeGradientTo, marginBottom: 5 }}>
          <CurrencySymbol /> {absoluteValue}
        </div>

        {/* Per kg value with correct format: Đ xx.xx per kg */}
        <div className="gauge-perkg" style={{ fontSize: 16, fontWeight: 'bold', color: safeGradientTo, marginBottom: 5 }}>
          <CurrencySymbol /> {perKgValue} per kg
        </div>
      </div>
      
      {/* Title bar with gradient */}
      <div
        className="gauge-title"
        style={{
          background: `linear-gradient(135deg, ${safeGradientFrom}, ${safeGradientTo})`,
          color: '#fff',
          borderColor: safeGradientTo,
          fontSize: 20,
          fontWeight: 'bold',
          letterSpacing: 0.5
        }}
      >
        <span>
          {(() => {
            const words = title.split(' ');
            if (words.length > 1) {
              const lastWord = words[words.length - 1];
              const firstPart = words.slice(0, -1).join(' ');
              return (
                <React.Fragment>
                  {firstPart}
                  <br />
                  {lastWord}
                </React.Fragment>
              );
            }
            return title;
          })()}
        </span>
      </div>
    </div>
  );
};

// ModernMarginGauge - Main Component
const ModernMarginGauge = ({ data, periods, basePeriod, style, hideHeader = false }) => {

  // Responsive behavior for live view (also affects exported HTML capture)
  // Goal: never squeeze all gauges into ultra-thin columns on small screens.
  const [viewport, setViewport] = useState({
    width: typeof window !== 'undefined' ? (window.innerWidth || 1200) : 1200,
    height: typeof window !== 'undefined' ? (window.innerHeight || 800) : 800
  });

  useEffect(() => {
    const update = () => setViewport({
      width: window.innerWidth || 1200,
      height: window.innerHeight || 800
    });
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  const isPortrait = viewport.height >= viewport.width;
  const isMobileOrTablet = viewport.width <= 1024;
  const stackVertically = isMobileOrTablet && isPortrait;
  const wrapHorizontally = isMobileOrTablet && !isPortrait;

  if (process.env.NODE_ENV === 'development') {
  }

  // Process data for gauges
  const gaugeData = periods.map((period, index) => {
    // FIXED: Use consistent key generation with ChartContainer
    let periodKey;
    if (period.isCustomRange) {
      periodKey = `${period.year}-${period.month}-${period.type}`;
    } else {
      periodKey = `${period.year}-${period.month || 'Year'}-${period.type}`;
    }
    
    const chartData = data[periodKey] || {};
    
    // Get raw data values
    const sales = chartData.sales || 0;
    const materialCost = chartData.materialCost || 0;
    const salesVolume = chartData.salesVolume || 0;
    
    // Calculate absolute margin (Sales - Material Cost)
    const absoluteMargin = sales - materialCost;
    
    // Calculate margin per kg
    const marginPerKg = salesVolume > 0 ? absoluteMargin / salesVolume : 0;
    
    // Calculate margin as percentage of sales for gauge needle
    const marginPercent = sales > 0 ? (absoluteMargin / sales) * 100 : 0;
    
    // Format absolute value for display (in millions)
    const absoluteValue = `${(absoluteMargin / 1000000).toFixed(1)}M`;
    
    // Format per kg value for display (xx.xx format)
    const perKgValue = marginPerKg.toFixed(2);
    
    // Use centralized color palette utility for consistent colors
    const palette = getColumnColorPalette(period);
    const color = palette.primary;
    const gradientFrom = palette.gradientFrom;
    const gradientTo = palette.gradientTo;
    
    return {
      index,
      value: Math.max(0, Math.min(100, marginPercent)), // Clamp between 0-100 for gauge
      absoluteValue,
      perKgValue,
      color,
      gradientFrom,
      gradientTo,
      period,
      sales,
      materialCost,
      salesVolume,
      absRaw: absoluteMargin, // For variance calculations
      marginPercent: marginPercent, // Store the margin % for relative variance calculation
      title: `${period.year} ${period.isCustomRange ? period.displayName : (period.month || '')} ${period.type}`,
      periodKey
    };
  });

  // Helper function to create period key (same as in gaugeData processing)
  const createPeriodKey = (period) => {
    if (period.isCustomRange) {
      return `${period.year}-${period.month}-${period.type}`;
    } else {
      return `${period.year}-${period.month || 'Year'}-${period.type}`;
    }
  };

  // Find base period index using the same key format
  const basePeriodObj = periods.find(p => createPeriodKey(p) === basePeriod);
  const baseIndex = basePeriodObj ? gaugeData.findIndex(g => g.periodKey === createPeriodKey(basePeriodObj)) : -1;
  const baseGauge = baseIndex >= 0 ? gaugeData[baseIndex] : null;
  const baseMarginPercent = baseGauge ? baseGauge.marginPercent : 0;
  
  // Debug logging
  if (process.env.NODE_ENV === 'development') {
  }
  
  // Calculate variances with smart Vs Bgt/Vs Est logic
  // When comparing Actual to Budget/Estimate, always use Budget/Estimate as denominator
  const variances = gaugeData.map((g, idx) => {
    if (idx === 0) return null; // First period has no previous period to compare
    const prevGauge = gaugeData[idx - 1];
    
    const currentType = (g.period?.type || '').toLowerCase();
    const prevType = (prevGauge.period?.type || '').toLowerCase();
    
    // Determine which value is Actual and which is Reference (Budget/Estimate/Forecast)
    let actualValue, referenceValue;
    const isCurrentActual = currentType === 'actual';
    const isPrevActual = prevType === 'actual';
    const isCurrentReference = ['budget', 'estimate', 'forecast'].includes(currentType);
    const isPrevReference = ['budget', 'estimate', 'forecast'].includes(prevType);
    
    if (isCurrentActual && isPrevReference) {
      // Current is Actual, Previous is Budget/Estimate - use Vs Bgt formula
      actualValue = g.marginPercent;
      referenceValue = prevGauge.marginPercent;
    } else if (isPrevActual && isCurrentReference) {
      // Previous is Actual, Current is Budget/Estimate - use Vs Bgt formula (swapped)
      actualValue = prevGauge.marginPercent;
      referenceValue = g.marginPercent;
    } else {
      // YoY or other: standard sequential formula
      actualValue = g.marginPercent;
      referenceValue = prevGauge.marginPercent;
    }
    
    if (referenceValue === 0) return null;
    const variance = ((actualValue - referenceValue) / Math.abs(referenceValue)) * 100;
    
    // Debug logging
    if (process.env.NODE_ENV === 'development') {
    }
    
    return variance;
  });

  // Generate dynamic variance description based on period comparison types
  const getVarianceDescription = () => {
    if (gaugeData.length <= 1) return '';

    let hasYoY = false;
    let hasActualVsReference = false;
    let hasOtherComparisons = false;

    gaugeData.forEach((g, idx) => {
      if (idx === 0) return; // Skip first period
      const prevGauge = gaugeData[idx - 1];
      const currentType = (g.period?.type || '').toLowerCase();
      const prevType = (prevGauge.period?.type || '').toLowerCase();

      if (currentType === 'actual' && prevType === 'actual') {
        hasYoY = true;
      } else if (currentType === 'actual' || prevType === 'actual') {
        hasActualVsReference = true;
      } else {
        hasOtherComparisons = true;
      }
    });

    const descriptions = [];
    if (hasActualVsReference) {
      descriptions.push('Δ% = (Actual − Reference) / Reference × 100, where Reference is Budget/Estimate/Forecast');
    }
    if (hasYoY) {
      descriptions.push('YoY Δ% = (Current Actual − Previous Actual) / Previous Actual × 100');
    }
    if (hasOtherComparisons && !hasActualVsReference && !hasYoY) {
      descriptions.push('% variance based on sequential period comparison (current vs previous period)');
    }

    return descriptions.join(' | ');
  };

  const varianceDescription = getVarianceDescription();

  return (
    <div className="modern-margin-gauge-panel" style={{ 
      marginTop: 30, 
      padding: '20px',
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
      width: '100%',
      maxWidth: '1200px',
      marginLeft: 'auto',
      marginRight: 'auto',
      boxSizing: 'border-box',
      ...(style || {}) // Apply any style props passed from parent component
    }}>
      {!hideHeader && (
        <>
          <h2 className="modern-gauge-heading" style={{ textAlign: 'center', marginBottom: '10px' }}>Margin over Material</h2>
          {varianceDescription && (
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
              <span style={{ fontSize: 14, fontWeight: 'normal', color: '#666', fontStyle: 'italic' }}>
                {varianceDescription}
              </span>
            </div>
          )}
        </>
      )}
      <div className="modern-gauge-container" style={{
        display: 'flex',
        flexDirection: stackVertically ? 'column' : 'row',
        flexWrap: wrapHorizontally ? 'wrap' : 'nowrap',
        justifyContent: 'center',
        alignItems: stackVertically ? 'stretch' : 'flex-end',
        gap: stackVertically ? 12 : 15,
        width: '100%',
        margin: '0 auto',
        padding: stackVertically ? '0' : '0 20px',
        boxSizing: 'border-box'
      }}>
        {gaugeData.map((gauge, idx) => {
          // This variance belongs to THIS gauge compared to previous one.
          const variance = idx === 0 ? null : variances[idx];
          let badgeColor = '#888', arrow = '–';
          if (variance !== null && !isNaN(variance)) {
            if (variance > 0) { badgeColor = '#2E865F'; arrow = '▲'; }
            else if (variance < 0) { badgeColor = '#cf1322'; arrow = '▼'; }
          }

          const connector = idx === 0 ? null : (
            <div style={{
              alignSelf: 'center',
              margin: stackVertically ? '10px 0' : '0 2px',
              display: 'flex',
              flexDirection: stackVertically ? 'row' : 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: stackVertically ? 'auto' : 40,
              width: stackVertically ? 'auto' : 40,
              height: stackVertically ? 'auto' : 60,
              gap: stackVertically ? 8 : 0,
              fontWeight: 'bold',
              color: variance === null || isNaN(variance) ? '#888' : badgeColor
            }}>
              {variance === null || isNaN(variance) ? (
                <span style={{ fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>0%</span>
              ) : (
                <>
                  <span style={{ fontSize: 22, fontWeight: 'bold', lineHeight: 1 }}>{arrow}</span>
                  <span style={{ fontSize: 18, fontWeight: 'bold', lineHeight: 1.1 }}>{Math.abs(variance).toFixed(1)}</span>
                  <span style={{ fontSize: 16, fontWeight: 'bold', lineHeight: 1.1 }}>%</span>
                </>
              )}
            </div>
          );

          // In stacked portrait, show connector ABOVE each gauge (except first)
          if (stackVertically) {
            return (
              <React.Fragment key={gauge.title}>
                {connector}
                <div style={{ width: '100%', maxWidth: 520, margin: '0 auto' }}>
                  <SingleGauge
                    value={gauge.value}
                    absoluteValue={gauge.absoluteValue}
                    perKgValue={gauge.perKgValue}
                    title={gauge.title}
                    color={gauge.color}
                    gradientFrom={gauge.gradientFrom}
                    gradientTo={gauge.gradientTo}
                    index={idx}
                  />
                </div>
              </React.Fragment>
            );
          }

          // In horizontal layouts, keep connector between gauges (after previous)
          return (
            <React.Fragment key={gauge.title}>
              {idx > 0 ? connector : null}
              <SingleGauge
                value={gauge.value}
                absoluteValue={gauge.absoluteValue}
                perKgValue={gauge.perKgValue}
                title={gauge.title}
                color={gauge.color}
                gradientFrom={gauge.gradientFrom}
                gradientTo={gauge.gradientTo}
                index={idx}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export default ModernMarginGauge;