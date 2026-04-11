/**
 * useDivisionNames Hook
 * Fetches division names dynamically from the API
 * 
 * This hook eliminates hardcoded division names throughout the app.
 * Divisions are configured via Company Settings and stored in company_settings.
 */

import { useState, useEffect } from 'react';
import { authClient } from './authClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

// Cache for division names to avoid repeated API calls
let divisionNamesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Hook to get division names map { code: name }
 * @returns {{ divisionNames: Object, loading: boolean, getDivisionName: (code: string) => string }}
 */
export function useDivisionNames() {
  const [divisionNames, setDivisionNames] = useState(divisionNamesCache || {});
  const [loading, setLoading] = useState(!divisionNamesCache);

  useEffect(() => {
    const fetchDivisions = async () => {
      // Use cache if still valid
      if (divisionNamesCache && (Date.now() - cacheTimestamp) < CACHE_TTL) {
        setDivisionNames(divisionNamesCache);
        setLoading(false);
        return;
      }

      // Wait for auth to be ready before fetching (avoid 401 race condition)
      // Check if authenticated, if not wait a bit and retry
      let retries = 0;
      const maxRetries = 3;
      
      while (!authClient.isAuthenticated() && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
      }
      
      // If still not authenticated after retries, skip fetch
      if (!authClient.isAuthenticated()) {
        setLoading(false);
        return;
      }

      try {
        // authClient.fetch returns parsed JSON directly, not a response object
        const data = await authClient.fetch(`${API_BASE_URL}/api/settings/divisions`);
        if (data.success && data.divisions) {
          const nameMap = {};
          data.divisions.forEach(div => {
            nameMap[div.code] = div.name;
          });
          divisionNamesCache = nameMap;
          cacheTimestamp = Date.now();
          setDivisionNames(nameMap);
        }
      } catch (err) {
        console.warn('Could not fetch division names:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDivisions();
  }, []);

  // Helper function to get a single division name
  const getDivisionName = (code) => {
    if (!code) return '';
    // Handle codes like "FP-Product Group" -> extract "FP"
    const cleanCode = code.includes('-') ? code.split('-')[0] : code;
    return divisionNames[cleanCode] || cleanCode;
  };

  return { divisionNames, loading, getDivisionName };
}

/**
 * Standalone function to get division name (for non-React contexts)
 * This is a sync fallback - returns code if cache not populated
 */
export function getDivisionNameSync(code) {
  if (!code) return '';
  const cleanCode = code.includes('-') ? code.split('-')[0] : code;
  if (divisionNamesCache) {
    return divisionNamesCache[cleanCode] || cleanCode;
  }
  return cleanCode;
}

/**
 * Clear the cache (call when divisions are updated)
 */
export function clearDivisionNamesCache() {
  divisionNamesCache = null;
  cacheTimestamp = 0;
}

export default useDivisionNames;
