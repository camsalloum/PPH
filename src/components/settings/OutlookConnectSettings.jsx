import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

const OutlookConnectSettings = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ connected: false, status: 'unknown' });
  const [error, setError] = useState('');

  const loadStatus = async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setLoading(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/outlook/status`, { headers });
      setStatus({
        connected: !!res.data?.connected,
        status: res.data?.status || 'unknown',
        email: res.data?.email || '',
        token_expires_at: res.data?.token_expires_at || null,
        last_synced_at: res.data?.last_synced_at || null,
        azure_configured: res.data?.azure_configured !== false,
      });
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load Outlook status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setBusy(true);
    setError('');
    try {
      const res = await axios.get(`${API_BASE_URL}/api/auth/outlook/connect`, { headers });
      const url = res.data?.url;
      if (!url) throw new Error('No authorization URL returned');

      const popup = window.open(url, 'outlook-connect', 'width=560,height=720');
      if (!popup) throw new Error('Popup blocked by browser');

      const listener = (event) => {
        if (event?.data?.source === 'outlook-oauth') {
          window.removeEventListener('message', listener);
          loadStatus();
        }
      };
      window.addEventListener('message', listener);
    } catch (e) {
      const apiMsg = e.response?.data?.error;
      if (e.response?.status === 503) {
        setError(apiMsg || 'Outlook integration is not yet configured. Azure registration pending.');
      } else {
        setError(apiMsg || e.message || 'Failed to start Outlook connect');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    const token = localStorage.getItem('auth_token');
    const headers = { Authorization: `Bearer ${token}` };
    setBusy(true);
    setError('');
    try {
      await axios.delete(`${API_BASE_URL}/api/auth/outlook/disconnect`, { headers });
      await loadStatus();
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to disconnect Outlook');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Outlook Connection</h2>
        <p className="section-description">
          Connect your Microsoft account to enable email sync and send from CRM.
        </p>
      </div>

      <div className="company-info-card" style={{ maxWidth: 780 }}>
        {loading ? (
          <p>Loading connection status...</p>
        ) : (
          <>
            <p><strong>Status:</strong> {status.connected ? 'Connected' : status.status === 'not_migrated' ? 'Not Ready (migration pending)' : 'Not Connected'}</p>
            {status.email ? <p><strong>Mailbox:</strong> {status.email}</p> : null}
            {status.token_expires_at ? <p><strong>Token Expires:</strong> {new Date(status.token_expires_at).toLocaleString()}</p> : null}
            {status.last_synced_at ? <p><strong>Last Sync:</strong> {new Date(status.last_synced_at).toLocaleString()}</p> : null}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              {!status.connected ? (
                <button className="btn-primary" onClick={handleConnect} disabled={busy || status.status === 'not_migrated' || status.azure_configured === false}>
                  {busy ? 'Connecting...' : 'Connect Outlook'}
                </button>
              ) : (
                <button className="btn-secondary" onClick={handleDisconnect} disabled={busy}>
                  {busy ? 'Disconnecting...' : 'Disconnect'}
                </button>
              )}
              <button className="btn-secondary" onClick={loadStatus} disabled={busy || loading}>
                Refresh
              </button>
            </div>

            {status.status === 'not_migrated' && (
              <p style={{ marginTop: 10, color: '#f39c12' }}>
                Outlook tables are not migrated yet. Run Full Deploy with DB migrations enabled.
              </p>
            )}

            {status.azure_configured === false && status.status !== 'not_migrated' && (
              <p style={{ marginTop: 10, color: '#f39c12' }}>
                Azure App Registration is pending. Connect will activate once client credentials are configured.
              </p>
            )}
          </>
        )}

        {error ? <p style={{ marginTop: 12, color: '#e74c3c' }}>{error}</p> : null}
      </div>
    </div>
  );
};

export default OutlookConnectSettings;
