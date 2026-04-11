/**
 * @fileoverview useCountries Hook
 * @description React hook for fetching and managing country data from the API
 * Provides countries data with caching and loading states
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchCountries,
  fetchCountriesWithAliases,
  buildCountryLookupMap,
  fetchRegions,
  bulkLookupCountries,
  transformToCoordinatesObject
} from '../services/countriesService';

/**
 * Hook to fetch and manage countries data
 * @param {Object} options - Hook options
 * @param {boolean} options.withAliases - Include aliases in fetch
 * @param {string} options.region - Filter by region
 * @param {boolean} options.active - Filter by active status
 * @returns {Object} { countries, loading, error, refetch, lookupMap, coordinatesMap }
 */
export const useCountries = (options = {}) => {
  const { withAliases = false, region = null, active = true } = options;
  
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lookupMap, setLookupMap] = useState(new Map());
  const [coordinatesMap, setCoordinatesMap] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      let data;
      
      if (withAliases) {
        data = await fetchCountriesWithAliases();
      } else {
        data = await fetchCountries({ region, active });
      }
      
      setCountries(data);
      
      // Build lookup map for fast name matching
      if (withAliases) {
        setLookupMap(buildCountryLookupMap(data));
      }
      
      // Build coordinates map for map components
      setCoordinatesMap(transformToCoordinatesObject(data));
      
    } catch (err) {
      console.error('useCountries error:', err);
      setError(err.message || 'Failed to fetch countries');
    } finally {
      setLoading(false);
    }
  }, [withAliases, region, active]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    countries,
    loading,
    error,
    refetch: fetchData,
    lookupMap,
    coordinatesMap
  };
};

/**
 * Hook to fetch regions
 * @returns {Object} { regions, loading, error }
 */
export const useRegions = () => {
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadRegions = async () => {
      try {
        const data = await fetchRegions();
        setRegions(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    loadRegions();
  }, []);

  return { regions, loading, error };
};

/**
 * Hook to perform bulk country lookup
 * @param {Array<string>} names - Array of country names to lookup
 * @returns {Object} { results, matched, unmatched, loading, error }
 */
export const useBulkCountryLookup = (names) => {
  const [results, setResults] = useState([]);
  const [matched, setMatched] = useState(0);
  const [unmatched, setUnmatched] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!names || names.length === 0) {
      setResults([]);
      setMatched(0);
      setUnmatched(0);
      return;
    }

    const performLookup = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const data = await bulkLookupCountries(names);
        setResults(data.results);
        setMatched(data.matched);
        setUnmatched(data.unmatched);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    performLookup();
  }, [names]);

  return { results, matched, unmatched, loading, error };
};

export default useCountries;
