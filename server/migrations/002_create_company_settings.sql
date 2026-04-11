-- Company Settings Table for White-Label Customization
-- This allows each deployment to be customized for any company

CREATE TABLE IF NOT EXISTS company_settings (
    id SERIAL PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value JSONB NOT NULL,
    updated_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX idx_company_settings_key ON company_settings(setting_key);

-- Insert default company settings
INSERT INTO company_settings (setting_key, setting_value) VALUES
('company_name', '"Your Company Name"'::jsonb),
('company_logo_url', 'null'::jsonb),
('divisions', '[
    {"code": "FP", "name": "Food Packaging"},
    {"code": "HC", "name": "Home Care"}
]'::jsonb)
ON CONFLICT (setting_key) DO NOTHING;

-- Create trigger for updated_at
CREATE TRIGGER update_company_settings_updated_at 
    BEFORE UPDATE ON company_settings
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE company_settings IS 'White-label company settings - logo, name, divisions, etc.';
COMMENT ON COLUMN company_settings.setting_key IS 'Unique key for the setting (company_name, company_logo_url, divisions, etc.)';
COMMENT ON COLUMN company_settings.setting_value IS 'JSON value for the setting - allows flexible data structures';
