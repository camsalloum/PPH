/**
 * AI Learning Service
 * 
 * Self-learning AI system that improves from admin feedback.
 * 
 * Features:
 * - Captures learning data from every approve/reject decision
 * - Optimizes algorithm weights using gradient descent
 * - Tracks training history and model versions
 * - Supports transaction-based similarity scoring
 * 
 * @version 1.0
 * @author AI Learning System
 */

const { pool } = require('../database/config');
const { getDivisionPool } = require('../utils/divisionDatabaseManager');
const logger = require('../utils/logger');

class AILearningService {
  constructor() {
    this.pool = pool;
    
    // Default weights (will be overridden by database)
    this.defaultWeights = {
      levenshtein: 0.10,
      jaroWinkler: 0.10,
      tokenSet: 0.15,
      nGramPrefix: 0.23,
      coreBrand: 0.22,
      phonetic: 0.12,
      suffix: 0.08
    };
    
    // Learning hyperparameters
    this.learningConfig = {
      learningRate: 0.01,
      maxIterations: 1000,
      convergenceThreshold: 0.0001,
      regularization: 0.001,  // L2 regularization to prevent overfitting
      minSamples: 20,         // Minimum samples before training
      validationSplit: 0.2    // 20% for validation
    };
  }

  // ===========================================================================
  // TABLE HELPERS
  // ===========================================================================

  getTableNames(division) {
    const code = division.split('-')[0].toLowerCase();
    return {
      learningData: `${code}_ai_learning_data`,
      modelWeights: `${code}_ai_model_weights`,
      trainingHistory: `${code}_ai_training_history`,
      transactionSimilarity: `${code}_transaction_similarity_cache`,
      suggestions: `${code}_merge_rule_suggestions`
    };
  }

  getDivisionPool(division) {
    const code = division.split('-')[0].toUpperCase();
    return getDivisionPool(code);
  }

  // ===========================================================================
  // PHASE 1: CAPTURE LEARNING DATA
  // ===========================================================================

  /**
   * Record a learning sample when admin makes a decision
   * Called automatically on approve/reject/modify
   */
  async recordLearningData(division, customer1, customer2, similarityResult, decision, options = {}) {
    const divisionPool = this.getDivisionPool(division);
    const tables = this.getTableNames(division);

    try {
      const details = similarityResult.details || {};
      
      // Get pair_id from options or generate one
      const pairId = options.pairId || Date.now();

      const query = `
        INSERT INTO ${tables.learningData} (
          pair_id,
          customer1_id, customer1_name,
          customer2_id, customer2_name,
          decision,
          combined_score,
          levenshtein_score, jarowinkler_score, tokenset_score,
          ngram_score, corebrand_score, phonetic_score, suffix_score,
          decided_by, decided_at,
          features,
          processed_for_training
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, $12, $13, $14,
          $15, CURRENT_TIMESTAMP,
          $16, FALSE
        )
        RETURNING id
      `;

      // Build features JSON with additional context
      const features = {
        normalized1: details.normalized1 || customer1.toLowerCase(),
        normalized2: details.normalized2 || customer2.toLowerCase(),
        isPrefixMatch: (details.normalized1 || customer1.toLowerCase()).startsWith(details.normalized2 || customer2.toLowerCase()),
        isSubstringMatch: (details.normalized1 || customer1.toLowerCase()).includes(details.normalized2 || customer2.toLowerCase()),
        lengthRatio: Math.min(customer1.length, customer2.length) / Math.max(customer1.length, customer2.length),
        wordCountDiff: Math.abs(customer1.split(' ').length - customer2.split(' ').length),
        penalties: similarityResult.penalties || {},
        uniqueAnalysis: similarityResult.uniqueAnalysis || {},
        source: options.source || 'UNKNOWN',
        suggestionId: options.suggestionId || null,
        ruleId: options.ruleId || null
      };

      const params = [
        pairId,
        options.customer1Id || null,
        customer1,
        options.customer2Id || null,
        customer2,
        decision,
        similarityResult.score || 0,
        parseFloat(details.levenshtein) || 0,
        parseFloat(details.jaroWinkler) || 0,
        parseFloat(details.tokenSet) || 0,
        parseFloat(details.nGramPrefix) || 0,
        parseFloat(details.coreBrand) || 0,
        parseFloat(details.phonetic) || 0,
        parseFloat(details.withoutSuffix) || 0,
        options.decidedBy || null,
        JSON.stringify(features)
      ];

      const result = await divisionPool.query(query, params);
      
      // Increment pending decisions counter
      await this.incrementPendingDecisions();
      
      // Check if auto-retrain should be triggered
      const shouldRetrain = await this.shouldTriggerRetraining();
      if (shouldRetrain) {
        logger.info('🎓 Auto-retraining threshold reached, triggering training...');
        // Don't await - let it run in background
        this.trainModel(division, { triggeredBy: 'AUTO', triggerReason: 'THRESHOLD_REACHED' })
          .catch(err => logger.error('Auto-training failed:', err));
      }

      logger.info(`📊 Learning data recorded: ${customer1} vs ${customer2} = ${decision}`);
      return result.rows[0].id;

    } catch (error) {
      logger.error('Error recording learning data:', error);
      throw error;
    }
  }

