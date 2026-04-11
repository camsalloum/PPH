/**
 * Database Migration: Add theme_settings JSONB column to user_preferences
 * 
 * This migration adds a theme_settings column to store all theme-related settings:
 * - theme (current theme name)
 * - styleMode (flat/soft/glass)
 * - animationMode (none/subtle/smooth/playful)
 * - customColors (per-theme color overrides)
 * - effectSettings (shadow, radius, animation, hover settings)
 * 
 * Run with: node scripts/add-theme-settings-column.js
 */

const { Pool } = require('pg');
const path = require('path');

// Use same database config as main server
const authPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.AUTH_DB_NAME || 'ip_auth_database',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '***REDACTED***',
});

async function migrate() {
  const client = await authPool.connect();
  
  try {
    console.log('🚀 Starting migration: Adding theme_settings column...\n');
    
    await client.query('BEGIN');

    // Check if column already exists
    const checkColumn = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'user_preferences' 
      AND column_name = 'theme_settings'
    `);

    if (checkColumn.rows.length > 0) {
      console.log('✓ Column theme_settings already exists. No migration needed.');
      await client.query('ROLLBACK');
      return;
    }

    // Add theme_settings column
    console.log('Adding theme_settings JSONB column to user_preferences...');
    await client.query(`
      ALTER TABLE user_preferences 
      ADD COLUMN theme_settings JSONB DEFAULT '{}'::jsonb
    `);
    console.log('✓ Column added successfully.\n');

    // Migrate existing theme values to theme_settings
    console.log('Migrating existing theme values to theme_settings...');
    const migrateResult = await client.query(`
      UPDATE user_preferences 
      SET theme_settings = jsonb_build_object(
        'theme', COALESCE(theme, 'light'),
        'styleMode', 'flat',
        'animationMode', 'subtle',
        'customColors', '{}'::jsonb,
        'effectSettings', jsonb_build_object(
          'shadowIntensity', 1,
          'borderRadius', 1,
          'animationSpeed', 1,
          'hoverLift', 1
        )
      )
      WHERE theme IS NOT NULL AND (theme_settings IS NULL OR theme_settings = '{}'::jsonb)
      RETURNING user_id
    `);
    console.log(`✓ Migrated ${migrateResult.rowCount} existing theme preferences.\n`);

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
    await authPool.end();
  }
}

migrate().catch(console.error);
