/**
 * Row Configuration Service for P&L Table
 * 
 * This service manages the configuration of rows in the P&L table,
 * including labels, formulas, and display properties.
 */

import { FINANCIAL_ROWS, FORMULA_TYPES, ROW_LABELS } from './FinancialConstants';

/**
 * Row Configuration Service Class
 * Manages row definitions and configurations for the P&L table
 */
export class RowConfigurationService {
  
  /**
   * Gets the complete row configuration for the P&L table
   * @param {Array} divisionData - The division data array
   * @returns {Array} Array of row configuration objects
   */
  static getRowConfiguration(divisionData = []) {
    const hasData = divisionData && divisionData.length > 0;
    
    return [
      // Sales Section
      {
        key: 'sales',
        label: hasData ? (divisionData[FINANCIAL_ROWS.SALES]?.[0] || ROW_LABELS.SALES) : ROW_LABELS.SALES,
        index: FINANCIAL_ROWS.SALES,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'salesVolume',
        label: hasData ? (divisionData[FINANCIAL_ROWS.SALES_VOLUME]?.[0] || ROW_LABELS.SALES_VOLUME) : ROW_LABELS.SALES_VOLUME,
        index: FINANCIAL_ROWS.SALES_VOLUME,
        isCalculated: false
      },
      {
        key: 'productionVolume',
        label: hasData ? (divisionData[FINANCIAL_ROWS.PRODUCTION_VOLUME]?.[0] || ROW_LABELS.PRODUCTION_VOLUME) : ROW_LABELS.PRODUCTION_VOLUME,
        index: FINANCIAL_ROWS.PRODUCTION_VOLUME,
        isCalculated: false
      },
      
      // Cost Section
      {
        key: 'costOfSales',
        label: hasData ? (divisionData[FINANCIAL_ROWS.COST_OF_SALES]?.[0] || ROW_LABELS.COST_OF_SALES) : ROW_LABELS.COST_OF_SALES,
        index: FINANCIAL_ROWS.COST_OF_SALES,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'material',
        label: hasData ? (divisionData[FINANCIAL_ROWS.MATERIAL]?.[0] || ROW_LABELS.MATERIAL) : ROW_LABELS.MATERIAL,
        index: FINANCIAL_ROWS.MATERIAL,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'morm',
        label: ROW_LABELS.MARGIN_OVER_MATERIAL,
        index: -2,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.SALES_MINUS_MATERIAL
      },
      
      // Direct Costs Section
      {
        key: 'labour',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_9]?.[0] || 'Labour') : 'Labour',
        index: FINANCIAL_ROWS.ROW_9,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'depreciation',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_10]?.[0] || 'Depreciation') : 'Depreciation',
        index: FINANCIAL_ROWS.ROW_10,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'electricity',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_12]?.[0] || 'Electricity') : 'Electricity',
        index: FINANCIAL_ROWS.ROW_12,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'othersMfgOverheads',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_13]?.[0] || 'Others Mfg. overheads') : 'Others Mfg. overheads',
        index: FINANCIAL_ROWS.ROW_13,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'actualDirectCostSpent',
        label: 'Actual Direct Cost Spent',
        index: -3,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.SUM_9_10_12_13
      },
      {
        key: 'dirCostInStock',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_15]?.[0] || 'Dir.Cost in Stock/Stock Adj.') : 'Dir.Cost in Stock/Stock Adj.',
        index: FINANCIAL_ROWS.ROW_15,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'dirCostOfGoodsSold',
        label: 'Dir.Cost of goods sold',
        index: -4,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.DIRECT_COST_OF_GOODS_SOLD
      },
      {
        key: 'directCostAsPercentOfCOGS',
        label: 'Direct cost as % of C.O.G.S',
        index: -5,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.DIRECT_COST_PERCENT_OF_COGS
      },
      
      // Gross Profit Section
      {
        key: 'grossProfitAfterDepn',
        label: 'Gross profit (after Depn.)',
        index: -6,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.SALES_MINUS_COST_OF_SALES
      },
      {
        key: 'grossProfitBeforeDepn',
        label: 'Gross profit (before Depn.)',
        index: -7,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.GROSS_PROFIT_BEFORE_DEPN
      },
      
      // Selling & Administrative Expenses Section
      {
        key: 'sellingExpenses',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_31]?.[0] || 'Selling expenses') : 'Selling expenses',
        index: FINANCIAL_ROWS.ROW_31,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'transportation',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_32]?.[0] || 'Transportation') : 'Transportation',
        index: FINANCIAL_ROWS.ROW_32,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'adminManagementFee',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_40]?.[0] || 'Administration & Management Fee') : 'Administration & Management Fee',
        index: FINANCIAL_ROWS.ROW_40,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'bankInterest',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_42]?.[0] || 'Bank Interest') : 'Bank Interest',
        index: FINANCIAL_ROWS.ROW_42,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'bankCharges',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_43]?.[0] || 'Bank charges') : 'Bank charges',
        index: FINANCIAL_ROWS.ROW_43,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'rdPreProduction',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_44]?.[0] || 'R & D, pre-production w/o') : 'R & D, pre-production w/o',
        index: FINANCIAL_ROWS.ROW_44,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'badDebts',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_49]?.[0] || 'Bad debts') : 'Bad debts',
        index: FINANCIAL_ROWS.ROW_49,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'otherIncome',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_50]?.[0] || 'Other Income') : 'Other Income',
        index: FINANCIAL_ROWS.ROW_50,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'otherProvision',
        label: hasData ? (divisionData[FINANCIAL_ROWS.ROW_51]?.[0] || 'Other Provision') : 'Other Provision',
        index: FINANCIAL_ROWS.ROW_51,
        isHeader: false,
        isCalculated: false
      },
      {
        key: 'totalBelowGPExpenses',
        label: 'Total Below GP Expenses',
        index: -8,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.SUM_31_TO_51
      },
      
      // Total Expenses
      {
        key: 'totalExpenses',
        label: 'Total Expenses',
        index: -11,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.TOTAL_EXPENSES
      },
      
      // Net Profit Section
      {
        key: 'netProfit',
        label: 'Net Profit',
        index: -9,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.NET_PROFIT
      },
      {
        key: 'ebit',
        label: 'EBIT',
        index: -12,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.EBIT
      },
      {
        key: 'ebitda',
        label: 'EBITDA',
        index: -10,
        isHeader: false,
        isCalculated: true,
        formula: FORMULA_TYPES.EBITDA
      }
    ];
  }
  
  /**
   * Gets the row configuration for a specific row key
   * @param {string} rowKey - The row key to find
   * @param {Array} divisionData - The division data array
   * @returns {Object|null} Row configuration object or null if not found
   */
  static getRowByKey(rowKey, divisionData = []) {
    const rows = this.getRowConfiguration(divisionData);
    return rows.find(row => row.key === rowKey) || null;
  }
  
  /**
   * Gets all calculated rows
   * @param {Array} divisionData - The division data array
   * @returns {Array} Array of calculated row configurations
   */
  static getCalculatedRows(divisionData = []) {
    const rows = this.getRowConfiguration(divisionData);
    return rows.filter(row => row.isCalculated);
  }
  
  /**
   * Determines if a row should be bold based on specific ledger names
   * @param {string} rowLabel - The row label to check
   * @returns {boolean} True if the row should be bold
   */
  static shouldBeBold(rowLabel) {
    const boldRows = [
      'Sales',
      'Material',
      'Dir.Cost of goods sold',
      'Gross profit (after Depn.)',
      'Total Below GP Expenses',
      'Total Expenses',
      'Net Profit',
      'EBIT',
      'EBITDA'
    ];
    
    return boldRows.includes(rowLabel);
  }
  
  
  /**
   * Gets all header rows
   * @param {Array} divisionData - The division data array
   * @returns {Array} Array of header row configurations
   */
  static getHeaderRows(divisionData = []) {
    const rows = this.getRowConfiguration(divisionData);
    return rows.filter(row => row.isHeader);
  }
  
  /**
   * Gets the business meaning of a row
   * @param {string} rowKey - The row key
   * @returns {string} Business meaning description
   */
  static getRowBusinessMeaning(rowKey) {
    const meanings = {
      'sales': 'Total revenue from sales',
      'salesVolume': 'Total quantity sold in kilograms',
      'productionVolume': 'Total quantity produced in kilograms',
      'costOfSales': 'Direct costs associated with sales',
      'material': 'Raw material costs',
      'morm': 'Margin over raw material costs',
      'labour': 'Labor costs for production',
      'depreciation': 'Depreciation expense for fixed assets',
      'electricity': 'Electricity costs for production',
      'othersMfgOverheads': 'Other manufacturing overhead costs',
      'actualDirectCostSpent': 'Total direct costs spent (Labour + Depreciation + Electricity + Others)',
      'dirCostInStock': 'Direct cost in stock and stock adjustments',
      'dirCostOfGoodsSold': 'Total direct cost of goods sold (Actual Direct Cost + Dir.Cost In Stock)',
      'directCostAsPercentOfCOGS': 'Direct cost as percentage of cost of goods sold',
      'grossProfitAfterDepn': 'Gross profit after depreciation (Sales - Cost of Sales)',
      'grossProfitBeforeDepn': 'Gross profit before depreciation (Gross profit after Depn. + Depreciation)',
      'sellingExpenses': 'Costs related to selling products',
      'transportation': 'Transportation and logistics costs',
      'adminManagementFee': 'Administrative and management fees',
      'bankInterest': 'Interest paid on bank loans',
      'bankCharges': 'Bank service charges and fees',
      'rdPreProduction': 'Research & Development and pre-production write-offs',
      'badDebts': 'Uncollectible accounts receivable',
      'otherIncome': 'Non-operating income',
      'otherProvision': 'Other financial provisions',
      'totalBelowGPExpenses': 'Total selling & administrative expenses',
      'totalExpenses': 'Total expenses (Direct costs + Selling & Admin)',
      'netProfit': 'Net profit (Gross profit after Depn. - Total Below GP Expenses)',
      'ebit': 'Earnings before interest and taxes',
      'ebitda': 'Earnings before interest, taxes, depreciation, and amortization'
    };
    
    return meanings[rowKey] || 'Financial metric';
  }
}

export default RowConfigurationService;
