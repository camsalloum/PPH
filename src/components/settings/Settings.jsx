import React, { useState, useEffect, useRef, useMemo, Suspense, lazy } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import axios from 'axios';
import { deduplicatedAxiosGet, getCachedPreferences } from '../../utils/deduplicatedFetch';
import { fetchCountries } from '../../services/countriesService';
import { getTimeZoneOptions } from '../../utils/companyTime';
// PendingCountries is now integrated into CountryReference page
import CurrencySymbol, { CURRENCY_SYMBOLS } from '../common/CurrencySymbol';
import HelpPanel from '../common/HelpPanel';
import './Settings.css';
import lazyRetry from '../../utils/lazyRetry';

// ----- Lazy-loaded tab components (only fetched when that tab is active) -----
const PeriodConfiguration = lazy(() => lazyRetry(() => import('./PeriodConfiguration')));
const CountryReference = lazy(() => lazyRetry(() => import('../dashboard/CountryReference')));
const ThemeSelector = lazy(() => lazyRetry(() => import('./ThemeSelector')));
const UserPermissions = lazy(() => lazyRetry(() => import('./UserPermissions')));
const EmployeesManagement = lazy(() => lazyRetry(() => import('./EmployeesManagement')));
const TerritoriesManagement = lazy(() => lazyRetry(() => import('./TerritoriesManagement')));
const AuthorizationRules = lazy(() => lazyRetry(() => import('./AuthorizationRules')));
const OrganizationSettings = lazy(() => lazyRetry(() => import('./OrganizationSettings')));
const DatabaseBackup = lazy(() => lazyRetry(() => import('./DatabaseBackup')));
const DivisionManagement = lazy(() => lazyRetry(() => import('./DivisionManagement')));
const DeploymentPanel = lazy(() => lazyRetry(() => import('./DeploymentPanel')));
const OutlookConnectSettings = lazy(() => lazyRetry(() => import('./OutlookConnectSettings')));
// Direct import avoids barrel re-export that pulls in all 8 people components
const EnhancedOrgChart = lazy(() => lazyRetry(() => import('../people/EnhancedOrgChart')));

const SETTINGS_ACTIVE_TAB_KEY = 'pph.settings.activeTab';
const SETTINGS_ADMIN_SUB_TAB_KEY = 'pph.settings.adminSubTab';

const normalizeSettingsTab = (tab, role, isLocalhost) => {
  const fallbackTab = role === 'admin' ? 'company' : 'periods';
  if (!tab) return fallbackTab;

  // Legacy tabs that were removed from Settings.
  if (tab === 'masterdata' || tab === 'countries') {
    return role === 'admin' ? 'company' : 'periods';
  }

  const adminTabs = ['company', 'periods', 'appearance', 'outlook', 'admin', 'backup'];
  if (isLocalhost) adminTabs.push('deployment');

  const userTabs = ['periods', 'appearance', 'outlook'];
  const allowedTabs = role === 'admin' ? adminTabs : userTabs;

  return allowedTabs.includes(tab) ? tab : fallbackTab;
};

// Lightweight spinner for lazy tab content
// ─── Module-level currency cache (5min TTL, same pattern as countriesService) ───
let _currencyCache = null;
let _currencyCacheTs = 0;
const CURRENCY_CACHE_TTL = 5 * 60 * 1000;

const fetchCurrenciesCached = async () => {
  const now = Date.now();
  if (_currencyCache && (now - _currencyCacheTs) < CURRENCY_CACHE_TTL) return _currencyCache;
  const response = await axios.get('/api/currency/list');
  if (response.data.success && response.data.currencies) {
    _currencyCache = response.data.currencies;
    _currencyCacheTs = Date.now();
    return _currencyCache;
  }
  return _currencyCache || [];
};

const TabFallback = () => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3rem', color: 'rgba(255,255,255,0.4)' }}>
    Loading…
  </div>
);

