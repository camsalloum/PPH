-- Create missing division tables for SB, TF, HCM
-- These tables will have the same structure as fp_data_excel

-- Create SB division table
CREATE TABLE IF NOT EXISTS sb_data_excel (
    id BIGSERIAL PRIMARY KEY,
    sourcesheet TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL,
    salesrepname TEXT,
    customername TEXT,
    countryname TEXT,
    productgroup TEXT NOT NULL,
    material TEXT,
    process TEXT,
    values_type TEXT NOT NULL,
    values NUMERIC,
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create TF division table
CREATE TABLE IF NOT EXISTS tf_data_excel (
    id BIGSERIAL PRIMARY KEY,
    sourcesheet TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL,
    salesrepname TEXT,
    customername TEXT,
    countryname TEXT,
    productgroup TEXT NOT NULL,
    material TEXT,
    process TEXT,
    values_type TEXT NOT NULL,
    values NUMERIC,
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create HCM division table
CREATE TABLE IF NOT EXISTS hcm_data_excel (
    id BIGSERIAL PRIMARY KEY,
    sourcesheet TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    type TEXT NOT NULL,
    salesrepname TEXT,
    customername TEXT,
    countryname TEXT,
    productgroup TEXT NOT NULL,
    material TEXT,
    process TEXT,
    values_type TEXT NOT NULL,
    values NUMERIC,
    updatedat TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_sb_data_excel_country ON sb_data_excel(countryname);
CREATE INDEX IF NOT EXISTS idx_sb_data_excel_sales_rep ON sb_data_excel(salesrepname);
CREATE INDEX IF NOT EXISTS idx_sb_data_excel_year_month ON sb_data_excel(year, month);
CREATE INDEX IF NOT EXISTS idx_sb_data_excel_type ON sb_data_excel(type);

CREATE INDEX IF NOT EXISTS idx_tf_data_excel_country ON tf_data_excel(countryname);
CREATE INDEX IF NOT EXISTS idx_tf_data_excel_sales_rep ON tf_data_excel(salesrepname);
CREATE INDEX IF NOT EXISTS idx_tf_data_excel_year_month ON tf_data_excel(year, month);
CREATE INDEX IF NOT EXISTS idx_tf_data_excel_type ON tf_data_excel(type);

CREATE INDEX IF NOT EXISTS idx_hcm_data_excel_country ON hcm_data_excel(countryname);
CREATE INDEX IF NOT EXISTS idx_hcm_data_excel_sales_rep ON hcm_data_excel(salesrepname);
CREATE INDEX IF NOT EXISTS idx_hcm_data_excel_year_month ON hcm_data_excel(year, month);
CREATE INDEX IF NOT EXISTS idx_hcm_data_excel_type ON hcm_data_excel(type);

-- Add comments to tables
COMMENT ON TABLE sb_data_excel IS 'SB division sales data imported from Excel';
COMMENT ON TABLE tf_data_excel IS 'TF division sales data imported from Excel';
COMMENT ON TABLE hcm_data_excel IS 'HCM division sales data imported from Excel';

-- Log creation
DO $$
BEGIN
    RAISE NOTICE 'Created tables: sb_data_excel, tf_data_excel, hcm_data_excel';
    RAISE NOTICE 'Tables are ready to accept data for SB, TF, HCM divisions';
END $$;