  /**
   * Record learning data for all pairs in a suggestion
   * Called when a multi-customer suggestion is approved/rejected
   */
  async recordSuggestionDecision(division, suggestion, decision, options = {}) {
    try {
      const CustomerMergingAI = require('./CustomerMergingAI');
      const customers = suggestion.customer_group || [];
      
      if (!Array.isArray(customers) || customers.length < 2) {
        logger.warn('recordSuggestionDecision: Not enough customers in suggestion');
        return;
      }
      
      // Generate all pairs and record each
      for (let i = 0; i < customers.length; i++) {
        for (let j = i + 1; j < customers.length; j++) {
          try {
            const similarity = CustomerMergingAI.calculateSimilarity(customers[i], customers[j]);
            await this.recordLearningData(
              division,
              customers[i],
              customers[j],
              similarity,
              decision,
              {
                ...options,
                suggestionId: suggestion.id
              }
            );
          } catch (pairError) {
            // Log but don't fail on individual pair errors
            logger.warn(`Failed to record learning for pair ${customers[i]} vs ${customers[j]}:`, pairError.message);
          }
        }
      }
    } catch (error) {
      // Catch-all to prevent crashes
      logger.error('recordSuggestionDecision failed:', error.message);
    }
  }

  // ===========================================================================
  // PHASE 2: WEIGHT OPTIMIZATION (Gradient Descent)
  // ===========================================================================

