-- ========================================
-- PHASE 1: USER AUTHENTICATION & RBAC
-- Migration: 001_create_users_tables.sql
-- ========================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'sales_manager', 'sales_rep')),
    photo_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. User Divisions (for Sales Managers and Sales Reps)
-- Admin has access to all divisions (no entry needed)
CREATE TABLE IF NOT EXISTS user_divisions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    division VARCHAR(50) NOT NULL CHECK (division IN ('FP', 'SB', 'TF', 'HCM')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, division)
);

-- 3. User Sales Rep Assignments (for Sales Managers)
-- Maps which sales reps a manager can view
CREATE TABLE IF NOT EXISTS user_sales_rep_access (
    id SERIAL PRIMARY KEY,
    manager_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sales_rep_name VARCHAR(255) NOT NULL,
    division VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(manager_id, sales_rep_name, division)
);

-- 4. User Preferences (including period selection)
CREATE TABLE IF NOT EXISTS user_preferences (
    id SERIAL PRIMARY KEY,
    user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    period_selection JSONB, -- Custom period configuration per user
    base_period_index INTEGER DEFAULT 0,
    theme VARCHAR(50) DEFAULT 'light',
    timezone VARCHAR(100) DEFAULT 'UTC',
    language VARCHAR(10) DEFAULT 'en',
    notifications_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 5. User Sessions (for token management)
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Global Default Preferences (set by Admin)
CREATE TABLE IF NOT EXISTS global_default_preferences (
    id SERIAL PRIMARY KEY,
    preference_key VARCHAR(255) UNIQUE NOT NULL,
    preference_value JSONB NOT NULL,
    description TEXT,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_user_divisions_user_id ON user_divisions(user_id);
CREATE INDEX idx_user_sales_rep_access_manager_id ON user_sales_rep_access(manager_id);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to users table
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to user_preferences table
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: Admin@123 - CHANGE IMMEDIATELY)
-- Password hash generated with bcrypt for 'Admin@123'
INSERT INTO users (email, password_hash, name, role) 
VALUES (
    'camille@interplast-uae.com',
    '$2b$10$rZ8qNqZ4KGVxH3xQJ9X.xeF7YvB3Y8nGHJ9X.xeF7YvB3Y8nGHJ9X',
    'Camille Salloum',
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- Insert default period selection for all users
INSERT INTO global_default_preferences (preference_key, preference_value, description)
VALUES (
    'default_period_selection',
    '[]'::jsonb,
    'Default period selection columns for all new users'
) ON CONFLICT (preference_key) DO NOTHING;

INSERT INTO global_default_preferences (preference_key, preference_value, description)
VALUES (
    'default_base_period_index',
    '0'::jsonb,
    'Default base period index for comparisons'
) ON CONFLICT (preference_key) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts with authentication credentials';
COMMENT ON TABLE user_divisions IS 'Division access mapping for users (not needed for admins)';
COMMENT ON TABLE user_sales_rep_access IS 'Sales rep visibility mapping for managers';
COMMENT ON TABLE user_preferences IS 'User-specific preferences including period selection';
COMMENT ON TABLE user_sessions IS 'Active user sessions for token management';
COMMENT ON TABLE global_default_preferences IS 'Global default settings managed by admins';

COMMENT ON COLUMN users.role IS 'User role: admin (all access), sales_manager (division + reps), sales_rep (own data only)';
COMMENT ON COLUMN user_preferences.period_selection IS 'JSON array of selected periods/columns for this user';
COMMENT ON COLUMN user_preferences.base_period_index IS 'Index of the base period for comparisons';
