const { Pool } = require('pg');

const auth = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'ip_auth_database',
  password: process.env.DB_PASSWORD || '',
  port: 5432,
});

const fp = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fp_database',
  password: process.env.DB_PASSWORD || '',
  port: 5432,
});

async function checkCRMActiveUsers() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('        CRM ACTIVE USERS ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Get all users from auth database
  console.log('📋 ALL USERS IN SYSTEM:');
  console.log('─────────────────────────────────────────────────────────\n');
  const users = await auth.query('SELECT id, name, email, role FROM users ORDER BY id');
  users.rows.forEach(u => {
    console.log(`  ${u.id}. ${u.name}`);
    console.log(`     Email: ${u.email}`);
    console.log(`     Role: ${u.role}\n`);
  });

  // 2. Get user divisions
  console.log('\n📂 USER DIVISIONS:');
  console.log('─────────────────────────────────────────────────────────\n');
  const divs = await auth.query(`
    SELECT ud.user_id, u.name, ud.division 
    FROM user_divisions ud 
    JOIN users u ON ud.user_id = u.id
    ORDER BY ud.user_id
  `);
  divs.rows.forEach(d => {
    console.log(`  User ${d.user_id} (${d.name}): Division = ${d.division}`);
  });

  // 3. Get sales rep groups
  console.log('\n\n📦 SALES REP GROUPS (6):');
  console.log('─────────────────────────────────────────────────────────\n');
  const groups = await fp.query('SELECT id, group_name FROM sales_rep_groups ORDER BY id');
  groups.rows.forEach(g => {
    console.log(`  ${g.id}. ${g.group_name}`);
  });

  // 4. List individuals (8)
  console.log('\n\n👤 INDIVIDUAL SALES REPS (8):');
  console.log('─────────────────────────────────────────────────────────\n');
  const individuals = await fp.query(`
    SELECT s.canonical_name 
    FROM sales_rep_master s 
    WHERE s.canonical_name NOT IN (SELECT member_name FROM sales_rep_group_members) 
    ORDER BY s.canonical_name
  `);
  individuals.rows.forEach((i, idx) => {
    console.log(`  ${idx + 1}. ${i.canonical_name}`);
  });

  // 5. MAPPING: Users to Groups/Individuals
  console.log('\n\n🔗 MAPPING: USERS → SALES REP ENTITIES');
  console.log('═══════════════════════════════════════════════════════════\n');

  const mappings = [
    { user: 'Camille Salloum', role: 'admin', entity: null, type: 'ADMIN (not a sales rep)' },
    { user: 'Christopher Dela Cruz', role: 'manager', entity: 'Christopher Dela Cruz', type: 'INDIVIDUAL' },
    { user: 'Sojy & Hisham & Direct Sales', role: 'manager', entity: 'Sojy & Hisham & Direct Sales', type: 'GROUP' },
    { user: 'Sofiane & Team', role: 'manager', entity: 'Sofiane & Team', type: 'GROUP' },
    { user: 'Riad & Nidal', role: 'manager', entity: 'Riad & Nidal', type: 'GROUP' },
    { user: 'Rahil Asif', role: 'manager', entity: 'Rahil Asif', type: 'INDIVIDUAL' },
    { user: 'Narek Koroukian', role: 'manager', entity: 'Narek Koroukian', type: 'GROUP' },
  ];

  console.log('  User Name                          → Entity                              Type');
  console.log('  ─────────────────────────────────────────────────────────────────────────────────');
  mappings.forEach(m => {
    const userPad = m.user.padEnd(35);
    const entityPad = (m.entity || 'N/A').padEnd(35);
    console.log(`  ${userPad} → ${entityPad} ${m.type}`);
  });

  // 6. CRM ACTIVE USERS SUMMARY
  console.log('\n\n✅ CRM ACTIVE USERS (Will contact customers, get leads, etc.):');
  console.log('═══════════════════════════════════════════════════════════\n');

  const crmActive = mappings.filter(m => m.entity !== null);
  console.log(`  Total: ${crmActive.length} active CRM entities\n`);

  console.log('  GROUPS (4):');
  crmActive.filter(m => m.type === 'GROUP').forEach(m => {
    console.log(`    ✓ ${m.entity}`);
  });

  console.log('\n  INDIVIDUALS (2):');
  crmActive.filter(m => m.type === 'INDIVIDUAL').forEach(m => {
    console.log(`    ✓ ${m.entity}`);
  });

  // 7. INACTIVE entities
  console.log('\n\n❌ INACTIVE ENTITIES (historical, not in CRM):');
  console.log('─────────────────────────────────────────────────────────\n');

  const activeEntities = crmActive.map(m => m.entity);
  
  // Groups not mapped
  const inactiveGroups = groups.rows.filter(g => !activeEntities.includes(g.group_name));
  console.log('  Inactive Groups:');
  inactiveGroups.forEach(g => console.log(`    ✗ ${g.group_name}`));

  // Individuals not mapped
  const inactiveIndiv = individuals.rows.filter(i => !activeEntities.includes(i.canonical_name));
  console.log('\n  Inactive Individuals:');
  inactiveIndiv.forEach(i => console.log(`    ✗ ${i.canonical_name}`));

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                    ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');

  await auth.end();
  await fp.end();
}

checkCRMActiveUsers().catch(console.error);
