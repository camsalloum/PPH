/**
 * Cached employee lookup data service.
 *
 * Departments, designations, and branches rarely change during a session.
 * This module caches them with a 5-minute TTL so the 3+ admin sub-tabs
 * that all need the same data (Employees, Org Settings, Territories) don't
 * each make their own redundant API calls.
 *
 * Pattern mirrors countriesService.jsx.
 */
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cache = {
  departments:  { data: null, ts: 0 },
  designations: { data: null, ts: 0 },
  branches:     { data: null, ts: 0 },
};

const getHeaders = () => ({
  headers: { Authorization: `Bearer ${localStorage.getItem('auth_token')}` },
});

const isFresh = (entry) => entry.data && (Date.now() - entry.ts < CACHE_TTL);

export async function fetchDepartments({ forceRefresh = false } = {}) {
  if (!forceRefresh && isFresh(cache.departments)) return cache.departments.data;
  const res = await axios.get(`${API_BASE_URL}/api/employees/departments`, getHeaders());
  if (res.data.success) {
    cache.departments = { data: res.data.departments, ts: Date.now() };
  }
  return cache.departments.data || [];
}

export async function fetchDesignations({ forceRefresh = false } = {}) {
  if (!forceRefresh && isFresh(cache.designations)) return cache.designations.data;
  const res = await axios.get(`${API_BASE_URL}/api/employees/designations`, getHeaders());
  if (res.data.success) {
    cache.designations = { data: res.data.designations, ts: Date.now() };
  }
  return cache.designations.data || [];
}

export async function fetchBranches({ forceRefresh = false } = {}) {
  if (!forceRefresh && isFresh(cache.branches)) return cache.branches.data;
  const res = await axios.get(`${API_BASE_URL}/api/employees/branches`, getHeaders());
  if (res.data.success) {
    cache.branches = { data: res.data.branches, ts: Date.now() };
  }
  return cache.branches.data || [];
}

/** Fetch all three lookups in parallel (cache-aware). */
export async function fetchAllLookups({ forceRefresh = false } = {}) {
  const [departments, designations, branches] = await Promise.all([
    fetchDepartments({ forceRefresh }),
    fetchDesignations({ forceRefresh }),
    fetchBranches({ forceRefresh }),
  ]);
  return { departments, designations, branches };
}

/** Invalidate one or all lookup caches (call after CRUD on departments/etc). */
export function invalidateLookupCache(key) {
  if (key && cache[key]) {
    cache[key] = { data: null, ts: 0 };
  } else {
    Object.keys(cache).forEach(k => { cache[k] = { data: null, ts: 0 }; });
  }
}
