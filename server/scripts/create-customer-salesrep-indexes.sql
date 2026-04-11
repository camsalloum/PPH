-- Customer Sales Rep Mapping Performance Indexes
-- Run this script after large uploads to ensure /api/customer-sales-rep-mapping stays fast

-- Index covers division/customer/year/month filtering while reusing only AMOUNT rows
CREATE INDEX IF NOT EXISTS idx_fp_customer_salesrep_recent
ON fp_data_excel (division, customername, year DESC, month DESC)
WHERE salesrepname IS NOT NULL
  AND customername IS NOT NULL
  AND customername <> ''
  AND values_type ILIKE 'AMOUNT';

-- Secondary index to accelerate lookups by sales rep when validating mappings
CREATE INDEX IF NOT EXISTS idx_fp_salesrep_customer_recent
ON fp_data_excel (division, salesrepname, year DESC, month DESC)
WHERE salesrepname IS NOT NULL
  AND salesrepname <> ''
  AND values_type ILIKE 'AMOUNT';

-- Refresh planner statistics
ANALYZE fp_data_excel;



