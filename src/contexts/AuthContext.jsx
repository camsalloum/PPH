import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { deduplicatedAxiosGet } from '../utils/deduplicatedFetch';

// Ensure cookies (refreshToken) are sent/received on cross-origin requests (localhost:3000 -> localhost:3001)
axios.defaults.withCredentials = true;

export const AuthContext = createContext();

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

// Flag to prevent multiple simultaneous refresh attempts
let isRefreshing = false;
let refreshSubscribers = [];
let preferencesCache = { data: null, ts: 0 };
let preferencesInFlight = null;
const PREFERENCES_CACHE_TTL_MS = 30 * 1000;

// Subscribe to token refresh
const subscribeTokenRefresh = (callback) => {
  refreshSubscribers.push(callback);
};

// Notify all subscribers with new token
const onTokenRefreshed = (newToken) => {
  refreshSubscribers.forEach(callback => callback(newToken));
  refreshSubscribers = [];
};

// Refresh the access token
const refreshAccessToken = async () => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/auth/refresh`, {}, {
      withCredentials: true
    });
    
    if (response.data.success && response.data.accessToken) {
      const newToken = response.data.accessToken;
      localStorage.setItem('auth_token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      return newToken;
    }
    return null;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

// Setup axios interceptor for automatic token refresh
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Don't try to refresh if this IS the refresh request (prevents infinite loop)
    const isRefreshRequest = originalRequest?.url?.includes('/api/auth/refresh');
    
    // If error is 401 and we haven't already tried to refresh (and this isn't the refresh endpoint itself)
    if (error.response?.status === 401 && !originalRequest._retry && !isRefreshRequest) {
      originalRequest._retry = true;
      
      if (!isRefreshing) {
        isRefreshing = true;
        
        const newToken = await refreshAccessToken();
        
        isRefreshing = false;
        
        if (newToken) {
          onTokenRefreshed(newToken);
          originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
          return axios(originalRequest);
        } else {
          // Refresh failed - clear auth state
          localStorage.removeItem('auth_token');
          delete axios.defaults.headers.common['Authorization'];

          // Notify app-level auth state so ProtectedRoute doesn't stay "authenticated"
          try {
            window.dispatchEvent(new CustomEvent('auth:logout', {
              detail: { reason: 'refresh_failed' }
            }));
          } catch (e) {
            // ignore
          }

          // Redirect to login or let the app handle it
          return Promise.reject(error);
        }
      } else {
        // Wait for the refresh to complete
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (newToken) {
              originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
              resolve(axios(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }
    }
    
    return Promise.reject(error);
  }
);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(() => localStorage.getItem('auth_token'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [permissions, setPermissions] = useState({ global: [], byDivision: {}, isAdmin: false });

  // Get token - returns state value which is always in sync
  const getToken = useCallback(() => {
    return token;
  }, [token]);

  // Load user permissions from API
  const loadPermissions = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/permissions/my`);
      if (response.data.success) {
        setPermissions(response.data.permissions);
        return response.data.permissions;
      }
    } catch (error) {
      console.error('Failed to load permissions:', error);
    }
    return null;
  }, []);

  // Set token in localStorage, state, and axios headers
  const setToken = useCallback((newToken) => {
    if (newToken) {
      localStorage.setItem('auth_token', newToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      setTokenState(newToken);
    } else {
      localStorage.removeItem('auth_token');
      delete axios.defaults.headers.common['Authorization'];
      setTokenState(null);
    }
  }, []);

  // Keep auth state consistent if token refresh fails elsewhere (axios interceptor)
  useEffect(() => {
    const handler = () => {
      localStorage.removeItem('auth_token');
      delete axios.defaults.headers.common['Authorization'];
      setTokenState(null);
      setUser(null);
    };
    window.addEventListener('auth:logout', handler);
    return () => window.removeEventListener('auth:logout', handler);
  }, []);

  // Load user from token on mount
  useEffect(() => {
    const initAuth = async () => {
      // Read token directly from localStorage to avoid stale closure
      const existingToken = localStorage.getItem('auth_token');
      if (existingToken) {
        try {
          // Ensure axios headers are set
          axios.defaults.headers.common['Authorization'] = `Bearer ${existingToken}`;
          // Also update state if needed
          setTokenState(existingToken);
          const response = await deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/auth/me`);
          if (response.data.success) {
            setUser(response.data.user);

            // Load permissions in background (non-blocking for initial app render)
            deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/permissions/my`)
              .then((permResponse) => {
                if (permResponse.data.success) {
                  setPermissions(permResponse.data.permissions);
                }
              })
              .catch((permError) => {
                console.warn('initAuth - Failed to load permissions:', permError);
              });
          } else {
            // Clear invalid token
            localStorage.removeItem('auth_token');
            delete axios.defaults.headers.common['Authorization'];
            setTokenState(null);
          }
        } catch (error) {
          console.error('initAuth - Failed to load user:', error);
          // Clear invalid token
          localStorage.removeItem('auth_token');
          delete axios.defaults.headers.common['Authorization'];
          setTokenState(null);
        }
      }
      setLoading(false);
    };

    initAuth();
  }, [API_BASE_URL]); // Only run on mount - reads from localStorage directly

  // Keep localStorage in sync with token state (belt and suspenders)
  useEffect(() => {
    if (token && !localStorage.getItem('auth_token')) {
      localStorage.setItem('auth_token', token);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }, [token]);

  // Login function
  const login = useCallback(async (email, password) => {
    try {
      setError(null);
      setLoading(true);

      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password
      }, {
        // Required so browser stores refreshToken cookie from the backend
        withCredentials: true
      });

      if (response.data.success) {
        // Server returns "accessToken", not "token"
        const receivedToken = response.data.accessToken || response.data.token;
        setToken(receivedToken);

        // Set a fast initial user immediately so UI can navigate without waiting
        // for additional round-trips.
        const initialUser = response.data.user || null;
        if (initialUser) {
          setUser(initialUser);
        }

        // Enrich user + permissions in background (non-blocking)
        axios.defaults.headers.common['Authorization'] = `Bearer ${receivedToken}`;
        Promise.allSettled([
          deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/auth/me`),
          deduplicatedAxiosGet(axios, `${API_BASE_URL}/api/permissions/my`)
        ]).then(([meResult, permResult]) => {
          if (meResult.status === 'fulfilled' && meResult.value?.data?.success) {
            setUser(meResult.value.data.user);
          }
          if (permResult.status === 'fulfilled' && permResult.value?.data?.success) {
            setPermissions(permResult.value.data.permissions);
          }
        }).catch(() => {
          // Keep initial auth state if enrichment fails
        });

        return { success: true, user: initialUser };
      }

      return { success: false, error: 'Login failed' };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [API_BASE_URL, setToken, loadPermissions]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await axios.post(`${API_BASE_URL}/api/auth/logout`, {}, { withCredentials: true });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setToken(null);
      setUser(null);
      setPermissions({ global: [], byDivision: {}, isAdmin: false });
    }
  }, [API_BASE_URL, setToken]);

  // Change password function
  const changePassword = useCallback(async (oldPassword, newPassword) => {
    try {
      setError(null);
      const response = await axios.post(`${API_BASE_URL}/api/auth/change-password`, {
        oldPassword,
        newPassword
      });

      if (response.data.success) {
        // Auto logout after password change
        await logout();
        return { success: true };
      }

      return { success: false, error: 'Password change failed' };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Password change failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [API_BASE_URL, logout]);

  // Update profile function
  const updateProfile = useCallback(async (updates) => {
    try {
      setError(null);
      // Read token directly from localStorage to avoid stale closure issues
      const currentToken = localStorage.getItem('auth_token');
      if (!currentToken) {
        return { success: false, error: 'No authentication token' };
      }
      const response = await axios.put(`${API_BASE_URL}/api/auth/profile`, updates, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (response.data.success) {
        setUser(prevUser => ({ ...prevUser, ...response.data.user }));
        return { success: true, user: response.data.user };
      }

      return { success: false, error: 'Profile update failed' };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Profile update failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [API_BASE_URL]);

  // Get preferences function
  const getPreferences = useCallback(async () => {
    try {
      const now = Date.now();
      if (preferencesCache.data && (now - preferencesCache.ts) < PREFERENCES_CACHE_TTL_MS) {
        return { success: true, preferences: preferencesCache.data };
      }
      if (preferencesInFlight) {
        return preferencesInFlight;
      }

      // First try localStorage, then fall back to axios header
      let currentToken = localStorage.getItem('auth_token');
      
      // Fallback: if localStorage is empty but axios has the token, use that
      if (!currentToken) {
        const axiosToken = axios.defaults.headers.common['Authorization'];
        if (axiosToken && axiosToken.startsWith('Bearer ')) {
          currentToken = axiosToken.substring(7);
          // Re-save to localStorage
          localStorage.setItem('auth_token', currentToken);
        }
      }
      
      if (!currentToken) {
        return { success: false, error: 'No authentication token' };
      }
      preferencesInFlight = (async () => {
        const response = await axios.get(`${API_BASE_URL}/api/auth/preferences`, {
          headers: { Authorization: `Bearer ${currentToken}` }
        });
        if (response.data.success) {
          preferencesCache = { data: response.data.preferences, ts: Date.now() };
          return { success: true, preferences: response.data.preferences };
        }
        return { success: false, error: 'Failed to load preferences' };
      })();

      try {
        return await preferencesInFlight;
      } finally {
        preferencesInFlight = null;
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to load preferences';
      preferencesInFlight = null;
      return { success: false, error: errorMessage };
    }
  }, [API_BASE_URL]);

  // Update preferences function (including period selection)
  const updatePreferences = useCallback(async (preferences) => {
    try {
      setError(null);
      // First try localStorage, then fall back to axios header (which was set during login)
      let currentToken = localStorage.getItem('auth_token');
      
      // Fallback: if localStorage is empty but axios has the token, use that
      if (!currentToken) {
        const axiosToken = axios.defaults.headers.common['Authorization'];
        if (axiosToken && axiosToken.startsWith('Bearer ')) {
          currentToken = axiosToken.substring(7);
          // Re-save to localStorage
          localStorage.setItem('auth_token', currentToken);
        }
      }
      
      if (!currentToken) {
        return { success: false, error: 'No authentication token' };
      }
      const response = await axios.put(`${API_BASE_URL}/api/auth/preferences`, preferences, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      if (response.data.success) {
        // Update user object with new preferences
        setUser(prevUser => ({ 
          ...prevUser, 
          preferences: response.data.preferences 
        }));
        preferencesCache = { data: response.data.preferences, ts: Date.now() };
        return { success: true, preferences: response.data.preferences };
      }

      return { success: false, error: 'Preferences update failed' };
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Preferences update failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [API_BASE_URL]);

  // Check if user has access to division
  const hasAccessToDivision = useCallback((division) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.divisions?.includes(division);
  }, [user]);

  // Check if user has specific role
  const hasRole = useCallback((role) => {
    if (!user) return false;
    if (Array.isArray(role)) {
      return role.includes(user.role);
    }
    return user.role === role;
  }, [user]);

  /**
   * Check if user has a specific permission
   * @param {string} permissionKey - Permission key (e.g., 'sales:budget:view')
   * @param {string|null} division - Division code for division-scoped permissions (e.g., 'FP')
   * @returns {boolean}
   */
  const hasPermission = useCallback((permissionKey, division = null) => {
    // Admin users have all permissions
    if (user?.role === 'admin' || permissions.isAdmin) {
      return true;
    }
    
    // Check global permissions first
    if (permissions.global?.includes(permissionKey)) {
      return true;
    }
    
    // If division is specified, check division-scoped permissions
    if (division && permissions.byDivision?.[division.toUpperCase()]) {
      return permissions.byDivision[division.toUpperCase()].includes(permissionKey);
    }
    
    return false;
  }, [user, permissions]);

  // Refresh user data from server
  const refreshUser = useCallback(async () => {
    try {
      const token = getToken();
      if (token) {
        const response = await axios.get(`${API_BASE_URL}/api/auth/me`);
        if (response.data.success) {
          setUser(response.data.user);
          return { success: true, user: response.data.user };
        }
      }
      return { success: false, error: 'Not authenticated' };
    } catch (error) {
      console.error('Failed to refresh user:', error);
      return { success: false, error: 'Failed to refresh user data' };
    }
  }, [API_BASE_URL]);

  // Check if user is authenticated
  const isAuthenticated = Boolean(user);

  const value = {
    user,
    token,
    loading,
    error,
    login,
    logout,
    changePassword,
    updateProfile,
    getPreferences,
    updatePreferences,
    refreshUser,
    hasAccessToDivision,
    hasRole,
    hasPermission,
    permissions,
    loadPermissions,
    isAuthenticated,
    setError,
    getToken
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
