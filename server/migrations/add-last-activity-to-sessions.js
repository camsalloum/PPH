/**
 * Database Migration: Add last_activity to user_sessions
 * Supports refresh token tracking without idle timeout
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

async function migrateUserSessions() {
  const client = await authPool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Check if last_activity column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user_sessions' 
      AND column_name = 'last_activity'
    `);
    
    if (columnCheck.rows.length === 0) {
      logger.info('Adding last_activity column to user_sessions...');
      
      // Add last_activity column
      await client.query(`
        ALTER TABLE user_sessions 
        ADD COLUMN last_activity TIMESTAMP DEFAULT NOW()
      `);
      
      logger.info('✅ Added last_activity column');
    } else {
      logger.info('last_activity column already exists');
    }
    
    // Update existing sessions to have last_activity
    await client.query(`
      UPDATE user_sessions 
      SET last_activity = created_at 
      WHERE last_activity IS NULL
    `);
    
    await client.query('COMMIT');
    logger.info('✅ User sessions migration complete');
    
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateUserSessions()
    .then(() => {
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateUserSessions };
