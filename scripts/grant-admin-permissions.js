/**
 * Grant all permissions to admin users
 * Run: node scripts/grant-admin-permissions.js
 */

const { authPool } = require('../server/database/config');
const { grantAllPermissionsToAdmin } = require('../server/services/permissionService');

async function main() {
  try {
    // Find all admin users
    const result = await authPool.query(
      "SELECT id, email, name FROM users WHERE role = 'admin'"
    );

    if (result.rows.length === 0) {
      console.log('No admin users found');
      process.exit(0);
    }

    console.log(`Found ${result.rows.length} admin user(s)`);

    for (const admin of result.rows) {
      console.log(`\nGranting permissions to: ${admin.name || admin.email} (ID: ${admin.id})`);
      const count = await grantAllPermissionsToAdmin(admin.id);
      console.log(`  ✓ Granted ${count} permissions`);
    }

    console.log('\n✓ Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
