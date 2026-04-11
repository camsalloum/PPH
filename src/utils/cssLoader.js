/**
 * CSS Loader Utility
 * Provides a single source of truth for CSS by reading actual .css files
 * Both live components and HTML exports use the same CSS source
 */

// Import CSS files as raw text using ?raw suffix (requires Vite/Webpack configuration)
// For now, we'll use a runtime approach that reads from the DOM's loaded stylesheets

/**
 * Extract CSS rules from loaded stylesheets for a given component
 * @param {string[]} classPatterns - Array of class name patterns to match (e.g., ['.kpi-', '.uae-'])
 * @returns {string} - Combined CSS text
 */
export function extractCSSFromStylesheets(classPatterns) {
  try {
    const cssRules = [];
    const stylesheets = Array.from(document.styleSheets);

    for (const stylesheet of stylesheets) {
      try {
        if (!stylesheet.cssRules) continue;

        for (const rule of Array.from(stylesheet.cssRules)) {
          if (rule.cssText) {
            // Check if rule matches any of the patterns
            const matches = classPatterns.some(pattern => {
              if (pattern.startsWith('.')) {
                // Class selector pattern
                return rule.selectorText?.includes(pattern) || 
                       rule.cssText.includes(pattern);
              }
              // Other patterns
              return rule.cssText.includes(pattern);
            });

            if (matches) {
              cssRules.push(rule.cssText);
            }
          }
        }
      } catch (e) {
        // Skip stylesheets that can't be accessed (CORS)
        console.warn('Could not access stylesheet:', e);
      }
    }

    return cssRules.join('\n\n');
  } catch (error) {
    console.error('Error extracting CSS:', error);
    return '';
  }
}

/**
 * Extract KPI-specific CSS from loaded stylesheets
 */
export function extractKPICSS() {
  return extractCSSFromStylesheets([
    '.kpi-dashboard',
    '.kpi-section',
    '.kpi-period',
    '.kpi-metric',
    '.kpi-card',
    '.kpi-grid',
    '.kpi-header',
    '.uae-dirham',
    'uae-'
  ]);
}

/**
 * Extract overlay/banner CSS
 */
export function extractOverlayCSS() {
  return extractCSSFromStylesheets([
    '.divisional-dashboard__overlay',
    '.divisional-dashboard__overlay-banner',
    '.divisional-dashboard__overlay-close'
  ]);
}

/**
 * Extract table-specific CSS
 */
export function extractTableCSS(tableType) {
  const patterns = {
    'product-group': ['.product-group-table', '.pl-table'],
    'pl-financial': ['.pl-financial-table', '.pl-table'],
    'sales-customer': ['.sales-by-customer-table', '.sales-table'],
    'sales-rep': ['.sales-by-sales-rep-table', '.sales-rep-table'],
    'sales-country': ['.sales-by-country-table', '.sales-country-table']
  };

  return extractCSSFromStylesheets(patterns[tableType] || []);
}

export default {
  extractCSSFromStylesheets,
  extractKPICSS,
  extractOverlayCSS,
  extractTableCSS
};
