-- MIGRATION: 20260207_001_all_baseline
-- TARGET: all databases
-- ROLLBACK: SAFE
-- DATA LOSS: NO
-- DESCRIPTION: Creates the schema_migrations tracking table
-- NOTE: Transaction handling is done by the migration runner / deploy pipeline

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(500),
  applied_at TIMESTAMP DEFAULT NOW(),
  checksum VARCHAR(64),
  rollback_safe BOOLEAN DEFAULT true
);
