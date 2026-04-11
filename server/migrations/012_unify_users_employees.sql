-- Migration: 012_unify_users_employees.sql
-- Purpose: Unify users and employees with 1:1 linkage, enhanced sales hierarchy, and audit logging
-- Date: December 25, 2025
-- Part of: User Management Module Implementation

-- ============================================================
-- PHASE 1: UNIFY USERS & EMPLOYEES
-- ============================================================

-- 1.1 Ensure unique constraint on employee.user_id (1:1 relationship)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employees_user_id_unique'
  ) THEN
    ALTER TABLE employees ADD CONSTRAINT employees_user_id_unique UNIQUE (user_id);
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Constraint employees_user_id_unique may already exist or table structure differs';
END $$;

-- 1.2 Add reverse link from users to employees for quick lookup
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_employee_profile BOOLEAN DEFAULT TRUE;

-- Add foreign key if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_id_fkey'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_id_fkey 
      FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Foreign key users_employee_id_fkey may already exist';
END $$;

-- 1.3 User-Employee linkage audit log
CREATE TABLE IF NOT EXISTS user_employee_link_log (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  employee_id INT REFERENCES employees(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL, -- 'linked', 'unlinked', 'auto_created', 'auto_linked'
  performed_by INT REFERENCES users(id) ON DELETE SET NULL,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_emp_link_log_user ON user_employee_link_log(user_id);
CREATE INDEX IF NOT EXISTS idx_user_emp_link_log_employee ON user_employee_link_log(employee_id);

-- ============================================================
-- PHASE 2: SALES REP GROUPS & HIERARCHY ENHANCEMENTS
-- ============================================================

-- 2.1 Add user link and contact info to sales_persons
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Active';

-- 2.2 Sales person territory assignments (N:M relationship)
CREATE TABLE IF NOT EXISTS sales_person_territories (
  id SERIAL PRIMARY KEY,
  sales_person_id INT NOT NULL REFERENCES sales_persons(id) ON DELETE CASCADE,
  territory_id INT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  assigned_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sales_person_id, territory_id)
);

CREATE INDEX IF NOT EXISTS idx_sp_territories_sp ON sales_person_territories(sales_person_id);
CREATE INDEX IF NOT EXISTS idx_sp_territories_terr ON sales_person_territories(territory_id);

-- 2.3 Sales team groups (named groups of sales persons)
CREATE TABLE IF NOT EXISTS sales_teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  division_code VARCHAR(10),
  lead_sales_person_id INT REFERENCES sales_persons(id),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_team_members (
  id SERIAL PRIMARY KEY,
  team_id INT NOT NULL REFERENCES sales_teams(id) ON DELETE CASCADE,
  sales_person_id INT NOT NULL REFERENCES sales_persons(id) ON DELETE CASCADE,
  role_in_team VARCHAR(50) DEFAULT 'Member', -- 'Lead', 'Member', 'Support'
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, sales_person_id)
);

-- ============================================================
-- PHASE 3: ENHANCED ORG CHART DATA
-- ============================================================

-- 3.1 Employee additional fields for org chart display
ALTER TABLE employees ADD COLUMN IF NOT EXISTS job_description TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS skills TEXT[];
ALTER TABLE employees ADD COLUMN IF NOT EXISTS office_location VARCHAR(100);

