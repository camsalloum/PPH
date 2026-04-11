import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useExcelData } from './ExcelDataContext';
import { useFilter } from './FilterContext';
import { convertPeriodToMonths, getPeriodKey } from '../utils/periodHelpers';

/**
 * Context for managing Sales by Country data
 * Provides centralized data fetching and caching to avoid redundant API calls
 */
const SalesCountryContext = createContext(null);

export const useSalesCountry = () => {
  const context = useContext(SalesCountryContext);
  if (!context) {
    throw new Error('useSalesCountry must be used within SalesCountryProvider');
  }
  return context;
};

export const SalesCountryProvider = ({ children }) => {
  const { selectedDivision } = useExcelData();
  const { columnOrder } = useFilter();
  
  // Centralized state
  const [countries, setCountries] = useState([]);
  const [salesData, setSalesData] = useState(new Map()); // Map<periodKey, countryData[]>
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState(0);
  
  // Track ongoing requests to prevent duplicates
  const pendingRequests = useRef(new Set());
  
  /**
   * Fetch countries list from database
   */
  const fetchCountries = useCallback(async () => {
    if (!selectedDivision) {
      setCountries([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/countries-db?division=${selectedDivision}`);
      const result = await response.json();
      
      if (result.success) {
        const countryNames = [...new Set(result.data.map(item => item.country))];
        setCountries(countryNames);
      } else {
        throw new Error(result.message || 'Failed to load countries');
      }
    } catch (err) {
      console.error('❌ Context: Error loading countries:', err);
      setError(err.message);
      setCountries([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDivision]);
  
  /**
   * Fetch sales data for a specific period
   */
  const fetchSalesForPeriod = useCallback(async (column) => {
    if (!selectedDivision || !column) return;
    
    // Only fetch for FP division (others show "Coming Soon")
    if (selectedDivision !== 'FP') {
      return;
    }
    
    const periodKey = getPeriodKey(column);
    
    // Check if already fetching this period
    if (pendingRequests.current.has(periodKey)) {
      return;
    }
    
    // Check if data already exists
    if (salesData.has(periodKey)) {
      return;
    }
    
    // Mark as pending
    pendingRequests.current.add(periodKey);
    
    try {
      const months = convertPeriodToMonths(column);
      
      const response = await fetch('/api/sales-by-country-db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          division: selectedDivision,
          year: column.year,
          months: months,
          dataType: column.type || 'Actual'
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Store in Map
        setSalesData(prev => {
          const newMap = new Map(prev);
          newMap.set(periodKey, result.data);
          return newMap;
        });
      } else {
        throw new Error(result.message || 'Failed to load sales data');
      }
    } catch (err) {
      console.error(`❌ Context: Error loading sales data for ${periodKey}:`, err);
      setError(err.message);
    } finally {
      // Remove from pending
      pendingRequests.current.delete(periodKey);
    }
  }, [selectedDivision, salesData]);
  
  /**
   * Fetch sales data for multiple periods (batched)
   */
  const fetchSalesForPeriods = useCallback(async (columns) => {
    if (!columns || columns.length === 0) return;
    
    setLoading(true);
    setError(null);
    
    // Fetch all periods in parallel
    try {
      await Promise.all(columns.map(column => fetchSalesForPeriod(column)));
    } catch (err) {
      console.error('❌ Context: Error in batch fetch:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fetchSalesForPeriod]);
  
  /**
   * Get sales data for a specific period
   */
  const getSalesDataForPeriod = useCallback((column) => {
    if (!column) return [];
    const periodKey = getPeriodKey(column);
    return salesData.get(periodKey) || [];
  }, [salesData]);
  
  /**
   * Get country sales amount for a specific period
   */
  const getCountrySalesAmount = useCallback((countryName, column) => {
    const data = getSalesDataForPeriod(column);
    const countryData = data.find(item => 
      item.country?.toLowerCase() === countryName?.toLowerCase()
    );
    return countryData ? countryData.value : 0;
  }, [getSalesDataForPeriod]);
  
  /**
   * Get country percentage for a specific period
   */
  const getCountryPercentage = useCallback((countryName, column) => {
    const data = getSalesDataForPeriod(column);
    const total = data.reduce((sum, item) => sum + (item.value || 0), 0);
    const value = getCountrySalesAmount(countryName, column);
    if (total === 0) return 0;
    return (value / total) * 100;
  }, [getSalesDataForPeriod, getCountrySalesAmount]);
  
  /**
   * Refetch all data (useful for manual refresh)
   */
  const refetchData = useCallback(async () => {
    // Clear cached data
    setSalesData(new Map());
    pendingRequests.current.clear();
    
    // Refetch countries
    await fetchCountries();
    
    // Refetch sales data for all periods
    if (columnOrder.length > 0) {
      await fetchSalesForPeriods(columnOrder);
    }
  }, [fetchCountries, fetchSalesForPeriods, columnOrder]);
  
  /**
   * Load countries when division changes
   */
  useEffect(() => {
    fetchCountries();
    // Clear sales data when division changes
    setSalesData(new Map());
    pendingRequests.current.clear();
  }, [fetchCountries]);
  
  /**
   * Load sales data when column order changes
   */
  useEffect(() => {
    if (columnOrder.length > 0 && countries.length > 0) {
      // Only fetch periods that haven't been fetched yet
      const periodsToFetch = columnOrder.filter(col => {
        const key = getPeriodKey(col);
        return !salesData.has(key) && !pendingRequests.current.has(key);
      });
      
      if (periodsToFetch.length > 0) {
        fetchSalesForPeriods(periodsToFetch);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnOrder, countries, fetchSalesForPeriods]); // Removed salesData to prevent infinite loop
  
  const value = {
    // State
    countries,
    salesData: Object.fromEntries(salesData), // Convert Map to plain object for easier consumption
    loading,
    error,
    selectedPeriodIndex,
    
    // Actions
    setSelectedPeriodIndex,
    fetchCountries,
    fetchSalesForPeriod,
    fetchSalesForPeriods,
    getSalesDataForPeriod,
    getCountrySalesAmount,
    getCountryPercentage,
    refetchData
  };
  
  return (
    <SalesCountryContext.Provider value={value}>
      {children}
    </SalesCountryContext.Provider>
  );
};




















