/**
 * Security audit for propackhub.com
 * Checks SSL, headers, firewall, open ports, and server config
 */
const path = require('path');
const https = require('https');
const { NodeSSH } = require(path.join(__dirname, '..', 'server', 'node_modules', 'node-ssh'));
const ssh = new NodeSSH();

async function run(cmd, label) {
  const r = await ssh.execCommand(cmd);
  console.log(`\n=== ${label} ===`);
  if (r.stdout) console.log(r.stdout);
  if (r.stderr && !r.stderr.includes('no version information')) console.log('STDERR:', r.stderr);
  return r;
}

function checkHeaders(url) {
  return new Promise((resolve) => {
    https.get(url, { rejectUnauthorized: false }, (res) => {
      resolve(res.headers);
    }).on('error', (e) => { console.log('  Error:', e.message); resolve({}); });
  });
}

function checkSSL(hostname) {
  return new Promise((resolve) => {
    const req = https.request({ hostname, port: 443, method: 'HEAD' }, (res) => {
      const cert = res.socket.getPeerCertificate();
      resolve({
        subject: cert.subject,
        issuer: cert.issuer,
        validFrom: cert.valid_from,
        validTo: cert.valid_to,
        protocol: res.socket.getProtocol(),
      });
    });
    req.on('error', (e) => { resolve({ error: e.message }); });
    req.end();
  });
}

async function main() {
  console.log('🔒 SECURITY AUDIT — propackhub.com');
  console.log('═'.repeat(55));

  // 1. SSL Certificate
  console.log('\n=== SSL Certificate ===');
  const ssl = await checkSSL('propackhub.com');
  if (ssl.error) {
    console.log('  ❌ SSL Error:', ssl.error);
  } else {
    console.log('  Issuer:', JSON.stringify(ssl.issuer?.O || ssl.issuer));
    console.log('  Valid From:', ssl.validFrom);
    console.log('  Valid To:', ssl.validTo);
    console.log('  Protocol:', ssl.protocol);
    const expiry = new Date(ssl.validTo);
    const daysLeft = Math.round((expiry - Date.now()) / 86400000);
    console.log(`  Days until expiry: ${daysLeft}`);
    if (daysLeft < 30) console.log('  ⚠ EXPIRING SOON!');
    else console.log('  ✓ Certificate OK');
  }

  // 2. HTTP Security Headers
  console.log('\n=== HTTP Security Headers ===');
  const headers = await checkHeaders('https://propackhub.com');
  const secHeaders = {
    'strict-transport-security': 'HSTS (force HTTPS)',
    'x-frame-options': 'Clickjacking protection',
    'x-content-type-options': 'MIME sniffing protection',
    'x-xss-protection': 'XSS filter',
    'content-security-policy': 'CSP (script injection protection)',
    'referrer-policy': 'Referrer leaking protection',
    'permissions-policy': 'Browser feature restrictions',
  };
  for (const [header, desc] of Object.entries(secHeaders)) {
    if (headers[header]) {
      console.log(`  ✓ ${header}: ${headers[header].substring(0, 80)}`);
    } else {
      console.log(`  ❌ MISSING: ${header} — ${desc}`);
    }
  }
  console.log(`  Server header: ${headers['server'] || '(hidden - good)'}`);

  // 3. SSH into VPS for deeper checks
  await ssh.connect({ host: 'propackhub.com', port: 22, username: 'propackhub', password: '***REDACTED***', readyTimeout: 15000 });
  console.log('\n  Connected to VPS via SSH.');

  // Firewall
  await run('sudo iptables -L -n --line-numbers 2>/dev/null | head -40 || echo "no iptables access"', 'Firewall (iptables)');
  await run('sudo firewalld --state 2>/dev/null || sudo ufw status 2>/dev/null || echo "no firewalld/ufw"', 'Firewall service');
  await run('sudo csf -v 2>/dev/null || echo "CSF not installed"', 'CSF Firewall');

  // Open ports
  await run("ss -tlnp 2>/dev/null | grep LISTEN || netstat -tlnp 2>/dev/null | grep LISTEN", 'Listening ports');

  // Apache/Nginx config security
  await run('grep -r "ServerTokens\\|ServerSignature\\|server_tokens" /etc/httpd/conf/ /etc/nginx/ 2>/dev/null | head -10', 'Server token exposure');

  // SSL config on server
  await run('grep -r "SSLProtocol\\|ssl_protocols" /etc/httpd/conf.d/ /etc/nginx/ 2>/dev/null | head -10', 'SSL protocol config');

  // cPHulk (brute force protection)
  await run('sudo whmapi1 configureservice service=cphulkd 2>/dev/null | head -5 || echo "no whmapi1 access"', 'cPHulk brute force protection');

  // ModSecurity (WAF)
  await run('httpd -M 2>/dev/null | grep security || echo "ModSecurity not loaded"', 'ModSecurity WAF');

  // Fail2ban
  await run('sudo fail2ban-client status 2>/dev/null || echo "fail2ban not installed"', 'Fail2ban');

  // Node.js backend — check if it exposes sensitive info
  await run('curl -s http://localhost:3001/api/health 2>/dev/null | head -5', 'Backend /api/health response');
  await run('curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/nonexistent 2>/dev/null', 'Backend 404 response code');

  // Check .env exposure
  await run('curl -s -o /dev/null -w "%{http_code}" https://propackhub.com/.env 2>/dev/null', 'Is .env accessible via web?');
  await run('curl -s -o /dev/null -w "%{http_code}" https://propackhub.com/server/.env 2>/dev/null', 'Is server/.env accessible via web?');

  // GoDaddy managed security
  await run('rpm -qa | grep -i imunify 2>/dev/null || echo "Imunify360 not installed"', 'Imunify360 (GoDaddy security suite)');
  await run('rpm -qa | grep -i clamav 2>/dev/null || echo "ClamAV not installed"', 'ClamAV antivirus');

  ssh.dispose();
  console.log('\n' + '═'.repeat(55));
  console.log('Audit complete.');
}

main().catch(e => { console.error('Error:', e.message); process.exit(1); });