// Custom Currency Dropdown Component - Shows CURRENCIES (not countries)
const CurrencyDropdown = ({ value, onChange, currencies }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchRef.current) {
      searchRef.current.focus();
    }
  }, [isOpen]);

  const filteredCurrencies = currencies.filter(curr => 
    curr.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    curr.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (curr.country && curr.country.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Render currency symbol - uses CurrencySymbol component (SVG for AED)
  // Symbol inherits size and color from parent span
  const renderCurrencySymbol = (code) => {
    return (
      <span style={{ marginRight: '0.3em', display: 'inline-flex', alignItems: 'center', fontSize: '1.1em' }}>
        <CurrencySymbol code={code} />
      </span>
    );
  };

  const selectedCurrency = currencies.find(c => c.code === value);

  return (
    <div className="currency-dropdown-container" ref={dropdownRef}>
      <div 
        className={`currency-dropdown-selected ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedCurrency ? (
          <div className="currency-dropdown-value">
            {renderCurrencySymbol(selectedCurrency.code)}
            <span>{selectedCurrency.code} - {selectedCurrency.name}</span>
          </div>
        ) : (
          <span className="currency-dropdown-placeholder">Select Currency...</span>
        )}
        <svg 
          className={`currency-dropdown-arrow ${isOpen ? 'open' : ''}`}
          width="12" 
          height="12" 
          viewBox="0 0 12 12" 
          fill="currentColor"
        >
          <path d="M2.5 4.5L6 8L9.5 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      
      {isOpen && (
        <div className="currency-dropdown-menu">
          <div className="currency-dropdown-search">
            <input
              ref={searchRef}
              type="text"
              placeholder="Search currency code or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="currency-dropdown-options">
            {filteredCurrencies.length === 0 ? (
              <div className="currency-dropdown-no-results">No currencies found</div>
            ) : (
              filteredCurrencies.map((curr) => (
                <div
                  key={curr.code}
                  className={`currency-dropdown-option ${value === curr.code ? 'selected' : ''}`}
                  onClick={() => {
                    onChange(curr.code);
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                >
                  {renderCurrencySymbol(curr.code)}
                  <span className="currency-code-name">{curr.code} - {curr.name}</span>
                  {curr.country && <span className="currency-country">({curr.country})</span>}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const Settings = () => {
  const { user, token, updatePreferences, refreshUser } = useAuth();
  const { 
    companyCurrency: globalCurrency, 
    setCompanyCurrency: setGlobalCurrency
  } = useCurrency();
  const location = useLocation();
  const navigate = useNavigate();
  const isLocalhost = window.location.hostname === 'localhost';
  
  // Default tab: 'periods' for regular users, 'company' for admin
  const defaultTab = user?.role === 'admin' ? 'company' : 'periods';
  const [activeTab, setActiveTab] = useState(() => {
    const storedTab = sessionStorage.getItem(SETTINGS_ACTIVE_TAB_KEY);
    return normalizeSettingsTab(storedTab || defaultTab, user?.role, isLocalhost);
  });
  const [adminSubTab, setAdminSubTab] = useState(() => {
    return sessionStorage.getItem(SETTINGS_ADMIN_SUB_TAB_KEY) || 'employees';
  }); // Sub-tabs: employees, users, orgchart, territories, authorization
  const [showCountryReference, setShowCountryReference] = useState(false);

  // Legacy URL support: /settings?tab=masterdata should redirect to MES raw materials.
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const tabFromQuery = String(params.get('tab') || '').trim().toLowerCase();
    if (!tabFromQuery) return;

    if (tabFromQuery === 'masterdata') {
      navigate('/mes/raw-materials', { replace: true });
      return;
    }

    if (tabFromQuery === 'countries' && user?.role === 'admin') {
      setActiveTab('company');
      setShowCountryReference(true);
    }
  }, [location.search, navigate, user?.role]);
  
  // Check for active tab in location state
  useEffect(() => {
    if (location.state && location.state.activeTab) {
      const requestedTab = location.state.activeTab;
      setActiveTab(normalizeSettingsTab(requestedTab, user?.role, isLocalhost));

      if (requestedTab === 'countries') {
        setShowCountryReference(true);
      }

      if (requestedTab === 'masterdata') {
        setMessage({ type: 'success', text: 'Master Data has moved. Use MES > Raw Materials for material setup.' });
      }

      // Support direct navigation to admin sub-tabs
      if (location.state.adminSubTab) {
        setAdminSubTab(location.state.adminSubTab);
      }
    } else if (user?.role !== 'admin' && activeTab === 'company') {
      // If non-admin lands on company tab (shouldn't happen), redirect to periods
      setActiveTab('periods');
    }
  }, [location, user?.role, isLocalhost]);

  useEffect(() => {
    sessionStorage.setItem(SETTINGS_ACTIVE_TAB_KEY, activeTab);
  }, [activeTab]);

  useEffect(() => {
    sessionStorage.setItem(SETTINGS_ADMIN_SUB_TAB_KEY, adminSubTab);
  }, [adminSubTab]);
  
  // Company settings
  const [companyName, setCompanyName] = useState('');
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);
  const [currentLogo, setCurrentLogo] = useState(null);
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState('AED');
  const [allCurrencies, setAllCurrencies] = useState([]);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [allCountries, setAllCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [selectedCountryId, setSelectedCountryId] = useState(null);
  const [selectedCountryName, setSelectedCountryName] = useState('');
  const [selectedCountryCode, setSelectedCountryCode] = useState('');
  const [selectedCompanyTimezone, setSelectedCompanyTimezone] = useState('');
  const [accountsRecipientsPreview, setAccountsRecipientsPreview] = useState([]);
  const [accountsRecipientSearch, setAccountsRecipientSearch] = useState('');
  const [accountsRecipientSearchResults, setAccountsRecipientSearchResults] = useState([]);
  const [searchingAccountsUsers, setSearchingAccountsUsers] = useState(false);
  const [savingAccountsRecipients, setSavingAccountsRecipients] = useState(false);
  
  // Division settings - backup/restore only (DivisionManagement component handles CRUD)
  const [divisionBackups, setDivisionBackups] = useState([]);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState(null);
  const [restoreNewCode, setRestoreNewCode] = useState('');
  const [restoreNewName, setRestoreNewName] = useState('');
  const [restoring, setRestoring] = useState(false);
  
  // User preferences - default division
  const [defaultDivision, setDefaultDivision] = useState('');
  
  // UI state
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const timeZoneOptions = useMemo(() => getTimeZoneOptions(), []);

  // Fetch all currencies from API on mount (5min module-level cache)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCurrenciesLoading(true);
        const currencies = await fetchCurrenciesCached();
        if (!cancelled) setAllCurrencies(currencies);
      } catch (error) {
        console.error('Error fetching currencies:', error);
        if (!cancelled) setAllCurrencies([
          { code: 'AED', name: 'UAE Dirham', country: 'United Arab Emirates' },
          { code: 'USD', name: 'US Dollar', country: 'United States' },
          { code: 'EUR', name: 'Euro', country: 'European Union' },
          { code: 'GBP', name: 'British Pound', country: 'United Kingdom' }
        ]);
      } finally {
        if (!cancelled) setCurrenciesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const loadCountries = async () => {
      try {
        setCountriesLoading(true);
        const countries = await fetchCountries({ active: true });
        setAllCountries(Array.isArray(countries) ? countries : []);
      } catch (error) {
        console.error('Error fetching countries:', error);
        setAllCountries([]);
      } finally {
        setCountriesLoading(false);
      }
    };

    loadCountries();
  }, []);

  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  useEffect(() => {
    // Only load data if user AND token are available (auth fully initialized)
    if (user && token) {
      loadAllData();
    }
  }, [user, token]);

  const loadAllData = async () => {
    // Run independent loads in parallel instead of sequentially
    const [loadedDivisions] = await Promise.all([
      loadSettings(),
      user?.role === 'admin' ? loadAccountsRecipientsSetting() : Promise.resolve(),
    ]);
    // loadUserPreferences depends on loadSettings result
    await loadUserPreferences(loadedDivisions);
  };

  const loadAccountsRecipientsSetting = async () => {
    try {
      if (!token || user?.role !== 'admin') return;
      const response = await axios.get(`${API_BASE_URL}/api/settings/crm-accounts-recipients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data?.success) {
        setAccountsRecipientsPreview(Array.isArray(response.data.recipients) ? response.data.recipients : []);
      }
    } catch (error) {
      console.error('Error loading CRM accounts recipients setting:', error);
    }
  };

  const searchAccountsUsers = async (queryText = '') => {
    try {
      if (!token || user?.role !== 'admin') return;
      setSearchingAccountsUsers(true);
      const response = await axios.get(`${API_BASE_URL}/api/settings/users/search`, {
        params: { q: queryText, limit: 20 },
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data?.success) {
        const selectedIds = new Set(accountsRecipientsPreview.map((row) => Number(row.id)));
        const rows = Array.isArray(response.data.users) ? response.data.users : [];
        setAccountsRecipientSearchResults(rows.filter((row) => !selectedIds.has(Number(row.id))));
      }
    } catch (error) {
      console.error('Error searching users for accounts recipient picker:', error);
      setAccountsRecipientSearchResults([]);
    } finally {
      setSearchingAccountsUsers(false);
    }
  };

  const addAccountsRecipient = (userRow) => {
    setAccountsRecipientsPreview((prev) => {
      const exists = prev.some((row) => Number(row.id) === Number(userRow.id));
      if (exists) return prev;
      return [...prev, userRow];
    });
    setAccountsRecipientSearchResults((prev) => prev.filter((row) => Number(row.id) !== Number(userRow.id)));
  };

  const removeAccountsRecipient = (userId) => {
    setAccountsRecipientsPreview((prev) => prev.filter((row) => Number(row.id) !== Number(userId)));
    searchAccountsUsers(accountsRecipientSearch);
  };

  useEffect(() => {
    if (user?.role !== 'admin' || activeTab !== 'company' || !token) return;

    const timer = setTimeout(() => {
      searchAccountsUsers(accountsRecipientSearch);
    }, 250);

    return () => clearTimeout(timer);
  }, [accountsRecipientSearch, activeTab, token, user?.role]);

  const handleSaveAccountsRecipientsSetting = async () => {
    if (user?.role !== 'admin') return;
    const recipientIds = [...new Set(
      accountsRecipientsPreview
        .map((row) => Number(row.id))
        .filter((value) => Number.isInteger(value) && value > 0)
    )];

    setSavingAccountsRecipients(true);
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/settings/crm-accounts-recipients`,
        { recipientIds },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data?.success) {
        setMessage({ type: 'success', text: 'CRM Accounts copy recipients saved successfully.' });
        await loadAccountsRecipientsSetting();
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.error || 'Failed to save Accounts recipients.' });
    } finally {
      setSavingAccountsRecipients(false);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/settings/company`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (response.data.success) {
        const settings = response.data.settings;
        setCompanyName(settings.companyName || '');
        setCurrentLogo(settings.logoUrl);
        
        // Load currency setting (now using code)
        if (settings.currency && settings.currency.code) {
          setSelectedCurrencyCode(settings.currency.code);
          setGlobalCurrency(settings.currency);
        }

        if (settings.country) {
          setSelectedCountryId(settings.country.id || null);
          setSelectedCountryName(settings.country.country_name || settings.country.name || '');
          setSelectedCountryCode((settings.country.country_code_2 || settings.country.code || '').toUpperCase());
        }

        if (settings.companyTimezone) {
          setSelectedCompanyTimezone(settings.companyTimezone);
        } else if (settings.country?.timezone) {
          setSelectedCompanyTimezone(settings.country.timezone);
        }
        
        return settings.divisions || [];
      }
      return [];
    } catch (error) {
      console.error('Error loading settings:', error);
      return [];
    }
  };
  const loadUserPreferences = async (loadedDivisions = []) => {
    // Load preferences (requires auth)
    // Token is now from React state, guaranteed to be in sync
    try {
      if (!token) {
        return;
      }
      
      const response = await getCachedPreferences();
      if (response?.success !== false) {
        setDefaultDivision(response?.preferences?.default_division || '');
      }
      
      // Load backups for admin (only if we have a valid token)
      if (user?.role === 'admin') {
        await loadDivisionBackups();
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  const loadDivisionBackups = async () => {
    try {
      if (!token) {
        return;
      }
      const response = await axios.get(`${API_BASE_URL}/api/settings/division-backups`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setDivisionBackups(response.data.backups || []);
      }
    } catch (error) {
      console.error('Error loading division backups:', error);
    }
  };

  const handleRestoreDivision = async () => {
    if (!selectedBackup) return;
    
    setRestoring(true);
    setMessage({ type: '', text: '' });
    
    try {
      const response = await axios.post(`${API_BASE_URL}/api/settings/restore-division`, {
        backupFolder: selectedBackup.folderName,
        newCode: restoreNewCode || null,
        newName: restoreNewName || null
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.success) {
        setMessage({ 
          type: 'success', 
          text: `Division ${response.data.result.divisionCode} restored! ${response.data.result.tablesRestored} tables, ${response.data.result.rowsRestored} rows.` 
        });
        setShowRestoreModal(false);
        setSelectedBackup(null);
        setRestoreNewCode('');
        setRestoreNewName('');
        // Reload settings to show new division
        await loadAllData();
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to restore division' 
      });
    } finally {
      setRestoring(false);
    }
  };

  const openRestoreModal = (backup) => {
    setSelectedBackup(backup);
    setRestoreNewCode('');
    setRestoreNewName('');
    setShowRestoreModal(true);
  };

  const handleDeleteBackup = async (backup) => {
    const confirmMessage = `Are you sure you want to permanently delete the backup for "${backup.divisionCode}"?\n\n` +
      `This backup contains ${backup.totalTables} tables and ${backup.totalRows || 0} rows.\n\n` +
      `This action cannot be undone!`;
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      setLoading(true);
      await axios.delete(`/api/settings/division-backups/${encodeURIComponent(backup.folderName)}`);
      
      // Refresh backup list
      const response = await axios.get('/api/settings/division-backups');
      if (response.data.success) {
        setDivisionBackups(response.data.backups);
      }
      
      setMessage({ 
        type: 'success', 
        text: `Backup for "${backup.divisionCode}" deleted successfully` 
      });
    } catch (error) {
      console.error('Delete backup error:', error);
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to delete backup' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setMessage({ type: 'error', text: 'Please select an image file' });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setMessage({ type: 'error', text: 'Image size must be less than 5MB' });
        return;
      }

      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setLogoPreview(reader.result);
      reader.readAsDataURL(file);
      setMessage({ type: '', text: '' });
    }
  };

  const handleSaveCompanySettings = async () => {
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const formData = new FormData();
      formData.append('companyName', companyName);
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      
      // Add currency if selected (now using currency code)
      if (selectedCurrencyCode && allCurrencies.length > 0) {
        const selectedCurrency = allCurrencies.find(c => c.code === selectedCurrencyCode);
        if (selectedCurrency) {
          const currencyData = {
            code: selectedCurrency.code,
            name: selectedCurrency.name,
            symbol: selectedCurrency.symbol
          };
          formData.append('currency', JSON.stringify(currencyData));
        }
      }

      if (selectedCountryCode) {
        const selectedCountry = allCountries.find((country) =>
          (country.country_code_2 || '').toUpperCase() === selectedCountryCode.toUpperCase()
        );

        const countryData = {
          id: selectedCountry?.id || selectedCountryId || null,
          country_name: selectedCountry?.country_name || selectedCountryName || selectedCountryCode,
          country_code_2: selectedCountryCode.toUpperCase(),
          country_code_3: selectedCountry?.country_code_3 || null,
          timezone: selectedCompanyTimezone || selectedCountry?.timezone || 'UTC'
        };

        formData.append('country', JSON.stringify(countryData));
      }

      if (selectedCompanyTimezone) {
        formData.append('companyTimezone', selectedCompanyTimezone);
      }

      const response = await axios.post(
        `${API_BASE_URL}/api/settings/company`,
        formData,
        {
          headers: { 
            'Content-Type': 'multipart/form-data',
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.data.success) {
        setMessage({ type: 'success', text: 'Company settings saved successfully!' });
        setCurrentLogo(response.data.settings.logoUrl);
        setLogoFile(null);
        setLogoPreview(null);
        
        // Update global currency context
        if (response.data.settings.currency) {
          setGlobalCurrency(response.data.settings.currency);
        }

        // Keep users on the current settings tab instead of forcing a full-page reload.
        await loadAllData();
      }
    } catch (error) {
      setMessage({ 
        type: 'error', 
        text: error.response?.data?.error || 'Failed to save settings' 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDefaultDivision = async (divisionCode = null) => {
    const codeToSave = divisionCode || defaultDivision;
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const result = await updatePreferences({
        default_division: codeToSave
      });

      if (result.success) {
        if (divisionCode) {
          setDefaultDivision(divisionCode);
        }
        setMessage({ type: 'success', text: `Default division set to ${codeToSave}!` });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      } else {
        console.error('updatePreferences failed:', result.error);
        setMessage({ type: 'error', text: result.error || 'Failed to save default division' });
      }
    } catch (error) {
      console.error('handleSaveDefaultDivision error:', error);
      setMessage({ 
        type: 'error', 
        text: 'Failed to save default division' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Set default tab based on role - non-admin users go to periods tab
  useEffect(() => {
    if (user?.role !== 'admin' && activeTab === 'company') {
      setActiveTab('periods');
    }
  }, [user, activeTab]);

  useEffect(() => {
    const normalized = normalizeSettingsTab(activeTab, user?.role, isLocalhost);
    if (normalized !== activeTab) {
      setActiveTab(normalized);
    }
  }, [activeTab, user?.role, isLocalhost]);

  // Reload settings when switching to company tab
  useEffect(() => {
    if (activeTab === 'company') {
      loadAllData();
    }
  }, [activeTab]);

  const handleCountryChange = (countryCode) => {
    const normalizedCode = (countryCode || '').toUpperCase();
    setSelectedCountryCode(normalizedCode);

    const selectedCountry = allCountries.find(
      (country) => (country.country_code_2 || '').toUpperCase() === normalizedCode
    );

    setSelectedCountryId(selectedCountry?.id || null);
    setSelectedCountryName(selectedCountry?.country_name || '');

    if (selectedCountry?.timezone) {
      setSelectedCompanyTimezone(selectedCountry.timezone);
    } else if (!selectedCompanyTimezone) {
      setSelectedCompanyTimezone('UTC');
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h1>{user?.role === 'admin' ? 'Company Settings' : 'My Settings'}</h1>
        <div className="settings-header-actions">
          <HelpPanel tooltip="System Workflow" />
          <button onClick={() => navigate('/modules')} className="btn-back-header">
            ← Back to Home
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="settings-tabs">
        {user?.role === 'admin' && (
          <button 
            className={`tab-button ${activeTab === 'company' ? 'active' : ''}`}
            onClick={() => setActiveTab('company')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
            </svg>
            Company<br/>Info
          </button>
        )}
        <button 
          className={`tab-button ${activeTab === 'periods' ? 'active' : ''}`}
          onClick={() => setActiveTab('periods')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
          Period<br/>Configuration
        </button>
        <button 
          className={`tab-button ${activeTab === 'appearance' ? 'active' : ''}`}
          onClick={() => setActiveTab('appearance')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v11a3 3 0 106 0V4a2 2 0 00-2-2H4zm1 14a1 1 0 100-2 1 1 0 000 2zm5-1.757l4.9-4.9a2 2 0 000-2.828L13.485 5.1a2 2 0 00-2.828 0L10 5.757v8.486zM16 18H9.071l6-6H16a2 2 0 012 2v2a2 2 0 01-2 2z" clipRule="evenodd" />
          </svg>
          Appearance
        </button>
        <button
          className={`tab-button ${activeTab === 'outlook' ? 'active' : ''}`}
          onClick={() => setActiveTab('outlook')}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M2 4a2 2 0 012-2h12a2 2 0 012 2v1l-8 5-8-5V4z" />
            <path d="M2 8.236l7.445 4.653a1 1 0 001.11 0L18 8.236V16a2 2 0 01-2 2H4a2 2 0 01-2-2V8.236z" />
          </svg>
          Outlook<br/>Email
        </button>
        {user?.role === 'admin' && (
          <button 
            className={`tab-button ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
            </svg>
            Admin
          </button>
        )}

        {user?.role === 'admin' && (
          <button 
            className={`tab-button ${activeTab === 'backup' ? 'active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" />
            </svg>
            Database<br/>Backup
          </button>
        )}

        {user?.role === 'admin' && window.location.hostname === 'localhost' && (
          <button 
            className={`tab-button ${activeTab === 'deployment' ? 'active' : ''}`}
            onClick={() => setActiveTab('deployment')}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Deploy<br/>to VPS
          </button>
        )}
      </div>

      {message.text && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-content">
        {/* Company Info Tab */}
        {activeTab === 'company' && (
          <div className="settings-section">
            <div className="company-info-grid">
              {/* Left Column - Company Name & Logo */}
              <div className="company-info-card">
                <div className="section-header">
                  <h2>Company Information</h2>
                  <p className="section-description">
                    Customize your company name and logo. This will appear in the header for all users.
                  </p>
                </div>

                <div className="form-grid">
                  <div className="form-group full-width">
                    <label htmlFor="companyName">Company Name</label>
                    <input
                      type="text"
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Enter your company name"
                      className="form-input"
                    />
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="companyCurrency">
                      Company Currency 
                      {allCurrencies.length > 0 && <span style={{color: '#27ae60', fontSize: '12px', marginLeft: '8px'}}>({allCurrencies.length} currencies available)</span>}
                    </label>
                    {currenciesLoading ? (
                      <div style={{padding: '10px', color: '#666'}}>Loading currencies...</div>
                    ) : (
                      <CurrencyDropdown
                        value={selectedCurrencyCode}
                        onChange={setSelectedCurrencyCode}
                        currencies={allCurrencies}
                      />
                    )}
                    <p className="help-text">
                      This currency symbol will be used everywhere in the application for all amount-related figures.
                    </p>
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="companyCountry">
                      Company Country
                      {allCountries.length > 0 && (
                        <span style={{ color: '#27ae60', fontSize: '12px', marginLeft: '8px' }}>
                          ({allCountries.length} countries available)
                        </span>
                      )}
                    </label>
                    {countriesLoading ? (
                      <div style={{ padding: '10px', color: '#666' }}>Loading countries...</div>
                    ) : (
                      <select
                        id="companyCountry"
                        className="form-input"
                        value={selectedCountryCode}
                        onChange={(e) => handleCountryChange(e.target.value)}
                      >
                        <option value="">Select Country...</option>
                        {allCountries.map((country) => (
                          <option key={country.id} value={(country.country_code_2 || '').toUpperCase()}>
                            {country.country_name} ({(country.country_code_2 || '').toUpperCase() || 'N/A'})
                          </option>
                        ))}
                      </select>
                    )}
                    <p className="help-text">
                      The company country is used to determine the default local timezone for Oracle sync timestamps.
                    </p>
                  </div>

                  <div className="form-group full-width">
                    <label htmlFor="companyTimezone">Company Timezone (Override Allowed)</label>
                    <input
                      type="text"
                      id="companyTimezone"
                      className="form-input"
                      list="company-timezone-options"
                      value={selectedCompanyTimezone}
                      onChange={(e) => setSelectedCompanyTimezone(e.target.value)}
                      placeholder="Type to search timezone (e.g. Asia/Dubai)"
                    />
                    <datalist id="company-timezone-options">
                      {timeZoneOptions.map((tz) => (
                        <option key={tz} value={tz} />
                      ))}
                    </datalist>
                    <p className="help-text">
                      Override the timezone when a country spans multiple timezones.
                    </p>
                  </div>

                  <div className="form-group full-width">
                    <label>Company Logo</label>
                    <div className="logo-upload-section">
                      <div className="current-logo-preview">
                        {currentLogo || logoPreview ? (
                          <img 
                            src={logoPreview || currentLogo} 
                            alt="Company Logo" 
                            className="logo-preview-img"
                          />
                        ) : (
                          <div className="no-logo-preview">
                            <svg width="48" height="48" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                            <p>No logo uploaded</p>
                          </div>
                        )}
                      </div>

                      <div className="file-input-wrapper">
                        <label htmlFor="logo-upload" className="file-input-label">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M5.5 13a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 13H11V9.413l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13H5.5z" />
                            <path d="M9 13h2v5a1 1 0 11-2 0v-5z" />
                          </svg>
                          Choose Image
                        </label>
                        <input
                          type="file"
                          id="logo-upload"
                          accept="image/*"
                          onChange={handleFileSelect}
                          className="file-input"
                        />
                        <span className="file-name">
                          {logoFile ? logoFile.name : 'No file selected'}
                        </span>
                      </div>

                      <p className="help-text">
                        Max 5MB. Formats: JPG, PNG, SVG, GIF. Recommended: Transparent PNG, 200-400px width
                      </p>
                    </div>
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    onClick={handleSaveCompanySettings}
                    disabled={loading}
                    className="btn-primary"
                  >
                    {loading ? 'Saving...' : 'Save Company Settings'}
                  </button>
                </div>

                {user?.role === 'admin' && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
                    <div className="form-group full-width">
                      <label htmlFor="crmAccountsRecipientsSearch">CRM Accounts Copy Recipients (Placeholder)</label>
                      <input
                        id="crmAccountsRecipientsSearch"
                        type="text"
                        value={accountsRecipientSearch}
                        onChange={(e) => setAccountsRecipientSearch(e.target.value)}
                        placeholder="Search by name or email"
                        className="form-input"
                      />
                      <p className="help-text">
                        Used for copy notifications when manager approves trip and travel report/expenses.
                      </p>

                      <div style={{ marginTop: 8, border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 180, overflowY: 'auto', background: '#fff' }}>
                        {searchingAccountsUsers ? (
                          <div style={{ padding: '10px 12px', color: '#666' }}>Searching users...</div>
                        ) : accountsRecipientSearchResults.length === 0 ? (
                          <div style={{ padding: '10px 12px', color: '#888' }}>No users found</div>
                        ) : (
                          accountsRecipientSearchResults.map((row) => (
                            <div
                              key={row.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                padding: '8px 10px',
                                borderBottom: '1px solid #f3f4f6'
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{row.display_name}</div>
                                <div style={{ fontSize: 12, color: '#6b7280' }}>{row.email || `User #${row.id}`}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => addAccountsRecipient(row)}
                                className="btn-secondary"
                                style={{ padding: '6px 10px', minWidth: 64 }}
                              >
                                Add
                              </button>
                            </div>
                          ))
                        )}
                      </div>

                      {accountsRecipientsPreview.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {accountsRecipientsPreview.map((row) => (
                            <span
                              key={row.id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#eef2ff',
                                color: '#3730a3',
                                border: '1px solid #c7d2fe',
                                borderRadius: 999,
                                padding: '4px 10px',
                                fontSize: 12
                              }}
                            >
                              {row.display_name} #{row.id}
                              <button
                                type="button"
                                onClick={() => removeAccountsRecipient(row.id)}
                                style={{ border: 'none', background: 'transparent', color: '#3730a3', cursor: 'pointer', padding: 0, fontSize: 13 }}
                                aria-label={`Remove ${row.display_name}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="form-actions" style={{ marginTop: 12 }}>
                      <button
                        onClick={handleSaveAccountsRecipientsSetting}
                        disabled={savingAccountsRecipients || !token}
                        className="btn-primary"
                      >
                        {savingAccountsRecipients ? 'Saving...' : 'Save Accounts Recipients'}
                      </button>
                    </div>
                  </div>
                )}

                {user?.role === 'admin' && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #e5e7eb', width: '100%' }}>
                    <div className="section-header" style={{ marginBottom: 10 }}>
                      <h2>Country Reference</h2>
                      <p className="section-description" style={{ marginBottom: 8 }}>
                        Country master data has moved here from Master Data for centralized company governance.
                      </p>
                    </div>
                    <div className="form-actions" style={{ marginTop: 0, justifyContent: 'flex-start' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowCountryReference((prev) => !prev)}
                      >
                        {showCountryReference ? 'Hide Country Reference' : 'Open Country Reference'}
                      </button>
                    </div>

                    {showCountryReference && (
                      <div style={{ marginTop: 16, width: '100%' }}>
                        <Suspense fallback={<TabFallback />}>
                          <CountryReference />
                        </Suspense>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Division Management - Ant Design Table Component */}
              {user?.role === 'admin' && (
                <Suspense fallback={<TabFallback />}>
                  <DivisionManagement />
                </Suspense>
              )}
            </div>
          </div>
        )}

        {/* Period Configuration Tab */}
        {activeTab === 'periods' && (
          <div className="settings-section">
            <div className="section-header">
              <h2>Period Configuration</h2>
              <p className="section-description">
                Configure the periods (Years, Months, Quarters) you want to see in the dashboard.
                {user?.role === 'admin' ? ' You can save these as global defaults or just for yourself.' : ' These settings will apply only to you.'}
              </p>
            </div>
            <Suspense fallback={<TabFallback />}>
              <PeriodConfiguration />
            </Suspense>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="settings-section">
            <div className="section-header">
              <h2>Appearance Settings</h2>
              <p className="section-description">
                Customize the look and feel of your dashboard. Choose from 4 beautiful themes.
              </p>
            </div>
            <Suspense fallback={<TabFallback />}>
              <ThemeSelector />
            </Suspense>
          </div>
        )}

        {/* Outlook Email Tab */}
        {activeTab === 'outlook' && (
          <div className="settings-section">
            <Suspense fallback={<TabFallback />}>
              <OutlookConnectSettings />
            </Suspense>
          </div>
        )}

        {/* Database Backup Tab - Admin Only */}
        {activeTab === 'backup' && user?.role === 'admin' && (
          <div className="settings-section">
            <Suspense fallback={<TabFallback />}>
              <DatabaseBackup />
            </Suspense>
          </div>
        )}

        {/* Admin Tab - Admin Only - Contains all user/employee management sub-tabs */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="admin-section">
            {/* Sub-tab Navigation */}
            <div className="admin-sub-tabs">
              <button 
                className={`admin-sub-tab ${adminSubTab === 'employees' ? 'active' : ''}`}
                onClick={() => setAdminSubTab('employees')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                Employees
              </button>
              <button 
                className={`admin-sub-tab ${adminSubTab === 'users' ? 'active' : ''}`}
                onClick={() => setAdminSubTab('users')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                User Management
              </button>
              <button 
                className={`admin-sub-tab ${adminSubTab === 'orgchart' ? 'active' : ''}`}
                onClick={() => setAdminSubTab('orgchart')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM14 11a1 1 0 011 1v1h1a1 1 0 110 2h-1v1a1 1 0 11-2 0v-1h-1a1 1 0 110-2h1v-1a1 1 0 011-1z" />
                </svg>
                Org Chart
              </button>
              <button 
                className={`admin-sub-tab ${adminSubTab === 'territories' ? 'active' : ''}`}
                onClick={() => setAdminSubTab('territories')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                Territories
              </button>
              <button 
                className={`admin-sub-tab ${adminSubTab === 'authorization' ? 'active' : ''}`}
                onClick={() => setAdminSubTab('authorization')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Authorization
              </button>
              <button 
                className={`admin-sub-tab ${adminSubTab === 'orgsettings' ? 'active' : ''}`}
                onClick={() => setAdminSubTab('orgsettings')}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                </svg>
                Org Settings
              </button>
            </div>

            {/* Sub-tab Content */}
            <div className="admin-sub-content">
              <Suspense fallback={<TabFallback />}>
                {adminSubTab === 'employees' && <EmployeesManagement />}
                {adminSubTab === 'users' && <UserPermissions />}
                {adminSubTab === 'orgchart' && <EnhancedOrgChart />}
                {adminSubTab === 'territories' && <TerritoriesManagement />}
                {adminSubTab === 'authorization' && <AuthorizationRules />}
                {adminSubTab === 'orgsettings' && <OrganizationSettings />}
              </Suspense>
            </div>
          </div>
        )}

        {/* Deployment Tab - Admin Only, localhost only */}
        {activeTab === 'deployment' && user?.role === 'admin' && window.location.hostname === 'localhost' && (
          <div className="settings-section">
            <Suspense fallback={<TabFallback />}>
              <DeploymentPanel />
            </Suspense>
          </div>
        )}
      </div>

      {/* Restore Division Modal */}
      {showRestoreModal && selectedBackup && (
        <div className="modal-overlay" onClick={() => setShowRestoreModal(false)}>
          <div className="modal-content restore-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Restore Division</h2>
              <button className="modal-close" onClick={() => setShowRestoreModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              <div className="backup-details">
                <h3>Backup Details</h3>
                <p><strong>Original Code:</strong> {selectedBackup.divisionCode}</p>
                <p><strong>Backup Date:</strong> {new Date(selectedBackup.completedAt || selectedBackup.timestamp).toLocaleString()}</p>
                <p><strong>Data:</strong> {selectedBackup.totalTables} tables, {selectedBackup.totalRows} rows</p>
                <p><strong>User Access:</strong> {selectedBackup.userAccess} users</p>
              </div>
              
              <div className="restore-options">
                <h3>Restore Options</h3>
                <p className="help-text">
                  Leave blank to use original values, or enter new code/name.
                </p>
                
                <div className="form-group">
                  <label>New Division Code (optional)</label>
                  <input
                    type="text"
                    value={restoreNewCode}
                    onChange={(e) => setRestoreNewCode(e.target.value.toUpperCase())}
                    placeholder={selectedBackup.divisionCode}
                    maxLength="4"
                    className="form-input"
                  />
                  <p className="field-hint">2-4 uppercase letters</p>
                </div>
                
                <div className="form-group">
                  <label>New Division Name (optional)</label>
                  <input
                    type="text"
                    value={restoreNewName}
                    onChange={(e) => setRestoreNewName(e.target.value)}
                    placeholder="Original name will be used"
                    className="form-input"
                  />
                </div>
              </div>
              
              <div className="warning-box">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>
                  {restoreNewCode && restoreNewCode !== selectedBackup.divisionCode 
                    ? 'User permissions will NOT be restored when using a different code.'
                    : 'This will create a new division with all the backed up data.'}
                </span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn-secondary" 
                onClick={() => setShowRestoreModal(false)}
                disabled={restoring}
              >
                Cancel
              </button>
              <button 
                className="btn-primary" 
                onClick={handleRestoreDivision}
                disabled={restoring}
              >
                {restoring ? 'Restoring...' : 'Restore Division'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
