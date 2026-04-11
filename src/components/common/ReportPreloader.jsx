/**
 * ReportPreloader — zero-UI background loader.
 *
 * Mounts once after login (inside the shared provider tree).
 * For sales_rep users: silently fetches their group name and pre-loads the
 * ultra-fast report cache so the "My Report" page opens instantly.
 *
 * No UI rendered — purely a side-effect component.
 */
import { useEffect, useRef } from 'react';
import { useContext } from 'react';
import { AuthContext } from '../../contexts/AuthContext';
import { useFilter } from '../../contexts/FilterContext';
import { useExcelData } from '../../contexts/ExcelDataContext';
import { useSalesRepReports } from '../../contexts/SalesRepReportsContext';

// Only these roles have a record in crm_sales_reps and benefit from preloading.
// All other roles (quality_control, production_manager, etc.) must be skipped
// to avoid a 403 when they hit /api/crm/my-customers.
const SALES_REP_ROLES = ['sales_rep', 'sales_executive'];

const ReportPreloader = () => {
  const auth = useContext(AuthContext);
  const user = auth?.user || null;
  const { columnOrder, basePeriodIndex } = useFilter();
  const { selectedDivision } = useExcelData();
  const { preloadAllReports, isCached } = useSalesRepReports();

  if (!auth) return null;


  // Guards to avoid duplicate fetches across re-renders
  const groupNameRef = useRef(null);
  const lastPreloadKeyRef = useRef('');
  const fetchingGroupRef = useRef(false);

  useEffect(() => {
    // Only act for actual sales rep roles — skip admins, managers, QC, production, etc.
    if (!user || !SALES_REP_ROLES.includes(user.role)) return;

    // Skip if report data is already cached
    if (isCached) return;

    // Need at least one column before we can preload
    if (!columnOrder || columnOrder.length === 0) return;

    // Wait for FilterContext to finish loading saved preferences.
    // basePeriodIndex is null until the async DB load completes, so if it's
    // still null the columnOrder may be an incomplete early snapshot — preloading
    // now would build a cache with the wrong columns and cause 0-MT results.
    if (basePeriodIndex === null) return;

    const preloadKey = `${user.id}-${selectedDivision}-${columnOrder.map(c => `${c.year}${c.month}${c.type}`).join(',')}`;
    if (lastPreloadKeyRef.current === preloadKey) return;
    lastPreloadKeyRef.current = preloadKey; // Set synchronously — prevents double-fire on concurrent renders

    const run = async () => {
      try {
        // Step 1: Get the user's sales rep group name (if not already fetched)
        if (!groupNameRef.current && !fetchingGroupRef.current) {
          fetchingGroupRef.current = true;
          const token = localStorage.getItem('auth_token');
          const res = await fetch('/api/crm/my-customers', {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) return;
          const json = await res.json();
          const repInfo = json?.data?.salesRep || null;
          if (!repInfo?.groupName) return;
          groupNameRef.current = repInfo.groupName;
          fetchingGroupRef.current = false;
        }

        if (!groupNameRef.current) return;

        // Step 2: Silently warm the cache — /crm/report will open instantly
        await preloadAllReports(
          selectedDivision || 'FP',
          [groupNameRef.current],
          columnOrder
        );
      } catch (err) {
        // Non-critical — the page falls back to live fetch on demand
        console.warn('[ReportPreloader] Background preload failed:', err.message);
        // Reset so it retries on next render cycle
        lastPreloadKeyRef.current = '';
      }
    };

    run();
  }, [user, columnOrder, basePeriodIndex, selectedDivision, isCached, preloadAllReports]);

  // Render nothing — this is a pure side-effect component
  return null;
};

export default ReportPreloader;
