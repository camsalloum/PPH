# Customer Master Data Module - Implementation Roadmap

> **Created:** December 23, 2025  
> **Status:** In Progress  
> **Priority:** HIGH - Foundation for data integrity

---

## 📋 Executive Summary

This document outlines the complete roadmap for implementing a robust Customer Master Data module inspired by ERPNext's customer management system. The goal is to:

1. **Establish unique customer identification** via customer codes
2. **Track all customer name variations** through an aliases system
3. **Enable proper customer merging** with referential integrity
4. **Support hierarchical organization** (groups, territories, industries)
5. **Provide rich analytics** by customer dimensions

---

## 🎯 Implementation Phases

### Legend
- 🔴 **HIGH** - Critical, implement immediately
- 🟡 **MEDIUM** - Important, implement after high priority
- 🟢 **LOW** - Nice to have, implement when time permits
- ✅ **DONE** - Completed
- 🔄 **IN PROGRESS** - Currently being implemented
- ⏳ **PENDING** - Not yet started

---

## Phase 1: Customer Master Database 🔴 HIGH

### Status: ✅ DONE

### Description
Create the foundation customer master table that serves as the single source of truth for all customer data.

### Database Table: `{div}_customer_master`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Internal ID |
| `customer_code` | VARCHAR(50) UNIQUE | Unique code e.g., 'FP-CUST-2025-00001' |
| `customer_name` | VARCHAR(500) | Official customer name |
| `customer_name_normalized` | VARCHAR(500) | Lowercase, cleaned for matching |
| `customer_type` | VARCHAR(50) | 'Company', 'Individual', 'Partnership' |
| `customer_group_id` | INTEGER FK | Reference to customer_groups |
| `territory_id` | INTEGER FK | Reference to territories |
| `industry_id` | INTEGER FK | Reference to industries |
| `market_segment` | VARCHAR(100) | Market segment |
| `primary_contact` | VARCHAR(255) | Primary contact name |
| `email` | VARCHAR(255) | Email address |
| `phone` | VARCHAR(50) | Phone number |
| `website` | VARCHAR(255) | Website URL |
| `address_line1` | VARCHAR(255) | Address line 1 |
| `address_line2` | VARCHAR(255) | Address line 2 |
| `city` | VARCHAR(100) | City |
| `country` | VARCHAR(100) | Country |
| `tax_id` | VARCHAR(100) | Tax identification number |
| `credit_limit` | DECIMAL(15,2) | Credit limit |
| `payment_terms` | VARCHAR(100) | Payment terms |
| `default_currency` | VARCHAR(10) | Default currency |
| `account_manager` | VARCHAR(255) | Account manager |
| `sales_rep` | VARCHAR(255) | Assigned sales rep |
| `is_active` | BOOLEAN | Active status |
| `is_merged` | BOOLEAN | If merged into another |
| `merged_into_code` | VARCHAR(50) | Parent customer code if merged |
| `division` | VARCHAR(50) | Division code |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `created_by` | VARCHAR(100) | Creator |

### Tasks
- [x] Create SQL schema
- [x] Create setup script
- [x] Add indexes for performance
- [x] Test table creation

---

## Phase 2: Customer Aliases System 🔴 HIGH

### Status: ✅ DONE

### Description
Track all known name variations for each customer. This is the key to proper merge tracking.

### Database Table: `{div}_customer_aliases`

| Column | Type | Description |
|--------|------|-------------|
| `id` | SERIAL PRIMARY KEY | Internal ID |
| `customer_code` | VARCHAR(50) FK | Reference to customer_master |
| `alias_name` | VARCHAR(500) | The alias/variation name |
| `alias_name_normalized` | VARCHAR(500) | Normalized for matching |
| `source_system` | VARCHAR(50) | Where this name came from |
| `source_file` | VARCHAR(255) | Source file name |
| `first_seen_at` | TIMESTAMP | First occurrence |
| `last_seen_at` | TIMESTAMP | Last occurrence |
| `occurrence_count` | INTEGER | How many times seen |
| `ai_confidence` | DECIMAL(3,2) | AI matching confidence |

### Tasks
- [x] Create SQL schema
- [x] Create unique constraint on (customer_code, alias_name_normalized)
- [x] Add indexes

---

## Phase 3: Customer Hierarchy Tables 🟡 MEDIUM

### Status: ⏳ PENDING

### Description
Organize customers into hierarchical structures for better analytics and management.

### 3.1 Customer Groups Table

