const { pool } = require('./config');
const logger = require('../utils/logger');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');

/**
 * Helper function to extract division code from full division name
 */
function extractDivisionCode(division) {
  if (!division) return 'fp';
  return division.split('-')[0].toLowerCase();
}

/**
 * Helper function to get division-specific table names
 * MIGRATED: Use fp_actualcommon for FP division (same pattern as GeographicDistributionService)
 */
function getTableNames(division) {
  const code = extractDivisionCode(division);
  // Use actualcommon tables for all divisions - following 'avoid views' architecture
  return {
    actualData: `${code}_actualcommon`,  // MIGRATED: was dataExcel/_data_excel
    divisionMergeRules: `${code}_division_customer_merge_rules`,
    // Column mappings for actualcommon tables
    customerColumn: 'customer_name',
    amountColumn: 'amount',
    yearColumn: 'year',
    monthColumn: 'month_no'
  };
}

class CustomerInsightsService {
  constructor() {
    this.pool = pool;
  }

  /**
   * Get the correct database pool for a division
   */
  getPoolForDivision(division) {
    const divisionCode = extractDivisionCode(division);
    return getDivisionPool(divisionCode.toUpperCase());
  }

  /**
   * Get division-wide customer insights with merge rules applied
   * Returns top customer metrics for the entire division
   */
  async getCustomerInsights(division, year, months, dataType = 'Actual') {
    try {
      logger.info(`🔍 Getting customer insights for division: ${division}, year: ${year}, months: [${months.join(', ')}], type: ${dataType}`);
      
      // Step 1: Get all customers with their sales values (aggregated across all sales reps)
      const customerData = await this.getRawCustomerData(division, year, months, dataType);
      logger.info(`📊 Retrieved ${customerData.length} raw customer records`);
      
      // Step 2: Get division-wide merge rules from division_customer_merge_rules table
      const allMergeRules = await this.getDivisionMergeRules(division);
      logger.info(`📋 Retrieved ${allMergeRules.length} division-wide merge rules`);
      
      // Step 3: Apply division-wide merge rules to all customers
      const mergedCustomers = this.applyDivisionMergeRules(customerData, allMergeRules);
      logger.info(`✅ After merging: ${mergedCustomers.length} unique customers`);
      
      // Step 4: Calculate insights metrics (top 20 is calculated AFTER merging)
      const insights = this.calculateInsights(mergedCustomers);
      logger.info(`✅ Customer insights calculated:`, {
        totalCustomers: insights.totalCustomers,
        topCustomer: insights.topCustomer,
        top3Customer: insights.top3Customer,
        top5Customer: insights.top5Customer
      });
      
      // Step 5: Get previous year data for YoY comparison
      const previousYear = parseInt(year) - 1;
      try {
        const prevCustomerData = await this.getRawCustomerData(division, previousYear, months, dataType);
        const prevMergedCustomers = this.applyDivisionMergeRules(prevCustomerData, allMergeRules);
        const prevInsights = this.calculateInsights(prevMergedCustomers);
        
        insights.avgSalesPerCustomerPrev = prevInsights.avgSalesPerCustomer;
        insights.totalCustomersPrev = prevInsights.totalCustomers;
        insights.totalSalesPrev = prevInsights.totalSales;
        
        logger.info(`✅ Previous year (${previousYear}) insights:`, {
          totalCustomersPrev: insights.totalCustomersPrev,
          avgSalesPerCustomerPrev: insights.avgSalesPerCustomerPrev
        });
      } catch (prevError) {
        logger.warn(`⚠️ Could not fetch previous year data: ${prevError.message}`);
        insights.avgSalesPerCustomerPrev = 0;
        insights.totalCustomersPrev = 0;
        insights.totalSalesPrev = 0;
      }
      
      return insights;
    } catch (error) {
      logger.error('❌ Error getting customer insights:', error);
      throw error;
    }
  }

