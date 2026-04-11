/**
 * sync-all-sales-reps.js
 * 
 * Run this script to populate the sales_rep_master table with all 
 * existing sales rep names from fp_data and hc_data tables.
 * 
 * Run: node scripts/sync-all-sales-reps.js
 * 
 * Created: June 2025
 */

require('dotenv').config({ path: './server/.env' });
const { syncAllSalesReps } = require('../server/services/salesRepAutoRegister');

async function main() {
  console.log('====================================');
  console.log('SALES REP MASTER SYNC');
  console.log('====================================\n');
  
  try {
    // Sync FP division
    console.log('📌 Syncing FP Division...\n');
    const fpResults = await syncAllSalesReps('FP');
    console.log(`\nFP Results:`);
    console.log(`  Actual: ${fpResults.actual.added} added, ${fpResults.actual.skipped} skipped`);
    console.log(`  Budget: ${fpResults.budget.added} added, ${fpResults.budget.skipped} skipped`);
    
    // Sync HC division
    console.log('\n📌 Syncing HC Division...\n');
    const hcResults = await syncAllSalesReps('HC');
    console.log(`\nHC Results:`);
    console.log(`  Actual: ${hcResults.actual.added} added, ${hcResults.actual.skipped} skipped`);
    console.log(`  Budget: ${hcResults.budget.added} added, ${hcResults.budget.skipped} skipped`);
    
    // Summary
    const totalAdded = fpResults.total.added + hcResults.total.added;
    const totalSkipped = fpResults.total.skipped + hcResults.total.skipped;
    
    console.log('\n====================================');
    console.log('SYNC COMPLETE');
    console.log('====================================');
    console.log(`✅ Total added: ${totalAdded}`);
    console.log(`⏭️ Total skipped: ${totalSkipped}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Sync failed:', error);
    process.exit(1);
  }
}

main();
