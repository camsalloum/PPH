import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './DeploymentPanel.css';

/**
 * DeploymentPanel - Admin-only component for deploying to VPS
 * 
 * Flow:
 * 1. Git commit & push to GitHub (local)
 * 2. Build frontend locally (VPS has limited RAM)
 * 3. SSH into VPS: git pull (code), SFTP (build), rsync (server), pm2 restart
 * 4. Optionally: run pending database migrations (additive only, tracked)
 */
const DeploymentPanel = () => {
  const [status, setStatus] = useState({
    lastDeployment: null,
    vpsConnected: false,
    sshConfigured: false,
    checking: true
  });
  const [logs, setLogs] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const [includeDb, setIncludeDb] = useState(true);
  const [deployMode, setDeployMode] = useState('dev');
  const [vpsInfo, setVpsInfo] = useState(null);
  const [deployProgress, setDeployProgress] = useState({ percent: 0, currentStep: '', totalSteps: 0, step: 0 });

  const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

  useEffect(() => {
    checkDeploymentStatus();
  }, []);

  const checkDeploymentStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/deployment/status`);
      if (response.data.success) {
        setStatus({
          lastDeployment: response.data.lastDeployment,
          vpsConnected: response.data.vpsConnected,
          sshConfigured: response.data.sshConfigured,
          checking: false
        });
      }
    } catch (error) {
      console.error('Error checking deployment status:', error);
      setStatus(prev => ({ ...prev, checking: false }));
    }
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { timestamp, message, type }]);
  };

  // ---- Test SSH Connection ----
  const handleTestConnection = async () => {
    setTesting(true);
    setLogs([]);
    addLog('Testing SSH connection to VPS...', 'info');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/deployment/test-connection`, {}, {
        timeout: 30000
      });

      if (response.data.success) {
        addLog('SSH connection successful!', 'success');
        addLog('', 'info');
        const info = response.data.info;
        setVpsInfo(info);
        addLog(`  Hostname:   ${info.hostname}`, 'info');
        addLog(`  User:       ${info.user}`, 'info');
        addLog(`  Git:        ${info.git}`, 'info');
        addLog(`  Node:       ${info.node}`, 'info');
        addLog(`  npm:        ${info.npm}`, 'info');
        addLog(`  pm2:        ${info.pm2}`, 'info');
        addLog(`  Disk:       ${info.disk}`, 'info');
        addLog(`  App Dir:    ${info.appDir}`, 'info');
        addLog(`  public_html: ${info.publicHtml}`, 'info');
        setStatus(prev => ({ ...prev, vpsConnected: true }));
      } else {
        addLog(`Connection failed: ${response.data.message}`, 'error');
        setStatus(prev => ({ ...prev, vpsConnected: false }));
      }
    } catch (error) {
      addLog(`Connection error: ${error.message}`, 'error');
      setStatus(prev => ({ ...prev, vpsConnected: false }));
    } finally {
      setTesting(false);
    }
  };

  // ---- Get VPS Diagnostics (pm2 logs, status, port check) ----
  const handleGetDiagnostics = async () => {
    setTesting(true);
    setLogs([]);
    addLog('Fetching VPS diagnostics...', 'info');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/deployment/vps-diagnostics`, {}, {
        timeout: 30000
      });

      if (response.data.success) {
        const diag = response.data.diagnostics;
        
        addLog('═══════════════════════════════════════', 'info');
        addLog('VPS DIAGNOSTICS', 'info');
        addLog('═══════════════════════════════════════', 'info');
        addLog('', 'info');
        
        // pm2 status
        addLog('PM2 STATUS:', 'info');
        if (diag.pm2Status && diag.pm2Status.length > 0) {
          diag.pm2Status.forEach(proc => {
            const status = proc.pm2_env.status;
            const restarts = proc.pm2_env.restart_time || 0;
            const memory = (proc.monit.memory / 1024 / 1024).toFixed(2);
            const cpu = proc.monit.cpu;
            addLog(`  ${proc.name}:`, 'info');
            addLog(`    Status: ${status}`, status === 'online' ? 'success' : 'error');
            addLog(`    Restarts: ${restarts}`, restarts > 10 ? 'warning' : 'info');
            addLog(`    Memory: ${memory} MB`, 'info');
            addLog(`    CPU: ${cpu}%`, 'info');
            addLog(`    Uptime: ${Math.floor(proc.pm2_env.pm_uptime / 1000 / 60)} minutes`, 'info');
          });
        } else {
          addLog('  No pm2 processes found', 'warning');
        }
        
        addLog('', 'info');
        addLog('PORT 3001 CHECK:', 'info');
        addLog(`  ${diag.portCheck === 'none' ? 'Port is free' : `PIDs using port: ${diag.portCheck}`}`, 
          diag.portCheck === 'none' ? 'success' : 'warning');
        
        addLog('', 'info');
        addLog('MEMORY USAGE:', 'info');
        diag.memoryUsage.split('\n').forEach(line => addLog(`  ${line}`, 'info'));
        
        addLog('', 'info');
        addLog('DISK USAGE:', 'info');
        diag.diskUsage.split('\n').forEach(line => addLog(`  ${line}`, 'info'));
        
        addLog('', 'info');
        addLog('PM2 LOGS (last 100 lines):', 'info');
        addLog('─────────────────────────────────────', 'info');
        diag.pm2Logs.split('\n').slice(-100).forEach(line => {
          const type = line.includes('error') || line.includes('Error') ? 'error' : 
                       line.includes('warn') ? 'warning' : 'info';
          addLog(line, type);
        });
        
      } else {
        addLog(`Diagnostics failed: ${response.data.message}`, 'error');
      }
    } catch (error) {
      addLog(`Diagnostics error: ${error.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  // ---- Export Database (local) ----
  const handleExportDatabase = async () => {
    setExporting(true);
    setActiveAction('export');
    setLogs([]);
    addLog('Starting database export...', 'info');

    try {
      const response = await axios.post(`${API_BASE_URL}/api/deployment/export-database`, {}, {
        timeout: 300000
      });

      if (response.data.success) {
        addLog('Database export completed!', 'success');
        response.data.files?.forEach(file => {
          const icon = file.success ? 'OK' : 'SKIP';
          addLog(`  [${icon}] ${file.name}: ${file.size}`, file.success ? 'info' : 'warning');
        });
      } else {
        addLog(`Export failed: ${response.data.error}`, 'error');
      }
    } catch (error) {
      addLog(`Export error: ${error.message}`, 'error');
    } finally {
      setExporting(false);
      setActiveAction(null);
    }
  };

  // ---- Stream VPS Deploy (SSE) — used by both Deploy Code and Full Deploy ----
  const streamVpsDeploy = (includeDatabase = false) => {
    return new Promise((resolve, reject) => {
      setDeployProgress({ percent: 0, currentStep: 'Connecting...', totalSteps: 0, step: 0 });

      // Get auth token for the SSE request (deployment routes require admin auth)
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || sessionStorage.getItem('token');

      fetch(`${API_BASE_URL}/api/deployment/deploy-to-vps`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ includeDatabase, deployMode })
      }).then(response => {
        // Handle 409 Conflict (another deployment is already in progress)
        if (response.status === 409) {
          return response.json().then(data => {
            reject(new Error(data.message || 'Another deployment is already in progress'));
          });
        }
        if (!response.ok && response.status !== 200) {
          reject(new Error(`Server returned HTTP ${response.status}`));
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function processChunk({ done, value }) {
          if (done) {
            resolve();
            return;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.slice(6));

                if (event.type === 'start') {
                  addLog(`Deploying to VPS (${event.totalSteps} steps)...`, 'info');
                  setDeployProgress(p => ({ ...p, totalSteps: event.totalSteps }));
                } else if (event.type === 'step') {
                  const icon = event.status === 'done' ? '✓' : '⟳';
                  const pct = event.percent || 0;
                  setDeployProgress({
                    percent: pct,
                    currentStep: event.name,
                    totalSteps: event.totalSteps,
                    step: event.step
                  });
                  if (event.status === 'running') {
                    addLog(`  [${event.step}/${event.totalSteps}] ${icon} ${event.name}${event.detail ? ' — ' + event.detail : ''}`, 'info');
                  } else {
                    addLog(`  [${event.step}/${event.totalSteps}] ${icon} ${event.name} — ${event.detail || 'Done'}`, 'success');
                  }
                } else if (event.type === 'log') {
                  addLog(`     ${event.message}`, 'info');
                } else if (event.type === 'complete') {
                  setDeployProgress({ percent: 100, currentStep: 'Complete!', totalSteps: 0, step: 0 });
                  addLog('', 'info');
                  addLog('═══════════════════════════════════════', 'success');
                  addLog('  ✓ DEPLOYMENT COMPLETE!', 'success');
                  addLog('  propackhub.com is now live', 'success');
                  addLog('═══════════════════════════════════════', 'success');
                  resolve();
                } else if (event.type === 'error') {
                  addLog(`Deploy error: ${event.message}`, 'error');
                  if (event.hint) addLog(`Hint: ${event.hint}`, 'warning');
                  setDeployProgress(p => ({ ...p, currentStep: 'Failed' }));
                  reject(new Error(event.message));
                }
              } catch (e) { /* skip unparseable lines */ }
            }
          }

          reader.read().then(processChunk).catch(reject);
        }

        reader.read().then(processChunk).catch(reject);
      }).catch(reject);
    });
  };

  // ---- Deploy Code Only (git push + build + VPS) ----
  const handleDeployCode = async () => {
    if (!window.confirm('Deploy code to propackhub.com? This will push code, build, and deploy to the live VPS.')) return;
    setDeploying(true);
    setActiveAction('deploy-code');
    setLogs([]);
    setDeployProgress({ percent: 0, currentStep: '', totalSteps: 0, step: 0 });
    addLog(`Starting code deployment (${deployMode.toUpperCase()} mode)...`, 'info');
    addLog('', 'info');

    try {
      await streamVpsDeploy(false);
    } catch (error) {
      addLog(`Deployment error: ${error.message}`, 'error');
    } finally {
      setDeploying(false);
      setActiveAction(null);
      checkDeploymentStatus();
    }
  };

  // ---- Full Deploy (Git push + Build + VPS + optional DB migrations) ----
  const handleFullDeploy = async () => {
    const msg = includeDb 
      ? 'FULL DEPLOY to propackhub.com INCLUDING database migrations. This affects the live production site. Continue?'
      : 'FULL DEPLOY to propackhub.com. This affects the live production site. Continue?';
    if (!window.confirm(msg)) return;
    setDeploying(true);
    setActiveAction('full-deploy');
    setLogs([]);
    setDeployProgress({ percent: 0, currentStep: '', totalSteps: 0, step: 0 });
    
    addLog(`Starting FULL deployment (${deployMode.toUpperCase()} mode)...`, 'info');
    if (includeDb) {
      addLog('Database migrations will be applied on VPS', 'info');
    }
    if (deployMode === 'strict') {
      addLog('Strict mode: only staged files are allowed; unstaged/untracked files block deploy', 'info');
    } else {
      addLog('Dev mode: auto-stages deployable files and excludes docs/backups/logs', 'info');
    }
    addLog('', 'info');

    try {
      await streamVpsDeploy(includeDb);
    } catch (error) {
      addLog(`Deployment failed: ${error.message}`, 'error');
    } finally {
      setDeploying(false);
      setActiveAction(null);
      checkDeploymentStatus();
    }
  };

  const clearLogs = () => {
    setLogs([]);
    setVpsInfo(null);
  };

  return (
    <div className="deployment-panel">
      <div className="deployment-header">
        <h2>Deploy to VPS</h2>
        <p className="deployment-description">
          One-click deployment to propackhub.com via SSH + Git
        </p>
      </div>

      {/* Status Card */}
      <div className="deployment-status-card">
        <h3>Deployment Status</h3>
        {status.checking ? (
          <p>Checking status...</p>
        ) : (
          <div className="status-grid">
            <div className="status-item">
              <span className="status-label">Last Export:</span>
              <span className="status-value">
                {status.lastDeployment || 'Never'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">SSH:</span>
              <span className={`status-badge ${status.vpsConnected ? 'connected' : status.sshConfigured ? 'configured' : 'disconnected'}`}>
                {status.vpsConnected 
                  ? 'Connected' 
                  : status.sshConfigured 
                    ? 'Configured (not tested)' 
                    : 'Not configured'}
              </span>
            </div>
            <div className="status-item">
              <button 
                className="btn-deploy btn-test"
                onClick={handleTestConnection}
                disabled={testing || deploying || !status.sshConfigured}
                title={!status.sshConfigured ? 'Set VPS_SSH_PASSWORD in server/.env first' : ''}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SSH Not Configured Warning */}
      {!status.checking && !status.sshConfigured && (
        <div className="deployment-warning">
          <h4>SSH Password Required</h4>
          <p>To enable automatic deployment, add your VPS SSH password to <code>server/.env</code>:</p>
          <pre>VPS_SSH_PASSWORD=your_ssh_password_here</pre>
          <p>Then restart the backend server.</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="deployment-actions">
        <div className="action-card">
          <h4>Deploy Mode</h4>
          <p>Control what gets committed before VPS deploy</p>
          <div className="deploy-options">
            <label className="checkbox-label" style={{ display: 'block', marginBottom: 6 }}>
              <input
                type="radio"
                name="deploy-mode"
                value="dev"
                checked={deployMode === 'dev'}
                onChange={() => setDeployMode('dev')}
                disabled={deploying}
              />
              Dev (auto-stage deployable files)
            </label>
            <label className="checkbox-label" style={{ display: 'block' }}>
              <input
                type="radio"
                name="deploy-mode"
                value="strict"
                checked={deployMode === 'strict'}
                onChange={() => setDeployMode('strict')}
                disabled={deploying}
              />
              Strict (staged-only, block dirty tree)
            </label>
          </div>
        </div>

        <div className="action-card">
          <h4>Backup Database</h4>
          <p>Create local pg_dump backups (safety only — NOT used for deployment)</p>
          <button 
            className="btn-deploy btn-secondary"
            onClick={handleExportDatabase}
            disabled={exporting || deploying}
          >
            {exporting ? 'Backing up...' : 'Backup Database'}
          </button>
        </div>

        <div className="action-card">
          <h4>Deploy Code</h4>
          <p>Git push + SSH to VPS: pull, build, deploy frontend & backend, restart pm2</p>
          <button 
            className="btn-deploy btn-secondary"
            onClick={handleDeployCode}
            disabled={exporting || deploying || !status.sshConfigured}
          >
            {activeAction === 'deploy-code' ? 'Deploying...' : 'Deploy Code'}
          </button>
        </div>

        <div className="action-card primary">
          <h4>Full Deployment</h4>
          <p>Git push + build + deploy to VPS (code, frontend, backend, pm2)</p>
          <div className="deploy-options">
            <label className="checkbox-label">
              <input 
                type="checkbox" 
                checked={includeDb} 
                onChange={(e) => setIncludeDb(e.target.checked)}
                disabled={deploying}
              />
              Run database migrations (safe — additive only)
            </label>
          </div>
          <button 
            className="btn-deploy btn-primary"
            onClick={handleFullDeploy}
            disabled={exporting || deploying || !status.sshConfigured}
          >
            {activeAction === 'full-deploy' ? 'Deploying...' : 'Full Deploy to VPS'}
          </button>
        </div>
      </div>

      {/* Progress Bar — visible during deployment */}
      {deploying && deployProgress.totalSteps > 0 && (
        <div className="deploy-progress-section">
          <div className="deploy-progress-header">
            <span className="deploy-progress-label">
              {deployProgress.percent < 100 
                ? `Step ${deployProgress.step} of ${deployProgress.totalSteps}: ${deployProgress.currentStep}`
                : '✓ Deployment Complete!'
              }
            </span>
            <span className="deploy-progress-pct">{deployProgress.percent}%</span>
          </div>
          <div className="deploy-progress-bar-track">
            <div 
              className={`deploy-progress-bar-fill ${deployProgress.percent >= 100 ? 'complete' : ''}`}
              style={{ width: `${deployProgress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Deployment Logs */}
      {logs.length > 0 && (
        <div className="deployment-logs">
          <div className="logs-header">
            <h3>Deployment Log</h3>
            <button className="btn-clear-logs" onClick={clearLogs}>Clear</button>
          </div>
          <div className="logs-container">
            {logs.map((log, index) => (
              <div key={index} className={`log-entry log-${log.type}`}>
                <span className="log-time">[{log.timestamp}]</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deployment Flow Info */}
      <div className="deployment-manual">
        <h3>How It Works</h3>
        <p>The deployment is fully automated via SSH + Git:</p>
        <ol>
          <li><strong>Git Push</strong> - Commits and pushes your code to GitHub</li>
          <li><strong>Build Locally</strong> - Runs <code>npm run build</code> on your machine (VPS has limited RAM)</li>
          <li><strong>SSH to VPS</strong> - Connects to propackhub.com via SSH</li>
          <li><strong>Git Pull</strong> - Pulls the latest code on the VPS</li>
          <li><strong>Deploy Frontend</strong> - Uploads build files to <code>/home/propackhub/public_html/</code> (atomic swap)</li>
          <li><strong>Deploy Backend</strong> - Syncs server files to <code>/home/propackhub/app/server/</code> (preserves .env)</li>
          <li><strong>Install Deps</strong> - Runs <code>npm install --production</code> for backend packages</li>
          <li><strong>Restart</strong> - Restarts pm2 backend process + health check</li>
        </ol>
        {includeDb && (
          <p><strong>+ Database:</strong> Runs pending SQL migrations (UP/DOWN file pairs, tracked in schema_migrations table)</p>
        )}
        <p style={{ marginTop: '8px', fontSize: '0.85em', color: '#888' }}>
          ⚠ Linux VPS is <strong>case-sensitive</strong> — <code>File.jpg</code> and <code>file.jpg</code> are different files.
          Deployment logs will warn about files with uppercase or spaces.
        </p>
      </div>
    </div>
  );
};

export default DeploymentPanel;
