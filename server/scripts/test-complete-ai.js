/**
 * Test the complete AI Learning implementation
 * Tests: Learned weights, Transitive clustering, Explainability
 */

const CustomerMergingAI = require('../services/CustomerMergingAI');

async function testAI() {
  console.log('=== Testing Complete AI Implementation ===\n');

  // Test 1: Basic similarity with explainability
  console.log('1. Testing similarity with topReasons...');
  const similarity = CustomerMergingAI.calculateSimilarity(
    'Somafaco Trading LLC',
    'Somafaco (Société Marocaine de Distribution)'
  );
  console.log(`   Score: ${(similarity.score * 100).toFixed(1)}%`);
  console.log(`   Top Reasons: ${CustomerMergingAI.generateTopReasons(similarity).join(', ')}`);
  
  // Test 2: Phonetic blocking
  console.log('\n2. Testing phonetic blocking...');
  const key1 = CustomerMergingAI.getPhoneticBlockingKey('Mohammed Trading');
  const key2 = CustomerMergingAI.getPhoneticBlockingKey('Muhammad Trading');
  const key3 = CustomerMergingAI.getPhoneticBlockingKey('Mohamad Trading');
  console.log(`   Mohammed → ${key1}`);
  console.log(`   Muhammad → ${key2}`);
  console.log(`   Mohamad → ${key3}`);
  console.log(`   Same block? ${key1 === key2 && key2 === key3 ? '✅ Yes' : '❌ No'}`);

  // Test 3: Transitive clustering
  console.log('\n3. Testing transitive clustering (Union-Find)...');
  const testCustomers = [
    'ABC Company LLC',
    'ABC Company Trading',
    'ABC Trading Co',
    'XYZ Industries',
    'XYZ Industries LLC',
    'Totally Different Corp'
  ];
  
  // Calculate all pairs manually for testing
  const allPairs = [];
  for (let i = 0; i < testCustomers.length; i++) {
    for (let j = i + 1; j < testCustomers.length; j++) {
      const sim = CustomerMergingAI.calculateSimilarity(testCustomers[i], testCustomers[j]);
      if (sim.score >= 0.50) {
        allPairs.push({
          customer1: testCustomers[i],
          customer2: testCustomers[j],
          score: sim.score
        });
        console.log(`   ${testCustomers[i]} ↔ ${testCustomers[j]}: ${(sim.score * 100).toFixed(0)}%`);
      }
    }
  }
  
  const components = CustomerMergingAI.findConnectedComponents(testCustomers, allPairs, 0.50);
  console.log(`\n   Found ${components.length} merge groups:`);
  components.forEach((group, i) => {
    console.log(`   Group ${i + 1}: [${group.join(', ')}]`);
  });

  // Test 4: Learned weights
  console.log('\n4. Testing learned weights integration...');
  try {
    const weights = await CustomerMergingAI.getLearnedWeights('FP');
    if (weights) {
      console.log('   ✅ Got learned weights:', JSON.stringify(weights, null, 2).substring(0, 200) + '...');
    } else {
      console.log('   ℹ️ No learned weights yet (using static)');
    }
  } catch (e) {
    console.log('   ⚠️ Could not get learned weights:', e.message);
  }

  // Test 5: Learning status
  console.log('\n5. Testing learning status...');
  try {
    const status = await CustomerMergingAI.getLearningStatus('FP');
    console.log('   Learning Status:', JSON.stringify(status, null, 2));
  } catch (e) {
    console.log('   ⚠️ Could not get learning status:', e.message);
  }

  // Test 6: Full transitive scan
  console.log('\n6. Testing full scanWithTransitiveClustering...');
  try {
    const groups = await CustomerMergingAI.scanWithTransitiveClustering(testCustomers, 'FP', 0.50);
    console.log(`   Found ${groups.length} groups with transitive clustering:`);
    groups.forEach((g, i) => {
      console.log(`   Group ${i + 1} (${(g.confidence * 100).toFixed(0)}%): ${g.customers.join(', ')}`);
      if (g.topReasons && g.topReasons.length > 0) {
        console.log(`     Reasons: ${g.topReasons.join('; ')}`);
      }
    });
  } catch (e) {
    console.log('   ⚠️ Transitive scan error:', e.message);
  }

  console.log('\n✅ AI Implementation Tests Complete!');
  process.exit(0);
}

testAI().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
