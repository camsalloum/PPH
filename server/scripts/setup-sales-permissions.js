/**
 * Setup Sales Rep Permissions
 * 
 * Applies appropriate permissions to all users in the Sales department.
 * Sales reps should have access to:
 * - Their own sales dashboard (Report tab, not Tables)
 * - Period selection and theme changes
 * - View-only access to their data
 * - NO admin, user management, or settings permissions
 */

const { authPool } = require('../database/config');

// Permissions for Sales Department users
const SALES_REP_PERMISSIONS = {
  // Global permissions (not division-specific)
  global: [
    // Navigation
    'nav:dashboard:open',           // Can open dashboard
    'nav:division:switch',          // Can switch divisions (if assigned multiple)
    
    // Period selection
    'periods:columns:select',       // Can select which periods to view
    'periods:base:select',          // Can select base period for comparison
    
    // Settings (theme only)
    'settings:appearance:view',     // Can view appearance settings
    'settings:appearance:update',   // Can change theme
  ],
  
  // Division-specific permissions (will be applied per assigned division)
  division: [
    // Dashboard access
    'dashboard:divisional:view',    // Can view divisional dashboard
    'dashboard:sales:view',         // Can view sales dashboard (Report tab)
    
    // Sales module
    'sales:reps:view',              // Can view sales rep reports
    'sales:budget:view',            // Can view their budget
    
    // Divisional views (read-only)
    'divisional:kpis:view',         // Can view KPIs
    'divisional:charts:view',       // Can view charts
    'divisional:product-groups:view', // Can view product groups
    'divisional:customers:view',    // Can view customers
    'divisional:countries:view',    // Can view countries
    
    // Export (their own reports)
    'export:pdf',                   // Can export to PDF
    'export:excel',                 // Can export to Excel
  ]
};

// NOT INCLUDED (restricted from sales reps):
// - dashboard:home:view           (admin home)
// - dashboard:writeup:view        (executive writeup)
// - aebf:*                        (AEBF module)
// - sales:budget:edit             (editing budget)
// - sales:budget:upload           (uploading budget)
// - sales:budget:finalize         (finalizing budget)
// - sales:reps:export-html        (HTML export - admin only)
// - maintenance:*                 (merge rules, currency)
// - settings:company:*            (company settings)
// - settings:periods:*            (period management)
// - settings:masterdata:*         (master data)
// - users:*                       (user management)

async function setupSalesPermissions() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('         SETUP SALES REP PERMISSIONS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const client = await authPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Get all users in Sales department
    const usersResult = await client.query(`
      SELECT u.id as user_id, u.name, u.email, d.name as designation,
             ARRAY_AGG(DISTINCT ud.division) as divisions
      FROM users u
      JOIN employees e ON e.user_id = u.id
      JOIN designations d ON e.designation_id = d.id
      LEFT JOIN user_divisions ud ON ud.user_id = u.id
      WHERE LOWER(d.department) = 'sales'
        AND u.is_active = true
      GROUP BY u.id, u.name, u.email, d.name
      ORDER BY u.name
    `);
    
    console.log(`Found ${usersResult.rows.length} users in Sales department:\n`);
    
    for (const user of usersResult.rows) {
      console.log(`📧 ${user.name} (${user.designation})`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Divisions: ${user.divisions.filter(Boolean).join(', ') || 'None assigned'}`);
      
      // Get user's divisions (default to FP if none assigned)
      let divisions = user.divisions.filter(Boolean);
      if (divisions.length === 0) {
        divisions = ['FP']; // Default to FP division
        console.log('   ⚠️  No divisions assigned, defaulting to FP');
      }
      
      // Clear existing permissions for this user
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [user.user_id]);
      
      // Insert global permissions
      for (const permKey of SALES_REP_PERMISSIONS.global) {
        await client.query(`
          INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
          VALUES ($1, $2, NULL, true, 1)
        `, [user.user_id, permKey]);
      }
      console.log(`   ✓ Added ${SALES_REP_PERMISSIONS.global.length} global permissions`);
      
      // Insert division-specific permissions for each assigned division
      for (const division of divisions) {
        for (const permKey of SALES_REP_PERMISSIONS.division) {
          await client.query(`
            INSERT INTO user_permissions (user_id, permission_key, division_code, allowed, granted_by)
            VALUES ($1, $2, $3, true, 1)
          `, [user.user_id, permKey, division.toUpperCase()]);
        }
        console.log(`   ✓ Added ${SALES_REP_PERMISSIONS.division.length} permissions for ${division}`);
      }
      
      console.log('');
    }
    
    await client.query('COMMIT');
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('         SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log(`✅ Updated permissions for ${usersResult.rows.length} sales users\n`);
    
    console.log('GLOBAL PERMISSIONS GRANTED:');
    SALES_REP_PERMISSIONS.global.forEach(p => console.log(`   ✓ ${p}`));
    
    console.log('\nDIVISION PERMISSIONS GRANTED (per assigned division):');
    SALES_REP_PERMISSIONS.division.forEach(p => console.log(`   ✓ ${p}`));
    
    console.log('\n🚫 NOT GRANTED (Admin/Manager only):');
    console.log('   • dashboard:home:view (admin home)');
    console.log('   • dashboard:writeup:view (executive writeup)');
    console.log('   • aebf:* (AEBF module)');
    console.log('   • sales:budget:edit/upload/finalize');
    console.log('   • maintenance:* (merge rules, currency)');
    console.log('   • settings:company/periods/masterdata');
    console.log('   • users:* (user management)');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await authPool.end();
  }
}

setupSalesPermissions();
