import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { getUniqueProductGroups } from './getUniqueProductGroups';
import { deduplicatedFetch } from '../utils/deduplicatedFetch';

const SalesDataContext = createContext();

export const useSalesData = () => {
  const context = useContext(SalesDataContext);
  if (!context) {
    throw new Error('useSalesData must be used within a SalesDataProvider');
  }
  return context;
};

export const SalesDataProvider = ({ children }) => {
  const [salesData, setSalesData] = useState({});
  const [divisions, setDivisions] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('FP-Product Group'); // Default to FP
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Sales rep configuration state
  const [defaultReps, setDefaultReps] = useState([]);
  const [salesRepGroups, setSalesRepGroups] = useState({});
  const [salesRepConfigLoaded, setSalesRepConfigLoaded] = useState(false);
  const [configLoadedForDivision, setConfigLoadedForDivision] = useState(null); // Track which division config is loaded for
  const salesRepConfigInFlightRef = useRef(null);
  const salesRepConfigCacheRef = useRef(new Map());
  
  // Function to load Sales data from database (for FP) or Excel (for other divisions)
  const loadSalesData = useCallback(async () => {
    if (loading || dataLoaded) {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Load divisions from database instead of Excel
      const divisions = ['FP', 'SB', 'TF', 'HCM'];
      setDivisions(divisions);
      
      // Create placeholder data structure for backward compatibility
      const parsedData = {};
      divisions.forEach(division => {
        parsedData[division] = []; // Empty array for backward compatibility
      });
      
      setSalesData(parsedData);
      setDataLoaded(true);
      
      // Set default selected division if none is selected
      if (!selectedDivision && divisions.length > 0) {
        setSelectedDivision(divisions[0]);
      }
      
      return parsedData;
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [loading, dataLoaded, selectedDivision]);

  // Function to load sales rep configuration
  const loadSalesRepConfig = useCallback(async (forceReload = false, division = 'FP') => {
    const cacheKey = String(division || 'FP').toUpperCase();
    const now = Date.now();
    const cached = salesRepConfigCacheRef.current.get(cacheKey);

    if (!forceReload && cached && (now - cached.ts < 2 * 60 * 1000)) {
      setDefaultReps(cached.defaults);
      setSalesRepGroups(cached.groups);
      setSalesRepConfigLoaded(true);
      setConfigLoadedForDivision(cacheKey);
      return;
    }

    // Only reload if forced, not loaded yet, or division changed
    if (salesRepConfigLoaded && !forceReload && configLoadedForDivision === division) {
      return;
    }

    if (salesRepConfigInFlightRef.current && !forceReload) {
      return salesRepConfigInFlightRef.current;
    }
    
    const requestPromise = (async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      // Fetch defaults and groups in parallel
      const [defaultsResponse, groupsResponse] = await Promise.all([
        deduplicatedFetch(`/api/sales-reps-defaults?division=${division}`, { headers }),
        deduplicatedFetch(`/api/sales-rep-groups-universal?division=${division}`, { headers })
      ]);
      
      // Process defaults
      let defaults = [];
      if (defaultsResponse.ok) {
        const defaultsResult = await defaultsResponse.json();
        if (defaultsResult.success) {
          defaults = defaultsResult.defaults || defaultsResult.data || [];
        }
      }
      
      // Process groups
      let groups = {};
      if (groupsResponse.ok) {
        const groupsResult = await groupsResponse.json();
        if (groupsResult.success) {
          groups = groupsResult.data || {};
        }
      }
      
      setDefaultReps(defaults);
      setSalesRepGroups(groups);
      setSalesRepConfigLoaded(true);
      setConfigLoadedForDivision(division);
      salesRepConfigCacheRef.current.set(cacheKey, { defaults, groups, ts: Date.now() });
      } catch (error) {
        console.error('Error loading sales rep configuration:', error);
        setDefaultReps([]);
        setSalesRepGroups({});
        setConfigLoadedForDivision(null);
      } finally {
        salesRepConfigInFlightRef.current = null;
      }
    })();

    salesRepConfigInFlightRef.current = requestPromise;
    return requestPromise;
  }, []); // Empty dependency array since we handle state changes internally

  // Function to refresh sales rep configuration
  const refreshSalesRepConfig = useCallback(async (division = 'FP') => {
    setSalesRepConfigLoaded(false);
    setConfigLoadedForDivision(null);
    salesRepConfigCacheRef.current.delete(String(division || 'FP').toUpperCase());
    await loadSalesRepConfig(true, division);
  }, [loadSalesRepConfig]);

  // Function to get product groups from the selected division
  const getProductGroups = useCallback(() => {
    if (!salesData[selectedDivision]) return [];
    
    const sheetData = salesData[selectedDivision];
    const productGroups = [];
    
    // Extract unique product groups from column A (starting from row 4, index 3)
    for (let i = 3; i < sheetData.length; i++) {
      const row = sheetData[i];
      if (row && row[0] && row[3]) { // Product Group name exists and has Figures Heads
        const productGroup = row[0];
        const figuresHead = row[3];
        
        // Group by product name
        if (!productGroups.find(pg => pg.name === productGroup)) {
          productGroups.push({
            name: productGroup,
            material: row[1] || '',
            process: row[2] || '',
            metrics: []
          });
        }
        
        // Add metric to the product group
        const existingGroup = productGroups.find(pg => pg.name === productGroup);
        if (existingGroup && !existingGroup.metrics.find(m => m.type === figuresHead)) {
          existingGroup.metrics.push({
            type: figuresHead,
            rowIndex: i,
            data: row.slice(4) // Data starts from column 5 (index 4)
          });
        }
      }
    }
    
    return productGroups;
  }, [salesData, selectedDivision]);

  // Function to get unique product groups for a specific sales rep and variable
  const getUniqueProductGroupsForRep = useCallback((rep, selectedVariable, divisionCode, salesRepGroups) => {
    return getUniqueProductGroups(rep, selectedVariable, divisionCode, salesData, salesRepGroups);
  }, [salesData]);

  // Load sales rep configuration only when authenticated (defer for login page)
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return; // Skip on login page — no auth yet
    loadSalesRepConfig();
  }, [loadSalesRepConfig]);

  const value = {
    salesData,
    divisions,
    selectedDivision,
    setSelectedDivision,
    loading,
    error,
    dataLoaded,
    loadSalesData,
    getProductGroups,
    getUniqueProductGroupsForRep,
    defaultReps,
    salesRepGroups,
    loadSalesRepConfig,
    refreshSalesRepConfig,
    salesRepConfigLoaded
  };

  return (
    <SalesDataContext.Provider value={value}>
      {children}
    </SalesDataContext.Provider>
  );
};