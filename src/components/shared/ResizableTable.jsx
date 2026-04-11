/**
 * ResizableTable.jsx
 * Shared components for resizable table columns
 * 
 * Usage for Ant Design Tables:
 * 1. Import: import { ResizableTitle, useResizableColumns } from '../shared/ResizableTable';
 * 2. Use hook: const [resizableColumns] = useResizableColumns(columns, 'unique-table-key');
 * 3. Add to Table: <Table components={{ header: { cell: ResizableTitle } }} columns={resizableColumns} />
 * 
 * Column widths are automatically saved to user preferences (backend) for persistence across sessions/devices.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Resizable } from 'react-resizable';
import axios from 'axios';
import { getCachedPreferences, invalidatePreferencesCache } from '../../utils/deduplicatedFetch';
import 'react-resizable/css/styles.css';

// Debounce helper to avoid too many API calls
const debounce = (func, wait) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * Save column widths to backend user preferences
 */
const saveColumnWidthsToBackend = async (storageKey, widths) => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      return false;
    }
    
    // Get current preferences (uses 30s TTL cache)
    const currentPrefs = await getCachedPreferences();
    
    const existingColumnWidths = currentPrefs?.preferences?.column_widths || {};
    
    // Merge with existing column widths
    const updatedColumnWidths = {
      ...existingColumnWidths,
      [storageKey]: widths
    };
    
    // Save to backend
    await axios.put('/api/auth/preferences', {
      column_widths: updatedColumnWidths
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    invalidatePreferencesCache();
    
    return true;
  } catch (error) {
    console.warn('Failed to save column widths to backend:', error.message);
    return false;
  }
};

/**
 * Load column widths from backend user preferences
 */
const loadColumnWidthsFromBackend = async (storageKey) => {
  try {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;
    
    // Uses 30s TTL cache — multiple tables mounting together share one request
    const response = await getCachedPreferences();
    
    const columnWidths = response?.preferences?.column_widths;
    if (columnWidths && columnWidths[storageKey]) {
      return columnWidths[storageKey];
    }
    return null;
  } catch (error) {
    console.warn('Failed to load column widths from backend:', error.message);
    return null;
  }
};

/**
 * Resizable header cell component for Ant Design Tables
 * Wraps the default <th> with Resizable from react-resizable
 */
export const ResizableTitle = (props) => {
  const { onResize, width, ...restProps } = props;

  // If no width specified, render normal th
  if (!width) {
    return <th {...restProps} />;
  }

  return (
    <Resizable
      width={width}
      height={0}
      handle={
        <span
          className="react-resizable-handle"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
          }}
        />
      }
      onResize={onResize}
      draggableOpts={{ enableUserSelectHack: false }}
    >
      <th {...restProps} />
    </Resizable>
  );
};

/**
 * Hook for managing resizable columns with backend persistence
 * @param {Array} initialColumns - Initial column definitions
 * @param {string} storageKey - Unique key for persistence
 * @returns {Array} [resizableColumns, setColumns, resetColumns]
 */
