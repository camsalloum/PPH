const { pool } = require('../database/config');
const fs = require('fs');
const path = require('path');

async function setupCustomerMergeRulesTable() {
  try {
    console.log('🔧 Setting up customer merge rules table...');
    
    // First, create the function
    console.log('Creating update_updated_at_column function...');
    await pool.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $func$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $func$ language 'plpgsql';
    `);
    
    // Read the SQL file for the rest
    const sqlPath = path.join(__dirname, 'create-customer-merge-rules-table.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Remove the function creation part since we already did it
    const contentWithoutFunction = sqlContent.replace(/-- 0\. Create function.*?\$func\$ language 'plpgsql';\s*/s, '');
    
    // Split by semicolon and execute each statement
    const statements = contentWithoutFunction.split(';').filter(stmt => stmt.trim());
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await pool.query(statement);
      }
    }
    
    console.log('✅ Customer merge rules table created successfully!');
    
    // Verify table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'customer_merge_rules'
      ) as table_exists
    `);
    
    console.log('📋 Table verification:', tableCheck.rows[0]);
    
    // Test the service
    console.log('\n🧪 Testing CustomerMergeRulesService...');
    
    try {
      const CustomerMergeRulesService = require('../database/CustomerMergeRulesService');
      
      // Test saving merge rules
      const testMergeRules = [
        {
          mergedName: 'Test Customer Group',
          originalCustomers: ['Test Customer 1', 'Test Customer 2'],
          isActive: true
        }
      ];
      
      await CustomerMergeRulesService.saveMergeRules('Test Sales Rep', 'FP', testMergeRules);
      console.log('✅ Test merge rules saved successfully');
      
      // Test getting merge rules
      const retrievedRules = await CustomerMergeRulesService.getMergeRules('Test Sales Rep', 'FP');
      console.log(`✅ Retrieved ${retrievedRules.length} merge rules`);
      
      // Test deleting merge rules
      await CustomerMergeRulesService.deleteMergeRule('Test Sales Rep', 'FP', 'Test Customer Group');
      console.log('✅ Test merge rules deleted successfully');
      
    } catch (error) {
      console.log('❌ Error testing CustomerMergeRulesService:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error setting up customer merge rules table:', error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

setupCustomerMergeRulesTable();