  /**
   * Get raw customer data aggregated by customer name (summing across all sales reps)
   * This gives us the total sales per customer for the division
   * MIGRATED: Uses fp_actualcommon directly with 'amount' column (same as GeographicDistributionService)
   * IMPORTANT: Excludes product groups from fp_product_group_exclusions table
   */
  async getRawCustomerData(division, year, months, dataType) {
    try {
      const tables = getTableNames(division);
      const tableName = tables.actualData;
      const customerColumn = tables.customerColumn;
      const amountColumn = tables.amountColumn || 'amount';
      const yearColumn = tables.yearColumn || 'year';
      const monthColumn = tables.monthColumn || 'month_no';
      
      // Convert month names to integers if needed
      const monthIntegers = this.convertMonthsToIntegers(months);
      
      // Get division-specific pool
      const divisionPool = this.getPoolForDivision(division);
      
      // Get excluded product groups from fp_product_group_exclusions table
      const divisionCode = extractDivisionCode(division).toUpperCase();
      let excludedPGs = [];
      try {
        const exclusionsResult = await divisionPool.query(
          'SELECT product_group FROM fp_product_group_exclusions WHERE division_code = $1',
          [divisionCode]
        );
        excludedPGs = exclusionsResult.rows.map(r => r.product_group);
        if (excludedPGs.length > 0) {
          logger.info(`📋 Excluding ${excludedPGs.length} product groups from customer insights:`, excludedPGs);
        }
      } catch (e) {
        logger.warn('⚠️ Could not fetch product group exclusions:', e.message);
      }
      
      // Build query with LEFT JOIN exclusions (same as ProductGroupDataService)
      // Uses LEFT JOIN pattern for exclusions - more reliable than NOT IN
      const query = `
        SELECT 
          MIN(TRIM(d.${customerColumn})) as customer,
          SUM(d.${amountColumn}) as total_value
        FROM ${tableName} d
        LEFT JOIN fp_product_group_exclusions e
          ON UPPER(TRIM(d.pgcombine)) = UPPER(TRIM(e.product_group))
          AND UPPER(TRIM(e.division_code)) = 'FP'
        WHERE d.${yearColumn} = $1
          AND d.${monthColumn} = ANY($2)
          AND d.${customerColumn} IS NOT NULL
          AND TRIM(d.${customerColumn}) != ''
          AND e.product_group IS NULL
        GROUP BY LOWER(TRIM(d.${customerColumn}))
        ORDER BY total_value DESC
      `;
      const params = [parseInt(year), monthIntegers];
      
      const result = await divisionPool.query(query, params);
      
      // Normalize customer names (case-insensitive) and aggregate duplicates
      // This handles cases where SQL GROUP BY didn't catch all variations
      const normalizedMap = new Map();
      const norm = (s) => (s || '').toString().trim().toLowerCase();
      
      result.rows.forEach(row => {
        const customer = row.customer;
        const value = parseFloat(row.total_value || 0);
        const normalized = norm(customer);
        
        // Debug logging for specific customer
        if (normalized.includes('algo food')) {
          logger.info(`🔍 DEBUG Algo Food: Found "${customer}" with value ${value.toFixed(2)}, normalized: "${normalized}"`);
        }
        
        if (normalizedMap.has(normalized)) {
          // Sum values for same normalized customer name
          const existing = normalizedMap.get(normalized);
          existing.value += value;
          if (normalized.includes('algo food')) {
            logger.info(`🔍 DEBUG Algo Food: Duplicate found, summing. New total: ${existing.value.toFixed(2)}`);
          }
        } else {
          // Store first occurrence (preserve original casing for display)
          normalizedMap.set(normalized, {
            customer: customer,
            value: value
          });
        }
      });
      
      // Debug: Show final value for Algo Food
      const algoFoodNormalized = norm('Algo Food');
      if (normalizedMap.has(algoFoodNormalized)) {
        const algoFoodData = normalizedMap.get(algoFoodNormalized);
        logger.info(`🔍 DEBUG Algo Food: Final value after SQL aggregation: ${algoFoodData.value.toFixed(2)} (customer name: "${algoFoodData.customer}")`);
      }
      
      // Convert to array and sort by value
      return Array.from(normalizedMap.values()).sort((a, b) => b.value - a.value);
    } catch (error) {
      logger.error('❌ Error fetching raw customer data:', error);
      throw error;
    }
  }