-- 3.2 Org chart display preferences per user
CREATE TABLE IF NOT EXISTS org_chart_preferences (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  default_view VARCHAR(20) DEFAULT 'employees', -- 'employees', 'departments', 'sales'
  default_division VARCHAR(10),
  expanded_nodes JSONB DEFAULT '[]',
  zoom_level INT DEFAULT 100,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- ============================================================
-- PHASE 4: PERMISSION ENFORCEMENT TABLES
-- ============================================================

-- 4.1 Page permission mapping (what permission is needed for each page)
CREATE TABLE IF NOT EXISTS page_permissions (
  id SERIAL PRIMARY KEY,
  page_path VARCHAR(200) NOT NULL,
  page_name VARCHAR(100) NOT NULL,
  required_permission VARCHAR(100) NOT NULL,
  required_role VARCHAR(50),
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(page_path)
);

-- Insert default page permission mappings
INSERT INTO page_permissions (page_path, page_name, required_permission, description) VALUES
  ('/', 'Dashboard', 'dashboard:view', 'Main dashboard page'),
  ('/budget', 'Budget', 'budget:view', 'Budget data view'),
  ('/budget/edit', 'Budget Edit', 'budget:edit', 'Budget editing'),
  ('/actuals', 'Actuals', 'actuals:view', 'Actual data view'),
  ('/actuals/upload', 'Actuals Upload', 'actuals:upload', 'Upload actual data'),
  ('/reports', 'Reports', 'reports:view', 'View reports'),
  ('/reports/export', 'Report Export', 'reports:export', 'Export reports'),
  ('/aebf', 'AEBF', 'aebf:view', 'AEBF analysis'),
  ('/settings', 'Settings', 'settings:view', 'Application settings'),
  ('/settings/company', 'Company Settings', 'settings:company:update', 'Company configuration'),
  ('/settings/users', 'User Management', 'users:list:view', 'Manage users'),
  ('/settings/employees', 'Employees', 'employees:list:view', 'Manage employees'),
  ('/settings/territories', 'Territories', 'territories:view', 'Territory management'),
  ('/settings/authorization', 'Authorization', 'authorization:view', 'Authorization rules')
ON CONFLICT (page_path) DO NOTHING;

-- 4.2 Access denied log (track unauthorized access attempts)
CREATE TABLE IF NOT EXISTS access_denied_log (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  page_path VARCHAR(200),
  required_permission VARCHAR(100),
  ip_address VARCHAR(50),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_denied_user ON access_denied_log(user_id);
CREATE INDEX IF NOT EXISTS idx_access_denied_time ON access_denied_log(created_at);

-- ============================================================
-- PHASE 5: AUTHORIZATION WORKFLOW ENHANCEMENTS
-- ============================================================

-- 5.1 Approval request status history
CREATE TABLE IF NOT EXISTS approval_status_history (
  id SERIAL PRIMARY KEY,
  approval_request_id INT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  changed_by INT REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5.2 Approval notifications
CREATE TABLE IF NOT EXISTS approval_notifications (
  id SERIAL PRIMARY KEY,
  approval_request_id INT NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
  recipient_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) DEFAULT 'email', -- 'email', 'in_app', 'both'
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5.3 Approval delegation (when approver is absent)
CREATE TABLE IF NOT EXISTS approval_delegations (
  id SERIAL PRIMARY KEY,
  from_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT no_self_delegation CHECK (from_user_id != to_user_id)
);

-- ============================================================
-- PHASE 6: UNIFIED DASHBOARD SUPPORT
-- ============================================================

-- 6.1 Quick action templates (for bulk operations)
CREATE TABLE IF NOT EXISTS user_action_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  template_type VARCHAR(50) NOT NULL, -- 'role_assignment', 'permission_set', 'territory_assignment'
  template_data JSONB NOT NULL,
  created_by INT REFERENCES users(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6.2 Import/export job tracking
CREATE TABLE IF NOT EXISTS user_import_jobs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL, -- 'import_users', 'import_employees', 'export_users'
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  file_name VARCHAR(255),
  total_rows INT,
  processed_rows INT DEFAULT 0,
  success_count INT DEFAULT 0,
  error_count INT DEFAULT 0,
  error_details JSONB,
  started_by INT REFERENCES users(id),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- PHASE 7: TERRITORY-BASED DATA ACCESS
-- ============================================================

-- 7.1 Employee territory assignments
CREATE TABLE IF NOT EXISTS employee_territories (
  id SERIAL PRIMARY KEY,
  employee_id INT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  territory_id INT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  access_type VARCHAR(20) DEFAULT 'full', -- 'full', 'read_only', 'limited'
  assigned_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, territory_id)
);

CREATE INDEX IF NOT EXISTS idx_emp_territories_emp ON employee_territories(employee_id);
CREATE INDEX IF NOT EXISTS idx_emp_territories_terr ON employee_territories(territory_id);

-- 7.2 Territory data access cache (for performance)
CREATE TABLE IF NOT EXISTS user_territory_access_cache (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  territory_ids INT[] NOT NULL,
  country_codes VARCHAR(10)[] NOT NULL,
  division_codes VARCHAR(10)[] NOT NULL,
  cache_key VARCHAR(100),
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- ============================================================
-- PHASE 8: SELF-SERVICE PROFILE
-- ============================================================

-- 8.1 Profile update requests (for non-admin changes requiring approval)
CREATE TABLE IF NOT EXISTS profile_update_requests (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field_name VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  reviewed_by INT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8.2 Password change history (for security)
CREATE TABLE IF NOT EXISTS password_history (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash VARCHAR(255) NOT NULL,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(50)
);

CREATE INDEX IF NOT EXISTS idx_password_history_user ON password_history(user_id);

-- ============================================================
-- PERMISSION AUDIT LOG ENHANCEMENTS
-- ============================================================

-- Add more fields to existing permission_audit_log if not present
ALTER TABLE permission_audit_log ADD COLUMN IF NOT EXISTS details JSONB;
ALTER TABLE permission_audit_log ADD COLUMN IF NOT EXISTS session_id VARCHAR(100);

-- ============================================================
-- SYNC EXISTING DATA
-- ============================================================

-- Auto-link users to employees by email match
UPDATE users u
SET employee_id = e.id
FROM employees e
WHERE u.email = e.personal_email
  AND u.employee_id IS NULL
  AND e.user_id = u.id;

-- Update reverse link: employees.user_id from users.employee_id
UPDATE employees e
SET user_id = u.id
FROM users u
WHERE u.employee_id = e.id
  AND e.user_id IS NULL;

-- Log the auto-linking
INSERT INTO user_employee_link_log (user_id, employee_id, action, details)
SELECT u.id, u.employee_id, 'auto_linked', jsonb_build_object('migration', '012_unify_users_employees')
FROM users u
WHERE u.employee_id IS NOT NULL;

-- ============================================================
-- CREATE VIEWS FOR UNIFIED ACCESS
-- ============================================================

-- Unified user-employee view
CREATE OR REPLACE VIEW v_users_employees AS
SELECT 
  u.id AS user_id,
  u.email,
  u.name AS user_name,
  u.role AS system_role,
  u.is_active AS user_active,
  u.created_at AS user_created,
  e.id AS employee_id,
  e.employee_code,
  e.first_name,
  e.last_name,
  e.full_name,
  e.designation_id,
  d.name AS designation_name,
  d.level AS designation_level,
  e.department,
  e.reports_to AS reports_to_employee_id,
  mgr.full_name AS reports_to_name,
  e.status AS employee_status,
  e.photo_url,
  e.date_of_joining,
  CASE 
    WHEN u.id IS NOT NULL AND e.id IS NOT NULL THEN 'linked'
    WHEN u.id IS NOT NULL AND e.id IS NULL THEN 'user_only'
    WHEN u.id IS NULL AND e.id IS NOT NULL THEN 'employee_only'
  END AS link_status
FROM users u
FULL OUTER JOIN employees e ON u.employee_id = e.id OR u.id = e.user_id
LEFT JOIN designations d ON e.designation_id = d.id
LEFT JOIN employees mgr ON e.reports_to = mgr.id;

-- Sales team hierarchy view
CREATE OR REPLACE VIEW v_sales_hierarchy AS
SELECT 
  sp.id AS sales_person_id,
  sp.name AS sales_person_name,
  sp.division_code,
  sp.level AS hierarchy_level,
  sp.parent_id,
  parent_sp.name AS parent_name,
  sp.commission_rate,
  sp.is_enabled,
  e.id AS employee_id,
  e.full_name AS employee_name,
  u.id AS user_id,
  u.email,
  t.id AS territory_id,
  t.name AS territory_name,
  ARRAY_AGG(DISTINCT spt.territory_id) FILTER (WHERE spt.territory_id IS NOT NULL) AS assigned_territory_ids
FROM sales_persons sp
LEFT JOIN employees e ON sp.employee_id = e.id
LEFT JOIN users u ON sp.user_id = u.id OR e.user_id = u.id
LEFT JOIN territories t ON sp.territory_id = t.id
LEFT JOIN sales_person_territories spt ON sp.id = spt.sales_person_id
LEFT JOIN sales_persons parent_sp ON sp.parent_id = parent_sp.id
GROUP BY sp.id, sp.name, sp.division_code, sp.level, sp.parent_id, parent_sp.name,
         sp.commission_rate, sp.is_enabled, e.id, e.full_name, u.id, u.email, t.id, t.name;

-- Permission summary view
CREATE OR REPLACE VIEW v_user_permission_summary AS
SELECT 
  u.id AS user_id,
  u.email,
  u.name,
  u.role,
  COUNT(DISTINCT up.permission_key) FILTER (WHERE up.division_code IS NULL) AS global_permissions,
  COUNT(DISTINCT up.permission_key) FILTER (WHERE up.division_code IS NOT NULL) AS division_permissions,
  ARRAY_AGG(DISTINCT up.division_code) FILTER (WHERE up.division_code IS NOT NULL) AS divisions_with_permissions,
  MAX(up.granted_at) AS last_permission_change
FROM users u
LEFT JOIN user_permissions up ON u.id = up.user_id
GROUP BY u.id, u.email, u.name, u.role;

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Function to get user's accessible territories
CREATE OR REPLACE FUNCTION get_user_territories(p_user_id INT)
RETURNS TABLE (
  territory_id INT,
  territory_name VARCHAR(100),
  territory_code VARCHAR(20),
  division_code VARCHAR(10),
  access_type VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.id,
    t.name,
    t.code,
    t.division_code,
    et.access_type
  FROM territories t
  INNER JOIN employee_territories et ON t.id = et.territory_id
  INNER JOIN employees e ON et.employee_id = e.id
  INNER JOIN users u ON e.user_id = u.id
  WHERE u.id = p_user_id
  UNION
  SELECT 
    t.id,
    t.name,
    t.code,
    t.division_code,
    'full'::VARCHAR(20) AS access_type
  FROM territories t
  INNER JOIN sales_person_territories spt ON t.id = spt.territory_id
  INNER JOIN sales_persons sp ON spt.sales_person_id = sp.id
  WHERE sp.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check if user has access to territory
CREATE OR REPLACE FUNCTION user_has_territory_access(p_user_id INT, p_territory_id INT)
RETURNS BOOLEAN AS $$
DECLARE
  v_has_access BOOLEAN;
  v_is_admin BOOLEAN;
BEGIN
  -- Admins have access to all
  SELECT role = 'admin' INTO v_is_admin FROM users WHERE id = p_user_id;
  IF v_is_admin THEN
    RETURN TRUE;
  END IF;
  
  -- Check direct assignment
  SELECT EXISTS (
    SELECT 1 FROM get_user_territories(p_user_id) WHERE territory_id = p_territory_id
  ) INTO v_has_access;
  
  RETURN v_has_access;
END;
$$ LANGUAGE plpgsql;

-- Function to link user and employee
CREATE OR REPLACE FUNCTION link_user_employee(
  p_user_id INT,
  p_employee_id INT,
  p_performed_by INT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_existing_user_id INT;
  v_existing_employee_id INT;
BEGIN
  -- Check if employee already linked to another user
  SELECT user_id INTO v_existing_user_id FROM employees WHERE id = p_employee_id;
  IF v_existing_user_id IS NOT NULL AND v_existing_user_id != p_user_id THEN
    RAISE EXCEPTION 'Employee already linked to another user (ID: %)', v_existing_user_id;
  END IF;
  
  -- Check if user already linked to another employee
  SELECT employee_id INTO v_existing_employee_id FROM users WHERE id = p_user_id;
  IF v_existing_employee_id IS NOT NULL AND v_existing_employee_id != p_employee_id THEN
    RAISE EXCEPTION 'User already linked to another employee (ID: %)', v_existing_employee_id;
  END IF;
  
  -- Update both tables
  UPDATE users SET employee_id = p_employee_id WHERE id = p_user_id;
  UPDATE employees SET user_id = p_user_id WHERE id = p_employee_id;
  
  -- Log the action
  INSERT INTO user_employee_link_log (user_id, employee_id, action, performed_by)
  VALUES (p_user_id, p_employee_id, 'linked', p_performed_by);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to unlink user and employee
CREATE OR REPLACE FUNCTION unlink_user_employee(
  p_user_id INT,
  p_performed_by INT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_employee_id INT;
BEGIN
  -- Get current employee
  SELECT employee_id INTO v_employee_id FROM users WHERE id = p_user_id;
  
  IF v_employee_id IS NULL THEN
    RETURN FALSE;
  END IF;
  
  -- Update both tables
  UPDATE users SET employee_id = NULL WHERE id = p_user_id;
  UPDATE employees SET user_id = NULL WHERE id = v_employee_id;
  
  -- Log the action
  INSERT INTO user_employee_link_log (user_id, employee_id, action, performed_by)
  VALUES (p_user_id, v_employee_id, 'unlinked', p_performed_by);
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================

-- Record migration
INSERT INTO schema_migrations (version, name, applied_at)
VALUES ('012', 'unify_users_employees', NOW())
ON CONFLICT DO NOTHING;
