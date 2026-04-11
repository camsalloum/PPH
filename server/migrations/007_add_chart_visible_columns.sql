-- Migration: Add chart_visible_columns to user_preferences
-- Description: Stores user's chart column visibility preferences

-- Add chart_visible_columns column to user_preferences table
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS chart_visible_columns JSONB;

-- Add theme_settings column if not exists (for theme customization)
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS theme_settings JSONB;

COMMENT ON COLUMN user_preferences.chart_visible_columns IS 'JSON array of column indexes visible in charts';
COMMENT ON COLUMN user_preferences.theme_settings IS 'JSON object with theme customization settings';
