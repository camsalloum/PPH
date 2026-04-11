import React, { useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useFilter } from '../../contexts/FilterContext';
import CurrencySymbol from '../dashboard/CurrencySymbol';
import { 
  diagnoseProductMomentum, 
  analyzeBudgetGapRealism,
  analyzeRunRateReality,
  analyzeVolumeRevenueDirection,
  analyzeBudgetGapOwnership,
  analyzeGrowthQuality,
  analyzeProductConcentration,
  analyzePenetrationStrength
} from '../../utils/SalesIntelligenceEngine';

/**
 * ProductGroupKeyFacts - Enhanced with V3 Business Logic + Sales Intelligence Engine
 * 
 * Key Features:
 * - Robust period detection with intelligent budget finding
 * - Materiality scoring using budget share × actual share
 * - Budget-focused analysis (ignores zero-budget items)
 * - Proper currency formatting using company settings
 * - Configurable thresholds for business rules
 * - Name-keyed merge for safer data alignment
 * - Run-rate analysis and YTD tracking
 */

// ====== BUSINESS CONFIGURATION ===============================================
const BUDGET_SHARE_MIN = 0.05;     // minimum budget share to include in "high-budget" focus (5%)
const CUM_BUDGET_TARGET = 0.70;    // ensure coverage of at least 70% of budget cumulatively
const MAX_FOCUS_ITEMS = 8;         // cap number of focused high-budget items
const MAX_LIST_ITEMS = 5;          // cap for critical and strong lists

const UNDERPERF_VOL_PCT = -15;     // volume vs budget % threshold for underperformance
const UNDERPERF_AMT_PCT = -15;     // sales vs budget % threshold for underperformance
const UNDERPERF_YOY_VOL = -10;     // yoy volume % threshold for underperformance

const GROWTH_VOL_PCT = 10;         // volume vs budget % threshold for growth driver
const GROWTH_AMT_PCT = 10;         // sales vs budget % threshold for growth driver
const GROWTH_YOY_VOL = 15;         // yoy volume % threshold for growth driver

const ASP_DELTA_SHOW = 5;          // show ASP premium/discount when abs(delta%) >= 5
const RUNRATE_WARN = 0.85;         // run-rate warning threshold (85% of FY budget by now)

// ====== UTILITIES ============================================================
const isNil = (v) => v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));

// Calculate totals helper - moved outside component for performance
const calcTotal = (data, index) => {
  if (index === -1) return 0;
  return data.reduce((sum, item) => {
    const value = parseFloat(item.rawValues?.[index] || 0);
    return sum + (isNaN(value) ? 0 : value);
  }, 0);
};

const formatNumber = (num, type = 'default') => {
  if (isNil(num)) return 'N/A';

  if (type === 'mt') {
    const mt = num / 1000;
    if (mt >= 1000) return Math.round(mt).toLocaleString() + ' MT';
    if (mt >= 100) return Math.round(mt) + ' MT';
    return mt.toFixed(1) + ' MT';
  }

  if (type === 'amount') {
    // Currency formatting with proper symbol for millions display
    const millions = num / 1000000;
    if (millions >= 1) {
      return (
        <>
          <CurrencySymbol />
          {millions.toFixed(1)}M
        </>
      );
    }
    const thousands = num / 1000;
    if (thousands >= 1) {
      return (
        <>
          <CurrencySymbol />
          {thousands.toFixed(0)}K
        </>
      );
    }
    return (
      <>
        <CurrencySymbol />
        {Math.round(num).toLocaleString()}
      </>
    );
  }

  if (type === 'asp') {
    // ASP formatting without compact notation to avoid awkward currency/kg combinations
    return (
      <>
        <CurrencySymbol />
        {Math.round(num).toLocaleString()}
      </>
    );
  }

  if (type === 'percentage') {
    const signless = Math.abs(num).toFixed(1);
    return `${signless}%`;
  }

  return Number(num).toFixed(1);
};

const normalize = (s) => (s || '').toString().trim().toLowerCase();

const isYTDCol = (c) => c?.type === 'Actual' && ['ytd','yrtodate','year-to-date'].includes(normalize(c?.month));
const isFYCol = (c) => c?.type === 'Actual' && ['fy','full year','fullyear','full-year','full_year'].includes(normalize(c?.month));
const isBudgetColGeneric = (c) => normalize(c?.type) === 'budget' || normalize(c?.type) === 'fy budget' || normalize(c?.type) === 'full year budget';

const monthToNumber = (m) => {
  if (m == null) return null;
  const x = normalize(m);
  const map = {
    'jan':1,'january':1,
    'feb':2,'february':2,
    'mar':3,'march':3,
    'apr':4,'april':4,
    'may':5,
    'jun':6,'june':6,
    'jul':7,'july':7,
    'aug':8,'august':8,
    'sep':9,'sept':9,'september':9,
    'oct':10,'october':10,
    'nov':11,'november':11,
    'dec':12,'december':12
  };
  if (!isNaN(parseInt(x))) {
    const n = parseInt(x);
    return (n>=1 && n<=12) ? n : null;
  }
  return map[x] ?? null;
};

/** Robust budget locator with intelligent fallbacks */
const findBudgetIndex = (columnOrder, basePeriodIndex) => {
  if (!Array.isArray(columnOrder) || basePeriodIndex == null) return -1;
  const base = columnOrder[basePeriodIndex];
  
  // 1) Strict match: same year & month & type Budget
  const strict = columnOrder.findIndex((c) =>
    normalize(c?.type) === 'budget' &&
    c?.year === base?.year &&
    normalize(c?.month) === normalize(base?.month)
  );
  if (strict !== -1) return strict;

  // 2) FY budget (prefer explicit FY)
  const fyBudget = columnOrder.findIndex((c) =>
    isBudgetColGeneric(c) && (isFYCol(c) || ['fy','fullyear','full year'].includes(normalize(c?.month)))
  );
  if (fyBudget !== -1) return fyBudget;

  // 3) Any budget
  const anyBudget = columnOrder.findIndex((c) => isBudgetColGeneric(c));
  return anyBudget !== -1 ? anyBudget : -1;
};

const safeSumAt = (index, dataArr) => {
  if (index < 0 || !Array.isArray(dataArr)) return 0;
  return dataArr.reduce((s, it) => {
    const v = parseFloat(it?.rawValues?.[index] ?? 0);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
};

const ratioPct = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= 0) return null;
  return ((a - b) / b) * 100;
};

