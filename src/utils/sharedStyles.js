/**
 * @deprecated This file contains hardcoded CSS that becomes outdated.
 * 
 * DEPRECATED: DO NOT USE THIS FILE
 * 
 * This file is OBSOLETE and should not be used. It contains hardcoded CSS content that:
 * 1. Becomes out of sync with actual .css files
 * 2. Requires manual updates when styling changes
 * 3. Creates maintenance problems
 * 
 * CORRECT APPROACH:
 * - Live components: Import .css files directly (e.g., import './KPIExecutiveSummary.css')
 * - HTML exports: Use runtime CSS extraction from document.styleSheets
 *   (see extractLiveKPICSS, extractOverlayCSS functions in MultiChartHTMLExport.js)
 * 
 * This ensures:
 * ✅ Single source of truth (actual .css files)
 * ✅ Automatic sync between live and export
 * ✅ No manual copying needed when CSS changes
 * 
 * Files still importing this should be refactored to use runtime extraction.
 */

// DEPRECATED - DO NOT USE
// Kept temporarily for backward compatibility with old export components
export const KPI_CSS_CONTENT = `
/* KPI Executive Summary Styles - Enhanced Version */
.kpi-dashboard {
  background: white;
  min-height: 100vh;
  padding: 24px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  overflow-x: hidden;
}

/* Override for exported HTML context - remove container styling */
.full-screen-chart .kpi-dashboard {
  background: white;
  min-height: auto;
  padding: 0;
}

/* Fix container overlap and spacing issues */
.full-screen-chart {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: white;
  z-index: 1000;
  overflow-y: auto;
}

.full-screen-header {
  position: sticky;
  top: 0;
  background: #000;
  color: white;
  z-index: 1001;
  padding: 20px;
  border-bottom: 1px solid #000;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.full-screen-content {
  padding: 20px;
  max-width: 100%;
  overflow-x: hidden;
  background: #ffffff;
}

.kpi-dashboard > h2 {
  text-align: center;
  font-weight: 700;
  font-size: 1.5rem;  /* Consistent with other pages - 24px */
  margin-bottom: 8px;
}

/* KPI Header Period Styling - Clean and Simple */
.kpi-dashboard > div:nth-child(2),
.kpi-dashboard > div:nth-child(4) {
  text-align: center;
  margin-bottom: 6px;
}

.kpi-dashboard > div:nth-child(2) > span,
.kpi-dashboard > div:nth-child(4) > span {
  font-weight: 700;
  font-size: 18px;
  color: #1f2937;
}

.kpi-dashboard > div:nth-child(3) {
  text-align: center;
  margin-bottom: 6px;
}

.kpi-period-vs {
  font-weight: 700;
  font-size: 18px;
  color: #1f2937;
}


.kpi-section {
  background: #ffffff;
  border-radius: 16px;
  padding: clamp(16px, 2vw, 28px);
  margin-bottom: 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
  position: relative;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.kpi-section-title {
  font-size: 1.4em;
  font-weight: 700;
  color: #1e293b;
  margin-bottom: 28px;
  text-align: center;
  border-bottom: 3px solid #667eea;
  padding-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  background: linear-gradient(135deg, #667eea, #764ba2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.kpi-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  align-items: stretch;
  margin: 8px 0 0;
  width: 100%;
  overflow: hidden;
}

/* Ensure full-width cards span correctly */
.kpi-cards .revenue-drivers {
  grid-column: 1 / -1;
  width: 100%;
  min-width: 100%;
  max-width: 100%;
}

.kpi-card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.08);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  backdrop-filter: blur(10px);
}

.kpi-card:hover {
  transform: translateY(-6px) scale(1.02);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.15);
  border-color: rgba(102, 126, 234, 0.3);
}

.kpi-card.large {
  grid-column: span 2;
  min-height: 170px;
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  width: 4px;
  background: linear-gradient(to bottom, #667eea, #764ba2);
  border-radius: 0 2px 2px 0;
}

/* PROPER VISUAL HIERARCHY - UNIFORM FONT SYSTEM */

.kpi-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 2.5rem;
  margin-bottom: 16px;
}

/* LEVEL 1: CARD TITLES - LARGEST AND MOST PROMINENT */
.kpi-label {
  text-align: center;
  font-size: 1.3rem;
  font-weight: 700;
  color: #444b54;
  letter-spacing: 0.04em;
  margin-top: 0;
}

/* LEVEL 2: CARD CONTENT - UNIFORM MEDIUM SIZE */
.kpi-value {
  font-size: 1.4em;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  margin-bottom: 12px;
  line-height: 1.3;
  font-family: 'Segoe UI', sans-serif;
}

/* LEVEL 3: CARD TRENDS - SMALLEST */
.kpi-trend {
  font-size: 0.88em;
  text-align: center;
  color: #6b7280;
  font-weight: 500;
  line-height: 1.4;
  padding: 4px 8px;
  background: rgba(102, 126, 234, 0.05);
  border-radius: 6px;
  border: 1px solid rgba(102, 126, 234, 0.1);
}

/* Enhanced category cards styling */
.category-cards {
  display: grid;
  gap: 16px;
  margin-top: 20px;
}

.category-card {
  background: white;
  border-radius: 10px;
  padding: 16px;
  border-left: 4px solid #3b82f6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
  min-height: 160px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.category-title {
  font-weight: 700;
  color: #2d3748;
  margin-bottom: 10px;
  font-size: 1.1em;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}

.category-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
  font-size: 0.9em;
}

.category-metric {
  color: #4a5568;
  padding: 6px 0;
  border-bottom: 1px solid rgba(59, 130, 246, 0.2);
  font-weight: 500;
}

/* Responsive adjustments - Enhanced */
@media (max-width: 1400px) {
  .kpi-cards {
    grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
    gap: 18px;
    width: 100%;
    margin: 12px 0 0;
  }

  .kpi-section {
    padding: 28px;
    margin-bottom: 28px;
  }
}

@media (max-width: 1200px) {
  .kpi-cards {
    grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    gap: 16px;
    width: 100%;
    margin: 12px 0 0;
  }

  .kpi-card.large {
    grid-column: span 1;
  }

  .kpi-card {
    min-height: 160px;
    padding: 20px;
  }

  .kpi-label {
    font-size: 0.85em;
  }

  .kpi-value {
    font-size: 1.3em;
  }

  .kpi-icon {
    font-size: 2em;
    margin-bottom: 12px;
  }
}

@media (max-width: 1100px) {
  .kpi-cards {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 14px;
    width: 100%;
    margin: 12px 0 0;
  }
}

@media (max-width: 1000px) {
  .kpi-cards {
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 12px;
    width: 100%;
    margin: 12px 0 0;
  }
}

@media (max-width: 768px) {
  .kpi-dashboard {
    padding: 16px;
  }

  .kpi-section {
    padding: 20px;
    margin-bottom: 20px;
    border-radius: 12px;
  }

  .kpi-cards {
    grid-template-columns: 1fr;
    gap: 16px;
    width: 100%;
    margin: 12px 0 0;
  }

  .kpi-card {
    padding: 18px;
    min-height: 160px;
    border-radius: 10px;
  }

  .kpi-label {
    font-size: 0.85em;
    margin-bottom: 10px;
  }

  .kpi-value {
    font-size: 1.2em;
    margin-bottom: 10px;
  }

  .kpi-icon {
    font-size: 1.8em;
    margin-bottom: 12px;
  }

  .kpi-trend {
    font-size: 0.8em;
    padding: 3px 6px;
  }

  /* Ensure category (Process/Material) cards are not clipped on mobile */
  .product-performance-section .kpi-cards.category-cards .kpi-card {
    min-height: auto !important;
    max-height: none !important;
    overflow: visible !important;
    padding: 16px !important;
  }

  /* Avoid vertical truncation inside category cards */
  .product-performance-section .kpi-cards.category-cards .kpi-card .kpi-value {
    line-height: 1.4 !important;
    overflow: visible !important;
  }

  /* Top Revenue Drivers: allow horizontal scroll ONLY on portrait mobile */
}

@media (max-width: 768px) and (orientation: portrait) {
  .revenue-drivers { overflow: visible !important; }
  .revenue-drivers .kpi-value {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior-x: contain !important;
  }
}

/* Top Revenue Drivers - MATCH OTHER CARDS EXACTLY */
.kpi-card .kpi-value ol {
  text-align: center;
  margin: 0;
  padding-left: 0;
  line-height: 1.3;
  list-style: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  font-weight: inherit;
}

.kpi-card .kpi-value ol li {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: inherit;
  padding: 8px 14px;
  background: rgba(102, 126, 234, 0.06);
  border-radius: 8px;
  border-left: 3px solid #667eea;
  width: 100%;
  text-align: left;
  color: inherit;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.kpi-card .kpi-value ol li:hover {
  background: rgba(102, 126, 234, 0.1);
  transform: translateX(4px);
}

/* Arrow color classes - Enhanced */
.arrow-positive {
  color: #007bff;
  font-weight: 700;
}

.arrow-negative {
  color: #dc3545;
  font-weight: 700;
}

.kpi-value > div {
  margin-bottom: 8px;
}

/* Category Highlighting - Direct approach */
.category-highlight {
  font-size: 1.1em;
  margin-bottom: 12px;
  font-weight: 700;
  color: #1e40af;
  text-decoration: underline;
  text-decoration-color: #3b82f6;
  text-decoration-thickness: 2px;
  text-underline-offset: 3px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  letter-spacing: 0.8px;
}

/* Financial Performance Cards - Semantic styling */
.financial-performance-section .kpi-card:nth-child(1)::before {
  background: #10b981;
}

.financial-performance-section .kpi-card:nth-child(2)::before {
  background: #3b82f6;
}

.financial-performance-section .kpi-card:nth-child(3)::before {
  background: #8b5cf6;
}

.financial-performance-section .kpi-card:nth-child(4)::before {
  background: #f59e0b;
}

/* Product Performance Cards */
.product-performance-section .kpi-card::before {
  background: #ef4444;
}

.product-performance-section .kpi-card.large::before {
  background: #dc2626;
}

/* Geographic Distribution Cards */
.geographic-distribution-section .kpi-card::before {
  background: #06b6d4;
}

/* Customer Insights Cards */
.customer-insights-section .kpi-card::before {
  background: #84cc16;
}

/* ===== MODERN CATEGORY CARDS - Creative Design for HTML Export ===== */

/* Category Section Headers */
.category-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 32px;
  margin-bottom: 8px;
  padding: 0 8px;
}

.category-section-header .section-icon {
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
}

.category-section-header .section-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #374151;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.category-section-header.material .section-icon {
  background: linear-gradient(135deg, rgba(79, 172, 254, 0.1) 0%, rgba(0, 242, 254, 0.1) 100%);
}

/* Force all cards in single row */
.category-cards.process-row,
.category-cards.material-row {
  display: flex !important;
  flex-wrap: nowrap;
  gap: 20px;
  width: 100%;
  margin-top: 16px;
}

.category-cards.process-row > .category-card-modern,
.category-cards.material-row > .category-card-modern {
  flex: 1 1 0;
  min-width: 0;
}

/* Modern Category Card Container */
.category-card-modern {
  background: #ffffff;
  border-radius: 20px;
  padding: 0;
  overflow: hidden;
  box-shadow: 
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06),
    0 20px 25px -5px rgba(0, 0, 0, 0.08);
  min-height: 260px;
  max-width: 100%;
}

/* Gradient Headers */
.category-card-header {
  padding: 20px 24px;
  position: relative;
  overflow: hidden;
}

.category-card-modern.process-printed .category-card-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.category-card-modern.process-unprinted .category-card-header,
.category-card-modern.process-plain .category-card-header {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.category-card-modern.material-pe .category-card-header {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.category-card-modern.material-nonpe .category-card-header,
.category-card-modern.material-non-pe .category-card-header {
  background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%);
}

.category-card-header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.category-card-title {
  font-size: 1.5rem;
  font-weight: 800;
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  margin: 0;
}

.category-card-icon {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

/* Card Body */
.category-card-body {
  padding: 24px;
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 20px;
  align-items: center;
}

/* Progress Ring */
.progress-ring-container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-ring {
  transform: rotate(-90deg);
}

.progress-ring-bg {
  fill: none;
  stroke: #e5e7eb;
  stroke-width: 8;
}

.progress-ring-fill {
  fill: none;
  stroke-width: 8;
  stroke-linecap: round;
}

.progress-ring-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}

.progress-ring-percentage {
  font-size: 2rem;
  font-weight: 800;
  color: #1f2937;
  line-height: 1;
  display: block;
}

.progress-ring-label {
  font-size: 0.7rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-top: 4px;
  display: block;
}

/* Metrics Grid */
.category-metrics-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.category-metric-item {
  background: #f8fafc;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.metric-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.metric-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.metric-value {
  font-size: 1.15rem;
  font-weight: 700;
  color: #1f2937;
}

.metric-change {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.95rem;
  font-weight: 700;
}

.metric-change.positive {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(5, 150, 105, 0.15) 100%);
  color: #059669;
}

.metric-change.negative {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(220, 38, 38, 0.15) 100%);
  color: #dc2626;
}

.metric-change-icon {
  font-size: 1.1rem;
  font-weight: 800;
}

/* Legacy CATEGORY CARDS - for backward compatibility */
.product-performance-section .kpi-cards.category-cards .kpi-card {
  min-height: 320px;
  max-height: 350px;
  background: linear-gradient(135deg, #fafafa 0%, #ffffff 100%);
  border: 2px solid rgba(102, 126, 234, 0.1);
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.product-performance-section .kpi-cards.category-cards .kpi-card .kpi-value {
  font-size: 1.4em;
  line-height: 1.6;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  font-weight: 600;
  color: #1f2937;
  text-align: center;
  gap: 12px;
  margin-bottom: 10px;
}

.product-performance-section .kpi-cards.category-cards .kpi-card .kpi-label {
  font-size: 1.6em;
  margin-bottom: 16px;
  font-weight: 700;
  color: #1e40af;
  text-decoration: underline;
  text-align: center;
  letter-spacing: 1px;
  padding: 8px 12px;
}

/* Force category cards to stay in single horizontal rows */
.product-performance-section .kpi-cards.category-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 28px;
  margin-top: 24px;
  margin-bottom: 24px;
  width: 100%;
  max-width: none;
}

/* Top Revenue Drivers specific styling - Single Card with 3 Internal Rows */
.revenue-drivers {
  grid-column: 1 / -1; /* Force full width across all columns */
  min-height: auto;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible; /* avoid clipping inner highlight backgrounds */
  box-sizing: border-box;
}

.revenue-drivers .kpi-label {
  font-weight: 700;
  font-size: 1.05em;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  text-align: center;
  margin-bottom: 20px;
}

.revenue-drivers .kpi-value {
  width: 100%;
  text-align: left;
  flex: 1;
}

.revenue-drivers > div {
  padding-left: 0;
  margin: 0;
  width: 100%;
}

.revenue-drivers > div > div {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  /* Consistent highlight (avoid gradient fade that looks like a color bug on small screens) */
  background: rgba(102, 126, 234, 0.05);
  border-radius: 8px;
  border-left: 4px solid #667eea;
  transition: all 0.2s ease;
  width: 100%;
}

.revenue-drivers > div > div:hover {
  background: rgba(102, 126, 234, 0.08);
  transform: translateX(4px);
}

.revenue-drivers > div > div:not(:last-child) {
  margin-bottom: 16px;
}

/* Medal emojis styling in revenue drivers */
.revenue-drivers > div > div > span:first-child {
  font-size: 2.2em;
  margin-right: 16px;
  min-width: 40px;
  text-align: center;
}

/* Product details styling */
.revenue-drivers > div > div > div {
  flex: 1;
}

.revenue-drivers > div > div > div > div:first-child {
  font-weight: 600;
  font-size: 1.1em;
  color: #1f2937;
  margin-bottom: 4px;
}

.revenue-drivers > div > div > div > div:last-child {
  font-size: 0.9em;
  color: #6b7280;
}

/* Improve arrow styling in revenue drivers */
.revenue-drivers .arrow-positive,
.revenue-drivers .arrow-negative {
  font-size: 0.85em;
  padding: 3px 8px;
  margin-left: 8px;
}

/* Geographic Distribution Cards */

/* Desktop/Tablet: Single-row flex layout that dynamically fits all regions */
.export-regions {
  display: flex;
  flex-wrap: nowrap;
  gap: 16px;
  justify-content: space-between;
  align-items: stretch;
}

.export-regions .kpi-card {
  flex: 1 1 0;
  min-width: 0; /* Allow cards to shrink below content size */
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
}

/* Mobile Portrait ONLY: Horizontal card rail with scroll for geographic regions */
/* ⚠️ SYNC WARNING: Must match MultiChartHTMLExport.js export-regions portrait rules */
@media (max-width: 768px) and (orientation: portrait) {
  .export-regions {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 16px !important;
    width: 100% !important;
    padding: 6px 8px 10px !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    overscroll-behavior-x: contain !important;
    scroll-snap-type: x mandatory !important;
  }

  .export-regions .kpi-card {
    /* Fixed width cards on mobile for swipeable rail */
    flex: 0 0 auto !important;
    min-width: clamp(220px, 80vw, 300px) !important;
    max-width: 90vw !important;
    scroll-snap-align: start !important;
  }
  
  /* Simple KPI Cards Horizontal Rail - matches export behavior */
  /* ⚠️ SYNC WARNING: Must match MultiChartHTMLExport.js .kpi-cards portrait rules */
  .kpi-cards:not(.category-cards):not(.export-regions) { 
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    gap: 12px !important;
    scroll-snap-type: x proximity !important;
    padding: 4px 4px 10px !important;
    margin: 0 -4px !important;
  }
  
  .kpi-cards::-webkit-scrollbar { height: 6px; }
  .kpi-cards::-webkit-scrollbar-track { background: transparent; }
  .kpi-cards::-webkit-scrollbar-thumb { background: #c5d2ec; border-radius: 3px; }
  
  .kpi-cards:not(.category-cards):not(.export-regions) .kpi-card { 
    flex: 0 0 auto !important;
    min-width: clamp(220px, 80vw, 320px) !important;
    max-width: 86vw !important;
    scroll-snap-align: start !important;
    padding: 16px !important;
    min-height: 150px !important;
    transition: none !important;
  }
  
  /* Make the full-width revenue drivers card span the viewport to avoid truncation */
  .kpi-cards:not(.category-cards):not(.export-regions) .kpi-card.revenue-drivers {
    flex: 0 0 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
  }
  
  /* Category cards (Process/Material) should stack vertically, not scroll */
  .kpi-section .kpi-cards.category-cards { 
    display: grid !important;
    grid-template-columns: 1fr !important;
    gap: 16px !important;
    overflow: visible !important;
  }
}

.export-regions .kpi-card::before {
  background: linear-gradient(to bottom, #06b6d4, #0284c7);
}

.export-regions .kpi-card .kpi-trend {
  font-size: 0.8em;
  color: #64748b;
}

/* Visual connector under Export card */
.export-connector {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  height: 40px;
  margin: 10px 0 15px 0;
  padding-right: 25%;
  position: relative;
}

.export-connector__arrow {
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 12px solid #6b7280;
}

.export-connector__bracket {
  position: absolute;
  top: 20px;
  left: 0;
  right: 0;
  height: 3px;
  background: #6b7280;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.4);
}

.export-connector__bracket::before,
.export-connector__bracket::after {
  content: '';
  position: absolute;
  width: 3px;
  height: 15px;
  background: #6b7280;
  box-shadow: 0 0 8px rgba(59, 130, 246, 0.6), 0 0 16px rgba(59, 130, 246, 0.4);
}

.export-connector__bracket::before {
  left: 0;
  top: 0;
}

.export-connector__bracket::after {
  right: 0;
  top: 0;
}

/* UAE Local Card */
.uae-icon-container {
  width: 60px;
  height: 60px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
}

.uae-icon {
  width: 50px;
  height: 50px;
}

/* Globe Container */
.rotating-emoji-container {
  width: 60px;
  height: 60px;
  margin: 0 auto 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.rotating-emoji {
  font-size: 40px;
  animation: rotate-emoji 20s linear infinite;
}

@keyframes rotate-emoji {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Region Globe Container */
.region-globe-container {
  width: 50px;
  height: 50px;
  margin: 0 auto 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: transparent;
  box-shadow: none;
  border: none;
}

.region-globe {
  font-size: 32px;
  animation: pulse-globe 3s ease-in-out infinite;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
}

@keyframes pulse-globe {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

/* Force export regions to always stay in one row - no scrolling */
@media (max-width: 1200px) {
  .export-regions {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 14px !important;
  }
}

@media (max-width: 768px) {
  .export-regions {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 12px !important;
  }
  .export-regions .kpi-card {
    min-width: clamp(220px, 82vw, 300px) !important;
  }
}

@media (max-width: 480px) {
  .export-regions {
    display: flex !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
  }
  .export-regions .kpi-card {
    min-width: clamp(220px, 88vw, 320px) !important;
  }
}

/* ========================================
   LANDSCAPE RESPONSIVE FIXES
   ⚠️ SYNC WARNING: Must match MultiChartHTMLExport.js landscape rules
   ======================================== */

/* Customer Insights - Landscape: smaller fonts to prevent truncation */
@media (max-width: 1024px) and (orientation: landscape) {
  .customer-names-small {
    font-size: 0.75em !important;
    white-space: normal !important;
    overflow: visible !important;
    text-overflow: clip !important;
  }
  .customer-line {
    flex-wrap: nowrap !important;
  }
  .customer-line span:first-child {
    font-size: 0.85em !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    max-width: calc(100% - 45px) !important;
  }
  .customer-percentage {
    font-size: 0.7em !important;
    min-width: 35px !important;
    text-align: right !important;
  }
  .kpi-card .kpi-value {
    font-size: 1.1em !important;
  }
  .kpi-card .kpi-label {
    font-size: 0.75em !important;
  }
  .customer-subtitle {
    font-size: 10px !important;
  }
}

/* Phone landscape: even smaller for tight space */
@media (max-width: 767px) and (orientation: landscape) {
  .customer-names-small {
    font-size: 0.7em !important;
  }
  .customer-line span:first-child {
    font-size: 0.75em !important;
    max-width: calc(100% - 40px) !important;
  }
  .customer-percentage {
    font-size: 0.65em !important;
    min-width: 30px !important;
  }
  .kpi-card .kpi-value {
    font-size: 1em !important;
  }
  .kpi-card .kpi-label {
    font-size: 0.7em !important;
  }
}

/* Error and loading states */
.kpi-error-state {
  padding: 32px;
  text-align: center;
  color: #888;
}

/* Customer insights styling */
.customer-line {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
  min-width: 0; /* Allow flex items to shrink */
}

.customer-line span:first-child {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-right: 8px;
}

.customer-percentage {
  font-size: 0.8em;
  color: #666;
  font-weight: 600;
}

.customer-subtitle {
  font-weight: bold;
  font-size: 12px;
  margin-top: 2px;
  margin-bottom: 8px;
  color: #666;
}

/* Customer insights cards - reduce gap between value and subtitle */
.customer-insights-section .kpi-card .kpi-value {
  margin-bottom: 2px;
}

/* Revenue drivers styling */
.revenue-driver-item {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.revenue-driver-medal {
  font-size: 1.8em;
  margin-right: 12px;
  min-width: 40px;
  text-align: center;
}

.revenue-driver-content {
  flex: 1;
}

.revenue-driver-name {
  font-weight: 600;
  margin-bottom: 4px;
  color: #1f2937;
}

.revenue-driver-details {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Growth indicators */
.growth-indicator {
  margin-left: 8px;
}

/* Ensure trend text appears on new line */
.kpi-trend {
  display: block !important;
  margin-top: 4px;
  line-height: 1.2;
}

/* Geographic region styling */
.region-card-gradient {
  background: linear-gradient(135deg, var(--gradient-color), var(--gradient-color-cc));
  border-left: 4px solid var(--gradient-color);
  box-shadow: 0 4px 12px var(--gradient-color-44);
}

.region-label-light {
  color: white;
  font-weight: 700;
}

.region-label-dark {
  color: #2d3748;
  font-weight: 700;
}

.region-value-light {
  color: white;
  font-weight: 800;
}

.region-value-dark {
  color: #1a365d;
  font-weight: 800;
}

.region-trend-light {
  color: #e2e8f0;
}

.region-trend-dark {
  color: #4a5568;
}

.region-growth {
  font-size: 14px;
  font-weight: 700;
  margin-top: 2px;
}

.region-growth-positive {
  color: #10b981;
}

.region-growth-negative {
  color: #ef4444;
}

.region-growth-arrow {
  font-weight: 900;
}

.region-growth-subtitle {
  font-size: 10px;
  font-weight: 400;
  margin-top: 2px;
}

.region-tooltip {
  font-size: 10px;
  margin-top: 2px;
  font-style: italic;
}

.region-tooltip-light {
  color: #e2e8f0;
}

.region-tooltip-dark {
  color: #666;
}

/* Back button styling for export */
.back-button {
  position: absolute;
  top: 20px;
  left: 20px;
  background: #667eea;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 14px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
  z-index: 10;
}

.back-button:hover {
  background: #5a6fcf;
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.customer-names-small {
  font-size: 0.9em;
  color: #666;
  font-weight: 500;
  margin-top: 2px;
  white-space: nowrap;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Customer lines with dots styling */
.customer-line-with-dots {
  display: flex;
  align-items: baseline;
  width: 100%;
  margin-bottom: 2px;
}

.customer-name {
  flex-shrink: 0;
  margin-right: 8px;
}

.customer-dots {
  flex: 1;
  border-bottom: 1px dotted #ccc;
  margin: 0 8px;
  height: 1px;
  align-self: flex-end;
  margin-bottom: 0.2em;
}

.customer-percentage {
  flex-shrink: 0;
  font-weight: 600;
  color: #666;
  font-size: 0.8em;
}

.kpi-section .kpi-cards .kpi-card {
  min-height: 170px;
}

/* Process and Material Category Cards: 3 per row, centered */
.kpi-section .kpi-cards.category-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(380px, 1fr));
  gap: 20px;
  width: 100%;
  justify-items: stretch;
  align-items: start;
}

@media (max-width: 900px) {
  .kpi-section .kpi-cards.category-cards {
    grid-template-columns: 1fr;
  }
}

/* UAE Dirham Symbol Styling */
.uae-dirham-symbol {
  display: inline-block;
  vertical-align: -0.125em; /* Aligned with updated component */
  width: 0.95em;  /* Match component default */
  height: 0.95em; /* Match component default */
  margin-right: 0.15em; /* Match component default */
  fill: currentColor;
  flex-shrink: 0; /* Prevents distortion in flex containers */
}

/* Currency Symbol - consistent styling for all currencies */
.currency-symbol {
  display: inline-block;
  vertical-align: -0.05em;
  margin-right: 0.15em;
  font-size: 1em;
  line-height: 1;
}
`;

