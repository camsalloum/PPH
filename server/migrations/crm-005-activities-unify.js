/**
 * Migration: Unify crm_activities schema for CRM + PreSales
 *
 * Problem: CRM routes insert (type, customer_id, prospect_id, rep_id, rep_name, ...)
 *          PreSales routes insert (inquiry_id, activity_type, subject, outcome, ...)
 *          But only the CRM columns exist. This migration adds the PreSales columns
 *          and relaxes the CHECK constraint so inquiry-only activities are valid.
 *
 * Also fixes missing FKs on prospect_id in crm_activities and crm_tasks.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── 1. Add PreSales columns to crm_activities ───────────────────────
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS inquiry_id INTEGER`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS activity_type VARCHAR(50)`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS subject VARCHAR(255)`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS description TEXT`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS outcome VARCHAR(50)`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS next_action_date DATE`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS next_action_note TEXT`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS contact_name VARCHAR(255)`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS duration_minutes INTEGER`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS created_by INTEGER`);
    await client.query(`ALTER TABLE crm_activities ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255)`);

    // ── 2. Relax the NOT NULL + CHECK on 'type' for PreSales rows ───────
    //    PreSales uses 'activity_type' instead of 'type'. Make 'type' nullable
    //    and drop the old CHECK so PreSales inserts don't fail.
    //    CRM routes still always set 'type'.
    await client.query(`ALTER TABLE crm_activities ALTER COLUMN type DROP NOT NULL`);
    await client.query(`ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_type_check`);

    // ── 3. Relax the linked-entity CHECK ────────────────────────────────
    //    Old: customer_id OR prospect_id must be non-null
    //    New: customer_id OR prospect_id OR inquiry_id must be non-null
    await client.query(`ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS chk_crm_act_linked`);
    await client.query(`
      ALTER TABLE crm_activities ADD CONSTRAINT chk_crm_act_linked
        CHECK (customer_id IS NOT NULL OR prospect_id IS NOT NULL OR inquiry_id IS NOT NULL)
    `);

    // ── 4. Also relax rep_id NOT NULL for PreSales rows ─────────────────
    //    PreSales uses created_by instead of rep_id
    await client.query(`ALTER TABLE crm_activities ALTER COLUMN rep_id DROP NOT NULL`);

    // ── 5. Add FK for inquiry_id → mes_presales_inquiries ───────────────
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_activities_inquiry_id_fkey') THEN
          ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_inquiry_id_fkey
            FOREIGN KEY (inquiry_id) REFERENCES mes_presales_inquiries(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // ── 6. Add FK for prospect_id → fp_prospects (was missing) ──────────
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_activities_prospect_id_fkey') THEN
          -- Delete orphan rows first (prospect_id pointing to non-existent prospects)
          DELETE FROM crm_activities
          WHERE prospect_id IS NOT NULL
            AND prospect_id NOT IN (SELECT id FROM fp_prospects);
          ALTER TABLE crm_activities ADD CONSTRAINT crm_activities_prospect_id_fkey
            FOREIGN KEY (prospect_id) REFERENCES fp_prospects(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // ── 7. Add FK for crm_tasks.prospect_id (also missing) ─────────────
    await client.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'crm_tasks_prospect_id_fkey') THEN
          DELETE FROM crm_tasks
          WHERE prospect_id IS NOT NULL
            AND prospect_id NOT IN (SELECT id FROM fp_prospects);
          ALTER TABLE crm_tasks ADD CONSTRAINT crm_tasks_prospect_id_fkey
            FOREIGN KEY (prospect_id) REFERENCES fp_prospects(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    // ── 8. Indexes for PreSales queries ─────────────────────────────────
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_act_inquiry ON crm_activities(inquiry_id, created_at DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_act_next_action ON crm_activities(inquiry_id, next_action_date)`);

    await client.query('COMMIT');
    logger.info('Migration crm-005: crm_activities unified for CRM + PreSales');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-005 failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

async function down() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Drop indexes
    await client.query('DROP INDEX IF EXISTS idx_crm_act_inquiry');
    await client.query('DROP INDEX IF EXISTS idx_crm_act_next_action');

    // Drop FKs
    await client.query('ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_inquiry_id_fkey');
    await client.query('ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS crm_activities_prospect_id_fkey');
    await client.query('ALTER TABLE crm_tasks DROP CONSTRAINT IF EXISTS crm_tasks_prospect_id_fkey');

    // Drop added columns
    const cols = [
      'inquiry_id', 'activity_type', 'subject', 'description', 'outcome',
      'next_action_date', 'next_action_note', 'contact_name', 'contact_phone',
      'duration_minutes', 'created_by', 'created_by_name'
    ];
    for (const col of cols) {
      await client.query(`ALTER TABLE crm_activities DROP COLUMN IF EXISTS ${col}`);
    }

    // Restore NOT NULL on type and rep_id
    await client.query(`UPDATE crm_activities SET type = 'follow_up' WHERE type IS NULL`);
    await client.query(`ALTER TABLE crm_activities ALTER COLUMN type SET NOT NULL`);
    await client.query(`UPDATE crm_activities SET rep_id = 0 WHERE rep_id IS NULL`);
    await client.query(`ALTER TABLE crm_activities ALTER COLUMN rep_id SET NOT NULL`);

    // Restore original CHECK
    await client.query(`ALTER TABLE crm_activities DROP CONSTRAINT IF EXISTS chk_crm_act_linked`);
    await client.query(`
      ALTER TABLE crm_activities ADD CONSTRAINT chk_crm_act_linked
        CHECK (customer_id IS NOT NULL OR prospect_id IS NOT NULL)
    `);

    await client.query('COMMIT');
    logger.info('Migration crm-005: rolled back');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Migration crm-005 rollback failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up, down };
