const { authPool } = require('./database/config');

async function clearFakeSync() {
  try {
    await authPool.query("DELETE FROM company_settings WHERE setting_key = 'oracle_last_sync'");
    console.log('✅ Deleted fake sync record');
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit();
  }
}

clearFakeSync();
