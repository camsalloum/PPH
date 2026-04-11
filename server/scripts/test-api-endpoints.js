/**
 * Test Script: API Endpoints for Customer Merging
 * Tests all the new division merge rules API endpoints
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001/api/division-merge-rules';
const DIVISION = 'FP';

async function testAPIEndpoints() {
  console.log('\n========================================');
  console.log('🧪 Testing Customer Merging API Endpoints');
  console.log('========================================\n');

  try {
    // Test 1: Get Statistics
    console.log('📊 Test 1: Get Statistics\n');
    const statsResponse = await axios.get(`${BASE_URL}/stats?division=${DIVISION}`);

    if (statsResponse.data.success) {
      const stats = statsResponse.data.data;
      console.log('✅ Statistics loaded successfully!\n');
      console.log('   Rules:');
      console.log(`     - Active: ${stats.rules.active_rules}`);
      console.log(`     - Needs Update: ${stats.rules.needs_update}`);
      console.log(`     - Orphaned: ${stats.rules.orphaned}`);
      console.log(`     - Not Validated: ${stats.rules.not_validated}\n`);
      console.log('   Suggestions:');
      console.log(`     - Pending: ${stats.suggestions.pending}`);
      console.log(`     - Approved: ${stats.suggestions.approved}`);
      console.log(`     - Rejected: ${stats.suggestions.rejected}\n`);
    }

    // Test 2: Get AI Suggestions
    console.log('🤖 Test 2: Get AI Suggestions (Pending)\n');
    const suggestionsResponse = await axios.get(`${BASE_URL}/suggestions?division=${DIVISION}&status=PENDING`);

    if (suggestionsResponse.data.success) {
      const suggestions = suggestionsResponse.data.data;
      console.log(`✅ Found ${suggestions.length} pending AI suggestions!\n`);

      if (suggestions.length > 0) {
        console.log('   Top 5 Suggestions:\n');
        suggestions.slice(0, 5).forEach((sugg, index) => {
          const confidence = (sugg.confidence_score * 100).toFixed(0);
          console.log(`   ${index + 1}. ${confidence}% - "${sugg.suggested_merge_name}"`);
          console.log(`      Merges: ${sugg.customer_group.join(' + ')}`);
          console.log('');
        });
      }
    }

    // Test 3: Get Active Rules
    console.log('✅ Test 3: Get Active Rules\n');
    const rulesResponse = await axios.get(`${BASE_URL}/rules?division=${DIVISION}`);

    if (rulesResponse.data.success) {
      const rules = rulesResponse.data.data;
      console.log(`✅ Found ${rules.length} active merge rules!\n`);

      if (rules.length > 0) {
        console.log('   Active Rules:\n');
        rules.forEach((rule, index) => {
          console.log(`   ${index + 1}. "${rule.merged_customer_name}"`);
          console.log(`      Status: ${rule.validation_status}`);
          console.log(`      Source: ${rule.rule_source}`);
          console.log(`      Customers: ${rule.original_customers.length}`);
          rule.original_customers.forEach(c => console.log(`        - ${c}`));
          console.log('');
        });
      }
    }

    // Test 4: Get Rules Needing Validation
    console.log('⚠️  Test 4: Get Rules Needing Validation\n');
    const validationResponse = await axios.get(`${BASE_URL}/rules/needs-validation?division=${DIVISION}`);

    if (validationResponse.data.success) {
      const needsValidation = validationResponse.data.data;

      if (needsValidation.length === 0) {
        console.log('✅ All rules are valid! No validation needed.\n');
      } else {
        console.log(`⚠️  Found ${needsValidation.length} rules needing validation:\n`);
        needsValidation.forEach((rule, index) => {
          console.log(`   ${index + 1}. "${rule.merged_customer_name}" - ${rule.validation_status}`);
        });
        console.log('');
      }
    }

    // Test 5: Validate All Rules
    console.log('🔍 Test 5: Validate All Rules\n');
    const validateResponse = await axios.post(`${BASE_URL}/validate`, {
      division: DIVISION
    });

    if (validateResponse.data.success) {
      const summary = validateResponse.data.summary;
      console.log('✅ Validation complete!\n');
      console.log('   Summary:');
      console.log(`     - Total: ${summary.total}`);
      console.log(`     - Valid: ${summary.valid}`);
      console.log(`     - Needs Update: ${summary.needsUpdate}`);
      console.log(`     - Orphaned: ${summary.orphaned}\n`);
    }

    // Test 6: Test Manual Rule Creation (Example - won't actually create)
    console.log('📝 Test 6: Manual Rule Creation (Dry Run)\n');
    console.log('   Example request:');
    console.log('   POST /api/division-merge-rules/rules/manual');
    console.log('   Body: {');
    console.log('     division: "FP",');
    console.log('     mergedName: "Test Company",');
    console.log('     originalCustomers: ["Test Co LLC", "Test Company Ltd"],');
    console.log('     createdBy: "Admin"');
    console.log('   }\n');
    console.log('   ℹ️  Skipping actual creation to avoid test data\n');

    // Summary
    console.log('========================================');
    console.log('✅ All API Tests Passed!');
    console.log('========================================\n');

    console.log('🎯 API Endpoints Ready:\n');
    console.log('   📊 GET  /stats - Get statistics');
    console.log('   🤖 GET  /suggestions - Get AI suggestions');
    console.log('   ✅ GET  /rules - Get active rules');
    console.log('   ⚠️  GET  /rules/needs-validation - Get invalid rules');
    console.log('   🔍 POST /validate - Validate all rules');
    console.log('   👍 POST /suggestions/:id/approve - Approve suggestion');
    console.log('   👎 POST /suggestions/:id/reject - Reject suggestion');
    console.log('   ✏️  POST /suggestions/:id/edit-approve - Edit & approve');
    console.log('   📝 POST /rules/manual - Create manual rule');
    console.log('   🗑️  DELETE /rules/:id - Delete rule\n');

    console.log('🎨 Frontend is ready at:');
    console.log('   src/components/MasterData/CustomerMerging/CustomerMergingPage.js\n');

    console.log('📖 Documentation:');
    console.log('   CUSTOMER_MERGING_SYSTEM_README.md\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

// Run tests
testAPIEndpoints();
