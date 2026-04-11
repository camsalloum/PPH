-- ========================================
-- Migration: 003_add_default_division.sql
-- Add default_division column to user_preferences
-- ========================================

-- Add default_division column to user_preferences table
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS default_division VARCHAR(50);

-- Add comment for documentation
COMMENT ON COLUMN user_preferences.default_division IS 'User default division that loads automatically on login';