  /**
   * Get division-wide merge rules from division_customer_merge_rules table
   */
  async getDivisionMergeRules(division) {
    try {
      const divisionPool = this.getPoolForDivision(division);
      const tables = getTableNames(division);
      
      const query = `
        SELECT
          merged_customer_name,
          original_customers
        FROM ${tables.divisionMergeRules}
        WHERE division = $1 
          AND is_active = true
          AND status = 'ACTIVE'
        ORDER BY merged_customer_name
      `;
      
      const result = await divisionPool.query(query, [division]);
      
      return result.rows.map(row => ({
        mergedName: row.merged_customer_name,
        originalCustomers: Array.isArray(row.original_customers) 
          ? row.original_customers 
          : (typeof row.original_customers === 'string' 
              ? JSON.parse(row.original_customers) 
              : [])
      }));
    } catch (error) {
      logger.error('❌ Error fetching division merge rules:', error);
      throw error;
    }
  }

  /**
   * Apply division-wide merge rules to all customers
   * This merges customers BEFORE calculating top 20, ensuring correct rankings
   * CRITICAL: Each customer value is only counted once, even if it appears in multiple merge rules
   */
  applyDivisionMergeRules(customerData, mergeRules) {
    try {
      if (!mergeRules || mergeRules.length === 0) {
        logger.info('ℹ️ No merge rules to apply, returning customers as-is');
        return customerData.map(c => ({
          name: c.customer,
          value: c.value,
          isMerged: false,
          originalCustomers: [c.customer]
        }));
      }

      const processedCustomers = [];
      const processed = new Set(); // Track which normalized customer names have been processed
      
      // Normalize helper function
      const norm = (s) => (s || '').toString().trim().toLowerCase();
      
      // Create a map of normalized customer names to their data
      // customerData is already normalized from getRawCustomerData, but we'll ensure it here too
      const customerMap = new Map();
      customerData.forEach(customer => {
        const normalized = norm(customer.customer);
        if (!customerMap.has(normalized)) {
          // Create a copy to avoid mutating the original
          customerMap.set(normalized, {
            customer: customer.customer,
            value: customer.value
          });
        } else {
          // If duplicate found (shouldn't happen after getRawCustomerData fix, but safety check)
          logger.warn(`⚠️ Duplicate normalized customer found: ${normalized}, summing values`);
          customerMap.get(normalized).value += customer.value;
        }
      });
      
      logger.info(`🔧 Applying ${mergeRules.length} division-wide merge rules to ${customerMap.size} unique customers`);
      
      // Apply each merge rule
      mergeRules.forEach((rule, ruleIndex) => {
        const originalCustomers = rule.originalCustomers || [];
        const mergedName = (rule.mergedName || '').toString().trim();
        
        if (!mergedName || originalCustomers.length === 0) {
          return; // Skip invalid rules
        }
        
        // CRITICAL FIX: Deduplicate originalCustomers array to prevent counting same customer multiple times
        const uniqueOriginalCustomers = [...new Set(originalCustomers.map(c => norm(c)))];
        const originalCustomersMap = new Map();
        originalCustomers.forEach(orig => {
          const normalized = norm(orig);
          if (!originalCustomersMap.has(normalized)) {
            originalCustomersMap.set(normalized, orig);
          }
        });
        
        // Find matching customers (case-insensitive) that haven't been processed yet
        const matchingCustomers = [];
        const matchingNormalized = new Set();
        let totalMergedValue = 0;
        
        // Use the deduplicated list to avoid counting same customer multiple times
        uniqueOriginalCustomers.forEach(normalizedOrig => {
          // Debug logging for Algo Food
          if (normalizedOrig.includes('algo food')) {
            logger.info(`🔍 DEBUG Algo Food in merge rule "${mergedName}": normalized="${normalizedOrig}", exists=${customerMap.has(normalizedOrig)}, processed=${processed.has(normalizedOrig)}`);
            if (customerMap.has(normalizedOrig)) {
              const data = customerMap.get(normalizedOrig);
              logger.info(`🔍 DEBUG Algo Food value: ${data.value.toFixed(2)}`);
            }
          }
          
          // Only process if customer exists in data AND hasn't been processed by another merge rule
          if (customerMap.has(normalizedOrig) && !processed.has(normalizedOrig)) {
            const customerData = customerMap.get(normalizedOrig);
            matchingCustomers.push(customerData);
            matchingNormalized.add(normalizedOrig);
            totalMergedValue += customerData.value;
            
            // Debug logging for Algo Food
            if (normalizedOrig.includes('algo food')) {
              logger.info(`🔍 DEBUG Algo Food: Added to merge "${mergedName}", current total: ${totalMergedValue.toFixed(2)}`);
            }
          } else if (customerMap.has(normalizedOrig) && processed.has(normalizedOrig)) {
            // Debug: Customer exists but already processed
            if (normalizedOrig.includes('algo food')) {
              logger.warn(`🔍 DEBUG Algo Food: Already processed by another merge rule! Skipping.`);
            }
          }
        });
        
        if (matchingCustomers.length > 0) {
          // Create merged customer entry
          processedCustomers.push({
            name: mergedName + '*',  // Add asterisk to show it's merged
            value: totalMergedValue, // Use the calculated sum (not reduce to avoid issues)
            isMerged: true,
            originalCustomers: matchingCustomers.map(c => c.customer)
          });
          
          // Mark ALL matching customers as processed to prevent double-counting
          matchingNormalized.forEach(normName => processed.add(normName));
          
          // Enhanced logging to help debug
          const customerDetails = matchingCustomers.map(c => `${c.customer} (${c.value.toFixed(2)})`).join(', ');
          logger.info(`  ✅ Rule ${ruleIndex + 1}: Merged ${matchingCustomers.length} customers into "${mergedName}*": ${totalMergedValue.toFixed(2)}`);
          logger.info(`     Customers: ${customerDetails}`);
          if (originalCustomers.length !== uniqueOriginalCustomers.length) {
            logger.warn(`     ⚠️ WARNING: Merge rule had ${originalCustomers.length} entries but ${uniqueOriginalCustomers.length} unique customers (duplicates removed)`);
          }
        } else {
          logger.info(`  ⚠️ Rule ${ruleIndex + 1}: No matching customers found for merge rule "${mergedName}"`);
        }
      });
      
      // Add unprocessed customers (those not part of any merge rule)
      customerMap.forEach((customerData, normalizedName) => {
        if (!processed.has(normalizedName)) {
          processedCustomers.push({
            name: customerData.customer,
            value: customerData.value,
            isMerged: false,
            originalCustomers: [customerData.customer]
          });
        }
      });
      
      // Final dedupe: Remove any customers that match a merged customer's normalized name
      const mergedNormalizedSet = new Set();
      processedCustomers.forEach(customer => {
        if (customer.name.endsWith('*')) {
          const withoutAsterisk = customer.name.slice(0, -1).trim();
          mergedNormalizedSet.add(norm(withoutAsterisk));
        }
      });
      
      const deduped = processedCustomers.filter(customer => {
        if (customer.name.endsWith('*')) {
          return true; // Keep all merged customers
        }
        // For non-merged customers, check if they match a merged customer
        const customerNormalized = norm(customer.name);
        return !mergedNormalizedSet.has(customerNormalized);
      });
      
      // Sort by value descending
      const sorted = deduped.sort((a, b) => b.value - a.value);
      
      // Validation: Check for any potential double-counting
      const totalValueBeforeMerge = customerData.reduce((sum, c) => sum + c.value, 0);
      const totalValueAfterMerge = sorted.reduce((sum, c) => sum + c.value, 0);
      const difference = Math.abs(totalValueBeforeMerge - totalValueAfterMerge);
      
      if (difference > 0.01) { // Allow for floating point errors
        logger.error(`❌ CRITICAL: Value mismatch detected! Before merge: ${totalValueBeforeMerge.toFixed(2)}, After merge: ${totalValueAfterMerge.toFixed(2)}, Difference: ${difference.toFixed(2)}`);
        logger.error(`   This indicates double-counting. Check merge rules for duplicates.`);
        
        // Debug: Show merged customers with their values
        const mergedCustomers = sorted.filter(c => c.isMerged);
        if (mergedCustomers.length > 0) {
          logger.error(`   Merged customers:`);
          mergedCustomers.forEach(mc => {
            logger.error(`     - ${mc.name}: ${mc.value.toFixed(2)} (from: ${mc.originalCustomers.join(', ')})`);
          });
        }
      } else {
        logger.info(`✅ Value validation passed: ${totalValueBeforeMerge.toFixed(2)} = ${totalValueAfterMerge.toFixed(2)}`);
      }
      
      logger.info(`✅ After division-wide merge: ${sorted.length} customers (${sorted.filter(c => c.isMerged).length} merged, ${sorted.filter(c => !c.isMerged).length} individual)`);
      
      return sorted;
    } catch (error) {
      logger.error('❌ Error applying division merge rules:', error);
      throw error;
    }
  }

