const XLSX = require('xlsx');
const path = require('path');

// ============================================================
// FP_CUSTOMER_MASTER - UNIFIED DESIGN TEMPLATE
// ============================================================
// This template shows the proposed structure for a single
// unified customer master table that will sync across:
// - Dashboard (sales data views)
// - AEBF (budget allocation)  
// - CRM (customer relationship management)
// ============================================================

const columns = [
  // === IDENTIFICATION (Core) ===
  { 
    field: 'customer_code', 
    old_header: 'customer_code',
    type: 'TEXT PRIMARY KEY',
    source: 'Normalized customer name',
    description: 'Unique customer identifier (normalized name, lowercase, alphanumeric only)',
    example: 'kamdak_food_trading'
  },
  { 
    field: 'customer_name', 
    old_header: 'customername',
    type: 'VARCHAR(500)',
    source: 'fp_data_excel.customername',
    description: 'Original customer name as imported from Excel',
    example: 'Kamdak Food Trading'
  },
  { 
    field: 'customer_name_normalized', 
    old_header: 'NEW',
    type: 'VARCHAR(500)',
    source: 'Computed',
    description: 'Cleaned name for matching (UPPER, trimmed, standardized)',
    example: 'KAMDAK FOOD TRADING'
  },
  { 
    field: 'display_name', 
    old_header: 'NEW',
    type: 'VARCHAR(500)',
    source: 'User editable',
    description: 'Preferred display name (can be edited by user)',
    example: 'Kamdak Food Trading LLC'
  },

  // === MERGE STATUS ===
  { 
    field: 'is_merged', 
    old_header: 'is_merged',
    type: 'BOOLEAN DEFAULT FALSE',
    source: 'Computed from merge rules',
    description: 'TRUE if this customer was merged INTO another customer',
    example: 'FALSE'
  },
  { 
    field: 'merged_into_code', 
    old_header: 'merged_into_code',
    type: 'VARCHAR(500)',
    source: 'fp_division_customer_merge_rules',
    description: 'If is_merged=TRUE, the customer_code this was merged into',
    example: 'null'
  },
  { 
    field: 'merged_from_codes', 
    old_header: 'NEW',
    type: 'TEXT[]',
    source: 'Computed from merge rules',
    description: 'Array of customer codes that were merged INTO this customer',
    example: '["kamdak_old", "kamdak_dubai"]'
  },
  { 
    field: 'original_names', 
    old_header: 'NEW',
    type: 'TEXT[]',
    source: 'Computed from merge rules',
    description: 'Array of original names before merge (for reference)',
    example: '["Kamdak Old", "Kamdak Dubai Branch"]'
  },

  // === SALES REP & GROUPING ===
  { 
    field: 'sales_rep', 
    old_header: 'salesrepname',
    type: 'VARCHAR(200)',
    source: 'Latest from fp_data_excel OR manual assignment',
    description: 'Primary sales rep assigned to this customer',
    example: 'Sofiane Salah'
  },
  { 
    field: 'sales_rep_normalized', 
    old_header: 'NEW',
    type: 'VARCHAR(200)',
    source: 'Computed',
    description: 'Normalized sales rep name for matching',
    example: 'SOFIANE SALAH'
  },
  { 
    field: 'sales_rep_group', 
    old_header: 'NEW',
    type: 'VARCHAR(200)',
    source: 'sales_rep_groups via sales_rep_group_members',
    description: 'Sales rep group name (auto-looked up from grouping table)',
    example: 'Sofiane & Team'
  },
  { 
    field: 'sales_rep_group_id', 
    old_header: 'NEW',
    type: 'INTEGER',
    source: 'sales_rep_groups.id',
    description: 'Foreign key to sales_rep_groups table',
    example: '3'
  },

  // === GEOGRAPHY ===
  { 
    field: 'country', 
    old_header: 'countryname',
    type: 'VARCHAR(100)',
    source: 'Most frequent from fp_data_excel',
    description: 'Primary country for this customer',
    example: 'United Arab Emirates'
  },
  { 
    field: 'country_normalized', 
    old_header: 'NEW',
    type: 'VARCHAR(100)',
    source: 'Computed',
    description: 'Normalized country name',
    example: 'UNITED ARAB EMIRATES'
  },
  { 
    field: 'countries', 
    old_header: 'NEW',
    type: 'TEXT[]',
    source: 'All countries from fp_data_excel for this customer',
    description: 'Array of all countries where this customer has transactions',
    example: '["United Arab Emirates", "Oman"]'
  },
  { 
    field: 'territory', 
    old_header: 'territory',
    type: 'VARCHAR(100)',
    source: 'CRM / Manual',
    description: 'Sales territory assignment',
    example: 'GCC'
  },
  { 
    field: 'city', 
    old_header: 'city',
    type: 'VARCHAR(100)',
    source: 'CRM / Manual',
    description: 'City',
    example: 'Dubai'
  },
  { 
    field: 'address_line1', 
    old_header: 'address_line1',
    type: 'VARCHAR(500)',
    source: 'CRM / Manual',
    description: 'Address line 1',
    example: 'PO Box 12345'
  },
  { 
    field: 'address_line2', 
    old_header: 'address_line2',
    type: 'VARCHAR(500)',
    source: 'CRM / Manual',
    description: 'Address line 2',
    example: 'Industrial Area 3'
  },
  { 
    field: 'postal_code', 
    old_header: 'postal_code',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Postal/ZIP code',
    example: '12345'
  },
  { 
    field: 'latitude', 
    old_header: 'latitude',
    type: 'DECIMAL(10,7)',
    source: 'CRM Map / Manual',
    description: 'GPS latitude for map',
    example: '25.2048493'
  },
  { 
    field: 'longitude', 
    old_header: 'longitude',
    type: 'DECIMAL(10,7)',
    source: 'CRM Map / Manual',
    description: 'GPS longitude for map',
    example: '55.2707828'
  },
  { 
    field: 'pin_confirmed', 
    old_header: 'pin_confirmed',
    type: 'BOOLEAN DEFAULT FALSE',
    source: 'CRM Map',
    description: 'Has location been confirmed on map?',
    example: 'FALSE'
  },

  // === PRODUCT GROUPS (from Material Percentages) ===
  { 
    field: 'product_groups', 
    old_header: 'productgroup',
    type: 'TEXT[]',
    source: 'Distinct from fp_data_excel',
    description: 'Array of all product groups this customer purchases',
    example: '["Shrink Film Plain", "Laminates"]'
  },
  { 
    field: 'pg_combined', 
    old_header: 'NEW',
    type: 'JSONB',
    source: 'Computed from fp_material_percentages',
    description: 'Material/Process breakdown: {"PE Printed": 45%, "PE Plain": 30%, "Non PE Printed": 25%}',
    example: '{"PE Printed": 45, "PE Plain": 30, "Non PE Printed": 25}'
  },
  { 
    field: 'primary_material', 
    old_header: 'NEW',
    type: 'VARCHAR(50)',
    source: 'Computed from pg_combined (highest %)',
    description: 'Most common material type',
    example: 'PE'
  },
  { 
    field: 'primary_process', 
    old_header: 'NEW',
    type: 'VARCHAR(50)',
    source: 'Computed from pg_combined (highest %)',
    description: 'Most common process type',
    example: 'Printed'
  },

  // === SALES METRICS (Aggregated) ===
  { 
    field: 'total_sales_all_time', 
    old_header: 'NEW',
    type: 'DECIMAL(15,2)',
    source: 'SUM from fp_data_excel WHERE values_type=Sales',
    description: 'Total sales across all years',
    example: '1500000.00'
  },
  { 
    field: 'total_sales_current_year', 
    old_header: 'NEW',
    type: 'DECIMAL(15,2)',
    source: 'SUM from fp_data_excel WHERE year=CURRENT',
    description: 'Sales in current year',
    example: '250000.00'
  },
  { 
    field: 'total_sales_last_year', 
    old_header: 'NEW',
    type: 'DECIMAL(15,2)',
    source: 'SUM from fp_data_excel WHERE year=CURRENT-1',
    description: 'Sales in previous year',
    example: '300000.00'
  },
  { 
    field: 'first_transaction_date', 
    old_header: 'NEW',
    type: 'DATE',
    source: 'MIN(year,month) from fp_data_excel',
    description: 'First transaction date',
    example: '2020-03-01'
  },
  { 
    field: 'last_transaction_date', 
    old_header: 'NEW',
    type: 'DATE',
    source: 'MAX(year,month) from fp_data_excel',
    description: 'Most recent transaction date',
    example: '2025-06-01'
  },
  { 
    field: 'transaction_years', 
    old_header: 'NEW',
    type: 'INTEGER[]',
    source: 'DISTINCT years from fp_data_excel',
    description: 'Years with transactions',
    example: '[2020, 2021, 2022, 2023, 2024, 2025]'
  },

  // === CRM FIELDS ===
  { 
    field: 'customer_type', 
    old_header: 'customer_type',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Customer type (Direct, Distributor, Agent, etc)',
    example: 'Direct'
  },
  { 
    field: 'customer_group', 
    old_header: 'customer_group',
    type: 'VARCHAR(100)',
    source: 'CRM / Manual',
    description: 'Customer grouping',
    example: 'Food & Beverage'
  },
  { 
    field: 'industry', 
    old_header: 'industry',
    type: 'VARCHAR(100)',
    source: 'CRM / Manual',
    description: 'Industry sector',
    example: 'Food Processing'
  },
  { 
    field: 'market_segment', 
    old_header: 'market_segment',
    type: 'VARCHAR(100)',
    source: 'CRM / Manual',
    description: 'Market segment',
    example: 'Industrial'
  },
  { 
    field: 'customer_status', 
    old_header: 'customer_status',
    type: 'VARCHAR(50)',
    source: 'Computed / Manual',
    description: 'Active, Inactive, Prospect, Churned',
    example: 'Active'
  },
  { 
    field: 'is_active', 
    old_header: 'is_active',
    type: 'BOOLEAN DEFAULT TRUE',
    source: 'Computed (has sales in last 12 months)',
    description: 'Is customer currently active?',
    example: 'TRUE'
  },

  // === CONTACT INFO ===
  { 
    field: 'primary_contact', 
    old_header: 'primary_contact',
    type: 'VARCHAR(200)',
    source: 'CRM / Manual',
    description: 'Primary contact person name',
    example: 'Ahmed Ali'
  },
  { 
    field: 'email', 
    old_header: 'email',
    type: 'VARCHAR(200)',
    source: 'CRM / Manual',
    description: 'Primary email',
    example: 'ahmed@kamdak.com'
  },
  { 
    field: 'phone', 
    old_header: 'phone',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Phone number',
    example: '+971 4 123 4567'
  },
  { 
    field: 'mobile', 
    old_header: 'mobile',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Mobile number',
    example: '+971 50 123 4567'
  },
  { 
    field: 'website', 
    old_header: 'website',
    type: 'VARCHAR(200)',
    source: 'CRM / Manual',
    description: 'Company website',
    example: 'www.kamdak.com'
  },

  // === FINANCIAL ===
  { 
    field: 'credit_limit', 
    old_header: 'credit_limit',
    type: 'DECIMAL(15,2)',
    source: 'CRM / Manual',
    description: 'Credit limit amount',
    example: '100000.00'
  },
  { 
    field: 'payment_terms', 
    old_header: 'payment_terms',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Payment terms (Net 30, etc)',
    example: 'Net 30'
  },
  { 
    field: 'default_currency', 
    old_header: 'default_currency',
    type: 'VARCHAR(10)',
    source: 'CRM / Manual',
    description: 'Default currency code',
    example: 'AED'
  },
  { 
    field: 'tax_id', 
    old_header: 'tax_id',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Tax registration number',
    example: 'TRN123456789'
  },
  { 
    field: 'trade_license', 
    old_header: 'trade_license',
    type: 'VARCHAR(50)',
    source: 'CRM / Manual',
    description: 'Trade license number',
    example: 'TL-2023-12345'
  },

  // === ADMINISTRATIVE ===
  { 
    field: 'division', 
    old_header: 'division',
    type: 'VARCHAR(10)',
    source: 'Always FP',
    description: 'Division code',
    example: 'FP'
  },
  { 
    field: 'account_manager', 
    old_header: 'account_manager',
    type: 'VARCHAR(200)',
    source: 'CRM / Manual',
    description: 'Account manager (if different from sales rep)',
    example: 'James Smith'
  },
  { 
    field: 'notes', 
    old_header: 'notes',
    type: 'TEXT',
    source: 'CRM / Manual',
    description: 'Free-form notes',
    example: 'Key account, priority customer'
  },
  { 
    field: 'created_at', 
    old_header: 'created_at',
    type: 'TIMESTAMP DEFAULT NOW()',
    source: 'System',
    description: 'Record creation timestamp',
    example: '2024-01-15 10:30:00'
  },
  { 
    field: 'updated_at', 
    old_header: 'updated_at',
    type: 'TIMESTAMP DEFAULT NOW()',
    source: 'System (auto-update)',
    description: 'Record last update timestamp',
    example: '2025-01-08 14:22:00'
  },
  { 
    field: 'created_by', 
    old_header: 'created_by',
    type: 'VARCHAR(100)',
    source: 'System',
    description: 'User who created the record',
    example: 'admin'
  },
  { 
    field: 'updated_by', 
    old_header: 'updated_by',
    type: 'VARCHAR(100)',
    source: 'System',
    description: 'User who last updated the record',
    example: 'admin'
  }
];

