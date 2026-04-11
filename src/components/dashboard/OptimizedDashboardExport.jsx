import React, { useState, useEffect, useRef } from 'react';
import { Modal, Checkbox, Button, Row, Col, Divider, Typography, Space, Radio, Progress, message } from 'antd';
import { ThunderboltOutlined, CheckSquareOutlined, BorderOutlined, FileTextOutlined, FilePdfOutlined } from '@ant-design/icons';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { usePLData } from '../../contexts/PLDataContext';
import { useFilter } from '../../contexts/FilterContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useDivisionNames } from '../../utils/useDivisionNames';
import { computeCellValue as sharedComputeCellValue } from '../../utils/computeCellValue';
import { formatCustomRangeDisplay } from '../../utils/periodHelpers';
import ipTransparentLogo from '../../assets/IP transparent-.jpg';

const { Text } = Typography;

// Same card config as MultiChartHTMLExport — IDs match DOM elements in DivisionalDashboardLanding
const EXPORT_CARDS = [
  { id: 'divisional-kpis', title: 'Divisional KPIs', category: 'Overview', icon: '📊' },
  { id: 'sales-volume', title: 'Sales & Volume Analysis', category: 'Charts', icon: '📈' },
  { id: 'margin-analysis', title: 'Margin Analysis', category: 'Charts', icon: '💹' },
  { id: 'manufacturing-cost', title: 'Manufacturing Cost', category: 'Charts', icon: '🏭' },
  { id: 'below-gp-expenses', title: 'Below GP Expenses', category: 'Charts', icon: '💰' },
  { id: 'combined-trends', title: 'Cost & Profitability Trend', category: 'Charts', icon: '📉' },
  { id: 'budget-actual-waterfall', title: 'Budget vs Actual Bridge', category: 'Charts', icon: '🌉' },
  { id: 'pl-financial', title: 'Profit and Loss Statement', category: 'Tables', icon: '📋' },
  { id: 'product-group', title: 'Product Groups', category: 'Tables', icon: '📦' },
  { id: 'sales-rep', title: 'Sales by Sales Reps', category: 'Tables', icon: '👥' },
  { id: 'sales-customer', title: 'Sales by Customers', category: 'Tables', icon: '🏢' },
  { id: 'sales-country', title: 'Sales by Countries', category: 'Tables', icon: '🌍' },
];

// Card title mapping — maps card IDs to the exact title text shown in the DOM
const CARD_TITLE_MAP = {
  'divisional-kpis': 'Divisional KPIs',
  'sales-volume': 'Sales & Volume Analysis',
  'margin-analysis': 'Margin Analysis',
  'manufacturing-cost': 'Manufacturing Cost',
  'below-gp-expenses': 'Below GP Expenses',
  'combined-trends': 'Cost & Profitability Trend',
  'budget-actual-waterfall': 'Budget vs Actual Bridge',
  'pl-financial': 'Profit and Loss',
  'product-group': 'Product Groups',
  'sales-rep': 'Sales by Sales Reps',
  'sales-customer': 'Sales by Customers',
  'sales-country': 'Sales by Countries',
};

// ============================================================================
// CSS CACHING SYSTEM (module-level, outside component)
// ============================================================================
const CSS_CACHE = {
  overlay: null,
  kpi: null,
  all: null,
  timestamp: null
};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getCachedCSS = (key, extractFn) => {
  const now = Date.now();
  if (CSS_CACHE[key] && CSS_CACHE.timestamp && (now - CSS_CACHE.timestamp < CACHE_DURATION)) {
    return CSS_CACHE[key];
  }
  const css = extractFn();
  CSS_CACHE[key] = css;
  CSS_CACHE.timestamp = now;
  return css;
};

const clearCSSCache = () => {
  Object.keys(CSS_CACHE).forEach(k => { CSS_CACHE[k] = null; });
};

// Extract ALL relevant CSS from loaded stylesheets in a single pass
const extractAllRelevantCSS = () => {
  const allCSS = [];
  const patterns = [
    '.divisional-dashboard__overlay', '.divisional-dashboard__card',
    '.table-detail', '.pl-table', '.pl-financial', '.product-group-table',
    '.sales-by-country-table', '.sales-by-customer-table', '.sales-by-sales-rep-table',
    '.sales-country-', '.sbc-table', '--sbc-', '--sbsr-', '--pg-', '--pl-',
    '.customer-name-cell', '.customer-header-row', '.sbsr-',
    '.sales-volume', '.bar-chart', '.margin-analysis', '.modern-margin-gauge',
    '.gauge-', '.manufacturing-cost', '.below-gp-expenses',
    '.combined-trends', '.trend-card', '.trend-connector', '.trend-variance',
    '.trend-kpi-section', '.trend-cards-row', '.expenses-trend',
    '.profit-trend', '.financial-performance', '.product-performance',
    '.kpi-financial', '.kpi-executive', '.recharts',
    '.budget-actual-waterfall', '.waterfall',
  ];

  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules || sheet.rules;
      if (!rules) continue;
      for (const rule of rules) {
        const cssText = rule.cssText || '';
        if (patterns.some(p => cssText.includes(p))) {
          allCSS.push(cssText);
        }
      }
    } catch (e) {
      // CORS — skip
    }
  }
  return allCSS.join('\n');
};

