const {Pool}=require('pg');
const p=new Pool({host:'localhost',port:5432,database:'fp_database',user:'postgres',password:'***REDACTED***'});

async function checkTriggers() {
  // Check for triggers on sales_rep_groups table
  const triggers = await p.query(`
    SELECT 
      trigger_name,
      event_manipulation,
      action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'sales_rep_groups'
  `);
  
  console.log('Triggers on sales_rep_groups table:\n');
  if (triggers.rows.length === 0) {
    console.log('  ❌ NO TRIGGERS FOUND!\n');
    console.log('  This means when you rename a group, the data tables are NOT automatically updated.\n');
  } else {
    triggers.rows.forEach(t => {
      console.log(`  ${t.trigger_name} - ${t.event_manipulation}`);
      console.log(`    Action: ${t.action_statement}\n`);
    });
  }
  
  // Check for foreign key constraints
  const fks = await p.query(`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.update_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc
      ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'sales_rep_groups'
  `);
  
  console.log('\nForeign key constraints pointing to sales_rep_groups:\n');
  if (fks.rows.length === 0) {
    console.log('  ❌ NO FOREIGN KEYS FOUND!\n');
    console.log('  This means there is NO automatic cascade update when group name changes.\n');
  } else {
    fks.rows.forEach(fk => {
      console.log(`  ${fk.table_name}.${fk.column_name} → sales_rep_groups.${fk.foreign_column_name}`);
      console.log(`    Update rule: ${fk.update_rule}\n`);
    });
  }
  
  await p.end();
}

checkTriggers();
