/**
 * @fileoverview Country Region Service
 * @description Provides country-to-region mapping with database-first approach
 * Maintains a cached sync version for performance-critical rendering
 * 
 * Created: June 2025
 */

import { fetchCountries } from './countriesService';

// Cache for region lookups
let regionCache = new Map();
let cacheLoaded = false;
let cacheLoadPromise = null;

// Fallback regional mapping (minimal - only for critical lookups before DB loads)
// These should match exactly what's in master_countries table
const fallbackRegionalMapping = {
  'United Arab Emirates': 'UAE',
  'UAE': 'UAE',
  'Saudi Arabia': 'Arabian Peninsula',
  'Kuwait': 'Arabian Peninsula',
  'Qatar': 'Arabian Peninsula',
  'Bahrain': 'Arabian Peninsula',
  'Oman': 'Arabian Peninsula',
};

/**
 * Load region data from database into cache
 * Called on app startup
 */
export const loadRegionCache = async () => {
  if (cacheLoadPromise) return cacheLoadPromise;
  
  cacheLoadPromise = (async () => {
    try {
      const countries = await fetchCountries({ forceRefresh: true });
      
      if (countries && countries.length > 0) {
        regionCache.clear();
        
        countries.forEach(country => {
          if (country.region) {
            // Add main name
            regionCache.set(country.country_name.toLowerCase(), country.region);
            // Add uppercase version
            regionCache.set(country.country_name.toUpperCase(), country.region);
            // Add exact case
            regionCache.set(country.country_name, country.region);
            
            // Add ISO codes
            if (country.country_code_2) {
              regionCache.set(country.country_code_2.toLowerCase(), country.region);
              regionCache.set(country.country_code_2.toUpperCase(), country.region);
            }
            if (country.country_code_3) {
              regionCache.set(country.country_code_3.toLowerCase(), country.region);
              regionCache.set(country.country_code_3.toUpperCase(), country.region);
            }
            
            // Add aliases
            if (country.aliases && Array.isArray(country.aliases)) {
              country.aliases.forEach(aliasObj => {
                const alias = aliasObj.alias || aliasObj;
                if (alias) {
                  regionCache.set(alias.toLowerCase(), country.region);
                  regionCache.set(alias.toUpperCase(), country.region);
                  regionCache.set(alias, country.region);
                }
              });
            }
          }
        });
        
        cacheLoaded = true;
        return true;
      }
    } catch (error) {
      console.warn('⚠️ RegionService: Could not load from database:', error.message);
    }
    return false;
  })();
  
  return cacheLoadPromise;
};

/**
 * Get region for a country (sync version using cache)
 * This is the preferred method for rendering - uses cached data
 * 
 * @param {string} countryName - Country name
 * @returns {string} Region name or 'Unassigned'
 */
export const getRegionSync = (countryName) => {
  if (!countryName) return 'Unassigned';
  
  // Try exact match first
  if (regionCache.has(countryName)) {
    return regionCache.get(countryName);
  }
  
  // Try lowercase
  const lowerName = countryName.toLowerCase();
  if (regionCache.has(lowerName)) {
    return regionCache.get(lowerName);
  }
  
  // Try uppercase
  const upperName = countryName.toUpperCase();
  if (regionCache.has(upperName)) {
    return regionCache.get(upperName);
  }
  
  // Fuzzy matching for special cases
  if (lowerName.includes('emirates') || lowerName === 'uae') {
    return 'UAE';
  }
  if (lowerName.includes('saudi') || lowerName === 'ksa' || lowerName.includes('kingdom of saudi')) {
    return 'Arabian Peninsula';
  }
  if (lowerName.includes('congo')) {
    return 'Southern Africa';
  }
  
  // Check fallback
  if (fallbackRegionalMapping[countryName]) {
    return fallbackRegionalMapping[countryName];
  }
  
  // Log unassigned country for debugging
  console.warn(`⚠️ RegionService: Country "${countryName}" not found in cache (cache size: ${regionCache.size})`);
  
  return 'Unassigned';
};

/**
 * Get region for a country (async version - queries API if needed)
 * Use this when you need guaranteed fresh data
 * 
 * @param {string} countryName - Country name
 * @returns {Promise<string>} Region name or 'Unassigned'
 */
export const getRegionAsync = async (countryName) => {
  if (!countryName) return 'Unassigned';
  
  // Ensure cache is loaded
  if (!cacheLoaded) {
    await loadRegionCache();
  }
  
  return getRegionSync(countryName);
};

/**
 * Check if the region cache is loaded
 * @returns {boolean}
 */
export const isCacheLoaded = () => cacheLoaded;

/**
 * Clear region cache (for testing or refresh)
 */
export const clearRegionCache = () => {
  regionCache.clear();
  cacheLoaded = false;
  cacheLoadPromise = null;
};

/**
 * Get all regions with their countries (from cache)
 * @returns {Object} Map of region -> [countries]
 */
export const getRegionsWithCountries = () => {
  const regions = {};
  
  // We need to dedupe since we have multiple mappings for same country
  const processedCountries = new Set();
  
  regionCache.forEach((region, key) => {
    // Only process lowercase keys to avoid duplicates
    if (key === key.toLowerCase() && !processedCountries.has(key)) {
      if (!regions[region]) {
        regions[region] = [];
      }
      regions[region].push(key);
      processedCountries.add(key);
    }
  });
  
  return regions;
};

/**
 * Add a country to the region cache (for real-time updates)
 * @param {string} countryName - Country name
 * @param {string} region - Region name
 * @param {Array<string>} aliases - Optional aliases
 */
export const addToRegionCache = (countryName, region, aliases = []) => {
  if (!countryName || !region) return;
  
  regionCache.set(countryName.toLowerCase(), region);
  regionCache.set(countryName.toUpperCase(), region);
  regionCache.set(countryName, region);
  
  aliases.forEach(alias => {
    if (alias) {
      regionCache.set(alias.toLowerCase(), region);
      regionCache.set(alias.toUpperCase(), region);
      regionCache.set(alias, region);
    }
  });
};

// Export a compatibility layer for existing code
export const getRegionForCountry = getRegionSync;

export default {
  loadRegionCache,
  getRegionSync,
  getRegionAsync,
  getRegionForCountry,
  isCacheLoaded,
  clearRegionCache,
  getRegionsWithCountries,
  addToRegionCache
};