  /**
   * Train the model using collected learning data
   * Uses gradient descent to optimize weights
   */
  async trainModel(division, options = {}) {
    const divisionPool = this.getDivisionPool(division);
    const tables = this.getTableNames(division);
    const startTime = Date.now();

    logger.info(`\n🎓 Starting AI training for division: ${division}`);

    try {
      // 1. Load training data
      const dataResult = await divisionPool.query(`
        SELECT * FROM ${tables.learningData}
        WHERE decision IN ('APPROVED', 'REJECTED')
        ORDER BY decided_at DESC
      `);

      const samples = dataResult.rows;
      
      if (samples.length < this.learningConfig.minSamples) {
        logger.info(`⚠️ Not enough samples (${samples.length}/${this.learningConfig.minSamples}). Skipping training.`);
        return {
          success: false,
          reason: 'INSUFFICIENT_DATA',
          sampleCount: samples.length,
          required: this.learningConfig.minSamples
        };
      }

      logger.info(`📊 Loaded ${samples.length} training samples`);

      // 2. Prepare training data
      const { trainSet, validSet } = this.splitData(samples);
      logger.info(`   Training: ${trainSet.length}, Validation: ${validSet.length}`);

      // 3. Get current weights
      const currentWeights = await this.getActiveWeights(division);
      let weights = { ...currentWeights.weights };
      
      // 4. Calculate initial accuracy
      const initialAccuracy = this.calculateAccuracy(validSet, weights);
      logger.info(`   Initial accuracy: ${(initialAccuracy * 100).toFixed(2)}%`);

      // 5. Gradient descent optimization
      const optimizedWeights = this.gradientDescent(trainSet, weights);

      // 6. Calculate new accuracy
      const newAccuracy = this.calculateAccuracy(validSet, optimizedWeights);
      logger.info(`   Optimized accuracy: ${(newAccuracy * 100).toFixed(2)}%`);

      const improvement = newAccuracy - initialAccuracy;
      logger.info(`   Improvement: ${(improvement * 100).toFixed(2)}%`);

      // 7. Get min improvement threshold
      const minImprovement = await this.getConfig('min_improvement_threshold') || 0.02;

      // 8. Save training history
      const historyId = await this.saveTrainingHistory(division, {
        triggeredBy: options.triggeredBy || 'MANUAL',
        triggerReason: options.triggerReason || 'MANUAL',
        totalSamples: samples.length,
        approvedSamples: samples.filter(s => s.decision === 'APPROVED').length,
        rejectedSamples: samples.filter(s => s.decision === 'REJECTED').length,
        oldWeightsVersion: currentWeights.version,
        oldAccuracy: initialAccuracy,
        newAccuracy: newAccuracy,
        improvement,
        algorithmUsed: 'GRADIENT_DESCENT',
        iterations: this.learningConfig.maxIterations,
        learningRate: this.learningConfig.learningRate,
        status: improvement >= minImprovement ? 'SUCCESS' : 'NO_IMPROVEMENT',
        activated: improvement >= minImprovement
      });

      // 9. If improvement is significant, save new weights
      if (improvement >= minImprovement) {
        const newVersion = currentWeights.version + 1;
        await this.saveWeights(division, optimizedWeights, newVersion, {
          accuracy: newAccuracy,
          trainingSamples: samples.length,
          approvedSamples: samples.filter(s => s.decision === 'APPROVED').length,
          rejectedSamples: samples.filter(s => s.decision === 'REJECTED').length
        });
        
        // Reset pending decisions counter
        await this.resetPendingDecisions();
        
        logger.info(`✅ New weights saved (v${newVersion}) and activated!`);
      } else {
        logger.info(`⚠️ Improvement too small (${(improvement * 100).toFixed(2)}% < ${(minImprovement * 100).toFixed(2)}%). Keeping current weights.`);
      }

      const duration = (Date.now() - startTime) / 1000;
      logger.info(`⏱️ Training completed in ${duration.toFixed(2)}s\n`);

      return {
        success: true,
        sampleCount: samples.length,
        initialAccuracy,
        newAccuracy,
        improvement,
        activated: improvement >= minImprovement,
        duration,
        historyId
      };

    } catch (error) {
      logger.error('Training failed:', error);
      throw error;
    }
  }

  /**
   * Gradient descent optimization for weights
   */
  gradientDescent(trainSet, initialWeights) {
    const weightKeys = ['levenshtein', 'jaroWinkler', 'tokenSet', 'nGramPrefix', 'coreBrand', 'phonetic', 'suffix'];
    let weights = { ...initialWeights };
    
    const { learningRate, maxIterations, convergenceThreshold, regularization } = this.learningConfig;

    for (let iter = 0; iter < maxIterations; iter++) {
      const gradients = {};
      let totalLoss = 0;

      // Initialize gradients
      weightKeys.forEach(key => { gradients[key] = 0; });

      // Calculate gradients for each sample
      for (const sample of trainSet) {
        // Get feature scores
        const features = this.extractFeatures(sample);
        
        // Calculate predicted score with current weights
        const predicted = this.calculateWeightedScore(features, weights);
        
        // Target: 1 for APPROVED, 0 for REJECTED
        const target = sample.decision === 'APPROVED' ? 1 : 0;
        
        // Error
        const error = predicted - target;
        totalLoss += error * error;

        // Update gradients (gradient of MSE)
        weightKeys.forEach(key => {
          const featureKey = this.mapWeightKeyToFeature(key);
          gradients[key] += 2 * error * (features[featureKey] || 0);
        });
      }

      // Average gradients
      const n = trainSet.length;
      weightKeys.forEach(key => {
        gradients[key] /= n;
        // Add L2 regularization
        gradients[key] += regularization * weights[key];
      });

      // Update weights
      let maxGradient = 0;
      weightKeys.forEach(key => {
        const oldWeight = weights[key];
        weights[key] = Math.max(0.01, weights[key] - learningRate * gradients[key]);
        maxGradient = Math.max(maxGradient, Math.abs(weights[key] - oldWeight));
      });

      // Normalize weights to sum to 1
      weights = this.normalizeWeights(weights, weightKeys);

      // Check convergence
      if (maxGradient < convergenceThreshold) {
        logger.info(`   Converged at iteration ${iter}`);
        break;
      }
    }

    return weights;
  }

