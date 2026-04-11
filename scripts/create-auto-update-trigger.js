/**
 * Create trigger to automatically update sales_rep_group_name 
 * in all data tables when a group is renamed
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'server', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: 'fp_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function createTrigger() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Creating auto-update trigger for sales rep group renames...\n');
    
    // Drop existing trigger and function if they exist
    await client.query('DROP TRIGGER IF EXISTS trg_update_group_name_in_data_tables ON sales_rep_groups CASCADE');
    await client.query('DROP FUNCTION IF EXISTS fn_update_group_name_in_data_tables() CASCADE');
    
    // Create the trigger function
    await client.query(`
      CREATE OR REPLACE FUNCTION fn_update_group_name_in_data_tables()
      RETURNS TRIGGER AS $$
      BEGIN
        -- Only proceed if the group_name actually changed
        IF OLD.group_name IS DISTINCT FROM NEW.group_name THEN
          
          RAISE NOTICE 'Sales rep group renamed: "%" → "%"', OLD.group_name, NEW.group_name;
          
          -- Update fp_actualcommon
          UPDATE fp_actualcommon
          SET sales_rep_group_name = NEW.group_name
          WHERE sales_rep_group_id = NEW.id;
          
          RAISE NOTICE 'Updated % records in fp_actualcommon', FOUND;
          
          -- Update fp_customer_unified
          UPDATE fp_customer_unified
          SET sales_rep_group_name = NEW.group_name
          WHERE sales_rep_group_id = NEW.id;
          
          RAISE NOTICE 'Updated % records in fp_customer_unified', FOUND;
          
          -- Update fp_budget_unified
          UPDATE fp_budget_unified
          SET sales_rep_group_name = NEW.group_name
          WHERE sales_rep_group_id = NEW.id;
          
          RAISE NOTICE 'Updated % records in fp_budget_unified', FOUND;
          
          -- Update fp_budget_customer_unified
          UPDATE fp_budget_customer_unified
          SET sales_rep_group_name = NEW.group_name
          WHERE sales_rep_group_id = NEW.id;
          
          RAISE NOTICE 'Updated % records in fp_budget_customer_unified', FOUND;
          
          -- Update fp_sales_rep_group_budget_allocation
          UPDATE fp_sales_rep_group_budget_allocation
          SET sales_rep_group_name = NEW.group_name
          WHERE sales_rep_group_id = NEW.id;
          
          RAISE NOTICE 'Updated % records in fp_sales_rep_group_budget_allocation', FOUND;
          
          RAISE NOTICE 'Group rename complete: All data tables updated automatically';
          
        END IF;
        
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Created trigger function: fn_update_group_name_in_data_tables\n');
    
    // Create the trigger
    await client.query(`
      CREATE TRIGGER trg_update_group_name_in_data_tables
      AFTER UPDATE ON sales_rep_groups
      FOR EACH ROW
      EXECUTE FUNCTION fn_update_group_name_in_data_tables();
    `);
    
    console.log('✅ Created trigger: trg_update_group_name_in_data_tables\n');
    
    console.log('🎉 SUCCESS!\n');
    console.log('From now on, when you rename a sales rep group in Settings:');
    console.log('  1. The sales_rep_groups table will be updated');
    console.log('  2. The trigger will AUTOMATICALLY update all data tables');
    console.log('  3. No more duplicate group names in dashboards!\n');
    
    // Test the trigger
    console.log('🧪 Testing the trigger...\n');
    
    await client.query('BEGIN');
    
    // Create a test group
    const testResult = await client.query(`
      INSERT INTO sales_rep_groups (division, group_name)
      VALUES ('FP', 'TEST_GROUP_DELETE_ME')
      RETURNING id
    `);
    
    const testId = testResult.rows[0].id;
    console.log(`Created test group with ID: ${testId}`);
    
    // Insert test data
    await client.query(`
      INSERT INTO fp_actualcommon (
        admin_division_code, year, month_no, customer_name, country,
        sales_rep_name, sales_rep_group_id, sales_rep_group_name,
        amount, qty_kgs, morm
      ) VALUES (
        'FP', 2025, 1, 'Test Customer', 'Test Country',
        'Test Rep', $1, 'TEST_GROUP_DELETE_ME',
        100, 10, 5
      )
    `, [testId]);
    
    console.log('Inserted test data in fp_actualcommon');
    
    // Rename the test group (this should trigger the auto-update)
    await client.query(`
      UPDATE sales_rep_groups
      SET group_name = 'TEST_GROUP_RENAMED'
      WHERE id = $1
    `, [testId]);
    
    console.log('Renamed test group to TEST_GROUP_RENAMED');
    
    // Check if the data table was auto-updated
    const checkResult = await client.query(`
      SELECT sales_rep_group_name
      FROM fp_actualcommon
      WHERE sales_rep_group_id = $1
    `, [testId]);
    
    if (checkResult.rows[0].sales_rep_group_name === 'TEST_GROUP_RENAMED') {
      console.log('✅ TEST PASSED! Data table was automatically updated!\n');
    } else {
      console.log('❌ TEST FAILED! Data table was NOT updated.\n');
    }
    
    // Clean up test data
    await client.query('DELETE FROM fp_actualcommon WHERE sales_rep_group_id = $1', [testId]);
    await client.query('DELETE FROM sales_rep_groups WHERE id = $1', [testId]);
    
    await client.query('COMMIT');
    
    console.log('Test data cleaned up.\n');
    console.log('✅ Trigger is working correctly!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

createTrigger();
