const { NodeSSH } = require('node-ssh');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const ssh = new NodeSSH();

async function exec(cmd) {
  const r = await ssh.execCommand(cmd);
  return (r.stdout || '').trim() + (r.stderr ? '\n' + r.stderr.trim() : '');
}

async function run() {
  await ssh.connect({
    host: process.env.VPS_HOST || 'propackhub.com',
    port: 22,
    username: process.env.VPS_SSH_USER || 'propackhub',
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true,
    readyTimeout: 20000
  });

  console.log('=== 1. NGINX CONFIG (proxy cache, static file caching) ===');
  // Check if nginx is running and its config
  console.log(await exec('which nginx 2>/dev/null && nginx -v 2>&1 || echo "nginx not found"'));
  console.log(await exec('ps aux | grep nginx | grep -v grep | head -5'));
  // Check nginx config for caching directives
  console.log('\n--- nginx.conf caching directives ---');
  console.log(await exec('grep -rn "proxy_cache\\|expires\\|add_header.*Cache\\|fastcgi_cache\\|open_file_cache\\|proxy_buffering" /etc/nginx/nginx.conf 2>/dev/null | head -20'));
  // Check nginx vhost/conf.d for caching
  console.log('\n--- nginx conf.d/vhosts caching ---');
  console.log(await exec('grep -rn "proxy_cache\\|expires\\|add_header.*Cache\\|fastcgi_cache\\|open_file_cache" /etc/nginx/conf.d/ 2>/dev/null | head -20'));
  console.log(await exec('grep -rn "proxy_cache\\|expires\\|add_header.*Cache\\|fastcgi_cache\\|open_file_cache" /etc/nginx/vhosts/ 2>/dev/null | head -20'));
  // Check for nginx cache directories
  console.log('\n--- nginx cache dirs ---');
  console.log(await exec('grep -rn "proxy_cache_path\\|fastcgi_cache_path" /etc/nginx/ 2>/dev/null'));

  console.log('\n\n=== 2. APACHE CONFIG (mod_cache, mod_expires, mod_headers) ===');
  console.log(await exec('httpd -v 2>&1 | head -2'));
  console.log(await exec('httpd -M 2>/dev/null | grep -i "cache\\|expires\\|headers" || apachectl -M 2>/dev/null | grep -i "cache\\|expires\\|headers"'));
  // Check Apache config for caching
  console.log('\n--- Apache global caching ---');
  console.log(await exec('grep -rn "CacheEnable\\|CacheRoot\\|ExpiresActive\\|ExpiresByType\\|Header.*Cache-Control\\|FileETag" /etc/httpd/conf/ 2>/dev/null | head -20'));
  console.log(await exec('grep -rn "CacheEnable\\|CacheRoot\\|ExpiresActive\\|ExpiresByType\\|Header.*Cache-Control\\|FileETag" /etc/httpd/conf.d/ 2>/dev/null | head -20'));
  // Check user Apache config
  console.log('\n--- User Apache config ---');
  console.log(await exec('grep -rn "CacheEnable\\|ExpiresActive\\|ExpiresByType\\|Header.*Cache-Control" /etc/apache2/ 2>/dev/null | head -10'));

  console.log('\n\n=== 3. .HTACCESS CACHING RULES ===');
  console.log(await exec('cat /home/propackhub/public_html/.htaccess'));

  console.log('\n\n=== 4. VARNISH / OTHER CACHING PROXIES ===');
  console.log(await exec('which varnishd 2>/dev/null && varnishd -V 2>&1 || echo "varnish not installed"'));
  console.log(await exec('which litespeed 2>/dev/null && echo "litespeed found" || echo "litespeed not found"'));
  console.log(await exec('which lsws 2>/dev/null && echo "lsws found" || echo "lsws not found"'));

  console.log('\n\n=== 5. CPANEL/WHM CACHING (ea-nginx, pagespeed) ===');
  // cPanel nginx caching
  console.log(await exec('ls /etc/nginx/ea-nginx/ 2>/dev/null | head -10 || echo "no ea-nginx dir"'));
  console.log(await exec('grep -rn "pagespeed\\|cache" /etc/nginx/ea-nginx/ 2>/dev/null | head -10'));
  // Check if cPanel has caching module
  console.log(await exec('/usr/local/cpanel/bin/whmapi1 get_tweaksetting key=allowcachepurge 2>/dev/null | head -5 || echo "whmapi not accessible"'));

  console.log('\n\n=== 6. RESPONSE HEADERS (what the browser actually sees) ===');
  // Check response headers for the CSS file
  console.log('--- CSS file response headers ---');
  console.log(await exec('curl -sI http://localhost/assets/index-BsrQBGJs.css 2>/dev/null | head -20'));
  console.log('\n--- HTML response headers ---');
  console.log(await exec('curl -sI http://localhost/ 2>/dev/null | head -20'));
  // Check via nginx (port 80 externally)
  console.log('\n--- External HTTPS headers ---');
  console.log(await exec('curl -skI https://propackhub.com/ 2>/dev/null | head -20'));

  console.log('\n\n=== 7. NGINX PROXY CACHE STATUS ===');
  console.log(await exec('grep -rn "proxy_cache_path" /etc/nginx/ 2>/dev/null'));
  console.log(await exec('ls -la /var/cache/nginx/ 2>/dev/null || echo "no /var/cache/nginx"'));
  console.log(await exec('ls -la /tmp/nginx_cache/ 2>/dev/null || echo "no /tmp/nginx_cache"'));

  ssh.dispose();
  console.log('\n=== DONE ===');
}
run().catch(e => { console.error('Error:', e.message); process.exit(1); });
