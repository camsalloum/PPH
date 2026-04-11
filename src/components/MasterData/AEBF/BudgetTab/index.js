/**
 * BudgetTab Component - Modular Index
 * 
 * This file serves as the main entry point for the BudgetTab component.
 * Currently re-exports the legacy BudgetTab while we gradually extract
 * sub-components into their own files.
 * 
 * REFACTORING STATUS:
 * ==================
 * Planned modules:
 *   [x] helpers.js - Utility functions (created)
 *   [ ] hooks/useBudgetData.js - Data fetching hooks
 *   [ ] hooks/useBudgetCalculations.js - Memoized calculations
 *   [ ] hooks/useDraftState.js - Draft auto-save logic
 *   [ ] components/ExcelBudget.js - Excel format tab content
 *   [ ] components/DivisionalHtmlBudget.js - Divisional HTML budget
 *   [ ] components/SalesRepHtmlBudget.js - Sales Rep HTML budget
 *   [ ] components/SalesRepRecap.js - Sales Rep Recap tab
 *   [ ] components/UploadModal.js - File upload modal
 *   [ ] components/SubmitModals.js - Submit confirmation modals
 * 
 * BACKUP LOCATION: D:\Projects\IPD26.10\backups\refactor_20251201_164954\
 */

// For now, export the existing BudgetTab component from legacy file
// This maintains full backward compatibility
export { default } from '../BudgetTab-legacy.js';

// Export helpers for use by other components
export * from './helpers';