```sql
CREATE TABLE {div}_customer_groups (
  id SERIAL PRIMARY KEY,
  group_code VARCHAR(50) UNIQUE NOT NULL,
  group_name VARCHAR(255) NOT NULL,
  parent_group_id INTEGER REFERENCES {div}_customer_groups(id),
  is_group BOOLEAN DEFAULT false,
  default_price_list VARCHAR(100),
  default_payment_terms VARCHAR(100),
  lft INTEGER,  -- Nested set for hierarchy
  rgt INTEGER,
  division VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 Territories Table

```sql
CREATE TABLE {div}_territories (
  id SERIAL PRIMARY KEY,
  territory_code VARCHAR(50) UNIQUE NOT NULL,
  territory_name VARCHAR(255) NOT NULL,
  parent_territory_id INTEGER REFERENCES {div}_territories(id),
  territory_manager VARCHAR(255),
  region VARCHAR(100),
  country VARCHAR(100),
  lft INTEGER,
  rgt INTEGER,
  division VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 Industries Table

```sql
CREATE TABLE {div}_industries (
  id SERIAL PRIMARY KEY,
  industry_code VARCHAR(50) UNIQUE NOT NULL,
  industry_name VARCHAR(255) NOT NULL,
  parent_industry_id INTEGER REFERENCES {div}_industries(id),
  description TEXT,
  division VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Tasks
- [ ] Create Customer Groups SQL
- [ ] Create Territories SQL
- [ ] Create Industries SQL
- [ ] Create default data (UAE territories, common industries)
- [ ] Update Customer Master to reference these tables
- [ ] Create UI for managing hierarchies
- [ ] Add tree visualization component

---

## Phase 4: Customer Links Table 🟡 MEDIUM

### Status: ⏳ PENDING

### Description
Track relationships between customers (subsidiaries, branches, former names).

### Database Table: `{div}_customer_links`

```sql
CREATE TABLE {div}_customer_links (
  id SERIAL PRIMARY KEY,
  primary_customer_code VARCHAR(50) NOT NULL,
  linked_customer_code VARCHAR(50) NOT NULL,
  link_type VARCHAR(50) NOT NULL,  -- 'SUBSIDIARY', 'BRANCH', 'PARENT', 'SISTER_COMPANY'
  link_direction VARCHAR(20) DEFAULT 'BIDIRECTIONAL',  -- 'ONE_WAY', 'BIDIRECTIONAL'
  relationship_start_date DATE,
  relationship_end_date DATE,
  notes TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (primary_customer_code) REFERENCES {div}_customer_master(customer_code),
  FOREIGN KEY (linked_customer_code) REFERENCES {div}_customer_master(customer_code),
  UNIQUE(primary_customer_code, linked_customer_code, link_type)
);
```

### Link Types
- `SUBSIDIARY` - Child company
- `PARENT` - Parent company
- `BRANCH` - Branch office
- `SISTER_COMPANY` - Related company
- `FORMER_NAME` - Previous company name (after rename)
- `ACQUISITION` - Acquired company

### Tasks
- [ ] Create SQL schema
- [ ] Create service for managing links
- [ ] Create UI for viewing customer relationships
- [ ] Add relationship diagram visualization

---

## Phase 5: Merge Rules Enhancement 🔴 HIGH

### Status: ✅ DONE

### Description
Update existing merge rules to use customer codes for better tracking.

### Changes to `{div}_division_customer_merge_rules`

```sql
ALTER TABLE {div}_division_customer_merge_rules 
ADD COLUMN merge_code VARCHAR(50) UNIQUE,
ADD COLUMN master_customer_code VARCHAR(50);
```

### Merge Code Format
- Pattern: `{DIV}-MRG-{YEAR}-{SEQUENCE}`
- Example: `FP-MRG-2025-00001`

### Tasks
- [x] Add merge_code column
- [x] Add master_customer_code column
- [x] Create function to generate merge codes
- [x] Update API endpoints to return merge_code
- [x] Update frontend to display merge_code

---

## Phase 6: Analytics Enhancements 🟢 LOW

### Status: ⏳ PENDING

### Description
Enhance reports with customer dimension analytics.

### New Report Dimensions
- Group by Customer Group
- Group by Territory
- Group by Industry
- Group by Market Segment
- Roll-up to parent groups

### Customer Dashboard
- Total sales value (all time, YTD, MTD)
- Sales trend chart
- Top products purchased
- Payment history
- Open orders
- Credit utilization
- Comparison vs previous period

### Tasks
- [ ] Add group-by options to existing reports
- [ ] Create Customer 360 dashboard page
- [ ] Add customer drill-down from all reports
- [ ] Create customer comparison report
- [ ] Add customer ranking report

---

## Phase 7: AI Integration Enhancement 🟡 MEDIUM

### Status: ⏳ PENDING

### Description
Enhance AI to work with the customer master system.

### Auto-population Flow

```
1. Excel Upload
   ↓
2. Extract unique customer names
   ↓
3. Normalize names (lowercase, remove suffixes)
   ↓
4. Check customer_master by normalized name
   ↓
   ├── FOUND → Link to existing customer_code
   ↓
5. Check customer_aliases by normalized name
   ↓
   ├── FOUND → Get customer_code from alias
   ↓
6. Run AI similarity against all existing customers
   ↓
   ├── HIGH (>90%) → Auto-create alias, link to customer
   ├── MEDIUM (70-90%) → Create suggestion for review
   └── LOW (<70%) → Create new customer master record
```

### Tasks
- [ ] Update CustomerMergingAI to check customer_master first
- [ ] Create auto-alias creation logic
- [ ] Update suggestions to reference customer_codes
- [ ] Create bulk customer import with AI matching
- [ ] Add confidence threshold settings

---

## Phase 8: Customer Master UI 🟡 MEDIUM

### Status: ⏳ PENDING

### Description
Create comprehensive UI for managing customer master data.

### Pages to Create

1. **Customer List Page** (`/master-data/customers`)
   - Searchable/filterable table
   - Quick actions (edit, view, merge)
   - Export to Excel
   - Bulk import

2. **Customer Detail Page** (`/master-data/customers/:code`)
   - Customer profile card
   - All aliases list
   - Sales history
   - Related customers (links)
   - Activity timeline

3. **Customer Merge UI** (enhance existing)
   - Show customer codes
   - Visual merge preview
   - Alias management

4. **Hierarchy Management**
   - Customer Groups tree editor
   - Territories tree editor
   - Industries list editor

### Tasks
- [ ] Create CustomerListPage component
- [ ] Create CustomerDetailPage component
- [ ] Add customer search autocomplete
- [ ] Create hierarchy tree editors
- [ ] Add bulk import wizard

---

## Phase 9: Data Migration 🟡 MEDIUM

### Status: ⏳ PENDING

### Description
Migrate existing data to the new customer master system.

### Migration Steps

1. **Extract unique customers from all sources**
   - fp_data_excel
   - fp_sales_rep_budget
   - fp_sales_rep_budget_draft

2. **Create customer_master records**
   - Generate unique customer_code for each
   - Set customer_name to most common variation
   - Normalize all names

3. **Create customer_aliases**
   - Map all name variations to customer_codes
   - Track source system

4. **Update merge rules**
   - Generate merge_codes for existing rules
   - Link to master_customer_code

5. **Validate data integrity**
   - All aliases point to valid customers
   - All merges have valid codes
   - No orphan records

### Tasks
- [ ] Create migration script
- [ ] Create validation script
- [ ] Create rollback script
- [ ] Test on development database
- [ ] Create migration report

---

## Phase 10: API Enhancements 🟢 LOW

### Status: ⏳ PENDING

### Description
Create comprehensive API for customer master operations.

### New Endpoints

```
# Customer Master CRUD
GET    /api/customers                     - List customers with filters
GET    /api/customers/:code               - Get customer by code
POST   /api/customers                     - Create customer
PUT    /api/customers/:code               - Update customer
DELETE /api/customers/:code               - Delete/deactivate customer

# Customer Aliases
GET    /api/customers/:code/aliases       - Get all aliases
POST   /api/customers/:code/aliases       - Add alias
DELETE /api/customers/:code/aliases/:id   - Remove alias

# Customer Links
GET    /api/customers/:code/links         - Get related customers
POST   /api/customers/:code/links         - Create link
DELETE /api/customers/:code/links/:id     - Remove link

# Customer Analytics
GET    /api/customers/:code/sales         - Sales history
GET    /api/customers/:code/dashboard     - Dashboard metrics
GET    /api/customers/:code/timeline      - Activity timeline

# Hierarchy Management
GET    /api/customer-groups               - List groups (tree)
POST   /api/customer-groups               - Create group
GET    /api/territories                   - List territories (tree)
POST   /api/territories                   - Create territory
GET    /api/industries                    - List industries
POST   /api/industries                    - Create industry

# Bulk Operations
POST   /api/customers/bulk-import         - Import from Excel
POST   /api/customers/bulk-merge          - Merge multiple customers
POST   /api/customers/validate            - Validate customer data
```

### Tasks
- [ ] Create CustomerMasterService
- [ ] Create API routes file
- [ ] Add authentication/authorization
- [ ] Create API documentation
- [ ] Add rate limiting

---

## 📊 Implementation Timeline

| Phase | Priority | Estimated Effort | Dependencies | Target Date |
|-------|----------|------------------|--------------|-------------|
| Phase 1: Customer Master | 🔴 HIGH | 1 day | None | ✅ Dec 23, 2025 |
| Phase 2: Customer Aliases | 🔴 HIGH | 1 day | Phase 1 | ✅ Dec 23, 2025 |
| Phase 5: Merge Rules Update | 🔴 HIGH | 1 day | Phase 1-2 | ✅ Dec 23, 2025 |
| Phase 3: Hierarchy Tables | 🟡 MEDIUM | 2 days | Phase 1 | Jan 2026 |
| Phase 4: Customer Links | 🟡 MEDIUM | 1 day | Phase 1 | Jan 2026 |
| Phase 7: AI Integration | 🟡 MEDIUM | 2 days | Phase 1-2 | Jan 2026 |
| Phase 8: Customer Master UI | 🟡 MEDIUM | 3 days | Phase 1-4 | Jan 2026 |
| Phase 9: Data Migration | 🟡 MEDIUM | 2 days | Phase 1-5 | Jan 2026 |
| Phase 6: Analytics | 🟢 LOW | 3 days | Phase 1-3 | Feb 2026 |
| Phase 10: API Enhancements | 🟢 LOW | 2 days | Phase 1-8 | Feb 2026 |

---

## 🔧 Technical Notes

### Customer Code Generation

```javascript
// Pattern: {DIVISION}-CUST-{YEAR}-{SEQUENCE}
function generateCustomerCode(division) {
  const year = new Date().getFullYear();
  const sequence = await getNextSequence(division, 'customer', year);
  return `${division}-CUST-${year}-${String(sequence).padStart(5, '0')}`;
}
// Example: FP-CUST-2025-00001
```

### Merge Code Generation

```javascript
// Pattern: {DIVISION}-MRG-{YEAR}-{SEQUENCE}
function generateMergeCode(division) {
  const year = new Date().getFullYear();
  const sequence = await getNextSequence(division, 'merge', year);
  return `${division}-MRG-${year}-${String(sequence).padStart(5, '0')}`;
}
// Example: FP-MRG-2025-00001
```

### Name Normalization

```javascript
function normalizeCustomerName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\b(llc|l\.l\.c|ltd|limited|inc|corp|co|est|fze|fzc)\b/gi, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
```

---

## 📁 File Structure

```
server/
├── database/
│   ├── CustomerMasterService.js      # Customer CRUD operations
│   ├── CustomerAliasService.js       # Alias management
│   └── CustomerLinkService.js        # Relationship management
├── routes/
│   ├── customerMaster.js             # Customer API endpoints
│   └── customerHierarchy.js          # Hierarchy management
├── scripts/
│   ├── create-customer-master-tables.sql
│   ├── migrate-existing-customers.js
│   └── validate-customer-data.js
└── services/
    └── CustomerMergingAI.js          # (Updated with customer codes)

src/
├── components/
│   └── MasterData/
│       ├── CustomerMaster/
│       │   ├── CustomerListPage.js
│       │   ├── CustomerDetailPage.js
│       │   └── CustomerForm.js
│       └── CustomerMerging/
│           └── CustomerMergingPage.js  # (Enhanced)
└── services/
    └── customerMasterApi.js
```

---

## ✅ Acceptance Criteria

### Phase 1-2 (HIGH Priority)
- [x] Customer master table created with all columns
- [x] Customer aliases table created
- [x] Unique constraints enforced
- [x] Indexes created for performance
- [x] Tables created for all divisions dynamically

### Phase 5 (HIGH Priority)
- [x] merge_code column added to merge rules
- [x] Merge codes auto-generated on rule creation
- [x] Existing rules can be queried by merge_code
- [x] API returns merge_code in responses

### Future Phases
- [ ] Hierarchy tables support tree operations
- [ ] Customer links track all relationship types
- [ ] AI uses customer codes for matching
- [ ] UI allows full customer management
- [ ] Data migration preserves all existing data
- [ ] Reports support customer dimension grouping
- [ ] API is fully documented

---

## 📞 Support & Questions

For questions about this implementation, contact the development team or refer to:
- ERPNext Customer DocType: `erpnext/selling/doctype/customer/`
- Current merge system: `server/routes/divisionMergeRules.js`
- AI service: `server/services/CustomerMergingAI.js`

---

*Last Updated: December 23, 2025*
