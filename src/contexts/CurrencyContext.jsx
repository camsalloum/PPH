import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import { fetchCountries } from '../services/countriesService';
import { loadRegionCache } from '../services/regionService';
import axios from 'axios';
import { deduplicatedAxiosGet } from '../utils/deduplicatedFetch';

const CurrencyContext = createContext();

// Comprehensive currency mapping by country
export const currencyMapping = {
  // UAE
  'United Arab Emirates': { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  'UAE': { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  
  // USA
  'United States': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'United States of America': { code: 'USD', name: 'US Dollar', symbol: '$' },
  'USA': { code: 'USD', name: 'US Dollar', symbol: '$' },
  
  // Europe
  'Germany': { code: 'EUR', name: 'Euro', symbol: '€' },
  'France': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Italy': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Spain': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Netherlands': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Belgium': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Austria': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Ireland': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Portugal': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Greece': { code: 'EUR', name: 'Euro', symbol: '€' },
  'Finland': { code: 'EUR', name: 'Euro', symbol: '€' },
  
  // UK
  'United Kingdom': { code: 'GBP', name: 'British Pound', symbol: '£' },
  'UK': { code: 'GBP', name: 'British Pound', symbol: '£' },
  'Great Britain': { code: 'GBP', name: 'British Pound', symbol: '£' },
  'England': { code: 'GBP', name: 'British Pound', symbol: '£' },
  
  // GCC Countries
  'Saudi Arabia': { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  'Kingdom of Saudi Arabia': { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼' },
  'Kuwait': { code: 'KWD', name: 'Kuwaiti Dinar', symbol: 'د.ك' },
  'Qatar': { code: 'QAR', name: 'Qatari Riyal', symbol: '﷼' },
  'Bahrain': { code: 'BHD', name: 'Bahraini Dinar', symbol: '.د.ب' },
  'Oman': { code: 'OMR', name: 'Omani Rial', symbol: '﷼' },
  
  // Asia
  'Japan': { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  'China': { code: 'CNY', name: 'Chinese Yuan', symbol: '¥' },
  'India': { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  'South Korea': { code: 'KRW', name: 'South Korean Won', symbol: '₩' },
  'Singapore': { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  'Hong Kong': { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$' },
  'Malaysia': { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM' },
  'Thailand': { code: 'THB', name: 'Thai Baht', symbol: '฿' },
  'Indonesia': { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp' },
  'Philippines': { code: 'PHP', name: 'Philippine Peso', symbol: '₱' },
  'Vietnam': { code: 'VND', name: 'Vietnamese Dong', symbol: '₫' },
  'Pakistan': { code: 'PKR', name: 'Pakistani Rupee', symbol: '₨' },
  'Bangladesh': { code: 'BDT', name: 'Bangladeshi Taka', symbol: '৳' },
  'Sri Lanka': { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  'Taiwan': { code: 'TWD', name: 'New Taiwan Dollar', symbol: 'NT$' },
  
  // Oceania
  'Australia': { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  'New Zealand': { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$' },
  
  // Americas
  'Canada': { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
  'Mexico': { code: 'MXN', name: 'Mexican Peso', symbol: '$' },
  'Brazil': { code: 'BRL', name: 'Brazilian Real', symbol: 'R$' },
  'Argentina': { code: 'ARS', name: 'Argentine Peso', symbol: '$' },
  'Chile': { code: 'CLP', name: 'Chilean Peso', symbol: '$' },
  'Colombia': { code: 'COP', name: 'Colombian Peso', symbol: '$' },
  'Peru': { code: 'PEN', name: 'Peruvian Sol', symbol: 'S/' },
  
  // Middle East
  'Iraq': { code: 'IQD', name: 'Iraqi Dinar', symbol: 'ع.د' },
  'Iran': { code: 'IRR', name: 'Iranian Rial', symbol: '﷼' },
  'Turkey': { code: 'TRY', name: 'Turkish Lira', symbol: '₺' },
  'Israel': { code: 'ILS', name: 'Israeli Shekel', symbol: '₪' },
  'Jordan': { code: 'JOD', name: 'Jordanian Dinar', symbol: 'د.ا' },
  'Lebanon': { code: 'LBP', name: 'Lebanese Pound', symbol: 'ل.ل' },
  'Egypt': { code: 'EGP', name: 'Egyptian Pound', symbol: '£' },
  
  // Africa
  'South Africa': { code: 'ZAR', name: 'South African Rand', symbol: 'R' },
  'Nigeria': { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  'Kenya': { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  'Ghana': { code: 'GHS', name: 'Ghanaian Cedi', symbol: 'GH₵' },
  'Morocco': { code: 'MAD', name: 'Moroccan Dirham', symbol: 'د.م.' },
  'Tunisia': { code: 'TND', name: 'Tunisian Dinar', symbol: 'د.ت' },
  'Algeria': { code: 'DZD', name: 'Algerian Dinar', symbol: 'د.ج' },
  
  // Europe (non-Euro)
  'Switzerland': { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' },
  'Sweden': { code: 'SEK', name: 'Swedish Krona', symbol: 'kr' },
  'Norway': { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr' },
  'Denmark': { code: 'DKK', name: 'Danish Krone', symbol: 'kr' },
  'Poland': { code: 'PLN', name: 'Polish Zloty', symbol: 'zł' },
  'Czech Republic': { code: 'CZK', name: 'Czech Koruna', symbol: 'Kč' },
  'Hungary': { code: 'HUF', name: 'Hungarian Forint', symbol: 'Ft' },
  'Romania': { code: 'RON', name: 'Romanian Leu', symbol: 'lei' },
  'Russia': { code: 'RUB', name: 'Russian Ruble', symbol: '₽' },
  'Ukraine': { code: 'UAH', name: 'Ukrainian Hryvnia', symbol: '₴' },
};

// Get list of countries for dropdown (will be replaced with DB data in provider)
export const getCountryList = (dbCountries = null) => {
  // If DB countries provided, use them
  if (dbCountries && Array.isArray(dbCountries)) {
    return dbCountries
      .filter(c => c.is_active)
      .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))
      .map(c => c.country_name);
  }
  
  // Fallback to hardcoded mapping
  const countries = Object.keys(currencyMapping);
  // Remove duplicates (like USA/United States/UAE)
  const uniqueCountries = [...new Set(countries.map(c => {
    // Normalize to preferred name
    if (c === 'USA' || c === 'United States of America') return 'United States';
    if (c === 'UK' || c === 'Great Britain' || c === 'England') return 'United Kingdom';
    if (c === 'Kingdom of Saudi Arabia') return 'Saudi Arabia';
    if (c === 'UAE') return 'United Arab Emirates'; // Fix: Normalize UAE to full name
    return c;
  }))];
  return uniqueCountries.sort();
};

// Get currency info by currency code (e.g., 'USD', 'EUR', 'AED')
export const getCurrencyByCode = (code) => {
  if (!code) return null;
  const upperCode = code.toUpperCase();
  
  // Search through currency mapping to find matching code
  for (const [country, info] of Object.entries(currencyMapping)) {
    if (info.code === upperCode) {
      return { country, ...info };
    }
  }
  return null;
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};

export const CurrencyProvider = ({ children }) => {
  const [companyCurrency, setCompanyCurrency] = useState({
    country: 'United Arab Emirates',
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ'
  });
  const [loading, setLoading] = useState(false);
  
  // Database countries and currency mapping
  const [dbCountries, setDbCountries] = useState([]);
  const [dbCurrencyMapping, setDbCurrencyMapping] = useState({});
  const [isDbLoaded, setIsDbLoaded] = useState(false);

  // Load countries from database — deferred until auth token exists
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return; // Skip on login page

    const loadCountriesFromDb = async () => {
      try {
        const countries = await fetchCountries();
        if (countries && countries.length > 0) {
          setDbCountries(countries);
          
          // Build currency mapping from database
          // Use hardcoded symbol if available (better unicode support), otherwise use DB symbol
          const mapping = {};
          countries.forEach(country => {
            if (country.currency_code) {
              // Check if we have a hardcoded symbol for this country (more reliable unicode)
              const hardcodedEntry = currencyMapping[country.country_name];
              mapping[country.country_name] = {
                code: country.currency_code,
                name: country.currency_name || country.currency_code,
                // Prefer hardcoded symbol (correct unicode) over DB symbol (may have encoding issues)
                symbol: hardcodedEntry?.symbol || country.currency_symbol || country.currency_code
              };
              // Also add for aliases if available
              if (country.aliases && Array.isArray(country.aliases)) {
                country.aliases.forEach(alias => {
                  mapping[alias] = mapping[country.country_name];
                });
              }
            }
          });
          setDbCurrencyMapping(mapping);
          setIsDbLoaded(true);
          
          // Also load region cache for regionService
          loadRegionCache().catch(err => {
            console.warn('⚠️ CurrencyContext: Could not load region cache:', err.message);
          });
        }
      } catch (error) {
        console.warn('⚠️ CurrencyContext: Could not load from database, using fallback:', error.message);
        setIsDbLoaded(false);
      }
    };
    
    loadCountriesFromDb();
  }, []);

  // Load saved company currency from settings — deferred until auth token exists
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) return; // Skip on login page

    const loadSavedCurrency = async () => {
      try {
        const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
        // Try to get saved company settings
        const response = await deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/settings/company`);
        if (response.data.success && response.data.settings?.currency) {
          const savedCurrency = response.data.settings.currency;
          if (savedCurrency.code) {
            // Look up the full currency info including symbol from our mapping
            const currencyInfo = getCurrencyByCode(savedCurrency.code);
            if (currencyInfo) {
              setCompanyCurrency({
                country: currencyInfo.country || savedCurrency.country || '',
                code: savedCurrency.code,
                name: savedCurrency.name || currencyInfo.name,
                symbol: currencyInfo.symbol
              });
            } else {
              // Fallback: use code as symbol if not found in mapping
              setCompanyCurrency({
                country: savedCurrency.country || '',
                code: savedCurrency.code,
                name: savedCurrency.name || savedCurrency.code,
                symbol: savedCurrency.symbol || savedCurrency.code
              });
            }
          }
        }
      } catch (error) {
        // Silently fail - user may not be logged in or settings may not exist
      }
    };
    
    loadSavedCurrency();
  }, []);

  // Get active currency mapping (DB first, fallback to hardcoded)
  const getActiveCurrencyMapping = useCallback(() => {
    if (isDbLoaded && Object.keys(dbCurrencyMapping).length > 0) {
      // Merge DB mapping with fallback for any missing currencies
      return { ...currencyMapping, ...dbCurrencyMapping };
    }
    return currencyMapping;
  }, [isDbLoaded, dbCurrencyMapping]);

  // Update currency by country using database mapping first, then fallback
  const setCurrencyByCountry = useCallback((country) => {
    const activeMapping = getActiveCurrencyMapping();
    const currencyInfo = activeMapping[country];
    if (currencyInfo) {
      const newCurrency = {
        country,
        ...currencyInfo
      };
      setCompanyCurrency(newCurrency);
      return newCurrency;
    }
    return null;
  }, [getActiveCurrencyMapping]);

  // Format amount with currency symbol
  const formatCurrency = useCallback((amount, options = {}) => {
    const { 
      includeSymbol = true, 
      decimals = 0,
      abbreviated = false 
    } = options;
    
    if (amount === null || amount === undefined || isNaN(amount)) {
      return includeSymbol ? `${companyCurrency.symbol}0` : '0';
    }
    
    let value = Number(amount);
    let suffix = '';
    
    if (abbreviated) {
      if (Math.abs(value) >= 1000000000) {
        value = value / 1000000000;
        suffix = 'B';
      } else if (Math.abs(value) >= 1000000) {
        value = value / 1000000;
        suffix = 'M';
      } else if (Math.abs(value) >= 1000) {
        value = value / 1000;
        suffix = 'K';
      }
    }
    
    const formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }) + suffix;
    
    if (includeSymbol) {
      return `${companyCurrency.symbol}${formatted}`;
    }
    return formatted;
  }, [companyCurrency.symbol]);

  // Get just the symbol
  const getCurrencySymbol = useCallback(() => {
    return companyCurrency.symbol;
  }, [companyCurrency.symbol]);

  // Check if current currency is UAE Dirham (for SVG symbol)
  const isUAEDirham = useCallback(() => {
    return companyCurrency.code === 'AED';
  }, [companyCurrency.code]);

  // Get country list - merge database countries with hardcoded ones for full currency coverage
  const getCountries = useCallback(() => {
    // Start with hardcoded countries (comprehensive list with currency symbols)
    const hardcodedCountries = getCountryList();
    
    if (isDbLoaded && dbCountries.length > 0) {
      // Get DB countries with currency
      const dbCountryNames = dbCountries
        .filter(c => c.is_active && c.currency_code)
        .sort((a, b) => (a.display_order || 999) - (b.display_order || 999))
        .map(c => c.country_name);
      
      // Merge: DB countries first (sorted by display_order), then any hardcoded ones not in DB
      const merged = [...dbCountryNames];
      hardcodedCountries.forEach(country => {
        if (!merged.includes(country)) {
          merged.push(country);
        }
      });
      
      return merged;
    }
    return hardcodedCountries;
  }, [isDbLoaded, dbCountries]);

  const value = {
    companyCurrency,
    setCompanyCurrency,
    setCurrencyByCountry,
    formatCurrency,
    getCurrencySymbol,
    isUAEDirham,
    loading,
    currencyMapping: getActiveCurrencyMapping(), // Use active mapping (DB + fallback)
    getCountryList: getCountries,
    isDbLoaded, // Expose if DB data is loaded
    dbCountries // Expose raw DB countries if needed
  };

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};

export default CurrencyContext;
