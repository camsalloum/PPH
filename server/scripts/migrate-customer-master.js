/**
 * Migration: Populate Customer Master from existing merge rules
 */
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const division = process.argv[2] || 'fp';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: `${division}_database`
});

async function migrate() {
  console.log(`\n📦 Migrating Customer Master data for ${division.toUpperCase()}...\n`);
  
  const client = await pool.connect();
  
  try {
    // 1. Get all existing merge rules
    const rulesResult = await client.query(`
      SELECT id, merged_customer_name, original_customers, merge_code
      FROM ${division}_division_customer_merge_rules
      WHERE is_active = true
      ORDER BY id
    `);
    
    console.log(`Found ${rulesResult.rows.length} merge rules to migrate\n`);
    
    let customersCreated = 0;
    let aliasesCreated = 0;
    let mergeCodesAssigned = 0;
    
    for (const rule of rulesResult.rows) {
      const { id, merged_customer_name, original_customers } = rule;
      
      // Check if customer already exists
      const existingCustomer = await client.query(`
        SELECT customer_code FROM ${division}_customer_master 
        WHERE customer_name_normalized = ${division}_normalize_customer_name($1)
      `, [merged_customer_name]);
      
      let customerCode;
      
      if (existingCustomer.rows.length === 0) {
        // Create new customer master entry
        const newCustomer = await client.query(`
          INSERT INTO ${division}_customer_master (customer_name, division, notes, created_by)
          VALUES ($1, $2, $3, 'MIGRATION')
          RETURNING customer_code
        `, [merged_customer_name, division.toUpperCase(), `Migrated from merge rule ID: ${id}`]);
        
        customerCode = newCustomer.rows[0].customer_code;
        customersCreated++;
        console.log(`✅ Created customer: ${merged_customer_name} → ${customerCode}`);
      } else {
        customerCode = existingCustomer.rows[0].customer_code;
        console.log(`⏭️  Customer exists: ${merged_customer_name} → ${customerCode}`);
      }
      
      // Add aliases for each name in original_customers
      if (original_customers && Array.isArray(original_customers)) {
        for (const alias of original_customers) {
          if (alias && alias.trim()) {
            try {
              await client.query(`
                INSERT INTO ${division}_customer_aliases 
                (customer_code, alias_name, source_system, is_primary, created_by)
                VALUES ($1, $2, 'MERGE_RULE_MIGRATION', $3, 'MIGRATION')
                ON CONFLICT (customer_code, alias_name_normalized) DO NOTHING
              `, [customerCode, alias.trim(), alias.trim() === merged_customer_name]);
              aliasesCreated++;
            } catch (e) {
              // Ignore duplicate errors
            }
          }
        }
      }
      
      // Assign merge code if not exists
      if (!rule.merge_code) {
        await client.query(`
          UPDATE ${division}_division_customer_merge_rules
          SET merge_code = ${division}_generate_merge_code($1),
              master_customer_code = $2
          WHERE id = $3
        `, [division.toUpperCase(), customerCode, id]);
        mergeCodesAssigned++;
      }
    }
    
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`   MIGRATION SUMMARY`);
    console.log(`${'═'.repeat(50)}`);
    console.log(`   Customers created: ${customersCreated}`);
    console.log(`   Aliases created:   ${aliasesCreated}`);
    console.log(`   Merge codes assigned: ${mergeCodesAssigned}`);
    console.log(`${'═'.repeat(50)}\n`);
    
  } catch (error) {
    console.error('Migration error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
