/**
 * Test the fix: Run AI scan and verify old suggestions are cleared
 */
require('dotenv').config();
const CustomerMergingAI = require('../services/CustomerMergingAI');

async function testScan() {
  console.log('\n=== TESTING AI SCAN WITH AUTO-CLEAR ===\n');
  
  console.log('Running AI scan for FP division...');
  console.log('This should clear old pending suggestions first.\n');
  
  const result = await CustomerMergingAI.scanAndSuggestMerges('FP', {
    minConfidence: 0.75,
    maxGroupSize: 5
  });
  
  console.log('\n=== SCAN RESULT ===');
  console.log(`Saved count: ${result.savedCount}`);
  console.log(`Total filtered: ${result.totalFiltered}`);
  
  process.exit(0);
}

testScan().catch(e => { 
  console.error(e); 
  process.exit(1); 
});
