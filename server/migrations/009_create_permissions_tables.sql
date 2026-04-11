-- ========================================
-- PERMISSIONS SYSTEM
-- Migration: 009_create_permissions_tables.sql
-- Implements fine-grained permission control (default-deny)
-- ========================================

-- 1. Permissions Catalog Table
-- Stores the master list of all available permissions
CREATE TABLE IF NOT EXISTS permissions (
    key VARCHAR(100) PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    group_name VARCHAR(100) NOT NULL,
    scope VARCHAR(20) NOT NULL CHECK (scope IN ('global', 'division')),
    sort_order INTEGER DEFAULT 0,
    is_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. User Permissions Table
-- Per-user permission grants (supports global + per-division)
CREATE TABLE IF NOT EXISTS user_permissions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_key VARCHAR(100) NOT NULL REFERENCES permissions(key) ON DELETE CASCADE,
    division_code VARCHAR(50), -- NULL = global, 'FP'/'HC' = division-specific
    allowed BOOLEAN DEFAULT TRUE,
    granted_by INTEGER REFERENCES users(id),
    granted_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, permission_key, division_code)
);

-- 3. Permission Audit Log Table
-- Tracks all permission changes for security/compliance
CREATE TABLE IF NOT EXISTS permission_audit_log (
    id SERIAL PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES users(id),
    target_user_id INTEGER NOT NULL REFERENCES users(id),
    action VARCHAR(50) NOT NULL, -- 'grant', 'revoke', 'bulk_update'
    permission_key VARCHAR(100),
    division_code VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_permissions_key ON user_permissions(permission_key);
CREATE INDEX IF NOT EXISTS idx_user_permissions_division ON user_permissions(division_code);
CREATE INDEX IF NOT EXISTS idx_permissions_group ON permissions(group_name);
CREATE INDEX IF NOT EXISTS idx_permissions_scope ON permissions(scope);
CREATE INDEX IF NOT EXISTS idx_permission_audit_admin ON permission_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_target ON permission_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_permission_audit_created ON permission_audit_log(created_at);

-- Apply updated_at trigger to permissions table
CREATE TRIGGER update_permissions_updated_at 
    BEFORE UPDATE ON permissions
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- INITIAL PERMISSION CATALOG
-- These are the permissions admin can grant to users
-- ========================================

-- Navigation / Shell (global)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('nav:division:switch', 'Switch Division', 'Switch between divisions in header', 'Navigation', 'global', 10),
('nav:settings:open', 'Open Settings', 'Access settings page from header', 'Navigation', 'global', 20),
('nav:dashboard:open', 'Open Dashboard', 'Navigate to dashboard', 'Navigation', 'global', 30)
ON CONFLICT (key) DO NOTHING;

-- Dashboard Home (global)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('dashboard:home:view', 'View Dashboard Home', 'Access main dashboard page', 'Dashboard', 'global', 100)
ON CONFLICT (key) DO NOTHING;

-- Dashboard Modules (division-scoped)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('dashboard:divisional:view', 'View Divisional Dashboard', 'Access divisional KPIs and charts', 'Dashboard', 'division', 110),
('dashboard:sales:view', 'View Sales Dashboard', 'Access sales reports and analytics', 'Dashboard', 'division', 120),
('dashboard:writeup:view', 'View Write-Up', 'Access write-up generation tools', 'Dashboard', 'division', 130)
ON CONFLICT (key) DO NOTHING;

-- Divisional Dashboard Features (division-scoped)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('divisional:kpis:view', 'View KPIs', 'View divisional KPI cards', 'Divisional', 'division', 200),
('divisional:charts:view', 'View Charts', 'View divisional charts', 'Divisional', 'division', 210),
('divisional:product-groups:view', 'View Product Groups', 'View product group breakdown', 'Divisional', 'division', 220),
('divisional:product-groups:export-pdf', 'Export Product Groups PDF', 'Export product group report to PDF', 'Divisional', 'division', 221),
('divisional:product-groups:export-excel', 'Export Product Groups Excel', 'Export product group data to Excel', 'Divisional', 'division', 222),
('divisional:customers:view', 'View Customers', 'View customer analytics', 'Divisional', 'division', 230),
('divisional:countries:view', 'View Countries', 'View sales by country', 'Divisional', 'division', 240)
ON CONFLICT (key) DO NOTHING;

-- Sales Dashboard Features (division-scoped)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('sales:reps:view', 'View Sales Reps', 'View sales rep list and reports', 'Sales', 'division', 300),
('sales:reps:export-html', 'Export Sales Rep HTML', 'Export sales rep budget to HTML', 'Sales', 'division', 310),
('sales:reps:export-excel', 'Export Sales Rep Excel', 'Export sales rep data to Excel', 'Sales', 'division', 311),
('sales:budget:view', 'View Budget', 'View budget data', 'Sales', 'division', 320),
('sales:budget:edit', 'Edit Budget', 'Modify budget values', 'Sales', 'division', 321),
('sales:budget:upload', 'Upload Budget', 'Upload budget from HTML/Excel', 'Sales', 'division', 322),
('sales:budget:finalize', 'Finalize Budget', 'Submit final budget', 'Sales', 'division', 323)
ON CONFLICT (key) DO NOTHING;

-- AEBF Features (division-scoped)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('aebf:actual:view', 'View Actual Data', 'View actual sales data', 'AEBF', 'division', 400),
('aebf:actual:upload', 'Upload Actual Data', 'Upload actual data from Excel', 'AEBF', 'division', 401),
('aebf:estimate:view', 'View Estimate Data', 'View estimate projections', 'AEBF', 'division', 410),
('aebf:estimate:edit', 'Edit Estimate Data', 'Modify estimate values', 'AEBF', 'division', 411),
('aebf:budget:view', 'View Budget Data', 'View budget data in AEBF', 'AEBF', 'division', 420),
('aebf:forecast:view', 'View Forecast', 'View forecast projections', 'AEBF', 'division', 430)
ON CONFLICT (key) DO NOTHING;

-- Settings (global - admin area)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('settings:company:view', 'View Company Settings', 'View company info tab', 'Settings', 'global', 500),
('settings:company:update', 'Update Company Settings', 'Modify company name, logo, divisions', 'Settings', 'global', 501),
('settings:periods:view', 'View Period Configuration', 'View period settings tab', 'Settings', 'global', 510),
('settings:periods:update', 'Update Period Configuration', 'Modify period settings', 'Settings', 'global', 511),
('settings:appearance:view', 'View Appearance Settings', 'View theme settings', 'Settings', 'global', 520),
('settings:appearance:update', 'Update Appearance Settings', 'Modify theme and appearance', 'Settings', 'global', 521),
('settings:masterdata:view', 'View Master Data', 'View master data tab', 'Settings', 'global', 530),
('settings:masterdata:update', 'Update Master Data', 'Modify master data', 'Settings', 'global', 531)
ON CONFLICT (key) DO NOTHING;

-- User Management (global - admin only typically)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('users:list:view', 'View Users List', 'View list of all users', 'User Management', 'global', 600),
('users:details:view', 'View User Details', 'View individual user details', 'User Management', 'global', 610),
('users:create', 'Create Users', 'Register new users', 'User Management', 'global', 620),
('users:update', 'Update Users', 'Modify user information', 'User Management', 'global', 630),
('users:delete', 'Delete Users', 'Remove users from system', 'User Management', 'global', 640),
('users:permissions:view', 'View User Permissions', 'View permission assignments', 'User Management', 'global', 650),
('users:permissions:update', 'Update User Permissions', 'Grant or revoke permissions', 'User Management', 'global', 651)
ON CONFLICT (key) DO NOTHING;

-- Data Maintenance (division-scoped)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('maintenance:merge-rules:view', 'View Merge Rules', 'View customer merge rules', 'Maintenance', 'division', 700),
('maintenance:merge-rules:create', 'Create Merge Rules', 'Add new merge rules', 'Maintenance', 'division', 701),
('maintenance:merge-rules:delete', 'Delete Merge Rules', 'Remove merge rules', 'Maintenance', 'division', 702),
('maintenance:currency:view', 'View Currency Rates', 'View exchange rates', 'Maintenance', 'global', 710),
('maintenance:currency:update', 'Update Currency Rates', 'Add/modify exchange rates', 'Maintenance', 'global', 711),
('maintenance:currency:refresh', 'Refresh Currency Rates', 'Fetch rates from external API', 'Maintenance', 'global', 712)
ON CONFLICT (key) DO NOTHING;

-- Period Selection (global)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('periods:columns:select', 'Select Period Columns', 'Choose which period columns to display', 'Periods', 'global', 800),
('periods:base:select', 'Select Base Period', 'Choose base period for comparisons', 'Periods', 'global', 810),
('periods:generate', 'Generate Periods', 'Create new period configurations', 'Periods', 'global', 820)
ON CONFLICT (key) DO NOTHING;

-- Export Features (division-scoped)
INSERT INTO permissions (key, label, description, group_name, scope, sort_order) VALUES
('export:html', 'Export to HTML', 'Export reports to HTML format', 'Export', 'division', 900),
('export:excel', 'Export to Excel', 'Export data to Excel format', 'Export', 'division', 910),
('export:pdf', 'Export to PDF', 'Export reports to PDF format', 'Export', 'division', 920),
('export:print', 'Print Reports', 'Print reports directly', 'Export', 'division', 930)
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE permissions IS 'Master catalog of all available permissions in the system';
COMMENT ON TABLE user_permissions IS 'Per-user permission grants with optional division scope';
COMMENT ON TABLE permission_audit_log IS 'Audit trail for all permission changes';
