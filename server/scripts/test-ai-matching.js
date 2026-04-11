/**
 * Test Script: AI Customer Matching Engine
 *
 * Tests the AI fuzzy matching engine on real customer data
 */

const CustomerMergingAI = require('../services/CustomerMergingAI');

async function testAIMatching() {
  console.log('\n========================================');
  console.log('🧪 Testing AI Customer Matching Engine');
  console.log('========================================\n');

  try {
    // Test 1: Scan for duplicates in FP division
    console.log('📊 Test 1: Scanning FP division for duplicate customers...\n');

    const suggestions = await CustomerMergingAI.scanAndSuggestMerges('FP', {
      minConfidence: 0.75, // 75% threshold for testing
      maxGroupSize: 5
    });

    // Display results
    if (suggestions.length === 0) {
      console.log('✅ No new duplicate suggestions found!\n');
      console.log('   This could mean:');
      console.log('   - All duplicates are already merged');
      console.log('   - Customer names are very unique');
      console.log('   - Or try lowering the confidence threshold\n');
    } else {
      console.log(`\n🎯 AI Found ${suggestions.length} Potential Merge Groups:\n`);
      console.log('========================================\n');

      suggestions.forEach((suggestion, index) => {
        const confidencePercent = (suggestion.confidence * 100).toFixed(1);
        const confidenceEmoji = suggestion.confidence >= 0.9 ? '🟢' :
                               suggestion.confidence >= 0.8 ? '🟡' : '🟠';

        console.log(`${index + 1}. ${confidenceEmoji} Confidence: ${confidencePercent}%`);
        console.log(`   Suggested Merged Name: "${suggestion.mergedName}"`);
        console.log(`   Customers to merge (${suggestion.customerCount}):`);

        suggestion.customers.forEach((customer, i) => {
          console.log(`      ${i + 1}. ${customer}`);
        });

        console.log(`   Match Analysis:`);
        suggestion.matchDetails.forEach(detail => {
          console.log(`      • ${detail.pair[0]}`);
          console.log(`        vs ${detail.pair[1]}`);
          console.log(`        → ${detail.similarity} similar`);
        });

        console.log('');
      });
    }

    // Test 2: Validate existing merge rules
    console.log('\n📋 Test 2: Validating existing merge rules...\n');

    const customers = await CustomerMergingAI.getAllCustomers('FP');
    const validationResults = await CustomerMergingAI.validateMergeRules('FP', customers);

    if (validationResults.length === 0) {
      console.log('   ℹ️  No existing merge rules to validate\n');
    } else {
      console.log(`\n📊 Validation Results:\n`);
      console.log('========================================\n');

      validationResults.forEach((result, index) => {
        const statusEmoji = result.status === 'VALID' ? '✅' :
                           result.status === 'NEEDS_UPDATE' ? '⚠️' : '❌';

        console.log(`${index + 1}. ${statusEmoji} "${result.ruleName}"`);
        console.log(`   Status: ${result.status}`);

        if (result.found && result.found.length > 0) {
          console.log(`   ✓ Found (${result.found.length}): ${result.found.join(', ')}`);
        }

        if (result.missing && result.missing.length > 0) {
          console.log(`   ✗ Missing (${result.missing.length}): ${result.missing.join(', ')}`);

          if (result.suggestions && result.suggestions.length > 0) {
            console.log(`   💡 AI Suggestions:`);
            result.suggestions.forEach(sugg => {
              console.log(`      Replace "${sugg.missing}"`);
              console.log(`      with "${sugg.replacement}" (${sugg.confidence} confidence)`);

              if (sugg.alternatives && sugg.alternatives.length > 0) {
                console.log(`      Alternatives:`);
                sugg.alternatives.forEach(alt => {
                  console.log(`        - "${alt.name}" (${alt.confidence})`);
                });
              }
            });
          }
        }

        console.log('');
      });
    }

    // Test 3: Test individual similarity calculations
    console.log('\n🔬 Test 3: Sample Similarity Calculations...\n');

    const testPairs = [
      ['ABC Trading LLC', 'ABC Trading L.L.C'],
      ['NESTLE WATERS FACTORY', 'NESTLE WATER'],
      ['Golden Star Trading', 'Golden Star General Trading'],
      ['Completely Different', 'Not Similar At All']
    ];

    testPairs.forEach(([name1, name2]) => {
      const sim = CustomerMergingAI.calculateSimilarity(name1, name2);
      const percent = (sim.score * 100).toFixed(1);

      console.log(`"${name1}"`);
      console.log(`vs`);
      console.log(`"${name2}"`);
      console.log(`→ ${percent}% similar`);

      if (sim.details.normalized1) {
        console.log(`   Normalized: "${sim.details.normalized1}" vs "${sim.details.normalized2}"`);
      }

      console.log(`   Breakdown:`);
      console.log(`     - Levenshtein: ${sim.details.levenshtein}`);
      console.log(`     - Jaro-Winkler: ${sim.details.jaroWinkler}`);
      console.log(`     - Token Set: ${sim.details.tokenSet}`);
      console.log(`     - Without Suffix: ${sim.details.withoutSuffix}`);
      console.log('');
    });

    console.log('========================================');
    console.log('✅ AI Testing Complete!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);
  } finally {
    process.exit(0);
  }
}

// Run tests
testAIMatching();
