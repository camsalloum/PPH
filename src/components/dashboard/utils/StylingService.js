/**
 * Enhanced Styling Service for P&L Table
 * 
 * This service manages all styling logic for the P&L table,
 * including column colors, cell backgrounds, CSS class generation,
 * and export styling. Single source of truth for all P&L styling.
 */

import { COLOR_SCHEMES, DEFAULT_COLORS, DEFAULT_CELL_COLORS } from './FinancialConstants';
import { getColumnColorPalette } from './colorUtils';

/**
 * Enhanced Styling Service Class
 * Manages all styling logic for the P&L table across live view and exports
 */
export class StylingService {
  
  /**
   * Gets column header style based on column configuration
   * @param {Object} column - The column configuration object
   * @returns {Object} Style object for column header
   */
  static getColumnHeaderStyle(column) {
    // Ensure column is defined
    if (!column) {
      return {
        background: 'linear-gradient(135deg, #3b82f6, #1e40af)',
        color: '#FFFFFF',
        textAlign: 'center'
      };
    }
    
    // Check if column has custom color property
    if (column.customColor || column.customColorHex) {
      const palette = getColumnColorPalette(column);
      return {
        background: palette.gradient,
        color: palette.text,
        textAlign: 'center'
      };
    }
    
    // Default color assignment based on month/type - with gradients
    let baseStyle;
    if (column.month === 'Q1' || column.month === 'Q2' || column.month === 'Q3' || column.month === 'Q4') {
      baseStyle = { background: 'linear-gradient(135deg, #f97316, #ea580c)', color: '#000000' };
    } else if (column.month === 'January') {
      baseStyle = { background: 'linear-gradient(135deg, #fbbf24, #d97706)', color: '#000000' };
    } else if (column.month === 'Year') {
      baseStyle = { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF' };
    } else if (column.type === 'Budget') {
      baseStyle = { background: 'linear-gradient(135deg, #059669, #047857)', color: '#FFFFFF' };
    } else {
      baseStyle = { background: 'linear-gradient(135deg, #3b82f6, #1e40af)', color: '#FFFFFF' };
    }
    
    // Always include text-align: center for all header styles
    return {
      ...baseStyle,
      textAlign: 'center'
    };
  }

  /**
   * Gets CSS data attribute for column header color
   * @param {Object} column - The column configuration object
   * @returns {string} CSS data attribute value
   */
  static getColumnColorAttribute(column) {
    if (!column) return 'blue';
    
    if (column.customColorHex) {
      return 'custom';
    }
    if (column.customColor) {
      const scheme = COLOR_SCHEMES.find(s => s.name === column.customColor);
      if (scheme) return scheme.name.toLowerCase();
    }
    
    if (column.month === 'Q1' || column.month === 'Q2' || column.month === 'Q3' || column.month === 'Q4') {
      return 'orange';
    } else if (column.month === 'January') {
      return 'yellow';
    } else if (column.month === 'Year') {
      return 'blue';
    } else if (column.type === 'Budget') {
      return 'green';
    }
    
    return 'blue';
  }

  /**
   * Gets unified CSS classes for table elements
   * @param {string} element - Element type (table, container, header, etc.)
   * @returns {string} CSS class names
   */
  static getUnifiedCSSClasses(element) {
    const classMap = {
      'table-view': 'pl-table-view',
      'table-container': 'pl-table-container',
      'table-header': 'pl-table-header',
      'header-center': 'pl-header-center',
      'table-title': 'pl-table-title',
      'table-subtitle': 'pl-table-subtitle',
      'financial-table': 'pl-financial-table',
      'empty-state': 'pl-table-empty-state',
      'export-button': 'pl-pdf-export-button'
    };
    
    return classMap[element] || element;
  }

  /**
   * Generates complete CSS class string for table elements
   * @param {string} baseElement - Base element type
   * @param {Array} additionalClasses - Additional CSS classes
   * @returns {string} Complete CSS class string
   */
  static generateCSSClasses(baseElement, additionalClasses = []) {
    const baseClass = this.getUnifiedCSSClasses(baseElement);
    const allClasses = [baseClass, ...additionalClasses].filter(Boolean);
    return allClasses.join(' ');
  }

  /**
   * Gets export-specific styling for HTML exports
   * @param {Object} column - The column configuration object
   * @returns {Object} Inline style object for exports
   */
  static getExportHeaderStyle(column) {
    const headerStyle = this.getColumnHeaderStyle(column);
    return {
      ...headerStyle,
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      fontSize: '10px',
      fontWeight: 'bold',
      textAlign: 'center',
      verticalAlign: 'middle',
      whiteSpace: 'nowrap',
      padding: '2px 4px',
      border: '1px solid #ddd'
    };
  }

  /**
   * Gets complete CSS for HTML exports
   * @returns {string} Complete CSS string for embedding in HTML exports
   */
  static getExportCSS() {
    // Return reference to external CSS file instead of inline styles
    // P&L Table styles are now defined in PLTableStyles.css
    return `
      /* P&L Table styles are defined in PLTableStyles.css */
      /* This method now serves as a placeholder for any export-specific overrides */
    `;
  }
  
  /**
   * Gets cell background color based on column configuration
   * @param {Object} column - The column configuration object
   * @returns {string} Background color string
   */
  static getCellBackgroundColor(column) {
    // Debug logging for troubleshooting
    
    // Ensure we have a valid column object
    if (!column) {
      return DEFAULT_CELL_COLORS.DEFAULT;
    }
    
    // Use custom color if available
    if (column.customColor || column.customColorHex) {
      const palette = getColumnColorPalette(column);
      if (palette.light) {
        return palette.light;
      }
    }
    
    // Default color assignment based on month/type
    if (column.month === 'Q1' || column.month === 'Q2' || column.month === 'Q3' || column.month === 'Q4') {
      return DEFAULT_CELL_COLORS.QUARTER;
    } else if (column.month === 'January') {
      return DEFAULT_CELL_COLORS.JANUARY;
    } else if (column.month === 'Year' || column.month === 'FY') {
      return DEFAULT_CELL_COLORS.YEAR;
    } else if (column.month === 'HY1' || column.month === 'HY2') {
      return DEFAULT_CELL_COLORS.YEAR;
    } else if (column.type === 'Budget') {
      return DEFAULT_CELL_COLORS.BUDGET;
    } else if (column.type === 'Forecast') {
      return DEFAULT_CELL_COLORS.QUARTER;
    } else if (column.type === 'Estimate') {
      return DEFAULT_CELL_COLORS.JANUARY;
    }
    
    // If we have a month that's a full month name, use January color
    const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
    if (fullMonths.includes(column.month)) {
      return DEFAULT_CELL_COLORS.JANUARY;
    }
    
    // Default to blue
    return DEFAULT_CELL_COLORS.DEFAULT;
  }
  
  /**
   * Gets row styling based on row properties
   * @param {Object} row - The row configuration object
   * @returns {Object} Style object for row
   */
  static getRowStyle(row) {
    const baseStyle = {};
    
    // Add header styling
    if (row.isHeader) {
      baseStyle.fontWeight = 'bold';
      baseStyle.backgroundColor = '#f8f9fa';
    }
    
    
    return baseStyle;
  }
  
  /**
   * Gets cell styling based on cell properties
   * @param {Object} cell - The cell configuration object
   * @param {Object} column - The column configuration object
   * @returns {Object} Style object for cell
   */
  static getCellStyle(cell, column) {
    const baseStyle = {
      backgroundColor: this.getCellBackgroundColor(column)
    };
    
    // Add calculated cell styling
    if (cell.isCalculated) {
      baseStyle.fontWeight = 'bold';
    }
    
    // Add special styling for sales row
    if (cell.rowIndex === 3) {
      baseStyle.color = '#2E865F';
      baseStyle.fontWeight = 'bold';
    }
    
    return baseStyle;
  }
  
  /**
   * Gets table styling
   * @returns {Object} Style object for table
   */
  static getTableStyle() {
    return {
      width: '100%',
      borderCollapse: 'collapse'
      // fontSize and fontFamily removed - now handled by CSS
    };
  }
  
  /**
   * Gets table header styling
   * @returns {Object} Style object for table header
   */
  static getTableHeaderStyle() {
    return {
      backgroundColor: '#f8f9fa',
      textAlign: 'center',
      padding: '8px',
      border: '1px solid #dee2e6'
      // fontWeight removed - now handled by CSS
    };
  }
  
  /**
   * Gets table cell styling
   * @returns {Object} Style object for table cell
   */
  static getTableCellStyle() {
    return {
      padding: '6px 8px',
      border: '1px solid #dee2e6',
      textAlign: 'right'
    };
  }
  
  /**
   * Gets row label cell styling
   * @returns {Object} Style object for row label cell
   */
  static getRowLabelStyle() {
    return {
      padding: '6px 8px',
      border: '1px solid #dee2e6',
      textAlign: 'left',
      backgroundColor: '#f8f9fa'
      // fontWeight removed - now handled by CSS
    };
  }
  
  /**
   * Gets important row styling
   * @returns {Object} Style object for important rows
   */
  static getImportantRowStyle() {
    return {
      backgroundColor: '#fff3cd'
      // fontWeight removed - now handled by CSS
    };
  }
  
  /**
   * Gets section header styling
   * @returns {Object} Style object for section headers
   */
  static getSectionHeaderStyle() {
    return {
      backgroundColor: '#e9ecef',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
      // fontWeight removed - now handled by CSS
    };
  }
  
  /**
   * Gets calculated cell styling
   * @returns {Object} Style object for calculated cells
   */
  static getCalculatedCellStyle() {
    return {
      backgroundColor: '#f8f9fa'
      // fontWeight removed - now handled by CSS
    };
  }
  
  /**
   * Gets responsive styling for mobile devices
   * @returns {Object} Style object for mobile responsiveness
   */
  static getMobileStyle() {
    return {
      padding: '4px 6px'
      // fontSize removed - now handled by CSS
    };
  }
  
  /**
   * Gets print styling for PDF export
   * @returns {Object} Style object for print media
   */
  static getPrintStyle() {
    return {
      padding: '4px',
      border: '1px solid #000',
      backgroundColor: '#fff'
      // fontSize removed - now handled by CSS
    };
  }
  
  /**
   * Gets color scheme by name
   * @param {string} schemeName - The name of the color scheme
   * @returns {Object|null} Color scheme object or null if not found
   */
  static getColorScheme(schemeName) {
    return COLOR_SCHEMES.find(scheme => scheme.name === schemeName) || null;
  }
  
  /**
   * Gets all available color schemes
   * @returns {Array} Array of all color schemes
   */
  static getAllColorSchemes() {
    return COLOR_SCHEMES;
  }
  
  /**
   * Validates if a color scheme exists
   * @param {string} schemeName - The name of the color scheme
   * @returns {boolean} True if scheme exists, false otherwise
   */
  static isValidColorScheme(schemeName) {
    return COLOR_SCHEMES.some(scheme => scheme.name === schemeName);
  }
}

export default StylingService;




















