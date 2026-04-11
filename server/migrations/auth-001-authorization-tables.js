/**
 * Auth DB Migration: Authorization Tables
 * Creates roles, designations, employees, authorization_rules, and approval_requests
 * in ip_auth_database (authPool), which is where authorization.js routes query.
 *
 * Idempotent — safe to run on every server startup.
 */

const { authPool } = require('../database/config');
const logger = require('../utils/logger');

async function migrateAuthorizationTables() {
  const client = await authPool.connect();

  try {
    await client.query('BEGIN');

    // ── 1. roles ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id          SERIAL PRIMARY KEY,
        value       VARCHAR(50)  UNIQUE NOT NULL,
        label       VARCHAR(100) NOT NULL,
        color       VARCHAR(20)  DEFAULT 'blue',
        department  VARCHAR(100),
        is_system   BOOLEAN      DEFAULT FALSE,
        sort_order  INT          DEFAULT 100,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      INSERT INTO roles (value, label, color, department, is_system, sort_order) VALUES
        ('admin',             'Administrator',        'gold',     'Management',        TRUE,  1),
        ('manager',           'Manager',              'purple',   'Management',        FALSE, 2),
        ('sales_manager',     'Sales Manager',        'blue',     'Sales',             TRUE,  10),
        ('sales_coordinator', 'Sales Coordinator',    'cyan',     'Sales',             FALSE, 11),
        ('sales_rep',         'Sales Representative', 'green',    'Sales',             TRUE,  12),
        ('sales_executive',   'Sales Executive',      'geekblue', 'Sales',             FALSE, 13),
        ('logistics_manager', 'Logistics Manager',    'orange',   'Stores & Logistics',FALSE, 20),
        ('stores_keeper',     'Stores Keeper',        'volcano',  'Stores & Logistics',FALSE, 21),
        ('accounts_manager',  'Accounts Manager',     'red',      'Finance',           FALSE, 30),
        ('accountant',        'Accountant',           'magenta',  'Finance',           FALSE, 31),
        ('production_manager','Production Manager',   'lime',     'Manufacturing',     FALSE, 40),
        ('quality_control',   'Quality Control',      'green',    'Manufacturing',     FALSE, 41),
        ('operator',          'Operator',             'default',  'Manufacturing',     FALSE, 42)
      ON CONFLICT (value) DO NOTHING
    `);

    // ── 2. designations ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS designations (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(100) NOT NULL,
        description TEXT,
        department  VARCHAR(100),
        level       INT          DEFAULT 1,
        is_active   BOOLEAN      DEFAULT TRUE,
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      INSERT INTO designations (name, department, level) VALUES
        ('CEO',                      'Management', 8),
        ('General Manager',          'Management', 7),
        ('Department Manager',       'Management', 6),
        ('Team Lead',                'Management', 5),
        ('Senior Sales Executive',   'Sales',      4),
        ('Sales Executive',          'Sales',      3),
        ('Sales Coordinator',        'Sales',      2),
        ('Sales Representative',     'Sales',      2),
        ('Accounts Manager',         'Finance',    6),
        ('Senior Accountant',        'Finance',    4),
        ('Accountant',               'Finance',    3),
        ('Production Manager',       'Production', 6),
        ('Quality Control Manager',  'Production', 5),
        ('QC Technician',            'Production', 3)
      ON CONFLICT DO NOTHING
    `);

    // ── 3. employees ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        id               SERIAL PRIMARY KEY,
        user_id          INT REFERENCES users(id) ON DELETE SET NULL,
        employee_code    VARCHAR(50) UNIQUE,
        first_name       VARCHAR(100) NOT NULL,
        middle_name      VARCHAR(100),
        last_name        VARCHAR(100),
        full_name        VARCHAR(300) GENERATED ALWAYS AS (
                           COALESCE(first_name, '') ||
                           CASE WHEN middle_name IS NOT NULL THEN ' ' || middle_name ELSE '' END ||
                           CASE WHEN last_name  IS NOT NULL THEN ' ' || last_name  ELSE '' END
                         ) STORED,
        gender           VARCHAR(20),
        date_of_birth    DATE,
        personal_email   VARCHAR(255),
        phone            VARCHAR(50),
        photo_url        TEXT,
        designation_id   INT REFERENCES designations(id),
        department       VARCHAR(100),
        date_of_joining  DATE,
        date_of_leaving  DATE,
        employment_type  VARCHAR(50)  DEFAULT 'Full-time',
        reports_to       INT          REFERENCES employees(id),
        status           VARCHAR(20)  DEFAULT 'Active',
        created_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_user_id   ON employees(user_id)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON employees(reports_to)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_employees_status     ON employees(status)
    `);

    // Seed employees for existing users that don't have one yet
    await client.query(`
      INSERT INTO employees (user_id, first_name, department, status)
      SELECT
        u.id,
        COALESCE(u.name, split_part(u.email, '@', 1)),
        CASE u.role
          WHEN 'admin'        THEN 'Management'
          WHEN 'sales_manager' THEN 'Sales'
          ELSE 'Sales'
        END,
        CASE WHEN COALESCE(u.is_active, TRUE) THEN 'Active' ELSE 'Inactive' END
      FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
      ON CONFLICT DO NOTHING
    `);

    // ── 4. authorization_rules ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS authorization_rules (
        id                       SERIAL PRIMARY KEY,
        name                     VARCHAR(200) NOT NULL,
        division_code            VARCHAR(10),
        transaction_type         VARCHAR(50)  NOT NULL,
        based_on                 VARCHAR(50)  NOT NULL,
        condition_operator       VARCHAR(10)  DEFAULT '>=',
        condition_value          DECIMAL(15,2) NOT NULL,
        approving_role_id        INT REFERENCES roles(id),
        approving_employee_id    INT REFERENCES employees(id),
        approving_designation_id INT REFERENCES designations(id),
        applies_to_role_id       INT REFERENCES roles(id),
        applies_to_designation_id INT REFERENCES designations(id),
        priority                 INT          DEFAULT 100,
        is_active                BOOLEAN      DEFAULT TRUE,
        created_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        updated_at               TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_rules_division    ON authorization_rules(division_code)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_rules_transaction ON authorization_rules(transaction_type)
    `);

    // ── 5. approval_requests ──────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS approval_requests (
        id                    SERIAL PRIMARY KEY,
        transaction_type      VARCHAR(50)   NOT NULL,
        transaction_id        VARCHAR(100)  NOT NULL,
        division_code         VARCHAR(10),
        requested_by          INT REFERENCES employees(id),
        request_amount        DECIMAL(15,2),
        request_details       JSONB,
        authorization_rule_id INT REFERENCES authorization_rules(id),
        status                VARCHAR(20)   DEFAULT 'pending',
        approved_by           INT REFERENCES employees(id),
        approval_date         TIMESTAMP,
        approval_notes        TEXT,
        created_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        updated_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_approvals_status   ON approval_requests(status)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_approvals_division ON approval_requests(division_code)
    `);

    // ── 6. updated_at trigger (shared function) ───────────────────────────────
    await client.query(`
      CREATE OR REPLACE FUNCTION update_auth_tables_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    for (const tbl of ['roles', 'designations', 'employees', 'authorization_rules', 'approval_requests']) {
      await client.query(`
        DROP TRIGGER IF EXISTS ${tbl}_updated_at ON ${tbl}
      `);
      await client.query(`
        CREATE TRIGGER ${tbl}_updated_at
        BEFORE UPDATE ON ${tbl}
        FOR EACH ROW EXECUTE FUNCTION update_auth_tables_timestamp()
      `);
    }

    await client.query('COMMIT');
    logger.info('✅ Auth migration: authorization tables ready (roles, designations, employees, authorization_rules, approval_requests)');

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auth migration (authorization tables) failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Allow direct execution: node auth-001-authorization-tables.js
if (require.main === module) {
  migrateAuthorizationTables()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateAuthorizationTables };
