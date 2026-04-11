/**
 * crm-020-trip-drafts.js
 * Creates crm_field_trip_drafts table for server-side draft persistence.
 * Each user can have one active draft at a time (upsert pattern).
 */
module.exports = {
  name: 'crm-020-trip-drafts',
  async up() {
    const { pool } = require('../database/config');
    const client = await pool.connect();
    try {
      const tableCheck = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_field_trip_drafts' LIMIT 1`
      );
      if (tableCheck.rows.length === 0) {
        await client.query(`
          CREATE TABLE crm_field_trip_drafts (
            id           SERIAL PRIMARY KEY,
            user_id      INTEGER NOT NULL,
            title        VARCHAR(255),
            draft_json   JSONB NOT NULL DEFAULT '{}',
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT crm_ftp_drafts_user_uq UNIQUE (user_id)
          )
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_crm_drafts_user ON crm_field_trip_drafts(user_id)`);
        console.log('[crm-020] Created crm_field_trip_drafts table');
      } else {
        console.log('[crm-020] crm_field_trip_drafts already exists — skipping');
      }
    } finally {
      client.release();
    }
  },
};