export const useResizableColumns = (initialColumns, storageKey) => {
  const [columns, setColumns] = useState(initialColumns);
  const [isLoaded, setIsLoaded] = useState(false);
  const saveTimeoutRef = useRef(null);
  
  // Debounced save function (saves 1 second after last resize)
  const debouncedSave = useCallback(
    debounce((widths) => {
      // Save to localStorage as fallback
      try {
        localStorage.setItem(`table-widths-${storageKey}`, JSON.stringify(widths));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }
      
      // Save to backend
      saveColumnWidthsToBackend(storageKey, widths);
    }, 1000),
    [storageKey]
  );

  // Load saved widths on mount
  useEffect(() => {
    const loadWidths = async () => {
      // First try backend
      const backendWidths = await loadColumnWidthsFromBackend(storageKey);
      
      if (backendWidths) {
        setColumns(initialColumns.map(col => {
          const key = col.dataIndex || col.key;
          return {
            ...col,
            width: backendWidths[key] !== undefined ? backendWidths[key] : col.width
          };
        }));
        setIsLoaded(true);
        return;
      }
      
      // Fallback to localStorage
      try {
        const saved = localStorage.getItem(`table-widths-${storageKey}`);
        if (saved) {
          const savedWidths = JSON.parse(saved);
          setColumns(initialColumns.map(col => {
            const key = col.dataIndex || col.key;
            return {
              ...col,
              width: savedWidths[key] !== undefined ? savedWidths[key] : col.width
            };
          }));
        }
      } catch (e) {
        console.warn('Failed to load from localStorage:', e);
      }
      setIsLoaded(true);
    };
    
    loadWidths();
  }, [storageKey]); // Only run on mount and when storageKey changes

  // Update columns when initialColumns change (but preserve saved widths)
  useEffect(() => {
    if (!isLoaded) return;
    
    setColumns(prev => {
      // Build a map of current widths
      const currentWidths = {};
      prev.forEach(col => {
        const key = col.dataIndex || col.key;
        if (key) currentWidths[key] = col.width;
      });
      
      // Apply current widths to new columns
      return initialColumns.map(col => {
        const key = col.dataIndex || col.key;
        return {
          ...col,
          width: currentWidths[key] !== undefined ? currentWidths[key] : col.width
        };
      });
    });
  }, [initialColumns, isLoaded]);

  const handleResize = useCallback((index) => (e, { size }) => {
    setColumns(prev => {
      const newColumns = [...prev];
      const newWidth = Math.max(50, size.width); // Minimum 50px
      newColumns[index] = { ...newColumns[index], width: newWidth };
      
      // Build widths object for saving
      const widths = {};
      newColumns.forEach(col => {
        const key = col.dataIndex || col.key;
        if (key) {
          widths[key] = col.width;
        }
      });
      
      // Trigger debounced save
      debouncedSave(widths);
      
      return newColumns;
    });
  }, [debouncedSave]);

  // Reset columns to default widths
  const resetColumns = useCallback(async () => {
    setColumns(initialColumns);
    
    // Clear from localStorage
    try {
      localStorage.removeItem(`table-widths-${storageKey}`);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
    
    // Clear from backend
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        const currentPrefs = await getCachedPreferences();
        
        const existingColumnWidths = currentPrefs?.preferences?.column_widths || {};
        delete existingColumnWidths[storageKey];
        
        await axios.put('/api/auth/preferences', {
          column_widths: existingColumnWidths
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        invalidatePreferencesCache();
      }
    } catch (e) {
      console.warn('Failed to clear from backend:', e);
    }
  }, [initialColumns, storageKey]);

  // Build resizable columns with onHeaderCell handlers
  const resizableColumns = columns.map((col, index) => ({
    ...col,
    onHeaderCell: (column) => ({
      width: column.width,
      onResize: handleResize(index),
    }),
  }));

  return [resizableColumns, setColumns, resetColumns];
};

/**
 * Hook for native HTML table column resizing (with backend persistence)
 * @param {Object} initialWidths - Initial column widths { columnKey: width }
 * @param {string} storageKey - Unique key for persistence
 * @returns {Object} { widths, startResize, resetWidths }
 */
export const useNativeTableResize = (initialWidths, storageKey) => {
  const [widths, setWidths] = useState(initialWidths);
  const [resizing, setResizing] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);
  
  // Debounced save function
  const debouncedSave = useCallback(
    debounce((newWidths) => {
      // Save to localStorage as fallback
      try {
        localStorage.setItem(`table-widths-${storageKey}`, JSON.stringify(newWidths));
      } catch (e) {
        console.warn('Failed to save to localStorage:', e);
      }
      
      // Save to backend
      saveColumnWidthsToBackend(storageKey, newWidths);
    }, 1000),
    [storageKey]
  );

  // Load saved widths on mount
  useEffect(() => {
    const loadWidths = async () => {
      // First try backend
      const backendWidths = await loadColumnWidthsFromBackend(storageKey);
      
      if (backendWidths) {
        setWidths({ ...initialWidths, ...backendWidths });
        setIsLoaded(true);
        return;
      }
      
      // Fallback to localStorage
      try {
        const saved = localStorage.getItem(`table-widths-${storageKey}`);
        if (saved) {
          setWidths({ ...initialWidths, ...JSON.parse(saved) });
        }
      } catch (e) {
        console.warn('Failed to load from localStorage:', e);
      }
      setIsLoaded(true);
    };
    
    loadWidths();
  }, [storageKey]);

  // Mouse move handler during resize
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e) => {
      const diff = e.clientX - resizing.startX;
      const newWidth = Math.max(50, resizing.startWidth + diff);
      setWidths(prev => {
        const updated = {
          ...prev,
          [resizing.columnKey]: newWidth
        };
        return updated;
      });
    };

    const handleMouseUp = () => {
      // Trigger save on mouse up
      setWidths(prev => {
        debouncedSave(prev);
        return prev;
      });
      setResizing(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, debouncedSave]);

  const startResize = useCallback((columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing({
      columnKey,
      startX: e.clientX,
      startWidth: widths[columnKey] || 100
    });
  }, [widths]);

  const resetWidths = useCallback(async () => {
    setWidths(initialWidths);
    
    // Clear from localStorage
    try {
      localStorage.removeItem(`table-widths-${storageKey}`);
    } catch (e) {
      console.warn('Failed to clear localStorage:', e);
    }
    
    // Clear from backend
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        const currentPrefs = await getCachedPreferences();
        
        const existingColumnWidths = currentPrefs?.preferences?.column_widths || {};
        delete existingColumnWidths[storageKey];
        
        await axios.put('/api/auth/preferences', {
          column_widths: existingColumnWidths
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
        invalidatePreferencesCache();
      }
    } catch (e) {
      console.warn('Failed to clear from backend:', e);
    }
  }, [initialWidths, storageKey]);

  return { widths, startResize, resetWidths, isResizing: !!resizing };
};

/**
 * Resizable header cell for native HTML tables
 */
export const ResizableTh = ({ 
  children, 
  columnKey, 
  width, 
  onStartResize, 
  style = {},
  ...props 
}) => {
  return (
    <th
      {...props}
      style={{
        ...style,
        width: width ? `${width}px` : style.width,
        minWidth: width ? `${width}px` : style.minWidth,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {children}
      <div
        className="resize-handle"
        onMouseDown={(e) => onStartResize(columnKey, e)}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '5px',
          cursor: 'col-resize',
          background: 'transparent',
          zIndex: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(24, 144, 255, 0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
        }}
      />
    </th>
  );
};

export default { ResizableTitle, useResizableColumns, useNativeTableResize, ResizableTh };
