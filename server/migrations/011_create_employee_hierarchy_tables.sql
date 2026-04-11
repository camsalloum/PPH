-- Migration: 011_create_employee_hierarchy_tables.sql
-- Purpose: Complete employee management with hierarchy, territories, groups, and authorization
-- All tables dynamically linked to divisions

-- ============================================================
-- 1. DESIGNATIONS (Job Titles - separate from system roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS designations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  department VARCHAR(100),
  level INT DEFAULT 1,  -- 1=Entry, 2=Junior, 3=Mid, 4=Senior, 5=Lead, 6=Manager, 7=Director, 8=Executive
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default designations
INSERT INTO designations (name, department, level) VALUES
  ('CEO', 'Management', 8),
  ('General Manager', 'Management', 7),
  ('Department Manager', 'Management', 6),
  ('Team Lead', 'Management', 5),
  ('Senior Sales Executive', 'Sales', 4),
  ('Sales Executive', 'Sales', 3),
  ('Sales Coordinator', 'Sales', 2),
  ('Sales Representative', 'Sales', 2),
  ('Accounts Manager', 'Finance', 6),
  ('Senior Accountant', 'Finance', 4),
  ('Accountant', 'Finance', 3),
  ('Logistics Manager', 'Operations', 6),
  ('Warehouse Supervisor', 'Operations', 5),
  ('Stores Keeper', 'Operations', 3),
  ('Production Manager', 'Manufacturing', 6),
  ('Quality Control Manager', 'Manufacturing', 5),
  ('Production Supervisor', 'Manufacturing', 4),
  ('Machine Operator', 'Manufacturing', 2)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 2. EMPLOYEES (Profile linked to User, with division access)
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  employee_code VARCHAR(20) UNIQUE,  -- e.g., EMP001
  
  -- Personal Info
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100),
  full_name VARCHAR(300) GENERATED ALWAYS AS (
    COALESCE(first_name, '') || 
    CASE WHEN middle_name IS NOT NULL THEN ' ' || middle_name ELSE '' END ||
    CASE WHEN last_name IS NOT NULL THEN ' ' || last_name ELSE '' END
  ) STORED,
  gender VARCHAR(20),
  date_of_birth DATE,
  personal_email VARCHAR(255),
  phone VARCHAR(50),
  photo_url TEXT,
  
  -- Employment Info
  designation_id INT REFERENCES designations(id),
  department VARCHAR(100),
  date_of_joining DATE,
  date_of_leaving DATE,
  employment_type VARCHAR(50) DEFAULT 'Full-time', -- Full-time, Part-time, Contract, Intern
  
  -- Hierarchy
  reports_to INT REFERENCES employees(id),  -- Manager/supervisor
  
  -- Status
  status VARCHAR(20) DEFAULT 'Active', -- Active, Inactive, Suspended, Left
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_employees_user_id ON employees(user_id);
CREATE INDEX IF NOT EXISTS idx_employees_reports_to ON employees(reports_to);
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);

-- ============================================================
-- 3. EMPLOYEE DIVISIONS (Link employees to divisions they can access)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_divisions (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  division_code VARCHAR(10) NOT NULL,  -- Dynamic: FP, HC, etc.
  is_primary BOOLEAN DEFAULT FALSE,    -- Primary division for this employee
  access_level VARCHAR(20) DEFAULT 'full', -- full, read-only, limited
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, division_code)
);

