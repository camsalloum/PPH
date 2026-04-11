/**
 * In-flight GET request deduplication.
 *
 * Multiple React contexts / providers independently fetch the same API
 * endpoints on mount (e.g. /api/auth/me, /api/settings/company).  When the
 * app navigates from login → CRM, all providers mount simultaneously and
 * fire ~24 requests, of which ~21 are duplicates.
 *
 * This module keeps a Map of in-flight GET promises keyed by URL.  If a
 * second caller requests the same URL while the first call is still pending,
 * it receives the same Promise (and therefore the same resolved value).
 * Once the first call settles the entry is removed so the next navigation
 * will make a fresh request.
 *
 * Works for both `fetch()` and `axios.get()` callers via two helpers.
 *
 * Also provides a TTL-cached preferences getter used by ResizableTable,
 * ThemeContext, and other callers that need /api/auth/preferences.
 */

const inflight = new Map();

/**
 * Deduplicated wrapper around the global `fetch()`.
 * Only deduplicates GET requests (or requests with no method, which default to GET).
 * Non-GET requests pass straight through.
 *
 * Each caller receives an independent Response clone so the body can be read
 * separately by every consumer.
 */
export function deduplicatedFetch(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') return fetch(url, options);

  if (!inflight.has(url)) {
    const promise = fetch(url, options)
      .finally(() => inflight.delete(url));
    inflight.set(url, promise);
  }

  // Each caller gets their own clone so they can independently read the body
  return inflight.get(url).then(res => res.clone());
}

/**
 * Deduplicated wrapper for axios GET calls.
 * Pass the axios instance and the same args you'd pass to `axios.get()`.
 *
 * Usage:  deduplicatedAxiosGet(axios, url, config)
 *   returns the same Promise<AxiosResponse> to all concurrent callers.
 */
export function deduplicatedAxiosGet(axiosInstance, url, config) {
  if (inflight.has(url)) return inflight.get(url);

  const promise = axiosInstance.get(url, config)
    .finally(() => inflight.delete(url));

  inflight.set(url, promise);
  return promise;
}

// ─── TTL-cached preferences getter ─────────────────────────────
// Shared by ResizableTable, ThemeContext, Settings, etc.
// Prevents N×GET /api/auth/preferences per page load.
const PREFS_TTL_MS = 30_000; // 30 seconds
let _prefsCache = { data: null, ts: 0 };
let _prefsInFlight = null;

/**
 * Get user preferences with 30s TTL cache + in-flight dedup.
 * Returns the raw axios response data: { success, preferences }.
 * Call `invalidatePreferencesCache()` after any PUT to preferences.
 */
export async function getCachedPreferences() {
  const token = localStorage.getItem('auth_token');
  if (!token) return { success: false, preferences: {} };

  const now = Date.now();
  if (_prefsCache.data && (now - _prefsCache.ts) < PREFS_TTL_MS) {
    return _prefsCache.data;
  }

  if (_prefsInFlight) return _prefsInFlight;

  _prefsInFlight = (async () => {
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get('/api/auth/preferences', {
        headers: { Authorization: `Bearer ${token}` }
      });
      _prefsCache = { data: response.data, ts: Date.now() };
      return response.data;
    } catch {
      return { success: false, preferences: {} };
    } finally {
      _prefsInFlight = null;
    }
  })();

  return _prefsInFlight;
}

/**
 * Call after any PUT to /api/auth/preferences so the next GET is fresh.
 */
export function invalidatePreferencesCache() {
  _prefsCache = { data: null, ts: 0 };
}

// ─── TTL-cached admin users getter ─────────────────────────────
// Shared by UserPermissions, AuthorizationRules, EmployeesManagement.
// Prevents duplicate GET /api/auth/users across admin sub-tabs.
const USERS_TTL_MS = 60_000; // 60 seconds
let _usersCache = { data: null, ts: 0 };
let _usersInFlight = null;

/**
 * Get all users with 60s TTL cache + in-flight dedup.
 * Returns the users array directly.
 * Call `invalidateUsersCache()` after any user create/update/delete.
 */
export async function getCachedUsers() {
  const token = localStorage.getItem('auth_token');
  if (!token) return [];

  const now = Date.now();
  if (_usersCache.data && (now - _usersCache.ts) < USERS_TTL_MS) {
    return _usersCache.data;
  }

  if (_usersInFlight) return _usersInFlight;

  _usersInFlight = (async () => {
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get('/api/auth/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const users = response.data.success ? (response.data.users || []) : [];
      _usersCache = { data: users, ts: Date.now() };
      return users;
    } catch {
      return _usersCache.data || [];
    } finally {
      _usersInFlight = null;
    }
  })();

  return _usersInFlight;
}

/**
 * Call after any create/update/delete on users so the next GET is fresh.
 */
export function invalidateUsersCache() {
  _usersCache = { data: null, ts: 0 };
}