// Extract theme CSS variables from :root
const extractThemeVariables = () => {
  try {
    const root = document.documentElement;
    const computed = getComputedStyle(root);
    const vars = [];
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of (sheet.cssRules || [])) {
          if (rule.selectorText === ':root' || rule.selectorText === ':root, :host') {
            vars.push(rule.cssText);
          }
        }
      } catch (e) { /* CORS */ }
    }
    // Also capture computed custom properties that might be set dynamically
    const dynamicVars = [
      '--bg-primary', '--bg-secondary', '--text-primary', '--text-secondary',
      '--border-color', '--card-bg', '--accent-color', '--header-bg'
    ];
    const dynamicCSS = dynamicVars
      .map(v => { const val = computed.getPropertyValue(v).trim(); return val ? `${v}: ${val};` : ''; })
      .filter(Boolean)
      .join('\n');
    if (dynamicCSS) vars.push(`:root { ${dynamicCSS} }`);
    return vars.join('\n');
  } catch (e) {
    return '';
  }
};

// ============================================================================
// CHART WAITING & FIXING UTILITIES
// ============================================================================

const waitForChartsToRender = async (element, cardId) => {
  const svgElements = element.querySelectorAll('svg');
  const canvasElements = element.querySelectorAll('canvas');
  
  if (svgElements.length === 0 && canvasElements.length === 0) return;

  await new Promise((resolve) => {
    let checks = 0;
    const maxChecks = 30; // 3s max
    const interval = setInterval(() => {
      checks++;
      const svgsReady = Array.from(svgElements).every(svg => {
        const hasContent = svg.querySelectorAll('path, rect, circle, line, polygon, text').length > 0;
        const hasSize = svg.getBoundingClientRect().width > 10;
        return hasContent && hasSize;
      });
      const canvasReady = Array.from(canvasElements).every(c => c.width > 0 && c.height > 0);
      if ((svgsReady && canvasReady) || checks >= maxChecks) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
  // Extra settle time for animations
  await new Promise(r => setTimeout(r, 200));
};

const fixChartElements = (clone, original) => {
  // Fix SVGs
  const origSVGs = original.querySelectorAll('svg');
  const cloneSVGs = clone.querySelectorAll('svg');
  origSVGs.forEach((svg, i) => {
    if (!cloneSVGs[i]) return;
    try {
      Array.from(svg.attributes).forEach(attr => cloneSVGs[i].setAttribute(attr.name, attr.value));
      cloneSVGs[i].innerHTML = svg.innerHTML;
      const cs = getComputedStyle(svg);
      cloneSVGs[i].style.width = cs.width;
      cloneSVGs[i].style.height = cs.height;
      if (svg.hasAttribute('viewBox') && !cloneSVGs[i].hasAttribute('viewBox')) {
        cloneSVGs[i].setAttribute('viewBox', svg.getAttribute('viewBox'));
      }
    } catch (e) { /* skip */ }
  });

  // Fix Canvases — convert to images
  const origCanvases = original.querySelectorAll('canvas');
  const cloneCanvases = clone.querySelectorAll('canvas');
  origCanvases.forEach((canvas, i) => {
    if (!cloneCanvases[i]) return;
    try {
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/png');
      img.style.width = canvas.style.width || canvas.width + 'px';
      img.style.height = canvas.style.height || canvas.height + 'px';
      img.style.display = canvas.style.display || 'block';
      cloneCanvases[i].parentNode.replaceChild(img, cloneCanvases[i]);
    } catch (e) { /* tainted canvas */ }
  });
};

// Helper: get UAE Dirham symbol SVG
const getUAEDirhamSymbolHTML = () => {
  return '<svg class="uae-dirham-symbol" viewBox="0 0 344.84 299.91" xmlns="http://www.w3.org/2000/svg" fill="currentColor" style="display: inline-block; vertical-align: -0.125em; width: 0.95em; height: 0.95em; margin-right: 0.15em; flex-shrink: 0;"><path d="M342.14,140.96l2.7,2.54v-7.72c0-17-11.92-30.84-26.56-30.84h-23.41C278.49,36.7,222.69,0,139.68,0c-52.86,0-59.65,0-109.71,0,0,0,15.03,12.63,15.03,52.4v52.58h-27.68c-5.38,0-10.43-2.08-14.61-6.01l-2.7-2.54v7.72c0,17.01,11.92,30.84,26.56,30.84h18.44s0,29.99,0,29.99h-27.68c-5.38,0-10.43-2.07-14.61-6.01l-2.7-2.54v7.71c0,17,11.92,30.82,26.56,30.82h18.44s0,54.89,0,54.89c0,38.65-15.03,50.06-15.03,50.06h109.71c85.62,0,139.64-36.96,155.38-104.98h32.46c5.38,0,10.43,2.07,14.61,6l2.7,2.54v-7.71c0-17-11.92-30.83-26.56-30.83h-18.9c.32-4.88.49-9.87.49-15s-.18-10.11-.51-14.99h28.17c5.37,0,10.43,2.07,14.61,6.01ZM89.96,15.01h45.86c61.7,0,97.44,27.33,108.1,89.94l-153.96.02V15.01ZM136.21,284.93h-46.26v-89.98l153.87-.02c-9.97,56.66-42.07,88.38-107.61,90ZM247.34,149.96c0,5.13-.11,10.13-.34,14.99l-157.04.02v-29.99l157.05-.02c.22,4.84.33,9.83.33,15Z"/></svg>';
};

const getCurrencySymbolHTML = (currency) => {
  if (!currency || currency.code === 'AED') return getUAEDirhamSymbolHTML();
  return '<span style="display:inline-block;vertical-align:-0.05em;margin-right:0.15em;font-size:1em;font-weight:600;">' + (currency.symbol || currency.code) + '</span>';
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const OptimizedDashboardExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCards, setSelectedCards] = useState(EXPORT_CARDS.map(c => c.id));
  const [exportFormat, setExportFormat] = useState('html');
  const [kpiDataReady, setKpiDataReady] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const abortRef = useRef(false);

  const { selectedDivision } = useExcelData();
  const { plData } = usePLData();
  const { companyCurrency } = useCurrency();
  const { getDivisionName } = useDivisionNames();
  const {
    columnOrder,
    basePeriodIndex,
    isColumnVisibleInChart,
    dataGenerated
  } = useFilter();

  // Poll for KPI data readiness
  useEffect(() => {
    if (!dataGenerated) { setKpiDataReady(false); return; }
    const check = () => window.__kpiDataReady === true;
    if (check()) { setKpiDataReady(true); return; }
    const poll = setInterval(() => { if (check()) { setKpiDataReady(true); clearInterval(poll); } }, 500);
    const timeout = setTimeout(() => { clearInterval(poll); setKpiDataReady(true); }, 20000);
    return () => { clearInterval(poll); clearTimeout(timeout); };
  }, [dataGenerated]);

  // Cleanup CSS cache on unmount
  useEffect(() => () => clearCSSCache(), []);

  const handleCardToggle = (cardId) => {
    setSelectedCards(prev => prev.includes(cardId) ? prev.filter(id => id !== cardId) : [...prev, cardId]);
  };
  const handleSelectAll = () => setSelectedCards(EXPORT_CARDS.map(c => c.id));
  const handleDeselectAll = () => setSelectedCards([]);
  const isCardSelected = (cardId) => selectedCards.includes(cardId);
  const getCardsByCategory = (category) => EXPORT_CARDS.filter(c => c.category === category);

  // ============================================================================
  // CORE: Sequential card capture via overlay (same proven approach as original)
  // but with CSS caching, chart fixing, and progress tracking
  // ============================================================================
  const captureCardViaOverlay = async (cardId, progressCallback) => {
    const cardTitle = CARD_TITLE_MAP[cardId];
    if (!cardTitle) { console.warn(`Unknown card ID: ${cardId}`); return null; }

    const startTime = Date.now();
    console.log(`\n⚡ [Optimized] Capturing: "${cardTitle}" (${cardId})`);

    try {
      // Find and click the card
      const allCards = document.querySelectorAll('.divisional-dashboard__card');
      const card = Array.from(allCards).find(c => {
        const title = c.querySelector('.divisional-dashboard__card-title');
        return title && title.textContent?.includes(cardTitle);
      });

      if (!card) {
        console.warn(`  ⚠️ Card not found: "${cardTitle}"`);
        return null;
      }

      card.click();
      await new Promise(r => setTimeout(r, 800));

      // Poll for overlay + content (max 20s)
      const maxWait = 20000;
      const pollInterval = 400;
      const pollStart = Date.now();

      while (Date.now() - pollStart < maxWait) {
        const overlay = document.querySelector('.divisional-dashboard__overlay');
        if (!overlay) {
          await new Promise(r => setTimeout(r, pollInterval));
          continue;
        }

        const hasTable = overlay.querySelector('table, .pl-table, .product-group-table, .sales-by-customer-table, .sales-by-sales-rep-table, .sales-by-country-table, .sbc-table');
        const hasChart = overlay.querySelector('canvas, .echarts-container, [_echarts_instance_]');
        const hasKPI = overlay.querySelector('.financial-performance-section, .product-performance-section, .kpi-financial-card');
        const hasSubCards = overlay.querySelector('.sales-country-subcard');
        const hasSVGChart = overlay.querySelector('svg.recharts-surface, .recharts-wrapper');
        const loadingEl = overlay.querySelector('.divisional-dashboard__loading');

        if ((hasTable || hasChart || hasKPI || hasSubCards || hasSVGChart) && !loadingEl) {
          await new Promise(r => setTimeout(r, 400));
          break;
        }

        // HTML size fallback after 3s
        if (!loadingEl && overlay.innerHTML.length > 5000 && Date.now() - pollStart > 3000) {
          await new Promise(r => setTimeout(r, 400));
          break;
        }

        await new Promise(r => setTimeout(r, pollInterval));
      }

      // Special handling for Sales by Countries — switch to Table view
      if (cardId === 'sales-country') {
        await new Promise(r => setTimeout(r, 500));
        if (window.__salesCountrySetActiveView) {
          window.__salesCountrySetActiveView('table');
          // Poll for table to appear after view switch
          const tableStart = Date.now();
          while (Date.now() - tableStart < 10000) {
            const overlay = document.querySelector('.divisional-dashboard__overlay');
            const hasTable = overlay?.querySelector('table, .sbc-table, .sales-by-country-table');
            if (hasTable) {
              await new Promise(r => setTimeout(r, 500));
              break;
            }
            await new Promise(r => setTimeout(r, 400));
          }
        } else {
          // Fallback: click the Table sub-card
          const overlay = document.querySelector('.divisional-dashboard__overlay');
          const subCards = overlay?.querySelectorAll('.sales-country-subcard') || [];
          for (const sc of subCards) {
            const titleEl = sc.querySelector('.sales-country-subcard-title');
            if (titleEl?.textContent?.trim().toLowerCase() === 'table') {
              sc.click();
              await new Promise(r => setTimeout(r, 3000));
              break;
            }
          }
        }
      }

      // Capture the overlay
      const overlay = document.querySelector('.divisional-dashboard__overlay');
      if (!overlay) {
        console.warn(`  ⚠️ Overlay not found for "${cardTitle}"`);
        return null;
      }

      // Wait for charts to render
      await waitForChartsToRender(overlay, cardId);

      // Convert canvases to images BEFORE cloning
      const canvases = Array.from(overlay.querySelectorAll('canvas'));
      const canvasReplacements = [];
      canvases.forEach(canvas => {
        try {
          const img = document.createElement('img');
          img.src = canvas.toDataURL('image/png');
          img.style.width = canvas.style.width || canvas.width + 'px';
          img.style.height = canvas.style.height || canvas.height + 'px';
          img.style.display = canvas.style.display || 'block';
          img.className = canvas.className;
          canvas.parentNode.replaceChild(img, canvas);
          canvasReplacements.push({ img, canvas, parent: img.parentNode });
        } catch (e) { /* tainted */ }
      });

      // Clone
      const clone = overlay.cloneNode(true);

      // Fix SVGs in clone
      fixChartElements(clone, overlay);

      // Remove back button from clone
      const backBtnClone = clone.querySelector('.divisional-dashboard__overlay-close');
      if (backBtnClone) backBtnClone.remove();

      // Close overlay
      const backButton = document.querySelector('.divisional-dashboard__overlay-close');
      if (backButton) {
        backButton.click();
        await new Promise(r => setTimeout(r, 400));
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const htmlLen = clone.outerHTML.length;
      console.log(`  ✅ "${cardTitle}" captured: ${htmlLen.toLocaleString()} chars in ${duration}s`);

      return {
        id: cardId,
        title: EXPORT_CARDS.find(c => c.id === cardId)?.title || cardTitle,
        html: clone.outerHTML,
        charCount: htmlLen
      };
    } catch (err) {
      console.error(`  ❌ Failed to capture "${cardTitle}":`, err);
      // Try to close overlay if open
      const backButton = document.querySelector('.divisional-dashboard__overlay-close');
      if (backButton) backButton.click();
      await new Promise(r => setTimeout(r, 300));
      return null;
    }
  };

