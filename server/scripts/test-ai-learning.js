/**
 * Test AI Learning Service
 */

const service = require('../services/AILearningService');

async function test() {
  console.log('=== Testing AI Learning Service ===\n');
  
  try {
    // 1. Get stats
    console.log('1. Getting learning stats for FP...');
    const stats = await service.getLearningStats('FP');
    console.log(JSON.stringify(stats, null, 2));
    
    // 2. Get active weights
    console.log('\n2. Getting active weights for FP...');
    const weights = await service.getActiveWeights('FP');
    console.log(JSON.stringify(weights, null, 2));
    
    // 3. Test recording learning data (simulate)
    console.log('\n3. Testing recordLearningData...');
    const learningId = await service.recordLearningData(
      'FP',
      'Test Company ABC',
      'Test Company A.B.C.',
      {
        score: 0.85,
        details: {
          levenshtein: 0.90,
          jaroWinkler: 0.92,
          tokenSet: 0.88,
          nGramPrefix: 0.85,
          coreBrand: 0.80,
          phonetic: 0.75,
          withoutSuffix: 0.82
        },
        penalties: {},
        uniqueAnalysis: {}
      },
      'APPROVED',
      { source: 'TEST', decidedBy: 1 }
    );
    console.log('Learning data recorded with ID:', learningId);
    
    // 4. Check stats again
    console.log('\n4. Stats after recording:');
    const stats2 = await service.getLearningStats('FP');
    console.log(JSON.stringify(stats2, null, 2));
    
    // 5. Get config
    console.log('\n5. AI Configuration:');
    const threshold = await service.getConfig('auto_retrain_threshold');
    const pending = await service.getConfig('pending_decisions');
    console.log('  - Auto-retrain threshold:', threshold);
    console.log('  - Pending decisions:', pending);
    
    console.log('\n✅ All tests passed!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

test();
