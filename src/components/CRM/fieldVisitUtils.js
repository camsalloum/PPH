/**
 * Shared utilities for FieldVisit components.
 * Centralised constants, auth helpers, formatting, and status dictionaries
 * used across Planner, Map, RouteView, List, Detail, ApprovalCard, etc.
 */

/* ──────────────── environment ──────────────── */

export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const getAuthHeaders = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/* ──────────────── Google Maps ──────────────── */

/** Google Maps libraries to load — shared across Planner, Map, RouteView */
export const GMAP_LIBRARIES = ['marker', 'places'];

/* ──────────────── coordinates ──────────────── */

/**
 * Check if lat/lng represent a valid, non-placeholder coordinate pair.
 * Returns false for null, NaN, 0/0, and legacy 24.0/53.999 placeholder.
 */
export const hasValidCoordinates = (lat, lng) => {
  const nLat = Number(lat);
  const nLng = Number(lng);
  if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
  if (Math.abs(nLat) < 0.0001 && Math.abs(nLng) < 0.0001) return false;
  if (Math.abs(nLat - 24.0) < 0.0001 && Math.abs(nLng - 53.999) < 0.0001) return false;
  return true;
};

/** Safely coerce to Number, returning null when not finite. */
export const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Haversine great-circle distance between two {lat, lng} points (km). */
export const haversineKm = (a, b) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/* ──────────────── formatting ──────────────── */

/** Format seconds into human-readable duration, e.g. "2h 15m". */
export const formatDuration = (sec) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/** Format distance in metres to "X km" string, or null if invalid/zero. */
export const formatDistanceKm = (distanceM) => {
  const km = Number(distanceM || 0) / 1000;
  if (!Number.isFinite(km) || km <= 0) return null;
  return `${km.toFixed(km >= 100 ? 0 : 1)} km`;
};

/** Remove map plus-codes and noisy separators from user-facing place labels. */
export const sanitizeLocationLabel = (raw) => {
  if (!raw) return '';
  let txt = String(raw).trim();
  txt = txt.replace(/\s*[\u2014\u2013-]\s*\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}\b/gi, '');
  txt = txt.replace(/\b[A-Z0-9]{4,8}\+[A-Z0-9]{2,4}\b/gi, '');
  txt = txt.replace(/\s+,/g, ',').replace(/,\s*,/g, ',');
  txt = txt.replace(/\s{2,}/g, ' ').trim();
  txt = txt.replace(/^[,\s\-\u2013\u2014]+|[,\s\-\u2013\u2014]+$/g, '');
  return txt;
};

/* ──────────────── stop colours ──────────────── */

/**
 * Canonical stop-type → colour map.
 * Covers customer, prospect, location, supplier, custom, other.
 */
export const STOP_COLORS = {
  customer: '#1677ff',
  prospect: '#faad14',
  location: '#52c41a',
  supplier: '#722ed1',
  custom:   '#8c8c8c',
  other:    '#8c8c8c',
};

/* ──────────────── trip status dictionary ──────────────── */

export const TRIP_STATUS_CFG = {
  draft:            { color: '#d48806', bg: '#fffbe6', label: 'Draft' },
  planning:         { color: '#8c8c8c', bg: '#f5f5f5', label: 'Planning' },
  confirmed:        { color: '#1677ff', bg: '#e6f4ff', label: 'Confirmed' },
  pending_approval: { color: '#722ed1', bg: '#f9f0ff', label: 'Pending Approval' },
  in_progress:      { color: '#fa8c16', bg: '#fff7e6', label: 'In Progress' },
  completed:        { color: '#52c41a', bg: '#f6ffed', label: 'Completed' },
  cancelled:        { color: '#ff4d4f', bg: '#fff2f0', label: 'Cancelled' },
};

/* ──────────────── stop status dictionary ──────────────── */

export const STOP_STATUS_CFG = {
  planned:   { color: '#8c8c8c', label: 'Planned' },
  visited:   { color: '#52c41a', label: 'Visited' },
  no_show:   { color: '#ff4d4f', label: 'No Show' },
  postponed: { color: '#fa8c16', label: 'Postponed' },
  cancelled: { color: '#d9d9d9', label: 'Cancelled' },
};

/* ──────────────── report status dictionary ──────────────── */

export const REPORT_STATUS_CFG = {
  draft:              { color: 'default',    label: 'Report Draft' },
  submitted:          { color: 'processing', label: 'Report Submitted' },
  revision_requested: { color: 'warning',    label: 'Report Revision Requested' },
  rejected:           { color: 'error',      label: 'Report Rejected' },
  approved:           { color: 'success',    label: 'Report Approved' },
};

/* ──────────────── travel-report status dictionary ──────────────── */

export const TRAVEL_REPORT_STATUS_CFG = {
  draft:              { color: '#8c8c8c', bg: '#f5f5f5', label: 'Draft' },
  submitted:          { color: '#1677ff', bg: '#e6f4ff', label: 'Submitted' },
  approved:           { color: '#52c41a', bg: '#f6ffed', label: 'Approved' },
  rejected:           { color: '#ff4d4f', bg: '#fff2f0', label: 'Rejected' },
  revision_requested: { color: '#fa8c16', bg: '#fff7e6', label: 'Revision Requested' },
};
