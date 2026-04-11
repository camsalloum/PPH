/**
 * ARCH-001: useApi hook
 *
 * Returns the global axios instance. AuthContext already sets
 * axios.defaults.headers.common['Authorization'] on every login/refresh,
 * so components no longer need to pull the token from localStorage manually.
 *
 * Usage:
 *   const api = useApi();
 *   const res = await api.get('/api/mes/presales/inquiries');
 */
import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

/**
 * Returns an axios instance pre-configured with the API base URL.
 * Auth header is managed globally by AuthContext.
 */
export function useApi() {
  // Create a scoped instance that prepends the base URL so callers
  // only need to supply the path, e.g. '/api/mes/presales/inquiries'
  const instance = axios.create({ baseURL: API_BASE });

  // Copy current auth header from globals (set by AuthContext)
  const globalAuth = axios.defaults.headers.common['Authorization'];
  if (globalAuth) {
    instance.defaults.headers.common['Authorization'] = globalAuth;
  }

  return instance;
}

export default useApi;
