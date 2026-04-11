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
  console.log('        CRM ELIGIBILITY CHECK (CORRECT LOGIC)');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Rule: Employee Active + Has User + DESIGNATION.department = "Sales"\n');

  // Get employees with their designation's department
  const employees = await auth.query(`
    SELECT 
      e.id as emp_id,
      e.full_name,
      e.status as emp_status,
      e.user_id,
      e.group_members,
      u.email,
      d.id as desig_id,
      d.name as designation,
      d.department as desig_department
    FROM employees e
    LEFT JOIN users u ON e.user_id = u.id
    LEFT JOIN designations d ON e.designation_id = d.id
    ORDER BY e.id
  `);

  const crmActive = [];
  const excluded = [];

  employees.rows.forEach(e => {
    const designation = e.designation || 'N/A';
    const desigDept = e.desig_department || 'N/A';
    const status = e.emp_status || 'Inactive';
    
    const isActive = status === 'Active';
    const hasUser = e.user_id !== null;
    const isSalesDept = desigDept.toLowerCase() === 'sales';
    
    const isCRMEligible = isActive && hasUser && isSalesDept;

    const result = {
      name: e.full_name,
      email: e.email || 'No user account',
      status: status,
      designation: designation,
      desigDepartment: desigDept,
      hasUser: hasUser,
      groupMembers: e.group_members
    };

    if (isCRMEligible) {
      crmActive.push(result);
    } else {
      result.reasons = [];
      if (!isActive) result.reasons.push('Status is Inactive');
      if (!hasUser) result.reasons.push('No user account');
      if (!isSalesDept) result.reasons.push('Designation dept is not Sales');
      excluded.push(result);
    }
  });

  console.log('✅ CRM ACTIVE (Designation department = Sales):');
  console.log('─────────────────────────────────────────────────────────\n');
  crmActive.forEach((e, i) => {
    const type = e.groupMembers ? 'GROUP' : 'INDIVIDUAL';
    console.log(`  ${i + 1}. ${e.name} [${type}]`);
    console.log(`     Email: ${e.email}`);
    console.log(`     Designation: ${e.designation}`);
    console.log(`     Designation Dept: ${e.desigDepartment}`);
    if (e.groupMembers) {
      console.log(`     Members: ${e.groupMembers.join(', ')}`);
    }
    console.log('');
  });

  console.log('\n❌ EXCLUDED FROM CRM:');
  console.log('─────────────────────────────────────────────────────────\n');
  excluded.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     Status: ${e.status} | User: ${e.hasUser ? 'Yes' : 'No'}`);
    console.log(`     Designation: ${e.designation} (Dept: ${e.desigDepartment})`);
    console.log(`     Why excluded: ${e.reasons.join(', ')}`);
    console.log('');
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${crmActive.length} CRM Active, ${excluded.length} Excluded`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await auth.end();
}

checkCRMEligibility().catch(console.error);
