import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import CurrencySymbol from '../dashboard/CurrencySymbol';
import ChurnAlertsList from '../common/ChurnAlertsList';
import {
  classifyCustomerArchetype,
  analyzeChurnIntelligence,
  interpretConcentrationRisk,
  analyzeChurnVolumeImpact
} from '../../utils/SalesIntelligenceEngine';

/**
 * CustomerKeyFacts (Pro) — Volume by Customer (IMPROVED) + Sales Intelligence Engine
 * ------------------------------------------------------------------
 * This version fixes bugs and adds deeper analysis:
 *  - ✅ Correctly fetches Amount rows from API (was fetching volume twice)
 *  - ✅ Fixes double-suffix bug in amount string formatter
 *  - ✅ Robust customer name matching (handles merged names with "*")
 *  - ✅ Price–Volume–Mix (PVM) decomposition at portfolio and customer level
 *  - ✅ Materiality×Variance scoring to prioritize actions
 *  - ✅ Sales Intelligence Engine: Customer Archetypes, Churn Intelligence, Concentration Interpretation
 *  - ✅ Outlier detection (z-score) on YoY growth to surface anomalies
 *  - ✅ Clearer KPI labels (e.g., currency/MT for kilo rate)
 *  - ✅ Safer guards for missing/zero denominators
 */

// ============================== CONFIG =======================================
const TOP_SHARE_MIN = 0.05;      // customers must have >=5% share to enter focus unless coverage rule keeps them
const CUM_SHARE_TARGET = 0.80;   // ensure at least 80% of current-period volume covered
const MAX_FOCUS = 10;            // cap number of focused customers
const MAX_LIST = 6;              // cap for lists

const UNDERPERF_VOL_PCT = -15;   // vs budget
const UNDERPERF_YOY_VOL = -10;   // vs prior year
const GROWTH_VOL_PCT = 15;       // vs budget
const GROWTH_YOY_VOL = 20;       // vs prior year

const RUNRATE_WARN = 0.85;       // 85% of FY budget by now

// ============================== UTILS ========================================
const isNil = (v) => v == null || (typeof v === 'number' && Number.isNaN(v));
const normalize = (s) => (s || '').toString().trim().toLowerCase();
const stripMergeMark = (s) => (s || '').replace(/\*+$/,'').trim();
const keyName = (s) => normalize(stripMergeMark(s));

// Safe division helpers to prevent divide-by-zero errors
const safeDiv = (numerator, denominator, defaultValue = 0) => {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return defaultValue;
  if (denominator === 0) return numerator > 0 ? Infinity : defaultValue;
  return numerator / denominator;
};

const safeDivPct = (numerator, denominator, defaultValue = null) => {
  const result = safeDiv(numerator, denominator, null);
  if (result === null || result === Infinity) return defaultValue;
  return result;
};

// Convert to Proper Case (Title Case)
const toProperCase = (s) => {
  if (!s) return '';
  return s
    .toString()
    .trim()
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatCustomerName = (name) => toProperCase(stripMergeMark(name));

const formatPct = (n) => (n == null ? 'N/A' : `${Math.abs(n).toFixed(1)}%`);

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

const formatMt = (kgs) => {
  if (isNil(kgs)) return 'N/A';
  const mt = kgs / 1000;
  if (mt >= 1000) return Math.round(mt).toLocaleString() + ' MT';
  if (mt >= 100) return Math.round(mt) + ' MT';
  return mt.toFixed(1) + ' MT';
};

const formatAmount = (amount) => {
  if (isNil(amount)) return 'N/A';
  if (amount >= 1_000_000) return <><CurrencySymbol />{(amount / 1_000_000).toFixed(1)}M</>;
  if (amount >= 1_000) return <><CurrencySymbol />{(amount / 1_000).toFixed(1)}K</>;
  return <><CurrencySymbol />{amount.toFixed(0)}</>;
};

const formatAED = (value) => {
  if (isNil(value)) return 'N/A';
  if (value === 0) return '0';
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000) return (value / 1_000_000).toFixed(1) + 'M';
  if (absValue >= 1_000) return (value / 1_000).toFixed(1) + 'K';
  return value.toFixed(0);
};

// FIX: do not add extra M/K; delegate to formatAED only
const formatAmountString = (amount) => formatAED(amount);

const isYTDCol = (c) => c?.type === 'Actual' && ['ytd','yrtodate','year-to-date'].includes(normalize(c?.month));
const isFYCol = (c) => c?.type === 'Actual' && ['fy','full year','fullyear','full-year','full_year','year'].includes(normalize(c?.month));
const isBudgetColGeneric = (c) => ['budget','fy budget','full year budget'].includes(normalize(c?.type));

const monthToNumber = (m) => {
  if (m == null) return null;
  const x = normalize(m);
  const map = {
    'jan':1,'january':1,'feb':2,'february':2,'mar':3,'march':3,'apr':4,'april':4,'may':5,
    'jun':6,'june':6,'jul':7,'july':7,'aug':8,'august':8,'sep':9,'sept':9,'september':9,
    'oct':10,'october':10,'nov':11,'november':11,'dec':12,'december':12,
    'q1':'q1','q2':'q2','q3':'q3','q4':'q4','year':'year','fy':'fy'
  };
  return map[x] ?? (isFinite(+x) ? (+x >=1 && +x <=12 ? +x : null) : null);
};

const findBudgetIndex = (columnOrder, basePeriodIndex) => {
  if (!Array.isArray(columnOrder) || basePeriodIndex == null) return -1;
  const base = columnOrder[basePeriodIndex];
  if (!base) return -1;

  // 1) strict same month+year budget
  const strict = columnOrder.findIndex(c =>
    isBudgetColGeneric(c) && c?.year === base?.year && normalize(c?.month) === normalize(base?.month)
  );
  if (strict !== -1) return strict;

  // 2) FY budget for the same year
  const fyBudget = columnOrder.findIndex(c => isBudgetColGeneric(c) && c?.year === base?.year && (isFYCol(c) || normalize(c?.month) === 'fy'));
  if (fyBudget !== -1) return fyBudget;

  // 3) any budget in same year
  const any = columnOrder.findIndex(c => isBudgetColGeneric(c) && c?.year === base?.year);
  if (any !== -1) return any;

  // 4) any budget at all
  return columnOrder.findIndex(c => isBudgetColGeneric(c));
};

const safeSumAt = (i, rows) => {
  if (i < 0 || !Array.isArray(rows)) return 0;
  return rows.reduce((s, r) => {
    const v = parseFloat(r?.rawValues?.[i] ?? 0);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);
};

const ratioPct = (a, b) => {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (b === 0) return a > 0 ? Infinity : null;
  return ((a - b) / b) * 100;
};

const columnToMonths = (column) => {
  if (!column) return [];
  if (Array.isArray(column.months) && column.months.length) return column.months;
  const map = {
    Q1: [1,2,3], Q2: [4,5,6], Q3: [7,8,9], Q4: [10,11,12],
    HY1: [1,2,3,4,5,6], HY2: [7,8,9,10,11,12],
    Year: [1,2,3,4,5,6,7,8,9,10,11,12],
    January:[1], February:[2], March:[3], April:[4], May:[5], June:[6],
    July:[7], August:[8], September:[9], October:[10], November:[11], December:[12]
  };
  return map[column.month] || [1];
};

// ============================== API HELPERS ==================================
const applySavedMergeRules = async (salesRep, division, customers) => {
  try {
    // Use division-wide merge rules API (not sales-rep-specific)
    const response = await fetch(
      `/api/division-merge-rules/rules?division=${encodeURIComponent(division)}`
    );
    const result = await response.json();
    if (result.success && result.data && Array.isArray(result.data) && result.data.length > 0) {
      const processedCustomers = [];
      const processed = new Set();

      for (const rule of result.data) {
        // Map database fields to expected format
        const mergedName = rule.merged_customer_name;
        const originalCustomers = rule.original_customers || [];
        
        const existingObjs = [];
        const processedInRule = new Set(); // Track which customers we've already found for this rule
        
        // CRITICAL FIX: Deduplicate originalCustomers to prevent double-counting
        const uniqueOriginalCustomers = [...new Set(originalCustomers.map(c => normalize(c)))];
        
        if (originalCustomers.length !== uniqueOriginalCustomers.length) {
          console.warn(`⚠️ Merge rule "${mergedName}": Had ${originalCustomers.length} entries but ${uniqueOriginalCustomers.length} unique customers (duplicates removed)`);
        }
        
        for (const normalizedName of uniqueOriginalCustomers) {
          const match = customers.find(c => {
            const normalized = normalize(c.name);
            return normalized === normalizedName && !processedInRule.has(normalized);
          });
          if (match) {
            existingObjs.push(match);
            processedInRule.add(normalize(match.name));
          }
        }
        if (existingObjs.length > 1) {
          const agg = {
            name: toProperCase(mergedName) + '*',
            originalName: mergedName,
            rawValues: new Array(customers[0]?.rawValues?.length || 0).fill(0)
          };
          existingObjs.forEach((c) => {
            c.rawValues.forEach((v, i) => {
              const num = parseFloat(v);
              if (Number.isFinite(num)) agg.rawValues[i] += num;
            });
            processed.add(c.name);
          });
          processedCustomers.push(agg);
        } else if (existingObjs.length === 1) {
          const only = { ...existingObjs[0] };
          processed.add(only.name);
          if (mergedName) {
            only.name = toProperCase(mergedName) + '*';
            only.originalName = mergedName;
          }
          processedCustomers.push(only);
        }
      }

      // CRITICAL FIX: Create normalized set of merged customer names (without asterisk)
      // to filter out original customers that match merged names
      const mergedCustomerNamesNormalized = new Set();
      processedCustomers.forEach(customer => {
        if (customer.name && customer.name.endsWith('*')) {
          const withoutAsterisk = customer.name.slice(0, -1).trim();
          mergedCustomerNamesNormalized.add(normalize(withoutAsterisk));
        }
      });
      
      // CRITICAL: Also create a set of ALL original customers from ALL merge rules (normalized)
      const allOriginalCustomersNormalized = new Set();
      result.data.forEach((rule) => {
        const originalCustomers = rule.original_customers || [];
        originalCustomers.forEach(orig => {
          allOriginalCustomersNormalized.add(normalize(orig));
        });
      });
      
      customers.forEach((c) => {
        const customerNormalized = normalize(c.name);
        
        // Skip if already processed
        if (processed.has(c.name)) {
          return;
        }
        
        // Skip if customer name matches a merged customer name (without asterisk)
        if (mergedCustomerNamesNormalized.has(customerNormalized)) {
          return;
        }
        
        // Skip if customer name matches ANY original customer from ANY merge rule
        if (allOriginalCustomersNormalized.has(customerNormalized)) {
          return;
        }
        
        processedCustomers.push({ ...c });
      });

      return processedCustomers;
    }
  } catch (e) {
    console.warn('Saved merge rules fetch failed, proceeding without:', e);
  }
  return customers;
};

// FIX: support explicit dataType override ("Amount" or "Actual")
const fetchCustomerSalesForColumn = async (rep, column, dataTypeOverride, division) => {
  const months = columnToMonths(column);
  const res = await fetch('/api/sales-by-customer-db', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      division: division || 'FP',
      salesRep: rep,
      year: column.year,
      months,
      dataType: dataTypeOverride || column.type || 'Actual'
    })
  });
  const json = await res.json();
  return json?.success ? json.data || [] : [];
};