  /**
   * Extract features from a learning sample
   */
  extractFeatures(sample) {
    return {
      levenshtein: parseFloat(sample.levenshtein_score) || 0,
      jaroWinkler: parseFloat(sample.jarowinkler_score) || 0,
      tokenSet: parseFloat(sample.tokenset_score) || 0,
      nGramPrefix: parseFloat(sample.ngram_score) || 0,
      coreBrand: parseFloat(sample.corebrand_score) || 0,
      phonetic: parseFloat(sample.phonetic_score) || 0,
      suffix: parseFloat(sample.suffix_score) || 0
    };
  }

  /**
   * Map weight key to feature key
   */
  mapWeightKeyToFeature(weightKey) {
    const mapping = {
      'levenshtein': 'levenshtein',
      'jaroWinkler': 'jaroWinkler',
      'tokenSet': 'tokenSet',
      'nGramPrefix': 'nGramPrefix',
      'coreBrand': 'coreBrand',
      'phonetic': 'phonetic',
      'suffix': 'suffix'
    };
    return mapping[weightKey] || weightKey;
  }

  /**
   * Calculate weighted score from features
   */
  calculateWeightedScore(features, weights) {
    return (
      (features.levenshtein || 0) * (weights.levenshtein || 0) +
      (features.jaroWinkler || 0) * (weights.jaroWinkler || 0) +
      (features.tokenSet || 0) * (weights.tokenSet || 0) +
      (features.nGramPrefix || 0) * (weights.nGramPrefix || 0) +
      (features.coreBrand || 0) * (weights.coreBrand || 0) +
      (features.phonetic || 0) * (weights.phonetic || 0) +
      (features.suffix || 0) * (weights.suffix || 0)
    );
  }

  /**
   * Normalize weights to sum to 1.0
   */
  normalizeWeights(weights, keys) {
    const sum = keys.reduce((acc, key) => acc + (weights[key] || 0), 0);
    if (sum === 0) return weights;
    
    const normalized = { ...weights };
    keys.forEach(key => {
      normalized[key] = weights[key] / sum;
    });
    return normalized;
  }

  /**
   * Calculate accuracy on validation set
   */
  calculateAccuracy(validSet, weights) {
    let correct = 0;
    const threshold = 0.5; // Decision threshold

    for (const sample of validSet) {
      const features = this.extractFeatures(sample);
      const predicted = this.calculateWeightedScore(features, weights);
      const predictedLabel = predicted >= threshold ? 'APPROVED' : 'REJECTED';
      
      if (predictedLabel === sample.human_decision) {
        correct++;
      }
    }

    return validSet.length > 0 ? correct / validSet.length : 0;
  }

  /**
   * Split data into training and validation sets
   */
  splitData(samples) {
    const shuffled = [...samples].sort(() => Math.random() - 0.5);
    const splitIdx = Math.floor(shuffled.length * (1 - this.learningConfig.validationSplit));
    
    return {
      trainSet: shuffled.slice(0, splitIdx),
      validSet: shuffled.slice(splitIdx)
    };
  }

  // ===========================================================================
  // PHASE 3: TRANSACTION-BASED SIMILARITY
  // ===========================================================================

