/**
 * VPN Service - FortiGate SSL-VPN Connection Manager
 * 
 * Connects/disconnects to FortiGate SSL-VPN using openfortivpn CLI.
 * Used to establish VPN tunnel before Oracle ERP sync on the VPS.
 * 
 * Prerequisites (on VPS):
 *   sudo dnf install -y openfortivpn
 *   -- or build from source: https://github.com/adrienverge/openfortivpn
 * 
 * Environment variables (server/.env):
 *   VPN_GATEWAY=5.195.104.114
 *   VPN_PORT=48443
 *   VPN_USER=camille
 *   VPN_PASSWORD=***REDACTED***
 */

const { spawn, execSync } = require('child_process');
const net = require('net');
const logger = require('../utils/logger');

class VPNService {
  constructor() {
    this.process = null;
    this.connected = false;
    this.gateway = process.env.VPN_GATEWAY || '5.195.104.114';
    this.port = process.env.VPN_PORT || '48443';
    this.user = process.env.VPN_USER || 'camille';
    this.password = process.env.VPN_PASSWORD;
    this.connectTimeout = 60000; // 60s to establish VPN
    this.oracleHost = process.env.ORACLE_HOST || 'PRODDB-SCAN.ITSUPPORT.HG';
    this.oraclePort = parseInt(process.env.ORACLE_PORT || '1521');
    this.trustedCert = process.env.VPN_TRUSTED_CERT || 'ae1094d5865601d0ecccd1364cc169cefa1d92babac287753f9a1effc3254c66';
  }

  /**
   * Check if openfortivpn is installed
   */
  isInstalled() {
    try {
      execSync('which openfortivpn', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if VPN is already connected by testing Oracle host reachability
   */
  async isOracleReachable() {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this.oraclePort, this.oracleHost);
    });
  }

  /**
   * Connect to FortiGate SSL-VPN
   * Returns a promise that resolves when tunnel is up
   */
  async connect() {
    // Already connected?
    if (this.connected && this.process) {
      logger.info('[VPN] Already connected');
      return { success: true, message: 'Already connected' };
    }

    // Oracle already reachable? (maybe VPN is up from another process or local network)
    const alreadyReachable = await this.isOracleReachable();
    if (alreadyReachable) {
      logger.info('[VPN] Oracle host already reachable — skipping VPN connect');
      this.connected = true;
      return { success: true, message: 'Oracle already reachable, no VPN needed' };
    }

    // Check openfortivpn is installed (Linux/VPS only)
    if (!this.isInstalled()) {
      const isWindows = process.platform === 'win32';
      const msg = isWindows
        ? 'Oracle is not reachable. Please connect FortiClient VPN first, then try again.'
        : 'openfortivpn is not installed. Run: sudo dnf install -y openfortivpn';
      logger.error(`[VPN] ${msg}`);
      return { success: false, message: msg };
    }

    if (!this.password) {
      const msg = 'VPN_PASSWORD not set in .env';
      logger.error(`[VPN] ${msg}`);
      return { success: false, message: msg };
    }

    logger.info(`[VPN] Connecting to ${this.gateway}:${this.port} as ${this.user}...`);

    return new Promise((resolve) => {
      const args = [
        `${this.gateway}:${this.port}`,
        '-u', this.user,
        '-p', this.password,
        '--no-routes',        // Don't override default routes — only tunnel to Oracle
        '--trusted-cert', this.trustedCert,
      ];

      this.process = spawn('sudo', ['openfortivpn', ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      let output = '';
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          logger.error('[VPN] Connection timeout after 60s');
          this.disconnect();
          resolve({ success: false, message: 'VPN connection timeout (60s)' });
        }
      }, this.connectTimeout);

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        logger.info(`[VPN] ${text.trim()}`);

        // openfortivpn prints "Tunnel is up and running" when connected
        if (text.includes('Tunnel is up') && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.connected = true;
          logger.info('[VPN] Tunnel established');

          // Add routes through ppp0 so private network traffic goes through VPN
          // (needed because we use --no-routes to avoid overriding default gateway)
          try {
            execSync('sudo ip route add 10.0.0.0/8 dev ppp0 2>/dev/null', { stdio: 'pipe' });
            execSync('sudo ip route add 172.16.0.0/12 dev ppp0 2>/dev/null', { stdio: 'pipe' });
            execSync('sudo ip route add 192.168.0.0/16 dev ppp0 2>/dev/null', { stdio: 'pipe' });
            logger.info('[VPN] Private network routes added via ppp0');
          } catch (routeErr) {
            logger.warn(`[VPN] Route setup warning: ${routeErr.message} (may already exist)`);
          }

          // Wait a moment for routes to settle, then verify Oracle reachability
          setTimeout(async () => {
            const reachable = await this.isOracleReachable();
            if (reachable) {
              logger.info('[VPN] Oracle host is reachable through VPN');
              resolve({ success: true, message: 'VPN connected, Oracle reachable' });
            } else {
              logger.warn('[VPN] Tunnel up but Oracle host not reachable — may need route config');
              resolve({ success: true, message: 'VPN connected, but Oracle host not yet reachable' });
            }
          }, 3000);
        }
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        logger.warn(`[VPN stderr] ${text.trim()}`);

        // Some errors come on stderr
        if (text.includes('Could not authenticate') && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.disconnect();
          resolve({ success: false, message: 'VPN authentication failed — check credentials' });
        }
      });

      this.process.on('close', (code) => {
        this.connected = false;
        this.process = null;
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve({ success: false, message: `VPN process exited with code ${code}. Output: ${output.slice(-500)}` });
        }
      });

      this.process.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.connected = false;
          resolve({ success: false, message: `VPN process error: ${err.message}` });
        }
      });
    });
  }

  /**
   * Disconnect VPN
   */
  async disconnect() {
    if (this.process) {
      logger.info('[VPN] Disconnecting...');
      try {
        // openfortivpn runs as sudo, so we need to kill the process group
        process.kill(-this.process.pid, 'SIGTERM');
      } catch (e) {
        try {
          this.process.kill('SIGTERM');
        } catch (e2) {
          // Try harder
          try {
            execSync('sudo pkill -f openfortivpn', { stdio: 'pipe' });
          } catch {
            // Already dead
          }
        }
      }
      this.process = null;
    }
    this.connected = false;
    logger.info('[VPN] Disconnected');
    return { success: true, message: 'VPN disconnected' };
  }

  /**
   * Get current VPN status
   */
  getStatus() {
    return {
      connected: this.connected,
      processRunning: this.process !== null,
      gateway: this.gateway,
      port: this.port,
      user: this.user,
    };
  }
}

// Singleton instance
const vpnService = new VPNService();

module.exports = vpnService;
