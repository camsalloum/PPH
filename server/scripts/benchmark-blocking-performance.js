/**
 * Performance Benchmark: Blocking Optimization
 *
 * Compares performance of blocking vs non-blocking algorithms
 * Tests with different dataset sizes
 */

const CustomerMergingAI = require('../services/CustomerMergingAI');

// Generate test customer names
function generateTestCustomers(count) {
  const prefixes = ['Al', 'Golden', 'Star', 'Diamond', 'Phoenix', 'Royal', 'Premier', 'Elite', 'Global', 'Metro'];
  const middles = ['Trading', 'Electronics', 'Group', 'International', 'Services', 'Industries', 'Solutions', 'Systems'];
  const suffixes = ['LLC', 'Limited', 'Inc', 'Corp', 'Est', 'FZE', 'Co'];

  const customers = [];

  for (let i = 0; i < count; i++) {
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const middle = middles[Math.floor(Math.random() * middles.length)];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

    // Add some variation
    const variation = Math.random();
    let name;

    if (variation < 0.7) {
      // Standard format
      name = `${prefix} ${middle} ${suffix}`;
    } else if (variation < 0.85) {
      // Add address noise
      name = `${prefix} ${middle} ${suffix}, Shop No. ${Math.floor(Math.random() * 100)}`;
    } else {
      // Add abbreviations
      name = `${prefix} Int'l ${middle} ${suffix}`;
    }

    customers.push(name);
  }

  return customers;
}

async function benchmark() {
  console.log('\n========================================');
  console.log('⚡ Blocking Optimization Performance Test');
  console.log('========================================\n');

  const testSizes = [100, 200, 500, 700];
  const results = [];

  for (const size of testSizes) {
    console.log(`\n📊 Testing with ${size} customers...`);
    console.log('─'.repeat(50));

    const customers = generateTestCustomers(size);

    // Test 1: WITH blocking (optimized)
    console.log(`\n🚀 WITH Blocking Optimization:`);
    const startBlocking = Date.now();
    const suggestionsBlocking = await CustomerMergingAI.findPotentialDuplicates(
      customers,
      new Set(),
      { useBlocking: true, minConfidence: 0.50 }
    );
    const timeBlocking = Date.now() - startBlocking;
    console.log(`   ✅ Found ${suggestionsBlocking.length} groups in ${timeBlocking}ms`);

    // Test 2: WITHOUT blocking (O(n²))
    console.log(`\n🐌 WITHOUT Blocking (O(n²)):`);
    const startNoBlocking = Date.now();
    const suggestionsNoBlocking = await CustomerMergingAI.findPotentialDuplicates(
      customers,
      new Set(),
      { useBlocking: false, minConfidence: 0.50 }
    );
    const timeNoBlocking = Date.now() - startNoBlocking;
    console.log(`   ✅ Found ${suggestionsNoBlocking.length} groups in ${timeNoBlocking}ms`);

    // Calculate speedup
    const speedup = (timeNoBlocking / timeBlocking).toFixed(2);
    const percentFaster = (((timeNoBlocking - timeBlocking) / timeNoBlocking) * 100).toFixed(1);

    console.log(`\n📈 Performance Improvement:`);
    console.log(`   Speed: ${speedup}x faster`);
    console.log(`   Time saved: ${percentFaster}% (${timeNoBlocking - timeBlocking}ms)`);

    results.push({
      size,
      timeBlocking,
      timeNoBlocking,
      speedup: parseFloat(speedup),
      percentFaster: parseFloat(percentFaster),
      suggestionsBlocking: suggestionsBlocking.length,
      suggestionsNoBlocking: suggestionsNoBlocking.length
    });
  }

  // Summary
  console.log('\n\n========================================');
  console.log('📊 Performance Summary');
  console.log('========================================\n');

  console.log('Size | With Blocking | Without Blocking | Speedup | % Faster');
  console.log('-----|---------------|------------------|---------|----------');

  results.forEach(r => {
    const blocking = `${r.timeBlocking}ms`.padEnd(13);
    const noBlocking = `${r.timeNoBlocking}ms`.padEnd(16);
    const speedup = `${r.speedup}x`.padEnd(7);
    const faster = `${r.percentFaster}%`;

    console.log(`${r.size.toString().padEnd(4)} | ${blocking} | ${noBlocking} | ${speedup} | ${faster}`);
  });

  // Extrapolate for 700 customers
  console.log('\n\n========================================');
  console.log('🎯 Estimated Time for 700 Customers');
  console.log('========================================\n');

  const result700 = results.find(r => r.size === 700);

  if (result700) {
    console.log(`WITH Blocking:    ${(result700.timeBlocking / 1000).toFixed(2)} seconds`);
    console.log(`WITHOUT Blocking: ${(result700.timeNoBlocking / 1000).toFixed(2)} seconds`);
    console.log(`\nTime Saved: ${((result700.timeNoBlocking - result700.timeBlocking) / 1000).toFixed(2)} seconds`);
    console.log(`Speedup: ${result700.speedup}x faster`);
  }

  console.log('\n========================================\n');
}

// Run benchmark
benchmark()
  .then(() => {
    console.log('✅ Benchmark complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  });