  /**
   * Calculate transaction-based similarity between two customers
   * Based on shared products, sales reps, countries, etc.
   */
  async calculateTransactionSimilarity(division, customer1, customer2) {
    const divisionPool = this.getDivisionPool(division);
    const code = division.split('-')[0].toLowerCase();
    const dataTable = `${code}_actualcommon`;

    try {
      // Get products for each customer
      const c1Products = await divisionPool.query(`
        SELECT DISTINCT material FROM ${dataTable}
        WHERE LOWER(TRIM(customer)) = LOWER(TRIM($1))
      `, [customer1]);

      const c2Products = await divisionPool.query(`
        SELECT DISTINCT material FROM ${dataTable}
        WHERE LOWER(TRIM(customer)) = LOWER(TRIM($1))
      `, [customer2]);

      const products1 = new Set(c1Products.rows.map(r => r.material));
      const products2 = new Set(c2Products.rows.map(r => r.material));
      
      // Calculate Jaccard similarity for products
      const sharedProducts = [...products1].filter(p => products2.has(p));
      const unionProducts = new Set([...products1, ...products2]);
      const productSimilarity = unionProducts.size > 0 
        ? sharedProducts.length / unionProducts.size 
        : 0;

      // Get sales reps for each customer
      const c1Reps = await divisionPool.query(`
        SELECT DISTINCT sales_representative FROM ${dataTable}
        WHERE LOWER(TRIM(customer)) = LOWER(TRIM($1))
      `, [customer1]);

      const c2Reps = await divisionPool.query(`
        SELECT DISTINCT sales_representative FROM ${dataTable}
        WHERE LOWER(TRIM(customer)) = LOWER(TRIM($1))
      `, [customer2]);

      const reps1 = new Set(c1Reps.rows.map(r => r.sales_representative));
      const reps2 = new Set(c2Reps.rows.map(r => r.sales_representative));
      const sharedReps = [...reps1].filter(r => reps2.has(r));
      const repSimilarity = (reps1.size + reps2.size) > 0
        ? (sharedReps.length * 2) / (reps1.size + reps2.size)
        : 0;

      // Get countries for each customer
      const c1Countries = await divisionPool.query(`
        SELECT DISTINCT country FROM ${dataTable}
        WHERE LOWER(TRIM(customer)) = LOWER(TRIM($1))
      `, [customer1]);

      const c2Countries = await divisionPool.query(`
        SELECT DISTINCT country FROM ${dataTable}
        WHERE LOWER(TRIM(customer)) = LOWER(TRIM($1))
      `, [customer2]);

      const countries1 = new Set(c1Countries.rows.map(r => r.country));
      const countries2 = new Set(c2Countries.rows.map(r => r.country));
      const sharedCountries = [...countries1].filter(c => countries2.has(c));
      const countrySimilarity = sharedCountries.length > 0 ? 1 : 0;

      // Combined score (weighted average)
      const combinedScore = (
        productSimilarity * 0.50 +  // Products most important
        repSimilarity * 0.30 +      // Sales rep important
        countrySimilarity * 0.20    // Country less important
      );

      return {
        productSimilarity,
        repSimilarity,
        countrySimilarity,
        sharedProducts: sharedProducts.length,
        sharedReps: sharedReps.length,
        sharedCountries: sharedCountries.length,
        combinedScore
      };

    } catch (error) {
      logger.error('Error calculating transaction similarity:', error);
      return { combinedScore: 0, error: error.message };
    }
  }

  /**
   * Get combined similarity (name + transaction)
   */
  async getCombinedSimilarity(division, customer1, customer2) {
    const CustomerMergingAI = require('./CustomerMergingAI');
    
    // Name-based similarity
    const nameSimilarity = CustomerMergingAI.calculateSimilarity(customer1, customer2);
    
    // Transaction-based similarity
    const txnSimilarity = await this.calculateTransactionSimilarity(division, customer1, customer2);
    
    // Get transaction weight from config
    const txnWeight = parseFloat(await this.getConfig('transaction_similarity_weight') || 0.15);
    const nameWeight = 1 - txnWeight;
    
    // Combined score
    const combinedScore = (
      nameSimilarity.score * nameWeight +
      txnSimilarity.combinedScore * txnWeight
    );

    return {
      nameSimilarity: nameSimilarity.score,
      transactionSimilarity: txnSimilarity.combinedScore,
      combinedScore,
      details: {
        name: nameSimilarity.details,
        transaction: txnSimilarity
      }
    };
  }

