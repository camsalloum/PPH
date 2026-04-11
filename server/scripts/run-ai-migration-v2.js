/**
 * AI Learning System Migration - Direct Table Creation
 * Creates all necessary tables for the self-learning AI
 */

const { pool } = require('../database/config');

async function runMigration() {
  console.log('🔧 Creating AI Learning System tables...\n');
  
  try {
    // =======================
    // CORE TABLES
    // =======================
    
    // 1. AI Learning Data
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_learning_data (
        id SERIAL PRIMARY KEY,
        pair_id INTEGER NOT NULL,
        customer1_id INTEGER NOT NULL,
        customer1_name TEXT NOT NULL,
        customer2_id INTEGER,
        customer2_name TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('APPROVED', 'REJECTED', 'SKIPPED')),
        combined_score DECIMAL(5,2),
        levenshtein_score DECIMAL(5,2),
        jarowinkler_score DECIMAL(5,2),
        tokenset_score DECIMAL(5,2),
        ngram_score DECIMAL(5,2),
        corebrand_score DECIMAL(5,2),
        phonetic_score DECIMAL(5,2),
        suffix_score DECIMAL(5,2),
        decided_by INTEGER,
        decided_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        features JSONB DEFAULT '{}',
        processed_for_training BOOLEAN DEFAULT FALSE,
        training_batch_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created table: ai_learning_data');
    
    // 2. AI Model Weights
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_model_weights (
        id SERIAL PRIMARY KEY,
        version INTEGER NOT NULL,
        algorithm_name TEXT NOT NULL,
        weight DECIMAL(5,4) NOT NULL,
        previous_weight DECIMAL(5,4),
        is_active BOOLEAN DEFAULT TRUE,
        trained_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        training_samples INTEGER DEFAULT 0,
        performance_score DECIMAL(5,4),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(version, algorithm_name)
      )
    `);
    console.log('✅ Created table: ai_model_weights');
    
    // 3. AI Training History
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_training_history (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP,
        samples_used INTEGER,
        epochs_run INTEGER,
        initial_loss DECIMAL(10,6),
        final_loss DECIMAL(10,6),
        improvement_percentage DECIMAL(5,2),
        precision_before DECIMAL(5,4),
        precision_after DECIMAL(5,4),
        recall_before DECIMAL(5,4),
        recall_after DECIMAL(5,4),
        weights_snapshot JSONB,
        status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'insufficient_data')),
        error_message TEXT,
        triggered_by TEXT DEFAULT 'manual'
      )
    `);
    console.log('✅ Created table: ai_training_history');
    
    // 4. Transaction Similarity Cache
    await pool.query(`
      CREATE TABLE IF NOT EXISTS transaction_similarity_cache (
        id SERIAL PRIMARY KEY,
        customer1_id INTEGER NOT NULL,
        customer2_id INTEGER NOT NULL,
        shared_materials INTEGER DEFAULT 0,
        shared_countries INTEGER DEFAULT 0,
        shared_salesreps INTEGER DEFAULT 0,
        shared_channels INTEGER DEFAULT 0,
        price_variance DECIMAL(5,4),
        transaction_similarity DECIMAL(5,4),
        calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(customer1_id, customer2_id)
      )
    `);
    console.log('✅ Created table: transaction_similarity_cache');
    
    // 5. AI Configuration
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_configuration (
        id SERIAL PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        description TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Created table: ai_configuration');
    
    // =======================
    // INDEXES
    // =======================
    console.log('\n📇 Creating indexes...');
    
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_learning_decision ON ai_learning_data(decision)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_learning_processed ON ai_learning_data(processed_for_training)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_learning_created ON ai_learning_data(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_txn_cache_customers ON transaction_similarity_cache(customer1_id, customer2_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_weights_active ON ai_model_weights(is_active)`);
    console.log('✅ All indexes created');
    
    // =======================
    // DEFAULT CONFIGURATION
    // =======================
    console.log('\n⚙️ Setting up default configuration...');
    
    const configs = [
      { key: 'auto_retrain_threshold', value: '50', desc: 'Number of decisions before auto-retraining' },
      { key: 'min_training_samples', value: '20', desc: 'Minimum samples needed to train' },
      { key: 'min_improvement_threshold', value: '0.02', desc: 'Minimum improvement to accept new weights' },
      { key: 'transaction_similarity_weight', value: '0.15', desc: 'Weight for transaction-based similarity' },
      { key: 'learning_enabled', value: 'true', desc: 'Whether AI learning is enabled' },
      { key: 'last_training_date', value: '', desc: 'Timestamp of last training' },
      { key: 'pending_decisions', value: '0', desc: 'Decisions since last training' }
    ];
    
    for (const cfg of configs) {
      await pool.query(`
        INSERT INTO ai_configuration (key, value, description) 
        VALUES ($1, $2, $3) 
        ON CONFLICT (key) DO NOTHING
      `, [cfg.key, cfg.value, cfg.desc]);
    }
    console.log('✅ Default configuration set');
    
    // =======================
    // INITIAL WEIGHTS (Version 1)
    // =======================
    console.log('\n⚖️ Setting up initial weights (Version 1)...');
    
    const weights = [
      { name: 'levenshtein', weight: 0.18 },
      { name: 'jarowinkler', weight: 0.22 },
      { name: 'tokenset', weight: 0.20 },
      { name: 'ngram', weight: 0.12 },
      { name: 'corebrand', weight: 0.10 },
      { name: 'phonetic', weight: 0.08 },
      { name: 'suffix', weight: 0.10 }
    ];
    
    for (const w of weights) {
      await pool.query(`
        INSERT INTO ai_model_weights (version, algorithm_name, weight, is_active) 
        VALUES (1, $1, $2, true) 
        ON CONFLICT (version, algorithm_name) DO NOTHING
      `, [w.name, w.weight]);
    }
    console.log('✅ Initial weights set');
    
    // =======================
    // DIVISION-SPECIFIC TABLES (Dynamic from company_settings)
    // =======================
    console.log('\n📊 Creating division-specific tables...');
    
    // Get active divisions from company_settings instead of hardcoding
    let divisions = ['fp']; // FP is always required
    try {
      const divResult = await pool.query(`
        SELECT setting_value FROM company_settings WHERE setting_key = 'divisions'
      `);
      if (divResult.rows.length > 0 && divResult.rows[0].setting_value) {
        const activeDivisions = divResult.rows[0].setting_value;
        if (Array.isArray(activeDivisions)) {
          divisions = activeDivisions.map(d => d.code.toLowerCase());
        }
      }
    } catch (e) {
      console.log('⚠️ Could not fetch divisions from settings, using FP only');
    }
    
    console.log(`  Active divisions: ${divisions.map(d => d.toUpperCase()).join(', ')}`);
    
    for (const div of divisions) {
      // Learning data
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${div}_ai_learning_data (
          LIKE ai_learning_data INCLUDING ALL
        )
      `);
      
      // Model weights
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${div}_ai_model_weights (
          LIKE ai_model_weights INCLUDING ALL
        )
      `);
      
      // Training history
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${div}_ai_training_history (
          LIKE ai_training_history INCLUDING ALL
        )
      `);
      
      // Transaction cache
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ${div}_transaction_similarity_cache (
          LIKE transaction_similarity_cache INCLUDING ALL
        )
      `);
      
      console.log(`✅ Created ${div.toUpperCase()} division tables`);
    }
    
    // =======================
    // VERIFICATION
    // =======================
    console.log('\n=================================');
    console.log('📋 Verifying AI/Learning Tables:');
    console.log('=================================');
    
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%ai_%' OR table_name LIKE '%learning%' OR table_name LIKE '%similarity%')
      ORDER BY table_name
    `);
    
    tables.rows.forEach(r => console.log('  ✓', r.table_name));
    
    console.log('\n⚙️ Current Configuration:');
    const config = await pool.query(`SELECT key, value FROM ai_configuration ORDER BY key`);
    config.rows.forEach(r => console.log(`  - ${r.key}: ${r.value || '(not set)'}`));
    
    console.log('\n⚖️ Active Weights (Version 1):');
    const activeWeights = await pool.query(`
      SELECT algorithm_name, weight FROM ai_model_weights 
      WHERE is_active = true ORDER BY algorithm_name
    `);
    activeWeights.rows.forEach(r => console.log(`  - ${r.algorithm_name}: ${(r.weight * 100).toFixed(1)}%`));
    
    console.log('\n✅ AI Learning System migration completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