// Create workbook
const workbook = XLSX.utils.book_new();

// Sheet 1: Column Definition
const sheet1Data = columns.map(c => ({
  'Field Name': c.field,
  'Old Header': c.old_header,
  'Data Type': c.type,
  'Data Source': c.source,
  'Description': c.description,
  'Example': c.example
}));
const sheet1 = XLSX.utils.json_to_sheet(sheet1Data);

// Set column widths
sheet1['!cols'] = [
  { wch: 25 },  // Field Name
  { wch: 20 },  // Old Header
  { wch: 30 },  // Data Type
  { wch: 40 },  // Data Source
  { wch: 60 },  // Description
  { wch: 40 }   // Example
];

XLSX.utils.book_append_sheet(workbook, sheet1, 'Column Definition');

// Sheet 2: Summary by Category
const categories = [
  { category: 'IDENTIFICATION', count: 4, fields: 'customer_code, customer_name, customer_name_normalized, display_name' },
  { category: 'MERGE STATUS', count: 4, fields: 'is_merged, merged_into_code, merged_from_codes, original_names' },
  { category: 'SALES REP & GROUPING', count: 4, fields: 'sales_rep, sales_rep_normalized, sales_rep_group, sales_rep_group_id' },
  { category: 'GEOGRAPHY', count: 12, fields: 'country, country_normalized, countries, territory, city, address_line1, address_line2, postal_code, latitude, longitude, pin_confirmed' },
  { category: 'PRODUCT GROUPS', count: 4, fields: 'product_groups, pg_combined, primary_material, primary_process' },
  { category: 'SALES METRICS', count: 6, fields: 'total_sales_all_time, total_sales_current_year, total_sales_last_year, first_transaction_date, last_transaction_date, transaction_years' },
  { category: 'CRM FIELDS', count: 6, fields: 'customer_type, customer_group, industry, market_segment, customer_status, is_active' },
  { category: 'CONTACT INFO', count: 5, fields: 'primary_contact, email, phone, mobile, website' },
  { category: 'FINANCIAL', count: 5, fields: 'credit_limit, payment_terms, default_currency, tax_id, trade_license' },
  { category: 'ADMINISTRATIVE', count: 5, fields: 'division, account_manager, notes, created_at, updated_at, created_by, updated_by' }
];
const sheet2 = XLSX.utils.json_to_sheet(categories);
sheet2['!cols'] = [
  { wch: 25 },
  { wch: 10 },
  { wch: 100 }
];
XLSX.utils.book_append_sheet(workbook, sheet2, 'Summary by Category');

