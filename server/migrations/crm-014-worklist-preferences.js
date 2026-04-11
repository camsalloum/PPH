/**
 * Migration: CRM Worklist Preferences
 * Table: crm_worklist_preferences — per-user default filters for CRM worklist
 *
 * Idempotent: creates table if missing and adds missing columns/constraints.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'crm_worklist_preferences'
    `);

    if (tableCheck.rows.length === 0) {
      await client.query(`
        CREATE TABLE crm_worklist_preferences (
          id              SERIAL PRIMARY KEY,
          user_id         INTEGER NOT NULL,
          list_type       VARCHAR(20) NOT NULL
                            CHECK (list_type IN ('tasks','meetings','calls','deals')),
          default_status  VARCHAR(40),
          default_query   VARCHAR(255),
          created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (user_id, list_type)
        )
      `);

      await client.query(`CREATE INDEX idx_crm_worklist_pref_user ON crm_worklist_preferences(user_id)`);
      await client.query(`CREATE INDEX idx_crm_worklist_pref_type ON crm_worklist_preferences(list_type)`);

      logger.info('Migration crm-014: crm_worklist_preferences table created');
    } else {
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'crm_worklist_preferences'
      `);
      const existing = new Set(cols.rows.map(r => r.column_name));

      if (!existing.has('default_status')) await client.query(`ALTER TABLE crm_worklist_preferences ADD COLUMN default_status VARCHAR(40)`);
      if (!existing.has('default_query')) await client.query(`ALTER TABLE crm_worklist_preferences ADD COLUMN default_query VARCHAR(255)`);
      if (!existing.has('created_at')) await client.query(`ALTER TABLE crm_worklist_preferences ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
      if (!existing.has('updated_at')) await client.query(`ALTER TABLE crm_worklist_preferences ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

      await client.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'crm_worklist_preferences_user_id_list_type_key'
          ) THEN
            ALTER TABLE crm_worklist_preferences
            ADD CONSTRAINT crm_worklist_preferences_user_id_list_type_key UNIQUE (user_id, list_type);
          END IF;
        END$$;
      `);

      logger.info('Migration crm-014: crm_worklist_preferences table already exists, checked columns/constraints');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-014 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  await pool.query('DROP TABLE IF EXISTS crm_worklist_preferences CASCADE');
}

module.exports = { up, down };
