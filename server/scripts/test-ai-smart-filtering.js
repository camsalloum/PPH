/**
 * Test AI Smart Filtering - Verify generic terms are properly handled
 */

// Simulate the AI logic
const genericTerms = new Set([
  'middle', 'east', 'gulf', 'arab', 'arabian', 'emirates', 'united',
  'asia', 'asian', 'european', 'african', 'american', 'global', 'world',
  'national', 'regional', 'local', 'central', 'northern', 'southern',
  'dubai', 'sharjah', 'abu', 'dhabi', 'ajman', 'fujairah',
  'industrial', 'commercial', 'business', 'trade', 'export', 'import',
  'factory', 'plant', 'warehouse', 'storage', 'logistics', 'transport',
  'company', 'corporation', 'enterprise', 'firm', 'agency', 'manufacturing',
  'food', 'foods', 'beverage', 'beverages', 'water', 'drinks',
  'plastic', 'plastics', 'metal', 'metals', 'steel', 'aluminum',
  'paper', 'packaging', 'container', 'containers', 'box', 'boxes',
  'bag', 'bags', 'bottle', 'bottles', 'can', 'cans',
  'retail', 'wholesale', 'trading', 'marketing', 'industries', 'industry',
  'services', 'service', 'solutions', 'group', 'limited', 'llc', 'fze'
]);

function extractUniqueWords(name) {
  const normalized = name.toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  const tokens = normalized.split(' ').filter(t => t.length > 2);
  return tokens.filter(word => !genericTerms.has(word));
}

function analyzeMatch(name1, name2) {
  const unique1 = extractUniqueWords(name1);
  const unique2 = extractUniqueWords(name2);
  
  const set1 = new Set(unique1);
  const set2 = new Set(unique2);
  const sharedUnique = unique1.filter(w => set2.has(w));
  
  const hasShared = sharedUnique.length > 0;
  const bothHaveUnique = set1.size > 0 && set2.size > 0;
  const neitherHasUnique = set1.size === 0 && set2.size === 0;
  const oneHasUnique = (set1.size > 0) !== (set2.size > 0);
  
  const isGenericOnly = !hasShared && (oneHasUnique || bothHaveUnique);
  const isAllGeneric = neitherHasUnique && !hasShared;
  
  let decision, penalty;
  if (hasShared) {
    decision = '✅ APPROVE';
    penalty = 'None - has shared unique words';
  } else if (isGenericOnly) {
    decision = '❌ REJECT';
    penalty = '60% penalty (generic only match)';
  } else if (isAllGeneric) {
    decision = '❌ REJECT';
    penalty = '70% penalty (all generic words)';
  } else {
    decision = '⚠️ SUSPICIOUS';
    penalty = 'Unknown';
  }
  
  return {
    name1,
    name2,
    unique1,
    unique2,
    sharedUnique,
    decision,
    penalty
  };
}

console.log('═'.repeat(80));
console.log(' AI SMART FILTERING TEST - Generic Terms Detection');
console.log('═'.repeat(80));

// Test cases
const testCases = [
  // BAD matches (should be filtered out) - GENERIC ONLY
  ['Middle East Galvanisingpo Box', 'Middle East Plastic Bags Industries'],
  ['Middle East Galvanisingpo Box', 'Middle East Retail Company(llc)(br)'],
  ['Gulf Food Industries', 'Gulf Packaging Solutions'],
  ['Dubai Trading Company', 'Dubai Manufacturing LLC'],
  
  // BAD matches - ALL GENERIC (both names are entirely generic)
  ['Emirates Water', 'Emirates Steel'],
  ['Gulf Trading Co', 'Gulf Industries LLC'],
  ['National Food Company', 'National Water Services'],
  
  // GOOD matches (should pass) - HAVE SHARED UNIQUE WORDS
  ['Coca-Cola Al Ahlia Beverages', 'Coca-Cola Al Ahlia Beverage Co'],
  ['Masafi Water Factory', 'Masafi Co. LLC'],
  ['National Canned Food', 'National Canned Food Trading'],
  ['Weathermaker FZE', 'Weathermaker Limited'],
  ['Al Manhal Water Factory', 'Al Manhal Water Factory Co.'],
  ['AUJAN Industries', 'Aujan Soft Drinks'],
];

console.log('\n📊 TEST RESULTS:\n');

for (const [name1, name2] of testCases) {
  const result = analyzeMatch(name1, name2);
  
  console.log(`${result.decision}`);
  console.log(`   "${name1}"`);
  console.log(`   "${name2}"`);
  console.log(`   Unique words 1: [${result.unique1.join(', ') || 'none'}]`);
  console.log(`   Unique words 2: [${result.unique2.join(', ') || 'none'}]`);
  console.log(`   Shared unique: [${result.sharedUnique.join(', ') || 'none'}]`);
  console.log(`   Penalty: ${result.penalty}`);
  console.log('');
}

console.log('═'.repeat(80));
console.log(' IMPLEMENTATION SUMMARY');
console.log('═'.repeat(80));
console.log(`
Changes made to CustomerMergingAI.js:

1. ✅ Added 100+ GENERIC TERMS list:
   - Regional: middle, east, gulf, emirates, arab, etc.
   - Cities: dubai, sharjah, jeddah, riyadh, etc.
   - Industries: food, plastic, water, steel, etc.
   - Business: trading, company, industries, services, etc.

2. ✅ New extractUniqueWords() method:
   - Filters out generic terms from customer names
   - Returns only meaningful, discriminating words

3. ✅ New analyzeSharedUniqueWords() method:
   - Compares two names to find shared UNIQUE words
   - Detects "generic only" matches (penalty: 60%)
   - Detects "all generic" matches (penalty: 70%)

4. ✅ Increased threshold: 35% → 55%

5. ✅ Updated calculateSimilarity():
   - Applies heavy penalties for generic-only matches
   - Includes unique word analysis in results

RESULT: False positives like "Middle East X" vs "Middle East Y" 
will now be heavily penalized and filtered out!
`);
