import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { message } from 'antd';

const RawMaterialsContext = createContext(null);

export const RawMaterialsProvider = ({ children }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [stats, setStats] = useState(null);
  const [lastSync, setLastSync] = useState(null);
  const [companyTimezone, setCompanyTimezone] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ rows: 0, phase: '', elapsed: 0 });

  const fetchCompanyTimezone = useCallback(async () => {
    try {
      const response = await axios.get('/api/settings/company');
      if (response.data?.success) {
        setCompanyTimezone(response.data.settings?.companyTimezone || null);
      }
    } catch {
      setCompanyTimezone(null);
    }
  }, []);

  const fetchData = useCallback(async () => {
    const res = await axios.get('/api/rm-sync/data', { params: { limit: 1000 } });
    if (res.data?.success) {
      setData(Array.isArray(res.data.data) ? res.data.data : []);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const res = await axios.get('/api/rm-sync/stats');
    if (res.data?.success) {
      setStats(res.data.stats || null);
    }
  }, []);

  const fetchLastSync = useCallback(async () => {
    const res = await axios.get('/api/rm-sync/last-sync');
    if (res.data?.success && res.data.lastSync) {
      setLastSync(res.data.lastSync);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([fetchData(), fetchStats(), fetchLastSync(), fetchCompanyTimezone()]);
    } catch {
      message.error('Failed to load raw materials data');
    } finally {
      setLoading(false);
    }
  }, [fetchCompanyTimezone, fetchData, fetchLastSync, fetchStats]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const syncRM = useCallback(async () => {
    try {
      setSyncing(true);
      setSyncProgress({ rows: 0, phase: 'Starting...', elapsed: 0 });

      const res = await axios.post('/api/rm-sync/sync');
      if (!res.data?.success) {
        setSyncing(false);
        message.error('Failed to start RM sync');
        return false;
      }

      return await new Promise((resolve) => {
        let errors = 0;
        const poll = setInterval(async () => {
          try {
            const pr = await axios.get('/api/rm-sync/progress');
            const p = pr.data?.progress;
            if (p) {
              setSyncProgress({
                rows: p.rows || 0,
                phase: p.phase || 'Processing...',
                elapsed: p.elapsedSeconds || 0,
              });

              if (p.status === 'completed') {
                clearInterval(poll);
                setSyncing(false);
                message.success(`Sync completed — ${p.rows?.toLocaleString() || 0} rows`);
                refreshAll();
                resolve(true);
                return;
              }

              if (p.status === 'failed') {
                clearInterval(poll);
                setSyncing(false);
                message.error(`Sync failed: ${p.error || 'Unknown error'}`);
                resolve(false);
                return;
              }
            }

            errors = 0;
          } catch {
            errors += 1;
            if (errors >= 10) {
              clearInterval(poll);
              setSyncing(false);
              message.error('Sync polling stopped due to repeated errors');
              resolve(false);
            }
          }
        }, 2000);
      });
    } catch (err) {
      setSyncing(false);
      message.error(err.response?.data?.error || 'Failed to start sync');
      return false;
    }
  }, [refreshAll]);

  const value = useMemo(() => ({
    loading,
    data,
    stats,
    lastSync,
    companyTimezone,
    syncing,
    syncProgress,
    refreshAll,
    syncRM,
  }), [loading, data, stats, lastSync, companyTimezone, syncing, syncProgress, refreshAll, syncRM]);

  return (
    <RawMaterialsContext.Provider value={value}>
      {children}
    </RawMaterialsContext.Provider>
  );
};

export const useRawMaterialsContext = () => {
  const context = useContext(RawMaterialsContext);
  if (!context) {
    throw new Error('useRawMaterialsContext must be used within a RawMaterialsProvider');
  }
  return context;
};
