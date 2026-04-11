/**
 * IPDashboard Authentication Client
 * Handles JWT token management with automatic refresh
 * 
 * Usage:
 * import { authClient } from './authClient';
 * 
 * // Login
 * const user = await authClient.login(email, password);
 * 
 * // Make authenticated requests
 * const data = await authClient.fetch('/api/aebf/actual?division=FP');
 * 
 * // Logout
 * await authClient.logout();
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
const TOKEN_REFRESH_MARGIN = 5 * 60 * 1000; // Refresh 5 minutes before expiry (was 2)

class AuthClient {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.refreshTimer = null;
    this.refreshPromise = null; // Prevent concurrent refresh attempts
    this.user = null;
    this.onAuthStateChange = null;
  }

  /**
   * Login with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User object
   */
  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Important: sends/receives cookies
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    
    this.setToken(data.accessToken, data.expiresIn);
    this.user = data.user;
    
    // Notify listeners
    this._notifyAuthStateChange(true);
    
    return this.user;
  }

  /**
   * Logout and clear tokens
   */
  async logout() {
    try {
      await fetch(`${API_BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: this._getAuthHeaders(),
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
    
    this.clearToken();
    this.user = null;
    this._notifyAuthStateChange(false);
  }

  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.accessToken && this.tokenExpiry > Date.now();
  }

  /**
   * Get current user
   * @returns {Object|null}
   */
  getUser() {
    return this.user;
  }

  /**
   * Make authenticated API request
   * Automatically refreshes token if needed
   * @param {string} path - API path (without base URL)
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} Response data
   */
  async fetch(path, options = {}) {
    // Proactively refresh token if it will expire soon
    if (this.tokenExpiry && this.tokenExpiry - Date.now() < TOKEN_REFRESH_MARGIN) {
      await this.refreshToken();
    }
    
    // Also ensure we have a valid token before making the request
    if (!this.accessToken && this.user) {
      // Token cleared but user still exists - try refresh
      await this.refreshToken();
    }
    
    const url = path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this._getAuthHeaders(),
        ...options.headers,
      },
      credentials: 'include',
    });

    // Handle 401 - try refresh once
    if (response.status === 401) {
      const refreshed = await this.refreshToken();
      if (refreshed) {
        // Retry original request
        return this.fetch(path, options);
      }
      // Refresh failed - logout
      this.clearToken();
      this._notifyAuthStateChange(false);
      throw new Error('Session expired');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Refresh the access token using the refresh token cookie
   * @returns {Promise<boolean>} True if refresh succeeded
   */
  async refreshToken() {
    // If a refresh is already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    
    this.refreshPromise = this._doRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = null;
    return result;
  }
  
  /**
   * Internal refresh implementation
   * @private
   */
  async _doRefresh() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      
      if (data.success && data.accessToken) {
        this.setToken(data.accessToken, data.expiresIn);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Token refresh failed:', error);
      return false;
    }
  }

  /**
   * Set the access token and schedule refresh
   * @param {string} token - JWT access token
   * @param {string} expiresIn - Token expiry (e.g., "15m")
   */
  setToken(token, expiresIn) {
    this.accessToken = token;
    
    // Parse expiry time
    const expiryMs = this._parseExpiryTime(expiresIn);
    this.tokenExpiry = Date.now() + expiryMs;
    
    // Schedule refresh before expiry
    this._scheduleRefresh(expiryMs - TOKEN_REFRESH_MARGIN);
  }

  /**
   * Clear the access token and cancel refresh
   */
  clearToken() {
    this.accessToken = null;
    this.tokenExpiry = null;
    
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Set callback for auth state changes
   * @param {Function} callback - Called with (isAuthenticated: boolean)
   */
  setOnAuthStateChange(callback) {
    this.onAuthStateChange = callback;
  }

  /**
   * Initialize from existing session
   * Checks if there's a valid refresh token and gets a new access token
   * @returns {Promise<boolean>} True if session restored
   */
  async initializeSession() {
    const refreshed = await this.refreshToken();
    
    if (refreshed) {
      // Get user info
      try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: this._getAuthHeaders(),
          credentials: 'include',
        });
        
        if (response.ok) {
          const data = await response.json();
          this.user = data.user;
          this._notifyAuthStateChange(true);
          return true;
        }
      } catch (error) {
        console.error('Failed to get user info:', error);
      }
    }
    
    return false;
  }

  // Private methods

  _getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    return headers;
  }

  _parseExpiryTime(expiresIn) {
    if (!expiresIn) return 15 * 60 * 1000; // Default 15 minutes
    
    // If it's a number, treat as milliseconds
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }
    
    // If it's a string like "15m", parse it
    if (typeof expiresIn === 'string') {
      const match = expiresIn.match(/^(\d+)([smhd])$/);
      if (!match) return 15 * 60 * 1000;
      
      const value = parseInt(match[1], 10);
      const unit = match[2];
      
      switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        default: return 15 * 60 * 1000;
      }
    }
    
    return 15 * 60 * 1000;
  }

  _scheduleRefresh(delay) {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    if (delay > 0) {
      this.refreshTimer = setTimeout(async () => {
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          // Refresh failed - notify auth state change
          this.clearToken();
          this._notifyAuthStateChange(false);
        }
      }, delay);
    } else {
      // Token already needs refresh - do it now
      this.refreshToken();
    }
  }

  _notifyAuthStateChange(isAuthenticated) {
    if (this.onAuthStateChange) {
      this.onAuthStateChange(isAuthenticated);
    }
  }
}

// Singleton instance
const authClient = new AuthClient();

// React Hook for using auth client
export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = React.useState(authClient.isAuthenticated());
  const [user, setUser] = React.useState(authClient.getUser());
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    authClient.setOnAuthStateChange((authenticated) => {
      setIsAuthenticated(authenticated);
      setUser(authClient.getUser());
    });

    // Try to restore session
    authClient.initializeSession().finally(() => {
      setLoading(false);
    });

    return () => {
      authClient.setOnAuthStateChange(null);
    };
  }, []);

  const login = async (email, password) => {
    const user = await authClient.login(email, password);
    setUser(user);
    setIsAuthenticated(true);
    return user;
  };

  const logout = async () => {
    await authClient.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  return {
    isAuthenticated,
    user,
    loading,
    login,
    logout,
    fetch: authClient.fetch.bind(authClient),
  };
}

export { authClient };
export default authClient;
