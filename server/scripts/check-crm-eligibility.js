const { Pool } = require('pg');

const auth = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ip_auth_database',
  password: process.env.DB_PASSWORD || '',
  port: 5432,
});

async function checkCRMEligibility() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        CRM ELIGIBILITY CHECK');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Rule: Designation contains "Sales" OR Department = "Sales"\n');

  const users = await auth.query(`
    SELECT u.id, u.name, u.email, 
           d.name as designation, 
           dep.name as department 
    FROM users u 
    LEFT JOIN employees e ON u.id = e.user_id 
    LEFT JOIN designations d ON e.designation_id = d.id 
    LEFT JOIN departments dep ON e.department_id = dep.id 
    ORDER BY u.id
  `);

  const crmActive = [];
  const excluded = [];

  users.rows.forEach(u => {
    const designation = u.designation || '';
    const department = u.department || '';
    
    const hasSalesDesig = designation.toLowerCase().includes('sales');
    const hasSalesDept = department.toLowerCase() === 'sales';
    const isCRM = hasSalesDesig || hasSalesDept;

    const result = {
      name: u.name,
      email: u.email,
      designation: designation || 'N/A',
      department: department || 'N/A',
      reason: []
    };

    if (hasSalesDesig) result.reason.push('Designation has "Sales"');
    if (hasSalesDept) result.reason.push('Department is Sales');

    if (isCRM) {
      crmActive.push(result);
    } else {
      result.reason = ['No sales designation', 'No sales department'];
      excluded.push(result);
    }
  });

  console.log('✅ CRM ACTIVE USERS:');
  console.log('─────────────────────────────────────────────────────────\n');
  crmActive.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.name}`);
    console.log(`     Email: ${u.email}`);
    console.log(`     Designation: ${u.designation}`);
    console.log(`     Department: ${u.department}`);
    console.log(`     Reason: ${u.reason.join(' + ')}`);
    console.log('');
  });

  console.log('\n❌ EXCLUDED FROM CRM:');
  console.log('─────────────────────────────────────────────────────────\n');
  excluded.forEach((u, i) => {
    console.log(`  ${i + 1}. ${u.name}`);
    console.log(`     Designation: ${u.designation}`);
    console.log(`     Department: ${u.department}`);
    console.log(`     Reason: ${u.reason.join(', ')}`);
    console.log('');
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${crmActive.length} CRM Active, ${excluded.length} Excluded`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await auth.end();
}

checkCRMEligibility().catch(console.error);
