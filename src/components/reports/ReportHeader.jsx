import React from 'react';

const ReportHeader = ({ rep, basePeriod, prevPeriod, nextPeriod, toProperCase }) => {
  // Helper to format custom range display names
  const formatCustomRangeDisplay = (displayName) => {
    if (!displayName) return '';
    
    // Remove "CUSTOM_" prefix if present
    let cleanName = displayName.replace(/^CUSTOM_/i, '');
    
    // Split by underscore and get month names
    const parts = cleanName.split('_');
    
    // If it's a simple month list, create abbreviated range
    if (parts.length > 2 && parts.every(p => /^(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$/i.test(p))) {
      const monthAbbr = {
        'JANUARY': 'Jan', 'FEBRUARY': 'Feb', 'MARCH': 'Mar', 'APRIL': 'Apr',
        'MAY': 'May', 'JUNE': 'Jun', 'JULY': 'Jul', 'AUGUST': 'Aug',
        'SEPTEMBER': 'Sep', 'OCTOBER': 'Oct', 'NOVEMBER': 'Nov', 'DECEMBER': 'Dec'
      };
      
      const firstMonth = monthAbbr[parts[0].toUpperCase()] || parts[0];
      const lastMonth = monthAbbr[parts[parts.length - 1].toUpperCase()] || parts[parts.length - 1];
      
      return `${firstMonth}-${lastMonth}`;
    }
    
    // Otherwise, just return cleaned up version
    return cleanName.replace(/_/g, ' ');
  };

  const getPeriodLabel = (period) => {
    if (!period) return { year: '', periodType: '', typeAbbr: '' };
    
    let periodType;
    if (period.isCustomRange) {
      // Format custom range display names nicely
      periodType = formatCustomRangeDisplay(period.displayName);
    } else {
      periodType = period.month;
    }
    
    // Format type abbreviation
    const typeAbbr = period.type ? 
      (period.type.toLowerCase() === 'actual' ? 'Act.' :
       period.type.toLowerCase() === 'estimate' ? 'Est.' :
       period.type.toLowerCase() === 'budget' ? 'Bud.' :
       period.type.toLowerCase() === 'forecast' ? 'Fcst.' :
       period.type) : '';
    
    return {
      year: period.year,
      periodType: periodType,
      typeAbbr: typeAbbr,
      prevPeriod: period.prevPeriod,
      nextPeriod: period.nextPeriod
    };
  };

  const formatPeriodLabel = (period) => {
    if (!period) return '';
    if (typeof period === 'string') return period;
    if (typeof period === 'object' && period.year && period.month) {
      // Format type abbreviation
      const typeAbbr = period.type ? 
        (period.type.toLowerCase() === 'actual' ? 'Act.' :
         period.type.toLowerCase() === 'estimate' ? 'Est.' :
         period.type.toLowerCase() === 'budget' ? 'Bud.' :
         period.type.toLowerCase() === 'forecast' ? 'Fcst.' :
         period.type) : '';
      
      // Handle custom ranges
      if (period.isCustomRange && period.displayName) {
        const formattedRange = formatCustomRangeDisplay(period.displayName);
        return `${period.year} ${formattedRange} ${typeAbbr}`.trim();
      }
      
      // Capitalize period types like HY1, HY2, Q1, Q2, etc.
      const formattedMonth = period.month.toUpperCase();
      return `${formattedMonth} ${period.year} ${typeAbbr}`.trim();
    }
    return '';
  };

  const formatPeriodForDescription = (period, isBudget = false) => {
    if (!period) return '';
    
    if (typeof period === 'object' && period.year && period.month) {
      // Format type abbreviation - use the actual period type, not hardcoded
      const typeAbbr = period.type ? 
        (period.type.toLowerCase() === 'actual' ? 'Act.' :
         period.type.toLowerCase() === 'estimate' ? 'Est.' :
         period.type.toLowerCase() === 'budget' ? 'Bud.' :
         period.type.toLowerCase() === 'forecast' ? 'Fcst.' :
         period.type) : 'Act.';
      
      // Handle custom ranges
      let periodLabel;
      if (period.isCustomRange && period.displayName) {
        periodLabel = formatCustomRangeDisplay(period.displayName);
      } else {
        // Capitalize period types like HY1, HY2, Q1, Q2, etc.
        periodLabel = period.month.toUpperCase();
      }
      
      if (isBudget) {
        // For budget comparison, formatPeriodLabel already includes "Budget" from the period object
        return formatPeriodLabel(period);
      } else {
        // For previous year comparison, use same type (e.g., if current is Est., previous is Est. not Actual)
        // This ensures consistency: if comparing "2025 Est", compare to "2024 Est" not "2024 Act"
        const prevYear = parseInt(period.year) - 1;
        return `${prevYear} ${periodLabel} ${typeAbbr}`.trim();
      }
    }
    
    return '';
  };

  const periodInfo = getPeriodLabel(basePeriod);
  const currentPeriod = formatPeriodLabel(basePeriod);
  // Use the actual previous period (base-1) for actual-to-actual comparison
  const previousYearPeriod = prevPeriod ? formatPeriodLabel(prevPeriod) : formatPeriodForDescription(basePeriod);
  // Use the actual next period (base+1) for actual-to-budget comparison
  const budgetPeriod = nextPeriod ? formatPeriodLabel(nextPeriod) : formatPeriodForDescription(basePeriod, true);
  
  // Extract the type label from currentPeriod (it's the last word like "Act.", "Est.", etc.)
  const periodTypeLabel = basePeriod.type ? 
    (basePeriod.type.toLowerCase() === 'actual' ? 'actual' :
     basePeriod.type.toLowerCase() === 'estimate' ? 'estimated' :
     basePeriod.type.toLowerCase() === 'budget' ? 'budgeted' :
     basePeriod.type.toLowerCase() === 'forecast' ? 'forecasted' :
     basePeriod.type.toLowerCase()) : 'actual';
  
  const description = `This report analyzes ${periodTypeLabel} ${currentPeriod} sales & volume performance versus ${previousYearPeriod} and against ${budgetPeriod} targets.`;

  return (
    <div className="report-header">
      <div className="header-content">
        <h1>SALES & VOLUME PERFORMANCE REPORT</h1>
        <h2>{toProperCase(rep)}</h2>
        <div className="report-period">
          <div className="period-year">{periodInfo.year}</div>
          <div className="period-type" style={{
            fontSize: '1.2em',
            fontWeight: '600',
            letterSpacing: '1px',
            textShadow: '1px 1px 2px rgba(0,0,0,0.3)',
            marginBottom: '15px'
          }}>
            {periodInfo.periodType} {periodInfo.typeAbbr}
          </div>
          <div className="period-description">{description}</div>
        </div>
      </div>
    </div>
  );
};

export default ReportHeader;
