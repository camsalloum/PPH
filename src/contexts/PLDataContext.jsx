/**
 * P&L Data Context
 * Provides P&L data from the database instead of Excel files
 * Maintains backward compatibility with existing components by transforming
 * database records to Excel-like format
 */
import React, { createContext, useState, useContext, useCallback, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { useExcelData } from './ExcelDataContext';
import { transformDbToExcelFormat } from '../utils/plDataTransform';

const PLDataContext = createContext();

export const usePLData = () => {
  const context = useContext(PLDataContext);
  if (!context) {
    throw new Error('usePLData must be used within a PLDataProvider');
  }
  return context;
};

export const PLDataProvider = ({ children }) => {
  const { selectedDivision } = useExcelData();
  
  // Raw database records by division
  const [dbRecords, setDbRecords] = useState({});
  
  // Transformed Excel-like data by division (for backward compatibility)
  const [plData, setPlData] = useState({});
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  const loadingRef = useRef(false);
  const loadedDivisionsRef = useRef(new Set());
  
  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  /**
   * Load P&L data from database for a specific division
   */
  const loadPLData = useCallback(async (division = null) => {
    const targetDivision = division || selectedDivision;
    
    if (!targetDivision) {
      return;
    }
    
    // Check if already loaded
    if (loadedDivisionsRef.current.has(targetDivision)) {
      return;
    }
    
    // Prevent concurrent loads
    if (loadingRef.current) {
      return;
    }
    
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    
    try {

      // Use axios so AuthContext interceptor can refresh tokens automatically
      const response = await axios.get(`${API_BASE_URL}/api/pl/${targetDivision.toLowerCase()}/data`, {
        headers: { 'Content-Type': 'application/json' }
      });

      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load P&L data');
      }
      
      
      // Store raw database records
      setDbRecords(prev => ({
        ...prev,
        [targetDivision]: result.data
      }));
      
      // Transform to Excel-like format for backward compatibility
      const excelFormat = transformDbToExcelFormat(result.data);
      
      setPlData(prev => ({
        ...prev,
        [targetDivision]: excelFormat
      }));
      
      loadedDivisionsRef.current.add(targetDivision);
      setDataLoaded(true);
      
    } catch (err) {
      console.error(`[PLDataContext] Error loading P&L data for ${targetDivision}:`, err);
      setError(err.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [selectedDivision, API_BASE_URL]);

  /**
   * Refresh P&L data (admin only)
   */
  const refreshPLData = useCallback(async (division = null) => {
    const targetDivision = division || selectedDivision;
    
    if (!targetDivision) {
      throw new Error('No division selected');
    }
    
    setLoading(true);
    setError(null);
    
    try {

      // Use axios so AuthContext interceptor can refresh tokens automatically
      const response = await axios.post(
        `${API_BASE_URL}/api/pl/${targetDivision.toLowerCase()}/refresh`,
        {},
        { headers: { 'Content-Type': 'application/json' } }
      );

      const result = response.data;
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to refresh P&L data');
      }
      
      
      // Clear cached data for this division so it will be reloaded
      loadedDivisionsRef.current.delete(targetDivision);
      
      // Reload the data
      await loadPLData(targetDivision);
      
      return result;
      
    } catch (err) {
      console.error(`[PLDataContext] Error refreshing P&L data for ${targetDivision}:`, err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [selectedDivision, API_BASE_URL, loadPLData]);

  /**
   * Clear cached data (e.g., when logging out)
   */
  const clearCache = useCallback(() => {
    setDbRecords({});
    setPlData({});
    loadedDivisionsRef.current.clear();
    setDataLoaded(false);
  }, []);

  /**
   * Force reload data for a division
   */
  const forceReload = useCallback(async (division = null) => {
    const targetDivision = division || selectedDivision;
    if (targetDivision) {
      loadedDivisionsRef.current.delete(targetDivision);
      await loadPLData(targetDivision);
    }
  }, [selectedDivision, loadPLData]);

  // Auto-load P&L data when division changes
  useEffect(() => {
    if (selectedDivision && !loadedDivisionsRef.current.has(selectedDivision)) {
      loadPLData(selectedDivision);
    }
  }, [selectedDivision, loadPLData]);

  // Memoize the context value
  const contextValue = useMemo(() => ({
    // Data in Excel-like format (for backward compatibility with computeCellValue)
    plData,
    
    // Raw database records (for components that want direct access)
    dbRecords,
    
    // Current division's P&L data in Excel format
    currentPlData: plData[selectedDivision] || [],
    
    // Current division's raw records
    currentDbRecords: dbRecords[selectedDivision] || [],
    
    // Loading state
    loading,
    error,
    dataLoaded,
    
    // Actions
    loadPLData,
    refreshPLData,
    clearCache,
    forceReload
  }), [
    plData,
    dbRecords,
    selectedDivision,
    loading,
    error,
    dataLoaded,
    loadPLData,
    refreshPLData,
    clearCache,
    forceReload
  ]);

  return (
    <PLDataContext.Provider value={contextValue}>
      {children}
    </PLDataContext.Provider>
  );
};

export default PLDataContext;
