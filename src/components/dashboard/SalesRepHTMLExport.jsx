import React, { useState } from 'react';
import { useFilter } from '../../contexts/FilterContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { KPI_CSS_CONTENT } from '../../utils/sharedStyles';
import { 
  getDeltaLabel as sharedGetDeltaLabel, 
  calculateDelta as sharedCalculateDelta,
  buildExtendedColumns as sharedBuildExtendedColumns,
  formatMT as sharedFormatMT,
  formatCurrencyShort as sharedFormatCurrency,
  toProperCase as sharedToProperCase
} from '../../utils/tableCalculations';
import ipTransparentLogo from '../../assets/IP transparent-.jpg';

// Helper function to get UAE Dirham symbol SVG for HTML strings (standalone)
const getUAEDirhamSymbolHTML = () => {
  return '<svg class="uae-dirham-symbol" viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="display: inline-block; vertical-align: -0.125em; width: 0.95em; height: 0.95em; margin-right: 0.15em; flex-shrink: 0;"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>';
};

// Helper function to get currency symbol HTML for exports (supports dynamic currency)
// Takes currency object as parameter - must be passed from component
const getCurrencySymbolHTML = (currency) => {
  if (!currency || currency.code === 'AED') {
    return getUAEDirhamSymbolHTML();
  }
  // For other currencies, return a styled span that matches the sizing
  return `<span class="currency-symbol" style="display: inline-block; vertical-align: -0.05em; margin-right: 0.15em; font-size: 1em; line-height: 1; font-weight: 600;">${currency.symbol || currency.code}</span>`;
};