// FIX: third arg chooses dataType when building rows
const buildRowsFromApi = async (rep, columnOrder, dataType = 'Actual', division) => {
  if (!rep || !Array.isArray(columnOrder) || columnOrder.length === 0) return [];
  const cmap = new Map();
  for (let idx = 0; idx < columnOrder.length; idx++) {
    const col = columnOrder[idx];
    const data = await fetchCustomerSalesForColumn(rep, col, dataType, division);
    data.forEach((rec) => {
      const name = rec.customer;
      const val = parseFloat(rec.value) || 0;
      if (!cmap.has(name)) {
        cmap.set(name, { name, rawValues: new Array(columnOrder.length).fill(0) });
      }
      cmap.get(name).rawValues[idx] = val;
    });
  }
  return Array.from(cmap.values());
};

// ============================== COMPONENT ====================================
const CustomerKeyFacts = ({ rep: repProp, rowsOverride, amountRowsOverride, onFindingsCalculated = null }) => {
  const { columnOrder, basePeriodIndex } = useFilter();
  const { selectedDivision } = useExcelData();
  const rep = repProp;

  const [rows, setRows] = useState(null);
  
  // UI state for show more/less functionality
  const [showAllGrowth, setShowAllGrowth] = useState(false);
  const [showAllUnderperformers, setShowAllUnderperformers] = useState(false);
  const [showAllVolumeAdvantage, setShowAllVolumeAdvantage] = useState(false);
  const [showAllSalesAdvantage, setShowAllSalesAdvantage] = useState(false);
  const [amountRows, setAmountRows] = useState(null);
  const [waitingForTable, setWaitingForTable] = useState(true);
  const [waitingForAmountTable, setWaitingForAmountTable] = useState(true);
  const hasMountedRef = useRef(false);

  // 1) Listen for volume table event
  useEffect(() => {
    const handler = (ev) => {
      if (ev?.detail?.rows && Array.isArray(ev.detail.rows)) {
        const r = ev.detail.rows;
        if (Array.isArray(columnOrder) && columnOrder.length > 0) {
          const ok = r[0]?.rawValues?.length === columnOrder.length;
          setRows(ok ? r : null);
        } else {
          setRows(r);
        }
        setWaitingForTable(false);
      }
    };
    window.addEventListener('customersKgsTable:dataReady', handler);
    return () => window.removeEventListener('customersKgsTable:dataReady', handler);
  }, [columnOrder]);

  // 1b) Listen for amount table event
  useEffect(() => {
    const handler = (ev) => {
      if (ev?.detail?.rows && Array.isArray(ev.detail.rows)) {
        const r = ev.detail.rows;
        if (Array.isArray(columnOrder) && columnOrder.length > 0) {
          const ok = r[0]?.rawValues?.length === columnOrder.length;
          setAmountRows(ok ? r : null);
        } else {
          setAmountRows(r);
        }
        setWaitingForAmountTable(false);
      }
    };
    window.addEventListener('customersAmountTable:dataReady', handler);
    return () => window.removeEventListener('customersAmountTable:dataReady', handler);
  }, [columnOrder]);

  // 2) Fallback: build from API if no table event after mount
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      const timer = setTimeout(async () => {
        if (waitingForTable && rep && Array.isArray(columnOrder) && columnOrder.length > 0) {
          try {
            const apiRows = await buildRowsFromApi(rep, columnOrder, 'Actual', selectedDivision);
            const merged = await applySavedMergeRules(rep, selectedDivision || 'FP', apiRows);
            setRows(merged);
            setWaitingForTable(false);
          } catch (e) {
            console.error('Failed to build volume rows from API:', e);
          }
        }
        if (waitingForAmountTable && rep && Array.isArray(columnOrder) && columnOrder.length > 0) {
          try {
            const apiRows = await buildRowsFromApi(rep, columnOrder, 'Amount', selectedDivision);
            const merged = await applySavedMergeRules(rep, selectedDivision || 'FP', apiRows);
            setAmountRows(merged);
            setWaitingForAmountTable(false);
          } catch (e) {
            console.error('Failed to build amount rows from API:', e);
          }
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [rep, columnOrder, waitingForTable, waitingForAmountTable, selectedDivision]);

  // 3) Use overrides if provided
  const finalRows = rowsOverride || rows;
  const finalAmountRows = amountRowsOverride || amountRows;

  // ============================== ANALYSIS ==================================
  const findings = useMemo(() => {
    if (!Array.isArray(finalRows) || finalRows.length === 0 || !Array.isArray(columnOrder) || basePeriodIndex == null) {
      return null;
    }

    const budgetIndex = findBudgetIndex(columnOrder, basePeriodIndex);

    // FIX: Convert years to numbers to handle string/number comparison
    const baseYear = Number(columnOrder[basePeriodIndex]?.year);
    const targetYear = baseYear - 1;
    const targetMonth = normalize(columnOrder[basePeriodIndex]?.month);

    const previousYearIndex = columnOrder.findIndex(c => Number(c?.year) === targetYear && normalize(c?.month) === targetMonth);
    const ytdCurrentIndex = columnOrder.findIndex(c => isYTDCol(c) && Number(c?.year) === baseYear);
    const ytdPreviousIndex = columnOrder.findIndex(c => isYTDCol(c) && Number(c?.year) === targetYear);
    const fyCurrentIndex = columnOrder.findIndex(c => isFYCol(c) && Number(c?.year) === baseYear);
    const fyPreviousIndex = columnOrder.findIndex(c => isFYCol(c) && Number(c?.year) === targetYear);
    const fyBudgetIndex = columnOrder.findIndex(c => isBudgetColGeneric(c) && Number(c?.year) === baseYear && (isFYCol(c) || normalize(c?.month) === 'fy'));

    const totalActual = safeSumAt(basePeriodIndex, finalRows);
    const totalBudget = safeSumAt(budgetIndex, finalRows);
    const totalPrev = safeSumAt(previousYearIndex, finalRows);
    const totalYtdCur = safeSumAt(ytdCurrentIndex, finalRows);
    const totalYtdPrev = safeSumAt(ytdPreviousIndex, finalRows);
    const totalFyCur = safeSumAt(fyCurrentIndex, finalRows);
    const totalFyPrev = safeSumAt(fyPreviousIndex, finalRows);
    const totalFyBudget = safeSumAt(fyBudgetIndex, finalRows);

    // Amount totals (if available)
    let totalAmountActual = 0, totalAmountBudget = 0, totalAmountPrev = 0;
    let totalAmountYtdCur = 0, totalAmountYtdPrev = 0, totalAmountFyCur = 0, totalAmountFyPrev = 0, totalAmountFyBudget = 0;
    if (Array.isArray(finalAmountRows) && finalAmountRows.length > 0) {
      totalAmountActual = safeSumAt(basePeriodIndex, finalAmountRows);
      totalAmountBudget = safeSumAt(budgetIndex, finalAmountRows);
      totalAmountPrev = safeSumAt(previousYearIndex, finalAmountRows);
      totalAmountYtdCur = safeSumAt(ytdCurrentIndex, finalAmountRows);
      totalAmountYtdPrev = safeSumAt(ytdPreviousIndex, finalAmountRows);
      totalAmountFyCur = safeSumAt(fyCurrentIndex, finalAmountRows);
      totalAmountFyPrev = safeSumAt(fyPreviousIndex, finalAmountRows);
      totalAmountFyBudget = safeSumAt(fyBudgetIndex, finalAmountRows);
    }

    // Kilo rates
    const avgKiloRate = totalActual > 0 ? totalAmountActual / (totalActual / 1000) : 0;
    const avgKiloRatePrev = totalPrev > 0 ? totalAmountPrev / (totalPrev / 1000) : 0;
    const avgKiloRateBudget = totalBudget > 0 ? totalAmountBudget / (totalBudget / 1000) : 0;
    const kiloRateYoY = ratioPct(avgKiloRate, avgKiloRatePrev);
    const kiloRateVsBudget = ratioPct(avgKiloRate, avgKiloRateBudget);

    // Months remaining calculation
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    const basePeriodYear = columnOrder[basePeriodIndex]?.year;
    let monthsRemaining = 12;
    if (basePeriodYear === currentYear) {
      const basePeriodMonthNum = monthToNumber(columnOrder[basePeriodIndex]?.month);
      if (basePeriodMonthNum && basePeriodMonthNum <= 12) {
        monthsRemaining = 12 - basePeriodMonthNum;
      }
    }

    // Catch-up metrics
    const runRateInfo = {
      currentRunRate: totalActual * (12 / Math.max(1, 12 - monthsRemaining)),
      requiredRunRate: totalFyBudget > 0 ? totalFyBudget : totalBudget * (12 / Math.max(1, 12 - monthsRemaining)),
      isOnTrack: false,
      catchUpRequired: 0
    };
    runRateInfo.isOnTrack = runRateInfo.currentRunRate >= runRateInfo.requiredRunRate * RUNRATE_WARN;
    if (!runRateInfo.isOnTrack && monthsRemaining > 0) {
      runRateInfo.catchUpRequired = (runRateInfo.requiredRunRate - totalActual) / monthsRemaining;
    }

    // Customer analysis with volume vs sales
    const customerVolumeVsSales = [];
    if (Array.isArray(finalAmountRows) && finalAmountRows.length > 0) {
      const volumeMap = new Map();
      finalRows.forEach(r => volumeMap.set(keyName(r.name), r));
      
      finalAmountRows.forEach(amountRow => {
        const volumeRow = volumeMap.get(keyName(amountRow.name));
        if (volumeRow) {
          const volumeActual = volumeRow.rawValues?.[basePeriodIndex] || 0;
          const amountActual = amountRow.rawValues?.[basePeriodIndex] || 0;
          const volumeBudget = budgetIndex >= 0 ? (volumeRow.rawValues?.[budgetIndex] || 0) : 0;
          const amountBudget = budgetIndex >= 0 ? (amountRow.rawValues?.[budgetIndex] || 0) : 0;
          const volumePrev = previousYearIndex >= 0 ? (volumeRow.rawValues?.[previousYearIndex] || 0) : 0;
          const amountPrev = previousYearIndex >= 0 ? (amountRow.rawValues?.[previousYearIndex] || 0) : 0;
          
          const kiloRate = volumeActual > 0 ? amountActual / (volumeActual / 1000) : 0;
          const kiloRatePrev = volumePrev > 0 ? amountPrev / (volumePrev / 1000) : 0;
          const kiloRateBudget = volumeBudget > 0 ? amountBudget / (volumeBudget / 1000) : 0;
          
          customerVolumeVsSales.push({
            name: amountRow.name,
            volumeActual,
            amountActual,
            volumeBudget,
            amountBudget,
            volumePrev,
            amountPrev,
            kiloRate,
            kiloRatePrev,
            kiloRateBudget,
            volumeVsBudget: ratioPct(volumeActual, volumeBudget),
            amountVsBudget: ratioPct(amountActual, amountBudget),
            volumeYoY: ratioPct(volumeActual, volumePrev),
            amountYoY: ratioPct(amountActual, amountPrev),
            kiloRateYoY: ratioPct(kiloRate, kiloRatePrev),
            kiloRateVsBudget: ratioPct(kiloRate, kiloRateBudget)
          });
        }
      });
    }

    // PVM decomposition (Price-Volume-Mix)
    let priceEffect = 0, volumeEffect = 0, mixEffect = 0;
    let pvmAvailable = false;
    
    if (totalAmountPrev > 0 && totalPrev > 0 && totalAmountActual > 0 && totalActual > 0) {
      const avgPricePrev = totalAmountPrev / (totalPrev / 1000);
      const avgPriceCur = totalAmountActual / (totalActual / 1000);
      priceEffect = ((avgPriceCur - avgPricePrev) / avgPricePrev) * 100;
      volumeEffect = ((totalActual - totalPrev) / totalPrev) * 100;
      mixEffect = 0; // Simplified - would need product mix data for full calculation
      pvmAvailable = true;
    } else if (totalBudget > 0 && totalAmountBudget > 0 && totalActual > 0 && totalAmountActual > 0) {
      // Fallback to budget comparison if no previous year data
      const avgPriceBudget = totalAmountBudget / (totalBudget / 1000);
      const avgPriceCur = totalAmountActual / (totalActual / 1000);
      priceEffect = ((avgPriceCur - avgPriceBudget) / avgPriceBudget) * 100;
      volumeEffect = ((totalActual - totalBudget) / totalBudget) * 100;
      mixEffect = 0;
      pvmAvailable = true;
    }

    // Outlier detection (z-score on YoY growth)
    const yoyGrowthRates = finalRows
      .filter(r => previousYearIndex >= 0 && (r.rawValues?.[previousYearIndex] || 0) > 0)
      .map(r => {
        const prev = r.rawValues?.[previousYearIndex] || 0;
        const cur = r.rawValues?.[basePeriodIndex] || 0;
        return ratioPct(cur, prev) || 0;
      })
      .filter(rate => rate != null);
    
    const meanYoY = yoyGrowthRates.length > 0 ? yoyGrowthRates.reduce((a, b) => a + b, 0) / yoyGrowthRates.length : 0;
    const stdDevYoY = yoyGrowthRates.length > 1 ? Math.sqrt(yoyGrowthRates.reduce((sum, rate) => sum + Math.pow(rate - meanYoY, 2), 0) / (yoyGrowthRates.length - 1)) : 0;
    
    // Tiered outlier detection - capture different types of anomalies
    const outliers = finalRows
      .filter(r => previousYearIndex >= 0 && (r.rawValues?.[previousYearIndex] || 0) > 0)
      .map(r => {
        const prev = r.rawValues?.[previousYearIndex] || 0;
        const cur = r.rawValues?.[basePeriodIndex] || 0;
        const yoyRate = ratioPct(cur, prev) || 0;
        const zScore = stdDevYoY > 0 ? Math.abs(yoyRate - meanYoY) / stdDevYoY : 0;
        const volumeShare = totalActual > 0 ? (cur / totalActual) : 0;
        // Find amount for this customer if available
        const customerAmount = customerVolumeVsSales.find(c => keyName(c.name) === keyName(r.name));
        const amountShare = customerAmount && totalAmountActual > 0 ? (customerAmount.amountActual / totalAmountActual) : 0;
        
        // Categorize outliers into tiers
        let category = null;
        let priority = 0;
        let badge = '';
        
        if (zScore > 3) {
          // Tier 1: Extreme statistical outliers - always show regardless of size
          category = 'EXTREME';
          priority = zScore * 100 + Math.max(volumeShare, amountShare) * 1000;
          badge = '🔴 Extreme';
        } else if (zScore > 2 && (volumeShare >= 0.02 || amountShare >= 0.02)) {
          // Tier 2: Material outliers - significant size + statistical anomaly
          category = 'MATERIAL';
          priority = zScore * Math.max(volumeShare, amountShare) * 1000;
          badge = '🟡 Material';
        } else if (zScore > 2 && Math.abs(yoyRate) > 200) {
          // Tier 3: Emerging patterns - small customers with extreme growth (might indicate market trend)
          category = 'EMERGING';
          priority = zScore * Math.abs(yoyRate) * 0.1;
          badge = '🟢 Emerging';
        }
        
        return { name: r.name, yoyRate, zScore, volume: cur, volumeShare, amountShare, category, priority, badge };
      })
      .filter(item => item.category !== null) // Only keep categorized outliers
      .sort((a, b) => b.priority - a.priority) // Sort by priority score
      .slice(0, 8); // Show more outliers with categorization

    // Top performers by different metrics (with YoY trends)
    const topVolumePerformers = finalRows
      .filter(r => (r.rawValues?.[basePeriodIndex] || 0) > 0)
      .sort((a, b) => (b.rawValues?.[basePeriodIndex] || 0) - (a.rawValues?.[basePeriodIndex] || 0))
      .slice(0, 5)
      .map(r => {
        const volume = r.rawValues?.[basePeriodIndex] || 0;
        const prevVolume = previousYearIndex >= 0 ? (r.rawValues?.[previousYearIndex] || 0) : null;
        const yoy = prevVolume ? ratioPct(volume, prevVolume) : null;
        return {
          name: r.name,
          volume,
          share: totalActual > 0 ? (volume / totalActual * 100) : 0,
          yoy,
          trendIcon: yoy !== null ? (yoy > 0 ? '📈' : yoy < 0 ? '📉' : '➡️') : null
        };
      });

    const topSalesPerformers = customerVolumeVsSales
      .filter(c => c.amountActual > 0)
      .sort((a, b) => b.amountActual - a.amountActual)
      .slice(0, 5)
      .map(c => ({
        name: c.name,
        amount: c.amountActual,
        share: totalAmountActual > 0 ? (c.amountActual / totalAmountActual * 100) : 0,
        yoy: c.amountYoY,
        trendIcon: c.amountYoY !== null ? (c.amountYoY > 0 ? '📈' : c.amountYoY < 0 ? '📉' : '➡️') : null
      }));

    const topKiloRatePerformers = customerVolumeVsSales
      .filter(c => c.kiloRate > 0 && c.volumeActual > totalActual * 0.01) // At least 1% of volume
      .sort((a, b) => b.kiloRate - a.kiloRate)
      .slice(0, 5)
      .map(c => ({
        name: c.name,
        kiloRate: c.kiloRate,
        volume: c.volumeActual
      }));

    // Materiality thresholds for meaningful analysis
    const MIN_VOLUME_SHARE = 0.02; // Minimum 2% of total volume
    const MIN_ABSOLUTE_VOLUME = 10; // Minimum 10 MT absolute volume
    const MIN_PERFORMANCE_GAP = 10; // Minimum 10% performance gap to be significant
    
    // Volume vs Sales advantage analysis with materiality filters
    const volumeAdvantageCustomers = customerVolumeVsSales
      .filter(c => {
        // Must have valid data
        if (c.volumeVsBudget == null || c.amountVsBudget == null) return false;
        
        // Must have significant performance gap
        if (c.volumeVsBudget <= c.amountVsBudget + MIN_PERFORMANCE_GAP) return false;
        
        // Must meet materiality thresholds
        const volumeShare = totalActual > 0 ? (c.volumeActual / totalActual) : 0;
        const volumeMT = (c.volumeActual || 0) / 1000;
        
        return volumeShare >= MIN_VOLUME_SHARE && volumeMT >= MIN_ABSOLUTE_VOLUME;
      })
      .sort((a, b) => (b.volumeVsBudget - b.amountVsBudget) - (a.volumeVsBudget - a.amountVsBudget))
      .slice(0, 3); // Reduced to top 3 since we're being more selective

    const salesAdvantageCustomers = customerVolumeVsSales
      .filter(c => {
        // Must have valid data
        if (c.volumeVsBudget == null || c.amountVsBudget == null) return false;
        
        // Must have significant performance gap
        if (c.amountVsBudget <= c.volumeVsBudget + MIN_PERFORMANCE_GAP) return false;
        
        // Must meet materiality thresholds
        const volumeShare = totalActual > 0 ? (c.volumeActual / totalActual) : 0;
        const volumeMT = (c.volumeActual || 0) / 1000;
        
        return volumeShare >= MIN_VOLUME_SHARE && volumeMT >= MIN_ABSOLUTE_VOLUME;
      })
      .sort((a, b) => (b.amountVsBudget - b.volumeVsBudget) - (a.amountVsBudget - a.volumeVsBudget))
      .slice(0, 3); // Reduced to top 3 since we're being more selective

    // Retention analysis with declining customers detection
    let retentionAnalysis = { 
      retentionRate: 0, 
      churnRate: 0, 
      retainedCustomers: 0, 
      lostCustomers: 0, 
      newCustomers: 0, 
      decliningCustomers: 0,
      totalPreviousCustomers: 0, 
      lostCustomerNames: [], 
      newCustomerNames: [], 
      decliningCustomerNames: [],
      retentionRisk: 'LOW' 
    };
    
    // Store customer arrays for churn volume impact analysis
    let lostCustomersArray = [];
    let retainedCustomersArray = [];
    let newCustomersArray = [];
    
    if (previousYearIndex >= 0) {
      const previousCustomers = finalRows.filter(r => (r.rawValues?.[previousYearIndex] || 0) > 0).map(r => ({ key: keyName(r.name), name: r.name, volume: r.rawValues?.[previousYearIndex] || 0 }));
      const currentCustomers  = finalRows.filter(r => (r.rawValues?.[basePeriodIndex] || 0) > 0).map(r => ({ key: keyName(r.name), name: r.name, volume: r.rawValues?.[basePeriodIndex] || 0 }));
      const prevSet = new Set(previousCustomers.map(c => c.key));
      const curSet  = new Set(currentCustomers.map(c => c.key));
      const retained = previousCustomers.filter(c => curSet.has(c.key));
      const lost = previousCustomers.filter(c => !curSet.has(c.key));
      const added = currentCustomers.filter(c => !prevSet.has(c.key));
      
      // Store arrays for churn volume impact (with proper data format)
      lostCustomersArray = lost.map(c => ({ name: c.name, mtPrev: c.volume }));
      retainedCustomersArray = retained.map(c => {
        const current = currentCustomers.find(cur => cur.key === c.key);
        return { name: c.name, mtActual: current ? current.volume : 0 };
      });
      newCustomersArray = added.map(c => ({ name: c.name, mtActual: c.volume }));
      
      // Identify declining customers (30-90% decline - at risk of churning)
      const declining = currentCustomers
        .filter(cur => {
          const prev = previousCustomers.find(p => p.key === cur.key);
          if (!prev) return false;
          const decline = (cur.volume - prev.volume) / prev.volume;
          return decline < -0.3 && decline > -0.9; // 30-90% decline
        })
        .sort((a, b) => {
          const aPrev = previousCustomers.find(p => p.key === a.key);
          const bPrev = previousCustomers.find(p => p.key === b.key);
          const aDecline = (a.volume - aPrev.volume) / aPrev.volume;
          const bDecline = (b.volume - bPrev.volume) / bPrev.volume;
          return aDecline - bDecline; // Most declining first
        });
      
      const totalPrevCust = previousCustomers.length;
      const retentionRate = totalPrevCust > 0 ? (retained.length / totalPrevCust) : 0;
      const churnRate = totalPrevCust > 0 ? (lost.length / totalPrevCust) : 0;
      const retentionRisk = churnRate >= 0.3 ? 'HIGH' : churnRate >= 0.15 ? 'MEDIUM' : 'LOW';
      
      retentionAnalysis = { 
        retentionRate, 
        churnRate, 
        retainedCustomers: retained.length, 
        lostCustomers: lost.length, 
        newCustomers: added.length, 
        decliningCustomers: declining.length,
        totalPreviousCustomers: totalPrevCust, 
        lostCustomerNames: lost.map(c=>formatCustomerName(c.name)).slice(0,5), 
        newCustomerNames: added.map(c=>formatCustomerName(c.name)).slice(0,5), 
        decliningCustomerNames: declining.map(c=>formatCustomerName(c.name)).slice(0,5),
        retentionRisk 
      };
    }

    // Variances
    const vsBudget = ratioPct(totalActual, totalBudget);
    const yoy = ratioPct(totalActual, totalPrev);
    const vsBudgetAmount = ratioPct(totalAmountActual, totalAmountBudget);
    const yoyAmount = ratioPct(totalAmountActual, totalAmountPrev);

    // Focus customers (materiality × variance scoring)
    const withCatchup = finalRows
      .map((r) => {
        const actual = r.rawValues?.[basePeriodIndex] || 0;
        const budget = budgetIndex >= 0 ? (r.rawValues?.[budgetIndex] || 0) : 0;
        const prev = previousYearIndex >= 0 ? (r.rawValues?.[previousYearIndex] || 0) : 0;
        const vsBudget = ratioPct(actual, budget);
        const yoy = ratioPct(actual, prev);
        const share = totalActual > 0 ? (actual / totalActual) : 0;
        const materialityScore = share * 100;
        const varianceScore = Math.abs(vsBudget || 0) + Math.abs(yoy || 0);
        const priorityScore = materialityScore * varianceScore;
        
        return {
          name: r.name,
          actual,
          budget,
          prev,
          vsBudget,
          yoy,
          share,
          materialityScore,
          varianceScore,
          priorityScore,
          catchUpRequired: monthsRemaining > 0 && budget > actual ? (budget - actual) / monthsRemaining : 0
        };
      })
      .filter((c) => c.actual > 0 || c.budget > 0)
      .sort((a, b) => b.priorityScore - a.priorityScore);

    // Coverage rule: ensure top customers by volume are included
    const sortedByVolume = [...withCatchup].sort((a, b) => b.actual - a.actual);
    let cumShare = 0;
    const focusSet = new Set();
    
    // Add high-priority customers
    withCatchup.slice(0, MAX_FOCUS).forEach(c => focusSet.add(c.name));
    
    // Ensure coverage of top volume customers
    for (const customer of sortedByVolume) {
      if (focusSet.size >= MAX_FOCUS) break;
      cumShare += customer.share;
      focusSet.add(customer.name);
      if (cumShare >= CUM_SHARE_TARGET) break;
    }

    const focusCustomers = withCatchup.filter(c => focusSet.has(c.name)).slice(0, MAX_FOCUS);

    // Categorize customers
    const growthDrivers = focusCustomers.filter((c) => 
      (c.vsBudget != null && c.vsBudget >= GROWTH_VOL_PCT) || 
      (c.yoy != null && c.yoy >= GROWTH_YOY_VOL)
    ).slice(0, MAX_LIST);

    const underperformers = focusCustomers.filter((c) => 
      (c.vsBudget != null && c.vsBudget <= UNDERPERF_VOL_PCT) || 
      (c.yoy != null && c.yoy <= UNDERPERF_YOY_VOL)
    ).slice(0, MAX_LIST);

    const stable = focusCustomers.filter((c) => 
      !growthDrivers.some(g => g.name === c.name) && 
      !underperformers.some(u => u.name === c.name)
    ).slice(0, MAX_LIST);

    // Portfolio projections
    const portfolioRemainingMt = Math.max(0, (totalFyBudget || totalBudget * 12 / Math.max(1, 12 - monthsRemaining)) - totalActual);
    const portfolioPerMonthMt = monthsRemaining > 0 ? portfolioRemainingMt / monthsRemaining : 0;

    // Coverage percentage
    const cum = focusCustomers.reduce((s, c) => s + c.share, 0);

    // Concentration risk with YoY trend analysis
    const sortedCustomers = finalRows
      .map(r => ({
        name: r.name,
        volume: r.rawValues?.[basePeriodIndex] || 0,
        share: totalActual > 0 ? ((r.rawValues?.[basePeriodIndex] || 0) / totalActual) : 0
      }))
      .filter(c => c.volume > 0)
      .sort((a, b) => b.volume - a.volume);

    const customerCount = sortedCustomers.length;
    const totalCustomers = finalRows.length;
    const top1CustomerShare = sortedCustomers[0]?.share || 0;
    const top3CustomerShare = sortedCustomers.slice(0, 3).reduce((sum, c) => sum + c.share, 0);
    const top5CustomerShare = sortedCustomers.slice(0, 5).reduce((sum, c) => sum + c.share, 0);
    const avgVolumePerCustomer = customerCount > 0 ? totalActual / customerCount : 0;
    const customerEfficiency = totalActual > 0 ? (totalAmountActual / totalActual) : 0;
    
    // Calculate concentration trends (YoY comparison)
    let concentrationTrend = null;
    if (previousYearIndex >= 0 && totalPrev > 0) {
      const sortedPrev = finalRows
        .map(r => ({
          name: r.name,
          volume: r.rawValues?.[previousYearIndex] || 0,
          share: totalPrev > 0 ? ((r.rawValues?.[previousYearIndex] || 0) / totalPrev) : 0
        }))
        .filter(c => c.volume > 0)
        .sort((a, b) => b.volume - a.volume);
      
      const prevTop1 = sortedPrev[0]?.share || 0;
      const prevTop3 = sortedPrev.slice(0, 3).reduce((sum, c) => sum + c.share, 0);
      const prevCustomerCount = sortedPrev.length;
      
      concentrationTrend = {
        top1Change: top1CustomerShare - prevTop1,
        top3Change: top3CustomerShare - prevTop3,
        customerCountChange: customerCount - prevCustomerCount,
        direction: (top3CustomerShare - prevTop3) > 0.05 ? 'INCREASING' : 
                   (top3CustomerShare - prevTop3) < -0.05 ? 'DECREASING' : 'STABLE',
        directionIcon: (top3CustomerShare - prevTop3) > 0.05 ? '📈' : 
                       (top3CustomerShare - prevTop3) < -0.05 ? '📉' : '➡️'
      };
    }
    
    let concentrationRiskLevel = 'LOW';
    if (top1CustomerShare > 0.5) concentrationRiskLevel = 'CRITICAL';
    else if (top1CustomerShare > 0.3 || top3CustomerShare > 0.7) concentrationRiskLevel = 'HIGH';
    else if (top1CustomerShare > 0.2 || top3CustomerShare > 0.5) concentrationRiskLevel = 'MEDIUM';

    const hasPreviousYearData = previousYearIndex >= 0 && totalPrev > 0 && totalAmountPrev > 0;

    // ====== INTELLIGENT CONTEXT-AWARE EXECUTIVE SUMMARY ======================
    // Read actual periods being compared to generate smart narrative
    const basePeriodDesc = columnOrder[basePeriodIndex] ? 
      `${columnOrder[basePeriodIndex].month || ''} ${columnOrder[basePeriodIndex].year} ${columnOrder[basePeriodIndex].type}`.trim() : 'Current Period';
    const budgetPeriodDesc = budgetIndex >= 0 && columnOrder[budgetIndex] ? 
      `${columnOrder[budgetIndex].month || ''} ${columnOrder[budgetIndex].year} ${columnOrder[budgetIndex].type}`.trim() : null;
    const previousPeriodDesc = previousYearIndex >= 0 && columnOrder[previousYearIndex] ? 
      `${columnOrder[previousYearIndex].month || ''} ${columnOrder[previousYearIndex].year} ${columnOrder[previousYearIndex].type}`.trim() : null;

    // Build contextual summary based on what's being compared
    const periodSummary = [];
    
    // Budget comparison context
    if (budgetPeriodDesc && vsBudget !== null) {
      const budgetStatus = vsBudget >= 0 ? 'ahead of' : 'behind';
      const volumeTrend = `${budgetStatus} ${budgetPeriodDesc} by ${formatPct(Math.abs(vsBudget))}`;
      const salesTrend = vsBudgetAmount !== null ? 
        `sales ${vsBudgetAmount >= 0 ? 'exceeding' : 'below'} target by ${formatPct(Math.abs(vsBudgetAmount))}` : null;
      
      periodSummary.push(
        salesTrend ? `vs ${budgetPeriodDesc}: volume ${volumeTrend.split(' ').slice(-3).join(' ')}, ${salesTrend}` 
                   : `vs ${budgetPeriodDesc}: volume ${volumeTrend.split(' ').slice(-3).join(' ')}`
      );
    }
    
    // Year-over-year comparison context
    if (previousPeriodDesc && yoy !== null) {
      const yoyTrend = yoy >= 0 ? 'growth' : 'decline';
      const volumeChange = `volume ${yoyTrend} of ${formatPct(Math.abs(yoy))}`;
      const salesChange = yoyAmount !== null ? 
        `sales ${yoyAmount >= 0 ? 'increase' : 'decrease'} of ${formatPct(Math.abs(yoyAmount))}` : null;
      
      periodSummary.push(
        salesChange ? `vs ${previousPeriodDesc}: ${volumeChange}, ${salesChange}`
                    : `vs ${previousPeriodDesc}: ${volumeChange}`
      );
    }

    const executiveSummary = {
      periodContext: basePeriodDesc,
      comparisons: periodSummary,
      portfolioHealth: vsBudget >= 0 ? 'ON_TRACK' : vsBudget >= -10 ? 'AT_RISK' : 'UNDERPERFORMING',
      keyRisks: [
        ...(concentrationRiskLevel === 'HIGH' || concentrationRiskLevel === 'CRITICAL' ? ['High customer concentration'] : []),
        ...(retentionAnalysis.churnRate > 0.2 ? ['High customer churn rate'] : []),
        ...(retentionAnalysis.decliningCustomers > 0 ? [`${retentionAnalysis.decliningCustomers} customers declining significantly`] : []),
        ...(underperformers.length > focusCustomers.length * 0.4 ? ['Multiple underperforming customers'] : []),
        ...(!runRateInfo.isOnTrack ? ['Behind FY budget pace'] : [])
      ].slice(0, 4),
      opportunities: [
        ...(growthDrivers.length > 0 ? [`${growthDrivers.length} growth driver${growthDrivers.length > 1 ? 's' : ''} identified`] : []),
        ...(volumeAdvantageCustomers.length > 0 ? ['Volume efficiency opportunities'] : []),
        ...(salesAdvantageCustomers.length > 0 ? ['Price realization opportunities'] : []),
        ...(retentionAnalysis.newCustomers > 0 ? [`${retentionAnalysis.newCustomers} new customer${retentionAnalysis.newCustomers > 1 ? 's' : ''} acquired`] : [])
      ].slice(0, 3)
    };

    return {
      base: { rep, basePeriodIndex, budgetIndex, previousYearIndex },
      totals: {
        totalActual, totalBudget, totalPrev, totalYtdCur, totalYtdPrev, totalFyCur, totalFyPrev, totalFyBudget,
        totalAmountActual, totalAmountBudget, totalAmountPrev, totalAmountYtdCur, totalAmountYtdPrev, totalAmountFyCur, totalAmountFyPrev, totalAmountFyBudget
      },
      vsBudget, yoy, vsBudgetAmount, yoyAmount,
      runRateInfo, monthsRemaining,
      focusCustomers: withCatchup,
      growthDrivers, underperformers, stable,
      portfolioRemainingMt, portfolioPerMonthMt,
      coveragePct: cum,
      hasPreviousYearData,
      concentrationRisk: {
        level: concentrationRiskLevel,
        customerCount,
        totalCustomers,
        top1Share: top1CustomerShare,
        top3Share: top3CustomerShare,
        top5Share: top5CustomerShare,
        avgVolumePerCustomer,
        customerEfficiency,
        topCustomers: sortedCustomers.slice(0,5),
        trend: concentrationTrend // YoY trend data
      },
      retentionAnalysis,
      comprehensiveInsights: {
        volumeVsSalesPerformance: {
          volumeBudgetVar: vsBudget,
          salesBudgetVar: vsBudgetAmount,
          volumeYoY: yoy,
          salesYoY: yoyAmount,
          avgKiloRate,
          avgKiloRatePrev,
          avgKiloRateBudget,
          kiloRateYoY,
          kiloRateVsBudget
        },
        pvm: { priceEffect, volumeEffect, mixEffect, pvmAvailable },
        customerAnalysis: customerVolumeVsSales,
        topPerformers: { volume: topVolumePerformers, sales: topSalesPerformers, kiloRate: topKiloRatePerformers },
        advantageAnalysis: {
          volumeAdvantage: volumeAdvantageCustomers,
          salesAdvantage: salesAdvantageCustomers,
          outliers
        }
      },
      executiveSummary,
      
      // ====== SALES INTELLIGENCE ENGINE ===================================
      // Customer Archetypes Analysis
      customerArchetypes: withCatchup.map(c => ({
        ...c,
        archetype: classifyCustomerArchetype(c, { totalActual, totalPrev }, hasPreviousYearData)
      })),
      
      // Churn Risk Intelligence
      churnIntelligence: analyzeChurnIntelligence(
        retentionAnalysis,
        withCatchup,
        { totalActual, totalPrev }
      ),
      
      // Concentration Risk Interpretation
      concentrationInterpretation: interpretConcentrationRisk(
        {
          level: concentrationRiskLevel,
          top1Share: top1CustomerShare,
          top3Share: top3CustomerShare,
          top5Share: top5CustomerShare,
          customerCount,
          avgVolumePerCustomer,
          trend: concentrationTrend
        },
        { totalActual, totalPrev },
        hasPreviousYearData
      ),

      // Volume-Weighted Churn Impact Analysis
      churnVolumeImpact: analyzeChurnVolumeImpact(
        lostCustomersArray,
        retainedCustomersArray,
        newCustomersArray,
        { totalActual, totalPrev }
      )
    };
  }, [finalRows, finalAmountRows, columnOrder, basePeriodIndex]);

  // Notify parent of findings
  useEffect(() => {
    if (findings && onFindingsCalculated) {
      onFindingsCalculated(findings);
    }
  }, [findings, onFindingsCalculated]);

  // ============================== RENDER ====================================
  if (!findings) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Customer Key Facts</h3>
        {waitingForTable || waitingForAmountTable ? (
          <div style={styles.insight}>Loading customer data...</div>
        ) : (
          <div style={styles.insight}>No customer rows available for analysis.</div>
        )}
      </div>
    );
  }

  const {
    base, totals, vsBudget, yoy, vsBudgetAmount, yoyAmount, runRateInfo, monthsRemaining,
    focusCustomers, growthDrivers, underperformers, stable,
    portfolioRemainingMt, portfolioPerMonthMt, coveragePct,
    concentrationRisk, retentionAnalysis, hasPreviousYearData, comprehensiveInsights, executiveSummary
  } = findings;

  const kpi = (label, value, accent) => (
    <div style={styles.kpi}>
      <div style={styles.kpiLabel}>{label}</div>
      <div style={{...styles.kpiValue, color: accent || '#111827'}}>{value}</div>
    </div>
  );

  const summaryAccent = (n) => (n == null ? undefined : (n >= 0 ? '#059669' : '#dc2626'));

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Customer Key Facts</h3>

      {/* AI Churn Alerts */}
      <ChurnAlertsList division={selectedDivision} limit={5} />

      {/* Executive Summary */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>📊 Executive Overview</h4>
        <div style={styles.insight}>
          <strong>Period Analysis:</strong> {executiveSummary.periodContext}
          {executiveSummary.comparisons.length > 0 && (
            <><br/>{executiveSummary.comparisons.map((comp, idx) => (
              <span key={idx}>• {comp}<br/></span>
            ))}</>
          )}
          
          <br/><br/>
          <strong>Customer Portfolio:</strong> The customer base demonstrates {concentrationRisk.level === 'CRITICAL' ? '⚠️ critical dependence, with' : concentrationRisk.level === 'HIGH' ? 'significant concentration, with' : 'balanced distribution, with'} the top 3 customers commanding {formatPct(concentrationRisk.top3Share * 100)} of total volume and the top 5 accounting for {formatPct(concentrationRisk.top5Share * 100)}. This reflects {concentrationRisk.level === 'CRITICAL' ? 'a highly concentrated B2B model with inherent vulnerability' : concentrationRisk.level === 'HIGH' ? 'a focused B2B strategy requiring diversification' : 'a well-diversified customer approach'} with {concentrationRisk.customerCount} active customers generating an average of {formatMt(concentrationRisk.avgVolumePerCustomer)} per customer.
          
          {executiveSummary.keyRisks.length > 0 && (
            <><br/><br/><strong>⚠️ Key Risks:</strong> {executiveSummary.keyRisks.join(', ')}</>
          )}
          {executiveSummary.opportunities.length > 0 && (
            <><br/><strong>✨ Opportunities:</strong> {executiveSummary.opportunities.join(', ')}</>
          )}
        </div>
      </div>

      {/* Volume vs Sales & PVM */}
      {comprehensiveInsights.customerAnalysis.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>⚖️ Volume vs Sales Performance</h4>
          <div style={styles.insight}>
            {comprehensiveInsights.pvm.pvmAvailable ? (
              <>
                <strong>Price-Volume Analysis:</strong><br/>
                • Price Effect: {formatPct(comprehensiveInsights.pvm.priceEffect)}<br/>
                • Volume Effect: {formatPct(comprehensiveInsights.pvm.volumeEffect)}<br/>
                • Portfolio Kilo Rate: <CurrencySymbol />{formatAED(comprehensiveInsights.volumeVsSalesPerformance.avgKiloRate)}/MT
                ({hasPreviousYearData && comprehensiveInsights.volumeVsSalesPerformance.kiloRateYoY !== null ? `${formatPct(comprehensiveInsights.volumeVsSalesPerformance.kiloRateYoY)} YoY` : 'Budget comparison only'})
              </>
            ) : (
              <>
                <strong>Price-Volume Analysis:</strong><br/>
                • Portfolio Kilo Rate: <CurrencySymbol />{formatAED(comprehensiveInsights.volumeVsSalesPerformance.avgKiloRate)}/MT<br/>
                • Full Analysis: Requires previous year data for YoY comparison
              </>
            )}
          </div>
          
          {comprehensiveInsights.advantageAnalysis.volumeAdvantage.length > 0 && (
            <div style={styles.insight}>
              <strong>Volume Advantage (Volume outperforming Sales):</strong><br/>
              {comprehensiveInsights.advantageAnalysis.volumeAdvantage.map((c, idx) => {
                const volumeShare = totals.totalActual > 0 ? ((c.volumeActual / totals.totalActual) * 100) : 0;
                const volumeMT = (c.volumeActual || 0) / 1000;
                return (
                  <div key={idx} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '4px' }}>
                    • {formatCustomerName(c.name)}: Vol {formatPct(c.volumeVsBudget)} vs Sales {formatPct(c.amountVsBudget)} ({formatPct(c.volumeVsBudget - c.amountVsBudget)} gap) [{volumeShare.toFixed(1)}% share, {volumeMT.toFixed(0)}MT]
                  </div>
                );
              })}
            </div>
          )}
          
          {comprehensiveInsights.advantageAnalysis.salesAdvantage.length > 0 && (
            <div style={styles.insight}>
              <strong>Sales Advantage (Sales outperforming Volume):</strong><br/>
              {comprehensiveInsights.advantageAnalysis.salesAdvantage.map((c, idx) => {
                const volumeShare = totals.totalActual > 0 ? ((c.volumeActual / totals.totalActual) * 100) : 0;
                const volumeMT = (c.volumeActual || 0) / 1000;
                return (
                  <div key={idx} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '4px' }}>
                    • {formatCustomerName(c.name)}: Sales {formatPct(c.amountVsBudget)} vs Vol {formatPct(c.volumeVsBudget)} ({formatPct(c.amountVsBudget - c.volumeVsBudget)} premium) [{volumeShare.toFixed(1)}% share, {volumeMT.toFixed(0)}MT]
                  </div>
                );
              })}
            </div>
          )}
          
          {comprehensiveInsights.advantageAnalysis.volumeAdvantage.length === 0 && comprehensiveInsights.advantageAnalysis.salesAdvantage.length === 0 && (
            <div style={styles.insight}>
              <em style={{color: '#666'}}>No customers meet materiality thresholds for advantage analysis (≥2% volume share, ≥10MT volume, ≥10% performance gap)</em>
            </div>
          )}
        </div>
      )}

      {/* Multi-Period Trend Analysis */}
      {hasPreviousYearData && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>📈 Multi-Period Trend Analysis</h4>
          <div style={styles.insight}>
            <strong>Year-over-Year Performance Trends:</strong><br/>
            • Volume Growth: {formatPct(yoy)} YoY<br/>
            • Sales Growth: {formatPct(yoyAmount)} YoY<br/>
            • Price Realization: {formatPct(comprehensiveInsights.volumeVsSalesPerformance.kiloRateYoY)} YoY<br/>
            {comprehensiveInsights.advantageAnalysis.outliers.length > 0 && (
              <>
                <br/><strong>Anomaly Detection (Statistical Outliers):</strong><br/>
                {comprehensiveInsights.advantageAnalysis.outliers.map((o, idx) => (
                  <div key={idx} style={{ pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '4px' }}>
                    • {formatCustomerName(o.name)}: {formatPct(o.yoyRate)} YoY (Z-score: {o.zScore.toFixed(1)}) {o.badge && <span style={{marginLeft: 4}}>{o.badge}</span>}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Top Contributors */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>🏆 Top Contributors</h4>
        <div style={styles.dual}>
          <div>
            <strong>By Volume:</strong>
            {comprehensiveInsights.topPerformers.volume.map((c, i) => (
              <div key={c.name} style={styles.topCustomerItem}>
                <div style={styles.customerRank}>{i + 1}</div>
                <div style={{flex: 1}}>
                  <div style={styles.customerNameSmall}>{formatCustomerName(c.name)}</div>
                  {c.yoy !== null && hasPreviousYearData && (
                    <div style={{fontSize: 11, color: '#6b7280', marginTop: 2}}>
                      {c.trendIcon} {formatPct(c.yoy)} YoY
                    </div>
                  )}
                </div>
                <div style={styles.customerVolume}>{formatMt(c.volume)}</div>
                <div style={styles.customerShare}>{formatPct(c.share)}</div>
              </div>
            ))}
          </div>
          <div>
            <strong>By Sales:</strong>
            {comprehensiveInsights.topPerformers.sales.map((c, i) => (
              <div key={c.name} style={styles.topCustomerItem}>
                <div style={styles.customerRank}>{i + 1}</div>
                <div style={{flex: 1}}>
                  <div style={styles.customerNameSmall}>{formatCustomerName(c.name)}</div>
                  {c.yoy !== null && hasPreviousYearData && (
                    <div style={{fontSize: 11, color: '#6b7280', marginTop: 2}}>
                      {c.trendIcon} {formatPct(c.yoy)} YoY
                    </div>
                  )}
                </div>
                <div style={styles.customerVolume}>{formatAmountString(c.amount)}</div>
                <div style={styles.customerShare}>{formatPct(c.share)}</div>
              </div>
            ))}
          </div>
        </div>
        
        {comprehensiveInsights.topPerformers.kiloRate.length > 0 && (
          <div style={styles.insight}>
            <strong>Highest Kilo Rates (Min 1% volume share):</strong><br/>
            {comprehensiveInsights.topPerformers.kiloRate.map((c, index) => (
              <React.Fragment key={c.name}>
                {index > 0 && <br/>}
                • {formatCustomerName(c.name)}: <CurrencySymbol />{formatAED(c.kiloRate)}/MT ({formatMt(c.volume)})
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Concentration Risk Analysis */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>🎯 Concentration Risk Analysis</h4>
        <div style={styles.concentrationGrid}>
          <div style={styles.concentrationMetric}>
            <div style={styles.metricLabel}>Risk Level</div>
            <div style={styles.metricValue}>{concentrationRisk.level}</div>
          </div>
          <div style={styles.concentrationMetric}>
            <div style={styles.metricLabel}>Top Customer</div>
            <div style={styles.metricValue}>{formatPct(concentrationRisk.top1Share * 100)}</div>
          </div>
          <div style={styles.concentrationMetric}>
            <div style={styles.metricLabel}>
              Top 3 Share {concentrationRisk.trend && <span style={{fontSize: 12}}>{concentrationRisk.trend.directionIcon}</span>}
            </div>
            <div style={styles.metricValue}>
              {formatPct(concentrationRisk.top3Share * 100)}
              {concentrationRisk.trend && (
                <div style={{fontSize: 12, color: concentrationRisk.trend.top3Change > 0 ? '#dc2626' : '#059669', marginTop: 2}}>
                  ({concentrationRisk.trend.top3Change > 0 ? '+' : ''}{formatPct(concentrationRisk.trend.top3Change * 100)} YoY)
                </div>
              )}
            </div>
          </div>
          <div style={styles.concentrationMetric}>
            <div style={styles.metricLabel}>
              Active Customers {concentrationRisk.trend && concentrationRisk.trend.customerCountChange !== 0 && <span style={{fontSize: 12}}>{concentrationRisk.trend.customerCountChange > 0 ? '📈' : '📉'}</span>}
            </div>
            <div style={styles.metricValue}>
              {concentrationRisk.customerCount}
              {concentrationRisk.trend && concentrationRisk.trend.customerCountChange !== 0 && (
                <div style={{fontSize: 12, color: '#6b7280', marginTop: 2}}>
                  ({concentrationRisk.trend.customerCountChange > 0 ? '+' : ''}{concentrationRisk.trend.customerCountChange} YoY)
                </div>
              )}
            </div>
          </div>
        </div>
        <div style={styles.insight}>
          <strong>Top 5 Customers by Volume:</strong><br/>
          {concentrationRisk.topCustomers.map((c, i) => (
            <div key={i}>
              {i + 1}. {formatCustomerName(c.name)}: {formatMt(c.volume)} ({formatPct(c.share * 100)})
            </div>
          ))}
        </div>
      </div>

      {/* Customer Retention Analysis */}
      {hasPreviousYearData && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🔄 Customer Retention Analysis</h4>
          <div style={styles.retentionGrid}>
            <div style={styles.retentionMetric}><div style={styles.metricLabel}>Retention Rate</div><div style={styles.metricValue}>{formatPct(retentionAnalysis.retentionRate * 100)}</div></div>
            <div style={styles.retentionMetric}><div style={styles.metricLabel}>Lost Customers Rate</div><div style={styles.metricValue}>{formatPct(retentionAnalysis.churnRate * 100)}</div></div>
            <div style={styles.retentionMetric}><div style={styles.metricLabel}>Lost Customers</div><div style={styles.metricValue}>{retentionAnalysis.lostCustomers}</div></div>
            <div style={styles.retentionMetric}><div style={styles.metricLabel}>New Customers</div><div style={styles.metricValue}>{retentionAnalysis.newCustomers}</div></div>
            <div style={styles.retentionMetric}><div style={styles.metricLabel}>Recurring Customers</div><div style={styles.metricValue}>{retentionAnalysis.retainedCustomers}</div></div>
            {retentionAnalysis.decliningCustomers > 0 && (
              <div style={{...styles.retentionMetric, gridColumn: 'span 2'}}>
                <div style={styles.metricLabel}>⚠️ At Risk (Declining 30-90%)</div>
                <div style={{...styles.metricValue, color: '#f59e0b'}}>{retentionAnalysis.decliningCustomers}</div>
              </div>
            )}
          </div>
          {retentionAnalysis.decliningCustomers > 0 && retentionAnalysis.decliningCustomerNames.length > 0 && (
            <div style={{...styles.insight, borderLeftColor: '#f59e0b', background: '#fffbeb', color: '#92400e'}}>
              <strong>⚠️ Declining Customers (Intervention Needed):</strong><br/>
              {retentionAnalysis.decliningCustomerNames.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Growth / Risk */}
      {(growthDrivers.length > 0 || underperformers.length > 0 || stable.length > 0) && (
        <div style={styles.performanceGrid}>
          {growthDrivers.length > 0 && (
            <div style={styles.growthDriversCard}>
              <div style={styles.cardHeader}>
                <div style={styles.growthIcon}>🚀</div>
                <h4 style={styles.growthTitle}>Growth Drivers</h4>
                <div style={styles.growthBadge}>{growthDrivers.length}</div>
              </div>
              <div style={styles.performanceList}>
                {growthDrivers.map((c, index) => (
                  <div key={c.name} style={styles.growthItem}>
                    <div style={styles.performanceRank}>{index + 1}</div>
                    <div style={styles.performanceContent}>
                      <div style={styles.customerNameBold}>{c.name}</div>
                      <div style={styles.performanceMetrics}>
                        <span style={styles.volumeMetric}>{formatMt(c.actual)}</span>
                        {c.vsBudget != null && (
                          <span style={c.vsBudget === Infinity ? styles.newBadgeMetric : styles.budgetMetric}>
                            {formatBudgetVariance(c.vsBudget, c.actual > 0)}
                          </span>
                        )}
                        {hasPreviousYearData && c.yoy != null && (
                          <span style={c.yoy === Infinity ? styles.newBadgeMetric : styles.yoyMetric}>
                            {formatYoYVariance(c.yoy, c.actual > 0)}
                          </span>
                        )}
                        {!hasPreviousYearData && (
                          <span style={styles.noDataMetric} title="Year-over-year comparison unavailable - analyzing budget performance only">
                            Budget comparison
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={styles.trendIndicator}>📈</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {underperformers.length > 0 && (
            <div style={styles.underperformersCard}>
              <div style={styles.cardHeader}>
                <div style={styles.warningIcon}>⚠️</div>
                <h4 style={styles.underperformersTitle}>Underperformers</h4>
                <div style={styles.warningBadge}>{underperformers.length}</div>
              </div>
              <div style={styles.performanceList}>
                {underperformers.map((c, index) => (
                  <div key={c.name} style={styles.underperformerItem}>
                    <div style={styles.performanceRank}>{index + 1}</div>
                    <div style={styles.performanceContent}>
                      <div style={styles.customerNameBold}>{c.name}</div>
                      <div style={styles.performanceMetrics}>
                        <span style={styles.volumeMetric}>{formatMt(c.actual)}</span>
                        {c.vsBudget != null && (
                          <span style={c.vsBudget === Infinity ? styles.newBadgeMetric : styles.budgetMetricNegative}>
                            {formatBudgetVariance(c.vsBudget, c.actual > 0)}
                          </span>
                        )}
                        {hasPreviousYearData && c.yoy != null && (
                          <span style={c.yoy === Infinity ? styles.newBadgeMetric : styles.yoyMetricNegative}>
                            {formatYoYVariance(c.yoy, c.actual > 0)}
                          </span>
                        )}
                        {!hasPreviousYearData && (
                          <span style={styles.noDataMetric} title="Year-over-year comparison unavailable - analyzing budget performance only">
                            Budget comparison
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={styles.trendIndicator}>📉</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Strategic Priorities - Prioritized */}
      <div style={styles.section}>
        <h4 style={styles.sectionTitle}>🎯 Strategic Priorities</h4>
        <div style={styles.recommendations}>
          {!runRateInfo.isOnTrack && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #dc2626', background: '#fef2f2'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#dc2626', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>CRITICAL</span>
                <strong style={{color: '#dc2626'}}>Priority 1: Accelerate Performance</strong>
              </div>
              Need {formatMt(runRateInfo.catchUpRequired)}/month to meet FY target
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: HIGH | Effort: HIGH</div>
            </div>
          )}
          {retentionAnalysis.decliningCustomers > 0 && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #f59e0b', background: '#fffbeb'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#f59e0b', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>HIGH</span>
                <strong style={{color: '#f59e0b'}}>Priority 2: Prevent Customer Loss</strong>
              </div>
              {retentionAnalysis.decliningCustomers} customers declining significantly (30-90%) - intervention required
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: HIGH | Effort: MEDIUM</div>
            </div>
          )}
          {(concentrationRisk.level === 'HIGH' || concentrationRisk.level === 'CRITICAL') && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #f59e0b', background: '#fffbeb'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#f59e0b', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>HIGH</span>
                <strong style={{color: '#f59e0b'}}>Priority {retentionAnalysis.decliningCustomers > 0 ? '3' : '2'}: Diversify Portfolio</strong>
              </div>
              {concentrationRisk.level} concentration risk ({formatPct(concentrationRisk.top3Share * 100)} in top 3) - develop smaller customers
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: MEDIUM | Effort: HIGH</div>
            </div>
          )}
          {hasPreviousYearData && retentionAnalysis.churnRate > 0.2 && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #3b82f6'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#3b82f6', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>MEDIUM</span>
                <strong style={{color: '#3b82f6'}}>Improve Retention Rate</strong>
              </div>
              {formatPct(retentionAnalysis.churnRate * 100)} lost customers rate needs attention
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: MEDIUM | Effort: MEDIUM</div>
            </div>
          )}
          {comprehensiveInsights.advantageAnalysis.volumeAdvantage.length > 0 && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #3b82f6'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#3b82f6', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>MEDIUM</span>
                <strong style={{color: '#3b82f6'}}>Price Optimization Opportunity</strong>
              </div>
              {comprehensiveInsights.advantageAnalysis.volumeAdvantage.length} customers show volume-sales gaps - review pricing strategy
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: MEDIUM | Effort: LOW</div>
            </div>
          )}
          {comprehensiveInsights.advantageAnalysis.salesAdvantage.length > 0 && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #059669'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#059669', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>OPPORTUNITY</span>
                <strong style={{color: '#059669'}}>Premium Pricing Strategy</strong>
              </div>
              {comprehensiveInsights.advantageAnalysis.salesAdvantage.length} customers demonstrate strong pricing power - maintain premium positioning
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: LOW | Effort: LOW</div>
            </div>
          )}
          {growthDrivers.length > 0 && (
            <div style={{...styles.recommendation, borderLeft: '4px solid #059669'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4}}>
                <span style={{background: '#059669', color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 'bold'}}>OPPORTUNITY</span>
                <strong style={{color: '#059669'}}>Leverage Growth Drivers</strong>
              </div>
              {growthDrivers.length} high-performing customers - allocate resources for further expansion
              <div style={{fontSize: 12, color: '#6b7280', marginTop: 4}}>Impact: MEDIUM | Effort: MEDIUM</div>
            </div>
          )}
        </div>
      </div>

      {/* ====== SALES INTELLIGENCE ENGINE SECTIONS ====== */}
      
      {/* Customer Growth Archetypes */}
      {findings.customerArchetypes && findings.customerArchetypes.length > 0 && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>👥 Customer Growth Archetypes</h4>
          
          {/* Archetype Summary */}
          {(() => {
            const coreGrowth = findings.customerArchetypes.filter(c => c.archetype?.archetype === 'CORE_GROWTH');
            const momentum = findings.customerArchetypes.filter(c => c.archetype?.archetype === 'MOMENTUM');
            const drifting = findings.customerArchetypes.filter(c => c.archetype?.archetype === 'DRIFTING');
            const lostRisk = findings.customerArchetypes.filter(c => c.archetype?.archetype === 'LOST_RISK');
            const stable = findings.customerArchetypes.filter(c => c.archetype?.archetype === 'STABLE');
            const newAccounts = findings.customerArchetypes.filter(c => c.archetype?.archetype === 'NEW');
            
            return (
              <>
                <div style={{...styles.insight, background: '#f0fdf4', borderLeft: '3px solid #059669'}}>
                  <strong>Customer Portfolio Profile:</strong><br/>
                  ⭐ <strong>{coreGrowth.length}</strong> Core Growth (protect & expand) • 
                  🚀 <strong>{momentum.length}</strong> Momentum (invest for scale) • 
                  📉 <strong>{drifting.length}</strong> Drifting (intervention needed) • 
                  🔴 <strong>{lostRisk.length}</strong> Lost Risk (retention emergency) • 
                  ✓ <strong>{stable.length}</strong> Stable • 
                  🆕 <strong>{newAccounts.length}</strong> New
                </div>
                
                {/* Show critical archetypes requiring attention */}
                {[...lostRisk.slice(0, 2), ...drifting.slice(0, 2), ...coreGrowth.slice(0, 1)].filter(Boolean).map((customer, idx) => (
                  <div key={idx} style={{
                    padding: '12px 16px',
                    background: '#f8fafc',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    borderLeft: `4px solid ${customer.archetype?.archetypeColor || '#6b7280'}`
                  }}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
                      <span style={{fontSize: '18px'}}>{customer.archetype?.archetypeIcon}</span>
                      <strong style={{fontSize: '15px'}}>{formatCustomerName(customer.name)}</strong>
                      <span style={{
                        background: customer.archetype?.archetypeColor || '#6b7280',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600'
                      }}>
                        {customer.archetype?.archetype?.replace('_', ' ')}
                      </span>
                      <span style={{
                        background: customer.archetype?.priority === 'CRITICAL' ? '#dc2626' : 
                                   customer.archetype?.priority === 'URGENT' ? '#f59e0b' : 
                                   customer.archetype?.priority === 'HIGH' ? '#3b82f6' : '#6b7280',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '600'
                      }}>
                        {customer.archetype?.priority}
                      </span>
                    </div>
                    <div style={{fontSize: '14px', color: '#374151', marginBottom: '6px'}}>
                      {customer.archetype?.explanation}
                    </div>
                    <div style={{fontSize: '13px', color: '#059669', fontWeight: '500'}}>
                      📋 {customer.archetype?.actionRequired}
                    </div>
                  </div>
                ))}
              </>
            );
          })()}
        </div>
      )}

      {/* Churn Risk Intelligence */}
      {findings.churnIntelligence && hasPreviousYearData && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🔄 Churn Risk Intelligence</h4>
          
          <div style={{
            ...styles.insight, 
            background: findings.churnIntelligence.churnSeverity === 'CRITICAL' ? '#fef2f2' : 
                        findings.churnIntelligence.churnSeverity === 'HIGH' ? '#fff7ed' : '#f0fdf4',
            borderLeft: `3px solid ${findings.churnIntelligence.churnSeverityColor || '#059669'}`
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px'}}>
              <span style={{
                background: findings.churnIntelligence.churnSeverityColor || '#6b7280',
                color: 'white',
                padding: '2px 10px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {findings.churnIntelligence.churnSeverity} SEVERITY
              </span>
              <span style={{fontSize: '14px', color: '#374151'}}>
                Churn Type: <strong>{findings.churnIntelligence.churnType?.replace('_', ' ')}</strong>
              </span>
            </div>
            <div style={{fontSize: '14px', color: '#374151', marginBottom: '8px'}}>
              {findings.churnIntelligence.churnInsight}
            </div>
            <div style={{fontSize: '13px', color: '#6b7280'}}>
              <strong>Retention Health:</strong> {findings.churnIntelligence.retentionHealth} | 
              <strong> Net Customer Change:</strong> {findings.churnIntelligence.netCustomerChange >= 0 ? '+' : ''}{findings.churnIntelligence.netCustomerChange}
            </div>
          </div>
          
          {findings.churnIntelligence.atRiskCount > 0 && (
            <div style={{...styles.insight, background: '#fef3c7', borderLeft: '3px solid #f59e0b'}}>
              <strong>⚠️ At-Risk Customers ({findings.churnIntelligence.atRiskCount}):</strong><br/>
              {findings.churnIntelligence.atRiskNames?.slice(0, 5).join(', ')}
              {findings.churnIntelligence.atRiskNames?.length > 5 && ` and ${findings.churnIntelligence.atRiskNames.length - 5} more`}
            </div>
          )}
          
          {findings.churnIntelligence.recommendations?.length > 0 && (
            <div style={styles.insight}>
              <strong>📋 Recommended Actions:</strong>
              {findings.churnIntelligence.recommendations.map((rec, idx) => (
                <div key={idx} style={{marginTop: '6px'}}>• {rec}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Volume-Weighted Churn Impact - Sales Director View */}
      {findings.churnVolumeImpact && (findings.churnVolumeImpact.lostVolumeMT > 0 || findings.churnVolumeImpact.newVolumeMT > 0) && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>📊 Volume-Weighted Churn Impact (Sales Director View)</h4>
          
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px'}}>
            <div style={{background: '#fef2f2', padding: '14px', borderRadius: '8px', textAlign: 'center', borderLeft: '3px solid #dc2626'}}>
              <div style={{fontSize: '12px', color: '#991b1b', marginBottom: '4px'}}>Volume Lost</div>
              <div style={{fontSize: '20px', fontWeight: '700', color: '#dc2626'}}>
                {findings.churnVolumeImpact.lostVolumeMT?.toFixed(0)} MT
              </div>
              <div style={{fontSize: '12px', color: '#991b1b'}}>
                ({findings.churnVolumeImpact.lostVolumeShare?.toFixed(1)}% of prior base)
              </div>
            </div>
            <div style={{background: '#f0fdf4', padding: '14px', borderRadius: '8px', textAlign: 'center', borderLeft: '3px solid #059669'}}>
              <div style={{fontSize: '12px', color: '#065f46', marginBottom: '4px'}}>Volume Gained</div>
              <div style={{fontSize: '20px', fontWeight: '700', color: '#059669'}}>
                {findings.churnVolumeImpact.newVolumeMT?.toFixed(0)} MT
              </div>
              <div style={{fontSize: '12px', color: '#065f46'}}>
                ({findings.churnVolumeImpact.newVolumeShare?.toFixed(1)}% of current base)
              </div>
            </div>
            <div style={{
              background: findings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '#f0fdf4' : '#fef2f2', 
              padding: '14px', borderRadius: '8px', textAlign: 'center', 
              borderLeft: `3px solid ${findings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '#059669' : '#dc2626'}`
            }}>
              <div style={{fontSize: '12px', color: '#374151', marginBottom: '4px'}}>Net Impact</div>
              <div style={{fontSize: '20px', fontWeight: '700', color: findings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '#059669' : '#dc2626'}}>
                {findings.churnVolumeImpact.netVolumeImpactMT >= 0 ? '+' : ''}{findings.churnVolumeImpact.netVolumeImpactMT?.toFixed(0)} MT
              </div>
              <div style={{fontSize: '12px', color: '#374151'}}>
                ({findings.churnVolumeImpact.customerCountImpact?.net >= 0 ? '+' : ''}{findings.churnVolumeImpact.customerCountImpact?.net} customers)
              </div>
            </div>
          </div>

          <div style={{
            ...styles.insight,
            background: findings.churnVolumeImpact.volumeChurnSeverity === 'CRITICAL' ? '#fef2f2' : 
                        findings.churnVolumeImpact.volumeChurnSeverity === 'HIGH' ? '#fff7ed' : '#f0fdf4',
            borderLeft: `3px solid ${findings.churnVolumeImpact.volumeChurnSeverityColor || '#059669'}`
          }}>
            <span style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: '600',
              background: findings.churnVolumeImpact.volumeChurnSeverityColor || '#6b7280',
              color: 'white',
              marginRight: '8px'
            }}>
              {findings.churnVolumeImpact.volumeChurnSeverity}
            </span>
            <strong>Churn Type: {findings.churnVolumeImpact.volumeChurnType?.replace(/_/g, ' ')}</strong>
            <div style={{marginTop: '8px', fontStyle: 'italic'}}>
              {findings.churnVolumeImpact.salesDirectorTakeaway}
            </div>
          </div>

          {findings.churnVolumeImpact.whaleLosses?.length > 0 && (
            <div style={{...styles.insight, background: '#fef2f2', borderLeft: '3px solid #dc2626'}}>
              <strong>🐋 Whale Losses (major accounts lost):</strong>
              {findings.churnVolumeImpact.whaleLosses.map((w, idx) => (
                <div key={idx} style={{marginTop: '6px'}}>
                  • <strong>{w.name}</strong>: {w.lostVolumeMT?.toFixed(0)} MT lost ({w.portfolioShare?.toFixed(1)}% of prior base)
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Concentration Risk Interpretation */}
      {findings.concentrationInterpretation && (
        <div style={styles.section}>
          <h4 style={styles.sectionTitle}>🎯 Concentration Risk Interpretation</h4>
          
          <div style={{display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px'}}>
            <div style={{background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', borderLeft: `3px solid ${findings.concentrationInterpretation.stabilityRiskColor || '#6b7280'}`}}>
              <div style={{fontSize: '12px', color: '#6b7280', marginBottom: '4px'}}>Stability Risk</div>
              <div style={{fontSize: '16px', fontWeight: '700', color: findings.concentrationInterpretation.stabilityRiskColor || '#374151'}}>
                {findings.concentrationInterpretation.stabilityRisk}
              </div>
            </div>
            <div style={{background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', borderLeft: `3px solid ${findings.concentrationInterpretation.dependencyColor || '#6b7280'}`}}>
              <div style={{fontSize: '12px', color: '#6b7280', marginBottom: '4px'}}>Dependency Exposure</div>
              <div style={{fontSize: '16px', fontWeight: '700', color: findings.concentrationInterpretation.dependencyColor || '#374151'}}>
                {findings.concentrationInterpretation.dependencyExposure}
              </div>
            </div>
            <div style={{background: '#f8fafc', padding: '12px', borderRadius: '8px', textAlign: 'center', borderLeft: `3px solid ${findings.concentrationInterpretation.growthColor || '#6b7280'}`}}>
              <div style={{fontSize: '12px', color: '#6b7280', marginBottom: '4px'}}>Growth Vulnerability</div>
              <div style={{fontSize: '16px', fontWeight: '700', color: findings.concentrationInterpretation.growthColor || '#374151'}}>
                {findings.concentrationInterpretation.growthVulnerability}
              </div>
            </div>
          </div>
          
          {findings.concentrationInterpretation.insights?.length > 0 && (
            <div style={styles.insight}>
              <strong>Risk Analysis:</strong>
              {findings.concentrationInterpretation.insights.map((insight, idx) => (
                <div key={idx} style={{marginTop: '6px'}}>• {insight}</div>
              ))}
            </div>
          )}
          
          <div style={{...styles.insight, background: '#eff6ff', borderLeft: '3px solid #3b82f6'}}>
            <strong>Strategic Interpretation:</strong><br/>
            {findings.concentrationInterpretation.strategicInterpretation}
          </div>
          
          <div style={{...styles.insight, background: '#f0fdf4', borderLeft: '3px solid #059669'}}>
            <strong>📋 Recommendation:</strong> {findings.concentrationInterpretation.recommendation}
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    borderRadius: 12,
    padding: 24,
    margin: '20px 0',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    border: '1px solid #e2e8f0',
    pageBreakInside: 'avoid',
    breakInside: 'avoid'
  },
  title: {
    color: '#1e293b',
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 24,
    textAlign: 'center',
    background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  summary: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginBottom: 16 },
  kpi: { background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, boxShadow: '0 1px 2px rgba(0,0,0,0.04)' },
  kpiLabel: { fontSize: 12, color: '#6b7280' },
  kpiValue: { fontSize: 18, fontWeight: 700 },
  section: { background: '#ffffff', borderRadius: 12, padding: 18, marginBottom: 18, borderLeft: '4px solid #3b82f6', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', transition: 'box-shadow 0.3s ease', pageBreakInside: 'avoid', breakInside: 'avoid' },
  sectionTitle: { color: '#1e40af', fontSize: 18, fontWeight: 600, marginBottom: 10, textAlign: 'left' },
  insight: { 
    padding: '14px 18px', 
    background: '#eff6ff', 
    borderRadius: 10, 
    marginBottom: 14, 
    fontSize: 15, 
    lineHeight: 1.7, 
    color: '#1e40af', 
    borderLeft: '4px solid #3b82f6', 
    boxShadow: '0 1px 3px rgba(59, 130, 246, 0.1)',
    textAlign: 'left',
    pageBreakInside: 'avoid', 
    breakInside: 'avoid', 
    pageBreakAfter: 'auto',
    orphans: 3,
    widows: 3
  },
  code: { display: 'block', background: '#0f172a', color: '#e2e8f0', padding: 8, borderRadius: 6, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  dual: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12, pageBreakInside: 'avoid', breakInside: 'avoid' },
  hiliteGreen: { borderLeft: '4px solid #059669' },
  hiliteRed: { borderLeft: '4px solid #dc2626' },
  bullet: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#f8fafc', borderRadius: 8, marginBottom: 8 },
  dot: { width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' },
  card: { padding: 16, background: '#f8fafc', borderRadius: 12, marginBottom: 12, border: '1px solid #e5e7eb', boxShadow: '0 2px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)', transition: 'transform 0.2s ease, box-shadow 0.2s ease' },
  cardHeaderSimple: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
  rank: { width: 28, height: 28, borderRadius: 6, background: '#1e40af', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 },
  customerName: { fontWeight: 700, fontSize: 16, color: '#1f2937', textAlign: 'left' },
   cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10 },
   recommendations: { display: 'grid', gap: 8 },
   recommendation: { background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', padding: 10, borderRadius: 8, fontSize: 14, textAlign: 'left' },
   concentrationGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginBottom: 16 },
   concentrationMetric: { background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' },
   metricLabel: { fontSize: 12, color: '#6b7280', marginBottom: 4, fontWeight: 500 },
   metricValue: { fontSize: 16, fontWeight: 700, color: '#1f2937' },
   topCustomerItem: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, marginBottom: 6, border: '1px solid #e5e7eb', pageBreakInside: 'avoid', breakInside: 'avoid' },
   customerRank: { width: 24, height: 24, borderRadius: 4, background: '#3b82f6', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600 },
   customerNameSmall: { flex: 1, fontWeight: 600, fontSize: 14, color: '#1f2937' },
   customerVolume: { fontWeight: 600, fontSize: 14, color: '#374151' },
   customerShare: { fontWeight: 700, fontSize: 14, color: '#3b82f6', minWidth: 60, textAlign: 'right' },
   retentionGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12, marginTop: 12 },
   retentionMetric: { background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, textAlign: 'center' },
   
   // Enhanced Performance Grid Styles
   performanceGrid: { 
     display: 'grid', 
     gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', 
     gap: 20, 
     marginBottom: 20,
     pageBreakInside: 'avoid',
     breakInside: 'avoid'
   },
   
   // Growth Drivers Card
   growthDriversCard: {
     background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
     borderRadius: 16,
     padding: 20,
     border: '2px solid #10b981',
     boxShadow: '0 8px 25px rgba(16, 185, 129, 0.15)',
     transition: 'all 0.3s ease',
     position: 'relative',
     overflow: 'hidden',
     pageBreakInside: 'avoid',
     breakInside: 'avoid'
   },
   
   // Underperformers Card
   underperformersCard: {
     background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
     borderRadius: 16,
     padding: 20,
     border: '2px solid #ef4444',
     boxShadow: '0 8px 25px rgba(239, 68, 68, 0.15)',
     transition: 'all 0.3s ease',
     position: 'relative',
     overflow: 'hidden',
     pageBreakInside: 'avoid',
     breakInside: 'avoid'
   },
   
   // Card Headers
    cardHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16
    },
    
    growthIcon: {
     fontSize: 24,
     background: 'linear-gradient(135deg, #10b981, #059669)',
     borderRadius: 12,
     width: 48,
     height: 48,
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'center',
     boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
   },
   
   warningIcon: {
     fontSize: 24,
     background: 'linear-gradient(135deg, #ef4444, #dc2626)',
     borderRadius: 12,
     width: 48,
     height: 48,
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'center',
     boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)'
   },
   
   growthTitle: {
     color: '#065f46',
     fontSize: 20,
     fontWeight: 700,
     margin: 0,
     flex: 1,
     textTransform: 'uppercase',
     letterSpacing: '0.5px'
   },
   
   underperformersTitle: {
     color: '#991b1b',
     fontSize: 20,
     fontWeight: 700,
     margin: 0,
     flex: 1,
     textTransform: 'uppercase',
     letterSpacing: '0.5px'
   },
   
   growthBadge: {
     background: 'linear-gradient(135deg, #10b981, #059669)',
     color: 'white',
     borderRadius: 20,
     padding: '6px 12px',
     fontSize: 14,
     fontWeight: 700,
     minWidth: 30,
     textAlign: 'center',
     boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
   },
   
   warningBadge: {
     background: 'linear-gradient(135deg, #ef4444, #dc2626)',
     color: 'white',
     borderRadius: 20,
     padding: '6px 12px',
     fontSize: 14,
     fontWeight: 700,
     minWidth: 30,
     textAlign: 'center',
     boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
   },
   
   // Performance List
   performanceList: {
     marginTop: 16,
     display: 'flex',
     flexDirection: 'column',
     gap: 12
   },
   
   // Growth Item
   growthItem: {
     background: 'rgba(255, 255, 255, 0.8)',
     borderRadius: 12,
     padding: 16,
     display: 'flex',
     alignItems: 'center',
     gap: 12,
     border: '1px solid rgba(16, 185, 129, 0.2)',
     transition: 'all 0.2s ease',
     backdropFilter: 'blur(10px)',
     boxShadow: '0 2px 8px rgba(16, 185, 129, 0.1)'
   },
   
   // Underperformer Item
   underperformerItem: {
     background: 'rgba(255, 255, 255, 0.8)',
     borderRadius: 12,
     padding: 16,
     display: 'flex',
     alignItems: 'center',
     gap: 12,
     border: '1px solid rgba(239, 68, 68, 0.2)',
     transition: 'all 0.2s ease',
     backdropFilter: 'blur(10px)',
     boxShadow: '0 2px 8px rgba(239, 68, 68, 0.1)'
   },
   
   // Performance Rank
   performanceRank: {
     background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
     color: 'white',
     borderRadius: 10,
     width: 32,
     height: 32,
     display: 'flex',
     alignItems: 'center',
     justifyContent: 'center',
     fontSize: 14,
     fontWeight: 700,
     boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)',
     flexShrink: 0
   },
   
   // Performance Content
   performanceContent: {
     flex: 1,
     display: 'flex',
     flexDirection: 'column',
     gap: 6
   },
   
   customerNameBold: {
     fontSize: 16,
     fontWeight: 700,
     color: '#1f2937',
     lineHeight: 1.2
   },
   
   performanceMetrics: {
     display: 'flex',
     flexWrap: 'wrap',
     gap: 8,
     alignItems: 'center'
   },
   
   volumeMetric: {
     background: 'linear-gradient(135deg, #f3f4f6, #e5e7eb)',
     color: '#374151',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 600,
     border: '1px solid #d1d5db'
   },
   
   budgetMetric: {
     background: 'linear-gradient(135deg, #dbeafe, #bfdbfe)',
     color: '#1e40af',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 600,
     border: '1px solid #93c5fd'
   },
   
   budgetMetricNegative: {
     background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
     color: '#dc2626',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 600,
     border: '1px solid #f87171'
   },
   
   // New Customer / New to Budget badge style
   newBadgeMetric: {
     background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
     color: '#92400e',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 600,
     border: '1px solid #f59e0b'
   },
   
   yoyMetric: {
     background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)',
     color: '#065f46',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 600,
     border: '1px solid #6ee7b7'
   },
   
   yoyMetricNegative: {
     background: 'linear-gradient(135deg, #fee2e2, #fecaca)',
     color: '#dc2626',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 600,
     border: '1px solid #f87171'
   },
   
   noDataMetric: {
     background: 'linear-gradient(135deg, #f9fafb, #f3f4f6)',
     color: '#6b7280',
     padding: '4px 8px',
     borderRadius: 6,
     fontSize: 12,
     fontWeight: 500,
     border: '1px solid #d1d5db',
     fontStyle: 'italic'
   },
   
   trendIndicator: {
     fontSize: 20,
     flexShrink: 0,
     opacity: 0.7
   }
 };

 CustomerKeyFacts.propTypes = {
   onFindingsCalculated: PropTypes.func
 };

 export default CustomerKeyFacts;