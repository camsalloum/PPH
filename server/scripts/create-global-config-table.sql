-- Global Configuration Table for All Divisions
-- This table stores configuration that applies to all divisions (FP, HCM, TF, SB)

CREATE TABLE IF NOT EXISTS global_config (
  config_key VARCHAR(255) PRIMARY KEY,
  config_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_global_config_key ON global_config(config_key);

-- Create trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_global_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_global_config_updated_at 
    BEFORE UPDATE ON global_config 
    FOR EACH ROW 
    EXECUTE FUNCTION update_global_config_updated_at();

-- Insert initial global configuration values
INSERT INTO global_config (config_key, config_value, description) VALUES
('standardColumnSelection', '[]', 'Standard column selection for all divisions'),
('basePeriodIndex', '0', 'Base period index for all divisions'),
('chartVisibleColumns', '[]', 'Chart visibility settings for all divisions')
ON CONFLICT (config_key) DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE global_config IS 'Global configuration settings that apply to all divisions (FP, HCM, TF, SB)';
COMMENT ON COLUMN global_config.config_key IS 'Unique identifier for the configuration setting';
COMMENT ON COLUMN global_config.config_value IS 'JSON string containing the configuration value';
COMMENT ON COLUMN global_config.description IS 'Human-readable description of what this configuration does';