const ProductGroupKeyFacts = ({ kgsData = [], amountData = [], onFindingsCalculated = null }) => {
  const { columnOrder, basePeriodIndex } = useFilter();

  // Memoize findings to prevent infinite re-render loops
  // Dependencies: kgsData, amountData, columnOrder, basePeriodIndex
  const findings = React.useMemo(() => {
    if (!kgsData || !amountData || !columnOrder || basePeriodIndex === null) return null;

    // ====== ROBUST PERIOD DETECTION ==========================================
    const basePeriod = columnOrder[basePeriodIndex];
    const budgetIndex = findBudgetIndex(columnOrder, basePeriodIndex);

    // Detect if this is a Full Year period (FY Actual or FY Estimate)
    const isFYPeriod = isFYCol(basePeriod) || (basePeriod.month && normalize(basePeriod.month) === 'fy');
    
    // Previous year: same month, previous year
    const previousYearIndex = columnOrder.findIndex(col => 
      col.type === 'Actual' && 
      col.year === basePeriod.year - 1 && 
      normalize(col.month) === normalize(basePeriod.month)
    );
    
    // YTD and FY detection with robust matching
    const ytdCurrentIndex = columnOrder.findIndex(col => isYTDCol(col) && col.year === basePeriod.year);
    const ytdPreviousIndex = columnOrder.findIndex(col => isYTDCol(col) && col.year === (basePeriod.year - 1));
    const fyCurrentIndex = columnOrder.findIndex(col => isFYCol(col) && col.year === basePeriod.year);
    const fyPreviousIndex = columnOrder.findIndex(col => isFYCol(col) && col.year === (basePeriod.year - 1));
    const fyBudgetIndex = columnOrder.findIndex(col => 
      isBudgetColGeneric(col) && 
      col.year === basePeriod.year && 
      (isFYCol(col) || normalize(col.month) === 'fy')
    );

    // ====== PORTFOLIO TOTALS ==============================================
    const totalMTActual = safeSumAt(basePeriodIndex, kgsData);
    const totalAmountActual = safeSumAt(basePeriodIndex, amountData);
    const totalMTBudget = budgetIndex >= 0 ? safeSumAt(budgetIndex, kgsData) : 0;
    const totalAmountBudget = budgetIndex >= 0 ? safeSumAt(budgetIndex, amountData) : 0;
    const totalMTPrevious = previousYearIndex >= 0 ? safeSumAt(previousYearIndex, kgsData) : 0;
    const totalAmountPrevious = previousYearIndex >= 0 ? safeSumAt(previousYearIndex, amountData) : 0;
    
    // FY Budget totals for preference calculations
    const totalMTFYBudget = fyBudgetIndex >= 0 ? safeSumAt(fyBudgetIndex, kgsData) : 0;
    const totalAmountFYBudget = fyBudgetIndex >= 0 ? safeSumAt(fyBudgetIndex, amountData) : 0;

    // Calculate monthsRemaining early for use in product analysis
    const monthsRemaining = (() => {
      const monthNum = monthToNumber(basePeriod?.month);
      return monthNum ? Math.max(0, 12 - monthNum) : null;
    })();

    // ====== VARIANCE CALCULATIONS =========================================
    const mtVsBudget = ratioPct(totalMTActual, totalMTBudget);
    const amtVsBudget = ratioPct(totalAmountActual, totalAmountBudget);
    const mtYoY = ratioPct(totalMTActual, totalMTPrevious);
    const amtYoY = ratioPct(totalAmountActual, totalAmountPrevious);

    // ====== RUN-RATE ANALYSIS =============================================
    // Fix #1: Run-rate uses FY Budget when present, else period Budget
    let runRateInfo = null;
    if (ytdCurrentIndex >= 0) {
      const ytdAmount = safeSumAt(ytdCurrentIndex, amountData);
      
      // Prefer FY Budget, fallback to period budget
      const fyAmountBudget = fyBudgetIndex >= 0 ? safeSumAt(fyBudgetIndex, amountData) : 0;
      const denomBudgetAmt = fyAmountBudget > 0 ? fyAmountBudget : totalAmountBudget;
      
      if (denomBudgetAmt > 0) {
        const runRate = ytdAmount / denomBudgetAmt;
        const budgetType = fyAmountBudget > 0 ? 'FY budget' : 'period budget';
        const runRatePct = (runRate * 100).toFixed(1);
        
        // Always show percentage, append warning only when below threshold
        runRateInfo = `Run-rate vs ${budgetType}: ${runRatePct}%`;
        if (runRate < RUNRATE_WARN) {
          runRateInfo += ` - below ${(RUNRATE_WARN * 100).toFixed(0)}% threshold`;
        }
      }
    }

    // ====== NAME-KEYED MERGE FOR PRODUCT ANALYSIS ========================
    const mergedData = [];
    const amountByName = {};
    amountData.forEach(item => {
      amountByName[normalize(item.name)] = item;
    });

    kgsData.forEach(kgItem => {
      const normalizedName = normalize(kgItem.name);
      const amountItem = amountByName[normalizedName];
      if (amountItem) {
        mergedData.push({ kg: kgItem, amount: amountItem });
      }
    });

    // ====== PER-PRODUCT STATISTICS =======================================
    const productAnalysis = mergedData.map(({ kg: kgItem, amount: amountItem }) => {
      // Current period
      const mtActual = parseFloat(kgItem.rawValues?.[basePeriodIndex] || 0);
      const amountActual = parseFloat(amountItem.rawValues?.[basePeriodIndex] || 0);
      
      // Budget
      const mtBudget = budgetIndex >= 0 ? parseFloat(kgItem.rawValues?.[budgetIndex] || 0) : 0;
      const amountBudget = budgetIndex >= 0 ? parseFloat(amountItem.rawValues?.[budgetIndex] || 0) : 0;
      
      // Previous year
      const mtPrevYear = previousYearIndex >= 0 ? parseFloat(kgItem.rawValues?.[previousYearIndex] || 0) : 0;
      const amountPrevYear = previousYearIndex >= 0 ? parseFloat(amountItem.rawValues?.[previousYearIndex] || 0) : 0;
      
      // YTD values
      const mtYTDCurrent = ytdCurrentIndex !== -1 ? parseFloat(kgItem.rawValues?.[ytdCurrentIndex] || 0) : 0;
      const amountYTDCurrent = ytdCurrentIndex !== -1 ? parseFloat(amountItem.rawValues?.[ytdCurrentIndex] || 0) : 0;
      const mtYTDPrevious = ytdPreviousIndex !== -1 ? parseFloat(kgItem.rawValues?.[ytdPreviousIndex] || 0) : 0;
      const amountYTDPrevious = ytdPreviousIndex !== -1 ? parseFloat(amountItem.rawValues?.[ytdPreviousIndex] || 0) : 0;

      // FY values
      const mtFYCurrent = fyCurrentIndex !== -1 ? parseFloat(kgItem.rawValues?.[fyCurrentIndex] || 0) : 0;
      const amountFYCurrent = fyCurrentIndex !== -1 ? parseFloat(amountItem.rawValues?.[fyCurrentIndex] || 0) : 0;
      const mtFYPrevious = fyPreviousIndex !== -1 ? parseFloat(kgItem.rawValues?.[fyPreviousIndex] || 0) : 0;
      const amountFYPrevious = fyPreviousIndex !== -1 ? parseFloat(amountItem.rawValues?.[fyPreviousIndex] || 0) : 0;
      const mtFYBudget = fyBudgetIndex !== -1 ? parseFloat(kgItem.rawValues?.[fyBudgetIndex] || 0) : 0;
      const amountFYBudget = fyBudgetIndex !== -1 ? parseFloat(amountItem.rawValues?.[fyBudgetIndex] || 0) : 0;

      // ====== MATERIALITY SCORING =======================================
      // V3's sophisticated materiality: budget share × actual share
      // Fix #3: Budget share = max(AmountShare, VolumeShare) to respect MT-only budgets
      // Fix: Prefer FY Budget totals when available as denominators
      const totalAmtBudSafe = totalAmountFYBudget > 0 ? totalAmountFYBudget : totalAmountBudget;
      const totalMtBudSafe = totalMTFYBudget > 0 ? totalMTFYBudget : totalMTBudget;
      // Use FY-first numerators for budget share calculation
      const amountNumerator = amountFYBudget || amountBudget;
      const mtNumerator = mtFYBudget || mtBudget;
      const amountBudgetShare = totalAmtBudSafe > 0 ? amountNumerator / totalAmtBudSafe : 0;
      const mtBudgetShare = totalMtBudSafe > 0 ? mtNumerator / totalMtBudSafe : 0;
      const budgetShare = Math.max(amountBudgetShare, mtBudgetShare);
      
      const amountActualShare = totalAmountActual > 0 ? amountActual / totalAmountActual : 0;
      const mtActualShare = totalMTActual > 0 ? mtActual / totalMTActual : 0;
      const actualShare = Math.max(amountActualShare, mtActualShare);
      const materialityScore = budgetShare * actualShare;
      
      // Legacy compatibility
      const budgetWeight = totalMTBudget > 0 ? (mtBudget / totalMTBudget) * 100 : 0;
      const actualContribution = totalMTActual > 0 ? (mtActual / totalMTActual) * 100 : 0;
      const strategicScore = budgetWeight * 0.6 + actualContribution * 0.4;

      // ====== VARIANCE CALCULATIONS =====================================
      const mtVariance = ratioPct(mtActual, mtBudget);
      const amountVariance = ratioPct(amountActual, amountBudget);
      const mtYoY = ratioPct(mtActual, mtPrevYear);
      const amountYoY = ratioPct(amountActual, amountPrevYear);

      // YTD YoY
      const mtYTDGrowth = mtYTDPrevious > 0 ? ((mtYTDCurrent - mtYTDPrevious) / mtYTDPrevious) * 100 : null;
      const amountYTDGrowth = amountYTDPrevious > 0 ? ((amountYTDCurrent - amountYTDPrevious) / amountYTDPrevious) * 100 : null;

      // FY comparison
      const mtFYGrowth = mtFYPrevious > 0 ? ((mtFYCurrent - mtFYPrevious) / mtFYPrevious) * 100 : null;
      const amountFYGrowth = amountFYPrevious > 0 ? ((amountFYCurrent - amountFYPrevious) / amountFYPrevious) * 100 : null;
      const mtFYBudgetVar = mtFYBudget > 0 ? ((mtFYCurrent - mtFYBudget) / mtFYBudget) * 100 : null;
      const amountFYBudgetVar = amountFYBudget > 0 ? ((amountFYCurrent - amountFYBudget) / amountFYBudget) * 100 : null;

      // ====== ASP ANALYSIS ==============================================
      const currentASP = mtActual > 0 ? amountActual / mtActual : 0;
      const budgetASP = mtBudget > 0 ? amountBudget / mtBudget : 0;
      const prevYearASP = mtPrevYear > 0 ? amountPrevYear / mtPrevYear : 0;
      const aspVsBudgetPct = ratioPct(currentASP, budgetASP);
      const aspYoYPct = ratioPct(currentASP, prevYearASP);

      // ====== STRATEGIC CATEGORIZATION ================================
      // Budget-focused analysis (ignore zero-budget items)
      const isHighBudget = budgetShare >= BUDGET_SHARE_MIN;
      
      // Critical Underperformers
      const isCritical = isHighBudget && (
        (mtVariance !== null && mtVariance <= UNDERPERF_VOL_PCT) ||
        (amountVariance !== null && amountVariance <= UNDERPERF_AMT_PCT) ||
        (mtYoY !== null && mtYoY <= UNDERPERF_YOY_VOL)
      );

      // Growth Drivers
      const isGrowthDriver = isHighBudget && (
        (mtVariance !== null && mtVariance >= GROWTH_VOL_PCT) ||
        (amountVariance !== null && amountVariance >= GROWTH_AMT_PCT) ||
        (mtYoY !== null && mtYoY >= GROWTH_YOY_VOL)
      );

      // ====== PRODUCT CATCH-UP CALCULATIONS ============================
      const productRemainingMt = (() => {
        const fyBudgetMt = mtFYBudget || mtBudget;
        const currentMt = mtYTDCurrent || mtActual;
        return Math.max(0, (fyBudgetMt || 0) - (currentMt || 0));
      })();
      
      const productRemainingAmt = (() => {
        const fyBudgetAmt = amountFYBudget || amountBudget;
        const currentAmt = amountYTDCurrent || amountActual;
        return Math.max(0, (fyBudgetAmt || 0) - (currentAmt || 0));
      })();
      
      const productPerMonthMt = (() => {
        return (monthsRemaining && monthsRemaining > 0) ? (productRemainingMt / monthsRemaining) : (monthsRemaining === 0 ? 0 : null);
      })();
      
      const productPerMonthAmt = (() => {
        return (monthsRemaining && monthsRemaining > 0) ? (productRemainingAmt / monthsRemaining) : (monthsRemaining === 0 ? 0 : null);
      })();

      return {
        name: kgItem.name,
        mtActual, amountActual, mtBudget, amountBudget,
        mtPrevYear, amountPrevYear,
        mtYTDCurrent, amountYTDCurrent, mtYTDPrevious, amountYTDPrevious,
        mtFYCurrent, amountFYCurrent, mtFYPrevious, amountFYPrevious,
        mtFYBudget, amountFYBudget,
        budgetShare, actualShare, materialityScore,
        strategicScore, budgetWeight, actualContribution,
        mtVariance, amountVariance, mtYoY, amountYoY,
        mtYTDGrowth, amountYTDGrowth, mtFYGrowth, amountFYGrowth,
        mtFYBudgetVar, amountFYBudgetVar,
        currentASP, budgetASP, prevYearASP, aspVsBudgetPct, aspYoYPct,
        isHighBudget, isCritical, isGrowthDriver,
        productRemainingMt, productRemainingAmt, productPerMonthMt, productPerMonthAmt
      };
    }).filter(Boolean);

    // ====== HIGH-BUDGET FOCUS SELECTION ================================
    // Sort by budget share and ensure cumulative coverage
    // Fix: Use FY budget targets for selection to treat MT-only items fairly
    const sortedByBudget = productAnalysis
      .filter(p => (p.amountFYBudget || p.amountBudget) > 0 || (p.mtFYBudget || p.mtBudget) > 0)
      .sort((a, b) => b.budgetShare - a.budgetShare);

    let cumulativeBudgetShare = 0;
    const highBudgetProducts = [];
    
    for (const product of sortedByBudget) {
      if (highBudgetProducts.length >= MAX_FOCUS_ITEMS) break;
      if (cumulativeBudgetShare >= CUM_BUDGET_TARGET && product.budgetShare < BUDGET_SHARE_MIN) break;
      
      highBudgetProducts.push(product);
      cumulativeBudgetShare += product.budgetShare;
    }

    // Sort by materiality score after coverage rule to emphasize current impact
    highBudgetProducts.sort((a, b) => b.materialityScore - a.materialityScore);

    // ====== CATEGORIZE BY PERFORMANCE =================================
    const criticalUnderperformers = highBudgetProducts
      .filter(p => p.isCritical)
      .sort((a, b) => b.materialityScore - a.materialityScore)
      .slice(0, MAX_LIST_ITEMS);

    const growthDrivers = highBudgetProducts
      .filter(p => p.isGrowthDriver)
      .sort((a, b) => b.materialityScore - a.materialityScore)
      .slice(0, MAX_LIST_ITEMS);

    // ====== ASP PREMIUM/DISCOUNT ANALYSIS ============================
    const aspConcerns = highBudgetProducts.filter(p => {
      return p.aspYoYPct !== null && Math.abs(p.aspYoYPct) >= ASP_DELTA_SHOW;
    }).sort((a, b) => b.materialityScore - a.materialityScore).slice(0, MAX_LIST_ITEMS);

    // Legacy compatibility - map to old structure
    const criticalIssues = criticalUnderperformers;
    const pricingConcerns = aspConcerns;

    // ====== INTELLIGENT PERIOD-AWARE ANALYSIS =============================
    // Read what periods are actually being compared to generate contextual narrative
    const periodContext = {
      base: basePeriod ? `${basePeriod.month || ''} ${basePeriod.year} ${basePeriod.type}`.trim() : 'Current Period',
      budget: budgetIndex >= 0 && columnOrder[budgetIndex] ? 
        `${columnOrder[budgetIndex].month || ''} ${columnOrder[budgetIndex].year} ${columnOrder[budgetIndex].type}`.trim() : null,
      previous: previousYearIndex >= 0 && columnOrder[previousYearIndex] ? 
        `${columnOrder[previousYearIndex].month || ''} ${columnOrder[previousYearIndex].year} ${columnOrder[previousYearIndex].type}`.trim() : null,
      ytdCurrent: ytdCurrentIndex >= 0 && columnOrder[ytdCurrentIndex] ? 
        `YTD ${columnOrder[ytdCurrentIndex].year}` : null,
      ytdPrevious: ytdPreviousIndex >= 0 && columnOrder[ytdPreviousIndex] ? 
        `YTD ${columnOrder[ytdPreviousIndex].year}` : null,
      fyCurrent: fyCurrentIndex >= 0 && columnOrder[fyCurrentIndex] ? 
        `FY ${columnOrder[fyCurrentIndex].year}` : null,
      fyPrevious: fyPreviousIndex >= 0 && columnOrder[fyPreviousIndex] ? 
        `FY ${columnOrder[fyPreviousIndex].year}` : null,
      fyBudget: fyBudgetIndex >= 0 && columnOrder[fyBudgetIndex] ? 
        `FY ${columnOrder[fyBudgetIndex].year} Budget` : null
    };

    // Build intelligent narrative based on available comparisons
    let executiveSummary = '';
    const insights = [];
    
    // Describe the period being analyzed
    const periodIntro = `Analyzing ${periodContext.base}`;
    
    // Budget comparison (if available)
    if (periodContext.budget && (mtVsBudget !== null || amtVsBudget !== null)) {
      const perfParts = [];
      if (mtVsBudget !== null) {
        const volStatus = mtVsBudget >= 0 ? 'ahead of' : 'behind';
        perfParts.push(`volume ${volStatus} ${periodContext.budget} by ${formatNumber(Math.abs(mtVsBudget), 'percentage')}`);
      }
      if (amtVsBudget !== null) {
        const salesStatus = amtVsBudget >= 0 ? 'exceeding' : 'below';
        perfParts.push(`sales ${salesStatus} target by ${formatNumber(Math.abs(amtVsBudget), 'percentage')}`);
      }
      insights.push(`vs ${periodContext.budget}: ${perfParts.join(', ')}`);
    }
    
    // Year-over-year comparison (if available)
    if (periodContext.previous && (mtYoY !== null || amtYoY !== null)) {
      const yoyParts = [];
      if (mtYoY !== null) {
        const trendWord = mtYoY >= 0 ? 'growth' : 'decline';
        yoyParts.push(`volume ${trendWord} of ${formatNumber(Math.abs(mtYoY), 'percentage')}`);
      }
      if (amtYoY !== null) {
        const trendWord = amtYoY >= 0 ? 'increase' : 'decrease';
        yoyParts.push(`sales ${trendWord} of ${formatNumber(Math.abs(amtYoY), 'percentage')}`);
      }
      insights.push(`vs ${periodContext.previous}: ${yoyParts.join(', ')}`);
    }
    
    // YTD progress (if available)
    if (periodContext.ytdCurrent && ytdCurrentIndex !== -1) {
      const ytdMT = calcTotal(kgsData, ytdCurrentIndex);
      const ytdAmount = calcTotal(amountData, ytdCurrentIndex);
      const ytdParts = [`${formatNumber(ytdMT, 'mt')} volume, ${formatNumber(ytdAmount, 'amount')} sales`];
      
      if (periodContext.ytdPrevious && ytdPreviousIndex !== -1) {
        const ytdMTPrev = calcTotal(kgsData, ytdPreviousIndex);
        const ytdMTGrowth = ratioPct(ytdMT, ytdMTPrev);
        if (ytdMTGrowth !== null) {
          ytdParts.push(`${ytdMTGrowth >= 0 ? '+' : ''}${formatNumber(ytdMTGrowth, 'percentage')} vs ${periodContext.ytdPrevious}`);
        }
      }
      
      insights.push(`${periodContext.ytdCurrent}: ${ytdParts.join(', ')}`);
    }
    
    // FY comparison (if available)
    if (periodContext.fyCurrent && fyCurrentIndex !== -1) {
      const fyMT = calcTotal(kgsData, fyCurrentIndex);
      const fyAmount = calcTotal(amountData, fyCurrentIndex);
      const fyParts = [];
      
      if (periodContext.fyPrevious && fyPreviousIndex !== -1) {
        const fyMTPrev = calcTotal(kgsData, fyPreviousIndex);
        const fyMTGrowth = ratioPct(fyMT, fyMTPrev);
        if (fyMTGrowth !== null) {
          fyParts.push(`${fyMTGrowth >= 0 ? '+' : ''}${formatNumber(Math.abs(fyMTGrowth), 'percentage')} vs ${periodContext.fyPrevious}`);
        }
      }
      
      if (periodContext.fyBudget && fyBudgetIndex !== -1) {
        const fyMTBudget = calcTotal(kgsData, fyBudgetIndex);
        const fyMTVar = ratioPct(fyMT, fyMTBudget);
        if (fyMTVar !== null) {
          fyParts.push(`${fyMTVar >= 0 ? '+' : ''}${formatNumber(Math.abs(fyMTVar), 'percentage')} vs ${periodContext.fyBudget}`);
        }
      }
      
      if (fyParts.length > 0) {
        insights.push(`${periodContext.fyCurrent}: ${fyParts.join(', ')}`);
      }
    }
    
    // Run-rate warning (if applicable)
    if (runRateInfo) {
      insights.push(runRateInfo);
    }
    
    // Assemble executive summary
    if (insights.length > 0) {
      executiveSummary = `${periodIntro}: ${insights.join('; ')}.`;
    } else {
      executiveSummary = `${periodIntro}. ${formatNumber(totalMTActual, 'mt')} volume, ${formatNumber(totalAmountActual, 'amount')} sales.`;
    }
    
    // Add product performance highlights
    const highlights = [];
    if (criticalUnderperformers.length > 0) {
      highlights.push(`${criticalUnderperformers.length} high-budget product${criticalUnderperformers.length > 1 ? 's' : ''} underperforming`);
    }
    if (growthDrivers.length > 0) {
      highlights.push(`${growthDrivers.length} product${growthDrivers.length > 1 ? 's' : ''} driving growth`);
    }
    if (highlights.length > 0) {
      executiveSummary += ` Key findings: ${highlights.join(', ')}.`;
    }

    return {
      basePeriod,
      isFYPeriod, // Flag to indicate if this is a Full Year period
      // Portfolio metrics
      totalMTActual,
      totalAmountActual,
      totalMTBudget,
      totalAmountBudget,
      totalMTPrevious,
      totalAmountPrevious,
      mtVsBudget,
      amtVsBudget,
      mtYoY,
      amtYoY,
      runRateInfo,

      // Analysis results
      executiveSummary: executiveSummary.trim() || 'Analysis complete.',
      highBudgetProducts,
      criticalUnderperformers,
      growthDrivers,
      aspConcerns,

      // Legacy compatibility
      criticalIssues: criticalUnderperformers,
      pricingConcerns: aspConcerns,
      productAnalysis,

      // Period availability flags
      hasBudget: budgetIndex !== -1,
      hasPrevYear: previousYearIndex !== -1,
      hasYTD: ytdCurrentIndex !== -1 && ytdPreviousIndex !== -1,
      hasYTDCurrent: ytdCurrentIndex !== -1,
      hasFY: fyCurrentIndex !== -1,
      hasFYComparison: fyCurrentIndex !== -1 && (fyPreviousIndex !== -1 || fyBudgetIndex !== -1),
      
      // YTD totals
      totalMTYTDCurrent: ytdCurrentIndex !== -1 ? calcTotal(kgsData, ytdCurrentIndex) : 0,
      totalAmountYTDCurrent: ytdCurrentIndex !== -1 ? calcTotal(amountData, ytdCurrentIndex) : 0,
      totalMTYTDPrevious: ytdPreviousIndex !== -1 ? calcTotal(kgsData, ytdPreviousIndex) : 0,
      totalAmountYTDPrevious: ytdPreviousIndex !== -1 ? calcTotal(amountData, ytdPreviousIndex) : 0,
      // FY totals
      totalMTFYCurrent: fyCurrentIndex !== -1 ? calcTotal(kgsData, fyCurrentIndex) : 0,
      totalAmountFYCurrent: fyCurrentIndex !== -1 ? calcTotal(amountData, fyCurrentIndex) : 0,
      totalMTFYPrevious: fyPreviousIndex !== -1 ? calcTotal(kgsData, fyPreviousIndex) : 0,
      totalAmountFYPrevious: fyPreviousIndex !== -1 ? calcTotal(amountData, fyPreviousIndex) : 0,
      totalMTFYBudget: fyBudgetIndex !== -1 ? calcTotal(kgsData, fyBudgetIndex) : 0,
      totalAmountFYBudget: fyBudgetIndex !== -1 ? calcTotal(amountData, fyBudgetIndex) : 0,
      
      // ====== BUDGET CATCH-UP CALCULATIONS ================================
      // Use pre-calculated monthsRemaining
      monthsRemaining,
      
      portfolioRemainingMt: (() => {
        const fyBudgetMt = fyBudgetIndex !== -1 ? calcTotal(kgsData, fyBudgetIndex) : totalMTBudget;
        const currentMt = ytdCurrentIndex !== -1 ? calcTotal(kgsData, ytdCurrentIndex) : totalMTActual;
        return Math.max(0, (fyBudgetMt || 0) - (currentMt || 0));
      })(),
      
      portfolioRemainingAmt: (() => {
        const fyBudgetAmt = fyBudgetIndex !== -1 ? calcTotal(amountData, fyBudgetIndex) : totalAmountBudget;
        const currentAmt = ytdCurrentIndex !== -1 ? calcTotal(amountData, ytdCurrentIndex) : totalAmountActual;
        return Math.max(0, (fyBudgetAmt || 0) - (currentAmt || 0));
      })(),
      
      // Portfolio per-month calculations - reuse portfolioRemainingMt/Amt calculated above
      portfolioPerMonthMt: (() => {
        const fyBudgetMt = fyBudgetIndex !== -1 ? calcTotal(kgsData, fyBudgetIndex) : totalMTBudget;
        const currentMt = ytdCurrentIndex !== -1 ? calcTotal(kgsData, ytdCurrentIndex) : totalMTActual;
        const remaining = Math.max(0, (fyBudgetMt || 0) - (currentMt || 0));
        return (monthsRemaining && monthsRemaining > 0) ? (remaining / monthsRemaining) : (monthsRemaining === 0 ? 0 : null);
      })(),
      
      portfolioPerMonthAmt: (() => {
        const fyBudgetAmt = fyBudgetIndex !== -1 ? calcTotal(amountData, fyBudgetIndex) : totalAmountBudget;
        const currentAmt = ytdCurrentIndex !== -1 ? calcTotal(amountData, ytdCurrentIndex) : totalAmountActual;
        const remaining = Math.max(0, (fyBudgetAmt || 0) - (currentAmt || 0));
        return (monthsRemaining && monthsRemaining > 0) ? (remaining / monthsRemaining) : (monthsRemaining === 0 ? 0 : null);
      })(),

      // ====== SALES INTELLIGENCE ENGINE ===================================
      // Product Momentum Diagnosis for all products
      productMomentumAnalysis: productAnalysis.map(p => ({
        ...p,
        momentum: diagnoseProductMomentum(p, {
          totalMTActual, totalAmountActual, totalMTBudget, totalAmountBudget
        }, productAnalysis)
      })),

      // Budget Gap Realism Analysis
      budgetGapAnalysis: analyzeBudgetGapRealism(productAnalysis, {
        totalMTBudget, totalMTActual,
        totalMTYTDCurrent: ytdCurrentIndex !== -1 ? calcTotal(kgsData, ytdCurrentIndex) : totalMTActual,
        totalMTFYBudget: fyBudgetIndex !== -1 ? calcTotal(kgsData, fyBudgetIndex) : totalMTBudget
      }, monthsRemaining),

      // Run Rate Reality Check
      runRateReality: analyzeRunRateReality(runRateInfo, monthsRemaining, {
        totalMTActual, totalMTBudget,
        totalMTYTDCurrent: ytdCurrentIndex !== -1 ? calcTotal(kgsData, ytdCurrentIndex) : totalMTActual,
        totalMTFYBudget: fyBudgetIndex !== -1 ? calcTotal(kgsData, fyBudgetIndex) : totalMTBudget
      }),

      // Volume vs Revenue Direction Analysis
      volumeRevenueAnalysis: analyzeVolumeRevenueDirection(
        { mtYoY, mtVsBudget },
        { amtYoY: amtYoY, amtVsBudget }
      ),

      // Budget Gap Ownership Analysis - which products can close the gap
      budgetGapOwnership: analyzeBudgetGapOwnership(productAnalysis, {
        totalMTBudget, totalMTActual,
        totalMTYTDCurrent: ytdCurrentIndex !== -1 ? calcTotal(kgsData, ytdCurrentIndex) : totalMTActual,
        totalMTFYBudget: fyBudgetIndex !== -1 ? calcTotal(kgsData, fyBudgetIndex) : totalMTBudget
      }, monthsRemaining),

      // Product Growth Quality Analysis - broad-based vs concentrated
      productGrowthQuality: productAnalysis.map(p => ({
        name: p.name,
        growthQuality: analyzeGrowthQuality(p, [], { totalMTActual, totalMTBudget })
      })),

      // Product Concentration Analysis - product-level customer dependency
      productConcentrations: productAnalysis.map(p => ({
        name: p.name,
        concentration: analyzeProductConcentration(p, [])
      }))
    };
  }, [kgsData, amountData, columnOrder, basePeriodIndex]); // Memoize to prevent infinite loops

  // Pass findings to parent component if callback provided
  // Use a ref to track if we've already notified with these findings
  const lastFindingsRef = React.useRef(null);
  React.useEffect(() => {
    if (findings && onFindingsCalculated) {
      // Only call if findings actually changed (deep comparison would be expensive, so we trust useMemo)
      if (lastFindingsRef.current !== findings) {
        lastFindingsRef.current = findings;
        onFindingsCalculated(findings);
      }
    }
  }, [findings, onFindingsCalculated]);

  if (!findings) {
    const isLoading = kgsData?.length > 0 || amountData?.length > 0;
    return (
      <div style={styles.container}>
        <div style={styles.noData}>
          {isLoading ? 'Loading product data...' : 'No data available. Please ensure data is loaded and a period is selected.'}
        </div>
      </div>
    );
  }

  const mtBudgetVar = findings.totalMTBudget > 0 ? 
    ((findings.totalMTActual - findings.totalMTBudget) / findings.totalMTBudget) * 100 : null;
  const amountBudgetVar = findings.totalAmountBudget > 0 ? 
    ((findings.totalAmountActual - findings.totalAmountBudget) / findings.totalAmountBudget) * 100 : null;

  const ytdMTGrowth = findings.totalMTYTDPrevious > 0 ?
    ((findings.totalMTYTDCurrent - findings.totalMTYTDPrevious) / findings.totalMTYTDPrevious) * 100 : null;
  const ytdAmountGrowth = findings.totalAmountYTDPrevious > 0 ?
    ((findings.totalAmountYTDCurrent - findings.totalAmountYTDPrevious) / findings.totalAmountYTDPrevious) * 100 : null;

  const fyMTGrowth = findings.totalMTFYPrevious > 0 ?
    ((findings.totalMTFYCurrent - findings.totalMTFYPrevious) / findings.totalMTFYPrevious) * 100 : null;
  const fyAmountGrowth = findings.totalAmountFYPrevious > 0 ?
    ((findings.totalAmountFYCurrent - findings.totalAmountFYPrevious) / findings.totalAmountFYPrevious) * 100 : null;

  // FY Budget comparison: Use Period Actual vs FY Budget (since YTD data is not available)
  const fyMTBudgetVar = findings.totalMTFYBudget > 0 && findings.totalMTActual > 0 ?
    ((findings.totalMTActual - findings.totalMTFYBudget) / findings.totalMTFYBudget) * 100 : null;
  const fyAmountBudgetVar = findings.totalAmountFYBudget > 0 && findings.totalAmountActual > 0 ?
    ((findings.totalAmountActual - findings.totalAmountFYBudget) / findings.totalAmountFYBudget) * 100 : null;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Product Groups Strategic Analysis</h3>
      
      {/* Executive Summary - Streamlined, non-repetitive */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>📊 Executive Summary</h4>
        
        {/* Main Performance Snapshot - One clear statement */}
        <div style={styles.insight}>
          <strong>Performance Snapshot:</strong> Achieved {formatNumber(findings.totalMTActual, 'mt')} volume and {formatNumber(findings.totalAmountActual, 'amount')} in sales
          {findings.hasBudget && mtBudgetVar !== null && (
            <> — {mtBudgetVar >= 0 ? 'exceeding' : 'trailing'} budget by {formatNumber(Math.abs(mtBudgetVar), 'percentage')} (volume) and {formatNumber(Math.abs(amountBudgetVar), 'percentage')} (sales)</>
          )}
          {findings.mtYoY !== null && (
            <>, with {findings.mtYoY >= 0 ? '+' : ''}{formatNumber(findings.mtYoY, 'percentage')} YoY growth</>
          )}.
        </div>

        {/* Key Highlights - Just counts, details are in sections below */}
        {(findings.criticalUnderperformers.length > 0 || findings.growthDrivers.length > 0) && (
          <div style={styles.insight}>
            <strong>Portfolio Summary:</strong>
            {findings.criticalUnderperformers.length > 0 && (
              <> ⚠️ {findings.criticalUnderperformers.length} product{findings.criticalUnderperformers.length > 1 ? 's' : ''} underperforming vs budget (see details below).</>
            )}
            {findings.growthDrivers.length > 0 && (
              <> 🚀 {findings.growthDrivers.length} product{findings.growthDrivers.length > 1 ? 's' : ''} driving strong growth.</>
            )}
            {findings.aspConcerns.length > 0 && (
              <> 💰 {findings.aspConcerns.length} product{findings.aspConcerns.length > 1 ? 's' : ''} with notable pricing changes.</>
            )}
          </div>
        )}
      </div>



      {/* Critical Issues */}
      {findings.criticalUnderperformers.length > 0 && (
        <div style={styles.section}>
          <h4 style={{...styles.sectionTitle, color: '#dc2626'}}>⚠️ High-Priority Underperformers</h4>
          {findings.criticalUnderperformers.map((product, idx) => (
            <div key={idx} style={styles.productCard}>
              <div style={styles.productName}>{product.name}</div>
              <div style={styles.productDetails}>
                <div style={styles.detailRow}>
                  <strong>Strategic Weight:</strong> {(product.budgetShare * 100).toFixed(1)}% of total budget ({formatNumber(product.mtFYBudget || product.mtBudget, 'mt')} / {formatNumber(product.amountFYBudget || product.amountBudget, 'amount')})
                </div>
                
                {product.mtVariance !== null && Math.abs(product.mtVariance) > 5 && (
                  <div style={styles.detailRow}>
                    <strong>Period Gap:</strong> Volume {formatNumber(Math.abs(product.mtVariance), 'percentage')} {product.mtVariance < 0 ? 'below' : 'above'} plan ({formatNumber(product.mtActual, 'mt')} vs {formatNumber(product.mtBudget, 'mt')}), revenue impact {formatNumber(Math.abs(product.amountVariance), 'percentage')} {product.amountVariance < 0 ? 'short' : 'over'} at {formatNumber(product.amountActual, 'amount')}
                  </div>
                )}

                {product.mtYoY !== null && (
                  <div style={styles.detailRow}>
                    <strong>YoY Trend:</strong> {formatNumber(Math.abs(product.mtYoY), 'percentage')} {product.mtYoY < 0 ? 'volume decline' : 'volume growth'} from {formatNumber(product.mtPrevYear, 'mt')} to {formatNumber(product.mtActual, 'mt')}, sales {product.amountYoY >= 0 ? 'up' : 'down'} {formatNumber(Math.abs(product.amountYoY), 'percentage')}
                  </div>
                )}

                {product.mtYTDGrowth !== null && findings.hasYTD && (
                  <div style={styles.detailRow}>
                    <strong>YTD Performance:</strong> {formatNumber(product.mtYTDCurrent, 'mt')} ({formatNumber(Math.abs(product.mtYTDGrowth), 'percentage')} {product.mtYTDGrowth >= 0 ? 'ahead' : 'behind'} prior year's {formatNumber(product.mtYTDPrevious, 'mt')})
                  </div>
                )}

                {product.mtFYBudgetVar !== null && findings.hasFY && Math.abs(product.mtFYBudgetVar) > 5 && (
                  <div style={styles.detailRow}>
                    <strong>FY Outlook:</strong> Full year tracking at {formatNumber(product.mtFYCurrent, 'mt')} / {formatNumber(product.amountFYCurrent, 'amount')}, {formatNumber(Math.abs(product.mtFYBudgetVar), 'percentage')} {product.mtFYBudgetVar < 0 ? 'below' : 'above'} FY target
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Growth Drivers */}
      {findings.growthDrivers.length > 0 && (
        <div style={styles.section}>
          <h4 style={{...styles.sectionTitle, color: '#059669'}}>🚀 Growth Drivers</h4>
          {findings.growthDrivers.map((product, idx) => (
            <div key={idx} style={{...styles.productCard, borderLeft: '4px solid #059669'}}>
              <div style={styles.productName}>{product.name}</div>
              <div style={styles.productDetails}>
                <div style={styles.detailRow}>
                  <strong>Strong Execution:</strong> Delivered {formatNumber(product.mtActual, 'mt')} / {formatNumber(product.amountActual, 'amount')} ({product.actualContribution.toFixed(1)}% of total volume)
                </div>
                
                {product.mtVariance !== null && product.mtVariance > 10 && (
                  <div style={styles.detailRow}>
                    <strong>Exceeded Budget:</strong> Volume {formatNumber(product.mtVariance, 'percentage')} above plan, revenue outperformance of {formatNumber(product.amountVariance, 'percentage')}
                  </div>
                )}

                {product.mtYoY !== null && product.mtYoY > 15 && (
                  <div style={styles.detailRow}>
                    <strong>Momentum:</strong> {formatNumber(product.mtYoY, 'percentage')} volume expansion YoY (from {formatNumber(product.mtPrevYear, 'mt')} to {formatNumber(product.mtActual, 'mt')}), sales growth of {formatNumber(product.amountYoY, 'percentage')}
                  </div>
                )}

                {product.mtFYGrowth !== null && findings.hasFY && product.mtFYGrowth > 10 && (
                  <div style={styles.detailRow}>
                    <strong>FY Achievement:</strong> Full year performance at {formatNumber(product.mtFYCurrent, 'mt')} represents {formatNumber(product.mtFYGrowth, 'percentage')} growth vs prior FY
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ASP Concerns */}
      {findings.aspConcerns.length > 0 && (
        <div style={styles.section}>
          <h4 style={{...styles.sectionTitle, color: '#d97706'}}>💰 Pricing Analysis</h4>
          {findings.aspConcerns.map((product, idx) => {
            return (
              <div key={idx} style={{...styles.productCard, borderLeft: '4px solid #d97706'}}>
                <div style={styles.productName}>{product.name}</div>
                <div style={styles.productDetails}>
                  {product.aspYoYPct !== null && Math.abs(product.aspYoYPct) >= ASP_DELTA_SHOW && (
                    <div style={styles.detailRow}>
                      <strong>ASP (Average Selling Price) Change YoY:</strong> Current realization at {formatNumber(product.currentASP, 'asp')}/kg vs {formatNumber(product.prevYearASP, 'asp')}/kg prior year ({formatNumber(Math.abs(product.aspYoYPct), 'percentage')} {product.aspYoYPct < 0 ? 'decline' : 'increase'})
                    </div>
                  )}
                  {product.aspVsBudgetPct !== null && Math.abs(product.aspVsBudgetPct) >= ASP_DELTA_SHOW && (
                    <div style={styles.detailRow}>
                      <strong>ASP vs Budget:</strong> {formatNumber(Math.abs(product.aspVsBudgetPct), 'percentage')} {product.aspVsBudgetPct < 0 ? 'below' : 'above'} budgeted ASP of {formatNumber(product.budgetASP, 'asp')}/kg
                    </div>
                  )}
                  <div style={styles.detailRow}>
                    <strong>Revenue Impact:</strong> Volume of {formatNumber(product.mtActual, 'mt')} generating {formatNumber(product.amountActual, 'amount')} with materiality score of {(product.materialityScore * 100).toFixed(1)}%
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conditional Section: Mid-Year Catch-up OR Full-Year Next Year Strategy */}
      {!findings.isFYPeriod && (findings.monthsRemaining !== null || findings.portfolioRemainingMt > 0 || findings.portfolioRemainingAmt > 0) && (
        <div style={styles.section}>
          <h4 style={{...styles.sectionTitle, color: '#7c3aed'}}>🎯 Required Growth to Targets</h4>

          {/* Portfolio Catch-up Plan */}
          <div style={styles.insight}>
            <strong>Portfolio Catch-up Plan</strong>
            {findings.monthsRemaining !== null && findings.monthsRemaining > 0 && (
              <div>
                <strong>Time Remaining:</strong> {findings.monthsRemaining} months to achieve FY budget targets
              </div>
            )}
            {findings.monthsRemaining === 0 && (
              <div>
                <strong>Time Remaining:</strong> No months remaining - gap must be closed within current month (end-loading)
              </div>
            )}
            {findings.portfolioRemainingMt > 0 ? (
              <div>
                <strong>Volume Gap:</strong> Need {formatNumber(findings.portfolioRemainingMt, 'mt')} more to hit FY budget
              </div>
            ) : findings.portfolioRemainingMt < 0 ? (
              <div>
                <strong>Volume Status:</strong> Portfolio is {formatNumber(Math.abs(findings.portfolioRemainingMt), 'mt')} ahead of FY budget target
              </div>
            ) : null}
            
            {findings.portfolioRemainingAmt > 0 ? (
              <div>
                <strong>Sales Gap:</strong> Need {formatNumber(findings.portfolioRemainingAmt, 'amount')} more to hit FY budget
              </div>
            ) : findings.portfolioRemainingAmt < 0 ? (
              <div>
                <strong>Sales Status:</strong> Portfolio is {formatNumber(Math.abs(findings.portfolioRemainingAmt), 'amount')} ahead of FY budget target
              </div>
            ) : null}
            
            {/* Show per-month requirements only when months remaining > 0 */}
            {findings.monthsRemaining > 0 && (findings.portfolioRemainingMt > 0 || findings.portfolioRemainingAmt > 0) && (
              <div>
                <strong>Required Average Per Month:</strong> {formatNumber(findings.portfolioPerMonthMt, 'mt')} / {formatNumber(findings.portfolioPerMonthAmt, 'amount')}
              </div>
            )}
            
            {findings.portfolioRemainingMt <= 0 && findings.portfolioRemainingAmt <= 0 && (
              <div>
                <strong>Status:</strong> Portfolio is on track or ahead of budget targets
              </div>
            )}
          </div>

          {/* Product Level Catch-up */}
          {findings.highBudgetProducts && findings.highBudgetProducts.length > 0 && (
            <div>
              <strong style={{color: '#1e40af', fontSize: '16px'}}>Product Level Catch-up</strong>
              {findings.highBudgetProducts
                .filter(product => 
                  (product.productRemainingMt !== undefined && product.productRemainingMt > 0) || 
                  (product.productRemainingAmt !== undefined && product.productRemainingAmt > 0)
                )
                .length > 0 ? (
                findings.highBudgetProducts
                  .filter(product => 
                    (product.productRemainingMt !== undefined && product.productRemainingMt > 0) || 
                    (product.productRemainingAmt !== undefined && product.productRemainingAmt > 0)
                  )
                  .map((product, idx) => (
                    <div key={idx} style={styles.productCard}>
                      <div style={styles.productName}>{product.name}</div>
                      <div style={styles.productDetails}>
                        {product.productRemainingMt > 0 && (
                          <div style={styles.detailRow}>
                            <strong>Volume Gap:</strong> Need {formatNumber(product.productRemainingMt, 'mt')} more to hit FY budget
                          </div>
                        )}
                        {product.productRemainingAmt > 0 && (
                          <div style={styles.detailRow}>
                            <strong>Sales Gap:</strong> Need {formatNumber(product.productRemainingAmt, 'amount')} more to hit FY budget
                          </div>
                        )}
                        {/* Show per-month requirements only when months remaining > 0 */}
                        {findings.monthsRemaining > 0 && (product.productRemainingMt > 0 || product.productRemainingAmt > 0) && (
                          <div style={styles.detailRow}>
                            <strong>Required Per Month:</strong> {formatNumber(product.productPerMonthMt, 'mt')} / {formatNumber(product.productPerMonthAmt, 'amount')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
              ) : (
                <div style={styles.insight}>
                  All high-budget products are on track or ahead of targets
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Full Year: FY Budget Achievement Analysis */}
      {findings.isFYPeriod && findings.hasBudget && (
        <div style={styles.section}>
          <h4 style={{...styles.sectionTitle, color: '#7c3aed'}}>📊 FY Budget Achievement Analysis</h4>

          {/* Performance Assessment */}
          <div style={styles.insight}>
            <strong>Full Year Performance Summary</strong>
            <div>
              <strong>Volume Achievement:</strong> {formatNumber(findings.totalMTActual, 'mt')} vs budget {formatNumber(findings.totalMTBudget, 'mt')}
              ({mtBudgetVar !== null ? `${formatNumber(Math.abs(mtBudgetVar), 'percentage')} ${mtBudgetVar >= 0 ? 'above' : 'below'} target` : 'N/A'})
            </div>
            <div>
              <strong>Sales Achievement:</strong> {formatNumber(findings.totalAmountActual, 'amount')} vs budget {formatNumber(findings.totalAmountBudget, 'amount')}
              ({amountBudgetVar !== null ? `${formatNumber(Math.abs(amountBudgetVar), 'percentage')} ${amountBudgetVar >= 0 ? 'above' : 'below'} target` : 'N/A'})
            </div>
          </div>

          {/* Product Performance Analysis */}
          {findings.highBudgetProducts && findings.highBudgetProducts.length > 0 && (() => {
            // Categorize products based on budget achievement (using FY budget comparison)
            const wellPerformers = findings.highBudgetProducts.filter(p => {
              const mtAchievement = (p.mtFYBudget || p.mtBudget) > 0
                ? ((p.mtActual || 0) / (p.mtFYBudget || p.mtBudget)) * 100
                : 0;
              return mtAchievement >= 95;
            });

            const underPerformers = findings.highBudgetProducts.filter(p => {
              const mtAchievement = (p.mtFYBudget || p.mtBudget) > 0
                ? ((p.mtActual || 0) / (p.mtFYBudget || p.mtBudget)) * 100
                : 0;
              return mtAchievement < 95 && mtAchievement > 0;
            });

            return (
              <>
                {/* Well-Performing Products */}
                {wellPerformers.length > 0 && (
                  <div>
                    <strong style={{color: '#059669', fontSize: '16px'}}>✓ Budget Achieved ({wellPerformers.length} products)</strong>
                    <div style={styles.insight}>
                      Products that met or exceeded FY budget targets (≥95% achievement).
                    </div>
                    {wellPerformers.slice(0, 5).map((product, idx) => {
                      const achievement = (product.mtFYBudget || product.mtBudget) > 0
                        ? ((product.mtActual || 0) / (product.mtFYBudget || product.mtBudget)) * 100
                        : 0;

                      return (
                        <div key={idx} style={{...styles.productCard, borderLeft: '4px solid #059669'}}>
                          <div style={styles.productName}>{product.name}</div>
                          <div style={styles.productDetails}>
                            <div style={styles.detailRow}>
                              <strong>FY Achievement:</strong> {formatNumber(achievement, 'percentage')} of budget ({formatNumber(product.mtActual, 'mt')} vs {formatNumber(product.mtFYBudget || product.mtBudget, 'mt')})
                            </div>
                            {product.mtYoY !== null && (
                              <div style={styles.detailRow}>
                                <strong>YoY Growth:</strong> {formatNumber(Math.abs(product.mtYoY), 'percentage')} {product.mtYoY >= 0 ? 'increase' : 'decrease'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Underperforming Products */}
                {underPerformers.length > 0 && (
                  <div style={{marginTop: '20px'}}>
                    <strong style={{color: '#dc2626', fontSize: '16px'}}>⚠️ Below Budget ({underPerformers.length} products)</strong>
                    <div style={styles.insight}>
                      Products below 95% of FY budget target - requires analysis for root cause.
                    </div>
                    {underPerformers.slice(0, 5).map((product, idx) => {
                      const achievement = (product.mtFYBudget || product.mtBudget) > 0
                        ? ((product.mtActual || 0) / (product.mtFYBudget || product.mtBudget)) * 100
                        : 0;
                      const gap = ((product.mtFYBudget || product.mtBudget) - (product.mtActual || 0)) / 1000;

                      return (
                        <div key={idx} style={{...styles.productCard, borderLeft: '4px solid #dc2626'}}>
                          <div style={styles.productName}>{product.name}</div>
                          <div style={styles.productDetails}>
                            <div style={styles.detailRow}>
                              <strong>FY Achievement:</strong> {formatNumber(achievement, 'percentage')} of budget ({formatNumber(product.mtActual, 'mt')} vs {formatNumber(product.mtFYBudget || product.mtBudget, 'mt')})
                            </div>
                            <div style={styles.detailRow}>
                              <strong>Volume Shortfall:</strong> {formatNumber(gap, 'mt')} below target
                            </div>
                            {product.mtYoY !== null && (
                              <div style={styles.detailRow}>
                                <strong>YoY Trend:</strong> {formatNumber(Math.abs(product.mtYoY), 'percentage')} {product.mtYoY >= 0 ? 'growth' : 'decline'} - {product.mtYoY < 0 ? 'declining trend compounds budget miss' : 'growth indicates execution gap vs budget'}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Strategic Recommendations - Only for Mid-Year Periods */}
      {!findings.isFYPeriod && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>💡 Strategic Priorities</h4>
          <div style={styles.recommendations}>
            {findings.criticalUnderperformers.length > 0 && (
              <div style={styles.recommendation}>
                Address underperformance in high-budget products representing {(findings.criticalUnderperformers.reduce((sum, p) => sum + p.budgetShare, 0) * 100).toFixed(1)}% of strategic allocation through targeted sales initiatives and market analysis.
              </div>
            )}
            {findings.growthDrivers.length > 0 && (
              <div style={styles.recommendation}>
                Capitalize on momentum in growth products by allocating additional resources and analyzing success factors for replication across portfolio.
              </div>
            )}
            {findings.aspConcerns.length > 0 && (
              <div style={styles.recommendation}>
                Investigate pricing pressure in {findings.aspConcerns.length} material products; implement margin protection strategies or validate competitive positioning.
              </div>
            )}
            {findings.hasYTD && ytdMTGrowth !== null && ytdMTGrowth < -5 && (
              <div style={styles.recommendation}>
                YTD performance trending {formatNumber(Math.abs(ytdMTGrowth), 'percentage')} below prior year requires immediate corrective action to achieve FY targets.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== SALES INTELLIGENCE ENGINE SECTIONS ====== */}
      
      {/* Product Momentum Diagnosis */}
      {findings.productMomentumAnalysis && findings.productMomentumAnalysis.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🎯 Product Momentum Diagnosis</h4>
          
          {/* Momentum Summary */}
          {(() => {
            const accelerators = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'ACCELERATOR');
            const builders = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'BUILDER');
            const stabilizers = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'STABILIZER');
            const atRisk = findings.productMomentumAnalysis.filter(p => p.momentum?.category === 'AT_RISK');
            
            return (
              <>
                <div style={{...styles.insight, background: '#f0fdf4', borderLeft: '3px solid #059669'}}>
                  <strong>Portfolio Momentum Profile:</strong><br/>
                  🚀 <strong>{accelerators.length}</strong> Accelerators (strong growth + above plan) • 
                  📈 <strong>{builders.length}</strong> Builders (growing but below budget) • 
                  ⚖️ <strong>{stabilizers.length}</strong> Stabilizers (steady contributors) • 
                  ⚠️ <strong>{atRisk.length}</strong> At-Risk (require intervention)
                </div>
                
                {/* Show top momentum insights */}
                {[...accelerators.slice(0, 2), ...atRisk.slice(0, 2)].map((product, idx) => (
                  <div key={idx} style={{
                    ...styles.productCard, 
                    borderLeft: `4px solid ${product.momentum?.categoryColor || '#6b7280'}`
                  }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                      <span style={{fontSize: '20px'}}>{product.momentum?.categoryIcon}</span>
                      <span style={styles.productName}>{product.name}</span>
                      <span style={{
                        background: product.momentum?.categoryColor || '#6b7280',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '600'
                      }}>
                        {product.momentum?.category}
                      </span>
                    </div>
                    <div style={styles.detailRow}>
                      <strong>Diagnosis:</strong> {product.momentum?.explanation}
                    </div>
                    <div style={styles.detailRow}>
                      <strong>Sustainability:</strong> {product.momentum?.sustainabilityLabel}
                    </div>
                    {product.momentum?.riskFactors?.length > 0 && (
                      <div style={{...styles.detailRow, background: '#fef2f2'}}>
                        <strong>Risk Factors:</strong> {product.momentum?.riskFactors.join('; ')}
                      </div>
                    )}
                    <div style={{...styles.detailRow, fontStyle: 'italic', color: '#374151'}}>
                      💡 {product.momentum?.salesInsight}
                    </div>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* Budget Gap Realism Analysis */}
      {findings.budgetGapAnalysis && findings.budgetGapAnalysis.gapMT > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>📊 Budget Gap Realism Analysis</h4>
          
          <div style={{
            ...styles.insight, 
            background: findings.budgetGapAnalysis.feasibility === 'REALISTIC' ? '#f0fdf4' : 
                        findings.budgetGapAnalysis.feasibility === 'CHALLENGING' ? '#fef3c7' : '#fef2f2',
            borderLeft: `3px solid ${findings.budgetGapAnalysis.feasibility === 'REALISTIC' ? '#059669' : 
                                    findings.budgetGapAnalysis.feasibility === 'CHALLENGING' ? '#f59e0b' : '#dc2626'}`
          }}>
            <strong>Feasibility Assessment: {findings.budgetGapAnalysis.feasibility}</strong><br/>
            {findings.budgetGapAnalysis.insight}
          </div>
          
          {findings.budgetGapAnalysis.contributors?.length > 0 && (
            <div style={styles.insight}>
              <strong>Products with Gap-Closing Velocity:</strong><br/>
              {findings.budgetGapAnalysis.contributors.slice(0, 3).map((p, idx) => (
                <div key={idx} style={{marginTop: '8px'}}>
                  • <strong>{p.name}</strong>: {p.contributionInsight}
                </div>
              ))}
            </div>
          )}
          
          {findings.budgetGapAnalysis.saturatedProducts?.length > 0 && (
            <div style={{...styles.insight, background: '#f8fafc'}}>
              <strong>Saturated Products (unlikely to contribute more):</strong><br/>
              {findings.budgetGapAnalysis.saturatedProducts.map((p, idx) => (
                <span key={idx}>{idx > 0 ? ', ' : ''}{p.name}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Budget Gap Ownership - Sales Director View */}
      {findings.budgetGapOwnership && findings.budgetGapOwnership.gapMT > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🎯 Budget Gap Ownership (Sales Director View)</h4>
          
          <div style={{
            ...styles.insight,
            background: findings.budgetGapOwnership.status === 'ACHIEVABLE' ? '#f0fdf4' : 
                        findings.budgetGapOwnership.status === 'CHALLENGING' ? '#fef3c7' : '#fef2f2',
            borderLeft: `3px solid ${findings.budgetGapOwnership.status === 'ACHIEVABLE' ? '#059669' : 
                                    findings.budgetGapOwnership.status === 'CHALLENGING' ? '#f59e0b' : '#dc2626'}`
          }}>
            <strong>{findings.budgetGapOwnership.insight}</strong><br/>
            <span style={{fontStyle: 'italic', color: '#374151'}}>{findings.budgetGapOwnership.salesDirectorSummary}</span>
          </div>
          
          {findings.budgetGapOwnership.keyContributors?.length > 0 && (
            <div style={styles.insight}>
              <strong>Key Contributors (realistic momentum to deliver):</strong><br/>
              {findings.budgetGapOwnership.keyContributors.map((p, idx) => (
                <div key={idx} style={{marginTop: '8px', padding: '8px', background: '#f0fdf4', borderRadius: '4px'}}>
                  <strong>{p.name}</strong> — Owns {p.realisticOwnershipPct?.toFixed(0)}% of gap closure ({p.realisticContributionMT?.toFixed(1)} MT)<br/>
                  <span style={{fontSize: '13px', color: '#059669'}}>{p.assessment}</span>
                </div>
              ))}
            </div>
          )}
          
          {findings.budgetGapOwnership.longShots?.length > 0 && (
            <div style={{...styles.insight, background: '#fef3c7'}}>
              <strong>Long Shots (own gap on paper, lack momentum):</strong><br/>
              {findings.budgetGapOwnership.longShots.map((p, idx) => (
                <div key={idx} style={{marginTop: '4px', fontSize: '14px'}}>
                  • {p.name}: {p.theoreticalOwnershipPct?.toFixed(0)}% theoretical → {p.realisticOwnershipPct?.toFixed(0)}% realistic
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Volume vs Revenue Direction */}
      {findings.volumeRevenueAnalysis && findings.volumeRevenueAnalysis.insights?.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>⚖️ Volume vs Revenue Direction</h4>
          
          <div style={{
            ...styles.insight,
            background: findings.volumeRevenueAnalysis.signalType === 'MIX_ENRICHMENT' ? '#f0fdf4' : 
                        findings.volumeRevenueAnalysis.signalType === 'MIX_DILUTION' ? '#fef3c7' : '#eff6ff'
          }}>
            {findings.volumeRevenueAnalysis.insights.map((insight, idx) => (
              <div key={idx} style={{marginBottom: '8px'}}>• {insight}</div>
            ))}
          </div>
          
          {findings.volumeRevenueAnalysis.salesImplication && (
            <div style={styles.detailRow}>
              <strong>Sales Implication:</strong> {findings.volumeRevenueAnalysis.salesImplication}
            </div>
          )}
        </div>
      )}

      {/* Run Rate Reality */}
      {findings.runRateReality && findings.runRateReality.status !== 'YEAR_END' && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>⏱️ Run Rate Reality Check</h4>
          
          <div style={{
            ...styles.insight,
            background: findings.runRateReality.statusColor ? `${findings.runRateReality.statusColor}15` : '#eff6ff',
            borderLeft: `3px solid ${findings.runRateReality.statusColor || '#3b82f6'}`
          }}>
            <strong>Status: {findings.runRateReality.feasibility}</strong><br/>
            {findings.runRateReality.insight}
          </div>
          
          {findings.runRateReality.accelerationRequired !== null && findings.runRateReality.accelerationRequired > 0 && (
            <div style={styles.detailRow}>
              <strong>Current vs Required:</strong> Running at {findings.runRateReality.currentMonthlyMT?.toFixed(1)} MT/month, 
              need {findings.runRateReality.requiredMonthlyMT?.toFixed(1)} MT/month 
              ({findings.runRateReality.accelerationRequired?.toFixed(0)}% acceleration required)
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    borderRadius: '12px',
    padding: '24px',
    margin: '20px 0',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
    border: '1px solid #e2e8f0'
  },
  title: {
    color: '#1e293b',
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '24px',
    textAlign: 'center',
    background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  section: {
    background: 'white',
    borderRadius: '10px',
    padding: '20px',
    marginBottom: '20px',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.05)',
    borderLeft: '4px solid #3b82f6'
  },
  sectionTitle: {
    color: '#1e40af',
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '16px',
    textAlign: 'left'
  },
  insight: {
    padding: '12px 16px',
    background: '#eff6ff',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '15px',
    lineHeight: '1.6',
    color: '#1e40af',
    borderLeft: '3px solid #3b82f6',
    textAlign: 'left'
  },
  productCard: {
    padding: '16px',
    background: '#f8fafc',
    borderRadius: '8px',
    marginBottom: '16px',
    borderLeft: '4px solid #ef4444',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
  },
  productName: {
    fontWeight: '600',
    color: '#1f2937',
    fontSize: '16px',
    marginBottom: '12px',
    textAlign: 'left'
  },
  productDetails: {
    marginLeft: '12px'
  },
  detailRow: {
    color: '#4b5563',
    fontSize: '14px',
    lineHeight: '1.6',
    marginBottom: '8px',
    padding: '8px 12px',
    background: 'white',
    borderRadius: '6px',
    textAlign: 'left'
  },
  recommendations: {
    padding: '16px',
    background: '#f0fdf4',
    borderRadius: '8px',
    border: '1px solid #bbf7d0'
  },
  recommendation: {
    color: '#065f46',
    fontSize: '15px',
    lineHeight: '1.6',
    marginBottom: '12px',
    padding: '12px',
    background: 'white',
    borderRadius: '6px',
    borderLeft: '3px solid #10b981',
    textAlign: 'left'
  },
  noData: {
    textAlign: 'center',
    padding: '40px 20px',
    color: '#6c757d',
    fontStyle: 'italic',
    background: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '8px',
    fontSize: '16px'
  }
};

ProductGroupKeyFacts.propTypes = {
  kgsData: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    rawValues: PropTypes.array
  })),
  amountData: PropTypes.arrayOf(PropTypes.shape({
    name: PropTypes.string,
    rawValues: PropTypes.array
  })),
  onFindingsCalculated: PropTypes.func
};

export default ProductGroupKeyFacts;