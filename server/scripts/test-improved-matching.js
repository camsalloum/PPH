/**
 * Test script for improved AI customer matching
 * Tests the Ajmal Perfumes case and other edge cases
 */

const CustomerMergingAI = require('../services/CustomerMergingAI');

console.log('\n==============================================');
console.log('  AI Customer Matching - Improvement Test');
console.log('==============================================\n');

// Test cases
const testCases = [
  {
    name: 'Ajmal Perfumes Case (Original Problem)',
    customer1: 'Ajmal Perfumes Center (l.l.c.)po Box: 1082, Shop No.:3',
    customer2: 'Ajmal Perfumes Manufacturing And',
    expectedToMatch: true
  },
  {
    name: 'Address Noise Test',
    customer1: 'ABC Trading LLC, Shop No. 123, Building 5, Dubai',
    customer2: 'ABC Trading',
    expectedToMatch: true
  },
  {
    name: 'Phone Number Noise',
    customer1: 'XYZ Store Tel: +971 50 123 4567',
    customer2: 'XYZ Store',
    expectedToMatch: true
  },
  {
    name: 'Different Brand Test (Should NOT match)',
    customer1: 'Samsung Electronics',
    customer2: 'Sony Electronics',
    expectedToMatch: false
  },
  {
    name: 'Brand with Different Descriptors',
    customer1: 'Al Reef Trading Center',
    customer2: 'Al Reef Trading International',
    expectedToMatch: true
  },
  {
    name: 'PO Box Pattern Test',
    customer1: 'Golden Star LLC P.O. Box 5678',
    customer2: 'Golden Star Limited',
    expectedToMatch: true
  },
  {
    name: 'Complex Address with Office',
    customer1: 'Diamond Group, Office No. 42, Floor 3, Building 7',
    customer2: 'Diamond Group Trading',
    expectedToMatch: true
  },
  {
    name: 'Abbreviation Test - Int\'l',
    customer1: 'Global Int\'l Trading',
    customer2: 'Global International Trading',
    expectedToMatch: true
  },
  {
    name: 'Abbreviation Test - Mfg',
    customer1: 'Apex Mfg Industries',
    customer2: 'Apex Manufacturing Industries',
    expectedToMatch: true
  },
  {
    name: 'Phonetic Test - Typo/Misspelling',
    customer1: 'Mohammed Electronics',
    customer2: 'Muhammad Electronics',
    expectedToMatch: true
  },
  {
    name: 'Location Removal Test',
    customer1: 'Star Electronics Dubai LLC',
    customer2: 'Star Electronics DXB',
    expectedToMatch: true
  },
  {
    name: 'Combined: Abbreviation + Address + Location',
    customer1: 'Falcon Gen Trdg, Shop 15, Dubai',
    customer2: 'Falcon General Trading DXB',
    expectedToMatch: true
  }
];

// Run tests
console.log('Running test cases...\n');

testCases.forEach((test, index) => {
  console.log(`\n─────────────────────────────────────────────`);
  console.log(`Test ${index + 1}: ${test.name}`);
  console.log(`─────────────────────────────────────────────`);
  console.log(`Customer 1: "${test.customer1}"`);
  console.log(`Customer 2: "${test.customer2}"`);

  const result = CustomerMergingAI.calculateSimilarity(test.customer1, test.customer2);

  console.log(`\nOverall Score: ${(result.score * 100).toFixed(1)}%`);
  console.log('\nAlgorithm Breakdown:');
  console.log(`  Levenshtein:    ${(result.details.levenshtein * 100).toFixed(1)}%`);
  console.log(`  Jaro-Winkler:   ${(result.details.jaroWinkler * 100).toFixed(1)}%`);
  console.log(`  Token Set:      ${(result.details.tokenSet * 100).toFixed(1)}%`);
  console.log(`  Business Suffix:${(result.details.withoutSuffix * 100).toFixed(1)}%`);
  console.log(`  N-Gram Prefix:  ${(result.details.nGramPrefix * 100).toFixed(1)}% ⭐`);
  console.log(`  Core Brand:     ${(result.details.coreBrand * 100).toFixed(1)}% ⭐`);
  console.log(`  Phonetic:       ${(result.details.phonetic * 100).toFixed(1)}% ⭐ NEW`);

  if (result.details.exactMatch) {
    console.log(`\n✨ EXACT MATCH after normalization!`);
    const norm1 = CustomerMergingAI.normalizeCustomerName(test.customer1);
    const norm2 = CustomerMergingAI.normalizeCustomerName(test.customer2);
    console.log(`Normalized Forms:`);
    console.log(`  1: "${norm1}"`);
    console.log(`  2: "${norm2}"`);
  } else {
    console.log(`\nNormalized Forms:`);
    console.log(`  1: "${result.details.normalized1}"`);
    console.log(`  2: "${result.details.normalized2}"`);
  }

  console.log(`\nCore Brand Extraction:`);
  console.log(`  1: "${CustomerMergingAI.extractCoreBrand(test.customer1)}"`);
  console.log(`  2: "${CustomerMergingAI.extractCoreBrand(test.customer2)}"`);

  const threshold = 50; // Lowered to 50% since users manually approve each suggestion
  const wouldMatch = result.score >= (threshold / 100);
  const testPassed = wouldMatch === test.expectedToMatch;

  console.log(`\nWould match at ${threshold}% threshold? ${wouldMatch ? '✅ YES' : '❌ NO'}`);
  console.log(`Test Result: ${testPassed ? '✅ PASSED' : '❌ FAILED'}`);
});

console.log('\n\n==============================================');
console.log('  Test Suite Completed');
console.log('==============================================\n');
