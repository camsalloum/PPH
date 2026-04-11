/**
 * SYNC CUSTOMER MASTER MERGE STATUS WITH ACTIVE MERGE RULES
 * 
 * This script ensures customer_master.is_merged flag is synchronized
 * with the active merge rules in division_customer_merge_rules
 * 
 * Run this after:
 * - Deleting a merge rule
 * - Deactivating a merge rule
 * - Bulk rule changes
 */

require('dotenv').config();
const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function syncCustomerMergeStatus(division = 'fp') {
  const div = division.toLowerCase();
  
  try {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`SYNCING CUSTOMER MERGE STATUS FOR DIVISION: ${div.toUpperCase()}`);
    console.log('='.repeat(70));
    
    // STEP 1: Get all customers currently marked as merged
    const currentlyMerged = await pool.query(`
      SELECT customer_code, customer_name, merged_into_code
      FROM ${div}_customer_master
      WHERE is_merged = true
    `);
    
    console.log(`\n1. Currently marked as merged: ${currentlyMerged.rows.length} customers`);
    
    // STEP 2: Get all customer names that are in ACTIVE merge rules
    const activeMerges = await pool.query(`
      SELECT id, merged_customer_name, original_customers, master_customer_code
      FROM ${div}_division_customer_merge_rules
      WHERE is_active = true AND status = 'ACTIVE'
    `);
    
    console.log(`2. Active merge rules: ${activeMerges.rows.length} rules`);
    
    // Build set of all customer names that SHOULD be merged
    const shouldBeMerged = new Set();
    const mergeMapping = new Map(); // customer_name -> master_customer_code
    
    for (const rule of activeMerges.rows) {
      const originals = rule.original_customers || [];
      for (const name of originals) {
        const normalized = name.toLowerCase().trim();
        shouldBeMerged.add(normalized);
        if (rule.master_customer_code) {
          mergeMapping.set(normalized, rule.master_customer_code);
        }
      }
    }
    
    console.log(`3. Customer names that should be merged: ${shouldBeMerged.size} names`);
    
    // STEP 3: Find customers that SHOULD NOT be merged but are marked as merged
    const toUnmerge = [];
    for (const row of currentlyMerged.rows) {
      const normalized = row.customer_name.toLowerCase().trim();
      if (!shouldBeMerged.has(normalized)) {
        toUnmerge.push(row);
      }
    }
    
    console.log(`\n4. Customers to UN-MERGE (marked as merged but no active rule): ${toUnmerge.length}`);
    if (toUnmerge.length > 0) {
      console.log('   Customers being un-merged:');
      toUnmerge.forEach(c => console.log(`      - ${c.customer_name} (${c.customer_code})`));
    }
    
    // STEP 4: Find customers that SHOULD be merged but aren't marked
    const allCustomers = await pool.query(`
      SELECT customer_code, customer_name, is_merged, merged_into_code
      FROM ${div}_customer_master
      WHERE is_active = true
    `);
    
    const toMerge = [];
    for (const row of allCustomers.rows) {
      const normalized = row.customer_name.toLowerCase().trim();
      if (shouldBeMerged.has(normalized) && !row.is_merged) {
        toMerge.push({
          ...row,
          target_code: mergeMapping.get(normalized)
        });
      }
    }
    
    console.log(`\n5. Customers to MERGE (should be merged but not marked): ${toMerge.length}`);
    if (toMerge.length > 0) {
      console.log('   Customers being marked as merged:');
      toMerge.forEach(c => console.log(`      - ${c.customer_name} (${c.customer_code}) -> ${c.target_code || 'N/A'}`));
    }
    
    // STEP 5: Apply the fixes
    console.log(`\n${'='.repeat(70)}`);
    console.log('APPLYING FIXES...');
    console.log('='.repeat(70));
    
    let unmergedCount = 0;
    let mergedCount = 0;
    
    // Un-merge customers
    for (const customer of toUnmerge) {
      await pool.query(`
        UPDATE ${div}_customer_master
        SET is_merged = false, merged_into_code = NULL
        WHERE customer_code = $1
      `, [customer.customer_code]);
      unmergedCount++;
      console.log(`   ✓ Un-merged: ${customer.customer_name}`);
    }
    
    // Merge customers
    for (const customer of toMerge) {
      await pool.query(`
        UPDATE ${div}_customer_master
        SET is_merged = true, merged_into_code = $1
        WHERE customer_code = $2
      `, [customer.target_code, customer.customer_code]);
      mergedCount++;
      console.log(`   ✓ Merged: ${customer.customer_name} -> ${customer.target_code}`);
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('SYNC COMPLETE');
    console.log('='.repeat(70));
    console.log(`Un-merged: ${unmergedCount} customers`);
    console.log(`Merged: ${mergedCount} customers`);
    console.log(`Total changes: ${unmergedCount + mergedCount}`);
    console.log('='.repeat(70) + '\n');
    
    return {
      success: true,
      unmergedCount,
      mergedCount,
      totalChanges: unmergedCount + mergedCount
    };
    
  } catch (error) {
    console.error('ERROR:', error.message);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  const division = process.argv[2] || 'fp';
  syncCustomerMergeStatus(division)
    .then(() => {
      console.log('✅ Sync completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Sync failed:', error);
      process.exit(1);
    });
}

module.exports = { syncCustomerMergeStatus };
