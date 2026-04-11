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
  console.log('        CRM ELIGIBILITY CHECK (CORRECTED)');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Rule: Employee Status = Active AND (Designation has "Sales" OR Department = "Sales")\n');

  // Get employees with their user, designation, and department
  const employees = await auth.query(`
    SELECT 
      e.id as emp_id,
      e.first_name,
      e.full_name,
      e.status as emp_status,
      e.user_id,
      e.group_members,
      u.name as user_name,
      u.email,
      d.id as desig_id,
      d.name as designation,
      dep.id as dept_id,
      dep.name as department
    FROM employees e
    LEFT JOIN users u ON e.user_id = u.id
    LEFT JOIN designations d ON e.designation_id = d.id
    LEFT JOIN departments dep ON e.department_id = dep.id
    ORDER BY e.id
  `);

  const crmActive = [];
  const excluded = [];

  employees.rows.forEach(e => {
    const designation = e.designation || '';
    const department = e.department || '';
    const status = e.emp_status || 'Inactive';
    
    const isActive = status === 'Active';
    const hasSalesDesig = designation.toLowerCase().includes('sales');
    const hasSalesDept = department.toLowerCase() === 'sales';
    const hasUser = e.user_id !== null;
    
    const isCRMEligible = isActive && hasUser && (hasSalesDesig || hasSalesDept);

    const result = {
      name: e.full_name || e.first_name,
      email: e.email || 'No user account',
      status: status,
      designation: designation || 'N/A',
      department: department || 'N/A',
      hasUser: hasUser,
      groupMembers: e.group_members,
      reasons: []
    };

    // Check why included/excluded
    if (!isActive) result.reasons.push('Status is Inactive');
    if (!hasUser) result.reasons.push('No user account');
    if (!hasSalesDesig && !hasSalesDept) result.reasons.push('Not in Sales');
    if (hasSalesDesig) result.reasons.push('Designation has "Sales"');
    if (hasSalesDept) result.reasons.push('Department is Sales');

    if (isCRMEligible) {
      crmActive.push(result);
    } else {
      excluded.push(result);
    }
  });

  console.log('✅ CRM ACTIVE (Sales Reps who can contact customers):');
  console.log('─────────────────────────────────────────────────────────\n');
  crmActive.forEach((e, i) => {
    const type = e.groupMembers ? 'GROUP' : 'INDIVIDUAL';
    console.log(`  ${i + 1}. ${e.name} [${type}]`);
    console.log(`     Email: ${e.email}`);
    console.log(`     Designation: ${e.designation}`);
    console.log(`     Department: ${e.department}`);
    console.log(`     Why included: ${e.reasons.filter(r => r.includes('Sales')).join(' + ')}`);
    if (e.groupMembers) {
      console.log(`     Members: ${e.groupMembers.join(', ')}`);
    }
    console.log('');
  });

  console.log('\n❌ EXCLUDED FROM CRM:');
  console.log('─────────────────────────────────────────────────────────\n');
  excluded.forEach((e, i) => {
    console.log(`  ${i + 1}. ${e.name}`);
    console.log(`     Status: ${e.status}`);
    console.log(`     Has User Account: ${e.hasUser ? 'Yes' : 'No'}`);
    console.log(`     Designation: ${e.designation}`);
    console.log(`     Department: ${e.department}`);
    console.log(`     Why excluded: ${e.reasons.filter(r => !r.includes('Sales')).join(', ')}`);
    console.log('');
  });

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  SUMMARY: ${crmActive.length} CRM Active, ${excluded.length} Excluded`);
  console.log('═══════════════════════════════════════════════════════════\n');

  await auth.end();
}

checkCRMEligibility().catch(console.error);