// Shared Sales by Customer Table CSS - fallback copy used when live extraction fails

// Shared Sales by Country Table CSS - single source of truth
// This ensures the main component and HTML export use identical styling
export const SALES_BY_COUNTRY_CSS_CONTENT = `
/* ========================================
   UNIFIED PRODUCT GROUP TABLE STYLES
   Single source of truth for all Product Group table styling
   Used by: Live view, HTML exports, PDF exports
   Based on PLTableStyles.css but adapted for 3 header rows
   ======================================== */

:root {
  /* Sticky header row height - DO NOT override in media queries */
  --sbc-hdr-h: 28px;

  /* z-index layering for sticky elements - higher values to prevent overlaps */
  --z-corner: 20;    /* First column header - always on top */
  --z-hdr3: 16;      /* First header row (Year) */
  --z-hdr2: 15;      /* Second header row (Month) */
  --z-hdr1: 14;      /* Third header row (Type) */
  --z-firstcol: 12;  /* Body first column */
  --z-header: 10;    /* Generic header fallback */
  --z-separator: 1;  /* Period separators */

  /* Responsive font sizing (defaults use fluid clamp; overridden per breakpoint) */
  --sbc-font-base: clamp(9px, 1.8vw, 12px);
  --sbc-font-header: clamp(11px, 2.1vw, 14px);
  --sbc-font-label: var(--sbc-font-base);
  --sbc-font-accent: calc(var(--sbc-font-base) + 1px); /* totals, deltas, country-name */
  --sbc-font-corner: calc(var(--sbc-font-header) + 6px); /* corner header larger than header */
}

/* ========================================
   CORE TABLE STYLING
   ======================================== */

.sales-by-country-table {
  width: 100%;
  min-width: 100%;
  border-collapse: separate; /* needed for sticky headers */
  border-spacing: 0;         /* remove default cell gutters that look like borders */
  font-size: var(--sbc-font-base);
  font-family: Arial, sans-serif;
  table-layout: fixed;
  max-width: 100%;
  background: #fff;
  background-color: #fff;
  color: #222222;
  display: table !important;
}

.sales-by-country-table thead {
  display: table-header-group !important;
}

.sales-by-country-table tbody {
  display: table-row-group !important;
}

.sales-by-country-table tr {
  display: table-row !important;
}

/* Keep headers at responsive 14px */
.sales-by-country-table thead th {
  font-size: var(--sbc-font-header);
  height: var(--sbc-hdr-h) !important;
  min-height: var(--sbc-hdr-h) !important;
  max-height: var(--sbc-hdr-h) !important;
  position: sticky !important;
  top: 0; /* overridden per row below */
  z-index: var(--z-hdr1);
  font-weight: 700;
  overflow: hidden !important;
  box-sizing: border-box !important;
  padding: 4px 6px !important; /* Fixed consistent padding */
  line-height: 1.2 !important;
  vertical-align: middle !important;
  /* IMPORTANT: let inline bg win - removed !important to allow inline styles */
  background-color: transparent;
  background-clip: padding-box !important;
}

/* underlay: blocks rows scrolling behind, but stays under inline color */
/* White underlay ONLY when there is NO inline background on the cell */
.sales-by-country-table thead th:not([style*="background"]):not([style*="background-color"])::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #fff;
  z-index: -1;              /* keep it BEHIND the content and inline bg */
  pointer-events: none;
}

/* If the header DOES have inline bg, don't put white on top of it */
.sales-by-country-table thead th[style*="background"],
.sales-by-country-table thead th[style*="background-color"] {
  background-color: transparent;     /* let inline be visible - removed !important */
}

/* Five sticky header tiers - create layered sticky effect */
.sales-by-country-table thead tr:nth-child(1) th {
  top: 0 !important;
  z-index: var(--z-hdr3) !important;
}
.sales-by-country-table thead tr:nth-child(2) th {
  top: calc(var(--sbc-hdr-h) * 1) !important;
  z-index: var(--z-hdr2) !important;
}
.sales-by-country-table thead tr:nth-child(3) th {
  top: calc(var(--sbc-hdr-h) * 2) !important;
  z-index: var(--z-hdr1) !important;
}
.sales-by-country-table thead tr:nth-child(4) th {
  top: calc(var(--sbc-hdr-h) * 3) !important;
  z-index: var(--z-hdr1) !important;
}
.sales-by-country-table thead tr:nth-child(5) th {
  top: calc(var(--sbc-hdr-h) * 4) !important;
  z-index: var(--z-hdr1) !important;
}

/* First column header - STICKY TOP + LEFT (corner) */
/* Product Groups Names header - same styling as P&L Ledgers header */
.sales-by-country-table thead tr:first-child th.empty-header {
  position: sticky !important;
  left: 0 !important;
  top: 0 !important;
  z-index: var(--z-corner) !important;
  background-color: transparent;     /* inline color can show */
  text-align: center !important;
  vertical-align: middle !important;
  font-family: Arial, sans-serif !important;
  font-size: var(--sbc-font-corner);
  font-weight: bold !important;
  word-break: break-word;
  white-space: normal;
  line-height: 1.1 !important;
  height: calc(var(--sbc-hdr-h) * 5); /* 5 rows for Product Group Dup (Year, Period, Type, Values/%) */
  max-height: calc(var(--sbc-hdr-h) * 5);
  overflow: hidden;
  box-sizing: border-box !important;
  display: table-cell !important;
  min-width: 200px;
  max-width: 200px;
}

.sales-by-country-table thead tr:first-child th.empty-header::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #fff;
  z-index: -1;
  pointer-events: none;
}

/* First data column (row labels) is left-aligned */
.sales-by-country-table tbody td:first-child { text-align: left; }

/* Keep numbers tight in non-first columns */
.sales-by-country-table td:not(:first-child),
.sales-by-country-table thead th:not(:first-child) {
  white-space: nowrap !important;
}

/* ========================================
   TABLE CELL STYLING
   ======================================== */

.sales-by-country-table th,
.sales-by-country-table td {
  display: table-cell !important;
  padding: clamp(2px, 0.5vw, 8px) clamp(3px, 0.7vw, 12px);
  vertical-align: middle;
  text-align: center;
  line-height: 1.15; /* Same as P&L table */
  white-space: normal;   /* allow wrapping by default */
  word-break: normal;
  overflow-wrap: anywhere;
  background-clip: border-box;
  box-sizing: border-box !important;
}

/* FIRST COLUMN (ALL SCREENS) - Body cells - STICKY LEFT */
/* Apply to body first column - EXCLUDE separator rows */
/* Same styling as P&L first column */
.sales-by-country-table tbody tr:not(.sbc-separator-row) td:first-child {
  position: sticky !important;
  left: 0 !important;
  z-index: var(--z-firstcol) !important;
  background-color: transparent;   /* allow row-level / inline */
  text-align: left;
  padding-left: 12px !important; /* Same as P&L table */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 200px;
  max-width: 200px;
  box-sizing: border-box;
}

/* Pseudo-element background for first column - WHITE to prevent bleeding while maintaining white appearance */
/* EXCLUDE separator rows */
/* Extend slightly beyond edges to cover borders and prevent transparency */
.sales-by-country-table thead tr:first-child th.empty-header::before,
.sales-by-country-table tbody tr:not(.sbc-separator-row) td:first-child::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;  /* Don't extend - let border show */
  bottom: 0;
  background-color: #fff; /* Default white, overridden by specific row types below */
  z-index: -1;
  pointer-events: none;
}

/* Extend sticky underlay slightly to cover bleed from scrolling cells */
.sales-by-country-table tbody tr:not(.sbc-separator-row) td:first-child::before {
  right: -3px;
}

/* ========================================
   RECTANGLE BORDERS - 6 BOXES (First Column + 5 Periods)
   2px solid black borders, matching P&L table structure
   Product Group: First column + 5 periods (each period = 1 column, not 3 like P&L)
   Delta columns are NOT part of period rectangles
   ======================================== */

/* TOP BORDERS - First header row across all boxes */
.sales-by-country-table thead tr:first-child th {
  border-top: 2px solid black !important;
}

/* BOTTOM BORDERS - Last body row across all boxes */
.sales-by-country-table tbody tr:last-child td {
  border-bottom: 2px solid black !important;
}

/* SEPARATOR ROW between headers and body - STICKY */
.sales-by-country-table .sbc-separator-row {
  height: 8px !important;
  line-height: 8px !important;
  padding: 0 !important;
}

.sales-by-country-table .sbc-separator-row td {
  position: sticky !important;
  top: calc(var(--sbc-hdr-h) * 4) !important; /* Position below 4 header rows */
  z-index: var(--z-hdr1) !important;
  height: 8px !important;
  padding: 0 !important;
  background-color: transparent;   /* let inline / parent show */
  border-top: 2px solid black !important;
  border-bottom: 2px solid black !important;
  background-clip: padding-box !important;
}

.sales-by-country-table .sbc-separator-row td::before {
  content: '';
  position: absolute;
  inset: 0;
  background: #fff;
  z-index: -1;
  pointer-events: none;
}

/* First cell of separator row - STICKY TOP + LEFT (corner) */
.sales-by-country-table .sbc-separator-row td:first-child {
  position: sticky !important;
  left: 0 !important;
  top: calc(var(--sbc-hdr-h) * 4) !important;
  z-index: var(--z-corner) !important;
  background-color: white !important;
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
  height: 8px !important;
  padding: 0 !important;
  margin: 0 !important;
  vertical-align: top !important;
}

/* SEPARATOR ROW: Period column borders to match header/body rectangles */
/* Period 1 (column 2): Only right border - left already from first column */
.sales-by-country-table .sbc-separator-row td:nth-child(2) {
  border-right: 2px solid black !important;
}

/* Periods 2-10: Both left and right borders */
.sales-by-country-table .sbc-separator-row td:nth-child(4),
.sales-by-country-table .sbc-separator-row td:nth-child(6),
.sales-by-country-table .sbc-separator-row td:nth-child(8),
.sales-by-country-table .sbc-separator-row td:nth-child(10),
.sales-by-country-table .sbc-separator-row td:nth-child(12),
.sales-by-country-table .sbc-separator-row td:nth-child(14),
.sales-by-country-table .sbc-separator-row td:nth-child(16),
.sales-by-country-table .sbc-separator-row td:nth-child(18),
.sales-by-country-table .sbc-separator-row td:nth-child(20) {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* FIRST COLUMN BORDERS (Product Groups Names) */
/* Header: first column spans 3 rows via rowspan */
.sales-by-country-table thead tr:first-child th.empty-header {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* BODY FIRST COLUMN (column 1) */
.sales-by-country-table tbody tr td:nth-child(1) {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* ========================================
   PERIOD BORDER RECTANGLES
   Each period is 1 data column (not 3 like P&L)
   Delta columns appear between periods and are NOT part of period rectangles
   ======================================== */

/* Row 1 (Year row): Periods at even columns (2, 4, 6, 8...) */
/* Period 1 (column 2): Only right border - left border comes from first column's right */
.sales-by-country-table thead tr:nth-child(1) th:nth-child(2) {
  border-right: 2px solid black !important;
}

/* Periods 2-10: Both left and right borders */
.sales-by-country-table thead tr:nth-child(1) th:nth-child(4),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(6),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(8),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(10),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(12),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(14),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(16),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(18),
.sales-by-country-table thead tr:nth-child(1) th:nth-child(20) {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* Row 2 (Month row): Periods at consecutive columns (1, 2, 3, 4...) - deltas filtered out */
/* Period 1 (column 1): Only right border - left border comes from first column's right */
.sales-by-country-table thead tr:nth-child(2) th:nth-child(1) {
  border-right: 2px solid black !important;
}

/* Periods 2-10: Both left and right borders */
.sales-by-country-table thead tr:nth-child(2) th:nth-child(2),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(3),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(4),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(5),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(6),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(7),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(8),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(9),
.sales-by-country-table thead tr:nth-child(2) th:nth-child(10) {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* Row 3 (Type row): Periods at consecutive columns (1, 2, 3, 4...) - deltas filtered out */
/* Period 1 (column 1): Only right border - left border comes from first column's right */
.sales-by-country-table thead tr:nth-child(3) th:nth-child(1) {
  border-right: 2px solid black !important;
}

/* Periods 2-10: Both left and right borders */
.sales-by-country-table thead tr:nth-child(3) th:nth-child(2),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(3),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(4),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(5),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(6),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(7),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(8),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(9),
.sales-by-country-table thead tr:nth-child(3) th:nth-child(10) {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* Row 4 (Values/% subheader row): Each period has 2 cells (Values, %) */
/* Structure: [Period1-Values(1), Period1-%(2), Period2-Values(3), Period2-%(4)...] */
/* Right border on every 2nd cell (%) to complete the rectangle */
.sales-by-country-table thead tr:nth-child(4) th:nth-child(2),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(4),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(6),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(8),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(10),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(12),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(14),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(16),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(18),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(20) {
  border-right: 2px solid black !important;
}

/* Left border on Period 2-10 Values cells (every odd cell starting from 3) */
.sales-by-country-table thead tr:nth-child(4) th:nth-child(3),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(5),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(7),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(9),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(11),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(13),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(15),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(17),
.sales-by-country-table thead tr:nth-child(4) th:nth-child(19) {
  border-left: 2px solid black !important;
}

/* BODY ROWS: Period rectangles - BOTH left and right borders on each data column */
/* Body structure same as Row 1: [firstcol(1), period1(2), delta(3), period2(4), delta(5)...] */
/* Period 1 (column 2): Only right border - left border comes from first column's right */
.sales-by-country-table tbody tr td:nth-child(2) {
  border-right: 2px solid black !important;
}

/* Periods 2-10: Both left and right borders */
.sales-by-country-table tbody tr td:nth-child(4),
.sales-by-country-table tbody tr td:nth-child(6),
.sales-by-country-table tbody tr td:nth-child(8),
.sales-by-country-table tbody tr td:nth-child(10),
.sales-by-country-table tbody tr td:nth-child(12),
.sales-by-country-table tbody tr td:nth-child(14),
.sales-by-country-table tbody tr td:nth-child(16),
.sales-by-country-table tbody tr td:nth-child(18),
.sales-by-country-table tbody tr td:nth-child(20) {
  border-left: 2px solid black !important;
  border-right: 2px solid black !important;
}

/* ========================================
   ROW LABEL STYLING
   ======================================== */

.sales-by-country-table .row-label {
  text-align: left !important;
  background-color: #f8f9fa !important;
  font-weight: normal !important;
  width: 200px !important;
  min-width: 200px !important;
  max-width: 200px !important;
  padding-left: 12px !important; /* Same as P&L table first column */
  font-size: var(--sbc-font-label); /* Consistent font size for all row labels */
}

/* ========================================
   COLOR SCHEMES FOR FIRST COLUMN
   Product Groups, Total, Material, Process - Different colors for complete row highlight
   ======================================== */

/* Product Group header rows - Light Blue (full row) */
.sales-by-country-table .product-header-row.pg-header-row td {
  background-color: #bbdefb !important; /* Light blue */
  color: #0d47a1 !important;
  font-weight: bold !important;
}

.sales-by-country-table .product-header-row.pg-header-row td.row-label.product-header {
  background-color: #bbdefb !important; /* Light blue */
  font-weight: bold !important;
  color: #0d47a1 !important;
  padding: 10px 12px !important;
}

/* Product Group metric rows - White background (only headers get color) */
/* All metric rows that follow product group headers but are not category or total */
/* Use more specific selector to override inline styles */
.sales-by-country-table tbody .metric-row:not(.category-metric-row):not(.total-metric-row) td.row-label.metric-label {
  background-color: white !important; /* White background for metric rows */
  font-weight: normal !important;
  color: #333 !important;
  padding: 6px 12px !important;
}

/* Product Group pseudo-element background for sticky positioning - header */
.sales-by-country-table .product-header-row.pg-header-row td.row-label.product-header::before {
  background-color: #bbdefb !important; /* Light blue for product group headers */
}

/* Product Group pseudo-element background for sticky positioning - metric rows */
.sales-by-country-table tbody .metric-row:not(.category-metric-row):not(.total-metric-row) td.row-label.metric-label::before {
  background-color: white !important; /* White background for sticky metric rows */
}

/* Total header rows - Blue (full row) */
.sales-by-country-table .total-header-row td {
  background-color: #7499A3 !important; /* Blue */
  color: #ffffff !important;
  font-weight: bold !important;
}

.sales-by-country-table .total-header-row td.row-label.product-header {
  background-color: #7499A3 !important; /* Blue */
  font-weight: bold !important;
  color: #ffffff !important;
  padding: 10px 12px !important;
}

/* Total metric rows - Use default gray background (no special coloring) */
.sales-by-country-table .total-metric-row td.row-label.metric-label {
  /* background-color removed - uses default #f8f9fa from .row-label */
  font-weight: bold !important;
  color: #333 !important;
  padding: 6px 12px !important;
}

.sales-by-country-table .total-metric-row td.metric-cell {
  font-weight: bold !important;
}

/* Total pseudo-element background */
.sales-by-country-table .total-header-row td.row-label.product-header::before {
  background-color: #7499A3 !important; /* Blue for total header */
}

.sales-by-country-table .total-metric-row td.row-label.metric-label::before {
  background-color: #f8f9fa !important; /* Default gray background for sticky positioning */
}

/* Material category header rows - Red (full row) */
.sales-by-country-table .material-header-row td {
  background-color: #D93111 !important; /* Red */
  color: #ffffff !important;
  font-weight: bold !important;
}

.sales-by-country-table .material-header-row td.row-label.product-header {
  background-color: #D93111 !important; /* Red */
  font-weight: bold !important;
  color: #ffffff !important;
  padding: 10px 12px !important;
}

/* Material category metric rows - White background like other children */
.sales-by-country-table .material-header-row + .metric-row.category-metric-row td.row-label.metric-label {
  background-color: #ffffff !important; /* White like other children */
  font-weight: normal !important;
  color: #333 !important;
  padding: 6px 12px !important;
}

/* Material category pseudo-element background */
.sales-by-country-table .material-header-row td.row-label.product-header::before {
  background-color: #D93111 !important; /* Red for header */
}
.sales-by-country-table .material-header-row + .metric-row.category-metric-row td.row-label.metric-label::before {
  background-color: #ffffff !important; /* White for metric rows */
}

/* Process category header row - Yellow (already exists, but ensure consistency) */
.sales-by-country-table .process-header-row td {
  background-color: #FBC02D !important; /* solid yellow */
  color: #000000 !important;
  font-weight: 700 !important;
}

.sales-by-country-table .process-header-row td.row-label.product-header {
  background-color: #FBC02D !important; /* solid yellow */
  color: #000000 !important;
  padding: 10px 12px !important;
}

/* Process category metric rows - White background like other children */
.sales-by-country-table .process-header-row + .metric-row.category-metric-row td.row-label.metric-label {
  background-color: #ffffff !important; /* White like other children */
  font-weight: normal !important;
  color: #333 !important;
  padding: 6px 12px !important;
}

/* Process category pseudo-element background */
.sales-by-country-table .process-header-row td.row-label.product-header::before {
  background-color: #FBC02D !important; /* Yellow for header */
}
.sales-by-country-table .process-header-row + .metric-row.category-metric-row td.row-label.metric-label::before {
  background-color: #ffffff !important; /* White for metric rows */
}

/* Category header rows (generic - for Material) */
.sales-by-country-table .category-header-row td.row-label.product-header {
  font-weight: bold !important;
}

/* Default metric label styling (fallback for regular rows) */
.sales-by-country-table .metric-row td.row-label.metric-label {
  background-color: #f8f9fa !important;
  font-weight: normal !important;
  color: #333 !important;
  padding: 6px 12px !important;
}

/* Country name cells - specific styling for sales by country - DESKTOP */
.sales-by-country-table .metric-row td.row-label.country-name-cell {
  font-weight: bold !important;
  font-size: var(--sbc-font-accent);
  font-family: Arial, sans-serif !important;
  color: #333 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  background-color: #f8f9fa !important;
  padding: 6px 12px !important;
}

/* Total row - complete row with brown background and white text */
.sales-by-country-table .total-metric-row td.row-label.total-row-label {
  background-color: #7A6764 !important;
  color: #fff !important;
  font-size: var(--sbc-font-accent);
}

/* Total row first column - override white pseudo-element background */
.sales-by-country-table .total-metric-row td.row-label.total-row-label::before {
  background-color: #7A6764 !important;
}

.sales-by-country-table .total-metric-row td.total-delta-cell {
  background-color: #7A6764 !important;
  color: #fff !important;
  font-size: var(--sbc-font-base) !important;
}

.sales-by-country-table .total-metric-row td.total-data-cell {
  background-color: #7A6764 !important;
  color: #fff !important;
  font-size: var(--sbc-font-base) !important;
}

/* Delta cells - DESKTOP - same font size as data cells */
.sales-by-country-table .delta-cell {
  background-color: #f8f9fa !important;
  text-align: center !important;
  font-weight: bold !important;
  font-size: var(--sbc-font-base) !important;
  overflow: visible !important;
  white-space: nowrap !important;
  min-width: 70px !important;
  max-width: 70px !important;
  padding: 4px 4px !important;
}

/* Data cells - general overflow protection */
.sales-by-country-table .metric-cell {
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  box-sizing: border-box !important;
  font-size: var(--sbc-font-base) !important;
}

.sales-by-country-table .data-value-cell,
.sales-by-country-table .data-percent-cell {
  overflow: hidden !important;
  white-space: nowrap !important;
  text-overflow: ellipsis !important;
  font-size: var(--sbc-font-base) !important;
}

/* Product header cells */
.sales-by-country-table .product-header-cell {
  text-align: center !important;
  font-weight: bold !important;
}

/* ========================================
   RESPONSIVE BREAKPOINTS
   ======================================== */

/* Desktop - Default (1200px+) */
@media (min-width: 1200px) {
  :root {
    --sbc-font-base: 11px;
    --sbc-font-header: 13px;
    --sbc-font-label: 11px;
    --sbc-font-accent: 11px;
    --sbc-font-corner: 18px;
  }

  .sales-by-country-table {
    min-width: 100%;
  }

  .sales-by-country-table thead th {
    padding: 4px 4px !important;
  }

  .sales-by-country-table td {
    padding: 4px 6px;
  }

  /* Desktop data cell widths */
  .sales-by-country-table .data-value-cell {
    min-width: 90px !important;
    max-width: 90px !important;
    padding: 4px 4px !important;
  }

  .sales-by-country-table .data-percent-cell {
    min-width: 50px !important;
    max-width: 50px !important;
    padding: 4px 4px !important;
  }
}

/* Tablet - Medium screens (768px - 1199px) */
@media (min-width: 768px) and (max-width: 1199px) {
  :root {
    --sbc-font-base: 9px;
    --sbc-font-header: 10px;
    --sbc-font-label: 9px;
    --sbc-font-accent: 9px;
    --sbc-font-corner: 14px;
  }

  .sales-by-country-table {
    min-width: 100%;
  }

  .sales-by-country-table th,
  .sales-by-country-table td {
    padding: 3px 4px;
  }

  /* Tablet data cell widths */
  .sales-by-country-table .data-value-cell {
    min-width: 70px !important;
    max-width: 70px !important;
    padding: 3px 3px !important;
  }

  .sales-by-country-table .data-percent-cell {
    min-width: 45px !important;
    max-width: 45px !important;
    padding: 3px 3px !important;
  }

  /* Tablet delta cell widths */
  .sales-by-country-table .delta-cell {
    min-width: 55px !important;
    max-width: 55px !important;
    padding: 3px 3px !important;
  }
}

/* ========================================
   MOBILE ADJUSTMENTS
   ======================================== */

/* Mobile adjustments - Portrait */
/* Applies to: Portrait mode (width < 768px) */
@media (max-width: 767px) {
  :root {
    --sbc-font-base: 9px;
    --sbc-font-header: 10px;
    --sbc-font-label: 9px;
    --sbc-font-accent: 9px;
    --sbc-font-corner: 12px;
  }

  /* Mobile delta cell widths */
  .sales-by-country-table .delta-cell {
    min-width: 50px !important;
    max-width: 50px !important;
    padding: 3px 2px !important;
  }
}

/* ========================================
   PRINT STYLES
   ======================================== */
@media print {
  :root {
    --sbc-font-base: 10px;
    --sbc-font-header: 11px;
    --sbc-font-label: 10px;
    --sbc-font-accent: 10px;
    --sbc-font-corner: 13px;
  }
  .sales-by-country-table {
    background: #fff;
  }
  .sales-by-country-table th,
  .sales-by-country-table td {
    padding: 4px 6px;
  }
}
`;