  // ===========================================================================
  // WEIGHTS MANAGEMENT
  // ===========================================================================

  /**
   * Get currently active weights for a division
   */
  async getActiveWeights(division) {
    const divisionPool = this.getDivisionPool(division);
    const tables = this.getTableNames(division);

    try {
      const result = await divisionPool.query(`
        SELECT * FROM ${tables.modelWeights}
        WHERE is_active = TRUE
        ORDER BY version DESC
      `);

      if (result.rows.length === 0) {
        return {
          version: 1,
          weights: { ...this.defaultWeights }
        };
      }

      // Convert rows to weights object
      const weights = {};
      let version = 1;
      let metadata = {};
      
      for (const row of result.rows) {
        weights[row.algorithm_name] = parseFloat(row.weight);
        version = Math.max(version, row.version);
        metadata = {
          trainedAt: row.trained_at,
          accuracy: row.performance_score,
          trainingSamples: row.training_samples
        };
      }

      // Ensure we have all weights (map to consistent naming)
      return {
        version,
        weights: {
          levenshtein: weights.levenshtein || this.defaultWeights.levenshtein,
          jaroWinkler: weights.jarowinkler || weights.jaroWinkler || this.defaultWeights.jaroWinkler,
          tokenSet: weights.tokenset || weights.tokenSet || this.defaultWeights.tokenSet,
          nGramPrefix: weights.ngram || weights.nGramPrefix || this.defaultWeights.nGramPrefix,
          coreBrand: weights.corebrand || weights.coreBrand || this.defaultWeights.coreBrand,
          phonetic: weights.phonetic || this.defaultWeights.phonetic,
          suffix: weights.suffix || this.defaultWeights.suffix
        },
        metadata
      };

    } catch (error) {
      logger.error('Error getting active weights:', error);
      return {
        version: 1,
        weights: { ...this.defaultWeights }
      };
    }
  }

  /**
   * Save new weights to database
   */
  async saveWeights(division, weights, version, stats = {}) {
    const divisionPool = this.getDivisionPool(division);
    const tables = this.getTableNames(division);

    try {
      // Deactivate current weights
      await divisionPool.query(`
        UPDATE ${tables.modelWeights}
        SET is_active = FALSE
        WHERE is_active = TRUE
      `);

      // Map weight names to database column names
      const weightMap = {
        levenshtein: 'levenshtein',
        jaroWinkler: 'jarowinkler',
        tokenSet: 'tokenset',
        nGramPrefix: 'ngram',
        coreBrand: 'corebrand',
        phonetic: 'phonetic',
        suffix: 'suffix'
      };

      // Insert new weights - one row per algorithm
      for (const [key, dbName] of Object.entries(weightMap)) {
        await divisionPool.query(`
          INSERT INTO ${tables.modelWeights} (
            version, algorithm_name, weight, previous_weight,
            is_active, trained_at, training_samples, performance_score
          ) VALUES (
            $1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP, $5, $6
          )
          ON CONFLICT (version, algorithm_name) DO UPDATE SET
            weight = EXCLUDED.weight,
            is_active = TRUE,
            trained_at = CURRENT_TIMESTAMP
        `, [
          version,
          dbName,
          weights[key] || this.defaultWeights[key],
          this.defaultWeights[key],
          stats.trainingSamples || 0,
          stats.accuracy || 0
        ]);
      }

      logger.info(`💾 Saved weights v${version} for ${division}`);

    } catch (error) {
      logger.error('Error saving weights:', error);
      throw error;
    }
  }

  // ===========================================================================
  // TRAINING HISTORY
  // ===========================================================================

