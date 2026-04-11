-- Migration: 010_create_roles_table.sql
-- Purpose: Store custom roles that can be added/edited by admin
-- The roles table allows dynamic role management

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  value VARCHAR(50) UNIQUE NOT NULL,  -- e.g. 'team_lead'
  label VARCHAR(100) NOT NULL,         -- e.g. 'Team Lead'
  color VARCHAR(20) DEFAULT 'blue',    -- Ant Design color
  department VARCHAR(100),             -- e.g. 'Sales', 'Manufacturing'
  is_system BOOLEAN DEFAULT FALSE,     -- System roles cannot be deleted
  sort_order INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default system roles
INSERT INTO roles (value, label, color, department, is_system, sort_order)
VALUES 
  ('admin', 'Administrator', 'gold', 'Management', TRUE, 1),
  ('manager', 'Manager', 'purple', 'Management', FALSE, 2),
  ('sales_manager', 'Sales Manager', 'blue', 'Sales', TRUE, 10),
  ('sales_coordinator', 'Sales Coordinator', 'cyan', 'Sales', FALSE, 11),
  ('sales_rep', 'Sales Representative', 'green', 'Sales', TRUE, 12),
  ('sales_executive', 'Sales Executive', 'geekblue', 'Sales', FALSE, 13),
  ('logistics_manager', 'Logistics Manager', 'orange', 'Stores & Logistics', FALSE, 20),
  ('stores_keeper', 'Stores Keeper', 'volcano', 'Stores & Logistics', FALSE, 21),
  ('accounts_manager', 'Accounts Manager', 'red', 'Finance', FALSE, 30),
  ('accountant', 'Accountant', 'magenta', 'Finance', FALSE, 31),
  ('production_manager', 'Production Manager', 'lime', 'Manufacturing', FALSE, 40),
  ('quality_control', 'Quality Control', 'green', 'Manufacturing', FALSE, 41),
  ('operator', 'Operator', 'default', 'Manufacturing', FALSE, 42)
ON CONFLICT (value) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_roles_department ON roles(department);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_roles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS roles_updated_at ON roles;
CREATE TRIGGER roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_roles_timestamp();
