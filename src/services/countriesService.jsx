/**
 * @fileoverview Countries Service for Frontend
 * @description API client for managing master countries reference data
 * Provides functions to fetch, lookup, and cache country data
 */

import { deduplicatedFetch } from '../utils/deduplicatedFetch';

const API_BASE = '/api/countries';

// Cache for country data to avoid repeated API calls
let countryCache = null;
let countryCacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if cache is still valid
 */
const isCacheValid = () => {
  return countryCache && countryCacheTimestamp && (Date.now() - countryCacheTimestamp < CACHE_TTL);
};

/**
 * Clear the country cache
 */
export const clearCountryCache = () => {
  countryCache = null;
  countryCacheTimestamp = null;
};

/**
 * Fetch all countries from the API
 * @param {Object} options - Filter options
 * @param {string} options.region - Filter by region
 * @param {boolean} options.active - Filter by active status
 * @param {boolean} options.withCurrency - Include only countries with currency
 * @param {boolean} options.forceRefresh - Force cache refresh
 * @returns {Promise<Array>} List of countries
 */
export const fetchCountries = async (options = {}) => {
  const { forceRefresh = false, ...filters } = options;
  
  // Return cached data if valid and no force refresh
  if (!forceRefresh && isCacheValid() && Object.keys(filters).length === 0) {
    return countryCache;
  }
  
  try {
    const params = new URLSearchParams();
    if (filters.region) params.append('region', filters.region);
    if (filters.active !== undefined) params.append('active', filters.active);
    if (filters.withCurrency) params.append('withCurrency', 'true');
    
    const queryString = params.toString();
    const url = `${API_BASE}/list${queryString ? `?${queryString}` : ''}`;
    
    const response = await deduplicatedFetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch countries: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data.success) {
      // Cache if fetching all countries (no filters)
      if (Object.keys(filters).length === 0) {
        countryCache = data.countries;
        countryCacheTimestamp = Date.now();
      }
      return data.countries;
    }
    
    throw new Error(data.error || 'Failed to fetch countries');
  } catch (error) {
    console.error('Error fetching countries:', error);
    throw error;
  }
};

/**
 * Fetch all regions with country counts
 * @returns {Promise<Array>} List of regions
 */
export const fetchRegions = async () => {
  try {
    const response = await fetch(`${API_BASE}/regions`);
    if (!response.ok) {
      throw new Error(`Failed to fetch regions: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.regions : [];
  } catch (error) {
    console.error('Error fetching regions:', error);
    throw error;
  }
};

/**
 * Lookup a country by name (handles aliases)
 * @param {string} name - Country name or alias
 * @returns {Promise<Object|null>} Country object or null if not found
 */
export const lookupCountry = async (name) => {
  if (!name) return null;
  
  try {
    const response = await fetch(`${API_BASE}/lookup/${encodeURIComponent(name)}`);
    if (!response.ok) {
      throw new Error(`Failed to lookup country: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.country : null;
  } catch (error) {
    console.error('Error looking up country:', error);
    return null;
  }
};

/**
 * Get country by ISO code
 * @param {string} code - ISO 3166-1 alpha-2 or alpha-3 code
 * @returns {Promise<Object|null>} Country object or null if not found
 */
export const getCountryByCode = async (code) => {
  if (!code) return null;
  
  try {
    const response = await fetch(`${API_BASE}/by-code/${code}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Failed to fetch country: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.country : null;
  } catch (error) {
    console.error('Error fetching country by code:', error);
    return null;
  }
};

/**
 * Fetch map data (countries with coordinates)
 * @param {string} region - Optional region filter
 * @returns {Promise<Array>} List of countries with coordinates
 */
export const fetchMapData = async (region = null) => {
  try {
    const url = region 
      ? `${API_BASE}/map-data?region=${encodeURIComponent(region)}`
      : `${API_BASE}/map-data`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch map data: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.countries : [];
  } catch (error) {
    console.error('Error fetching map data:', error);
    throw error;
  }
};

/**
 * Bulk lookup multiple countries at once
 * @param {Array<string>} names - Array of country names to lookup
 * @returns {Promise<Object>} Results with matched and unmatched countries
 */
export const bulkLookupCountries = async (names) => {
  if (!Array.isArray(names) || names.length === 0) {
    return { total: 0, matched: 0, unmatched: 0, results: [] };
  }
  
  try {
    const response = await fetch(`${API_BASE}/bulk-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ names })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to bulk lookup countries: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data : { total: 0, matched: 0, unmatched: 0, results: [] };
  } catch (error) {
    console.error('Error in bulk lookup:', error);
    throw error;
  }
};

/**
 * Get countries with their aliases
 * @returns {Promise<Array>} Countries with aliases array
 */
export const fetchCountriesWithAliases = async () => {
  try {
    const response = await fetch(`${API_BASE}/with-aliases`);
    if (!response.ok) {
      throw new Error(`Failed to fetch countries with aliases: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.success ? data.countries : [];
  } catch (error) {
    console.error('Error fetching countries with aliases:', error);
    throw error;
  }
};

/**
 * Build a lookup map from country data for fast name matching
 * @param {Array} countries - Countries data from API (with aliases)
 * @returns {Map} Map of lowercase name/alias -> country data
 */
export const buildCountryLookupMap = (countries) => {
  const lookupMap = new Map();
  
  countries.forEach(country => {
    // Add main country name
    lookupMap.set(country.country_name.toLowerCase(), country);
    
    // Add all aliases
    if (country.aliases && Array.isArray(country.aliases)) {
      country.aliases.forEach(aliasObj => {
        if (aliasObj.alias) {
          lookupMap.set(aliasObj.alias.toLowerCase(), country);
        }
      });
    }
  });
  
  return lookupMap;
};

/**
 * Get currency info for a country
 * @param {Object} country - Country object from API
 * @returns {Object} Currency info { code, name, symbol, isUAE }
 */
export const getCurrencyInfo = (country) => {
  if (!country) {
    return { code: '—', name: 'Unknown', symbol: '—', isUAE: false };
  }
  
  const isUAE = country.country_code_2 === 'AE' || 
                country.country_name === 'United Arab Emirates';
  
  return {
    code: country.currency_code || '—',
    name: country.currency_name || 'Unknown',
    symbol: country.currency_symbol || '—',
    isUAE
  };
};

/**
 * Get region for a country name using cached data
 * Falls back to 'Unassigned' if not found
 * @param {string} countryName - Country name
 * @returns {Promise<string>} Region name
 */
export const getRegionForCountry = async (countryName) => {
  if (!countryName) return 'Unassigned';
  
  const country = await lookupCountry(countryName);
  return country?.region || 'Unassigned';
};

/**
 * Transform API country data to map format [longitude, latitude]
 * For use with existing map components
 * @param {Array} countries - Countries from API
 * @returns {Object} Object with country names as keys and [lng, lat] arrays as values
 */
export const transformToCoordinatesObject = (countries) => {
  const coordsObj = {};
  
  countries.forEach(country => {
    if (country.longitude !== null && country.latitude !== null) {
      coordsObj[country.country_name] = [country.longitude, country.latitude];
    }
  });
  
  return coordsObj;
};

/**
 * Admin: Add a new country
 * @param {Object} countryData - Country data to add
 * @returns {Promise<Object>} Created country
 */
export const addCountry = async (countryData) => {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(countryData)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add country');
    }
    
    const data = await response.json();
    clearCountryCache(); // Invalidate cache
    return data.country;
  } catch (error) {
    console.error('Error adding country:', error);
    throw error;
  }
};

/**
 * Admin: Update a country
 * @param {number} countryId - Country ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated country
 */
export const updateCountry = async (countryId, updates) => {
  try {
    const response = await fetch(`${API_BASE}/${countryId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updates)
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update country');
    }
    
    const data = await response.json();
    clearCountryCache(); // Invalidate cache
    return data.country;
  } catch (error) {
    console.error('Error updating country:', error);
    throw error;
  }
};

/**
 * Admin: Add alias to a country
 * @param {number} countryId - Country ID
 * @param {string} aliasName - Alias name
 * @param {string} aliasType - Alias type (common, official, historical, abbreviation)
 * @returns {Promise<Object>} Created alias
 */
export const addCountryAlias = async (countryId, aliasName, aliasType = 'common') => {
  try {
    const response = await fetch(`${API_BASE}/${countryId}/alias`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ alias_name: aliasName, alias_type: aliasType })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add alias');
    }
    
    const data = await response.json();
    clearCountryCache(); // Invalidate cache
    return data.alias;
  } catch (error) {
    console.error('Error adding alias:', error);
    throw error;
  }
};

/**
 * Admin: Delete an alias
 * @param {number} aliasId - Alias ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteAlias = async (aliasId) => {
  try {
    const response = await fetch(`${API_BASE}/alias/${aliasId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to delete alias');
    }
    
    clearCountryCache(); // Invalidate cache
    return true;
  } catch (error) {
    console.error('Error deleting alias:', error);
    throw error;
  }
};

export default {
  fetchCountries,
  fetchRegions,
  lookupCountry,
  getCountryByCode,
  fetchMapData,
  bulkLookupCountries,
  fetchCountriesWithAliases,
  buildCountryLookupMap,
  getCurrencyInfo,
  getRegionForCountry,
  transformToCoordinatesObject,
  addCountry,
  updateCountry,
  addCountryAlias,
  deleteAlias,
  clearCountryCache
};
