import React, { createContext, useState, useContext, useEffect, useMemo, useRef } from 'react';
import { useExcelData } from './ExcelDataContext';
import { useAuth } from './AuthContext';
import { deduplicatedFetch } from '../utils/deduplicatedFetch';

const FilterContext = createContext();

export const useFilter = () => useContext(FilterContext);

export const FilterProvider = ({ children }) => {
  const { selectedDivision } = useExcelData();
  const { user, updatePreferences } = useAuth();
  
  // Track if initial config has been loaded to prevent reloading on navigation
  const configLoadedRef = useRef(false);
  const currentUserIdRef = useRef(null);
  
  // Filter states
  const [availableFilters, setAvailableFilters] = useState({
    years: [],
    months: [],
    types: []
  });
  
  // Column order state - explicitly added by user
  const [columnOrder, setColumnOrder] = useState([]);
  
  // Chart visible columns - track which columns are visible in charts
  const [chartVisibleColumns, setChartVisibleColumns] = useState([]);
  
  // Base period index state
  const [basePeriodIndex, setBasePeriodIndex] = useState(null);
  
  // State to track if data has been generated
  const [dataGenerated, setDataGenerated] = useState(false);
  
  // Column selection state for styling/highlighting
  const [selectedColumnIndex, setSelectedColumnIndex] = useState(null);
  
  // Full year and quarters mapping for aggregation
  const fullYear = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const quarters = {
    'Q1': ['January', 'February', 'March'],
    'Q2': ['April', 'May', 'June'],
    'Q3': ['July', 'August', 'September'],
    'Q4': ['October', 'November', 'December']
  };
  const halfYears = {
    'HY1': ['January', 'February', 'March', 'April', 'May', 'June'],
    'HY2': ['July', 'August', 'September', 'October', 'November', 'December']
  };
  
  // Helper function to check if months are sequential
  const areMonthsSequential = (months) => {
    if (months.length <= 1) return true;
    
    const monthIndices = months.map(month => fullYear.indexOf(month)).sort((a, b) => a - b);
    
    for (let i = 1; i < monthIndices.length; i++) {
      if (monthIndices[i] !== monthIndices[i - 1] + 1) {
        return false;
      }
    }
    return true;
  };

  // Helper function to format month range display
  const formatMonthRange = (months) => {
    if (months.length === 1) {
      return months[0];
    } else if (months.length > 1) {
      const firstMonth = months[0].substring(0, 3); // Jan, Feb, etc.
      const lastMonth = months[months.length - 1].substring(0, 3);
      return `${firstMonth}-${lastMonth}`;
    }
    return '';
  };

  // Function to create custom month range
  const createCustomRange = (year, selectedMonths, type) => {
    // Sort months by their order in the year
    const sortedMonths = selectedMonths.sort((a, b) => 
      fullYear.indexOf(a) - fullYear.indexOf(b)
    );

    // Validate sequential requirement
    if (!areMonthsSequential(sortedMonths)) {
      return { success: false, error: 'Selected months must be sequential (consecutive).' };
    }

    // Create display name and ID
    const displayName = formatMonthRange(sortedMonths);
    const rangeId = `CUSTOM_${sortedMonths.join('_')}`;
    
    const newColumn = {
      year: Number(year),
      month: rangeId, // Use unique ID for custom ranges
      type,
      months: sortedMonths,
      displayName, // Add display name for UI
      isCustomRange: true,
      id: `${year}-${rangeId}-${type}`
    };

    return { success: true, column: newColumn };
  };
  
  // Extract filter options from the API (ERP Integration - Period Configuration)
  useEffect(() => {
    const fetchPeriodData = async () => {
      try {
        // Get auth token from localStorage (AuthContext stores it as 'auth_token')
        const token = localStorage.getItem('auth_token');
        
        const headers = {
          'Content-Type': 'application/json'
        };
        
        // Add Authorization header if token exists
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        
        
        const response = await deduplicatedFetch('/api/periods/all', {
          method: 'GET',
          headers,
          credentials: 'include'
        });

        if (response.ok) {
          const data = await response.json();
          
          // Extract years from API (now from fp_actualcommon)
          const years = data.data.years || [];
          
          // Get months/periods directly (now a simple array of strings)
          const months = data.data.months || [];
          
          // Get types from API (hardcoded)
          const types = data.data.types || ['Actual', 'Estimate', 'Budget', 'Forecast'];
          
          setAvailableFilters({ years, months, types });
        } else {
          // Fallback - API returned non-ok status
          console.warn('⚠️ API returned non-ok status:', response.status);
          const standardPeriods = ["FY", "H1", "H2", "Q1", "Q2", "Q3", "Q4"];
          const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
          const extendedMonths = [...standardPeriods, ...months];
          const types = ['Actual', 'Estimate', 'Budget', 'Forecast'];
          // Years fallback: empty array - user must have API working to get years from fp_actualcommon
          setAvailableFilters({ years: [], months: extendedMonths, types });
        }
      } catch (error) {
        console.error('❌ Failed to fetch period data from API:', error);
        // Fallback - API unavailable
        const standardPeriods = ["FY", "H1", "H2", "Q1", "Q2", "Q3", "Q4"];
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const extendedMonths = [...standardPeriods, ...months];
        const types = ['Actual', 'Estimate', 'Budget', 'Forecast'];
        // Years fallback: empty array - user must have API working to get years from fp_actualcommon
        setAvailableFilters({ years: [], months: extendedMonths, types });
      }
    };

    fetchPeriodData();
  }, []); // Run once on mount
  
  // Function to add a new year dynamically
  const addYear = (newYear) => {
    const yearNum = Number(newYear);
    if (!isNaN(yearNum) && !availableFilters.years.includes(yearNum)) {
      setAvailableFilters(prev => ({
        ...prev,
        years: [...prev.years, yearNum].sort((a, b) => a - b) // Keep sorted ascending for consistency, though UI sorts descending
      }));
      return true;
    }
    return false;
  };

  // Maximum number of columns allowed
  const MAX_COLUMNS = 5;
  
  // Helper function to find available color
  const findAvailableColor = (existingColumns) => {
    const colorSchemes = [
      'blue', 'green', 'yellow', 'orange', 'boldContrast'
    ];
    
    // Get colors already in use
    const usedColors = existingColumns
      .map(col => col.customColor)
      .filter(Boolean);
    
    // Find first color that's not used
    const availableColor = colorSchemes.find(color => !usedColors.includes(color));
    return availableColor || 'blue'; // Default to blue if all colors are used
  };

  // Function to add a column
  const addColumn = (year, month, type, customMonths = null) => {
    // Check if we've already reached the maximum number of columns
    if (columnOrder.length >= MAX_COLUMNS) {
      console.warn(`Maximum number of columns (${MAX_COLUMNS}) reached`);
      return { success: false, error: `Maximum limit of ${MAX_COLUMNS} columns reached.` };
    }

    let newColumn;

    // Handle custom month ranges
    if (customMonths && Array.isArray(customMonths) && customMonths.length > 0) {
      const customResult = createCustomRange(year, customMonths, type);
      if (!customResult.success) {
        return customResult; // Return error from createCustomRange
      }
      newColumn = customResult.column;
    } else {
      // Handle regular periods (existing logic)
      let actualMonths = [];
      if (month === 'FY') actualMonths = fullYear;
      else if (quarters[month]) actualMonths = quarters[month];
      else if (halfYears[month]) actualMonths = halfYears[month];
      else actualMonths = [month];
      
      newColumn = { 
        year: Number(year), 
        month, 
        type, 
        months: actualMonths,
        id: `${year}-${month}-${type}`
      };
    }

    // Check if this column already exists to avoid duplicates
    const exists = columnOrder.some(col => col.id === newColumn.id);
    
    if (!exists) {
      // Find an available color that's not used by other columns
      const availableColor = findAvailableColor(columnOrder);
      newColumn.customColor = availableColor;
      
      setColumnOrder(prev => [...prev, newColumn]);
      return { success: true };
    }
    
    return { success: false, error: 'This column combination already exists.' };
  };
  
  // Function to update column order
  const updateColumnOrder = (newOrder) => {
    setColumnOrder(newOrder);
  };
  
  // Function to remove a column
  const removeColumn = (columnId) => {
    // First find the index of the column to be removed
    const indexToRemove = columnOrder.findIndex(col => col.id === columnId);
    
    // If the column exists and is being removed
    if (indexToRemove !== -1) {
      // Check if the removed column is the base period or affects the base period index
      if (basePeriodIndex !== null) {
        // If we're removing the base period column
        if (indexToRemove === basePeriodIndex) {
          // Clear the base period
          clearBasePeriod();
        } 
        // If we're removing a column before the base period, adjust the index
        else if (indexToRemove < basePeriodIndex) {
          // Decrement the base period
          setBasePeriod(basePeriodIndex - 1);
        }
      }
    }
    
    // Remove the column from the order
    setColumnOrder(prev => prev.filter(col => col.id !== columnId));
  };
  
  // Function to clear all columns
  const clearAllColumns = () => {
    setColumnOrder([]);
    setDataGenerated(false);
  };
  
  // Function to generate data based on selected columns
  const generateData = () => {
    if (columnOrder.length > 0) {
      setDataGenerated(true);
      return true;
    }
    return false;
  };

  // Function to save current selection as standard (uses user preferences API)
  const saveAsStandardSelection = async () => {
    if (columnOrder.length > 0) {
      try {
        const result = await updatePreferences({
          period_selection: columnOrder,
          base_period_index: basePeriodIndex,
          chart_visible_columns: chartVisibleColumns
        });
        return !!result?.success;
      } catch (error) {
        console.error('Error saving standard configuration:', error);
        return false;
      }
    }
    return false;
  };

  // Function to save current selection as user preferences
  const saveUserPreferences = async () => {
    if (columnOrder.length > 0) {
      try {
        const result = await updatePreferences({
          period_selection: columnOrder,
          base_period_index: basePeriodIndex,
          chart_visible_columns: chartVisibleColumns
        });
        
        if (result.success) {
          return true;
        } else {
          console.error('Failed to save user preferences:', result.error);
          return false;
        }
      } catch (error) {
        console.error('Error saving user preferences:', error);
        return false;
      }
    }
    return false;
  };

  // Function to clear standard selection (uses user preferences API)
  const clearStandardSelection = async () => {
    try {
      const result = await updatePreferences({
        period_selection: [],
        base_period_index: null,
        chart_visible_columns: []
      });
      return !!result?.success;
    } catch (error) {
      console.error('Error clearing standard configuration:', error);
      return false;
    }
  };

  // Function to set base period (only updates local state, not saved until explicit save action)
  const setBasePeriod = (index) => {
    setBasePeriodIndex(index);
    // Note: Not automatically saving - base period will be saved when user clicks
    // "Save My Preferences" or "Save as Standard Configuration"
  };

  // Function to clear base period (only updates local state)
  const clearBasePeriod = () => {
    setBasePeriodIndex(null);
    // Note: Not automatically saving - will be cleared when user saves preferences
  };

  // Toggle visibility of a column in charts
  const toggleChartColumnVisibility = (columnId) => {
    setChartVisibleColumns(prev => {
      const newVisibility = prev.includes(columnId) 
        ? prev.filter(id => id !== columnId)  // Remove if present (hide)
        : [...prev, columnId];                // Add if not present (show)
      
      // Save to backend immediately
      saveChartVisibilityToBackend(newVisibility);
      return newVisibility;
    });
  };
  
  // Check if a column is visible in charts - use useCallback to ensure it always has fresh state
  const isColumnVisibleInChart = React.useCallback((columnId) => {
    return chartVisibleColumns.includes(columnId);
  }, [chartVisibleColumns]);

  // Alias for backward compatibility
  const setSelectedColumn = setSelectedColumnIndex;

  // Load configuration from backend on component mount or when user changes
  useEffect(() => {
    // Only load config if:
    // 1. Config hasn't been loaded yet, OR
    // 2. The user has changed (different user ID)
    const userId = user?.id || user?.username || null;
    
    if (configLoadedRef.current && currentUserIdRef.current === userId) {
      // Config already loaded for this user, don't reload
      return;
    }
    
    const loadConfig = async () => {
      try {
        // User preferences are already loaded via AuthContext — no extra API call needed
        let userPrefs = user?.preferences || {};
        
        // Determine effective config from user preferences (no global config endpoint needed)
        const periodSelection = userPrefs.period_selection || [];
        const basePeriod = userPrefs.base_period_index;
        const chartVisibility = userPrefs.chart_visible_columns || [];


        // 4. Process Period Selection (Enrich with months)
        // If no saved config, default to current year as base period
        const currentYear = new Date().getFullYear();
        const defaultPeriodSelection = [
          { year: currentYear, month: 'Year', type: 'Actual', months: fullYear, id: `${currentYear}-Year-Actual` }
        ];
        
        const effectivePeriodSelection = (Array.isArray(periodSelection) && periodSelection.length > 0) 
          ? periodSelection 
          : defaultPeriodSelection;
        
        if (Array.isArray(effectivePeriodSelection)) {
          const normalizeType = (type) => String(type || 'Actual').toUpperCase();
          const enrichedColumns = effectivePeriodSelection.map(col => {
            const normalized = { ...col, year: Number(col.year), type: normalizeType(col.type) };
            // Ensure id is set
            if (!normalized.id) {
              normalized.id = `${normalized.year}-${normalized.month}-${normalized.type}`;
            }
            if (normalized.months) return normalized;
            
            if (normalized.month === 'HY1') return { ...normalized, months: halfYears['HY1'] };
            if (normalized.month === 'HY2') return { ...normalized, months: halfYears['HY2'] };
            if (normalized.month === 'Q1') return { ...normalized, months: quarters['Q1'] };
            if (normalized.month === 'Q2') return { ...normalized, months: quarters['Q2'] };
            if (normalized.month === 'Q3') return { ...normalized, months: quarters['Q3'] };
            if (normalized.month === 'Q4') return { ...normalized, months: quarters['Q4'] };
            if (normalized.month === 'Year' || normalized.month === 'FY') return { ...normalized, months: fullYear };
            if (fullYear.includes(normalized.month)) return { ...normalized, months: [normalized.month] };
            
            return normalized;
          });
          setColumnOrder(enrichedColumns);
          
          // If using default and no base period set, set base period to index 0 (current year)
          if (effectivePeriodSelection === defaultPeriodSelection && (basePeriod === undefined || basePeriod === null)) {
            setBasePeriodIndex(0);
          }
        } else {
          setColumnOrder([]);
        }

        // 5. Set Chart Visibility
        setChartVisibleColumns(chartVisibility);

        // 6. Set Base Period Index (if not already set by default fallback above)
        if (basePeriod !== undefined && basePeriod !== null) {
          setBasePeriodIndex(basePeriod);
        } else if (effectivePeriodSelection !== defaultPeriodSelection) {
          // Only set to null if we're not using the default (default already set it to 0)
          setBasePeriodIndex(0); // Default to first column as base period
        }

        // Mark config as loaded for this user
        configLoadedRef.current = true;
        currentUserIdRef.current = userId;

      } catch (error) {
        console.error('Error loading configuration:', error);
      }
    };

    loadConfig();
  }, [user]); // Re-run when user changes

  
  // Track previous columnOrder IDs to detect actual new columns (not just re-renders)
  const prevColumnOrderIds = React.useRef([]);
  
  // Update chart visibility when columnOrder changes - ONLY for genuinely new columns
  useEffect(() => {
    const currentIds = columnOrder.map(col => col.id);
    const prevIds = prevColumnOrderIds.current;
    
    // Find columns that are truly new (not present in previous render)
    const trulyNewColumns = currentIds.filter(id => !prevIds.includes(id));
    
    // Update the ref for next comparison
    prevColumnOrderIds.current = currentIds;
    
    setChartVisibleColumns(prev => {
      let updated = [...prev];
      let changed = false;
      
      // Only add TRULY new columns (ones that weren't in the previous columnOrder)
      // This prevents re-adding columns that were manually hidden
      if (trulyNewColumns.length > 0) {
        trulyNewColumns.forEach(id => {
          if (!updated.includes(id)) {
            updated.push(id);
            changed = true;
          }
        });
      }
      
      // Remove columns that no longer exist in columnOrder
      const filtered = updated.filter(id => currentIds.includes(id));
      if (filtered.length !== updated.length) {
        updated = filtered;
        changed = true;
      }
      
      // Only save if something actually changed
      if (changed) {
        saveChartVisibilityToBackend(updated);
      }
      
      return updated;
    });
  }, [columnOrder]);

  // Helper function to save chart visibility to backend (uses user preferences API)
  const saveChartVisibilityToBackend = async (visibility) => {
    try {
      await updatePreferences({ chart_visible_columns: visibility });
    } catch (error) {
      console.error('Failed to save chart visibility to backend:', error);
    }
  };

  // Values to expose in the context - MEMOIZED to prevent infinite re-renders
  const value = useMemo(() => ({
    availableFilters,
    columnOrder,
    updateColumnOrder,
    addColumn,
    removeColumn,
    clearAllColumns,
    generateData,
    dataGenerated,
    fullYear,
    quarters,
    saveAsStandardSelection,
    clearStandardSelection,
    basePeriodIndex,
    setBasePeriod,
    clearBasePeriod,
    chartVisibleColumns,
    toggleChartColumnVisibility,
    isColumnVisibleInChart,
    // New multi-month range functions
    areMonthsSequential,
    formatMonthRange,
    createCustomRange,
    selectedColumnIndex,
    setSelectedColumnIndex,
    setSelectedColumn,
    // expose selectedDivision so dashboard radio selection is available everywhere
    selectedDivision,
    addYear,
    saveUserPreferences
  }), [
    availableFilters,
    columnOrder,
    updateColumnOrder,
    addColumn,
    removeColumn,
    clearAllColumns,
    generateData,
    dataGenerated,
    fullYear,
    quarters,
    saveAsStandardSelection,
    clearStandardSelection,
    basePeriodIndex,
    setBasePeriod,
    clearBasePeriod,
    chartVisibleColumns,
    toggleChartColumnVisibility,
    isColumnVisibleInChart,
    areMonthsSequential,
    formatMonthRange,
    createCustomRange,
    selectedColumnIndex,
    setSelectedColumnIndex,
    setSelectedColumn,
    selectedDivision,
    saveUserPreferences
  ]);
  
  return (
    <FilterContext.Provider value={value}>
      {children}
    </FilterContext.Provider>
  );
};