CREATE INDEX IF NOT EXISTS idx_emp_div_employee ON employee_divisions(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_div_division ON employee_divisions(division_code);

-- ============================================================
-- 4. EMPLOYEE GROUPS (Named groups of employees)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_groups (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  division_code VARCHAR(10),  -- NULL = global group, or specific division
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS employee_group_members (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES employee_groups(id) ON DELETE CASCADE,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(group_id, employee_id)
);

-- ============================================================
-- 5. TERRITORIES (Hierarchical geographic structure per division)
-- ============================================================
CREATE TABLE IF NOT EXISTS territories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  division_code VARCHAR(10) NOT NULL,  -- Division this territory belongs to
  
  -- Hierarchy (nested set model for tree structure)
  parent_id INT REFERENCES territories(id),
  level INT DEFAULT 1,  -- 1=Region, 2=Country, 3=State/Province, 4=City, 5=Area
  lft INT,  -- Nested set left
  rgt INT,  -- Nested set right
  
  -- Assignment
  manager_id INT REFERENCES employees(id),  -- Territory manager
  
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_territories_division ON territories(division_code);
CREATE INDEX IF NOT EXISTS idx_territories_parent ON territories(parent_id);
CREATE INDEX IF NOT EXISTS idx_territories_nested ON territories(lft, rgt);

-- ============================================================
-- 6. SALES PERSONS (Hierarchical sales team per division)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_persons (
  id SERIAL PRIMARY KEY,
  employee_id INT REFERENCES employees(id),  -- Link to employee
  division_code VARCHAR(10) NOT NULL,        -- Division this sales person works in
  
  name VARCHAR(200) NOT NULL,  -- Sales person name (can differ from employee name)
  
  -- Hierarchy
  parent_id INT REFERENCES sales_persons(id),  -- Reports to this sales person
  level INT DEFAULT 1,  -- 1=VP Sales, 2=Regional Manager, 3=Area Manager, 4=Team Lead, 5=Sales Rep
  lft INT,
  rgt INT,
  
  -- Settings
  commission_rate DECIMAL(5,2) DEFAULT 0,  -- Commission percentage
  territory_id INT REFERENCES territories(id),
  
  is_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sales_persons_division ON sales_persons(division_code);
CREATE INDEX IF NOT EXISTS idx_sales_persons_employee ON sales_persons(employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_persons_parent ON sales_persons(parent_id);

-- ============================================================
-- 7. SALES TARGETS (Per person, per division, per period)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_targets (
  id SERIAL PRIMARY KEY,
  
  -- Who
  sales_person_id INT REFERENCES sales_persons(id),
  employee_id INT REFERENCES employees(id),  -- Alternative: direct employee assignment
  territory_id INT REFERENCES territories(id),  -- Or territory-based target
  
  -- What division
  division_code VARCHAR(10) NOT NULL,
  
  -- Period
  fiscal_year INT NOT NULL,
  period_type VARCHAR(20) DEFAULT 'monthly',  -- monthly, quarterly, yearly
  period_value INT,  -- 1-12 for monthly, 1-4 for quarterly, NULL for yearly
  
  -- Targets
  target_amount DECIMAL(15,2) DEFAULT 0,
  target_qty DECIMAL(15,2) DEFAULT 0,
  target_currency VARCHAR(10) DEFAULT 'AED',
  
  -- Item group specific (optional)
  item_group VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_targets_division ON sales_targets(division_code);
CREATE INDEX IF NOT EXISTS idx_targets_year ON sales_targets(fiscal_year);
CREATE INDEX IF NOT EXISTS idx_targets_person ON sales_targets(sales_person_id);

-- ============================================================
-- 8. AUTHORIZATION RULES (Approval workflows per division)
-- ============================================================
CREATE TABLE IF NOT EXISTS authorization_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  division_code VARCHAR(10),  -- NULL = applies to all divisions
  
  -- What transaction type
  transaction_type VARCHAR(50) NOT NULL,  -- 'sales_order', 'budget', 'discount', 'expense', 'refund'
  
  -- Condition
  based_on VARCHAR(50) NOT NULL,  -- 'amount', 'discount_percent', 'quantity'
  condition_operator VARCHAR(10) DEFAULT '>=',  -- >=, >, =, <=, <
  condition_value DECIMAL(15,2) NOT NULL,  -- Threshold value
  
  -- Who needs to approve
  approving_role_id INT REFERENCES roles(id),
  approving_employee_id INT REFERENCES employees(id),
  approving_designation_id INT REFERENCES designations(id),
  
  -- Who this rule applies to
  applies_to_role_id INT REFERENCES roles(id),
  applies_to_designation_id INT REFERENCES designations(id),
  
  -- Settings
  priority INT DEFAULT 100,  -- Lower = higher priority
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_rules_division ON authorization_rules(division_code);
CREATE INDEX IF NOT EXISTS idx_auth_rules_transaction ON authorization_rules(transaction_type);

-- ============================================================
-- 9. APPROVAL REQUESTS (Track pending approvals)
-- ============================================================
CREATE TABLE IF NOT EXISTS approval_requests (
  id SERIAL PRIMARY KEY,
  
  -- Reference to what needs approval
  transaction_type VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(100) NOT NULL,  -- ID of the record needing approval
  division_code VARCHAR(10),
  
  -- Request details
  requested_by INT REFERENCES employees(id),
  request_amount DECIMAL(15,2),
  request_details JSONB,
  
  -- Matched rule
  authorization_rule_id INT REFERENCES authorization_rules(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected, cancelled
  
  -- Approval
  approved_by INT REFERENCES employees(id),
  approval_date TIMESTAMP,
  approval_notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approvals_division ON approval_requests(division_code);

-- ============================================================
-- TRIGGERS for updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN 
    SELECT unnest(ARRAY['designations', 'employees', 'employee_groups', 
                        'territories', 'sales_persons', 'sales_targets', 
                        'authorization_rules', 'approval_requests'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_timestamp()', t, t);
  END LOOP;
END $$;

-- ============================================================
-- LINK EXISTING USERS TO EMPLOYEES
-- ============================================================
-- Create employee records for existing users if not exists
INSERT INTO employees (user_id, first_name, department, status)
SELECT u.id, COALESCE(u.name, split_part(u.email, '@', 1)), 
       CASE u.role WHEN 'admin' THEN 'Management' WHEN 'sales_manager' THEN 'Sales' ELSE 'Sales' END,
       CASE WHEN u.is_active THEN 'Active' ELSE 'Inactive' END
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id)
ON CONFLICT DO NOTHING;

-- Link employee divisions from user_divisions
INSERT INTO employee_divisions (employee_id, division_code, is_primary)
SELECT e.id, ud.division, (ROW_NUMBER() OVER (PARTITION BY e.id ORDER BY ud.division) = 1)
FROM employees e
JOIN user_divisions ud ON e.user_id = ud.user_id
ON CONFLICT (employee_id, division_code) DO NOTHING;
