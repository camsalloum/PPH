/**
 * Migration: CRM Field Trip Templates — Full Fields
 *
 * Adds missing columns to crm_field_trip_templates so that Save as Template
 * captures the complete Trip Info step content (everything except dates).
 * Also creates the table with a base schema if it doesn't exist yet.
 *
 * New columns:
 *   title                TEXT           — default trip title
 *   destination_countries JSONB         — array of country codes (international trips)
 *   cities_to_visit      TEXT
 *   budget_estimate      NUMERIC(15,2)
 *   visa_required        BOOLEAN
 *   visa_type            TEXT
 *   accommodation        TEXT
 *   legs_json            JSONB          — transport legs
 *   checklist_json       JSONB          — pre-departure checklist
 *
 * Idempotent: safe to run multiple times.
 */

const { pool } = require('../database/config');
const logger = require('../utils/logger');

async function up() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Ensure the base table exists (in case it was never created)
    await client.query(`
      CREATE TABLE IF NOT EXISTS crm_field_trip_templates (
        id            SERIAL PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT,
        trip_type     TEXT DEFAULT 'local',
        country_code  TEXT,
        transport_mode TEXT,
        stops_json    JSONB DEFAULT '[]',
        created_by    INTEGER,
        is_shared     BOOLEAN DEFAULT FALSE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Get existing columns
    const cols = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'crm_field_trip_templates'
    `);
    const existing = new Set(cols.rows.map(r => r.column_name));

    const additions = [
      ["title",                 "TEXT"],
      ["destination_countries", "JSONB DEFAULT '[]'"],
      ["cities_to_visit",       "TEXT"],
      ["budget_estimate",       "NUMERIC(15,2)"],
      ["visa_required",         "BOOLEAN DEFAULT FALSE"],
      ["visa_type",             "TEXT"],
      ["accommodation",         "TEXT"],
      ["legs_json",             "JSONB DEFAULT '[]'"],
      ["checklist_json",        "JSONB DEFAULT '[]'"],
    ];

    for (const [col, def] of additions) {
      if (!existing.has(col)) {
        await client.query(`ALTER TABLE crm_field_trip_templates ADD COLUMN ${col} ${def}`);
        logger.info(`crm-018: added column ${col}`);
      }
    }

    await client.query('COMMIT');
    logger.info('crm-018: template full-fields migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('crm-018: migration failed', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { up };
