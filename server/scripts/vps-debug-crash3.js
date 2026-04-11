const { NodeSSH } = require('node-ssh');
require('dotenv').config({ quiet: true });
const ssh = new NodeSSH();

(async () => {
  await ssh.connect({
    host: process.env.VPS_HOST, port: 22,
    username: process.env.VPS_SSH_USER,
    password: process.env.VPS_SSH_PASSWORD,
    tryKeyboard: true, readyTimeout: 20000
  });

  // Test each require from index.js one by one
  const modules = [
    ["dotenv", "require('dotenv')"],
    ["config/express", "require('./config/express')"],
    ["config/environment", "require('./config/environment')"],
    ["utils/logger", "require('./utils/logger')"],
    ["database/GlobalConfigService", "require('./database/GlobalConfigService')"],
    ["config/database", "require('./config/database')"],
    ["utils/divisionDatabaseManager", "require('./utils/divisionDatabaseManager')"],
    ["middleware/cache", "require('./middleware/cache')"],
    ["migrations/add-last-activity", "require('./migrations/add-last-activity-to-sessions')"],
    ["services/salesRepResolver", "require('./services/salesRepResolver')"],
    ["database/multiTenantPool", "require('./database/multiTenantPool')"],
    ["node-cron", "require('node-cron')"],
    ["tasks/refreshProductGroupPricing", "require('./tasks/refreshProductGroupPricing')"],
  ];

  for (const [name, req] of modules) {
    const r = await ssh.execCommand(
      `cd /home/propackhub/app/server && node -e "require('dotenv').config({quiet:true}); try { ${req}; console.log('OK') } catch(e) { console.log('FAIL: ' + e.message) }" 2>&1`
    );
    const status = r.stdout.trim();
    console.log(`  ${status === 'OK' ? '✅' : '❌'} ${name}: ${status}`);
  }

  // Also check if there's a process.exit() being called
  console.log('\nChecking for explicit process.exit calls...');
  const r2 = await ssh.execCommand('grep -rn "process.exit" /home/propackhub/app/server/config/ /home/propackhub/app/server/utils/logger.js 2>/dev/null');
  console.log(r2.stdout || 'none found');

  ssh.dispose();
})().catch(e => console.error(e.message));