  /**
   * Calculate customer insights metrics
   */
  calculateInsights(customers) {
    // Calculate total sales
    const totalSales = customers.reduce((sum, c) => sum + c.value, 0);
    
    // Calculate percentages
    const customersWithPercent = customers.map(customer => ({
      ...customer,
      percent: totalSales > 0 ? (customer.value / totalSales * 100) : 0
    }));
    
    // Sort by value (descending) to ensure correct ranking
    // (customers array is already sorted, but re-sort after percent calculation to be sure)
    customersWithPercent.sort((a, b) => b.value - a.value);
    
    // Calculate metrics
    const topCustomer = customersWithPercent[0] ? customersWithPercent[0].percent.toFixed(1) + '%' : '-';
    const top3Customer = customersWithPercent.slice(0, 3).reduce((sum, c) => sum + c.percent, 0).toFixed(1) + '%';
    const top5Customer = customersWithPercent.slice(0, 5).reduce((sum, c) => sum + c.percent, 0).toFixed(1) + '%';
    const avgSalesPerCustomer = customers.length > 0 ? (totalSales / customers.length) : 0;
    
    return {
      customers: customersWithPercent,
      totalCustomers: customers.length,
      totalSales: totalSales,
      topCustomer: topCustomer,
      top3Customer: top3Customer,
      top5Customer: top5Customer,
      avgSalesPerCustomer: avgSalesPerCustomer
    };
  }

  /**
   * Convert month names to integers
   * Copied from GeographicDistributionService for consistency
   */
  convertMonthsToIntegers(months) {
    const monthMapping = {
      'January': 1, 'February': 2, 'March': 3, 'April': 4,
      'May': 5, 'June': 6, 'July': 7, 'August': 8,
      'September': 9, 'October': 10, 'November': 11, 'December': 12
    };

    const result = [];
    months.forEach(month => {
      // Handle month names
      if (monthMapping[month]) {
        result.push(monthMapping[month]);
      } 
      // Handle integers (already converted by frontend)
      else if (typeof month === 'number' && month >= 1 && month <= 12) {
        result.push(month);
      }
      // Handle string numbers
      else if (typeof month === 'string' && !isNaN(month) && parseInt(month) >= 1 && parseInt(month) <= 12) {
        result.push(parseInt(month));
      }
      else {
        logger.warn(`⚠️ Invalid month value: ${month} (type: ${typeof month})`);
      }
    });

    return [...new Set(result)]; // Remove duplicates
  }

  /**
   * Get table name for division (uses getTableNames helper)
   */
  getTableName(division) {
    const tables = getTableNames(division);
    return tables.actualData;
  }
}

module.exports = new CustomerInsightsService();

