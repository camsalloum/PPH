/**
 * Formula Calculator Service for P&L Table
 * 
 * This service contains all the financial formula calculations used in the P&L table.
 * Centralizing these calculations improves maintainability, testability, and auditability.
 */

import { FINANCIAL_ROWS, FORMULA_TYPES } from './FinancialConstants';

/**
 * Utility function to safely parse numeric values with comma formatting
 * @param {string|number} value - The value to parse
 * @returns {number} Parsed numeric value, 0 if invalid
 */
const safeParseNumber = (value) => {
  if (value === '' || value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value.replace(/,/g, ''));
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

/**
 * Utility function to format numbers with comma separators
 * @param {number} value - The number to format
 * @param {number} decimals - Number of decimal places (default: 0)
 * @returns {string} Formatted number string
 */
const formatNumber = (value, decimals = 0) => {
  if (typeof value !== 'number' || isNaN(value)) return '';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

/**
 * Formula Calculator Class
 * Contains all financial formula calculations with proper documentation
 */
export class FormulaCalculator {
  
  /**
   * Calculates Margin over Material (Row 19)
   * Formula: Sales - Material
   * @param {string|number} sales - Sales value from row 3
   * @param {string|number} material - Material cost from row 5
   * @returns {string} Formatted result with comma separators
   */
  static calculateMarginOverMaterial(sales, material) {
    try {
      const salesNum = safeParseNumber(sales);
      const materialNum = safeParseNumber(material);
      const result = salesNum - materialNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Margin over Material:', error);
      return '';
    }
  }

  /**
   * Calculates Gross Profit After Depreciation
   * Formula: Sales - Cost of Sales
   * @param {string|number} sales - Sales value from row 3
   * @param {string|number} costOfSales - Cost of Sales from row 4
   * @returns {string} Formatted result with comma separators
   */
  static calculateGrossProfitAfterDepn(sales, costOfSales) {
    try {
      const salesNum = safeParseNumber(sales);
      const costOfSalesNum = safeParseNumber(costOfSales);
      const result = salesNum - costOfSalesNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Gross Profit After Depreciation:', error);
      return '';
    }
  }

  /**
   * Calculates Row 14 (Sum of rows 9, 10, 12, 13)
   * Formula: Row 9 + Row 10 + Row 12 + Row 13
   * @param {string|number} row9 - Value from row 9
   * @param {string|number} row10 - Value from row 10
   * @param {string|number} row12 - Value from row 12
   * @param {string|number} row13 - Value from row 13
   * @returns {string} Formatted result with comma separators
   */
  static calculateRow14(row9, row10, row12, row13) {
    try {
      const num9 = safeParseNumber(row9);
      const num10 = safeParseNumber(row10);
      const num12 = safeParseNumber(row12);
      const num13 = safeParseNumber(row13);
      const result = num9 + num10 + num12 + num13;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Row 14:', error);
      return '';
    }
  }

  /**
   * Calculates Row 16 (Sum of Row 14 + Row 15)
   * Formula: Row 14 + Row 15
   * @param {string|number} row14 - Value from row 14 (calculated)
   * @param {string|number} row15 - Value from row 15
   * @returns {string} Formatted result with comma separators
   */
  static calculateRow16(row14, row15) {
    try {
      const num14 = safeParseNumber(row14);
      const num15 = safeParseNumber(row15);
      const result = num14 + num15;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Row 16:', error);
      return '';
    }
  }

  /**
   * Calculates Row 18 as percentage of Material (Row 4)
   * Formula: (Row 16 / Material) * 100
   * @param {string|number} row16 - Value from row 16 (calculated)
   * @param {string|number} material - Material cost from row 4
   * @returns {string} Formatted percentage with 1 decimal place
   */
  static calculateRow18Percentage(row16, material) {
    try {
      const num16 = safeParseNumber(row16);
      const materialNum = safeParseNumber(material);
      
      if (materialNum === 0) return '0.0%';
      
      const percentage = (num16 / materialNum) * 100;
      return formatNumber(percentage, 1) + '%';
    } catch (error) {
      console.error('Error calculating Row 18 percentage:', error);
      return '';
    }
  }

  /**
   * Calculates Row 21 (Row 19 + Row 10)
   * Formula: Row 19 + Row 10
   * @param {string|number} row19 - Value from row 19 (calculated)
   * @param {string|number} row10 - Value from row 10
   * @returns {string} Formatted result with comma separators
   */
  static calculateRow21(row19, row10) {
    try {
      const num19 = safeParseNumber(row19);
      const num10 = safeParseNumber(row10);
      const result = num19 + num10;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Row 21:', error);
      return '';
    }
  }

  /**
   * Calculates Row 52 (Sum of multiple expense rows)
   * Formula: Row 31 + Row 32 + Row 40 + Row 42 + Row 43 + Row 44 + Row 49 + Row 50 + Row 51
   * Note: Row 50 (Other Income) is stored as NEGATIVE in DB, so adding it reduces expenses
   * @param {Object} rows - Object containing all row values
   * @returns {string} Formatted result with comma separators
   */
  static calculateRow52(rows) {
    try {
      const {
        row31 = 0, row32 = 0, row40 = 0, row42 = 0, row43 = 0,
        row44 = 0, row49 = 0, row50 = 0, row51 = 0
      } = rows;
      
      const num31 = safeParseNumber(row31);
      const num32 = safeParseNumber(row32);
      const num40 = safeParseNumber(row40);
      const num42 = safeParseNumber(row42);
      const num43 = safeParseNumber(row43);
      const num44 = safeParseNumber(row44);
      const num49 = safeParseNumber(row49);
      const num50 = safeParseNumber(row50);
      const num51 = safeParseNumber(row51);
      
      // Other Income is stored as negative in DB, so adding it reduces the total
      const result = num31 + num32 + num40 + num42 + num43 + num44 + num49 + num50 + num51;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Row 52:', error);
      return '';
    }
  }

  /**
   * Calculates Row 59 (Row 14 + Row 52)
   * Formula: Row 14 + Row 52
   * @param {string|number} row14 - Value from row 14 (calculated)
   * @param {string|number} row52 - Value from row 52 (calculated)
   * @returns {string} Formatted result with comma separators
   */
  static calculateRow59(row14, row52) {
    try {
      const num14 = safeParseNumber(row14);
      const num52 = safeParseNumber(row52);
      const result = num14 + num52;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Row 59:', error);
      return '';
    }
  }

  /**
   * Calculates EBIT (Earnings Before Interest and Taxes)
   * Formula: Net Profit + Bank Interest (Row 42)
   * @param {string|number} netProfit - Net profit value (calculated)
   * @param {string|number} bankInterest - Bank interest from row 42
   * @returns {string} Formatted result with comma separators
   */
  static calculateEBIT(netProfit, bankInterest) {
    try {
      const netProfitNum = safeParseNumber(netProfit);
      const bankInterestNum = safeParseNumber(bankInterest);
      const result = netProfitNum + bankInterestNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating EBIT:', error);
      return '';
    }
  }

  /**
   * Calculates EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization)
   * Formula: Net Profit + Row 10 + Row 42 + Row 44 + Row 51
   * @param {string|number} netProfit - Net profit value (calculated)
   * @param {string|number} row10 - Value from row 10
   * @param {string|number} row42 - Value from row 42
   * @param {string|number} row44 - Value from row 44
   * @param {string|number} row51 - Value from row 51
   * @returns {string} Formatted result with comma separators
   */
  static calculateEBITDA(netProfit, row10, row42, row44, row51) {
    try {
      const netProfitNum = safeParseNumber(netProfit);
      const num10 = safeParseNumber(row10);
      const num42 = safeParseNumber(row42);
      const num44 = safeParseNumber(row44);
      const num51 = safeParseNumber(row51);
      
      const result = netProfitNum + num10 + num42 + num44 + num51;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating EBITDA:', error);
      return '';
    }
  }

  /**
   * Calculates Direct Cost of Goods Sold
   * Formula: Actual Direct Cost Spent + Dir.Cost In Stock/Stock Adj.
   * @param {string|number} actualDirectCostSpent - Actual Direct Cost Spent (calculated)
   * @param {string|number} dirCostInStock - Dir.Cost In Stock/Stock Adj.
   * @returns {string} Formatted result with comma separators
   */
  static calculateDirectCostOfGoodsSold(actualDirectCostSpent, dirCostInStock) {
    try {
      const actualDirectCostNum = safeParseNumber(actualDirectCostSpent);
      const dirCostInStockNum = safeParseNumber(dirCostInStock);
      const result = actualDirectCostNum + dirCostInStockNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Direct Cost of Goods Sold:', error);
      return '';
    }
  }

  /**
   * Calculates Direct Cost as Percentage of Cost of Goods Sold
   * Formula: (Direct Cost of Goods Sold / Cost of Sales) * 100
   * @param {string|number} directCostOfGoodsSold - Direct Cost of Goods Sold (calculated)
   * @param {string|number} costOfSales - Cost of Sales
   * @returns {string} Formatted percentage with 1 decimal place
   */
  static calculateDirectCostPercentOfCOGS(directCostOfGoodsSold, costOfSales) {
    try {
      const directCostNum = safeParseNumber(directCostOfGoodsSold);
      const costOfSalesNum = safeParseNumber(costOfSales);
      
      if (costOfSalesNum === 0) return '0.0%';
      
      const percentage = (directCostNum / costOfSalesNum) * 100;
      return formatNumber(percentage, 1) + '%';
    } catch (error) {
      console.error('Error calculating Direct Cost % of COGS:', error);
      return '';
    }
  }

  /**
   * Calculates Gross Profit Before Depreciation
   * Formula: Gross Profit After Depreciation + Depreciation
   * @param {string|number} grossProfitAfterDepn - Gross Profit After Depreciation (calculated)
   * @param {string|number} depreciation - Depreciation value
   * @returns {string} Formatted result with comma separators
   */
  static calculateGrossProfitBeforeDepn(grossProfitAfterDepn, depreciation) {
    try {
      const grossProfitAfterNum = safeParseNumber(grossProfitAfterDepn);
      const depreciationNum = safeParseNumber(depreciation);
      const result = grossProfitAfterNum + depreciationNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Gross Profit Before Depn:', error);
      return '';
    }
  }

  /**
   * Calculates Total Expenses
   * Formula: Actual Direct Cost Spent + Total Below GP Expenses
   * @param {string|number} actualDirectCostSpent - Actual Direct Cost Spent (calculated)
   * @param {string|number} totalBelowGPExpenses - Total Below GP Expenses (calculated)
   * @returns {string} Formatted result with comma separators
   */
  static calculateTotalExpenses(actualDirectCostSpent, totalBelowGPExpenses) {
    try {
      const actualDirectCostNum = safeParseNumber(actualDirectCostSpent);
      const totalBelowGPNum = safeParseNumber(totalBelowGPExpenses);
      const result = actualDirectCostNum + totalBelowGPNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Total Expenses:', error);
      return '';
    }
  }

  /**
   * Calculates Net Profit
   * Formula: Gross Profit After Depreciation - Total Below GP Expenses
   * @param {string|number} grossProfitAfterDepn - Gross Profit After Depreciation (calculated)
   * @param {string|number} totalBelowGPExpenses - Total Below GP Expenses (calculated)
   * @returns {string} Formatted result with comma separators
   */
  static calculateNetProfit(grossProfitAfterDepn, totalBelowGPExpenses) {
    try {
      const grossProfitAfterNum = safeParseNumber(grossProfitAfterDepn);
      const totalBelowGPNum = safeParseNumber(totalBelowGPExpenses);
      const result = grossProfitAfterNum - totalBelowGPNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating Net Profit:', error);
      return '';
    }
  }

  /**
   * Calculates EBIT (Earnings Before Interest and Taxes)
   * Formula: Net Profit + Bank Interest
   * @param {string|number} netProfit - Net Profit (calculated)
   * @param {string|number} bankInterest - Bank Interest
   * @returns {string} Formatted result with comma separators
   */
  static calculateEBIT(netProfit, bankInterest) {
    try {
      const netProfitNum = safeParseNumber(netProfit);
      const bankInterestNum = safeParseNumber(bankInterest);
      const result = netProfitNum + bankInterestNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating EBIT:', error);
      return '';
    }
  }

  /**
   * Calculates EBITDA (Earnings Before Interest, Taxes, Depreciation, and Amortization)
   * Formula: EBIT + Depreciation + R&D, pre-production w/o
   * @param {string|number} ebit - EBIT (calculated)
   * @param {string|number} depreciation - Depreciation
   * @param {string|number} rdPreProduction - R&D, pre-production w/o
   * @returns {string} Formatted result with comma separators
   */
  static calculateEBITDA(ebit, depreciation, rdPreProduction) {
    try {
      const ebitNum = safeParseNumber(ebit);
      const depreciationNum = safeParseNumber(depreciation);
      const rdPreProductionNum = safeParseNumber(rdPreProduction);
      const result = ebitNum + depreciationNum + rdPreProductionNum;
      return formatNumber(result);
    } catch (error) {
      console.error('Error calculating EBITDA:', error);
      return '';
    }
  }

  /**
   * Calculates percentage of sales for a given value
   * Formula: (Value / Sales) * 100
   * @param {string|number} value - The value to calculate percentage for
   * @param {string|number} sales - Sales value from row 3
   * @returns {string} Formatted percentage with 2 decimal places
   */
  static calculatePercentageOfSales(value, sales) {
    try {
      const valueNum = safeParseNumber(value);
      const salesNum = safeParseNumber(sales);
      
      if (salesNum === 0) return '0.00%';
      
      const percentage = (valueNum / salesNum) * 100;
      return formatNumber(percentage, 2) + '%';
    } catch (error) {
      console.error('Error calculating percentage of sales:', error);
      return '';
    }
  }

  /**
   * Calculates sales per kg for a given value
   * Formula: Value / Sales Volume (Row 7)
   * @param {string|number} value - The value to calculate per kg for
   * @param {string|number} salesVolume - Sales volume from row 7
   * @returns {string} Formatted result with 2 decimal places
   */
  static calculateSalesPerKg(value, salesVolume) {
    try {
      const valueNum = safeParseNumber(value);
      const volumeNum = safeParseNumber(salesVolume);
      
      if (volumeNum === 0) return '0.00';
      
      const perKg = valueNum / volumeNum;
      return formatNumber(perKg, 2);
    } catch (error) {
      console.error('Error calculating sales per kg:', error);
      return '';
    }
  }

  /**
   * Main formula calculation dispatcher
   * Routes formula calculations to appropriate methods
   * @param {string} formulaType - The type of formula to calculate
   * @param {Object} values - Object containing all required values
   * @returns {string} Formatted calculation result
   */
  static calculateFormula(formulaType, values) {
    try {
      switch (formulaType) {
        case FORMULA_TYPES.SALES_MINUS_MATERIAL:
          return this.calculateMarginOverMaterial(values.sales, values.material);
          
        case FORMULA_TYPES.SALES_MINUS_COST_OF_SALES:
          return this.calculateGrossProfitAfterDepn(values.sales, values.costOfSales);
          
        case FORMULA_TYPES.SUM_9_10_12_13:
          return this.calculateRow14(values.row9, values.row10, values.row12, values.row13);
          
        case FORMULA_TYPES.SUM_14_15:
          return this.calculateRow16(values.row14, values.row15);
          
        case FORMULA_TYPES.PERCENT_16_4:
          return this.calculateRow18Percentage(values.row16, values.material);
          
        case FORMULA_TYPES.CALC_19_3_4:
          return this.calculateMarginOverMaterial(values.sales, values.material);
          
        case FORMULA_TYPES.CALC_21_19_10:
          return this.calculateRow21(values.row19, values.row10);
          
        case FORMULA_TYPES.SUM_31_TO_51:
          return this.calculateRow52(values);
          
        case FORMULA_TYPES.SUM_14_52:
          return this.calculateRow59(values.row14, values.row52);
          
        case FORMULA_TYPES.SUM_54_10_42_44_51:
          return this.calculateEBITDA(values.netProfit, values.row10, values.row42, values.row44, values.row51);
          
        case FORMULA_TYPES.SUM_54_42:
          return this.calculateEBIT(values.netProfit, values.row42);
          
        case FORMULA_TYPES.DIRECT_COST_OF_GOODS_SOLD:
          return this.calculateDirectCostOfGoodsSold(values.actualDirectCostSpent, values.dirCostInStock);
          
        case FORMULA_TYPES.DIRECT_COST_PERCENT_OF_COGS:
          return this.calculateDirectCostPercentOfCOGS(values.directCostOfGoodsSold, values.costOfSales);
          
        case FORMULA_TYPES.GROSS_PROFIT_BEFORE_DEPN:
          return this.calculateGrossProfitBeforeDepn(values.grossProfitAfterDepn, values.depreciation);
          
        case FORMULA_TYPES.TOTAL_EXPENSES:
          return this.calculateTotalExpenses(values.actualDirectCostSpent, values.totalBelowGPExpenses);
          
        case FORMULA_TYPES.NET_PROFIT:
          return this.calculateNetProfit(values.grossProfitAfterDepn, values.totalBelowGPExpenses);
          
        case FORMULA_TYPES.EBIT:
          return this.calculateEBIT(values.netProfit, values.bankInterest);
          
        case FORMULA_TYPES.EBITDA:
          return this.calculateEBITDA(values.ebit, values.depreciation, values.rdPreProduction);
          
        default:
          console.warn(`Unknown formula type: ${formulaType}`);
          return '';
      }
    } catch (error) {
      console.error(`Error calculating formula ${formulaType}:`, error);
      return '';
    }
  }
}

export default FormulaCalculator;