  async saveTrainingHistory(division, data) {
    const divisionPool = this.getDivisionPool(division);
    const tables = this.getTableNames(division);

    const result = await divisionPool.query(`
      INSERT INTO ${tables.trainingHistory} (
        started_at, completed_at,
        samples_used, epochs_run,
        initial_loss, final_loss,
        improvement_percentage,
        precision_before, precision_after,
        weights_snapshot,
        status, triggered_by, error_message
      ) VALUES (
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
        $1, $2,
        $3, $4,
        $5,
        $6, $7,
        $8,
        $9, $10, $11
      )
      RETURNING id
    `, [
      data.totalSamples,
      data.iterations || 1000,
      1 - data.oldAccuracy,  // Loss = 1 - accuracy
      1 - data.newAccuracy,
      data.improvement * 100,  // Store as percentage
      data.oldAccuracy,
      data.newAccuracy,
      JSON.stringify({
        triggeredBy: data.triggeredBy,
        triggerReason: data.triggerReason,
        oldVersion: data.oldWeightsVersion,
        newVersion: data.oldWeightsVersion + 1,
        approved: data.approvedSamples,
        rejected: data.rejectedSamples,
        activated: data.activated
      }),
      data.status === 'SUCCESS' ? 'completed' : (data.status === 'NO_IMPROVEMENT' ? 'completed' : 'failed'),
      data.triggeredBy || 'manual',
      null
    ]);

    return result.rows[0].id;
  }

  // ===========================================================================
  // CONFIGURATION HELPERS
  // ===========================================================================

  async getConfig(key) {
    try {
      const result = await this.pool.query(`
        SELECT value FROM ai_configuration WHERE key = $1
      `, [key]);
      return result.rows[0]?.value || null;
    } catch (error) {
      return null;
    }
  }

  async setConfig(key, value, updatedBy = 'SYSTEM') {
    await this.pool.query(`
      INSERT INTO ai_configuration (key, value, updated_at)
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE SET
        value = $2,
        updated_at = CURRENT_TIMESTAMP
    `, [key, value.toString()]);
  }

  async incrementPendingDecisions() {
    try {
      // Get current value and increment it
      const current = await this.getConfig('pending_decisions') || '0';
      const newValue = parseInt(current) + 1;
      await this.setConfig('pending_decisions', newValue.toString(), 'SYSTEM');
    } catch (error) {
      logger.warn('Could not increment pending decisions:', error.message);
    }
  }

  async resetPendingDecisions() {
    await this.setConfig('pending_decisions', '0', 'SYSTEM');
    await this.setConfig('last_training_date', new Date().toISOString(), 'SYSTEM');
  }

  async shouldTriggerRetraining() {
    try {
      const pending = parseInt(await this.getConfig('pending_decisions') || '0');
      const threshold = parseInt(await this.getConfig('auto_retrain_threshold') || '50');
      return pending >= threshold;
    } catch (error) {
      return false;
    }
  }

  // ===========================================================================
  // STATISTICS & REPORTING
  // ===========================================================================

  /**
   * Get learning statistics for a division
   */
  async getLearningStats(division) {
    const divisionPool = this.getDivisionPool(division);
    const tables = this.getTableNames(division);

    try {
      // Total samples
      const totalResult = await divisionPool.query(`
        SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE decision = 'APPROVED') as approved,
          COUNT(*) FILTER (WHERE decision = 'REJECTED') as rejected,
          COUNT(*) FILTER (WHERE decision = 'SKIPPED') as skipped
        FROM ${tables.learningData}
      `);

      // Active weights
      const weightsResult = await divisionPool.query(`
        SELECT version, performance_score as accuracy, training_samples, trained_at
        FROM ${tables.modelWeights}
        WHERE is_active = TRUE
        LIMIT 1
      `);

      // Training history
      const historyResult = await divisionPool.query(`
        SELECT id, status, improvement_percentage as improvement, completed_at
        FROM ${tables.trainingHistory}
        ORDER BY completed_at DESC
        LIMIT 5
      `);

      // Pending decisions
      const pending = await this.getConfig('pending_decisions') || '0';
      const threshold = await this.getConfig('auto_retrain_threshold') || '50';

      return {
        samples: totalResult.rows[0],
        activeWeights: weightsResult.rows[0] || { version: 1, accuracy: null },
        recentTraining: historyResult.rows,
        pendingDecisions: parseInt(pending),
        retrainThreshold: parseInt(threshold),
        progressToRetrain: Math.min(100, (parseInt(pending) / parseInt(threshold)) * 100)
      };

    } catch (error) {
      logger.error('Error getting learning stats:', error);
      return null;
    }
  }
}

// Export singleton instance
module.exports = new AILearningService();