const SalesRepHTMLExport = ({ 
  rep = null, 
  reportType = 'individual', // 'individual', 'tables', 'divisional'
  reportData = null,
  kgsData = null,
  amountData = null,
  customerData = null,
  customerAmountData = null, // Customer data by amount for currency sales table
  performanceMetrics = null,
  salesReps = null,
  salesRepData = null,
  selectedDivision = 'FP',
  strategicFindings = null,
  customerFindings = null,
  yearlyBudgetTotal = 0,
  yearlySalesBudgetTotal = 0,
  yearlyBudgetAchievement = 0,
  yearlySalesBudgetAchievement = 0,
  customerInsights = {
    topCustomerShare: 0,
    top3CustomerShare: 0,
    top5CustomerShare: 0,
    totalCustomers: 0,
    customerGrowth: 0,
    newCustomers: [],
    topCustomers: [],
    avgVolumePerCustomer: 0
  }
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const { 
    columnOrder, 
    basePeriodIndex,
    dataGenerated
  } = useFilter();
  const { companyCurrency } = useCurrency();
  
  // CRITICAL FIX: Capture LIVE table data from the actual rendered tables
  // This ensures export matches exactly what the user sees
  const [liveCustomerKgsData, setLiveCustomerKgsData] = useState(null);
  const [liveCustomerAmountData, setLiveCustomerAmountData] = useState(null);
  
  // Listen to events from live tables to capture their actual data
  React.useEffect(() => {
    const handleCustomerKgsData = (event) => {
      console.log('📊 EXPORT - Captured LIVE Customer KGS data:', {
        rowCount: event.detail?.rows?.length,
        sampleRows: event.detail?.rows?.slice(0, 3).map(r => ({
          name: r.name || r.customerName,
          rawValues: r.rawValues
        }))
      });
      setLiveCustomerKgsData(event.detail?.rows || []);
    };
    
    const handleCustomerAmountData = (event) => {
      console.log('💰 EXPORT - Captured LIVE Customer Amount data:', {
        rowCount: event.detail?.rows?.length,
        sampleRows: event.detail?.rows?.slice(0, 3).map(r => ({
          name: r.name || r.customerName,
          rawValues: r.rawValues
        }))
      });
      setLiveCustomerAmountData(event.detail?.rows || []);
    };
    
    window.addEventListener('customersKgsTable:dataReady', handleCustomerKgsData);
    window.addEventListener('customersAmountTable:dataReady', handleCustomerAmountData);
    
    return () => {
      window.removeEventListener('customersKgsTable:dataReady', handleCustomerKgsData);
      window.removeEventListener('customersAmountTable:dataReady', handleCustomerAmountData);
    };
  }, []);

  // Debug: Log props on each render

  // Generate division name
  const divisionName = selectedDivision || 'Division';

  // Helper function to convert text to proper case
  const toProperCase = (str) => {
    if (!str) return '';
    return str.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  // Helper to format custom range display names (matching ReportHeader.js)
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

  // Format period label
  const formatPeriodLabel = (period) => {
    if (!period) return 'Current Period';
    if (typeof period === 'string') {
      return period.replace(/\b(hy[12]|q[1-4]|h[12])\b/gi, (match) => match.toUpperCase());
    }
    if (typeof period === 'object' && period.year && period.month) {
      // Handle custom ranges
      if (period.isCustomRange && period.displayName) {
        const formattedRange = formatCustomRangeDisplay(period.displayName);
        return `${formattedRange} ${period.year}`;
      }
      
      const formattedMonth = period.month.toUpperCase();
      return `${formattedMonth} ${period.year}`;
    }
    return 'Current Period';
  };

  // Format numbers for display
  const formatNumber = (num, isCurrency = false) => {
    let formatted;
    if (num >= 1000000) {
      formatted = (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      formatted = Math.round(num / 1000) + 'K';
    } else {
      formatted = Math.round(num || 0).toLocaleString();
    }
    
    if (isCurrency) {
      return `${getCurrencySymbolHTML(companyCurrency)}${formatted}`;
    }
    return formatted;
  };

  // Format MT values (convert from kg to MT) with no decimals
  const formatMT = (value) => {
    const numericValue = typeof value === 'number' ? value : parseFloat(value || 0);
    const mtValue = isNaN(numericValue) ? 0 : numericValue / 1000;
    return Math.round(mtValue).toLocaleString('en-US');
  };

  // Generate Customer Insights HTML using pre-calculated values
  const generateCustomerInsights = (customerData, basePeriodIndex, reportData) => {
    if (!customerInsights || customerInsights.totalCustomers === 0) return '';
    
    // Use pre-calculated values from CustomerKeyFacts
    const top5Percentage = customerInsights.top5CustomerShare;
    const totalCustomers = customerInsights.totalCustomers;
    const customerGrowth = customerInsights.customerGrowth;
    const newCustomers = customerInsights.newCustomers || [];
    const topCustomers = customerInsights.topCustomers || [];
    
    // Get top 5 customers with their individual percentages
    const top5Customers = topCustomers.slice(0, 5);
    
    // Use pre-calculated average volume per customer
    const avgVolumePerCustomer = customerInsights.avgVolumePerCustomer || 0;
    
    // Helper function to properly case customer names
    const toProperCase = (str) => {
      if (!str) return '';
      return str.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };
    
    return `
      <div class="report-section" style="border-top: 1px solid #eee; padding-top: 30px; margin-top: 30px;">
        <div class="customer-insights-header">
          <span class="insights-icon">👥</span>
          <h3 style="color: #667eea; font-size: 1.4em; margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">CUSTOMER INSIGHTS</h3>
        </div>
        
        <div class="customer-insights-grid">
          <!-- Left: Top 5 Customers -->
          <div class="customer-insight-card-tall">
            <div class="insight-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 2px solid #e9ecef;">
              <div class="insight-icon" style="font-size: 2.5em;">🏆</div>
              <div class="insight-title" style="font-weight: 600; font-size: 1em; text-transform: uppercase; letter-spacing: 0.5px;">TOP 5 CUSTOMERS</div>
            </div>
            <div class="top5-list">
              ${top5Customers.map(c => `
                <div class="top5-item">
                  <span class="customer-name">${toProperCase(c.customerName || c.name)}</span>
                  <span class="customer-percentage">${c.percentage ? c.percentage.toFixed(1) : '0.0'}%</span>
                </div>
              `).join('')}
            </div>
            <div class="insight-footer" style="font-size: 0.8em; color: #888; font-weight: 400; margin-top: 12px;">of total sales</div>
          </div>

          <!-- Right Top: Total Customers -->
          <div class="customer-insight-card-small">
            <div class="insight-icon" style="font-size: 2.5em; margin-bottom: 12px;">👥</div>
            <div class="insight-title" style="font-weight: 600; font-size: 1em; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">TOTAL CUSTOMERS</div>
            <div class="insight-value" style="font-size: 2.2em; font-weight: 700; color: #667eea; margin-bottom: 8px; line-height: 1.1;">${totalCustomers}</div>
            <div class="insight-subtitle" style="font-size: 0.9em; color: #666; font-weight: 500; margin-bottom: 8px; min-height: 20px;">
              ${customerGrowth !== 0 ? `<span style="color: ${customerGrowth >= 0 ? '#007bff' : '#dc3545'}; font-weight: 600;">${customerGrowth > 0 ? '▲' : '▼'} ${Math.abs(customerGrowth).toFixed(1)}% vs FY 2024</span>` : ''}
            </div>
            <div class="insight-footer" style="font-size: 0.8em; color: #888; font-weight: 400;">active customers</div>
          </div>

          <!-- Center: AVG Sales per Customer -->
          <div class="customer-insight-card-center">
            <div class="insight-icon" style="font-size: 2.5em; margin-bottom: 12px;">💰</div>
            <div class="insight-title" style="font-weight: 600; font-size: 1em; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">AVG SALES PER CUSTOMER</div>
            <div class="insight-value" style="font-size: 2.2em; font-weight: 700; color: #667eea; margin-bottom: 8px; line-height: 1.1;">${formatNumber(avgVolumePerCustomer, true)}</div>
            <div class="insight-footer" style="font-size: 0.8em; color: #888; font-weight: 400;">average value</div>
          </div>

          <!-- Right Bottom: New Customers -->
          <div class="customer-insight-card-small">
            <div class="insight-icon" style="font-size: 2.5em; margin-bottom: 12px;">🆕</div>
            <div class="insight-title" style="font-weight: 600; font-size: 1em; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">NEW CUSTOMERS</div>
            <div class="insight-value" style="font-size: 2.2em; font-weight: 700; color: #667eea; margin-bottom: 8px; line-height: 1.1;">${newCustomers.length}</div>
            <div class="insight-footer" style="font-size: 0.8em; color: #888; font-weight: 400;">new in FY 2025 vs FY 2024</div>
          </div>
        </div>
      </div>
    `;
  };

  // Generate Geographic Distribution HTML - Using REAL data from reportData
  const generateGeographicDistribution = (reportData, customerData, basePeriodIndex) => {
    if (!reportData) {
      return '';
    }
    
    // Use actual geographic distribution data from reportData (already calculated from API)
    const geoData = reportData.geographicDistribution;
    
    // Extract real data from the report, with fallbacks
    let localPercentage = 0;
    let exportPercentage = 0;
    let topRegions = [];
    
    if (geoData) {
      localPercentage = geoData.localPercentage || geoData.localSales || 0;
      exportPercentage = geoData.exportPercentage || geoData.exportSales || 0;
      topRegions = geoData.topRegions || [];
      
    } else {
      
      // Fallback: Try to calculate from customer data if available
      // This is a simple estimate - in production you'd want proper country data
      if (customerData && customerData.length > 0) {
        // Simple heuristic: most sales are local for this example
        localPercentage = 95.0;
        exportPercentage = 5.0;
        topRegions = [{
          name: 'Regional Export',
          percentage: 5.0,
          exportPercentage: 100.0
        }];
      } else {
        // No data at all - show placeholder
        localPercentage = 100.0;
        exportPercentage = 0.0;
        topRegions = [];
      }
    }
    
    // Helper function to get gradient color based on percentage
    const getGradientColor = (percentage) => {
      if (percentage >= 20) return '#1e40af';
      else if (percentage >= 15) return '#3b82f6';
      else if (percentage >= 10) return '#60a5fa';
      else if (percentage >= 5) return '#93c5fd';
      else return '#dbeafe';
    };
    
    // Always return the section, even with placeholder data
    return `
      <div class="report-section" style="border-top: 1px solid #eee; padding-top: 30px; margin-top: 30px;">
        <h3 style="color: #667eea; font-size: 1.4em; margin-bottom: 25px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; text-align: center; border-bottom: 2px solid #667eea; padding-bottom: 12px;">
          🌍 GEOGRAPHIC DISTRIBUTION
        </h3>
        
        <div style="text-align: center; margin-bottom: 25px; padding: 12px 20px; background: linear-gradient(135deg, #f8f9fa, #ffffff); border: 1px solid #e9ecef; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05)">
          <div style="font-size: 0.85em; color: #6c757d; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px">
            REPORTING PERIOD
          </div>
          <div style="font-size: 1.1em; color: #495057; font-weight: 600; font-family: system-ui, -apple-system, sans-serif">
            ${formatPeriodLabel(reportData.basePeriod)}
          </div>
        </div>
        
        <!-- Row 1: Local vs Export - Using kpi-cards structure -->
        <div class="kpi-cards" style="margin-bottom: 20px;">
          <div class="kpi-card large" style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.08); position: relative; overflow: hidden; min-height: 170px; display: flex; flex-direction: column; justify-content: space-between; grid-column: span 2;">
            <div style="content: ''; position: absolute; top: 0; left: 0; height: 100%; width: 4px; background: linear-gradient(to bottom, #667eea, #764ba2); border-radius: 0 2px 2px 0;"></div>
            <div style="width: 60px; height: 60px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: transparent;">
              <svg style="width: 100%; height: 100%;" viewBox="0 0 900 600" xmlns="http://www.w3.org/2000/svg">
                <rect width="900" height="200" fill="#00732f"/>
                <rect width="900" height="200" y="200" fill="#ffffff"/>
                <rect width="900" height="200" y="400" fill="#000000"/>
                <rect width="300" height="600" fill="#ff0000"/>
              </svg>
            </div>
            <div style="text-align: center; font-size: 1.3rem; font-weight: 700; color: #444b54; letter-spacing: 0.04em; margin-top: 0; margin-bottom: 12px;">UAE</div>
            <div style="text-align: center; font-size: 3.5rem; font-weight: 800; color: #1e293b; margin: 8px 0; line-height: 1; text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1); letter-spacing: -0.02em;">${localPercentage.toFixed(1)}%</div>
            <div style="text-align: center; font-size: 1rem; color: #64748b; font-weight: 500; margin-top: 2px;">of total sales</div>
                </div>
                
          <div class="kpi-card large" style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); border: 1px solid rgba(0, 0, 0, 0.08); position: relative; overflow: hidden; min-height: 170px; display: flex; flex-direction: column; justify-content: space-between; grid-column: span 2;">
            <div style="content: ''; position: absolute; top: 0; left: 0; height: 100%; width: 4px; background: linear-gradient(to bottom, #667eea, #764ba2); border-radius: 0 2px 2px 0;"></div>
            <div style="width: 60px; height: 60px; margin: 0 auto 12px; display: flex; align-items: center; justify-content: center;">
              <div style="font-size: 3rem;">🌍</div>
            </div>
            <div style="text-align: center; font-size: 1.3rem; font-weight: 700; color: #444b54; letter-spacing: 0.04em; margin-top: 0; margin-bottom: 12px;">Export</div>
            <div style="text-align: center; font-size: 3.5rem; font-weight: 800; color: #1e293b; margin: 8px 0; line-height: 1; text-shadow: 2px 2px 8px rgba(0, 0, 0, 0.1); letter-spacing: -0.02em;">${exportPercentage.toFixed(1)}%</div>
            <div style="text-align: center; font-size: 1rem; color: #64748b; font-weight: 500; margin-top: 2px;">of total sales</div>
                </div>
              </div>
              
        ${topRegions && topRegions.length > 0 ? `
          <!-- Export connector -->
          <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: flex-start; height: 40px; margin: 10px 0 15px 0; padding-right: 25%; position: relative;">
            <div style="width: 0; height: 0; border-left: 10px solid transparent; border-right: 10px solid transparent; border-top: 12px solid #6b7280;"></div>
            <div style="position: absolute; top: 20px; left: 0; right: 0; height: 3px; background: #6b7280; box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.4);">
              <div style="content: ''; position: absolute; left: 0; top: 0; width: 3px; height: 15px; background: #6b7280; box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.4);"></div>
              <div style="content: ''; position: absolute; right: 0; top: 0; width: 3px; height: 15px; background: #6b7280; box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.4);"></div>
                    </div>
                </div>
          
          <!-- Row 2: Export Regions -->
          <div class="kpi-cards export-regions">
            ${topRegions.map(region => {
              const gradientColor = getGradientColor(region.percentage);
              const isLight = region.percentage < 10;
              return `
                <div class="kpi-card" style="background: linear-gradient(135deg, ${gradientColor}, ${gradientColor}cc); border-left: 4px solid ${gradientColor}; box-shadow: 0 4px 12px ${gradientColor}44; color: ${isLight ? '#1a365d' : 'white'}; border-radius: 12px; padding: 24px; position: relative; overflow: hidden; min-height: 180px; display: flex; flex-direction: column; justify-content: space-between;">
                  <div style="width: 48px; height: 48px; margin: 0 auto 10px; display: flex; align-items: center; justify-content: center;">
                    <div style="font-size: 2.5rem;">${getRegionIcon(region.name)}</div>
            </div>
                  <div style="text-align: center; font-size: 1.3rem; font-weight: 700; color: ${isLight ? '#2d3748' : 'white'}; letter-spacing: 0.04em; margin-bottom: 12px;">${region.name}</div>
                  <div style="text-align: center; font-size: 3.5rem; font-weight: 800; color: ${isLight ? '#1a365d' : 'white'}; margin: 8px 0; line-height: 1; letter-spacing: -0.02em;">${region.percentage.toFixed(1)}%</div>
                  <div style="text-align: center; font-size: 1rem; color: ${isLight ? '#4a5568' : '#e2e8f0'}; font-weight: 500; margin-top: 2px;">${region.exportPercentage.toFixed(1)}% of export</div>
          </div>
              `;
            }).join('')}
        </div>
        ` : ''}
      </div>
    `;
  };

  // Helper function to get region icons - matching KPIExecutiveSummary.js
  const getRegionIcon = (regionName) => {
    const regionGlobes = {
      'Arabian Peninsula': '🌍', // Africa/Europe view (Middle East visible)
      'West Asia': '🌍', // Africa/Europe view (Middle East visible)
      'Southern Africa': '🌍', // Africa/Europe view
      'Levant': '🌍', // Africa/Europe view (Middle East visible)
      'North Africa': '🌍', // Africa/Europe view
      'Europe': '🌍', // Africa/Europe view
      'Americas': '🌎', // Americas view
      'Asia-Pacific': '🌏', // Asia/Australia view
      'Unassigned': '🌐', // Generic globe
      'Others': '🌐' // Generic globe for small regions
    };
    return regionGlobes[regionName] || '🌐';
  };

  // Generate Top 3 Product Groups HTML
  const generateTop3ProductGroups = (kgsData, reportData, basePeriodIndex) => {
    if (!kgsData || !Array.isArray(kgsData) || basePeriodIndex === null) {
      return '';
    }
    
    // Get top 3 products by current period volume
    const currentTotal = kgsData.reduce((sum, item) => sum + (item.rawValues[basePeriodIndex] || 0), 0);
    
    const top3Products = kgsData
      .filter(item => (item.rawValues[basePeriodIndex] || 0) > 0)
      .sort((a, b) => (b.rawValues[basePeriodIndex] || 0) - (a.rawValues[basePeriodIndex] || 0))
      .slice(0, 3)
      .map((item, index) => {
        const currentValue = item.rawValues[basePeriodIndex] || 0;
        const previousValue = basePeriodIndex > 0 ? (item.rawValues[basePeriodIndex - 1] || 0) : 0;
        const budgetValue = basePeriodIndex < item.rawValues.length - 1 ? (item.rawValues[basePeriodIndex + 1] || 0) : 0;
        
        const percentage = currentTotal > 0 ? (currentValue / currentTotal * 100) : 0;
        const growthPercent = previousValue > 0 ? ((currentValue - previousValue) / previousValue * 100) : 0;
        const budgetAchievement = budgetValue > 0 ? ((currentValue / budgetValue) * 100) : 0;
        
        return {
          rank: index + 1,
          productGroup: item.name || item.productGroup || 'Unknown Product',
          value: currentValue,
          percentage,
          growthPercent,
          budgetAchievement,
          previousValue
        };
      });
    
    if (top3Products.length === 0) return '';
    
    return `
      <div class="report-section" style="border-top: 1px solid #eee; padding-top: 30px; margin-top: 30px;">
        <div style="width: 100%; text-align: center; margin-bottom: 30px;">
          <h3 style="color: #667eea; font-size: 1.4em; margin-bottom: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; display: inline-block;">
            TOP 3 PRODUCT GROUPS
          </h3>
          <div style="font-size: 0.85em; font-weight: normal; color: #666; font-style: italic; margin-top: 5px;">
            (by Volume)
              </div>
            </div>
            
        <div class="top-products-horizontal">
          ${top3Products.map((product, index) => {
            const rankIcon = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
            const isPositive = product.growthPercent > 0;
            const arrow = isPositive ? '▲' : '▼';
            const growthWord = isPositive ? 'growth' : 'decline';
            const growthColor = isPositive ? '#007bff' : '#dc3545';
            const budgetColor = product.budgetAchievement >= 100 ? '#007bff' : '#dc3545';
            const budgetArrow = product.budgetAchievement >= 100 ? '▲' : '▼';
            
            return `
              <div class="top-product-card">
                <div class="product-rank">
                  <span class="rank-icon">${rankIcon}</span>
              </div>
                <div class="product-info">
                  <div class="product-name">${product.productGroup}</div>
                  <div class="product-percentage">${product.percentage.toFixed(1)}% of sales</div>
            </div>
                <div class="product-performance" style="color: ${growthColor}; background-color: ${isPositive ? 'rgba(0, 123, 255, 0.1)' : 'rgba(220, 53, 69, 0.1)'};">
                  ${arrow} ${Math.abs(product.growthPercent).toFixed(0)}% ${growthWord} vs ${reportData.prevPeriod ? formatPeriodLabel(reportData.prevPeriod) : 'HY1 2024'}
          </div>
                <div class="product-performance" style="font-size: 0.85em; margin-top: 4px; color: ${budgetColor}; background-color: ${product.budgetAchievement >= 100 ? 'rgba(0, 123, 255, 0.1)' : 'rgba(220, 53, 69, 0.1)'};">
                  ${budgetArrow} ${product.budgetAchievement.toFixed(0)}% vs ${formatPeriodLabel(reportData.basePeriod)} Budget
              </div>
            </div>
            `;
          }).join('')}
          </div>
      </div>
    `;
  };

  // Generate Customers Performance Tab with Customer Volume Table, Customer Amount Table, and Strategic Analysis (following Product Groups concept)
  // CRITICAL: This function should receive data that EXACTLY matches what CustomersKgsTable and CustomersAmountTable show
  // The data should come from the same API endpoint and processing logic
  const generateCustomersPerformanceTab = (customerData, customerAmountData, reportData, basePeriodIndex, customerFindings) => {
    if (!customerData || customerData.length === 0 || !reportData) {
      return '<p style="text-align: center; color: #666;">No customer data available</p>';
    }
    
    const columnOrder = reportData.columnOrder;
    
    // CRITICAL DEBUG: Log what we received to compare with live tables
    console.log('🔍 EXPORT - Customer Data received:', {
      customerDataCount: customerData.length,
      customerAmountDataCount: customerAmountData?.length || 0,
      sampleCustomers: customerData.slice(0, 5).map(c => ({
        name: c.name || c.customerName,
        rawValues: c.rawValues
      })),
      columnOrderLength: columnOrder?.length
    });
    
    // Use shared utility for delta labels - ensures consistency with live components
    const getDeltaLabel = (fromCol, toCol) => sharedGetDeltaLabel(fromCol, toCol);
    
    // Build extended columns with delta columns (same as live component)
    const buildExtendedColumns = (columnOrder) => {
      if (!columnOrder || columnOrder.length === 0) return [];
      const extendedColumns = [];
      for (let i = 0; i < columnOrder.length; i++) {
        extendedColumns.push({ ...columnOrder[i], columnType: 'data', dataIndex: i });
        if (i < columnOrder.length - 1) {
          const fromCol = columnOrder[i];
          const toCol = columnOrder[i + 1];
          extendedColumns.push({ 
            columnType: 'delta', 
            fromDataIndex: i, 
            toDataIndex: i + 1,
            fromColumn: fromCol,
            toColumn: toCol,
            deltaLabel: getDeltaLabel(fromCol, toCol)
          });
        }
      }
      return extendedColumns;
    };
    
    const extendedColumns = buildExtendedColumns(columnOrder);
    
    // Helper function to format names to proper case (same as live component)
    const toProperCase = (str) => {
      if (!str) return '';
      return str.split(' ').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };
    
    // Helper function for delta calculation - uses shared utility for consistency
    // Parameters: newerValue = toValue, olderValue = fromValue
    const calculateDeltaDisplay = (newerValue, olderValue, fromType, toType) => {
      // Use shared utility which handles all cases correctly with case-insensitive type matching
      // Note: sharedCalculateDelta expects (fromValue, toValue, fromType, toType)
      // But we receive (newerValue=toValue, olderValue=fromValue)
      // So we pass: (olderValue, newerValue, fromType, toType)
      const result = sharedCalculateDelta(olderValue, newerValue, fromType, toType);
      
      // Handle non-object return (like '-')
      if (typeof result !== 'object') {
        return result;
      }
      
      return result;
    };
    
    // Enhanced format number for display with better visual presentation (same as live component)
    const formatValue = (value) => {
      if (typeof value !== 'number') return value || '-';
      
      // Handle zero values
      if (value === 0) return '0.0';
      
      // Convert KGS to MT by dividing by 1000
      const mtValue = value / 1000;
      
      // If less than 1, use x.xx format (2 decimal places)
      if (mtValue < 1) {
        return mtValue.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        });
      }
      
      // For values >= 1, use x.x format (1 decimal place) with thousands separator
      const formattedNumber = mtValue.toLocaleString('en-US', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      });
      
      return formattedNumber;
    };
    
    // Format value for total row (whole numbers without decimals) - same as live component
    const formatValueForTotal = (value) => {
      if (typeof value !== 'number') return value || '-';
      
      // Handle zero values
      if (value === 0) return '0';
      
      // Convert KGS to MT by dividing by 1000
      const mtValue = value / 1000;
      
      // Round to whole number and format with thousands separator
      const roundedValue = Math.round(mtValue);
      return roundedValue.toLocaleString('en-US');
    };
    
    // Helper: Format AED amount (same as Product Groups)
    const formatAED = (value) => {
      if (typeof value !== 'number') return '-';
      if (value === 0) return '0';
      const absValue = Math.abs(value);
      if (absValue >= 1000000) return (value / 1000000).toFixed(1) + 'M';
      if (absValue >= 1000) return (value / 1000).toFixed(1) + 'K';
      return value.toFixed(0);
    };
    
    // Helper function to deduplicate customers by name (case-insensitive)
    // This is a defensive measure in case upstream processing missed any duplicates
    const deduplicateCustomers = (customers) => {
      const seenNames = new Map();
      return customers.filter(customer => {
        const name = (customer.customerName || customer.name || '').toString().trim().toUpperCase();
        if (seenNames.has(name)) {
          // Aggregate values into the existing customer
          const existing = seenNames.get(name);
          if (existing.rawValues && customer.rawValues) {
            customer.rawValues.forEach((val, idx) => {
              existing.rawValues[idx] = (existing.rawValues[idx] || 0) + (val || 0);
            });
          }
          return false; // Filter out duplicate
        }
        seenNames.set(name, customer);
        return true;
      });
    };
    
    // Process customer data to match live component logic
    // The customerData passed to HTML export should already be processed by the same logic as live component
    // Apply deduplication as a safety measure, then sort by base period value (descending)
    const filteredCustomers = deduplicateCustomers(customerData
      .filter(customer => customer.rawValues && customer.rawValues.some(val => val > 0)))
      .sort((a, b) => {
        const aValue = a.rawValues[basePeriodIndex] || 0;
        const bValue = b.rawValues[basePeriodIndex] || 0;
        return bValue - aValue; // Sort descending (highest values first)
      });
    
    // Process customer amount data (same logic as volume data)
    const filteredCustomerAmounts = customerAmountData && customerAmountData.length > 0 ? 
      deduplicateCustomers(customerAmountData
        .filter(customer => customer.rawValues && customer.rawValues.some(val => val > 0)))
        .sort((a, b) => {
          const aValue = a.rawValues[basePeriodIndex] || 0;
          const bValue = b.rawValues[basePeriodIndex] || 0;
          return bValue - aValue; // Sort descending (highest values first)
        }) : [];
    
    // Generate Customer Table HTML - using CSS classes that match live component exactly
    const customerTableHTML = `
      <div class="product-groups-kgs-table" style="margin-bottom: 40px;">
        <h3>Customer Sales - Volume (MT) Comparison</h3>
        <div class="table-scroll-wrapper">
          <table class="kgs-comparison-table">
            <thead>
              <tr>
                <th rowspan="3" class="product-header">Customer</th>
                ${extendedColumns.map((col) => {
                  if (col.columnType === 'delta') {
                    return `<th rowspan="3" class="delta-header">${col.deltaLabel}<br/>%</th>`;
                  }
                  return `<th class="period-header">${col.year}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col) => {
                  if (col.columnType === 'delta') return '';
                  const monthDisplay = col.isCustomRange ? formatCustomRangeDisplay(col.displayName) : col.month;
                  return `<th class="period-header">${monthDisplay}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col) => {
                  if (col.columnType === 'delta') return '';
                  return `<th class="period-header">${col.type}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${filteredCustomers.map((customer, idx) => {
                const customerName = customer.customerName || customer.name || 'Unknown';
                return `
                  <tr class="product-row">
                    <td class="product-name">${toProperCase(customerName)}</td>
                    ${extendedColumns.map((col, colIdx) => {
                      if (col.columnType === 'delta') {
                        // Calculate delta between adjacent data columns (same as live component)
                        const fromDataIndex = col.fromDataIndex;
                        const toDataIndex = col.toDataIndex;
                        
                        if (fromDataIndex !== undefined && toDataIndex !== undefined) {
                          const newerValue = customer.rawValues[toDataIndex] || 0;
                          const olderValue = customer.rawValues[fromDataIndex] || 0;
                          const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromColumn?.type, col.toColumn?.type);
                          
                          if (typeof deltaResult === 'object') {
                            const deltaClass = deltaResult.arrow === '▲' ? 'delta-up' : (deltaResult.arrow === '▼' ? 'delta-down' : '');
                            return `<td class="delta-cell ${deltaClass}" style="color: ${deltaResult.color};"><span class="delta-arrow">${deltaResult.arrow}</span><span class="delta-value">${deltaResult.value}</span></td>`;
                          } else {
                            return `<td class="delta-cell">${deltaResult}</td>`;
                          }
                        }
                        return `<td class="delta-cell">-</td>`;
                      }
                      // For data columns, use the same formatting as live component
                      const rawVal = customer.rawValues[col.dataIndex] || 0;
                      return `<td class="metric-cell">${formatValue(rawVal)}</td>`;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
              <tr class="total-row">
                <td class="total-label">Total</td>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    // Calculate delta for total row (same as live component)
                    const fromDataIndex = col.fromDataIndex;
                    const toDataIndex = col.toDataIndex;
                    
                    if (fromDataIndex !== undefined && toDataIndex !== undefined) {
                      const fromTotal = filteredCustomers.reduce((sum, customer) => sum + (customer.rawValues[fromDataIndex] || 0), 0);
                      const toTotal = filteredCustomers.reduce((sum, customer) => sum + (customer.rawValues[toDataIndex] || 0), 0);
                      const deltaResult = calculateDeltaDisplay(toTotal, fromTotal, col.fromColumn?.type, col.toColumn?.type);
                      
                      if (typeof deltaResult === 'object') {
                        return `<td class="delta-cell" style="color: white !important;"><span class="delta-arrow">${deltaResult.arrow}</span><span class="delta-value">${deltaResult.value}</span></td>`;
                      } else {
                        return `<td class="delta-cell">${deltaResult}</td>`;
                      }
                    }
                    return `<td class="delta-cell">-</td>`;
                  }
                  // For data columns, calculate total and use same formatting as live component
                  const total = filteredCustomers.reduce((sum, customer) => sum + (customer.rawValues[col.dataIndex] || 0), 0);
                  return `<td class="total-value">${formatValueForTotal(total)}</td>`;
                }).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    // Generate Customer Amount Table HTML - using CSS classes that match live component exactly
    const customerAmountTableHTML = filteredCustomerAmounts.length > 0 ? `
      <div class="product-groups-kgs-table" style="margin-bottom: 40px;">
        <h3>Customer Sales - ${getCurrencySymbolHTML(companyCurrency)} Sales Comparison</h3>
        <div class="table-scroll-wrapper">
          <table class="kgs-comparison-table">
            <thead>
              <tr>
                <th rowspan="3" class="product-header">Customer</th>
                ${extendedColumns.map((col) => {
                  if (col.columnType === 'delta') {
                    return `<th rowspan="3" class="delta-header">${col.deltaLabel}<br/>%</th>`;
                  }
                  return `<th class="period-header">${col.year}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col) => {
                  if (col.columnType === 'delta') return '';
                  const monthDisplay = col.isCustomRange ? formatCustomRangeDisplay(col.displayName) : col.month;
                  return `<th class="period-header">${monthDisplay}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col) => {
                  if (col.columnType === 'delta') return '';
                  return `<th class="period-header">${col.type}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${filteredCustomerAmounts.map((customer, idx) => {
                const customerName = customer.customerName || customer.name || 'Unknown';
                return `
                  <tr class="product-row">
                    <td class="product-name">${toProperCase(customerName)}</td>
                    ${extendedColumns.map((col, colIdx) => {
                      if (col.columnType === 'delta') {
                        // Calculate delta between adjacent data columns (same as live component)
                        const fromDataIndex = col.fromDataIndex;
                        const toDataIndex = col.toDataIndex;
                        
                        if (fromDataIndex !== undefined && toDataIndex !== undefined) {
                          const newerValue = customer.rawValues[toDataIndex] || 0;
                          const olderValue = customer.rawValues[fromDataIndex] || 0;
                          // Pass column types for correct formula selection
                          const deltaResult = calculateDeltaDisplay(newerValue, olderValue, col.fromColumn?.type, col.toColumn?.type);
                          
                          if (typeof deltaResult === 'object') {
                            const deltaClass = deltaResult.arrow === '▲' ? 'delta-up' : (deltaResult.arrow === '▼' ? 'delta-down' : '');
                            return `<td class="delta-cell ${deltaClass}" style="color: ${deltaResult.color};"><span class="delta-arrow">${deltaResult.arrow}</span><span class="delta-value">${deltaResult.value}</span></td>`;
                          } else {
                            return `<td class="delta-cell">${deltaResult}</td>`;
                          }
                        }
                        return `<td class="delta-cell">-</td>`;
                      }
                      // For data columns, use AED formatting
                      const rawVal = customer.rawValues[col.dataIndex] || 0;
                      return `<td class="metric-cell">${formatAED(rawVal)}</td>`;
                    }).join('')}
                  </tr>
                `;
              }).join('')}
              <tr class="total-row">
                <td class="total-label">Total</td>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    // Calculate delta for total row (same as live component)
                    const fromDataIndex = col.fromDataIndex;
                    const toDataIndex = col.toDataIndex;
                    
                    if (fromDataIndex !== undefined && toDataIndex !== undefined) {
                      const fromTotal = filteredCustomerAmounts.reduce((sum, customer) => sum + (customer.rawValues[fromDataIndex] || 0), 0);
                      const toTotal = filteredCustomerAmounts.reduce((sum, customer) => sum + (customer.rawValues[toDataIndex] || 0), 0);
                      // Pass column types for correct formula selection
                      const deltaResult = calculateDeltaDisplay(toTotal, fromTotal, col.fromColumn?.type, col.toColumn?.type);
                      
                      if (typeof deltaResult === 'object') {
                        return `<td class="delta-cell" style="color: white !important;"><span class="delta-arrow">${deltaResult.arrow}</span><span class="delta-value">${deltaResult.value}</span></td>`;
                      } else {
                        return `<td class="delta-cell">${deltaResult}</td>`;
                      }
                    }
                    return `<td class="delta-cell">-</td>`;
                  }
                  // For data columns, calculate total and use AED formatting
                  const total = filteredCustomerAmounts.reduce((sum, customer) => sum + (customer.rawValues[col.dataIndex] || 0), 0);
                  return `<td class="total-value">${getCurrencySymbolHTML(companyCurrency)}${formatAED(total)}</td>`;
                }).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    ` : '';
    
    // Generate Customer Key Facts Strategic Analysis HTML from findings
    if (!customerFindings) {
      return `
        ${customerTableHTML}
        ${customerAmountTableHTML}
        <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
          <div style="display: block; text-align: center; width: 100%;">
            <h2 style="color: #1e293b; font-size: 24px; font-weight: 700; margin: 0 0 24px 0; background: linear-gradient(135deg, #7c3aed, #5b21b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
              Customer Key Facts
            </h2>
          </div>
          <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #7c3aed;">
            <p style="color: #6b7280; text-align: center;">Analysis data is being calculated...</p>
          </div>
        </div>
      `;
    }
    
    // Extract ALL data from customerFindings - NO RECALCULATION
    const {
      totals,
      vsBudget,
      yoy,
      vsBudgetAmount,
      yoyAmount,
      runRateInfo,
      focusCustomers,
      growthDrivers,
      underperformers,
      coveragePct,
      concentrationRisk,
      retentionAnalysis,
      hasPreviousYearData,
      comprehensiveInsights,
      executiveSummary
    } = customerFindings;

    const { totalActual, totalAmountActual } = totals;
    const topCoverage = (coveragePct || 0) * 100;

    // Helper formatting functions - match live component
    const formatPct = (val) => {
      if (val == null || isNaN(val)) return 'N/A';
      const sign = val >= 0 ? '+' : '';
      return `${sign}${val.toFixed(1)}%`;
    };

    // Smart formatters that handle Infinity cases with meaningful labels
    const formatBudgetVariance = (value, hasActual = true) => {
      if (value == null) return null;
      if (value === Infinity) return hasActual ? 'New to Budget' : 'N/A';
      if (value === -Infinity) return 'No Actual';
      if (!Number.isFinite(value)) return 'N/A';
      const sign = value >= 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}% vs budget`;
    };

    const formatYoYVariance = (value, hasActual = true) => {
      if (value == null) return null;
      if (value === Infinity) return hasActual ? 'New Customer' : 'N/A';
      if (value === -Infinity) return 'Lost';
      if (!Number.isFinite(value)) return 'N/A';
      const sign = value >= 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}% YoY`;
    };

    // Style helpers for badges
    const getBudgetBadgeStyle = (value) => {
      if (value === Infinity) return 'background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; border: 1px solid #f59e0b;';
      return 'background: linear-gradient(135deg, #dbeafe, #bfdbfe); color: #1e40af; border: 1px solid #93c5fd;';
    };

    const getBudgetBadgeStyleNegative = (value) => {
      if (value === Infinity) return 'background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; border: 1px solid #f59e0b;';
      return 'background: linear-gradient(135deg, #fee2e2, #fecaca); color: #dc2626; border: 1px solid #f87171;';
    };

    const getYoYBadgeStyle = (value) => {
      if (value === Infinity) return 'background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; border: 1px solid #f59e0b;';
      return 'background: linear-gradient(135deg, #d1fae5, #a7f3d0); color: #065f46; border: 1px solid #6ee7b7;';
    };

    const getYoYBadgeStyleNegative = (value) => {
      if (value === Infinity) return 'background: linear-gradient(135deg, #fef3c7, #fde68a); color: #92400e; border: 1px solid #f59e0b;';
      return 'background: linear-gradient(135deg, #fee2e2, #fecaca); color: #dc2626; border: 1px solid #f87171;';
    };

    const formatMt = (kgs) => {
      if (kgs == null || isNaN(kgs)) return '0 MT';
      const mt = kgs / 1000;
      return mt >= 1000 ? `${Math.round(mt).toLocaleString()} MT` :
             mt >= 100 ? `${Math.round(mt)} MT` :
             `${mt.toFixed(1)} MT`;
    };

    const formatCustomerName = (name) => {
      if (!name) return '';
      return name.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ');
    };
    
    const strategicAnalysisHTML = `
      <div data-editable-section="customer-key-facts" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
        <h2 style="color: #1e293b; font-size: 24px; font-weight: 700; margin-bottom: 24px; text-align: center; background: linear-gradient(135deg, #3b82f6, #1e40af); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">Customer Key Facts</h2>

        <!-- Executive Overview -->
        <div style="background: #ffffff; border-radius: 12px; padding: 18px; margin-bottom: 18px; border-left: 4px solid #3b82f6; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <h4 style="color: #1e40af; font-size: 18px; font-weight: 600; margin-bottom: 10px;">📊 Executive Overview</h4>
          <div style="padding: 14px 18px; background: #eff6ff; border-radius: 10px; margin-bottom: 14px; font-size: 15px; line-height: 1.7; color: #1e40af; border-left: 4px solid #3b82f6; box-shadow: 0 1px 3px rgba(59, 130, 246, 0.1);">
            The customer portfolio demonstrates ${concentrationRisk.level === 'HIGH' || concentrationRisk.level === 'CRITICAL' ? 'remarkable concentration and strategic focus' : 'balanced distribution'}, with the top 3 customers commanding ${formatPct(concentrationRisk.top3Share * 100)} of total volume and the top 5 accounting for ${formatPct(concentrationRisk.top5Share * 100)}. This reveals a ${concentrationRisk.level === 'HIGH' || concentrationRisk.level === 'CRITICAL' ? 'highly focused B2B strategy' : 'diversified customer approach'} with ${concentrationRisk.customerCount} active customers generating an average of ${formatMt(concentrationRisk.avgVolumePerCustomer)} per customer.
            ${executiveSummary.keyRisks.length > 0 ? `<br/><br/><strong>Key Risks:</strong> ${executiveSummary.keyRisks.join(', ')}` : ''}
            ${executiveSummary.opportunities.length > 0 ? `<br/><strong>Opportunities:</strong> ${executiveSummary.opportunities.join(', ')}` : ''}
          </div>
        </div>

        ${comprehensiveInsights && comprehensiveInsights.customerAnalysis.length > 0 ? `
          <!-- Volume vs Sales Performance -->
          <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 18px; border-left: 4px solid #059669; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <h4 style="color: #059669; font-size: 18px; font-weight: 600; margin-bottom: 10px;">⚖️ Volume vs Sales Performance</h4>
            <div style="padding: 14px 18px; background: #f0fdf4; border-radius: 10px; font-size: 14px; line-height: 1.7; color: #166534; margin-bottom: 14px;">
              ${comprehensiveInsights.pvm.pvmAvailable ? `
                <strong>Price-Volume-Mix Analysis:</strong><br/>
                • Price Effect: ${formatPct(comprehensiveInsights.pvm.priceEffect)}<br/>
                • Volume Effect: ${formatPct(comprehensiveInsights.pvm.volumeEffect)}<br/>
                • Portfolio Kilo Rate: ${getCurrencySymbolHTML(companyCurrency)}${formatAED(comprehensiveInsights.volumeVsSalesPerformance.avgKiloRate)}/MT (${hasPreviousYearData && comprehensiveInsights.volumeVsSalesPerformance.kiloRateYoY !== null ? formatPct(comprehensiveInsights.volumeVsSalesPerformance.kiloRateYoY) + ' YoY' : 'No YoY data'})
              ` : `
                <strong>Price-Volume Analysis:</strong><br/>
                • Portfolio Kilo Rate: ${getCurrencySymbolHTML(companyCurrency)}${formatAED(comprehensiveInsights.volumeVsSalesPerformance.avgKiloRate)}/MT<br/>
                • PVM Analysis: Requires previous year or budget data for comparison
              `}
            </div>
            ${comprehensiveInsights.advantageAnalysis.volumeAdvantage.length > 0 ? `
              <div style="padding: 14px 18px; background: #f0fdf4; border-radius: 10px; font-size: 14px; line-height: 1.7; color: #166534; margin-bottom: 14px;">
                <strong>Volume Advantage (Volume outperforming Sales):</strong><br/>
                ${comprehensiveInsights.advantageAnalysis.volumeAdvantage.map(c => {
                  const volumeShare = totals.totalActual > 0 ? ((c.volumeActual / totals.totalActual) * 100) : 0;
                  const volumeMT = (c.volumeActual || 0) / 1000;
                  return `• ${formatCustomerName(c.name)}: Vol ${formatPct(c.volumeVsBudget)} vs Sales ${formatPct(c.amountVsBudget)} (${formatPct(c.volumeVsBudget - c.amountVsBudget)} gap) [${volumeShare.toFixed(1)}% share, ${volumeMT.toFixed(0)}MT]`;
                }).join('<br/>')}
              </div>
            ` : ''}
            ${comprehensiveInsights.advantageAnalysis.salesAdvantage.length > 0 ? `
              <div style="padding: 14px 18px; background: #f0fdf4; border-radius: 10px; font-size: 14px; line-height: 1.7; color: #166534; margin-bottom: 14px;">
                <strong>Sales Advantage (Sales outperforming Volume):</strong><br/>
                ${comprehensiveInsights.advantageAnalysis.salesAdvantage.map(c => {
                  const volumeShare = totals.totalActual > 0 ? ((c.volumeActual / totals.totalActual) * 100) : 0;
                  const volumeMT = (c.volumeActual || 0) / 1000;
                  return `• ${formatCustomerName(c.name)}: Sales ${formatPct(c.amountVsBudget)} vs Vol ${formatPct(c.volumeVsBudget)} (${formatPct(c.amountVsBudget - c.volumeVsBudget)} premium) [${volumeShare.toFixed(1)}% share, ${volumeMT.toFixed(0)}MT]`;
                }).join('<br/>')}
              </div>
            ` : ''}
            ${comprehensiveInsights.advantageAnalysis.volumeAdvantage.length === 0 && comprehensiveInsights.advantageAnalysis.salesAdvantage.length === 0 ? `
              <div style="padding: 12px; background: #f9fafb; border-radius: 8px; font-size: 14px; color: #666; font-style: italic;">
                No customers meet materiality thresholds for advantage analysis (≥2% volume share, ≥10MT volume, ≥10% performance gap)
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${hasPreviousYearData ? `
          <!-- Multi-Period Trend Analysis -->
          <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 18px; border-left: 4px solid #f59e0b; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <h4 style="color: #d97706; font-size: 18px; font-weight: 600; margin-bottom: 10px;">📈 Multi-Period Trend Analysis</h4>
            <div style="padding: 14px 18px; background: #fffbeb; border-radius: 10px; font-size: 14px; line-height: 1.7; color: #92400e;">
              <strong>3-Year Performance Trends:</strong><br/>
              • Volume Growth: ${formatPct(yoy)} YoY<br/>
              • Sales Growth: ${formatPct(yoyAmount)} YoY<br/>
              • Price Realization: ${formatPct(comprehensiveInsights.volumeVsSalesPerformance.kiloRateYoY)} YoY
              ${comprehensiveInsights.advantageAnalysis.outliers.length > 0 ? `<br/><br/><strong>Anomaly Detection (Statistical Outliers):</strong><br/>${comprehensiveInsights.advantageAnalysis.outliers.map(o => `• ${formatCustomerName(o.name)}: ${formatPct(o.yoyRate)} YoY (Z-score: ${o.zScore.toFixed(1)})`).join('<br/>')}` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Top Contributors -->
        <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 18px; border-left: 4px solid #7c3aed; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <h4 style="color: #7c3aed; font-size: 18px; font-weight: 600; margin-bottom: 10px;">🏆 Top Contributors</h4>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px;">
            <div>
              <strong>By Volume:</strong>
              ${comprehensiveInsights.topPerformers.volume.map((c, i) => `
                <div style="display: flex; align-items: center; gap: 8px; padding: 6px; background: #f8fafc; border-radius: 6px; margin-top: 6px;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background: #7c3aed; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">${i + 1}</div>
                  <div style="flex: 1; font-size: 13px; font-weight: 500;">${formatCustomerName(c.name)}</div>
                  <div style="font-size: 12px; color: #666;">${formatMt(c.volume)}</div>
                  <div style="font-size: 11px; color: #7c3aed; font-weight: 600;">${formatPct(c.share)}</div>
                </div>
              `).join('')}
            </div>
            <div>
              <strong>By Sales:</strong>
              ${comprehensiveInsights.topPerformers.sales.map((c, i) => `
                <div style="display: flex; align-items: center; gap: 8px; padding: 6px; background: #f8fafc; border-radius: 6px; margin-top: 6px;">
                  <div style="width: 24px; height: 24px; border-radius: 50%; background: #3b82f6; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600;">${i + 1}</div>
                  <div style="flex: 1; font-size: 13px; font-weight: 500;">${formatCustomerName(c.name)}</div>
                  <div style="font-size: 12px; color: #666;">${getCurrencySymbolHTML(companyCurrency)}${formatAED(c.amount)}</div>
                  <div style="font-size: 11px; color: #3b82f6; font-weight: 600;">${formatPct(c.share)}</div>
                </div>
              `).join('')}
            </div>
          </div>
          ${comprehensiveInsights.topPerformers.kiloRate.length > 0 ? `
            <div style="padding: 14px 18px; background: #faf5ff; border-radius: 10px; font-size: 14px; line-height: 1.7; color: #6b21a8;">
              <strong>Highest Kilo Rates (Min 1% volume share):</strong><br/>
              ${comprehensiveInsights.topPerformers.kiloRate.map((c, index) =>
                `${index > 0 ? '<br/>' : ''}• ${formatCustomerName(c.name)}: ${getCurrencySymbolHTML(companyCurrency)}${formatAED(c.kiloRate)}/MT (${formatMt(c.volume)})`
              ).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Concentration Risk -->
        <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 18px; border-left: 4px solid #ef4444; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <h4 style="color: #dc2626; font-size: 18px; font-weight: 600; margin-bottom: 10px;">🎯 Concentration Risk Analysis</h4>
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px;">
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Risk Level</div>
              <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${concentrationRisk.level}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Top Customer</div>
              <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${formatPct(concentrationRisk.top1Share * 100)}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Top 3 Share</div>
              <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${formatPct(concentrationRisk.top3Share * 100)}</div>
            </div>
            <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Active Customers</div>
              <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${concentrationRisk.customerCount}</div>
            </div>
          </div>
          <div style="padding: 14px 18px; background: #fef2f2; border-radius: 10px; font-size: 14px; line-height: 1.7; color: #991b1b;">
            <strong>Top 5 Customers by Volume:</strong><br/>
            ${concentrationRisk.topCustomers.map((c, i) =>
              `${i + 1}. ${formatCustomerName(c.name)}: ${formatMt(c.volume)} (${formatPct(c.share * 100)})`
            ).join('<br/>')}
          </div>
        </div>

        ${hasPreviousYearData ? `
          <!-- Customer Retention & Churn -->
          <div style="background: white; border-radius: 12px; padding: 18px; margin-bottom: 18px; border-left: 4px solid #8b5cf6; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <h4 style="color: #7c3aed; font-size: 18px; font-weight: 600; margin-bottom: 10px;">🔄 Customer Retention & Churn Analysis</h4>
            <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Retention Rate</div>
                <div style="font-size: 16px; font-weight: 700; color: ${retentionAnalysis.retentionRate >= 0.85 ? '#059669' : retentionAnalysis.retentionRate >= 0.7 ? '#f59e0b' : '#dc2626'};">
                  ${formatPct(retentionAnalysis.retentionRate * 100)}
                </div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Churn Rate</div>
                <div style="font-size: 16px; font-weight: 700; color: ${retentionAnalysis.churnRate >= 0.3 ? '#dc2626' : retentionAnalysis.churnRate >= 0.15 ? '#f59e0b' : '#059669'};">
                  ${formatPct(retentionAnalysis.churnRate * 100)}
                </div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">Lost Customers</div>
                <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${retentionAnalysis.lostCustomers}</div>
              </div>
              <div style="background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center;">
                <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">New Customers</div>
                <div style="font-size: 16px; font-weight: 700; color: #1f2937;">${retentionAnalysis.newCustomers}</div>
              </div>
            </div>
          </div>
        ` : ''}

        ${(growthDrivers.length > 0 || underperformers.length > 0) ? `
          <!-- Growth Drivers / Underperformers - Matching Live Component -->
          <div style="display: grid; grid-template-columns: ${growthDrivers.length > 0 && underperformers.length > 0 ? '1fr 1fr' : '1fr'}; gap: 20px; margin-bottom: 20px;">
            ${growthDrivers.length > 0 ? `
              <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border-radius: 16px; padding: 20px; border: 2px solid #10b981; box-shadow: 0 8px 25px rgba(16, 185, 129, 0.15);">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                  <div style="font-size: 24px; background: linear-gradient(135deg, #10b981, #059669); border-radius: 12px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);">🚀</div>
                  <h4 style="color: #065f46; font-size: 20px; font-weight: 700; margin: 0; flex: 1; text-transform: uppercase; letter-spacing: 0.5px;">Growth Drivers</h4>
                  <div style="background: linear-gradient(135deg, #10b981, #059669); color: white; border-radius: 20px; padding: 6px 12px; font-size: 14px; font-weight: 700; min-width: 30px; text-align: center; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);">${growthDrivers.length}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                ${growthDrivers.map((c, i) => `
                  <div style="background: rgba(255, 255, 255, 0.8); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; border: 1px solid rgba(16, 185, 129, 0.2); box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);">
                    <div style="background: linear-gradient(135deg, #3b82f6, #1e40af); color: white; border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); flex-shrink: 0;">${i + 1}</div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                      <div style="font-size: 16px; font-weight: 700; color: #1f2937; line-height: 1.2; text-align: center;">${formatCustomerName(c.name)}</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center;">
                        <span style="background: linear-gradient(135deg, #f3f4f6, #e5e7eb); color: #374151; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #d1d5db;">${formatMt(c.actual)}</span>
                        ${c.vsBudget != null ? `<span style="${getBudgetBadgeStyle(c.vsBudget)} padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${formatBudgetVariance(c.vsBudget, c.actual > 0)}</span>` : ''}
                        ${hasPreviousYearData && c.yoy != null ? `<span style="${getYoYBadgeStyle(c.yoy)} padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${formatYoYVariance(c.yoy, c.actual > 0)}</span>` : ''}
                        ${!hasPreviousYearData ? `<span style="background: linear-gradient(135deg, #f9fafb, #f3f4f6); color: #6b7280; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #d1d5db; font-style: italic;">Budget comparison</span>` : ''}
                      </div>
                    </div>
                    <div style="font-size: 20px; flex-shrink: 0; opacity: 0.7;">📈</div>
                  </div>
                `).join('')}
                </div>
              </div>
            ` : ''}
            ${underperformers.length > 0 ? `
              <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border-radius: 16px; padding: 20px; border: 2px solid #ef4444; box-shadow: 0 8px 25px rgba(239, 68, 68, 0.15);">
                <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                  <div style="font-size: 24px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 12px; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(239, 68, 68, 0.3);">⚠️</div>
                  <h4 style="color: #991b1b; font-size: 20px; font-weight: 700; margin: 0; flex: 1; text-transform: uppercase; letter-spacing: 0.5px;">Underperformers</h4>
                  <div style="background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border-radius: 20px; padding: 6px 12px; font-size: 14px; font-weight: 700; min-width: 30px; text-align: center; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3);">${underperformers.length}</div>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px;">
                ${underperformers.map((c, i) => `
                  <div style="background: rgba(255, 255, 255, 0.8); border-radius: 12px; padding: 16px; display: flex; align-items: center; gap: 12px; border: 1px solid rgba(239, 68, 68, 0.2); box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);">
                    <div style="background: linear-gradient(135deg, #3b82f6, #1e40af); color: white; border-radius: 10px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); flex-shrink: 0;">${i + 1}</div>
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                      <div style="font-size: 16px; font-weight: 700; color: #1f2937; line-height: 1.2; text-align: center;">${formatCustomerName(c.name)}</div>
                      <div style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: center;">
                        <span style="background: linear-gradient(135deg, #f3f4f6, #e5e7eb); color: #374151; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #d1d5db;">${formatMt(c.actual)}</span>
                        ${c.vsBudget != null ? `<span style="${getBudgetBadgeStyleNegative(c.vsBudget)} padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${formatBudgetVariance(c.vsBudget, c.actual > 0)}</span>` : ''}
                        ${hasPreviousYearData && c.yoy != null ? `<span style="${getYoYBadgeStyleNegative(c.yoy)} padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 600;">${formatYoYVariance(c.yoy, c.actual > 0)}</span>` : ''}
                        ${!hasPreviousYearData ? `<span style="background: linear-gradient(135deg, #f9fafb, #f3f4f6); color: #6b7280; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #d1d5db; font-style: italic;">Budget comparison</span>` : ''}
                      </div>
                    </div>
                    <div style="font-size: 20px; flex-shrink: 0; opacity: 0.7;">📉</div>
                  </div>
                `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Strategic Priorities -->
        <div style="background: white; border-radius: 12px; padding: 18px; border-left: 4px solid #3b82f6; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
          <h4 style="color: #1e40af; font-size: 18px; font-weight: 600; margin-bottom: 10px;">🎯 Strategic Priorities</h4>
          <div style="display: grid; gap: 8px;">
            ${runRateInfo && !runRateInfo.isOnTrack ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                📈 <strong>Accelerate Performance:</strong> Need ${formatMt(runRateInfo.catchUpRequired)}/month to meet FY target
              </div>
            ` : ''}
            ${(concentrationRisk.level === 'HIGH' || concentrationRisk.level === 'CRITICAL') ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                ⚖️ <strong>Diversify Portfolio:</strong> High concentration risk - develop smaller customers
              </div>
            ` : ''}
            ${hasPreviousYearData && retentionAnalysis.churnRate > 0.2 ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                🔒 <strong>Improve Retention:</strong> ${formatPct(retentionAnalysis.churnRate * 100)} churn rate needs attention
              </div>
            ` : ''}
            ${comprehensiveInsights.advantageAnalysis.volumeAdvantage.length > 0 ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                💰 <strong>Price Optimization:</strong> ${comprehensiveInsights.advantageAnalysis.volumeAdvantage.length} customers show volume-sales gaps
              </div>
            ` : ''}
            ${comprehensiveInsights.advantageAnalysis.salesAdvantage.length > 0 ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                💎 <strong>Premium Strategy:</strong> ${comprehensiveInsights.advantageAnalysis.salesAdvantage.length} customers show strong pricing power
              </div>
            ` : ''}
            ${focusCustomers.length > 0 ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                🎯 <strong>Focus Customers:</strong> ${focusCustomers.length} customers need immediate attention for budget achievement
              </div>
            ` : ''}
            ${growthDrivers.length > 0 ? `
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px; border-radius: 8px; font-size: 14px;">
                🚀 <strong>Growth Drivers:</strong> Leverage ${growthDrivers.length} high-performing customers for expansion
              </div>
            ` : ''}
          </div>
        </div>
        
        <!-- ====== CUSTOMER SALES INTELLIGENCE ENGINE SECTIONS ====== -->
        
        ${customerFindings.customerArchetypes && customerFindings.customerArchetypes.length > 0 ? (() => {
          const coreGrowth = customerFindings.customerArchetypes.filter(c => c.archetype?.archetype === 'CORE_GROWTH');
          const momentum = customerFindings.customerArchetypes.filter(c => c.archetype?.archetype === 'MOMENTUM');
          const drifting = customerFindings.customerArchetypes.filter(c => c.archetype?.archetype === 'DRIFTING');
          const lostRisk = customerFindings.customerArchetypes.filter(c => c.archetype?.archetype === 'LOST_RISK');
          const stable = customerFindings.customerArchetypes.filter(c => c.archetype?.archetype === 'STABLE');
          const newAccounts = customerFindings.customerArchetypes.filter(c => c.archetype?.archetype === 'NEW');
          
          const topArchetypes = [...lostRisk.slice(0, 2), ...drifting.slice(0, 2), ...coreGrowth.slice(0, 1)].filter(Boolean);
          
          return `
            <!-- Customer Growth Archetypes Section -->
            <div style="background: white; border-radius: 12px; padding: 18px; margin-top: 18px; border-left: 4px solid #8b5cf6; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
              <h4 style="color: #7c3aed; font-size: 18px; font-weight: 600; margin-bottom: 12px;">👥 Customer Growth Archetypes</h4>
              
              <div style="padding: 14px 18px; background: #f0fdf4; border-radius: 10px; margin-bottom: 14px; font-size: 14px; line-height: 1.7; color: #065f46; border-left: 4px solid #059669;">
                <strong>Customer Portfolio Profile:</strong><br/>
                ⭐ <strong>${coreGrowth.length}</strong> Core Growth • 
                🚀 <strong>${momentum.length}</strong> Momentum • 
                📉 <strong>${drifting.length}</strong> Drifting • 
                🔴 <strong>${lostRisk.length}</strong> Lost Risk • 
                ✓ <strong>${stable.length}</strong> Stable • 
                🆕 <strong>${newAccounts.length}</strong> New
              </div>
              
              ${topArchetypes.map(customer => `
                <div style="padding: 12px; background: #f8fafc; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${customer.archetype?.archetypeColor || '#6b7280'};">
                  <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
                    <span style="font-size: 16px;">${customer.archetype?.archetypeIcon || '📊'}</span>
                    <strong style="font-size: 14px;">${formatCustomerName(customer.name)}</strong>
                    <span style="background: ${customer.archetype?.archetypeColor || '#6b7280'}; color: white; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600;">
                      ${customer.archetype?.archetype?.replace('_', ' ') || 'N/A'}
                    </span>
                    <span style="background: ${customer.archetype?.priority === 'CRITICAL' ? '#dc2626' : customer.archetype?.priority === 'URGENT' ? '#f59e0b' : customer.archetype?.priority === 'HIGH' ? '#3b82f6' : '#6b7280'}; color: white; padding: 2px 5px; border-radius: 4px; font-size: 9px; font-weight: 600;">
                      ${customer.archetype?.priority || 'N/A'}
                    </span>
                  </div>
                  <div style="font-size: 13px; color: #374151; margin-bottom: 6px;">${customer.archetype?.explanation || 'N/A'}</div>
                  <div style="font-size: 12px; color: #059669; font-weight: 500;">📋 ${customer.archetype?.actionRequired || 'N/A'}</div>
                </div>
              `).join('')}
            </div>
          `;
        })() : ''}
        
        ${customerFindings.churnIntelligence && hasPreviousYearData ? `
          <!-- Churn Risk Intelligence Section -->
          <div style="background: white; border-radius: 12px; padding: 18px; margin-top: 18px; border-left: 4px solid ${customerFindings.churnIntelligence.churnSeverityColor || '#059669'}; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
            <h4 style="color: ${customerFindings.churnIntelligence.churnSeverity === 'CRITICAL' ? '#dc2626' : customerFindings.churnIntelligence.churnSeverity === 'HIGH' ? '#ea580c' : '#059669'}; font-size: 18px; font-weight: 600; margin-bottom: 12px;">🔄 Churn Risk Intelligence</h4>
            
            <div style="padding: 14px 18px; background: ${customerFindings.churnIntelligence.churnSeverity === 'CRITICAL' ? '#fef2f2' : customerFindings.churnIntelligence.churnSeverity === 'HIGH' ? '#fff7ed' : '#f0fdf4'}; border-radius: 10px; margin-bottom: 12px; font-size: 14px; line-height: 1.7; border-left: 4px solid ${customerFindings.churnIntelligence.churnSeverityColor || '#059669'};">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
                <span style="background: ${customerFindings.churnIntelligence.churnSeverityColor || '#6b7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                  ${customerFindings.churnIntelligence.churnSeverity} SEVERITY
                </span>
                <span style="font-size: 13px; color: #374151;">
                  Churn Type: <strong>${customerFindings.churnIntelligence.churnType?.replace('_', ' ') || 'N/A'}</strong>
                </span>
              </div>
              <div style="font-size: 13px; color: #374151; margin-bottom: 8px;">${customerFindings.churnIntelligence.churnInsight}</div>
              <div style="font-size: 12px; color: #6b7280;">
                <strong>Retention Health:</strong> ${customerFindings.churnIntelligence.retentionHealth} | 
                <strong>Net Customer Change:</strong> ${customerFindings.churnIntelligence.netCustomerChange >= 0 ? '+' : ''}${customerFindings.churnIntelligence.netCustomerChange}
              </div>
            </div>
            
            ${customerFindings.churnIntelligence.atRiskCount > 0 ? `
              <div style="padding: 10px 14px; background: #fef3c7; border-radius: 8px; margin-bottom: 10px; font-size: 13px; border-left: 3px solid #f59e0b;">
                <strong>⚠️ At-Risk Customers (${customerFindings.churnIntelligence.atRiskCount}):</strong><br/>
                ${customerFindings.churnIntelligence.atRiskNames?.slice(0, 5).join(', ') || 'N/A'}
                ${customerFindings.churnIntelligence.atRiskNames?.length > 5 ? ` and ${customerFindings.churnIntelligence.atRiskNames.length - 5} more` : ''}
              </div>
            ` : ''}
            
            ${customerFindings.churnIntelligence.recommendations?.length > 0 ? `
              <div style="padding: 10px 14px; background: #eff6ff; border-radius: 8px; font-size: 13px; color: #1e40af;">
                <strong>📋 Recommended Actions:</strong><br/>
                ${customerFindings.churnIntelligence.recommendations.map(rec => `• ${rec}<br/>`).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        ${customerFindings.churnVolumeImpact && (customerFindings.churnVolumeImpact.lostVolumeMT > 0 || customerFindings.churnVolumeImpact.newVolumeMT > 0) ? `
          <!-- Volume-Weighted Churn Impact Section -->
          <div style="background: white; border-radius: 10px; padding: 16px; margin-top: 16px; border-left: 4px solid ${customerFindings.churnVolumeImpact.volumeChurnSeverityColor || '#6b7280'}; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h4 style="color: #374151; font-size: 18px; font-weight: 600; margin-bottom: 12px;">📊 Volume-Weighted Churn Impact</h4>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">
              <div style="background: #fef2f2; padding: 12px; border-radius: 8px; text-align: center; border-left: 3px solid #dc2626;">
                <div style="font-size: 11px; color: #991b1b; margin-bottom: 4px;">Volume Lost</div>
                <div style="font-size: 18px; font-weight: 700; color: #dc2626;">
                  ${customerFindings.churnVolumeImpact.lostVolumeMT?.toFixed(0) || 0} MT
                </div>
                <div style="font-size: 11px; color: #991b1b;">
                  (${customerFindings.churnVolumeImpact.lostVolumeShare?.toFixed(1) || 0}% of prior base)
                </div>
              </div>
              <div style="background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center; border-left: 3px solid #059669;">
                <div style="font-size: 11px; color: #065f46; margin-bottom: 4px;">Volume Gained</div>
                <div style="font-size: 18px; font-weight: 700; color: #059669;">
                  ${customerFindings.churnVolumeImpact.newVolumeMT?.toFixed(0) || 0} MT
                </div>
                <div style="font-size: 11px; color: #065f46;">
                  (${customerFindings.churnVolumeImpact.newVolumeShare?.toFixed(1) || 0}% of current base)
                </div>
              </div>
              <div style="background: ${customerFindings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '#f0fdf4' : '#fef2f2'}; padding: 12px; border-radius: 8px; text-align: center; border-left: 3px solid ${customerFindings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '#059669' : '#dc2626'};">
                <div style="font-size: 11px; color: #374151; margin-bottom: 4px;">Net Impact</div>
                <div style="font-size: 18px; font-weight: 700; color: ${customerFindings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '#059669' : '#dc2626'};">
                  ${customerFindings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '+' : ''}${customerFindings.churnVolumeImpact.netVolumeImpactMT?.toFixed(0) || 0} MT
                </div>
                <div style="font-size: 11px; color: #374151;">
                  (${customerFindings.churnVolumeImpact.customerCountImpact?.net >= 0 ? '+' : ''}${customerFindings.churnVolumeImpact.customerCountImpact?.net || 0} customers)
                </div>
              </div>
            </div>
            
            <div style="padding: 12px 16px; background: ${customerFindings.churnVolumeImpact.volumeChurnSeverity === 'CRITICAL' ? '#fef2f2' : customerFindings.churnVolumeImpact.volumeChurnSeverity === 'HIGH' ? '#fff7ed' : '#f0fdf4'}; border-radius: 8px; margin-bottom: 12px; font-size: 13px; line-height: 1.6; border-left: 3px solid ${customerFindings.churnVolumeImpact.volumeChurnSeverityColor || '#059669'};">
              <span style="background: ${customerFindings.churnVolumeImpact.volumeChurnSeverityColor || '#6b7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
                ${customerFindings.churnVolumeImpact.volumeChurnSeverity || 'N/A'}
              </span>
              <span style="margin-left: 8px;">
                Churn Type: <strong>${customerFindings.churnVolumeImpact.volumeChurnType?.replace(/_/g, ' ') || 'N/A'}</strong>
              </span>
              <div style="margin-top: 8px; font-style: italic; color: #374151;">
                ${customerFindings.churnVolumeImpact.salesDirectorTakeaway || ''}
              </div>
            </div>
            
            ${customerFindings.churnVolumeImpact.whaleLosses?.length > 0 ? `
              <div style="padding: 10px 14px; background: #fef2f2; border-radius: 8px; font-size: 13px; border-left: 3px solid #dc2626;">
                <strong>🐋 Whale Losses (major accounts lost):</strong><br/>
                ${customerFindings.churnVolumeImpact.whaleLosses.map(w => `• <strong>${w.name}</strong>: ${w.lostVolumeMT?.toFixed(0) || 0} MT lost (${w.portfolioShare?.toFixed(1) || 0}% of prior base)<br/>`).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}
        
        ${customerFindings.concentrationInterpretation ? `
          <!-- Concentration Risk Interpretation Section -->
          <div style="background: white; border-radius: 10px; padding: 16px; margin-top: 16px; border-left: 4px solid #6366f1; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
            <h4 style="color: #4338ca; font-size: 18px; font-weight: 600; margin-bottom: 12px;">🎯 Concentration Risk Interpretation</h4>
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px;">
              <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center; border-left: 3px solid ${customerFindings.concentrationInterpretation.stabilityRiskColor || '#6b7280'};">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Stability Risk</div>
                <div style="font-size: 14px; font-weight: 700; color: ${customerFindings.concentrationInterpretation.stabilityRiskColor || '#374151'};">
                  ${customerFindings.concentrationInterpretation.stabilityRisk}
                </div>
              </div>
              <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center; border-left: 3px solid ${customerFindings.concentrationInterpretation.dependencyColor || '#6b7280'};">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Dependency</div>
                <div style="font-size: 14px; font-weight: 700; color: ${customerFindings.concentrationInterpretation.dependencyColor || '#374151'};">
                  ${customerFindings.concentrationInterpretation.dependencyExposure}
                </div>
              </div>
              <div style="background: #f8fafc; padding: 10px; border-radius: 8px; text-align: center; border-left: 3px solid ${customerFindings.concentrationInterpretation.growthColor || '#6b7280'};">
                <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px;">Growth Vulnerability</div>
                <div style="font-size: 14px; font-weight: 700; color: ${customerFindings.concentrationInterpretation.growthColor || '#374151'};">
                  ${customerFindings.concentrationInterpretation.growthVulnerability}
                </div>
              </div>
            </div>
            
            ${customerFindings.concentrationInterpretation.insights?.length > 0 ? `
              <div style="padding: 10px 14px; background: #eff6ff; border-radius: 8px; margin-bottom: 10px; font-size: 13px; color: #1e40af; line-height: 1.6;">
                <strong>Risk Analysis:</strong><br/>
                ${customerFindings.concentrationInterpretation.insights.map(insight => `• ${insight}<br/>`).join('')}
              </div>
            ` : ''}
            
            <div style="padding: 10px 14px; background: #f0fdf4; border-radius: 8px; font-size: 13px; color: #065f46; border-left: 3px solid #059669;">
              <strong>📋 Recommendation:</strong> ${customerFindings.concentrationInterpretation.recommendation || 'N/A'}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    return `
      ${customerTableHTML}
      ${customerAmountTableHTML}
      ${strategicAnalysisHTML}
    `;
  };

  // Generate Product Groups Performance Tab with KGS Table, Amount Table, and Strategic Analysis
  const generateProductGroupsPerformanceTab = (reportData, kgsData, amountData, basePeriodIndex, findings) => {
    const columnOrder = reportData.columnOrder;
    
    // Use shared utility for delta labels - ensures consistency with live components
    const getDeltaLabel = (fromCol, toCol) => sharedGetDeltaLabel(fromCol, toCol);
    
    // Helper: Build extended columns with delta columns between data columns
    const buildExtendedColumns = (columnOrder) => {
      if (!columnOrder || columnOrder.length === 0) return [];
      const extendedColumns = [];
      for (let i = 0; i < columnOrder.length; i++) {
        extendedColumns.push({ ...columnOrder[i], columnType: 'data', dataIndex: i });
        if (i < columnOrder.length - 1) {
          const fromCol = columnOrder[i];
          const toCol = columnOrder[i + 1];
          extendedColumns.push({ 
            columnType: 'delta', 
            fromDataIndex: i, 
            toDataIndex: i + 1,
            fromColumn: fromCol,
            toColumn: toCol,
            deltaLabel: getDeltaLabel(fromCol, toCol)
          });
        }
      }
      return extendedColumns;
    };
    
    const extendedColumns = buildExtendedColumns(columnOrder);
    
    // Helper: Format MT value
    const formatMT = (value) => {
      if (typeof value !== 'number') return '-';
      if (value === 0) return '0.0';
      const mtValue = value / 1000;
      if (mtValue < 1) return mtValue.toFixed(2);
      return mtValue.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    };
    
    // Helper: Format AED amount
    const formatAED = (value) => {
      if (typeof value !== 'number') return '-';
      if (value === 0) return '0';
      const absValue = Math.abs(value);
      if (absValue >= 1000000) return (value / 1000000).toFixed(1) + 'M';
      if (absValue >= 1000) return (value / 1000).toFixed(1) + 'K';
      return value.toFixed(0);
    };
    
    // Helper: Calculate delta with smart formula - uses shared utility for consistency
    const calculateDelta = (data, fromIndex, toIndex) => {
      const fromDataIndex = extendedColumns.slice(0, fromIndex).filter(col => col.columnType === 'data').length;
      const toDataIndex = extendedColumns.slice(0, toIndex).filter(col => col.columnType === 'data').length;
      
      // Get column types
      const fromCol = extendedColumns.find(col => col.columnType === 'data' && col.dataIndex === fromDataIndex);
      const toCol = extendedColumns.find(col => col.columnType === 'data' && col.dataIndex === toDataIndex);
      const fromType = fromCol?.type;
      const toType = toCol?.type;
      
      const fromTotal = data.reduce((s, row) => s + parseFloat(row.rawValues?.[fromDataIndex] || 0), 0);
      const toTotal = data.reduce((s, row) => s + parseFloat(row.rawValues?.[toDataIndex] || 0), 0);
      
      // Use shared utility for consistent calculation
      return sharedCalculateDelta(fromTotal, toTotal, fromType, toType);
    };
    
    // Helper: Calculate column total
    const calculateColumnTotal = (data, columnIndex) => {
      const dataColumnIndex = extendedColumns.slice(0, columnIndex).filter(col => col.columnType === 'data').length;
      return data.reduce((total, row) => {
        const value = row.rawValues?.[dataColumnIndex] || 0;
        return total + (typeof value === 'number' && !isNaN(value) ? value : 0);
      }, 0);
    };
    
    // Filter zero rows for display
    const filterZeroRows = (data) => {
      return data.filter(row => {
        return row.rawValues && row.rawValues.some(val => val > 0);
      });
    };
    
    // Filter excluded groups for Amount table
    // NOTE: Exclusions are now handled at database level via is_unmapped flag
    // Admin controls exclusions in Master Data > Raw Product Groups
    const filterExcludedGroups = (data) => {
      return data.filter(row => {
        if (!row.name) return true;
        const name = row.name.toString().trim().toLowerCase();
        // Only filter 'not in pg' marker from database
        return name !== 'not in pg';
      });
    };
    
    const filteredKgsData = filterZeroRows(kgsData);
    const filteredAmountData = filterExcludedGroups(filterZeroRows(amountData));
    
    // Generate KGS Table HTML - using CSS classes that match live component exactly
    const kgsTableHTML = `
      <div class="product-groups-kgs-table" style="margin-bottom: 40px;">
        <h3>Product Groups - Sales MT Comparison</h3>
        <div class="table-scroll-wrapper">
          <table class="kgs-comparison-table">
            <thead>
              <tr>
                <th rowspan="3" class="product-header">Product Groups</th>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    return `<th rowspan="3" class="delta-header">${col.deltaLabel}<br/>%</th>`;
                  }
                  return `<th class="period-header">${col.year}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') return '';
                  const monthDisplay = col.isCustomRange ? formatCustomRangeDisplay(col.displayName) : col.month;
                  return `<th class="period-header">${monthDisplay}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') return '';
                  return `<th class="period-header">${col.type}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${filteredKgsData.map((pg, pgIdx) => `
                <tr class="product-row">
                  <td class="product-name">${pg.name}</td>
                  ${extendedColumns.map((col, colIdx) => {
                    if (col.columnType === 'delta') {
                      const val = pg.values?.[colIdx];
                      if (typeof val === 'object' && val !== null) {
                        const deltaClass = val.arrow === '▲' ? 'delta-up' : val.arrow === '▼' ? 'delta-down' : '';
                        return `<td class="delta-cell ${deltaClass}" style="color: ${val.color};"><span class="delta-arrow">${val.arrow}</span><span class="delta-value">${val.value}</span></td>`;
                      }
                      return `<td class="delta-cell">➖</td>`;
                    }
                    const rawVal = pg.rawValues[col.dataIndex];
                    return `<td class="metric-cell">${formatMT(rawVal)}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
              <tr class="total-row">
                <td class="total-label">Total</td>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                    const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                    if (deltaIndex < dataColumns.length - 1) {
                      const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                      const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                      const delta = calculateDelta(filteredKgsData, fromIndex, toIndex);
                      return `<td class="delta-cell" style="color: white !important;"><span class="delta-arrow">${delta.arrow}</span><span class="delta-value">${delta.value}</span></td>`;
                    }
                    return `<td class="delta-cell">-</td>`;
                  }
                  const totalValue = calculateColumnTotal(filteredKgsData, idx);
                  return `<td class="total-value">${formatMT(totalValue)}</td>`;
                }).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    // Generate Amount Table HTML - using CSS classes that match live component exactly
    const amountTableHTML = `
      <div class="product-groups-kgs-table" style="margin-bottom: 40px;">
        <h3>Product Groups - ${getCurrencySymbolHTML(companyCurrency)} Sales Comparison</h3>
        <div class="table-scroll-wrapper">
          <table class="kgs-comparison-table">
            <thead>
              <tr>
                <th rowspan="3" class="product-header">Product Groups</th>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    return `<th rowspan="3" class="delta-header">${col.deltaLabel}<br/>%</th>`;
                  }
                  return `<th class="period-header">${col.year}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') return '';
                  const monthDisplay = col.isCustomRange ? formatCustomRangeDisplay(col.displayName) : col.month;
                  return `<th class="period-header">${monthDisplay}</th>`;
                }).join('')}
              </tr>
              <tr>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') return '';
                  return `<th class="period-header">${col.type}</th>`;
                }).join('')}
              </tr>
            </thead>
            <tbody>
              ${filteredAmountData.map((pg, pgIdx) => `
                <tr class="product-row">
                  <td class="product-name">${pg.name}</td>
                  ${extendedColumns.map((col, colIdx) => {
                    if (col.columnType === 'delta') {
                      const val = pg.values?.[colIdx];
                      if (typeof val === 'object' && val !== null) {
                        const deltaClass = val.arrow === '▲' ? 'delta-up' : val.arrow === '▼' ? 'delta-down' : '';
                        return `<td class="delta-cell ${deltaClass}" style="color: ${val.color};"><span class="delta-arrow">${val.arrow}</span><span class="delta-value">${val.value}</span></td>`;
                      }
                      return `<td class="delta-cell">➖</td>`;
                    }
                    const rawVal = pg.rawValues[col.dataIndex];
                    return `<td class="metric-cell">${formatAED(rawVal)}</td>`;
                  }).join('')}
                </tr>
              `).join('')}
              <tr class="total-row">
                <td class="total-label">Total</td>
                ${extendedColumns.map((col, idx) => {
                  if (col.columnType === 'delta') {
                    const dataColumns = extendedColumns.filter(c => c.columnType === 'data');
                    const deltaIndex = extendedColumns.slice(0, idx).filter(c => c.columnType === 'delta').length;
                    if (deltaIndex < dataColumns.length - 1) {
                      const fromIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex]);
                      const toIndex = extendedColumns.findIndex(c => c === dataColumns[deltaIndex + 1]);
                      const delta = calculateDelta(filteredAmountData, fromIndex, toIndex);
                      return `<td class="delta-cell" style="color: white !important;"><span class="delta-arrow">${delta.arrow}</span><span class="delta-value">${delta.value}</span></td>`;
                    }
                    return `<td class="delta-cell">-</td>`;
                  }
                  const totalValue = calculateColumnTotal(filteredAmountData, idx);
                  return `<td class="total-value">${getCurrencySymbolHTML(companyCurrency)}${formatAED(totalValue)}</td>`;
                }).join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    // Generate Product Groups Strategic Analysis HTML from findings
    const strategicAnalysisHTML = (() => {
      if (!findings) {
        return `
          <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
            <div style="display: block; text-align: center; width: 100%;">
              <h2 style="color: #1e293b; font-size: 24px; font-weight: 700; margin: 0 0 24px 0; background: linear-gradient(135deg, #3b82f6, #1e40af); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
                Product Groups Strategic Analysis
              </h2>
            </div>
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #3b82f6;">
              <p style="color: #6b7280; text-align: center;">Analysis data is being calculated...</p>
          </div>
          </div>
        `;
      }

      // Use the structured findings data provided to this function
      
      // Helper function to format numbers for strategic analysis display
      const formatMTDisplay = (num) => {
        if (num == null || isNaN(num)) return 'N/A';
        const mt = num / 1000;
        if (mt >= 1000) return Math.round(mt).toLocaleString() + ' MT';
        if (mt >= 100) return Math.round(mt) + ' MT';
        return mt.toFixed(1) + ' MT';
      };
      
      const formatAmountDisplay = (num) => {
        if (num == null || isNaN(num)) return 'N/A';
        const millions = num / 1000000;
        if (millions >= 1) return `${getCurrencySymbolHTML(companyCurrency)}${millions.toFixed(1)}M`;
        const thousands = num / 1000;
        if (thousands >= 1) return `${getCurrencySymbolHTML(companyCurrency)}${thousands.toFixed(0)}K`;
        return `${getCurrencySymbolHTML(companyCurrency)}${Math.round(num).toLocaleString()}`;
      };
      
      const formatPercentage = (num) => {
        if (num == null || isNaN(num)) return 'N/A';
        return `${Math.abs(num).toFixed(1)}%`;
      };
      
      // Additional metrics - only for portfolio summary if needed
      const mtBudgetVar = findings.totalMTBudget > 0 ? ((findings.totalMTActual - findings.totalMTBudget) / findings.totalMTBudget) * 100 : null;
      const amountBudgetVar = findings.totalAmountBudget > 0 ? ((findings.totalAmountActual - findings.totalAmountBudget) / findings.totalAmountBudget) * 100 : null;

      return `
        <div data-editable-section="product-groups" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border-radius: 12px; padding: 24px; margin: 20px 0; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0; font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;">
          <h3 style="color: #1e293b; font-size: 24px; font-weight: 700; margin-bottom: 24px; text-align: center; background: linear-gradient(135deg, #3b82f6, #1e40af); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">
            Product Groups Strategic Analysis
          </h3>
          
          <!-- Executive Summary Section - Streamlined, non-repetitive -->
          <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #3b82f6;">
            <h4 style="color: #1e40af; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">📊 Executive Summary</h4>
            
            <!-- Performance Snapshot -->
            <div style="padding: 12px 16px; background: #eff6ff; border-radius: 8px; margin-bottom: 12px; font-size: 15px; line-height: 1.6; color: #1e40af; border-left: 3px solid #3b82f6; text-align: left;">
              <strong>Performance Snapshot:</strong> Achieved ${formatMTDisplay(findings.totalMTActual)} volume and ${formatAmountDisplay(findings.totalAmountActual)} in sales
              ${findings.hasBudget && mtBudgetVar !== null ? ` — ${mtBudgetVar >= 0 ? 'exceeding' : 'trailing'} budget by ${formatPercentage(Math.abs(mtBudgetVar))} (volume) and ${formatPercentage(Math.abs(amountBudgetVar))} (sales)` : ''}
              ${findings.mtYoY !== null ? `, with ${findings.mtYoY >= 0 ? '+' : ''}${formatPercentage(findings.mtYoY)} YoY growth` : ''}.
            </div>

            <!-- Portfolio Summary - SAME insight style as Performance Snapshot -->
            ${(findings.criticalUnderperformers?.length > 0 || findings.growthDrivers?.length > 0) ? `
              <div style="padding: 12px 16px; background: #eff6ff; border-radius: 8px; margin-bottom: 12px; font-size: 15px; line-height: 1.6; color: #1e40af; border-left: 3px solid #3b82f6; text-align: left;">
                <strong>Portfolio Summary:</strong>
                ${findings.criticalUnderperformers?.length > 0 ? ` ⚠️ ${findings.criticalUnderperformers.length} product${findings.criticalUnderperformers.length > 1 ? 's' : ''} underperforming vs budget (see details below).` : ''}
                ${findings.growthDrivers?.length > 0 ? ` 🚀 ${findings.growthDrivers.length} product${findings.growthDrivers.length > 1 ? 's' : ''} driving strong growth.` : ''}
                ${findings.aspConcerns?.length > 0 ? ` 💰 ${findings.aspConcerns.length} product${findings.aspConcerns.length > 1 ? 's' : ''} with notable pricing changes.` : ''}
              </div>
            ` : ''}
          </div>
          
          ${findings.criticalUnderperformers && findings.criticalUnderperformers.length > 0 ? `
            <!-- Critical Underperformers Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #dc2626;">
              <h4 style="color: #dc2626; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">⚠️ High-Priority Underperformers</h4>
              ${findings.criticalUnderperformers.map((product) => `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #ef4444; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                  <div style="font-weight: 600; color: #1f2937; font-size: 16px; margin-bottom: 12px; text-align: left;">${product.name}</div>
                  <div style="margin-left: 12px;">
                    <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                      <strong>Strategic Weight:</strong> ${(product.budgetShare * 100).toFixed(1)}% of total budget (${formatMTDisplay(product.mtFYBudget || product.mtBudget)} / ${formatAmountDisplay(product.amountFYBudget || product.amountBudget)})
                    </div>
                    ${product.mtVariance != null && Math.abs(product.mtVariance) > 5 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>Period Gap:</strong> Volume ${formatPercentage(Math.abs(product.mtVariance))} ${product.mtVariance < 0 ? 'below' : 'above'} plan (${formatMTDisplay(product.mtActual)} vs ${formatMTDisplay(product.mtBudget)}), revenue impact ${formatPercentage(Math.abs(product.amountVariance))} ${product.amountVariance < 0 ? 'short' : 'over'} at ${formatAmountDisplay(product.amountActual)}
                      </div>
                    ` : ''}
                    ${product.mtYoY != null ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>YoY Trend:</strong> ${formatPercentage(Math.abs(product.mtYoY))} ${product.mtYoY < 0 ? 'volume decline' : 'volume growth'} from ${formatMTDisplay(product.mtPrevYear)} to ${formatMTDisplay(product.mtActual)}, sales ${product.amountYoY >= 0 ? 'up' : 'down'} ${formatPercentage(Math.abs(product.amountYoY))}
                      </div>
                    ` : ''}
                    ${product.mtYTDGrowth != null && findings.hasYTD ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>YTD Performance:</strong> ${formatMTDisplay(product.mtYTDCurrent)} (${formatPercentage(Math.abs(product.mtYTDGrowth))} ${product.mtYTDGrowth >= 0 ? 'ahead' : 'behind'} prior year's ${formatMTDisplay(product.mtYTDPrevious)})
                      </div>
                    ` : ''}
                    ${product.mtFYBudgetVar != null && findings.hasFY && Math.abs(product.mtFYBudgetVar) > 5 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>FY Outlook:</strong> Full year tracking at ${formatMTDisplay(product.mtFYCurrent)} / ${formatAmountDisplay(product.amountFYCurrent)}, ${formatPercentage(Math.abs(product.mtFYBudgetVar))} ${product.mtFYBudgetVar < 0 ? 'below' : 'above'} FY target
                      </div>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${findings.growthDrivers && findings.growthDrivers.length > 0 ? `
            <!-- Growth Drivers Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #059669;">
              <h4 style="color: #059669; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">🚀 Growth Drivers</h4>
              ${findings.growthDrivers.map((product) => `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #059669; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                  <div style="font-weight: 600; color: #1f2937; font-size: 16px; margin-bottom: 12px; text-align: left;">${product.name}</div>
                  <div style="margin-left: 12px;">
                    <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                      <strong>Strong Execution:</strong> Delivered ${formatMTDisplay(product.mtActual)} / ${formatAmountDisplay(product.amountActual)} (${(product.actualContribution * 100).toFixed(1)}% of total volume)
                    </div>
                    ${product.mtVariance != null && product.mtVariance > 10 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>Exceeded Budget:</strong> Volume ${formatPercentage(product.mtVariance)} above plan, revenue outperformance of ${formatPercentage(product.amountVariance)}
                      </div>
                    ` : ''}
                    ${product.mtYoY != null && product.mtYoY > 15 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>Momentum:</strong> ${formatPercentage(product.mtYoY)} volume expansion YoY (from ${formatMTDisplay(product.mtPrevYear)} to ${formatMTDisplay(product.mtActual)}), sales growth of ${formatPercentage(product.amountYoY)}
                      </div>
                    ` : ''}
                    ${product.mtFYGrowth != null && findings.hasFY && product.mtFYGrowth > 10 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>FY Achievement:</strong> Full year performance at ${formatMTDisplay(product.mtFYCurrent)} represents ${formatPercentage(product.mtFYGrowth)} growth vs prior FY
                      </div>
                    ` : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          ${findings.aspConcerns && findings.aspConcerns.length > 0 ? `
            <!-- Pricing Analysis Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #d97706;">
              <h4 style="color: #d97706; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">💰 Pricing Analysis</h4>
              ${findings.aspConcerns.map((product) => {
                // Helper for ASP formatting (plain HTML version of formatNumber 'asp')
                const formatASP = (num) => {
                  if (num == null || isNaN(num)) return 'N/A';
                  return getCurrencySymbolHTML(companyCurrency) + Math.round(num).toLocaleString();
                };
                return `
                <div style="padding: 16px; background: #f8fafc; border-radius: 8px; margin-bottom: 16px; border-left: 4px solid #d97706; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                  <div style="font-weight: 600; color: #1f2937; font-size: 16px; margin-bottom: 12px; text-align: left;">${product.name}</div>
                  <div style="margin-left: 12px;">
                    ${product.aspYoYPct != null && Math.abs(product.aspYoYPct) >= 5 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>ASP Change YoY:</strong> Current realization at ${formatASP(product.currentASP)}/kg vs ${formatASP(product.prevYearASP)}/kg prior year (${formatPercentage(Math.abs(product.aspYoYPct))} ${product.aspYoYPct < 0 ? 'decline' : 'increase'})
                      </div>
                    ` : ''}
                    ${product.aspVsBudgetPct != null && Math.abs(product.aspVsBudgetPct) >= 5 ? `
                      <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                        <strong>ASP vs Budget:</strong> ${formatPercentage(Math.abs(product.aspVsBudgetPct))} ${product.aspVsBudgetPct < 0 ? 'below' : 'above'} budgeted ASP of ${formatASP(product.budgetASP)}/kg
                      </div>
                    ` : ''}
                    <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                      <strong>Revenue Impact:</strong> Volume of ${formatMTDisplay(product.mtActual)} generating ${formatAmountDisplay(product.amountActual)} with materiality score of ${(product.materialityScore * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                `;
              }).join('')}
            </div>
          ` : ''}
          
          ${(findings.monthsRemaining != null || findings.portfolioRemainingMt > 0 || findings.portfolioRemainingAmt > 0) ? `
            <!-- Required Growth to Targets Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #7c3aed;">
              <h4 style="color: #7c3aed; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">🎯 Required Growth to Targets</h4>
              
              <!-- Portfolio Catch-up Plan -->
              <div style="padding: 12px 16px; background: #eff6ff; border-radius: 8px; margin-bottom: 12px; font-size: 15px; line-height: 1.6; color: #1e40af; border-left: 3px solid #3b82f6;">
                <strong>Portfolio Catch-up Plan</strong><br>
                ${findings.monthsRemaining != null && findings.monthsRemaining > 0 ? `
                  <div><strong>Time Remaining:</strong> ${findings.monthsRemaining} months to achieve FY budget targets</div>
                ` : ''}
                ${findings.monthsRemaining === 0 ? `
                  <div><strong>Time Remaining:</strong> No months remaining - gap must be closed within current month (end-loading)</div>
                ` : ''}
                ${findings.portfolioRemainingMt > 0 ? `
                  <div><strong>Volume Gap:</strong> Need ${formatMTDisplay(findings.portfolioRemainingMt)} more to hit FY budget</div>
                ` : findings.portfolioRemainingMt < 0 ? `
                  <div><strong>Volume Status:</strong> Portfolio is ${formatMTDisplay(Math.abs(findings.portfolioRemainingMt))} ahead of FY budget target</div>
                ` : ''}
                ${findings.portfolioRemainingAmt > 0 ? `
                  <div><strong>Sales Gap:</strong> Need ${formatAmountDisplay(findings.portfolioRemainingAmt)} more to hit FY budget</div>
                ` : findings.portfolioRemainingAmt < 0 ? `
                  <div><strong>Sales Status:</strong> Portfolio is ${formatAmountDisplay(Math.abs(findings.portfolioRemainingAmt))} ahead of FY budget target</div>
                ` : ''}
                ${findings.monthsRemaining > 0 && (findings.portfolioRemainingMt > 0 || findings.portfolioRemainingAmt > 0) ? `
                  <div><strong>Required Average Per Month:</strong> ${formatMTDisplay(findings.portfolioPerMonthMt)} / ${formatAmountDisplay(findings.portfolioPerMonthAmt)}</div>
                ` : ''}
                ${findings.portfolioRemainingMt <= 0 && findings.portfolioRemainingAmt <= 0 ? `
                  <div><strong>Status:</strong> Portfolio is on track or ahead of budget targets</div>
                ` : ''}
              </div>
              
              <!-- Product Level Catch-up -->
              ${findings.highBudgetProducts && findings.highBudgetProducts.filter(p => (p.productRemainingMt > 0) || (p.productRemainingAmt > 0)).length > 0 ? `
                <div style="margin-top: 16px;">
                  <strong style="color: #1e40af; font-size: 16px;">Product Level Catch-up</strong>
                  ${findings.highBudgetProducts.filter(p => (p.productRemainingMt > 0) || (p.productRemainingAmt > 0)).map((product) => `
                    <div style="padding: 16px; background: #f8fafc; border-radius: 8px; margin: 12px 0 16px 0; border-left: 4px solid #ef4444; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                      <div style="font-weight: 600; color: #1f2937; font-size: 16px; margin-bottom: 12px; text-align: center;">${product.name}</div>
                      <div style="margin-left: 12px;">
                        ${product.productRemainingMt > 0 ? `
                          <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                            <strong>Volume Gap:</strong> Need ${formatMTDisplay(product.productRemainingMt)} more to hit FY budget
                          </div>
                        ` : ''}
                        ${product.productRemainingAmt > 0 ? `
                          <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                            <strong>Sales Gap:</strong> Need ${formatAmountDisplay(product.productRemainingAmt)} more to hit FY budget
                          </div>
                        ` : ''}
                        ${findings.monthsRemaining > 0 && (product.productRemainingMt > 0 || product.productRemainingAmt > 0) ? `
                          <div style="color: #4b5563; font-size: 14px; line-height: 1.6; margin-bottom: 8px; padding: 8px 12px; background: white; border-radius: 6px;">
                            <strong>Required Per Month:</strong> ${formatMTDisplay(product.productPerMonthMt)} / ${formatAmountDisplay(product.productPerMonthAmt)}
                          </div>
                        ` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              ` : `
                <div style="padding: 12px 16px; background: #eff6ff; border-radius: 8px; font-size: 15px; line-height: 1.6; color: #1e40af;">
                  All high-budget products are on track or ahead of targets
                </div>
              `}
            </div>
          ` : ''}
          
          <!-- Strategic Priorities Section -->
          <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #3b82f6;">
            <h4 style="color: #1e40af; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">💡 Strategic Priorities</h4>
            <div style="padding: 16px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0;">
              ${findings.criticalUnderperformers && findings.criticalUnderperformers.length > 0 ? `
                <div style="color: #065f46; font-size: 15px; line-height: 1.6; margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid #10b981;">
                  Address underperformance in high-budget products representing ${(findings.criticalUnderperformers.reduce((sum, p) => sum + p.budgetShare, 0) * 100).toFixed(1)}% of strategic allocation through targeted sales initiatives and market analysis.
                </div>
              ` : ''}
              ${findings.growthDrivers && findings.growthDrivers.length > 0 ? `
                <div style="color: #065f46; font-size: 15px; line-height: 1.6; margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid #10b981;">
                  Capitalize on momentum in growth products by allocating additional resources and analyzing success factors for replication across portfolio.
                </div>
              ` : ''}
              ${findings.aspConcerns && findings.aspConcerns.length > 0 ? `
                <div style="color: #065f46; font-size: 15px; line-height: 1.6; margin-bottom: 12px; padding: 12px; background: white; border-radius: 6px; border-left: 3px solid #10b981;">
                  Investigate pricing pressure in ${findings.aspConcerns.length} material products; implement margin protection strategies or validate competitive positioning.
                </div>
              ` : ''}
            </div>
          </div>
          
          <!-- ====== SALES INTELLIGENCE ENGINE SECTIONS ====== -->
          
          ${findings.productMomentumAnalysis && findings.productMomentumAnalysis.length > 0 ? (() => {
            const accelerators = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'ACCELERATOR');
            const builders = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'BUILDER');
            const stabilizers = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'STABILIZER');
            const atRisk = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'AT_RISK');
            
            const topMomentum = [...accelerators.slice(0, 2), ...atRisk.slice(0, 2)];
            
            return `
              <!-- Product Momentum Diagnosis Section -->
              <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #8b5cf6;">
                <h4 style="color: #7c3aed; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">🎯 Product Momentum Diagnosis</h4>
                
                <div style="padding: 12px 16px; background: #f0fdf4; border-radius: 8px; margin-bottom: 16px; font-size: 14px; line-height: 1.6; color: #065f46; border-left: 3px solid #059669;">
                  <strong>Portfolio Momentum Profile:</strong><br/>
                  🚀 <strong>${accelerators.length}</strong> Accelerators (strong growth + above plan) • 
                  📈 <strong>${builders.length}</strong> Builders (growing but below budget) • 
                  ⚖️ <strong>${stabilizers.length}</strong> Stabilizers (steady contributors) • 
                  ⚠️ <strong>${atRisk.length}</strong> At-Risk (require intervention)
                </div>
                
                ${topMomentum.map(product => `
                  <div style="padding: 14px; background: #f8fafc; border-radius: 8px; margin-bottom: 12px; border-left: 4px solid ${product.momentum?.categoryColor || '#6b7280'};">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap;">
                      <span style="font-size: 18px;">${product.momentum?.categoryIcon || '📊'}</span>
                      <strong style="font-size: 15px;">${product.name}</strong>
                      <span style="background: ${product.momentum?.categoryColor || '#6b7280'}; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600;">
                        ${product.momentum?.category || 'N/A'}
                      </span>
                    </div>
                    <div style="color: #374151; font-size: 13px; padding: 8px 10px; background: white; border-radius: 6px; margin-bottom: 8px;">
                      <strong>Diagnosis:</strong> ${product.momentum?.explanation || 'N/A'}
                    </div>
                    <div style="color: #374151; font-size: 13px; padding: 8px 10px; background: white; border-radius: 6px; margin-bottom: 8px;">
                      <strong>Sustainability:</strong> ${product.momentum?.sustainabilityLabel || 'N/A'}
                    </div>
                    ${product.momentum?.riskFactors?.length > 0 ? `
                      <div style="color: #991b1b; font-size: 13px; padding: 8px 10px; background: #fef2f2; border-radius: 6px; margin-bottom: 8px;">
                        <strong>Risk Factors:</strong> ${product.momentum.riskFactors.join('; ')}
                      </div>
                    ` : ''}
                    <div style="color: #374151; font-size: 13px; padding: 8px 10px; background: #fffbeb; border-radius: 6px; font-style: italic;">
                      💡 ${product.momentum?.salesInsight || 'N/A'}
                    </div>
                  </div>
                `).join('')}
              </div>
            `;
          })() : ''}
          
          ${findings.budgetGapAnalysis && findings.budgetGapAnalysis.gapMT > 0 ? `
            <!-- Budget Gap Realism Analysis Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid ${findings.budgetGapAnalysis.feasibility === 'REALISTIC' ? '#059669' : findings.budgetGapAnalysis.feasibility === 'CHALLENGING' ? '#f59e0b' : '#dc2626'};">
              <h4 style="color: ${findings.budgetGapAnalysis.feasibility === 'REALISTIC' ? '#059669' : findings.budgetGapAnalysis.feasibility === 'CHALLENGING' ? '#b45309' : '#dc2626'}; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">📊 Budget Gap Realism Analysis</h4>
              
              <div style="padding: 12px 16px; background: ${findings.budgetGapAnalysis.feasibility === 'REALISTIC' ? '#f0fdf4' : findings.budgetGapAnalysis.feasibility === 'CHALLENGING' ? '#fef3c7' : '#fef2f2'}; border-radius: 8px; margin-bottom: 16px; font-size: 14px; line-height: 1.6; border-left: 3px solid ${findings.budgetGapAnalysis.feasibility === 'REALISTIC' ? '#059669' : findings.budgetGapAnalysis.feasibility === 'CHALLENGING' ? '#f59e0b' : '#dc2626'};">
                <strong>Feasibility Assessment: ${findings.budgetGapAnalysis.feasibility}</strong><br/>
                ${findings.budgetGapAnalysis.insight}
              </div>
              
              ${findings.budgetGapAnalysis.contributors?.length > 0 ? `
                <div style="padding: 12px 16px; background: #eff6ff; border-radius: 8px; margin-bottom: 12px; font-size: 14px; line-height: 1.8; color: #1e40af;">
                  <strong>Products with Gap-Closing Velocity:</strong><br/>
                  ${findings.budgetGapAnalysis.contributors.slice(0, 3).map(p => `
                    • <strong>${p.name}</strong>: ${p.contributionInsight}<br/>
                  `).join('')}
                </div>
              ` : ''}
              
              ${findings.budgetGapAnalysis.saturatedProducts?.length > 0 ? `
                <div style="padding: 12px 16px; background: #f8fafc; border-radius: 8px; font-size: 14px; color: #6b7280;">
                  <strong>Saturated Products (unlikely to contribute more):</strong> 
                  ${findings.budgetGapAnalysis.saturatedProducts.map(p => p.name).join(', ')}
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          ${findings.budgetGapOwnership && findings.budgetGapOwnership.gapMT > 0 ? `
            <!-- Budget Gap Ownership Section - Sales Director View -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid ${findings.budgetGapOwnership.status === 'ACHIEVABLE' ? '#059669' : findings.budgetGapOwnership.status === 'CHALLENGING' ? '#f59e0b' : '#dc2626'};">
              <h4 style="color: #374151; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">🎯 Budget Gap Ownership (Sales Director View)</h4>
              
              <div style="padding: 12px 16px; background: ${findings.budgetGapOwnership.status === 'ACHIEVABLE' ? '#f0fdf4' : findings.budgetGapOwnership.status === 'CHALLENGING' ? '#fef3c7' : '#fef2f2'}; border-radius: 8px; margin-bottom: 16px; font-size: 14px; line-height: 1.6; border-left: 3px solid ${findings.budgetGapOwnership.status === 'ACHIEVABLE' ? '#059669' : findings.budgetGapOwnership.status === 'CHALLENGING' ? '#f59e0b' : '#dc2626'};">
                <strong>${findings.budgetGapOwnership.insight}</strong><br/>
                <span style="font-style: italic; color: #374151;">${findings.budgetGapOwnership.salesDirectorSummary || ''}</span>
              </div>
              
              ${findings.budgetGapOwnership.keyContributors?.length > 0 ? `
                <div style="padding: 12px 16px; background: #eff6ff; border-radius: 8px; margin-bottom: 12px; font-size: 14px;">
                  <strong>Key Contributors (realistic momentum to deliver):</strong>
                  ${findings.budgetGapOwnership.keyContributors.map(p => `
                    <div style="margin-top: 8px; padding: 8px; background: #f0fdf4; border-radius: 4px;">
                      <strong>${p.name}</strong> — Owns ${p.realisticOwnershipPct?.toFixed(0) || 0}% of gap closure (${p.realisticContributionMT?.toFixed(1) || 0} MT)<br/>
                      <span style="font-size: 13px; color: #059669;">${p.assessment || ''}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
              
              ${findings.budgetGapOwnership.longShots?.length > 0 ? `
                <div style="padding: 12px 16px; background: #fef3c7; border-radius: 8px; font-size: 14px;">
                  <strong>Long Shots (own gap on paper, lack momentum):</strong>
                  ${findings.budgetGapOwnership.longShots.map(p => `
                    <div style="margin-top: 4px; font-size: 13px;">• ${p.name}: ${p.theoreticalOwnershipPct?.toFixed(0) || 0}% theoretical → ${p.realisticOwnershipPct?.toFixed(0) || 0}% realistic</div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          ${findings.volumeRevenueAnalysis && findings.volumeRevenueAnalysis.insights?.length > 0 ? `
            <!-- Volume vs Revenue Direction Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid #6366f1;">
              <h4 style="color: #4338ca; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">⚖️ Volume vs Revenue Direction</h4>
              
              <div style="padding: 12px 16px; background: ${findings.volumeRevenueAnalysis.signalType === 'MIX_ENRICHMENT' ? '#f0fdf4' : findings.volumeRevenueAnalysis.signalType === 'MIX_DILUTION' ? '#fef3c7' : '#eff6ff'}; border-radius: 8px; margin-bottom: 12px; font-size: 14px; line-height: 1.8;">
                ${findings.volumeRevenueAnalysis.insights.map(insight => `• ${insight}<br/>`).join('')}
              </div>
              
              ${findings.volumeRevenueAnalysis.salesImplication ? `
                <div style="padding: 10px 14px; background: white; border-radius: 6px; font-size: 13px; color: #374151; border: 1px solid #e5e7eb;">
                  <strong>Sales Implication:</strong> ${findings.volumeRevenueAnalysis.salesImplication}
                </div>
              ` : ''}
            </div>
          ` : ''}
          
          ${findings.runRateReality && findings.runRateReality.status !== 'YEAR_END' ? `
            <!-- Run Rate Reality Check Section -->
            <div style="background: white; border-radius: 10px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid ${findings.runRateReality.statusColor || '#3b82f6'};">
              <h4 style="color: ${findings.runRateReality.statusColor || '#1e40af'}; font-size: 18px; font-weight: 600; margin-bottom: 16px; text-align: left;">⏱️ Run Rate Reality Check</h4>
              
              <div style="padding: 12px 16px; background: ${findings.runRateReality.statusColor ? findings.runRateReality.statusColor + '15' : '#eff6ff'}; border-radius: 8px; margin-bottom: 12px; font-size: 14px; line-height: 1.6; border-left: 3px solid ${findings.runRateReality.statusColor || '#3b82f6'};">
                <strong>Status: ${findings.runRateReality.feasibility}</strong><br/>
                ${findings.runRateReality.insight}
              </div>
              
              ${findings.runRateReality.accelerationRequired != null && findings.runRateReality.accelerationRequired > 0 ? `
                <div style="padding: 10px 14px; background: white; border-radius: 6px; font-size: 13px; color: #374151; border: 1px solid #e5e7eb;">
                  <strong>Current vs Required:</strong> Running at ${findings.runRateReality.currentMonthlyMT?.toFixed(1) || 'N/A'} MT/month, 
                  need ${findings.runRateReality.requiredMonthlyMT?.toFixed(1) || 'N/A'} MT/month 
                  (${findings.runRateReality.accelerationRequired?.toFixed(0) || 'N/A'}% acceleration required)
                </div>
              ` : ''}
            </div>
          ` : ''}
        </div>
      `;
    })();
    
    return `
      ${kgsTableHTML}
      ${amountTableHTML}
      ${strategicAnalysisHTML}
    `;
  };

  // Generate Performance Dashboard HTML with Interactive Charts
  const generatePerformanceDashboard = (reportData, kgsData, amountData, customerData, customerAmountData, basePeriodIndex) => {
    if (!reportData || !kgsData || !amountData) return '';
    
    // Prepare YoY Growth Chart Data
    const prevIndex = basePeriodIndex - 1;
    const hasPreviousPeriod = prevIndex >= 0;
    
    // Filter and prepare product groups for YoY chart - Apply same >= 1 MT rule as Budget Achievement
    // NOTE: Exclusions are now handled at database level via is_unmapped flag
    // Admin controls exclusions in Master Data > Raw Product Groups
    let yoyProducts = kgsData.filter(pg => {
      const productGroup = pg.productGroup || pg.name || '';
      // Only filter 'not in pg' marker from database
      if (productGroup.toLowerCase() === 'not in pg') return false;
      
      const cur = pg.rawValues?.[basePeriodIndex] || 0;
      const prev = hasPreviousPeriod ? (pg.rawValues?.[prevIndex] || 0) : 0;
      const hasAnyValue = pg.rawValues?.some(val => (val || 0) > 0) || false;
      
      // Apply >= 1 MT rule: show if current OR previous >= 1000 KG
      const curAtLeastOneMT = cur >= 1000;
      const prevAtLeastOneMT = prev >= 1000;
      
      return hasAnyValue && (curAtLeastOneMT || prevAtLeastOneMT);
    });
    
    // Sort by current period value descending
    yoyProducts.sort((a, b) => (b.rawValues?.[basePeriodIndex] || 0) - (a.rawValues?.[basePeriodIndex] || 0));
    
    // Calculate YoY growth percentages and sort
    const yoyEntries = yoyProducts.map(pg => {
      const current = pg.rawValues[basePeriodIndex] || 0;
      const previous = hasPreviousPeriod ? (pg.rawValues[prevIndex] || 0) : 0;
      let percentage = 0;
      let mtDifference = 0;
      if (previous !== 0) {
        percentage = ((current - previous) / previous) * 100;
        mtDifference = (current - previous) / 1000;
      } else if (current !== 0) {
        percentage = 0;
        mtDifference = current / 1000;
      }
      return {
        label: pg.productGroup || pg.name || '',
        percentage: percentage,
        mtDifference: mtDifference,
        current: current,
        previous: previous
      };
    });
    
    // Store unsorted entries - sort by percentage (positives descending, negatives ascending)
    yoyEntries.sort((a, b) => {
      const aPos = a.percentage >= 0;
      const bPos = b.percentage >= 0;
      if (aPos && !bPos) return -1;
      if (!aPos && bPos) return 1;
      return aPos ? (b.percentage - a.percentage) : (a.percentage - b.percentage);
    });
    
    // Prepare Budget Achievement Chart Data - Apply same filtering rules as BudgetAchievementChart.js
    // NEW LOGIC: 3 periods - base-1 (previous), base (actual), base+1 (budget)
    // NOTE: Exclusions are now handled at database level via is_unmapped flag
    // NOTE: prevIndex already declared above for YoY chart
    const baseIndex = basePeriodIndex;
    const budgetIndex = basePeriodIndex + 1;
    
    const budgetProducts = kgsData.filter(pg => {
      const productGroup = pg.productGroup || pg.name || '';
      // Only filter 'not in pg' marker from database
      if (productGroup.toLowerCase() === 'not in pg') return false;
      return true;
    }).map(item => {
      const prevValue = prevIndex >= 0 ? (item.rawValues?.[prevIndex] || 0) : 0;
      const actualValue = item.rawValues?.[baseIndex] || 0;
      const budgetValue = budgetIndex < (reportData.columnOrder?.length || 0) ? (item.rawValues?.[budgetIndex] || 0) : 0;
      
      // Calculate YoY growth (actual vs prev)
      const yoyGrowth = prevValue > 0 ? ((actualValue - prevValue) / prevValue * 100) : 0;
      const yoyDelta = actualValue - prevValue;
      
      // Calculate budget achievement (actual vs budget)
      const budgetAchievement = budgetValue > 0 ? (actualValue / budgetValue * 100) : 0;
      const budgetDelta = actualValue - budgetValue;
      
      return {
        name: item.productGroup || item.name || '',
        prevValue: prevValue,
        actualValue: actualValue,
        budgetValue: budgetValue,
        yoyGrowth: yoyGrowth,
        yoyDelta: yoyDelta,
        budgetAchievement: budgetAchievement,
        budgetDelta: budgetDelta
      };
    }).filter(item => {
      // Same filter logic as BudgetAchievementChart.js
      const hasBudget = item.budgetValue > 0;
      const actualAtLeastOneMT = (item.actualValue >= 1000); // >= 1 MT
      return actualAtLeastOneMT || hasBudget;
    });
    
    budgetProducts.sort((a, b) => b.actualValue - a.actualValue);
    
    // Filter product groups for Product Groups Performance table - same >= 1 MT rule
    // NOTE: Exclusions are now handled at database level via is_unmapped flag
    const filteredProductGroups = kgsData.filter(pg => {
      const productGroup = pg.productGroup || pg.name || '';
      // Only filter 'not in pg' marker from database
      if (productGroup.toLowerCase() === 'not in pg') return false;
      
      const actualValue = pg.rawValues?.[basePeriodIndex] || 0;
      const hasAnyValue = pg.rawValues?.some(val => (val || 0) > 0) || false;
      
      // Apply >= 1 MT rule: show if has at least 1 MT in any period
      return hasAnyValue && actualValue >= 1000;
    });
    filteredProductGroups.sort((a, b) => (b.rawValues?.[basePeriodIndex] || 0) - (a.rawValues?.[basePeriodIndex] || 0));
    
    return `
      <div class="report-section" style="border-top: 1px solid #eee; padding-top: 30px; margin-top: 30px; page-break-before: always;">
        <h3 style="color: #667eea; font-size: 1.4em; margin-bottom: 25px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; text-align: center; border-bottom: 2px solid #667eea; padding-bottom: 12px;">
          📊 PERFORMANCE DASHBOARD
        </h3>
        
        <div class="tab-instructions" style="text-align: center; margin-bottom: 20px; padding: 12px 20px; background: linear-gradient(135deg, #f8f9fa, #ffffff); border: 1px solid #e9ecef; border-radius: 8px;">
          <p style="margin: 0; font-style: italic; color: #64748b; font-size: 14px;">
            Click on the tabs below to switch between different performance views
          </p>
          </div>
          
        <div class="perf-tab-buttons" style="display: flex; gap: 10px; margin-bottom: 20px; justify-content: center; flex-wrap: nowrap;">
          <button class="perf-tab-btn active" data-tab="yoy" style="padding: 12px 20px; border: 2px solid #667eea; background: #667eea; color: white; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 13px; transition: all 0.3s; line-height: 1.4; text-align: center; min-width: 140px;">
            📈<br>YoY Growth<br>by Product Group
          </button>
          <button class="perf-tab-btn" data-tab="budget" style="padding: 12px 20px; border: 2px solid #667eea; background: white; color: #667eea; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 13px; transition: all 0.3s; line-height: 1.4; text-align: center; min-width: 140px;">
            🎯<br>Budget Achievement<br>by Product Group
          </button>
          <button class="perf-tab-btn" data-tab="products" style="padding: 12px 20px; border: 2px solid #667eea; background: white; color: #667eea; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 13px; transition: all 0.3s; line-height: 1.4; text-align: center; min-width: 140px;">
            📊<br>Product Groups<br>Strategic Analysis
          </button>
          <button class="perf-tab-btn" data-tab="customers" style="padding: 12px 20px; border: 2px solid #667eea; background: white; color: #667eea; cursor: pointer; border-radius: 8px; font-weight: 600; font-size: 13px; transition: all 0.3s; line-height: 1.4; text-align: center; min-width: 140px;">
            👥<br>Customers<br>Performance Analysis
          </button>
        </div>
          
        <!-- YoY Growth Tab -->
        <div class="perf-tab-content active" id="yoy-tab">
          <h4 style="margin: 15px 0 10px 0; color: #1f2937; font-size: 18px; font-weight: 600; text-align: center;">
            ${hasPreviousPeriod ? `${formatPeriodLabel(reportData.columnOrder[basePeriodIndex])} vs ${formatPeriodLabel(reportData.columnOrder[prevIndex])} Year-over-Year Growth by Category` : 'Year-over-Year Growth Analysis'}
          </h4>
          <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); padding: 12px 20px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
            <p style="margin: 0; font-style: italic; color: #64748b; font-size: 14px;">
              Hover over bars for detailed performance analysis
            </p>
          </div>
          <div class="chart-container" style="width: 100%; position: relative;">
            <div id="yoyGrowthChart" style="width: 100%; height: ${Math.max(400, yoyEntries.length * 40)}px;"></div>
          </div>
        </div>
            
        <!-- Budget Achievement Tab -->
        <div class="perf-tab-content" id="budget-tab">
          <h4 style="margin: 15px 0 20px 0; color: #1f2937; font-size: 18px; font-weight: 600; text-align: center;">
            Budget Achievement
          </h4>
          <p style="font-style: italic; color: #666; margin: 0 0 12px 0; font-size: 13px; text-align: center;">
            Previous vs Actual vs Budget: bars show MT; right side shows YoY% and budget achievement.
          </p>
          
          <!-- Legend -->
          ${(() => {
            // Get the 3 period labels from columnOrder
            const cols = reportData.columnOrder || [];
            const prevCol = prevIndex >= 0 ? cols[prevIndex] : null;
            const baseCol = cols[baseIndex] || {};
            const budgetCol = budgetIndex < cols.length ? cols[budgetIndex] : null;
            
            // Helper to format column label with TYPE (matching live BudgetAchievementChart)
            const formatLabelWithType = (col) => {
              if (!col) return '';
              const month = (col.month || col.code || col.short || 'FY').toUpperCase();
              const year = col.year || '';
              const type = (col.type || 'Actual').toUpperCase();
              return `${month} ${year} ${type}`;
            };
            
            // Derive labels using formatLabelWithType for consistent "FY 2024 ACTUAL" format
            const prevLabel = prevCol ? formatLabelWithType(prevCol) : 'N/A';
            const actualLabel = formatLabelWithType(baseCol) || 'Actual';
            const budgetLabel = budgetCol ? formatLabelWithType(budgetCol) : 'N/A';
            
            return '<div style="display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 24px; margin-bottom: 20px;">' +
              '<div style="display: flex; align-items: center; gap: 20px;">' +
                '<div style="display: flex; align-items: center; gap: 6px;">' +
                  '<span style="width: 14px; height: 14px; background: #95A5A6; border-radius: 3px;"></span>' +
                  '<span style="color: #6b7280; font-size: 12px;">' + prevLabel + '</span>' +
                '</div>' +
                '<div style="display: flex; align-items: center; gap: 6px;">' +
                  '<span style="width: 14px; height: 14px; background: #F1C40F; border-radius: 3px;"></span>' +
                  '<span style="color: #6b7280; font-size: 12px;">' + actualLabel + '</span>' +
                '</div>' +
                '<div style="display: flex; align-items: center; gap: 6px;">' +
                  '<span style="width: 14px; height: 14px; background: #5DADE2; border-radius: 3px;"></span>' +
                  '<span style="color: #6b7280; font-size: 12px;">' + budgetLabel + '</span>' +
                '</div>' +
              '</div>' +
            '</div>';
          })()}
          
          <!-- Product Group Bars -->
          ${(() => {
            // Get the 3 period labels from columnOrder
            const cols = reportData.columnOrder || [];
            const prevCol = prevIndex >= 0 ? cols[prevIndex] : null;
            const baseCol = cols[baseIndex] || {};
            const budgetCol = budgetIndex < cols.length ? cols[budgetIndex] : null;
            
            // Helper to format column label with TYPE (matching live BudgetAchievementChart)
            const formatLabelWithType = (col) => {
              if (!col) return '';
              const month = (col.month || col.code || col.short || 'FY').toUpperCase();
              const year = col.year || '';
              const type = (col.type || 'Actual').toUpperCase();
              return `${month} ${year} ${type}`;
            };
            
            const productRows = budgetProducts.map(item => {
              const prevMT = item.prevValue / 1000;
              const actualMT = item.actualValue / 1000;
              const budgetMT = item.budgetValue / 1000;
              const yoyDeltaMT = item.yoyDelta / 1000;
              const budgetDeltaMT = item.budgetDelta / 1000;
              
              const maxValue = Math.max(prevMT, actualMT, budgetMT) * 1.05;
              const prevWidth = prevMT > 0 ? (prevMT / maxValue) * 100 : 0;
              const actualWidth = actualMT > 0 ? (actualMT / maxValue) * 100 : 0;
              const budgetWidth = budgetMT > 0 ? (budgetMT / maxValue) * 100 : 0;
              
              // Get period labels for display using formatLabelWithType for "FY 2024 ACTUAL" format
              const prevLabel = prevCol ? formatLabelWithType(prevCol) : '';
              const actualLabel = formatLabelWithType(baseCol) || 'ACTUAL';
              const budgetLabelText = budgetCol ? formatLabelWithType(budgetCol) : '';
              
              // Build the 3 rows for each product group (matching live component exactly)
              let rows = '';
              
              // Row 1: Previous (gray) - only show if prev period exists
              if (prevIndex >= 0) {
                rows += '<div style="display: flex; align-items: center; gap: 6px;">' +
                  '<div style="flex: 1; height: 24px; background: transparent; position: relative;">' +
                    (prevMT > 0 
                      ? '<div style="height: 100%; width: ' + prevWidth + '%; background: #95A5A6; border-radius: 3px;"></div>'
                      : '<div style="width: 100%; text-align: center; color: #6b7280; font-size: 12px; line-height: 24px;">No data</div>') +
                  '</div>' +
                  '<div style="min-width: 50px; font-size: 12px; font-weight: 700; color: #7f8c8d;">' + (prevMT >= 1 ? Math.round(prevMT) + ' MT' : '') + '</div>' +
                  '<div style="width: 200px; text-align: right; font-size: 12px; padding-left: 10px;"><span style="color: #6b7280;">' + prevLabel + '</span></div>' +
                '</div>';
              }
              
              // Row 2: Actual (yellow) - with YoY% if prev period exists, otherwise show period label
              rows += '<div style="display: flex; align-items: center; gap: 6px;">' +
                '<div style="flex: 1; height: 24px; background: transparent; position: relative;">' +
                  '<div style="height: 100%; width: ' + actualWidth + '%; background: #F1C40F; border-radius: 3px;"></div>' +
                '</div>' +
                '<div style="min-width: 50px; font-size: 12px; font-weight: 700; color: #111827;">' + (actualMT >= 1 ? Math.round(actualMT) + ' MT' : '') + '</div>' +
                '<div style="width: 200px; text-align: right; font-size: 12px; line-height: 1.3; padding-left: 10px; white-space: nowrap;">' +
                  (prevIndex >= 0 && item.prevValue > 0
                    ? '<span style="color: #6b7280;">YoY: </span>' +
                      '<span style="color: ' + (item.yoyGrowth >= 0 ? '#1f6feb' : '#dc2626') + '; font-weight: 800;">' + (item.yoyGrowth >= 0 ? '+' : '') + item.yoyGrowth.toFixed(1) + '%</span>' +
                      '<span style="color: ' + (yoyDeltaMT >= 0 ? '#1f6feb' : '#dc2626') + ';"> (' + (yoyDeltaMT >= 0 ? '+' : '') + yoyDeltaMT.toFixed(1) + ' MT)</span>'
                    : '<span style="color: #6b7280;">' + actualLabel + '</span>') +
                '</div>' +
              '</div>';
              
              // Row 3: Budget (blue) - with budget achievement % (vs Budget: to match live)
              if (budgetIndex < cols.length) {
                rows += '<div style="display: flex; align-items: center; gap: 6px;">' +
                  '<div style="flex: 1; height: 24px; background: transparent; position: relative;">' +
                    (budgetMT > 0 
                      ? '<div style="height: 100%; width: ' + budgetWidth + '%; background: #5DADE2; border-radius: 3px;"></div>'
                      : '<div style="width: 100%; text-align: center; color: #6b7280; font-size: 12px; line-height: 24px;">Not budgeted</div>') +
                  '</div>' +
                  '<div style="min-width: 50px; font-size: 12px; font-weight: 700; color: #0f6085;">' + (budgetMT > 0 ? Math.round(budgetMT) + ' MT' : '') + '</div>' +
                  '<div style="width: 200px; text-align: right; font-size: 12px; line-height: 1.3; padding-left: 10px; white-space: nowrap;">' +
                    (budgetMT > 0
                      ? '<span style="color: #6b7280;">vs Budget: </span>' +
                        '<span style="color: ' + (item.budgetAchievement >= 100 ? '#1f6feb' : '#dc2626') + '; font-weight: 800;">' + item.budgetAchievement.toFixed(1) + '%</span>' +
                        '<span style="color: ' + (budgetDeltaMT >= 0 ? '#1f6feb' : '#dc2626') + ';"> (' + (budgetDeltaMT >= 0 ? '+' : '') + budgetDeltaMT.toFixed(1) + ' MT)</span>'
                      : '<span style="color: #6b7280;">' + budgetLabelText + '</span>') +
                  '</div>' +
                '</div>';
              }
              
              return '<div style="padding: 10px 0; border-bottom: 1px dashed #e5e7eb; margin-bottom: 0;">' +
                '<div style="font-size: 14px; font-weight: 700; color: #374151; margin: 0 0 10px 2px;">' + item.name + '</div>' +
                '<div style="display: flex; flex-direction: column; gap: 4px;">' + rows + '</div>' +
              '</div>';
            }).join('');
            
            return '<div style="font-family: ui-sans-serif, system-ui, -apple-system, \'Segoe UI\', Roboto, Helvetica, Arial;">' + productRows + '</div>';
          })()}
        </div>
        
        <!-- Product Groups Performance Tab -->
        <div class="perf-tab-content" id="products-tab">
          <!-- This tab will contain 3 sections to match the original:
               1. ProductGroupsKgsTable - MT Comparison Table
               2. ProductGroupsAmountTable - AED Sales Comparison Table
               3. ProductGroupKeyFacts - Product Groups Strategic Analysis -->
          
          ${generateProductGroupsPerformanceTab(reportData, kgsData, amountData, basePeriodIndex, strategicFindings)}
        </div>
          
        <!-- Customers Performance Tab -->
        <div class="perf-tab-content" id="customers-tab">
          ${generateCustomersPerformanceTab(customerData, customerAmountData, reportData, basePeriodIndex, customerFindings)}
        </div>
        
        <script>
          // Store chart data in global window scope for chart initialization
          window.yoyChartData = ${JSON.stringify(yoyEntries)};
          window.budgetChartData = ${JSON.stringify(budgetProducts)};
          
        </script>
      </div>
    `;
  };

  // Generate comprehensive page content
  const generatePageContent = (logoBase64) => {
    // CRITICAL: Use live table data if available, otherwise fall back to props
    // This ensures export matches exactly what the user sees in the live tables
    const exportCustomerData = liveCustomerKgsData || customerData;
    const exportCustomerAmountData = liveCustomerAmountData || customerAmountData;
    
    console.log('📤 EXPORT - Using customer data:', {
      usingLiveKgsData: !!liveCustomerKgsData,
      usingLiveAmountData: !!liveCustomerAmountData,
      kgsDataCount: exportCustomerData?.length || 0,
      amountDataCount: exportCustomerAmountData?.length || 0,
      sampleKgsCustomers: exportCustomerData?.slice(0, 3).map(c => ({
        name: c.name || c.customerName,
        rawValues: c.rawValues
      }))
    });
    
    if (reportType === 'individual' && reportData) {
      // Generate individual sales rep report content - EXCLUDING export button
      return `
        <div class="sales-rep-report-content">
          <div class="report-container">
            <!-- Report Header -->
            <div class="report-header">
              <div class="header-content">
                ${logoBase64 ? `<img src="${logoBase64}" alt="Company Logo" class="header-logo">` : ''}
                <h1>${toProperCase(rep)} Sales Report</h1>
                <h2>${divisionName} Division</h2>
                <div class="report-period">
                  <div class="period-year">${formatPeriodLabel(reportData.basePeriod)}</div>
                  <div class="period-type">Performance Analysis</div>
                </div>
              </div>
            </div>
            
            <!-- KPI'S Summary -->
            <div class="report-section">
              <h2>KPI'S SUMMARY</h2>
              
              <div class="metric-row">
                <div class="metric-card">
                  <div class="metric-label">VOLUME ${formatPeriodLabel(reportData.basePeriod).toUpperCase()}</div>
                  <div class="metric-value" style="color: #003366;">${formatMT(reportData.performanceMetrics?.totalKgs || 0)} MT</div>
                  <div class="metric-previous">Previous Period: ${formatMT(reportData.kgsTotals?.[reportData.basePeriodIndex - 1] || 0)} MT</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">YOY GROWTH</div>
                  <div class="metric-value ${(reportData.basePeriodIndex > 0 && reportData.kgsTotals?.[reportData.basePeriodIndex - 1]) ? ((reportData.performanceMetrics?.totalKgs - reportData.kgsTotals[reportData.basePeriodIndex - 1]) / reportData.kgsTotals[reportData.basePeriodIndex - 1] * 100 > 0 ? 'positive' : 'negative') : ''}" style="color: ${(reportData.basePeriodIndex > 0 && reportData.kgsTotals?.[reportData.basePeriodIndex - 1]) ? ((reportData.performanceMetrics?.totalKgs - reportData.kgsTotals[reportData.basePeriodIndex - 1]) / reportData.kgsTotals[reportData.basePeriodIndex - 1] * 100 > 0 ? '#007bff' : '#dc3545') : '#17a2b8'};">
                    ${(reportData.basePeriodIndex > 0 && reportData.kgsTotals?.[reportData.basePeriodIndex - 1] > 0) ? 
                      ((reportData.performanceMetrics?.totalKgs - reportData.kgsTotals[reportData.basePeriodIndex - 1]) / reportData.kgsTotals[reportData.basePeriodIndex - 1] * 100 > 0 ? '+' : '') +
                      (((reportData.performanceMetrics?.totalKgs - reportData.kgsTotals[reportData.basePeriodIndex - 1]) / reportData.kgsTotals[reportData.basePeriodIndex - 1] * 100).toFixed(1)) + '%'
                      : '<div style="font-size: 16px; color: #17a2b8; font-weight: bold;">🆕 New</div>'}
                  </div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">${formatPeriodLabel(reportData.basePeriod).toUpperCase()} BUDGET ACHIEVEMENT</div>
                  ${reportData.kgsTotals?.[reportData.basePeriodIndex + 1] > 0 ? 
                    `<div class="metric-value" style="color: #007bff;">${Math.round((reportData.performanceMetrics?.totalKgs / reportData.kgsTotals[reportData.basePeriodIndex + 1]) * 100)}%</div>
                    <div class="metric-previous">(${yearlyBudgetAchievement.toFixed(1)}% of yearly Budget)</div>` :
                    `<div class="metric-value" style="color: #6c757d; font-size: 14px;">No budget</div>`}
                </div>
              </div>
              
              <!-- Second row - Sales (Amount) metrics -->
              <div class="metric-row">
                <div class="metric-card">
                  <div class="metric-label">SALES ${formatPeriodLabel(reportData.basePeriod).toUpperCase()}</div>
                  <div class="metric-value" style="color: #003366;">${formatNumber(reportData.performanceMetrics?.totalAmount || 0, true)}</div>
                  <div class="metric-previous">Previous Period: ${formatNumber(reportData.amountTotals?.[reportData.basePeriodIndex - 1] || 0, true)}</div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">SALES YOY GROWTH</div>
                  <div class="metric-value ${(reportData.basePeriodIndex > 0 && reportData.amountTotals?.[reportData.basePeriodIndex - 1]) ? ((reportData.performanceMetrics?.totalAmount - reportData.amountTotals[reportData.basePeriodIndex - 1]) / reportData.amountTotals[reportData.basePeriodIndex - 1] * 100 > 0 ? 'positive' : 'negative') : ''}" style="color: ${(reportData.basePeriodIndex > 0 && reportData.amountTotals?.[reportData.basePeriodIndex - 1]) ? ((reportData.performanceMetrics?.totalAmount - reportData.amountTotals[reportData.basePeriodIndex - 1]) / reportData.amountTotals[reportData.basePeriodIndex - 1] * 100 > 0 ? '#007bff' : '#dc3545') : '#17a2b8'};">
                    ${(reportData.basePeriodIndex > 0 && reportData.amountTotals?.[reportData.basePeriodIndex - 1] > 0) ? 
                      ((reportData.performanceMetrics?.totalAmount - reportData.amountTotals[reportData.basePeriodIndex - 1]) / reportData.amountTotals[reportData.basePeriodIndex - 1] * 100 > 0 ? '+' : '') +
                      (((reportData.performanceMetrics?.totalAmount - reportData.amountTotals[reportData.basePeriodIndex - 1]) / reportData.amountTotals[reportData.basePeriodIndex - 1] * 100).toFixed(1)) + '%'
                      : '<div style="font-size: 16px; color: #17a2b8; font-weight: bold;">🆕 New</div>'}
                  </div>
                </div>
                <div class="metric-card">
                  <div class="metric-label">${formatPeriodLabel(reportData.basePeriod).toUpperCase()} SALES BUDGET ACHIEVEMENT</div>
                  ${reportData.amountTotals?.[reportData.basePeriodIndex + 1] > 0 ? 
                    `<div class="metric-value" style="color: #007bff;">${Math.round((reportData.performanceMetrics?.totalAmount / reportData.amountTotals[reportData.basePeriodIndex + 1]) * 100)}%</div>
                    <div class="metric-previous">(${yearlySalesBudgetAchievement.toFixed(1)}% of yearly Budget)</div>` :
                    `<div class="metric-value" style="color: #6c757d; font-size: 14px;">No budget</div>`}
                </div>
              </div>
            </div>
            
            ${generateTop3ProductGroups(kgsData, reportData, basePeriodIndex)}
            
            ${generateCustomerInsights(exportCustomerData, basePeriodIndex, reportData)}
            
            ${generateGeographicDistribution(reportData, exportCustomerData, basePeriodIndex)}
            
            ${generatePerformanceDashboard(reportData, kgsData, amountData, exportCustomerData, exportCustomerAmountData, basePeriodIndex)}
          </div>
        </div>
      `;
    } else if (reportType === 'tables' && kgsData && amountData) {
      // Generate tables view content - EXCLUDING export button and table options
      // Determine delta label for simplified tables
      const fromCol = basePeriodIndex > 0 && columnOrder ? columnOrder[basePeriodIndex - 1] : null;
      const toCol = columnOrder ? columnOrder[basePeriodIndex] : null;
      const simpleDeltaLabel = fromCol && toCol ? sharedGetDeltaLabel(fromCol, toCol) : 'Δ';
      
      return `
        <div class="sales-rep-content">
          <div class="sales-rep-title">${toProperCase(rep)}</div>
          <div class="sales-rep-subtitle">Product Groups - Sales Kgs Comparison</div>
          
          <div class="product-groups-kgs-table">
            <h3>Product Groups Performance (KGS)</h3>
            <div class="table-scroll-wrapper">
            <table class="kgs-comparison-table">
              <thead>
                <tr>
                  <th class="product-header">Product Groups</th>
                  ${columnOrder ? columnOrder.map(col => `
                    <th class="period-header">${formatPeriodLabel(col)}</th>
                  `).join('') : ''}
                  <th class="delta-header">${simpleDeltaLabel} %</th>
                </tr>
              </thead>
              <tbody>
                ${kgsData.map(product => `
                  <tr class="product-row">
                    <td class="product-name">${product.productGroup}</td>
                    ${product.rawValues.map(value => `
                      <td class="metric-cell">${formatNumber(value)}</td>
                    `).join('')}
                    <td class="delta-cell">
                      <span class="delta-arrow">${basePeriodIndex > 0 && product.rawValues[basePeriodIndex] > product.rawValues[basePeriodIndex - 1] ? '↑' : '↓'}</span>
                      <span class="delta-value ${basePeriodIndex > 0 && product.rawValues[basePeriodIndex] > product.rawValues[basePeriodIndex - 1] ? 'delta-up' : 'delta-down'}">
                        ${basePeriodIndex > 0 ? Math.abs(((product.rawValues[basePeriodIndex] - product.rawValues[basePeriodIndex - 1]) / product.rawValues[basePeriodIndex - 1] * 100)).toFixed(1) : '0'}%
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      `;
    } else if (reportType === 'divisional' && salesReps && salesRepData) {
      // Generate divisional table content - EXCLUDING export button and table options
      // Determine delta label for simplified tables
      const fromColDiv = basePeriodIndex > 0 && columnOrder ? columnOrder[basePeriodIndex - 1] : null;
      const toColDiv = columnOrder ? columnOrder[basePeriodIndex] : null;
      const simpleDeltaLabelDiv = fromColDiv && toColDiv ? sharedGetDeltaLabel(fromColDiv, toColDiv) : 'Δ';
      
      return `
        <div class="table-view">
          <div class="table-container-for-export">
            <div class="table-title">
              <h2>Sales by Sales Rep - ${selectedDivision}</h2>
              <div class="table-subtitle">
                <div style="font-size: 18px; font-weight: bold;">
                  ${getCurrencySymbolHTML(companyCurrency)}
                </div>
              </div>
            </div>
            
            <div class="product-groups-kgs-table">
              <h3>Sales Rep Performance Summary</h3>
              <div class="table-scroll-wrapper">
              <table class="kgs-comparison-table">
                <thead>
                  <tr>
                    <th class="product-header">Sales Rep</th>
                    ${columnOrder ? columnOrder.map(col => `
                      <th class="period-header">${formatPeriodLabel(col)}</th>
                    `).join('') : ''}
                    <th class="delta-header">${simpleDeltaLabelDiv} %</th>
                  </tr>
                </thead>
                <tbody>
                  ${salesReps.map(rep => {
                    const repData = salesRepData[rep];
                    return `
                      <tr class="product-row">
                        <td class="product-name">${toProperCase(rep)}</td>
                        ${repData ? repData.rawValues.map(value => `
                          <td class="metric-cell">${formatNumber(value)}</td>
                        `).join('') : columnOrder.map(() => '<td class="metric-cell">0</td>').join('')}
                        <td class="delta-cell">
                          <span class="delta-arrow">${basePeriodIndex > 0 && repData && repData.rawValues[basePeriodIndex] > repData.rawValues[basePeriodIndex - 1] ? '↑' : '↓'}</span>
                          <span class="delta-value ${basePeriodIndex > 0 && repData && repData.rawValues[basePeriodIndex] > repData.rawValues[basePeriodIndex - 1] ? 'delta-up' : 'delta-down'}">
                            ${basePeriodIndex > 0 && repData ? Math.abs(((repData.rawValues[basePeriodIndex] - repData.rawValues[basePeriodIndex - 1]) / repData.rawValues[basePeriodIndex - 1] * 100)).toFixed(1) : '0'}%
                          </span>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      `;
    }
    
    return '<div class="no-data-container"><h3>No data available for export</h3></div>';
  };

  // Convert logo to base64 for embedding
  const getBase64Logo = async () => {
    try {
      const response = await fetch(ipTransparentLogo);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.warn('Could not load IP transparent logo for sales rep export:', error);
      return null;
    }
  };

  // Fetch chart libraries for offline embedding
  const getChartLibraries = async () => {
    try {
      const [chartJs, chartDataLabels, echartsLib] = await Promise.all([
        fetch('/libs/chart.umd.min.js').then(r => r.text()).catch(() => ''),
        fetch('/libs/chartjs-plugin-datalabels.min.js').then(r => r.text()).catch(() => ''),
        fetch('/libs/echarts.min.js').then(r => r.text()).catch(() => '')
      ]);
      return { chartJs, chartDataLabels, echartsLib };
    } catch (error) {
      console.warn('Could not load chart libraries for embedding:', error);
      return { chartJs: '', chartDataLabels: '', echartsLib: '' };
    }
  };



  // Generate HTML export
  const handleExport = async () => {

    // Check if all required data is ready before proceeding
    if (reportType === 'individual') {
      if (!strategicFindings) {
        console.warn('⏳ Skipping export: strategicFindings not ready');
        alert('Export cannot proceed: Product group analysis is still being calculated. Please wait a moment and try again.');
        return;
      }
      if (!customerFindings) {
        console.warn('⏳ Skipping export: customerFindings not ready');
        alert('Export cannot proceed: Customer analysis is still being calculated. Please wait a moment and try again.');
        return;
      }
      // Check if yearly budget data is ready (should be > 0 if data exists)
      if (yearlyBudgetAchievement === 0 && yearlySalesBudgetAchievement === 0) {
        console.warn('⏳ Yearly budget data may not be ready yet:', { yearlyBudgetAchievement, yearlySalesBudgetAchievement });
        // Don't block - it's possible there's genuinely no budget data
      }
    }
    setIsExporting(true);
    
    try {
      // Get logo as base64 and chart libraries for offline use
      const [logoBase64, chartLibraries] = await Promise.all([
        getBase64Logo(),
        getChartLibraries()
      ]);
      
      // Use yearly budget values directly from props (already fetched by ExecutiveSummary.js)
      
      // Capture current page content (pass logoBase64 for embedding)
      const pageContent = generatePageContent(logoBase64);
      
      // Generate filename with new format: {sales rep name}_Sales Report_{Base period}
      const repName = rep ? toProperCase(rep).replace(/\s+/g, '_') : 'Sales_Rep';
      const currentPeriod = columnOrder && basePeriodIndex !== null ? 
        formatPeriodLabel(columnOrder[basePeriodIndex]).replace(/\s+/g, '_') : 'Current_Period';
      const filename = `${repName}_Sales Report_${currentPeriod}.html`;
      
      // Generate period display text
      const periodDisplayText = `Report Period: ${currentPeriod.replace(/_/g, ' ')}`;
      
      // Create comprehensive HTML with all styles and content
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${repName} Sales Report</title>
    <!-- Chart.js embedded for offline use -->
    <script>
${chartLibraries.chartJs}
    </script>
    <script>
${chartLibraries.chartDataLabels}
    </script>
    <!-- ECharts embedded for offline use -->
    <script>
${chartLibraries.echartsLib}
    </script>
    <script>
        // Verify libraries loaded
        if (typeof Chart === 'undefined') {
        }
        if (typeof echarts === 'undefined') {
        }
        
        // UAE Dirham symbol function
        function getCurrencySymbolHTML(companyCurrency) {
            return '${getCurrencySymbolHTML(companyCurrency)}';
        }
    </script>
    <style>
        ${KPI_CSS_CONTENT}
        
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #e3f2fd;
            min-height: 100vh;
        }
        
        /* ======= EDIT MODE STYLES ======= */
        #edit-toolbar {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            gap: 10px;
            align-items: center;
            background: linear-gradient(135deg, #1e3a8a, #3b82f6);
            padding: 12px 20px;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(30, 58, 138, 0.4);
            animation: slideIn 0.3s ease-out;
        }
        
        @keyframes slideIn {
            from { transform: translateX(100px); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        
        .toolbar-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            white-space: nowrap;
        }
        
        .toolbar-btn.edit-btn {
            background: white;
            color: #1e3a8a;
        }
        
        .toolbar-btn.edit-btn:hover {
            background: #f0f9ff;
            transform: translateY(-2px);
        }
        
        .toolbar-btn.edit-btn.active {
            background: #fef3c7;
            color: #92400e;
            box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.5);
        }
        
        .toolbar-btn.save-btn {
            background: #10b981;
            color: white;
        }
        
        .toolbar-btn.save-btn:hover {
            background: #059669;
            transform: translateY(-2px);
        }
        
        .toolbar-btn.print-btn {
            background: #6366f1;
            color: white;
        }
        
        .toolbar-btn.print-btn:hover {
            background: #4f46e5;
            transform: translateY(-2px);
        }
        
        .edit-status {
            font-size: 13px;
            font-weight: 500;
            color: white;
            margin-left: 8px;
        }
        
        /* Editable content styling */
        .editable-content {
            outline: 2px dashed transparent;
            border-radius: 4px;
            transition: all 0.2s ease;
            min-height: 1em;
            padding: 2px 4px;
            margin: -2px -4px;
        }
        
        .editable-content:hover {
            outline-color: #93c5fd;
            background: rgba(147, 197, 253, 0.1);
        }
        
        .editable-content:focus {
            outline-color: #3b82f6;
            outline-style: solid;
            background: rgba(59, 130, 246, 0.05);
            box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1);
        }
        
        /* Edit mode indicator for body */
        body.edit-mode-active::before {
            content: '';
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #fbbf24, #f59e0b, #fbbf24);
            z-index: 9999;
            animation: editPulse 2s ease-in-out infinite;
        }
        
        @keyframes editPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
        }
        
        /* Hide toolbar and edit indicators when printing */
        @media print {
            #edit-toolbar {
                display: none !important;
            }
            body.edit-mode-active::before {
                display: none !important;
            }
            .editable-content {
                outline: none !important;
                background: transparent !important;
                box-shadow: none !important;
            }
            .editable-section {
                box-shadow: none !important;
            }
        }
        
        /* Editable section highlight */
        .editable-section {
            position: relative;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3) !important;
        }
        
        .editable-section::after {
            content: '✏️ Editable Section';
            position: absolute;
            top: -12px;
            right: 20px;
            background: #3b82f6;
            color: white;
            font-size: 11px;
            font-weight: 600;
            padding: 4px 10px;
            border-radius: 4px;
            z-index: 10;
        }
        /* ======= END EDIT MODE STYLES ======= */
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 20px;
        }
        
        /* UAE Dirham symbol uses SVG fallback - no custom font needed */
        .uae-symbol {
            font-family: sans-serif;
        }
        
        .uae-symbol.fallback {
            font-family: sans-serif !important;
        }
        
        /* UAE Dirham Symbol - SVG based, no font loading needed */
        .uae-dirham-symbol {
          display: inline-block;
          vertical-align: -0.1em;
          width: 1em;
          height: 1em;
          margin-right: 0.2em;
          fill: currentColor;
        }
        
        /* EXACT Sales Rep Report Styles from SalesRepReport.css */
        .sales-rep-report-content {
            padding: 20px;
            background-color: #f8f9fa;
            min-height: 100vh;
        }

        .report-container {
            max-width: 98%;
            width: 100%;
            margin: 0 auto;
            background: white;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            overflow: visible;
        }

        /* Sales Rep Content Styles - EXACT from SalesBySalesRepTable.css */
        .sales-rep-content {
            margin: 20px;
            overflow-x: hidden;
        }

        .sales-rep-title {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 10px;
            text-align: center;
        }

        .sales-rep-subtitle {
            font-size: 16px;
            color: #666;
            margin-bottom: 20px;
            text-align: center;
            font-weight: 500;
        }

        .table-title {
            margin-bottom: 20px;
            text-align: center;
        }

        .table-title h2 {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin: 0 0 10px 0;
        }

        .table-subtitle {
            margin-bottom: 15px;
        }

        .table-container-for-export {
            margin: 20px;
            overflow-x: hidden;
        }

        .table-view {
            margin: 20px;
            overflow-x: hidden;
        }

        .table-container {
            margin-top: 20px;
        }

        /* Additional table styling to match original exactly */
        .financial-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
        }

        .financial-table th {
            padding: 8px;
            text-align: center;
            border: 1px solid #ddd;
            font-weight: bold;
            font-size: 14px;
        }

        .financial-table td {
            padding: 8px;
            text-align: center;
            border: 1px solid #ddd;
            font-size: 12px;
        }

        /* Ensure proper spacing and alignment */
        .no-data-container {
            text-align: center;
            padding: 40px;
            color: #666;
        }

        .no-data-container h3 {
            font-size: 18px;
            font-weight: 500;
            margin: 0;
        }

        /* Report Header */
        .report-header {
            background: linear-gradient(135deg, #4a90e2, #87ceeb);
            color: white;
            padding: 30px 20px 40px 20px;
            text-align: center;
        }

        .header-logo {
            max-height: 100px;
            max-width: 220px;
            margin-bottom: 25px;
            filter: drop-shadow(2px 2px 1px rgba(0,0,0,0.4))
                    drop-shadow(4px 4px 3px rgba(0,0,0,0.3))
                    drop-shadow(8px 8px 6px rgba(0,0,0,0.2))
                    drop-shadow(12px 12px 10px rgba(0,0,0,0.15))
                    drop-shadow(16px 16px 15px rgba(0,0,0,0.1));
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            cursor: pointer;
        }

        .header-logo:hover {
            transform: scale(1.08) translateY(-5px);
            filter: drop-shadow(3px 3px 2px rgba(0,0,0,0.5))
                    drop-shadow(6px 6px 5px rgba(0,0,0,0.35))
                    drop-shadow(12px 12px 10px rgba(0,0,0,0.25))
                    drop-shadow(18px 18px 15px rgba(0,0,0,0.18))
                    drop-shadow(24px 24px 25px rgba(0,0,0,0.12));
        }

        .header-content h1 {
            font-size: 2.5em;
            margin: 0 0 10px 0;
            font-weight: 700;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            color: white !important;
        }

        .header-content h2 {
            font-size: 1.8em;
            margin: 0 0 15px 0;
            font-weight: 500;
            opacity: 0.9;
            color: white !important;
        }

        .report-period {
            font-size: 1.3em;
            opacity: 0.9;
            font-weight: 500;
            color: white !important;
        }

        .period-year {
            font-size: 1.4em;
            font-weight: 600;
            margin-bottom: 5px;
            color: white !important;
        }

        .period-type {
            font-size: 1.1em;
            font-weight: 400;
            color: white !important;
            margin-bottom: 10px;
        }

        .period-description {
            font-size: 0.9em;
            font-weight: 300;
            color: rgba(255, 255, 255, 0.9) !important;
            max-width: 800px;
            margin: 15px auto 0;
            line-height: 1.4;
        }

        /* Report Sections */
        .report-section {
            padding: 30px;
            border-bottom: 1px solid #eee;
        }

        .report-section:last-child {
            border-bottom: none;
        }

        .report-section h2 {
            color: #667eea;
            font-size: 1.4em;
            margin-bottom: 25px;
            padding-bottom: 12px;
            border-bottom: 2px solid #667eea;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: center;
        }

        /* Ensure non-report-section blocks (like PerformanceDashboard) match the same title style */
        .section h2 {
            color: #667eea;
            font-size: 1.4em;
            margin-bottom: 25px;
            padding-bottom: 12px;
            border-bottom: 2px solid #667eea;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            text-align: center;
        }
        
        /* Executive Summary */
        .summary-description {
            color: #666;
            font-size: 1.1em;
            margin-bottom: 25px;
            text-align: center;
            font-style: italic;
        }

        .metric-row {
            display: flex;
            gap: 30px;
            margin: 25px 0;
            justify-content: center;
            flex-wrap: wrap;
        }

        .metric-card {
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border: 2px solid #dee2e6;
            border-radius: 12px;
            padding: 25px;
            text-align: center;
            min-width: 200px;
            flex: 1;
            max-width: 300px;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            position: relative;
            overflow: hidden;
        }

        /* Top banner gradient for metric cards */
        .metric-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 6px;
            background: linear-gradient(to right, #1e3a8a, #3b82f6, #60a5fa);
            border-radius: 12px 12px 0 0;
        }

        .metric-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.15);
        }

        .metric-label {
            font-size: 0.9em;
            color: #666;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 10px;
        }

        .metric-value {
            font-size: 2.5em;
            font-weight: 700;
            color: #003366;
            margin-bottom: 5px;
            line-height: 1.1;
        }

        .metric-value.positive {
            color: #007bff;
        }

        .metric-value.negative {
            color: #dc3545;
        }

        .metric-value.warning {
            color: #f39c12;
        }

        .metric-previous {
            font-size: 0.9em;
            color: #666;
            font-weight: 500;
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid #eee;
        }

        /* Top 3 Product Groups Styles */
        .top-products-horizontal {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
            width: 100%;
        }

        .top-product-card {
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border: 1px solid #dee2e6;
            border-left: 4px solid #667eea;
            border-radius: 12px;
            padding: 20px;
            min-width: 280px;
            max-width: 320px;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 12px;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .top-product-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.1);
        }

        .product-rank {
            display: flex;
            justify-content: center;
            margin-bottom: 8px;
        }

        .rank-icon {
            font-size: 2em;
            min-width: 40px;
            text-align: center;
        }

        .product-info {
            text-align: center;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
        }

        .top-product-card .product-info .product-name {
            font-weight: bold !important;
            color: #333;
            font-size: 1.1em;
            margin-bottom: 4px;
            line-height: 1.3;
            text-align: center !important;
            width: 100%;
            display: block;
            margin-left: auto;
            margin-right: auto;
            padding: 0;
            box-sizing: border-box;
        }

        .product-percentage {
            font-size: 0.9em;
            color: #666;
            font-weight: 500;
            text-align: center;
            width: 100%;
        }

        .product-performance {
            text-align: center;
            font-weight: 600;
            font-size: 0.9em;
            padding: 6px 12px;
            border-radius: 6px;
            margin-top: auto;
        }

        .product-performance.positive {
            color: #007bff;
            background-color: rgba(0, 123, 255, 0.1);
        }

        .product-performance.negative {
            color: #dc3545;
            background-color: rgba(220, 53, 69, 0.1);
        }

        /* Customer Insights Styles */
        .customer-insights-section {
            margin-top: 40px;
            padding: 30px;
            background: linear-gradient(135deg, #f8f9fa, #ffffff);
            border-radius: 15px;
            border: 1px solid #dee2e6;
        }

        .customer-insights-header {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 2px solid #667eea;
        }

        .insights-icon {
            font-size: 1.5em;
        }

        .customer-insights-header h3 {
            color: #667eea;
            font-size: 1.4em;
            font-weight: 700;
            letter-spacing: 1px;
            margin: 0;
        }

        .customer-insights-grid {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            grid-template-rows: auto auto;
            gap: 20px;
            margin-top: 20px;
        }

        .customer-insight-card-tall {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            position: relative;
            overflow: hidden;
            grid-row: span 2;
            grid-column: 1;
            border-top: 6px solid #667eea;
        }

        .top5-list {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin-bottom: 12px;
        }

        .top5-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: #f8f9fa;
            border-radius: 8px;
        }

        .top5-item .customer-name {
            font-size: 0.95em;
            font-weight: 600;
            color: #333;
            text-align: left;
        }

        .top5-item .customer-percentage {
            font-size: 1.1em;
            font-weight: 700;
            color: #667eea;
        }

        .customer-insight-card-small {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            position: relative;
            overflow: hidden;
            border-top: 6px solid #667eea;
        }

        .customer-insight-card-small:nth-child(2) {
            grid-column: 3;
            grid-row: 1;
        }

        .customer-insight-card-small:nth-child(4) {
            grid-column: 3;
            grid-row: 2;
        }

        .customer-insight-card-center {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 24px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            position: relative;
            overflow: hidden;
            grid-column: 2;
            grid-row: span 2;
            border-top: 6px solid #667eea;
        }

        .customer-insights-cards {
            display: flex;
            gap: 20px;
            justify-content: center;
            flex-wrap: wrap;
            max-width: 900px;
            margin: 0 auto;
        }

        .customer-insight-card {
            background: linear-gradient(135deg, #ffffff, #f8f9fa);
            border: 1px solid #dee2e6;
            border-radius: 12px;
            padding: 20px;
            min-width: 250px;
            max-width: 280px;
            flex: 1 1 250px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
            overflow: hidden;
            position: relative;
        }

        /* Top banner gradient */
        .customer-insight-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 6px;
            background: linear-gradient(to right, #1e3a8a, #3b82f6, #60a5fa);
            border-radius: 12px 12px 0 0;
        }

        .customer-insight-card:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0,0,0,0.1);
        }

        .insight-icon {
            font-size: 2.5em;
            margin-bottom: 12px;
        }

        .insight-title {
            font-weight: 600;
            color: #333;
            font-size: 1em;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .insight-value {
            font-size: 2.2em;
            font-weight: 700;
            color: #667eea;
            margin-bottom: 8px;
            line-height: 1.1;
        }

        .insight-subtitle {
            font-size: 0.9em;
            color: #666;
            font-weight: 500;
            margin-bottom: 8px;
            line-height: 1.3;
            min-height: 20px;
        }

        .insight-footer {
            font-size: 0.8em;
            color: #888;
            font-weight: 400;
        }

        .customer-list {
            max-height: 120px;
            overflow-y: auto;
            width: 100%;
            text-align: center;
        }

        .customer-name-line {
            font-size: 0.85em;
            color: #666;
            font-weight: 500;
            margin-bottom: 3px;
            padding: 2px 0;
            line-height: 1.2;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
            display: block;
        }

        .customer-name-line:last-child {
            margin-bottom: 0;
        }

        /* Geographic Distribution Section - EXACT from ExecutiveSummary.css */
        .geo-distribution-container {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 32px !important;
            width: 100% !important;
            max-width: 1400px !important;
            margin: 0 auto !important;
        }

        .geo-main-row {
            display: flex !important;
            flex-direction: row !important;
            justify-content: center !important;
            align-items: flex-start !important;
            gap: 40px !important;
            width: 100% !important;
            flex-wrap: nowrap !important;
        }

        .geo-regional-row {
            display: flex !important;
            flex-direction: row !important;
            justify-content: center !important;
            align-items: flex-start !important;
            gap: 24px !important;
            width: 100% !important;
            flex-wrap: wrap !important;
            max-width: 1600px;
        }

        .geo-card {
            flex: 1 !important;
            min-width: 280px !important;
            max-width: 400px !important;
            border-radius: 18px;
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
            padding: 30px 20px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            color: white;
            font-weight: bold;
            position: relative;
            overflow: hidden;
            border: 3px solid rgba(255, 255, 255, 0.3);
        }

        .geo-card.local-card {
            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
        }

        .geo-card.export-card {
            background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
        }

        .geo-flag {
            font-size: 3em !important;
            margin-bottom: 15px !important;
        }

        .geo-label {
            font-size: 1.5em !important;
            margin-bottom: 10px !important;
            font-weight: bold !important;
            text-transform: uppercase;
        }

        .geo-percentage {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 8px;
            text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
        }

        .geo-subtitle {
            font-size: 1.1em;
            opacity: 0.9;
        }

        .geo-region-card {
            flex: 1;
            min-width: 250px;
            max-width: 100%;
            border-radius: 18px;
            box-shadow: 0 4px 16px rgba(25, 118, 210, 0.15);
            padding: 24px 18px;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            color: white;
            font-weight: bold;
            position: relative;
            overflow: hidden;
            background: linear-gradient(135deg, #2196F3 0%, #1976D2 100%);
        }

        .region-icon {
            font-size: 2.5em;
            margin-bottom: 12px;
        }

        .region-name {
            font-size: 1.3em;
            margin-bottom: 8px;
            line-height: 1.3;
            font-weight: 700;
        }

        .region-percentage {
            font-size: 2em;
            margin-bottom: 8px;
            font-weight: bold;
        }

        .region-details {
            font-size: 1em;
            opacity: 0.9;
            line-height: 1.2;
        }

        /* Performance Dashboard */
        .tab-container {
            margin: 30px 0;
        }

        .tab-instructions {
            color: #666;
            font-style: italic;
            margin-bottom: 20px;
            text-align: center;
        }

        .tab-buttons {
            display: flex;
            gap: 12px;
            margin-bottom: 30px;
            justify-content: center;
            padding: 0 20px;
        }

        .tab-button {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border: 2px solid #e2e8f0;
            border-radius: 16px;
            padding: 16px 20px;
            cursor: pointer;
            font-weight: 700;
            font-size: 15px;
            color: #64748b;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-family: 'Inter', system-ui, sans-serif;
            min-width: 200px;
            max-width: 220px;
            min-height: 60px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            overflow: hidden;
            user-select: none;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            text-align: center;
            line-height: 1.3;
            white-space: normal;
            word-wrap: break-word;
        }

        .tab-button::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0.4) 100%);
            opacity: 0;
            transition: opacity 0.3s ease;
            border-radius: 16px;
        }

        .tab-button:hover {
            color: #374151;
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
        }

        .tab-button:hover::before {
            opacity: 1;
        }

        .tab-button.active {
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            border-color: #1e40af;
            color: #ffffff;
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(30, 64, 175, 0.3);
        }

        .tab-button.active::before {
            display: none;
        }

        .tab-button:active {
            transform: translateY(-1px) scale(0.98);
        }

        .tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
            width: 100%;
            max-width: 100%;
            padding: 0;
        }

        .tab-content.active {
            display: block;
            width: 100%;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .chart-container {
            min-height: 200px;
            margin: 20px 0;
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        /* Product Groups KGS Table Styles - OPTIMIZED */
        .product-groups-kgs-table {
            margin: 15px 0;
            padding: 0;
            width: 100%;
            max-width: 100%;
            overflow-x: hidden;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .product-groups-kgs-table h3 {
            margin: 0 0 15px 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
            text-align: center;
            padding: 12px;
            background: white;
        }

        /* Table scroll wrapper - NO horizontal scrolling in export */
        .table-scroll-wrapper {
            overflow-x: hidden;
            overflow-y: visible;
            margin: 0;
            padding: 0;
            position: relative;
            width: 100%;
        }
        
        /* Performance table styles (for generated tables) - OPTIMIZED */
        .perf-table {
            width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            background: white;
        }
        
        .perf-table th,
        .perf-table td {
            padding: 10px 12px;
            border: 1px solid #ddd;
            text-align: center;
            font-size: 0.9em;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        .perf-table th:first-child,
        .perf-table td:first-child {
            text-align: left;
            font-weight: 500;
            width: 20%;
            min-width: 150px;
        }
        
        /* Data columns and delta columns have consistent widths */
        .perf-table th:not(:first-child),
        .perf-table td:not(:first-child) {
            width: auto;
        }
        
        /* Total row styling to match live */
        .perf-table .total-row,
        .perf-table tr:last-child {
            border-top: 2px solid #003366;
        }
        
        /* Hide scrollbars in export */
        .table-scroll-wrapper::-webkit-scrollbar {
            display: none;
            height: 0;
            width: 0;
        }
        
        .table-scroll-wrapper::-webkit-scrollbar-track {
            display: none;
        }
        
        .table-scroll-wrapper::-webkit-scrollbar-thumb {
            display: none;
        }
        
        .table-scroll-wrapper::-webkit-scrollbar-thumb:hover {
            display: none;
        }

        /* Chart wrapper */
        .chart-wrapper {
            position: relative;
            width: 100%;
        }
        
        .chart-wrapper canvas {
            display: block;
            width: 100% !important;
            height: 100% !important;
        }
        
        .chart-wrapper::-webkit-scrollbar {
            height: 10px;
        }
        
        .chart-wrapper::-webkit-scrollbar-track {
            background: #f1f1f1;
            border-radius: 5px;
        }
        
        .chart-wrapper::-webkit-scrollbar-thumb {
            background: #667eea;
            border-radius: 5px;
        }
        
        .chart-wrapper::-webkit-scrollbar-thumb:hover {
            background: #5568d3;
        }
        
        /* Hide scroll hints on desktop by default */
        .scroll-hint {
            display: none;
        }

        /* Product Groups KGS Table Styles - Matching live component exactly */
        .product-groups-kgs-table {
          margin: 15px 0;
          padding: 0;
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .product-groups-kgs-table h3 {
          margin: 0 0 15px 0;
          font-size: 20px;
          font-weight: 600;
          color: #333;
          text-align: center;
          padding: 15px;
          background: white;
        }

        .kgs-comparison-table {
            width: 100%;
            max-width: 100%;
            table-layout: fixed;
            border-collapse: collapse;
            border-spacing: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            font-size: 14px !important;
            background: white;
            border: 1px solid #e5e7eb;
        }

        .kgs-comparison-table thead th {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: 600 !important;
            text-align: center;
            padding: 5px 4px !important;
            border: 1px solid #1e40af;
            font-size: 14px !important;
            vertical-align: middle;
            letter-spacing: 0.3px;
        }

        .kgs-comparison-table th {
            padding: 5px 4px;
            text-align: center;
            border: 1px solid #1e40af;
            font-weight: 600;
            font-size: 14px;
        }

        .kgs-comparison-table td {
            padding: 3px 5px !important;
            text-align: center;
            border: 1px solid #e5e7eb !important;
            font-size: 14px !important;
            background: white;
            color: #1f2937;
            line-height: 1.1 !important;
            vertical-align: middle;
        }

        .kgs-comparison-table .product-header {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: 600 !important;
            text-align: center;
            vertical-align: middle;
            width: 10%;
            min-width: 80px;
            font-size: 14px !important;
            padding: 5px 6px !important;
        }

        .kgs-comparison-table .period-header {
            background: white;
            font-size: 14px !important;
            font-weight: 600;
            text-align: center;
            vertical-align: middle;
            width: 6%;
            min-width: 50px;
            padding: 4px 3px !important;
            line-height: 1.1;
            color: #1f2937;
        }

        /* Year headers should match the blue gradient */
        .kgs-comparison-table thead tr:first-child .period-header {
            font-size: 14px !important;
            font-weight: bold !important;
            padding: 5px 4px !important;
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
        }

        .kgs-comparison-table .delta-header {
            background: linear-gradient(135deg, #1e40af, #1e3a8a) !important;
            color: #fbbf24 !important;
            font-weight: 700;
            text-align: center;
            vertical-align: middle;
            width: 4%;
            min-width: 40px;
            font-size: 14px !important;
        }

        .kgs-comparison-table .product-name {
            text-align: left;
            font-weight: 600;
            color: #1f2937;
            background: white;
            width: 18%;
            min-width: 150px;
            max-width: 250px;
            padding: 3px 5px 3px 8px !important;
            font-size: 14px !important;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            line-height: 1.1 !important;
        }

        .kgs-comparison-table .metric-cell {
            text-align: center;
            font-weight: 500;
            color: #374151;
            background: white;
            width: auto;
            min-width: 65px;
            padding: 3px 5px !important;
            font-size: 14px !important;
            font-variant-numeric: tabular-nums;
            line-height: 1.1 !important;
        }

        .kgs-comparison-table .delta-cell {
            background: white;
            font-weight: 600;
            text-align: center;
            width: auto;
            min-width: 55px;
            padding: 3px 4px !important;
            font-size: 14px !important;
            line-height: 1.1 !important;
        }

        .kgs-comparison-table .delta-arrow {
            margin-right: 3px;
            font-size: 13px;
            font-weight: bold;
        }

        .kgs-comparison-table .delta-value {
            font-size: 13px;
            font-weight: 600;
        }

        .kgs-comparison-table .delta-up {
            color: #059669;
        }

        .kgs-comparison-table .delta-down {
            color: #dc2626;
        }
        
        /* Row label for first column (white background) */
        .kgs-comparison-table .row-label {
            background: white !important;
            background-color: white !important;
        }
        
        /* Total row styling */
        .kgs-comparison-table .total-row {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
        }
        
        .kgs-comparison-table .total-row td {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            font-weight: bold !important;
            font-size: 14px !important;
            padding: 4px 6px !important;
            border: 1px solid #1e40af !important;
            text-align: center;
        }
        
        .kgs-comparison-table .total-row .total-label {
            text-align: left !important;
            padding-left: 8px;
        }
        
        .kgs-comparison-table .total-row .delta-cell {
            background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
            color: white !important;
            border: 1px solid #1e40af !important;
            font-size: 14px !important;
            font-weight: bold !important;
        }

        /* KPI Cards Styles */
        .executive-summary-section {
            margin-top: 30px;
        }

        .kpi-section-title {
            color: #2c3e50;
            font-size: 1.5rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 25px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .kpi-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }

        .kpi-card {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 2px solid #e9ecef;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }

        .kpi-card.large {
            grid-column: span 2;
        }

        .kpi-card:hover {
            transform: translateY(-5px);
            border-color: #667eea;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }
        
        /* Performance Dashboard Styles */
        .tab-container {
            margin-top: 20px;
        }
        
        .tab-buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            flex-wrap: wrap;
        }
        
        .tab-button {
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 8px;
            padding: 12px 20px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s ease;
            font-size: 0.9rem;
        }
        
        .tab-button.active {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-color: #667eea;
        }
        
        .tab-button:hover:not(.active) {
            background: #e9ecef;
            border-color: #adb5bd;
        }
        
        .tab-content {
            display: none;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 8px;
            min-height: 400px;
        }
        
        .tab-content.active {
            display: block;
        }
        
        .chart-container {
            background: white;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            margin: 20px 0;
        }
        
        /* Customer Insights Styles */
        .customer-insights-section {
            margin-top: 30px;
        }
        
        .customer-insights-header {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 25px;
        }
        
        .insights-icon {
            font-size: 1.5rem;
            margin-right: 10px;
        }
        
        .customer-insights-header h3 {
            color: #2c3e50;
            font-size: 1.5rem;
            font-weight: 700;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .customer-insights-cards {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            width: 100%;
            max-width: 900px;
            margin: 0 auto;
        }
        
        .customer-insight-card {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 1px solid #dee2e6;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
            min-width: 0;
            overflow: hidden;
            position: relative;
        }

        /* Top banner gradient */
        .customer-insight-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 6px;
            background: linear-gradient(to right, #1e3a8a, #3b82f6, #60a5fa);
            border-radius: 12px 12px 0 0;
        }
        
        .customer-insight-card:hover {
            transform: translateY(-5px);
            border-color: #667eea;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }
        
        .insight-icon {
            font-size: 2rem;
            margin-bottom: 15px;
        }
        
        .insight-title {
            font-size: 0.9rem;
            color: #6c757d;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        
        .insight-value {
            font-size: 2rem;
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        
        .insight-subtitle {
            font-size: 0.9rem;
            color: #495057;
            margin-bottom: 8px;
            font-weight: 500;
            width: 100%;
            overflow: hidden;
        }
        
        .insight-subtitle:not(.customer-list) {
            white-space: nowrap;
            text-overflow: ellipsis;
        }
        
        .insight-footer {
            font-size: 0.8rem;
            color: #6c757d;
            font-style: italic;
        }
        
        .customer-list {
            text-align: left;
        }
        
        .customer-name-line {
            padding: 2px 0;
            font-size: 0.85rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }
        
        /* Geographic Distribution Styles */
        .executive-summary-section {
            margin-top: 30px;
        }
        
        .kpi-section-title {
            color: #2c3e50;
            font-size: 1.5rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 25px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        
        .kpi-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 25px;
        }
        
        .kpi-card {
            background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            border: 2px solid #e9ecef;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
        }
        
        .kpi-card.large {
            grid-column: span 2;
        }
        
        .kpi-card:hover {
            transform: translateY(-5px);
            border-color: #667eea;
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
        }
        
        .kpi-label {
            font-size: 0.9rem;
            color: #6c757d;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        
        .kpi-value {
            font-size: 2rem;
            font-weight: 700;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        
        .kpi-trend {
            font-size: 0.8rem;
            color: #6c757d;
            font-style: italic;
        }
        
        /* Tablet Responsive (768px - 1024px) */
        @media (max-width: 1024px) and (min-width: 769px) {
            .container {
                padding: 0 15px;
            }
            
            .report-header {
                padding: 25px 15px 35px 15px;
            }
            
            .header-logo {
                max-height: 85px;
                max-width: 190px;
            }
            
            .header-content h1 {
                font-size: 2em;
            }
            
            .header-content h2 {
                font-size: 1.5em;
            }
            
            .metric-row {
                gap: 15px;
            }
            
            .metric-card {
                min-width: 180px;
                padding: 20px;
            }
            
            .metric-value {
                font-size: 2em;
            }
            
            .top-product-card {
                min-width: 240px;
                max-width: 280px;
            }
            
            .perf-tab-btn {
                padding: 10px 16px;
                font-size: 12px;
                min-width: 120px;
            }
            
            .financial-table {
                font-size: 0.85rem;
            }
            
            .kgs-comparison-table .product-name,
            .kgs-comparison-table .metric-cell,
            .kgs-comparison-table .delta-cell {
                font-size: 11px;
            }
            
            /* Tablet table - no scrolling in export */
            .table-scroll-wrapper {
                overflow-x: hidden;
                position: relative;
            }
            
            .table-scroll-wrapper table {
                width: 100%;
            }
            
            /* Tablet sticky first column */
            .table-scroll-wrapper table th:first-child,
            .table-scroll-wrapper table td:first-child {
                position: sticky !important;
                left: 0 !important;
                z-index: 10 !important;
                box-shadow: 3px 0 5px rgba(0,0,0,0.12) !important;
                min-width: 100px;
            }
            
            /* Body cells - light background */
            .table-scroll-wrapper table tbody td:first-child {
                background: #f8f9fa !important;
            }
            
            .table-scroll-wrapper table thead th:first-child {
                z-index: 20 !important;
                font-weight: 700 !important;
            }
            
            /* Blue table (KGS) header backgrounds - tablet */
            .table-scroll-wrapper table.kgs-table thead th,
            .table-scroll-wrapper table.kgs-table thead th:first-child {
                background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
                color: white !important;
            }
            
            /* Green table (Amount) header backgrounds - tablet */
            .table-scroll-wrapper table.amount-table thead th,
            .table-scroll-wrapper table.amount-table thead th:first-child,
            .table-scroll-wrapper table.customer-amount-table thead th,
            .table-scroll-wrapper table.customer-amount-table thead th:first-child {
                background: linear-gradient(135deg, #059669, #047857) !important;
                color: white !important;
            }
            
            /* Purple table (Customer) header backgrounds - tablet */
            .table-scroll-wrapper table.customer-table thead th,
            .table-scroll-wrapper table.customer-table thead th:first-child {
                background: linear-gradient(135deg, #7c3aed, #5b21b6) !important;
                color: white !important;
            }
            
            /* Geographic cards on tablet */
            .geo-main-row {
                flex-wrap: wrap !important;
                gap: 24px !important;
            }
            
            .geo-card {
                min-width: 240px !important;
                max-width: 320px !important;
            }
            
            /* Show scroll hints on tablet */
            .scroll-hint {
                display: block !important;
            }
        }
        
        /* Mobile Responsive (max 768px) */
        @media (max-width: 768px) {
            .container {
                padding: 0 10px;
            }
            
            .report-header {
                padding: 20px 10px 30px 10px;
            }
            
            .header-logo {
                max-height: 70px;
                max-width: 150px;
                margin-bottom: 15px;
            }
            
            .header-content h1 {
                font-size: 1.5em;
                margin-bottom: 8px;
            }
            
            .header-content h2 {
                font-size: 1.2em;
                margin-bottom: 10px;
            }
            
            .period-year {
                font-size: 1.1em;
            }
            
            .period-type {
                font-size: 0.95em;
            }
            
            .division-title {
                font-size: 1.8rem;
            }
            
            .metric-row {
                flex-direction: column;
                align-items: stretch;
            }
            
            .metric-card {
                max-width: 100%;
                min-width: auto;
                padding: 18px;
            }
            
            .metric-value {
                font-size: 1.8em;
            }
            
            .customer-insights-cards {
                grid-template-columns: 1fr;
            }
            
            .kpi-cards {
                grid-template-columns: 1fr;
            }
            
            .kpi-card.large {
                grid-column: span 1;
            }
            
            .top-products-horizontal {
                flex-direction: column;
                align-items: stretch;
            }
            
            .top-product-card {
                max-width: 100%;
                min-width: auto;
            }
            
            .perf-tab-buttons {
                flex-direction: column;
                align-items: stretch;
                gap: 8px;
            }
            
            .perf-tab-btn {
                width: 100%;
                padding: 12px;
                font-size: 12px;
                min-width: auto;
            }
            
            /* Sort toggle buttons on mobile */
            #yoy-tab > div:nth-child(2) {
                flex-direction: column;
                align-items: center;
                gap: 6px;
            }
            
            #yoy-tab > div:nth-child(2) button {
                width: 80%;
                max-width: 200px;
            }
            
            .tab-buttons {
                flex-direction: column;
            }
            
            .financial-table {
                font-size: 0.75rem;
            }
            
            .financial-table th,
            .financial-table td {
                padding: 6px 3px;
            }
            
            /* Budget Achievement tab mobile styles - no scrolling in export */
            #budget-tab > div {
                overflow-x: hidden;
            }
            
            #budget-tab > div > div {
                width: 100%;
            }
            
            /* Chart wrapper mobile adjustments */
            .chart-wrapper {
                min-height: 300px;
            }
            
            .chart-wrapper canvas {
                width: 100% !important;
                height: 100% !important;
            }
            
            /* Hide scroll hint since chart now fits */
            .scroll-hint {
                display: block !important;
                text-align: center;
                font-size: 11px;
                color: #666;
                margin-top: 8px;
                padding: 6px 12px;
                background: #f0f9ff;
                border-radius: 12px;
                font-weight: 500;
            }
            
            /* Tables - no scrolling in export */
            .table-scroll-wrapper,
            .table-container,
            .kgs-comparison-table-wrapper {
                overflow-x: hidden;
                position: relative;
                margin-bottom: 10px;
            }
            
            .kgs-comparison-table {
                width: 100%;
            }
            
            /* Sticky first column on mobile - for ALL tables */
            .kgs-comparison-table th:first-child,
            .kgs-comparison-table td:first-child,
            .perf-table th:first-child,
            .perf-table td:first-child,
            .table-scroll-wrapper table th:first-child,
            .table-scroll-wrapper table td:first-child {
                position: sticky !important;
                left: 0 !important;
                z-index: 10 !important;
                box-shadow: 3px 0 6px rgba(0,0,0,0.15) !important;
                min-width: 90px;
                max-width: 130px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            /* Body cells first column - light background */
            .kgs-comparison-table tbody td:first-child,
            .perf-table tbody td:first-child,
            .table-scroll-wrapper table tbody td:first-child {
                background: #f8f9fa !important;
            }
            
            .kgs-comparison-table th:first-child,
            .perf-table th:first-child,
            .table-scroll-wrapper table th:first-child,
            .table-scroll-wrapper table thead th:first-child {
                z-index: 20 !important;
                font-weight: 700 !important;
            }
            
            /* Override inline styles for first column in generated tables */
            .table-scroll-wrapper table tr th:first-child,
            .table-scroll-wrapper table tr td:first-child {
                position: sticky !important;
                left: 0 !important;
            }
            
            /* Blue table (KGS) - ensure all header cells get proper background */
            .table-scroll-wrapper table.kgs-table thead th,
            .table-scroll-wrapper table.kgs-table thead th:first-child {
                background: linear-gradient(135deg, #3b82f6, #1e40af) !important;
                color: white !important;
            }
            
            /* Green table (Amount) - ensure all header cells get proper background */
            .table-scroll-wrapper table.amount-table thead th,
            .table-scroll-wrapper table.amount-table thead th:first-child,
            .table-scroll-wrapper table.customer-amount-table thead th,
            .table-scroll-wrapper table.customer-amount-table thead th:first-child {
                background: linear-gradient(135deg, #059669, #047857) !important;
                color: white !important;
            }
            
            /* Purple table (Customer Volume) - ensure all header cells get proper background */
            .table-scroll-wrapper table.customer-table thead th,
            .table-scroll-wrapper table.customer-table thead th:first-child {
                background: linear-gradient(135deg, #7c3aed, #5b21b6) !important;
                color: white !important;
            }

            /* Purple header gradient for Customer tables */
            .table-scroll-wrapper table thead tr[style*="7c3aed"] th:first-child,
            .table-scroll-wrapper table thead tr[style*="5b21b6"] th:first-child {
                background: linear-gradient(135deg, #7c3aed, #5b21b6) !important;
            }

            .kgs-comparison-table td.product-name {
                position: sticky;
                left: 0;
                z-index: 2;
                background: #f8f9fa !important;
                box-shadow: 2px 0 5px rgba(0,0,0,0.15);
            }
            
            /* Financial table sticky column */
            .financial-table th:first-child,
            .financial-table td:first-child {
                position: sticky !important;
                left: 0 !important;
                z-index: 10 !important;
                background: white !important;
                box-shadow: 3px 0 6px rgba(0,0,0,0.12) !important;
            }
            
            .financial-table th:first-child {
                z-index: 20 !important;
                background: #f5f5f5 !important;
                font-weight: 700 !important;
            }
            
            .kgs-comparison-table .product-name,
            .kgs-comparison-table .metric-cell,
            .kgs-comparison-table .delta-cell {
                font-size: 10px;
                padding: 6px 4px;
            }
            
            /* Chart container adjustments */
            .chart-container {
                padding: 10px;
                margin: 10px 0;
            }
            
            /* Show scroll hints on mobile */
            .scroll-hint {
                display: block !important;
            }
            
            /* Customer insights cards */
            .insight-card {
                padding: 15px;
            }
            
            .insight-value {
                font-size: 1.8em;
            }
            
            /* Geographic section */
            .geo-chart-container {
                height: 300px !important;
            }
            
            /* Geographic cards on mobile */
            .geo-main-row {
                flex-direction: column !important;
                gap: 20px !important;
            }
            
            .geo-regional-row {
                flex-direction: column !important;
                gap: 16px !important;
            }
            
            .geo-card {
                min-width: 100% !important;
                max-width: 100% !important;
                padding: 24px 16px !important;
            }
            
            .geo-flag {
                font-size: 2.5em !important;
            }
            
            .geo-label {
                font-size: 1.2em !important;
            }
            
            .geo-percentage {
                font-size: 2.5rem !important;
            }
        }
        
        /* Small Mobile (max 480px) */
        @media (max-width: 480px) {
            .header-content h1 {
                font-size: 1.25em;
            }
            
            .header-content h2 {
                font-size: 1em;
            }
            
            .header-logo {
                max-height: 55px;
                max-width: 120px;
            }
            
            .metric-value {
                font-size: 1.5em;
            }
            
            .metric-label {
                font-size: 0.8em;
            }
            
            .report-section h2 {
                font-size: 1.2em;
            }
            
            .perf-tab-btn {
                font-size: 11px;
                padding: 10px;
            }
            
            .insight-value {
                font-size: 1.5em;
            }
            
            .rank-icon {
                font-size: 1.5em;
            }
            
            .product-name-text {
                font-size: 0.95em;
            }
            
            /* Small mobile table adjustments */
            .table-scroll-wrapper table {
                min-width: 500px;
                font-size: 11px;
            }
            
            .table-scroll-wrapper table th,
            .table-scroll-wrapper table td {
                padding: 6px 4px;
            }
            
            .table-scroll-wrapper table th:first-child,
            .table-scroll-wrapper table td:first-child {
                min-width: 80px;
                max-width: 100px;
                font-size: 10px;
            }
            
            /* Chart on small mobile */
            .chart-wrapper {
                min-height: 280px;
            }
            
            .chart-wrapper canvas {
                width: 100% !important;
                height: 100% !important;
            }
        }
        
        /* Print Styles */
        @media print {
            body {
                background: white;
            }
            
            .header {
                box-shadow: none;
                border-bottom: 2px solid #333;
            }
            
            .section {
                break-inside: avoid;
                page-break-inside: avoid;
            }
            
            .metric-card,
            .customer-insight-card,
            .kpi-card {
                break-inside: avoid;
                page-break-inside: avoid;
            }
        }
        
        /* Performance Dashboard Tab Styles */
        .perf-tab-buttons {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            justify-content: center;
            flex-wrap: wrap;
        }
        
        .perf-tab-btn {
            padding: 12px 24px;
            border: 2px solid #667eea;
            background: white;
            color: #667eea;
            cursor: pointer;
            border-radius: 8px;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.3s ease;
            outline: none;
        }
        
        .perf-tab-btn:hover {
            background: #f0f4ff;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
        }
        
        .perf-tab-btn.active {
            background: #667eea;
            color: white;
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }
        
        .perf-tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }
        
        .perf-tab-content.active {
            display: block;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        /* Chart container styles */
        .chart-container {
            margin: 20px 0;
            padding: 20px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        
        /* Center all h2 and h3 titles in report sections */
        .report-section h2,
        .report-section h3,
        .section h2,
        .section h3 {
            text-align: center !important;
        }
    </style>
</head>
<body>
    <div class="container">
        ${pageContent}
    </div>
    
    <script>
    // Performance Dashboard Tab Switching and Chart Initialization
    (function() {
        
        // Tab Switching Functionality
        function initTabSwitching() {
            const tabButtons = document.querySelectorAll('.perf-tab-btn');
            const tabContents = document.querySelectorAll('.perf-tab-content');
            
            if (tabButtons.length === 0) {
                return;
            }
            
            tabButtons.forEach(button => {
                button.addEventListener('click', function() {
                    const targetTab = this.getAttribute('data-tab');
                    
                    // Remove active class from all buttons and hide all contents
                    tabButtons.forEach(btn => {
                        btn.classList.remove('active');
                        btn.style.background = 'white';
                        btn.style.color = '#667eea';
                    });
                    tabContents.forEach(content => {
                        content.classList.remove('active');
                        content.style.display = 'none';
                    });
                    
                    // Add active class to clicked button
                    this.classList.add('active');
                    this.style.background = '#667eea';
                    this.style.color = 'white';
                    
                    // Show corresponding content
                    const targetContent = document.getElementById(targetTab + '-tab');
                    if (targetContent) {
                        targetContent.classList.add('active');
                        targetContent.style.display = 'block';
                        
                        // Initialize chart if switching to YoY tab
                        if (targetTab === 'yoy' && !window.yoyChartInitialized) {
                            initYoYChart();
                        }
                        // Budget tab uses HTML/CSS bars, no Chart.js initialization needed
                    }
                });
            });
            
        }
        
        // Initialize YoY Growth Chart using ECharts
        function initYoYChart() {
            
            // Prevent double initialization
            if (window.yoyChartInitialized) {
                return;
            }
            
            const chartDom = document.getElementById('yoyGrowthChart');
            if (!chartDom) {
                console.error('Chart container not found');
                return;
            }
            
            if (typeof echarts === 'undefined') {
                console.error('ECharts not loaded');
                chartDom.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626; background: #fef2f2; border-radius: 8px;"><strong>⚠️ Chart Error</strong><br><small>Chart library failed to load.</small></div>';
                return;
            }
            
            if (!window.yoyChartData || window.yoyChartData.length === 0) {
                console.error('No YoY chart data available');
                chartDom.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">No year-over-year data available for chart.</div>';
                return;
            }
            
            // Small delay to ensure container is fully rendered
            setTimeout(function() {
                actuallyInitEChart(chartDom);
            }, 50);
        }
        
        function actuallyInitEChart(chartDom) {
            const isMobile = window.innerWidth < 768;
            const data = window.yoyChartData;
            
            // Prepare data - reverse for ECharts (bottom to top)
            const labels = data.map(entry => entry.label).reverse();
            const percentages = data.map(entry => entry.percentage).reverse();
            const mtDifferences = data.map(entry => entry.mtDifference).reverse();
            
            // Calculate chart dimensions - full width, dynamic height based on entries
            const chartHeight = Math.max(400, data.length * 40);
            
            chartDom.style.height = chartHeight + 'px';
            chartDom.style.width = '100%';
            
            // Color function based on value
            function getBarColor(value) {
                if (value >= 50) return '#059669';
                if (value >= 20) return '#10b981';
                if (value >= 10) return '#34d399';
                if (value >= 0) return '#6ee7b7';
                if (value >= -10) return '#fbbf24';
                if (value >= -20) return '#f59e0b';
                return '#ef4444';
            }
            
            // Calculate symmetric range around zero
            const maxPos = Math.max(0, ...percentages);
            const minNeg = Math.min(0, ...percentages);
            const maxAbsValue = Math.max(Math.abs(maxPos), Math.abs(minNeg));
            const padding = Math.ceil(maxAbsValue * 0.2);
            const maxGrowth = Math.ceil((maxAbsValue + padding) / 50) * 50;
            const minGrowth = -maxGrowth;
            
            try {
                // Dispose existing chart if present
                if (window.yoyChart) {
                    window.yoyChart.dispose();
                }
                
                // Initialize ECharts
                window.yoyChart = echarts.init(chartDom);
                
                const option = {
                    tooltip: {
                        trigger: 'axis',
                        axisPointer: { type: 'shadow' },
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        borderColor: '#333',
                        borderWidth: 1,
                        padding: [12, 16],
                        textStyle: {
                            color: '#fff',
                            fontSize: isMobile ? 12 : 14
                        },
                        formatter: function(params) {
                            const idx = params[0].dataIndex;
                            const pct = percentages[idx];
                            const mt = mtDifferences[idx];
                            const icon = pct >= 0 ? '✅' : '⚠️';
                            const status = pct >= 0 ? 'Positive Growth' : 'Decline';
                            return '<strong style="font-size: 14px;">' + params[0].name + '</strong><br/>' +
                                   'YoY Growth: <strong>' + pct.toFixed(1) + '%</strong><br/>' +
                                   'Volume Impact: <strong>' + (mt >= 0 ? '+' : '') + mt.toFixed(2) + ' MT</strong><br/>' +
                                   icon + ' ' + status;
                        }
                    },
                    grid: {
                        left: 150,
                        right: 80,
                        top: 20,
                        bottom: 50,
                        containLabel: false
                    },
                    xAxis: {
                        type: 'value',
                        min: minGrowth,
                        max: maxGrowth,
                        axisLabel: {
                            formatter: '{value}%',
                            fontSize: 12,
                            color: '#374151'
                        },
                        axisLine: { show: true, lineStyle: { color: '#e5e7eb' } },
                        splitLine: {
                            show: true,
                            lineStyle: {
                                color: '#e5e7eb',
                                width: 1
                            }
                        },
                        name: 'Growth (%)',
                        nameLocation: 'middle',
                        nameGap: 35,
                        nameTextStyle: {
                            fontSize: 12,
                            fontWeight: 'bold',
                            color: '#1f2937'
                        }
                    },
                    yAxis: {
                        type: 'category',
                        data: labels,
                        axisLabel: {
                            show: true,
                            fontSize: 12,
                            fontWeight: 600,
                            color: '#1f2937',
                            width: 140,
                            overflow: 'truncate',
                            ellipsis: '...'
                        },
                        axisLine: { show: false },
                        axisTick: { show: false }
                    },
                    series: [{
                        type: 'bar',
                        data: percentages.map((val, idx) => ({
                            value: val,
                            itemStyle: {
                                color: getBarColor(val),
                                borderRadius: [0, 4, 4, 0]
                            }
                        })),
                        barWidth: 24,
                        label: {
                            show: true,
                            position: 'right',
                            formatter: function(params) {
                                return params.value.toFixed(1) + '%';
                            },
                            fontSize: 11,
                            fontWeight: 'bold',
                            color: '#111827'
                        },
                        emphasis: {
                            itemStyle: {
                                shadowBlur: 10,
                                shadowColor: 'rgba(0,0,0,0.3)'
                            }
                        }
                    }]
                };
                
                window.yoyChart.setOption(option);
                window.yoyChartInitialized = true;
                
                // Handle window resize
                window.addEventListener('resize', function() {
                    if (window.yoyChart) {
                        window.yoyChart.resize();
                    }
                });
                
            } catch (error) {
                console.error('Error creating ECharts chart:', error);
                chartDom.innerHTML = '<div style="text-align: center; padding: 40px; color: #dc2626; background: #fef2f2; border-radius: 8px;"><strong>⚠️ Chart Error</strong><br><small>' + error.message + '</small></div>';
            }
        }
        
        // Budget Achievement uses HTML/CSS bars, no Chart.js initialization needed
        
        // Initialize everything when DOM is loaded
        function initializeAll() {
            // Hide all tabs except the first one on load
            const allTabContents = document.querySelectorAll('.perf-tab-content');
            allTabContents.forEach((content, index) => {
                if (index === 0) {
                    content.style.display = 'block';
                    content.classList.add('active');
                } else {
                    content.style.display = 'none';
                    content.classList.remove('active');
                }
            });
            
            // Initialize tab switching
            initTabSwitching();
            
            // Initialize YoY chart by default (first tab)
            if (document.getElementById('yoyGrowthChart')) {
                initYoYChart();
            }
            
            // Initialize edit mode functionality
            initEditMode();
        }
        
        // ======= EDIT MODE FUNCTIONALITY =======
        let isEditMode = false;
        
        function initEditMode() {
            // Create floating toolbar
            const toolbar = document.createElement('div');
            toolbar.id = 'edit-toolbar';
            toolbar.innerHTML = \`
                <button id="edit-toggle-btn" class="toolbar-btn edit-btn" title="Enable Edit Mode">
                    ✏️ Edit Mode
                </button>
                <button id="save-btn" class="toolbar-btn save-btn" title="Save Changes" style="display: none;">
                    💾 Save HTML
                </button>
                <button id="print-btn" class="toolbar-btn print-btn" title="Print Report">
                    🖨️ Print
                </button>
                <span id="edit-status" class="edit-status"></span>
            \`;
            document.body.appendChild(toolbar);
            
            // Add event listeners
            document.getElementById('edit-toggle-btn').addEventListener('click', toggleEditMode);
            document.getElementById('save-btn').addEventListener('click', saveDocument);
            document.getElementById('print-btn').addEventListener('click', () => window.print());
        }
        
        function toggleEditMode() {
            isEditMode = !isEditMode;
            const editBtn = document.getElementById('edit-toggle-btn');
            const saveBtn = document.getElementById('save-btn');
            const status = document.getElementById('edit-status');
            
            // Find the strategic analysis sections by data attribute
            const editableSections = document.querySelectorAll('[data-editable-section]');
            
            if (isEditMode) {
                // Enable edit mode
                editBtn.innerHTML = '🔒 Exit Edit Mode';
                editBtn.classList.add('active');
                saveBtn.style.display = 'inline-flex';
                status.innerHTML = '📝 Click any text to edit';
                status.style.color = '#059669';
                document.body.classList.add('edit-mode-active');
                
                // Make ALL content within strategic sections editable
                editableSections.forEach(section => {
                    section.classList.add('editable-section');
                    
                    // Find all content boxes (divs with background/border styling)
                    section.querySelectorAll('div').forEach(div => {
                        // Skip the main section container itself
                        if (div.hasAttribute('data-editable-section')) return;
                        // Skip if it contains only other divs (container divs)
                        const hasTextContent = div.childNodes.length > 0 && 
                            Array.from(div.childNodes).some(node => 
                                node.nodeType === 3 && node.textContent.trim().length > 0 ||
                                (node.nodeType === 1 && ['STRONG', 'B', 'I', 'EM', 'SPAN', 'BR'].includes(node.tagName))
                            );
                        
                        // Make content divs editable (those with padding, border-left, background)
                        const style = div.getAttribute('style') || '';
                        const isContentBox = style.includes('padding') && 
                            (style.includes('border-left') || style.includes('background') || style.includes('border-radius'));
                        
                        if (isContentBox && !div.closest('table')) {
                            div.setAttribute('contenteditable', 'true');
                            div.classList.add('editable-content');
                        }
                    });
                    
                    // Also make list items and paragraphs directly editable
                    section.querySelectorAll('p, li, span').forEach(el => {
                        if (!el.closest('table') && !el.closest('[contenteditable="true"]')) {
                            // Only if it has actual text
                            if (el.textContent.trim().length > 0) {
                                el.setAttribute('contenteditable', 'true');
                                el.classList.add('editable-content');
                            }
                        }
                    });
                });
                
            } else {
                // Disable edit mode
                editBtn.innerHTML = '✏️ Edit Mode';
                editBtn.classList.remove('active');
                saveBtn.style.display = 'none';
                status.innerHTML = '';
                document.body.classList.remove('edit-mode-active');
                
                // Remove editable from all elements
                document.querySelectorAll('.editable-content').forEach(el => {
                    el.removeAttribute('contenteditable');
                    el.classList.remove('editable-content');
                });
                document.querySelectorAll('.editable-section').forEach(el => {
                    el.classList.remove('editable-section');
                });
            }
        }
        
        function saveDocument() {
            // Remove edit mode before saving
            const wasEditMode = isEditMode;
            if (wasEditMode) {
                toggleEditMode();
            }
            
            // Get the current document HTML
            const doctype = '<!DOCTYPE html>';
            const htmlContent = document.documentElement.outerHTML;
            
            // Create a clean version without the toolbar and edit functionality
            const parser = new DOMParser();
            const doc = parser.parseFromString(doctype + htmlContent, 'text/html');
            
            // Remove the edit toolbar from saved version
            const toolbar = doc.getElementById('edit-toolbar');
            if (toolbar) toolbar.remove();
            
            // Remove edit-mode classes and contenteditable attributes
            doc.body.classList.remove('edit-mode-active');
            doc.querySelectorAll('.editable-content').forEach(el => {
                el.classList.remove('editable-content');
                el.removeAttribute('contenteditable');
            });
            doc.querySelectorAll('.editable-section').forEach(el => {
                el.classList.remove('editable-section');
            });
            
            // IMPORTANT: Remove the edit mode JavaScript so sales rep cannot edit
            // Find and remove the script containing edit mode functionality
            doc.querySelectorAll('script').forEach(script => {
                if (script.textContent && script.textContent.includes('initEditMode')) {
                    // Replace the script content, removing edit mode functions but keeping chart initialization
                    let content = script.textContent;
                    
                    // Remove the initEditMode call from initializeAll
                    content = content.replace(/\\/\\/ Initialize edit mode functionality[\\s\\S]*?initEditMode\\(\\);/g, '// Edit mode disabled for this version');
                    
                    // Remove the edit mode functions entirely
                    content = content.replace(/\\/\\/ ======= EDIT MODE FUNCTIONALITY =======[\\s\\S]*?function saveDocument\\(\\)[\\s\\S]*?\\}\\s*\\}\\s*(?=if \\(document\\.readyState)/g, '');
                    
                    script.textContent = content;
                }
            });
            
            // Also remove edit mode CSS styles
            doc.querySelectorAll('style').forEach(style => {
                if (style.textContent && style.textContent.includes('edit-toolbar')) {
                    let content = style.textContent;
                    // Remove edit mode styles
                    content = content.replace(/\\/\\* ======= EDIT MODE STYLES ======= \\*\\/[\\s\\S]*?\\/\\* ======= END EDIT MODE STYLES ======= \\*\\//g, '/* Edit mode disabled */');
                    style.textContent = content;
                }
            });
            
            // Generate filename - indicate this is the final version for sales rep
            const timestamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
            const currentTitle = document.title.replace(/\\s+/g, '_');
            const filename = currentTitle + '_FINAL_' + timestamp + '.html';
            
            // Create and download
            const blob = new Blob([doctype + doc.documentElement.outerHTML], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            // Show success message
            const status = document.getElementById('edit-status');
            status.innerHTML = '✅ Final version saved! (No edit for sales rep)';
            status.style.color = '#059669';
            setTimeout(() => { status.innerHTML = ''; }, 4000);
            
            // Restore edit mode if it was active
            if (wasEditMode) {
                setTimeout(() => toggleEditMode(), 100);
            }
        }
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setTimeout(initializeAll, 500);
            });
        } else {
            setTimeout(initializeAll, 500);
        }
    })();
    </script>
</body>
</html>`;

      // Create and download the file
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      
    } catch (error) {
      console.error('❌ Sales Rep HTML export failed:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      alert(`Export failed: ${error.message}. Check console for details.`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button 
      onClick={handleExport}
      disabled={isExporting || !dataGenerated}
      className="export-btn html-export"
      style={{ 
        marginLeft: '10px',
        padding: '10px 20px',
        backgroundColor: liveCustomerKgsData && liveCustomerAmountData ? '#28a745' : '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: isExporting || !dataGenerated ? 'not-allowed' : 'pointer',
        opacity: isExporting || !dataGenerated ? 0.6 : 1,
        fontSize: '14px',
        fontWeight: '600',
        transition: 'all 0.3s ease',
        position: 'relative'
      }}
      title={
        !dataGenerated ? "Please generate data first" : 
        liveCustomerKgsData && liveCustomerAmountData ? "Export complete report (Live data captured ✓)" :
        "Export complete report (Using cached data)"
      }
    >
      {isExporting ? 'Exporting...' : 
       liveCustomerKgsData && liveCustomerAmountData ? '📄 Export Report ✓' : 
       '📄 Export Report'}
      {liveCustomerKgsData && liveCustomerAmountData && (
        <span style={{
          position: 'absolute',
          top: '-5px',
          right: '-5px',
          width: '12px',
          height: '12px',
          backgroundColor: '#00ff00',
          borderRadius: '50%',
          border: '2px solid white',
          boxShadow: '0 0 8px rgba(0, 255, 0, 0.6)'
        }} title="Live data captured" />
      )}
    </button>
  );
};

export default SalesRepHTMLExport;
