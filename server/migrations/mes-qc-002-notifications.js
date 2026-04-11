/**
 * Migration — MES notifications
 *
 * Creates:
 *  1. mes_notifications
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    console.log('🔧 Starting MES notifications migration...\n');

    await client.query(`
      CREATE TABLE IF NOT EXISTS mes_notifications (
        id             SERIAL PRIMARY KEY,
        user_id        INTEGER NOT NULL,
        type           VARCHAR(50) NOT NULL,
        title          VARCHAR(255) NOT NULL,
        message        TEXT,
        link           VARCHAR(500),
        reference_type VARCHAR(50),
        reference_id   INTEGER,
        is_read        BOOLEAN DEFAULT FALSE,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        read_at        TIMESTAMPTZ
      );

      CREATE INDEX IF NOT EXISTS idx_mes_notifications_user_created
        ON mes_notifications(user_id, created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_mes_notifications_user_unread
        ON mes_notifications(user_id, is_read)
        WHERE is_read = FALSE;
    `);

    console.log('  ✅ mes_notifications — created');

    await client.query('COMMIT');
    console.log('\n✅ MES notifications migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ MES notifications migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(() => process.exit(1));