// Sheet 3: Auto-Sync Rules
const syncRules = [
  { trigger: 'New merge rule created', action: 'Set is_merged=TRUE on source, add source to merged_from_codes on target' },
  { trigger: 'Merge rule deleted', action: 'Set is_merged=FALSE on source, remove from merged_from_codes on target' },
  { trigger: 'New sales data imported', action: 'Update sales metrics, product_groups, countries, last_transaction_date' },
  { trigger: 'Sales rep group changed', action: 'Update sales_rep_group and sales_rep_group_id' },
  { trigger: 'Material percentages updated', action: 'Recalculate pg_combined, primary_material, primary_process' },
  { trigger: 'No sales in 12 months', action: 'Set is_active=FALSE, customer_status=Inactive' },
  { trigger: 'New transaction after inactive', action: 'Set is_active=TRUE, customer_status=Active' }
];
const sheet3 = XLSX.utils.json_to_sheet(syncRules);
sheet3['!cols'] = [
  { wch: 35 },
  { wch: 80 }
];
XLSX.utils.book_append_sheet(workbook, sheet3, 'Auto-Sync Rules');

// Sheet 4: Module Usage
const moduleUsage = [
  { module: 'Dashboard', reads: 'customer_name, display_name, sales_rep, country, product_groups, sales metrics', writes: 'None (read-only)' },
  { module: 'AEBF Budget', reads: 'customer_code, customer_name, sales_rep, sales_rep_group, pg_combined', writes: 'None (uses for allocation)' },
  { module: 'CRM', reads: 'All fields', writes: 'Contact info, financial, geographic, notes' },
  { module: 'Customer Merging', reads: 'customer_code, customer_name, is_merged, merged_into_code', writes: 'Updates via merge rules' },
  { module: 'Map View', reads: 'customer_name, country, latitude, longitude, pin_confirmed', writes: 'latitude, longitude, pin_confirmed' }
];
const sheet4 = XLSX.utils.json_to_sheet(moduleUsage);
sheet4['!cols'] = [
  { wch: 20 },
  { wch: 70 },
  { wch: 50 }
];
XLSX.utils.book_append_sheet(workbook, sheet4, 'Module Usage');

// Write file
const outputPath = path.join(__dirname, '..', 'fp_customer_master_design.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`\n✅ Excel template created: ${outputPath}`);
console.log(`\nSheets included:`);
console.log(`  1. Column Definition - All ${columns.length} columns with types and descriptions`);
console.log(`  2. Summary by Category - Grouped field counts`);
console.log(`  3. Auto-Sync Rules - How data syncs automatically`);
console.log(`  4. Module Usage - Which modules read/write which fields`);
