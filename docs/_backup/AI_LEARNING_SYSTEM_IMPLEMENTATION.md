# AI Learning System - Implementation Summary

## Overview

The self-learning AI system has been implemented with three key phases:

### Phase 1: Active Learning from Feedback
- Every time an admin approves or rejects a suggestion, the decision is recorded
- All customer pairs in the suggestion are captured with their similarity scores
- 7 algorithm scores are stored for each pair (Levenshtein, Jaro-Winkler, TokenSet, N-Gram, CoreBrand, Phonetic, Suffix)

### Phase 2: Weight Optimization (Gradient Descent)
- Uses gradient descent with L2 regularization
- Optimizes algorithm weights based on admin decisions
- Auto-retrains after 50 decisions (configurable)
- Only applies new weights if improvement > 2%

### Phase 3: Transaction-Based Similarity
- Analyzes shared materials, countries, salesreps, channels
- Calculates price variance between customers
- Combines with name similarity (15% weight configurable)

## Database Tables Created

```
ai_learning_data         - Core learning data (all divisions)
fp_ai_learning_data      - FP division learning data  
hc_ai_learning_data      - HC division learning data

ai_model_weights         - Algorithm weights per version
fp_ai_model_weights      - FP division weights
hc_ai_model_weights      - HC division weights

ai_training_history      - Training run history
fp_ai_training_history   - FP division training history
hc_ai_training_history   - HC division training history

transaction_similarity_cache     - Transaction similarity cache
fp_transaction_similarity_cache  - FP division cache
hc_transaction_similarity_cache  - HC division cache

ai_configuration         - Global AI settings
```

## Configuration Options

| Key | Default | Description |
|-----|---------|-------------|
| auto_retrain_threshold | 50 | Decisions before auto-retrain |
| min_training_samples | 20 | Minimum samples to train |
| min_improvement_threshold | 0.02 | Minimum improvement to accept new weights |
| transaction_similarity_weight | 0.15 | Weight for transaction similarity |
| learning_enabled | true | Enable/disable learning |
| pending_decisions | 0 | Counter for pending decisions |

## API Endpoints

All endpoints are prefixed with `/api/:divisionCode/merge-rules/ai/`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /ai/stats | Get learning statistics |
| POST | /ai/train | Trigger manual training |
| GET | /ai/weights | Get current active weights |
| POST | /ai/similarity | Calculate combined similarity |
| GET | /ai/config | Get AI configuration |
| PUT | /ai/config | Update AI configuration |

## Files Modified/Created

### New Files
- `server/services/AILearningService.js` - Main learning service
- `server/scripts/run-ai-migration-v2.js` - Database migration script
- `server/scripts/test-ai-learning.js` - Test script
- `server/scripts/create-ai-learning-system.sql` - SQL schema

### Modified Files
- `server/routes/divisionMergeRules.js` - Added learning capture on approve/reject + API endpoints

## How It Works

1. **Admin Approves/Rejects a Suggestion**
   - The route handler calls `AILearningService.recordSuggestionDecision()`
   - All customer pairs in the suggestion are extracted
   - Each pair's similarity is calculated using CustomerMergingAI
   - Data is stored in `fp_ai_learning_data` or `hc_ai_learning_data`

2. **Pending Decisions Counter Increments**
   - When it reaches 50 (threshold), auto-training triggers

3. **Training Process**
   - Load all APPROVED/REJECTED samples
   - Split 80% training / 20% validation
   - Run gradient descent to optimize weights
   - If accuracy improves by 2%+, save new weights
   - New weights become active for future scans

## Testing

```bash
# Run the test script
node server/scripts/test-ai-learning.js

# Check stats via API (after starting servers)
curl http://localhost:5000/api/fp/merge-rules/ai/stats
```

## Current Initial Weights (Version 1)

- Levenshtein: 18%
- Jaro-Winkler: 22%
- TokenSet: 20%
- N-Gram: 12%
- CoreBrand: 10%
- Phonetic: 8%
- Suffix: 10%

## Next Steps

1. Let admins make decisions for a while
2. Monitor learning stats via API
3. Review training history to see improvements
4. Adjust thresholds if needed
