import React, { createContext, useState, useContext, useCallback, useEffect, useRef, useMemo } from 'react';
import axios from 'axios';
import { deduplicatedAxiosGet } from '../utils/deduplicatedFetch';
import { useAuth } from './AuthContext';

const ExcelDataContext = createContext();

export const useExcelData = () => useContext(ExcelDataContext);

export const ExcelDataProvider = ({ children }) => {
  const { token, user, isAuthenticated } = useAuth();
  const [divisions, setDivisions] = useState([]);
  const [divisionMetadata, setDivisionMetadata] = useState([]);
  const [selectedDivision, setSelectedDivision] = useState('');
  const divisionsLoadedRef = useRef(false);
  const divisionsLoadingRef = useRef(false);
  const loadedForUserRef = useRef(null);
  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  // Load divisions from Settings API AND user's default division preference.
  // Deferred: only fires when an auth token is present (i.e., user is logged in).
  useEffect(() => {
    if (!isAuthenticated || !token) {
      divisionsLoadedRef.current = false;
      loadedForUserRef.current = null;
      setDivisions([]);
      setDivisionMetadata([]);
      setSelectedDivision('');
      return;
    }

    const loadDivisionsAndDefault = async () => {
      const userKey = user?.id || 'anonymous';

      if (divisionsLoadingRef.current) return;
      if (divisionsLoadedRef.current && loadedForUserRef.current === userKey) return;

      divisionsLoadingRef.current = true;
      
      try {
        const headers = { Authorization: `Bearer ${token}` };

        // Load divisions + user prefs in parallel instead of sequentially
        const [settingsResponse, prefsResponse] = await Promise.all([
          deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/settings/company`, { headers }).catch(() => ({ data: {} })),
          deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/auth/preferences`, { headers }).catch(() => ({ data: {} }))
        ]);

        let providedDivisions = [];
        let divisionCodes = [];

        if (settingsResponse.data?.success && Array.isArray(settingsResponse.data?.settings?.divisions)) {
          providedDivisions = settingsResponse.data.settings.divisions;
          divisionCodes = providedDivisions
            .map(d => String(d?.code || '').trim().toUpperCase())
            .filter(Boolean);
        }

        // Fallback to authenticated user divisions if settings endpoint is degraded
        if (divisionCodes.length === 0 && Array.isArray(user?.divisions)) {
          divisionCodes = user.divisions
            .map(code => String(code || '').trim().toUpperCase())
            .filter(Boolean);
          providedDivisions = divisionCodes.map(code => ({ code, name: code }));
        }

        if (divisionCodes.length === 0) {
          console.error('No divisions available from settings or user context');
          divisionsLoadedRef.current = false;
          loadedForUserRef.current = null;
          return;
        }

        setDivisions(divisionCodes);
        setDivisionMetadata(providedDivisions);
        
        // User's default division preference
        const userDefaultDivision = prefsResponse.data?.success
          ? prefsResponse.data.preferences?.default_division
          : null;
        
        // Set division: preserve current if valid, then preference, then first user division, then first available
        setSelectedDivision((current) => {
          if (current && divisionCodes.includes(current)) return current;
          if (userDefaultDivision && divisionCodes.includes(userDefaultDivision)) return userDefaultDivision;

          const firstAssignedDivision = Array.isArray(user?.divisions)
            ? user.divisions.find(code => divisionCodes.includes(String(code || '').trim().toUpperCase()))
            : null;
          if (firstAssignedDivision) return String(firstAssignedDivision || '').trim().toUpperCase();

          return divisionCodes[0];
        });

        divisionsLoadedRef.current = true;
        loadedForUserRef.current = userKey;
      } catch (error) {
        divisionsLoadedRef.current = false;
        loadedForUserRef.current = null;
        console.error('Error loading divisions:', error);
      } finally {
        divisionsLoadingRef.current = false;
      }
    };
    
    loadDivisionsAndDefault();
  }, [API_BASE_URL, isAuthenticated, token, user?.id]);
  
  const divisionNameMap = useMemo(() => {
    return divisionMetadata.reduce((acc, div) => {
      if (!div) return acc;
      const code = div.code || div.abbreviation;
      const name = div.name || div.displayName || code;
      if (code) {
        acc[code] = name;
      }
      if (div.abbreviation && !acc[div.abbreviation]) {
        acc[div.abbreviation] = name;
      }
      return acc;
    }, {});
  }, [divisionMetadata]);

  const getDivisionDisplayName = useCallback((code) => {
    if (!code) return '';
    const base = typeof code === 'string' && code.includes('-') ? code.split('-')[0] : code;
    const candidates = [code, base, typeof code === 'string' ? code.toUpperCase() : code, typeof base === 'string' ? base.toUpperCase() : base];
    for (const c of candidates) {
      if (divisionNameMap[c]) return divisionNameMap[c];
    }
    return base || code;
  }, [divisionNameMap]);

  // Values to expose in the context
  const value = {
    divisions,
    divisionMetadata,
    divisionNameMap,
    getDivisionDisplayName,
    selectedDivision,
    setSelectedDivision,
  };
  
  return (
    <ExcelDataContext.Provider value={value}>
      {children}
    </ExcelDataContext.Provider>
  );
}; 