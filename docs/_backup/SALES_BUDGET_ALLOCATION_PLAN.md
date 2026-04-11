# SALES BUDGET ALLOCATION SYSTEM - Technical Plan (AUDITED & REVISED v4)

**Date Created**: January 16, 2026  
**Date Updated**: January 17, 2026 - **IMPLEMENTATION COMPLETE**  
**Purpose**: Management tool to allocate sales budgets per SALES REP GROUP per product group based on actuals and rep submissions  
**User**: Management only (with permission: `budget:allocation:manage`)

---

## 📝 IMPLEMENTATION HISTORY

### Initial Request (Jan 16, 2026)
User requested a **Sales Budget Allocation System** where management can:
- Set budgets for sales reps based on **2025 actuals**, **rep's submitted 2026 budgets**, and **management decisions**
- View comparison data and allocate final budgets

### Issues & Corrections During Development

| Issue | User Feedback | Resolution |
|-------|---------------|------------|
| **Wrong Concept** | Initial implementation used INDIVIDUAL sales rep names | Changed to **SALES REP GROUPS** (groups of reps like "Riad & Nidal", "Sojy & Hisham") |
| **Hardcoded Years** | Years were hardcoded as 2025/2026/2027 | Added **dynamic year dropdowns** for Actual Year, Div Budget Year, Budget Year |
| **Too Many Values** | Showed Amount, MoRM, KGS | Simplified to show **ONLY MT (KGS)** values |
| **Dropdown Empty** | Sales Rep dropdown was empty | Fixed API endpoint and dropdown binding |
| **Wrong API** | Used `sales-rep-allocation` (individual reps) | Changed to `sales-rep-group-allocation` (groups) |
| **Missing Div Budget** | No divisional budget reference shown | Added **Div Budget column** for comparison |

### What Was Built

**Backend API** (`server/routes/sales-rep-group-allocation.js`):
- `GET /groups` - Returns all sales rep groups with member counts
- `POST /load-data` - Loads actual, submitted, and draft data for a group
- `POST /save-draft` - Saves management allocation as draft
- `POST /submit-final` - Approves the allocation

**Frontend Component** (`src/components/MasterData/AEBF/ManagementAllocationTab.jsx`):
- Sales Rep Group dropdown (shows group name + member count)
- Year selectors: Actual Year, Div Budget Year, Budget Year
- Table showing ALL product groups with:
  - Actual sales (MT) for the group
  - Divisional Budget (MT) for reference
  - Group's Submitted Budget (MT) - sum of all reps in group
  - Management Allocation (editable KGS input)
- Summary cards with totals
- Save Draft and Approve Budget buttons
- Shows group members when a group is selected

### Current Status: ✅ COMPLETE
- Navigate to: **Master Data → AEBF → Management Allocation Tab**
- Select a Sales Rep Group (e.g., "Sojy & Hisham & Direct Sales (6 reps)")
- Select years and click "Load Data"
- Edit allocations and Save Draft or Approve

---

## 🚨 CRITICAL AUDIT FINDINGS - MUST READ FIRST!

### Finding 1: USE SALES REP GROUPS (NOT RAW NAMES!)
The system uses **Sales Rep Groups** - multiple raw sales reps are grouped together:
- `sales_rep_groups` table defines groups (e.g., "Riad & Nidal", "Sojy & Hisham & Direct Sales")
- `sales_rep_group_members` table maps raw names to groups
- The `DataFilteringHelper.buildSalesRepGroupSQL()` function resolves raw → group

**Example Groups (FP Division):**
| Group Name | Members |
|------------|---------|
| Narek Koroukian | Narek Koroukian, Salil Punnilath |
| Riad & Nidal | Direct Sales – Riad, Nidal Hanan, Riad Al Zier |
| Sojy & Hisham & Direct Sales | Direct Sales, Direct Sales F&B, Harwal Company Limited, Mohammed Hisham, Sojy Jose Ukken, Tinu Sam |
| Sofiane & Team | Mouhcine Fellah, Olivier Baharian, Sofiane Salah |
| James & Rania | James Kassab, Rania, Rania Sleem |
| Others | 28 members (catch-all) |

### Finding 2: UNIQUE CONSTRAINT REQUIRES CUSTOMER_NAME
**Existing Index:**
```sql
idx_budget_unique_salesrep ON fp_budget_unified (pgcombine, month_no, budget_year, division_code, sales_rep_name, customer_name) 
WHERE sales_rep_name IS NOT NULL
```

**Impact:** We **CANNOT** insert rows without `customer_name` when `sales_rep_name` is set.

### Finding 3: Product Groups are FIXED (13 PGCombine Values)
From `fp_product_group_pricing_rounding` for FP:
- Commercial Items Plain/Printed
- Industrial Items Plain/Printed  
- Shrink Film Plain/Printed
- Labels, Laminates, Mono Layer Printed, Shrink Sleeves, Wide Film, Wrap Around Label, Others
- Services Charges (excluded from budgets)

### Finding 4: Pricing Data Available
`fp_product_group_pricing_rounding` has ASP and MORM per product group per year (2024, 2025, 2026)

---

## ✅ REVISED APPROACH: NEW TABLE FOR GROUP-LEVEL ALLOCATION

### Why NOT Reuse fp_budget_unified?
1. UNIQUE index requires `customer_name` when `sales_rep_name` is set
2. Existing data is at (sales_rep + customer + PG + month) level
3. We need (sales_rep_GROUP + PG + month) level - AGGREGATED

### Solution: ONE New Table for Group-Level Allocations

## 📋 BUSINESS REQUIREMENTS SUMMARY (CORRECTED)

### What Management Needs:
1. **View consolidated data** for each **SALES REP GROUP** + product group:
   - 2025 Actual KGS sold (from `fp_actualcommon` - AGGREGATED by GROUP + PG)
   - 2026 Budget KGS (what sales rep submitted - AGGREGATED from customer-level by GROUP)
   - Enter Final Budget KGS (management decision - NEW: stored at GROUP + PG level)

2. **Set yearly budget first**, then distribute to months using percentage allocation

3. **Submit final budget** as official targets (visible to sales rep groups)

4. **Repeatable process**: Works for any year (2027 based on 2026, etc.)

---

## 🎯 REVISED ARCHITECTURE (GROUP-LEVEL)

### Data Sources for Comparison:

**1. Actuals (2025)** - Query:
```sql
-- Aggregate fp_actualcommon to GROUP level using sales_rep_groups mapping
SELECT 
  COALESCE(g.group_name, a.sales_rep_name) as sales_rep_group,
  a.pgcombine,
  SUM(a.qty_kgs) as actual_kgs
FROM fp_actualcommon a
LEFT JOIN sales_rep_group_members m ON LOWER(TRIM(a.sales_rep_name)) = LOWER(TRIM(m.member_name))
LEFT JOIN sales_rep_groups g ON m.group_id = g.id AND UPPER(g.division) = 'FP'
WHERE a.year = 2025
GROUP BY COALESCE(g.group_name, a.sales_rep_name), a.pgcombine
```

**2. Rep's Submitted Budget (2026)** - Query:
```sql
-- Aggregate fp_budget_unified (SALES_REP type) to GROUP level
SELECT 
  COALESCE(g.group_name, b.sales_rep_name) as sales_rep_group,
  b.pgcombine,
  SUM(b.qty_kgs) as submitted_kgs
FROM fp_budget_unified b
LEFT JOIN sales_rep_group_members m ON LOWER(TRIM(b.sales_rep_name)) = LOWER(TRIM(m.member_name))
LEFT JOIN sales_rep_groups g ON m.group_id = g.id AND UPPER(g.division) = 'FP'
WHERE b.budget_year = 2026 AND b.budget_type = 'SALES_REP'
GROUP BY COALESCE(g.group_name, b.sales_rep_name), b.pgcombine
```

**3. Management Allocation (NEW)** - Store in new table at GROUP level

### Architecture Diagram:

```
┌────────────────────────────────────────────────────────────────────┐
│                    DATA SOURCES (Read-Only)                         │
├────────────────────────────────────────────────────────────────────┤
│ 1. fp_actualcommon → AGGREGATE BY GROUP (using sales_rep_groups)  │
│ 2. fp_budget_unified (SALES_REP) → AGGREGATE BY GROUP              │
│ 3. sales_rep_groups + sales_rep_group_members → GROUP MAPPING     │
│ 4. fp_product_group_pricing_rounding → ASP & MORM values          │
└────────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────────┐
│        NEW TABLE: fp_sales_rep_group_budget_allocation             │
├────────────────────────────────────────────────────────────────────┤
│ • Stores management decisions at GROUP + PG level                  │
│ • sales_rep_group_id (FK to sales_rep_groups)                     │
│ • sales_rep_group_name: 'Riad & Nidal'                            │
│ • pgcombine: 'Shrink Film Printed'                                │
│ • Monthly: 12 rows per (group + PG + year)                        │
│ • budget_status: 'draft' → 'approved'                              │
└────────────────────────────────────────────────────────────────────┘
```

## 📊 DATABASE SCHEMA - ONE NEW TABLE REQUIRED

### New Table: `fp_sales_rep_group_budget_allocation`

**Purpose**: Store management's GROUP + PG level budget allocations (NOT individual sales rep)

```sql
CREATE TABLE fp_sales_rep_group_budget_allocation (
  id SERIAL PRIMARY KEY,
  
  -- Division Context
  division_name VARCHAR(255) NOT NULL,
  division_code VARCHAR(50) NOT NULL,
  
  -- Budget Period
  budget_year INTEGER NOT NULL,
  month_no INTEGER NOT NULL CHECK (month_no >= 1 AND month_no <= 12),
  
  -- Allocation Target (GROUP level - NOT individual rep!)
  sales_rep_group_id INTEGER REFERENCES sales_rep_groups(id) ON DELETE RESTRICT,
  sales_rep_group_name VARCHAR(255) NOT NULL,  -- Denormalized: 'Riad & Nidal', 'Narek Koroukian'
  pgcombine VARCHAR(255) NOT NULL,              -- From fp_product_group_pricing_rounding
  
  -- Budget Values (Management Decision)
  qty_kgs NUMERIC(15,2) NOT NULL DEFAULT 0,    -- Monthly KGS
  amount NUMERIC(15,2) DEFAULT 0,               -- Auto-calculated: qty_kgs × ASP
  morm NUMERIC(15,2) DEFAULT 0,                 -- Auto-calculated: qty_kgs × MoRM
  
  -- Status Workflow
  budget_status VARCHAR(20) NOT NULL DEFAULT 'draft',  -- 'draft' or 'approved'
  
  -- Reference Data (Cached from aggregation - for display)
  actual_prev_year_total NUMERIC(15,2),         -- Cached: 2025 actual KGS (sum of GROUP members)
  rep_submitted_total NUMERIC(15,2),            -- Cached: Group's aggregated submitted budget
  
  -- Audit Trail
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  submitted_at TIMESTAMP,
  submitted_by VARCHAR(255),
  
  -- UNIQUE CONSTRAINT: One allocation per (GROUP + PG + month + year + division)
  CONSTRAINT uk_group_budget_allocation_unique 
    UNIQUE (division_code, budget_year, month_no, sales_rep_group_id, pgcombine)
);

-- Indexes for fast queries
CREATE INDEX idx_grp_alloc_division_year ON fp_sales_rep_group_budget_allocation(division_code, budget_year);
CREATE INDEX idx_grp_alloc_group_id ON fp_sales_rep_group_budget_allocation(sales_rep_group_id);
CREATE INDEX idx_grp_alloc_group_name ON fp_sales_rep_group_budget_allocation(sales_rep_group_name);
CREATE INDEX idx_grp_alloc_status ON fp_sales_rep_group_budget_allocation(budget_status);
CREATE INDEX idx_grp_alloc_pgcombine ON fp_sales_rep_group_budget_allocation(pgcombine);
```

### Why This Design Works:
1. ✅ **GROUP level** - allocates to groups (e.g., "Riad & Nidal") not individual reps
2. ✅ **No conflict** with existing fp_budget_unified (separate table)
3. ✅ **No customer_name** required (GROUP + PG level aggregation)
4. ✅ **Clean unique constraint** on (division, year, month, group_id, PG)
5. ✅ **FK to sales_rep_groups** - uses existing group management infrastructure
6. ✅ **Draft/Approved workflow** just like existing patterns
7. ✅ **Cached reference data** for UI display (actual_prev_year_total, rep_submitted_total)

### Data Volume Estimate:
- FP Division: 14 groups × 13 PGs × 12 months = **2,184 rows per year** ✅ Small!
- Compared to customer-level: 1,584+ rows just for current SALES_REP budgets

### Migration Script:
```sql
-- Run once to create the table
-- server/migrations/400_create_sales_rep_group_budget_allocation.sql

CREATE TABLE IF NOT EXISTS fp_sales_rep_group_budget_allocation (
  -- ... schema above ...
);

-- Also add to HC division database if needed
CREATE TABLE IF NOT EXISTS hc_sales_rep_group_budget_allocation (...);
```

---

## 🔌 BACKEND API - GROUP-LEVEL ENDPOINTS

**Route Base**: `/api/sales-rep-group-allocation/` (new route file)

### Endpoint 0: Get Sales Rep Groups

```javascript
GET /api/sales-rep-group-allocation/groups

Request:
{
  divisionCode: "FP"
}

Response:
{
  success: true,
  groups: [
    { id: 1, group_name: "Narek Koroukian", member_count: 2 },
    { id: 2, group_name: "Riad & Nidal", member_count: 3 },
    { id: 3, group_name: "Sofiane & Team", member_count: 3 },
    { id: 4, group_name: "Sojy & Hisham & Direct Sales", member_count: 6 },
    { id: 5, group_name: "Others", member_count: 28 },
    // ... 14 total FP groups
  ]
}

SQL:
SELECT g.id, g.group_name, COUNT(m.id) as member_count
FROM sales_rep_groups g
LEFT JOIN sales_rep_group_members m ON m.group_id = g.id
WHERE UPPER(g.division) = 'FP' AND g.is_active = true
GROUP BY g.id, g.group_name
ORDER BY g.group_name
```

### Endpoint 1: Load Allocation Data (Read)

```javascript
POST /api/sales-rep-group-allocation/load-data

Request:
{
  division: "FP",
  divisionCode: "FP",
  budgetYear: 2026,
  salesRepGroupId: 2,               // FK to sales_rep_groups
  salesRepGroupName: "Riad & Nidal"  // Display name
}

Response:
{
  success: true,
  data: {
    // Group members (for reference)
    groupMembers: ["Direct Sales – Riad", "Nidal Hanan", "Riad Al Zier"],
    
    // Product groups with aggregated data
    productGroups: [
      {
        pgcombine: "Commercial Items Plain",
        
        // Reference data (aggregated from GROUP members)
        actual_2025_kgs: 1250.5,          // SUM from fp_actualcommon for all members
        rep_submitted_kgs: 1380.0,        // SUM from fp_budget_unified (SALES_REP) for all members
        
        // Management's draft (if exists)
        draft_kgs: 1320.0,                // From fp_sales_rep_group_budget_allocation
        
        // Pricing (for Amount/MoRM calculation)
        pricing: { asp_round: 1.25, morm_round: 0.35 }
      },
      // ... 13 product groups total
    ],
    
    // Monthly distribution (if draft exists)
    monthlyData: [
      { month_no: 1, pgcombine: "Commercial Items Plain", qty_kgs: 110.0, amount: 137.50, morm: 38.50 },
      // ... 12 rows per product group × 13 PGs = 156 rows
    ]
  }
}

Backend Logic:
1. Get group members:
   SELECT member_name FROM sales_rep_group_members WHERE group_id = {salesRepGroupId}

2. Build member list for SQL IN clause

3. Get actuals aggregated by GROUP:
   SELECT pgcombine, SUM(qty_kgs) as actual_kgs 
   FROM fp_actualcommon 
   WHERE year = 2025 AND sales_rep_name IN ({members})
   GROUP BY pgcombine

4. Get rep submitted budgets aggregated by GROUP:
   SELECT pgcombine, SUM(qty_kgs) as submitted_kgs
   FROM fp_budget_unified 
   WHERE budget_type = 'SALES_REP' AND budget_year = 2026 AND sales_rep_name IN ({members})
   GROUP BY pgcombine

5. Get existing draft (GROUP level):
   SELECT * FROM fp_sales_rep_group_budget_allocation
   WHERE division_code = 'FP' AND budget_year = 2026 
     AND sales_rep_group_id = {salesRepGroupId} AND budget_status = 'draft'

6. Get pricing:
   SELECT pgcombine, asp_round, morm_round FROM fp_product_group_pricing_rounding 
   WHERE year = 2026 AND division = 'FP'
```

### Endpoint 2: Save Draft (Write)

```javascript
POST /api/sales-rep-group-allocation/save-draft

Request:
{
  division: "FP",
  divisionCode: "FP",
  budgetYear: 2026,
  salesRepGroupId: 2,
  salesRepGroupName: "Riad & Nidal",
  
  // Yearly budget decisions per PG
  budgetData: [
    { pgcombine: "Commercial Items Plain", yearly_kgs: 1320.0, actual_prev_year: 1250.5, rep_submitted: 1380.0 },
    { pgcombine: "Shrink Film Printed", yearly_kgs: 890.0, actual_prev_year: 820.0, rep_submitted: 950.0 }
    // ... 13 PGs
  ],
  
  // Monthly distribution percentages
  monthlyPercentages: {
    "1": 8.33, "2": 8.33, ..., "12": 8.33   // Equal or custom
  }
}

Response:
{
  success: true,
  message: "Draft saved for group 'Riad & Nidal'",
  recordsSaved: 156,     // 13 PGs × 12 months
  recordsInserted: 156,
  recordsUpdated: 0
}

Backend Logic:
1. BEGIN transaction
2. DELETE existing drafts:
   DELETE FROM fp_sales_rep_group_budget_allocation
   WHERE division_code = 'FP' AND budget_year = 2026 
     AND sales_rep_group_id = {salesRepGroupId} AND budget_status = 'draft'

3. Get pricing:
   SELECT pgcombine, asp_round, morm_round FROM fp_product_group_pricing_rounding 
   WHERE year = 2026 AND division = 'FP'

4. For each product group:
   - For each month (1-12):
     - monthly_kgs = yearly_kgs × monthlyPercentages[month] / 100
     - amount = monthly_kgs × pricing.asp_round
     - morm = monthly_kgs × pricing.morm_round
     - INSERT INTO fp_sales_rep_group_budget_allocation (
         division_code, division_name, budget_year, month_no,
         sales_rep_group_id, sales_rep_group_name, pgcombine,
         qty_kgs, amount, morm, budget_status,
         actual_prev_year_total, rep_submitted_total,
         created_by
       ) VALUES (
         'FP', 'Flexible Packaging', 2026, {month},
         {salesRepGroupId}, 'Riad & Nidal', {pgcombine},
         {monthly_kgs}, {amount}, {morm}, 'draft',
         {actual_prev_year}, {rep_submitted},
         {req.user.username}
       )

5. COMMIT
6. Return success
```

### Endpoint 3: Submit Final (Approve)

```javascript
POST /api/sales-rep-group-allocation/submit-final

Request:
{
  division: "FP",
  divisionCode: "FP",
  budgetYear: 2026,
  salesRepGroupId: 2,
  salesRepGroupName: "Riad & Nidal"
}

Response:
{
  success: true,
  message: "Budget allocated for group 'Riad & Nidal'",
  recordsApproved: 156
}

Backend Logic:
1. Check if draft exists
2. UPDATE fp_sales_rep_group_budget_allocation
   SET budget_status = 'approved',
       submitted_at = NOW(),
       submitted_by = req.user.username,
       updated_at = NOW()
   WHERE division_code = 'FP' AND budget_year = 2026 
     AND sales_rep_group_id = {salesRepGroupId} AND budget_status = 'draft'
3. Return rows affected
```

### Endpoint 4: Get All Allocations Summary

```javascript
GET /api/sales-rep-group-allocation/summary

Request:
{
  divisionCode: "FP",
  budgetYear: 2026
}

Response:
{
  success: true,
  summary: [
    { 
      group_id: 1, 
      group_name: "Narek Koroukian",
      total_actual_kgs: 15000,
      total_submitted_kgs: 16500,
      total_allocated_kgs: 16000,
      status: "approved",
      submitted_at: "2024-12-01T10:30:00Z"
    },
    { 
      group_id: 2, 
      group_name: "Riad & Nidal",
      total_actual_kgs: 22000,
      total_submitted_kgs: 24000,
      total_allocated_kgs: null,  // Not yet allocated
      status: "pending"
    }
    // ... all 14 groups
  ]
}
```
   WHERE budget_type = 'SALES_REP_ALLOCATED'
     AND budget_status = 'draft'
     AND budget_year = 2026
     AND sales_rep_name = 'Narek Koroukian'
     AND division_code = 'FP'
3. Return success
```

### Endpoint 4: Get Sales Reps List

```javascript
GET /api/budget-allocation/sales-reps?division=FP&year=2026

Response:
{
  success: true,
  salesReps: [
    { 
      name: "Narek Koroukian",
      total_actual_2025: 525.8,
      total_submitted_2026: 580.0,
      draft_status: "draft",        // 'draft', 'approved', 'not_started'
      last_updated: "2024-12-15T10:30:00Z"
    },
    { name: "Sojy Hisham", total_actual_2025: 420.0, draft_status: "not_started" }
  ]
}

SQL:
- Get unique sales reps from fp_actualcommon WHERE year=2025
- Join with fp_budget_unified to check draft status
```

### Endpoint 5: Comparison Report

```javascript
GET /api/budget-allocation/comparison?division=FP&year=2026

Response:
{
  success: true,
  comparison: [
    {
      sales_rep: "Narek Koroukian",
      product_group: "Commercial Items Plain",
      actual_2025: 320.5,
      rep_submitted_2026: 350.0,
      mgmt_allocated_2026: 345.0,
      variance_vs_actual: "+7.6%",
      variance_vs_rep: "-1.4%"
    }
  ]
}
```

```

---

## 🎨 FRONTEND UI - GROUP-LEVEL ALLOCATION INTERFACE

**Component Location**: `src/components/MasterData/AEBF/SalesRepGroupAllocationTab.jsx` (NEW)

**Pattern to Copy**: `BudgetTab.jsx` (divisional budget UI already exists!)

### Tab 1: Yearly Allocation (Main Entry Screen)

**Layout**: GROUP selector → Product Groups table with comparison columns

```jsx
<Card title={`Sales Rep Group Budget Allocation - ${budgetYear}`}>
  
  {/* SALES REP GROUP Selector (NOT individual reps!) */}
  <Select 
    placeholder="Select Sales Rep Group"
    value={selectedGroup}
    onChange={handleGroupChange}
    style={{ width: 300 }}
  >
    {groups.map(g => (
      <Option key={g.id} value={g.id}>
        {g.group_name} ({g.member_count} members)
      </Option>
    ))}
    {/* Example options:
      - Narek Koroukian (2 members)
      - Riad & Nidal (3 members)
      - Sojy & Hisham & Direct Sales (6 members)
      - Sofiane & Team (3 members)
      - Others (28 members)
    */}
  </Select>
  
  {/* Show Group Members for reference */}
  {selectedGroup && (
    <Tag.CheckableTag style={{ marginLeft: 16 }}>
      Members: {groupMembers.join(', ')}
    </Tag.CheckableTag>
  )}
  
  {/* Main Table: Product Groups with aggregated data */}
  <Table 
    dataSource={productGroups}  // 13 rows (pgcombine values)
    columns={[
      { title: 'Product Group', dataIndex: 'pgcombine', width: 200, fixed: 'left' },
      { 
        title: `Actual ${prevYear} KGS (Group Total)`, 
        dataIndex: 'actual_2025_kgs',
        render: (val) => formatNumber(val),
        // Read-only, yellow background - SUM of all group members
        className: 'actual-col'
      },
      { 
        title: `Rep Submitted ${budgetYear} KGS (Group Total)`, 
        dataIndex: 'rep_submitted_kgs',
        render: (val) => val ? formatNumber(val) : '---',
        // Read-only, blue background - SUM of all group members' submitted budgets
        className: 'submitted-col'
      },
      { 
        title: `Management Decision ${budgetYear} KGS`, 
        dataIndex: 'final_kgs',
        // EDITABLE - InputNumber component (GROUP-LEVEL DECISION!)
        className: 'decision-col',
        render: (text, record) => (
          <InputNumber
            value={record.final_kgs}
            onChange={(value) => handleKgsChange(record.pgcombine, value)}
            formatter={value => formatNumber(value)}
            parser={value => value.replace(/[^\d.]/g, '')}
            style={{ width: 120 }}
          />
        )
      },
      { 
        title: 'Amount', 
        dataIndex: 'final_amount',
        render: (val) => formatCurrency(val),
        // Auto-calculated: final_kgs × pricing.asp
      },
      { 
        title: 'MoRM', 
        dataIndex: 'final_morm',
        render: (val) => formatCurrency(val),
        // Auto-calculated: final_kgs × pricing.morm
      },
      {
        title: 'Variance vs Actual',
        render: (_, record) => {
          const variance = ((record.final_kgs - record.actual_2025_kgs) / record.actual_2025_kgs * 100).toFixed(1);
          return <Tag color={variance > 0 ? 'green' : 'red'}>{variance}%</Tag>;
        }
      }
    ]}
  />
  
  {/* Action Buttons */}
  <Space style={{ marginTop: 16 }}>
    <Button type="primary" onClick={handleSaveDraft}>
      Save Draft
    </Button>
    <Button type="primary" danger onClick={handleSubmitFinal} 
      disabled={!allProductGroupsAllocated}>
      Submit Final Allocation for {selectedGroupName}
    </Button>
    <Button onClick={handleLoadDraft}>Load Existing Draft</Button>
  </Space>
  
</Card>

{/* Summary Panel - All Groups Overview */}
<Card title="All Groups Allocation Status" style={{ marginTop: 16 }}>
  <Table
    dataSource={allGroupsSummary}
    columns={[
      { title: 'Group', dataIndex: 'group_name' },
      { title: 'Members', dataIndex: 'member_count' },
      { title: 'Actual 2025', dataIndex: 'total_actual_kgs', render: formatNumber },
      { title: 'Submitted 2026', dataIndex: 'total_submitted_kgs', render: formatNumber },
      { title: 'Allocated 2026', dataIndex: 'total_allocated_kgs', render: v => v ? formatNumber(v) : '---' },
      { 
        title: 'Status', 
        dataIndex: 'status',
        render: status => (
          <Tag color={status === 'approved' ? 'green' : status === 'draft' ? 'orange' : 'default'}>
            {status}
          </Tag>
        )
      },
      { 
        title: 'Action',
        render: (_, record) => (
          <Button size="small" onClick={() => handleSelectGroup(record.group_id)}>
            {record.status === 'approved' ? 'View' : 'Allocate'}
          </Button>
        )
      }
    ]}
  />
</Card>
```

**Key Features**:
- **GROUP selector** (not individual reps) with member count display
- **3-column comparison**: Actual 2025 (group total) | Rep Submitted (group total) | Management Decision
- **Visual color coding**: Yellow (actual), Blue (rep submission), Green (management decision)
- **All Groups overview** shows allocation progress across all 14 FP groups
- Real-time variance calculations
- Auto-save draft every 30 seconds

### Tab 2: Monthly Distribution

**Purpose**: Show monthly breakdown after yearly allocation

```jsx
<Card title="Monthly Distribution">
  
  {/* Template Selector */}
  <Select 
    placeholder="Distribution Template"
    value={selectedTemplate}
    onChange={handleTemplateChange}
  >
    <Option value="equal">Equal Distribution (8.33% each month)</Option>
    <Option value="custom">Custom Percentages</Option>
  </Select>
  
  {/* Monthly Table */}
  <Table
    dataSource={monthlyData}  // 12 rows × N product groups
    columns={[
      { title: 'Product Group', dataIndex: 'pgcombine' },
      { title: 'Month', dataIndex: 'month_no', render: (val) => monthNames[val] },
      { 
        title: 'Percentage', 
        dataIndex: 'percentage',
        render: (_, record) => (
          <InputNumber
            value={record.percentage}
            onChange={(value) => handlePercentageChange(record.month_no, value)}
            formatter={value => `${value}%`}
            min={0}
            max={100}
          />
        )
      },
      { title: 'KGS', dataIndex: 'monthly_kgs', render: formatNumber },
      { title: 'Amount', dataIndex: 'monthly_amount', render: formatCurrency },
      { title: 'MoRM', dataIndex: 'monthly_morm', render: formatCurrency }
    ]}
  />
  
  <Alert 
    message={`Total: ${totalPercentage}%`} 
    type={totalPercentage === 100 ? 'success' : 'warning'}
    showIcon
  />
  
</Card>
```

### Tab 3: Summary & Submission

**Purpose**: Final review before submission for a GROUP

```jsx
<Card title="Budget Allocation Summary">
  
  <Descriptions bordered column={2}>
    <Descriptions.Item label="Sales Rep Group">{selectedGroupName}</Descriptions.Item>
    <Descriptions.Item label="Group Members">{groupMembers.length}</Descriptions.Item>
    <Descriptions.Item label="Budget Year">{budgetYear}</Descriptions.Item>
    <Descriptions.Item label="Total Product Groups">{productGroups.length}</Descriptions.Item>
    <Descriptions.Item label="Status">{draftStatus}</Descriptions.Item>
  </Descriptions>
  
  {/* Group Members Detail */}
  <Alert 
    message={`Members: ${groupMembers.join(', ')}`}
    type="info"
    style={{ marginBottom: 16 }}
  />
  
  <Table
    dataSource={summaryData}
    columns={[
      { title: 'Product Group', dataIndex: 'pgcombine' },
      { title: 'Actual 2025 (Group)', dataIndex: 'actual_kgs', render: formatNumber },
      { title: 'Rep Submitted (Group)', dataIndex: 'submitted_kgs', render: formatNumber },
      { title: 'Allocated KGS', dataIndex: 'yearly_kgs', render: formatNumber },
      { title: 'Yearly Amount', dataIndex: 'yearly_amount', render: formatCurrency },
      { title: 'Yearly MoRM', dataIndex: 'yearly_morm', render: formatCurrency },
      { title: 'Variance vs Actual', dataIndex: 'variance', render: v => <Tag color={v > 0 ? 'green' : 'red'}>{v.toFixed(1)}%</Tag> }
    ]}
    summary={pageData => {
      let totalActual = 0, totalSubmitted = 0, totalKgs = 0, totalAmount = 0, totalMorm = 0;
      pageData.forEach(row => {
        totalActual += row.actual_kgs || 0;
        totalSubmitted += row.submitted_kgs || 0;
        totalKgs += row.yearly_kgs;
        totalAmount += row.yearly_amount;
        totalMorm += row.yearly_morm;
      });
      const variance = ((totalKgs - totalActual) / totalActual * 100);
      return (
        <Table.Summary.Row>
          <Table.Summary.Cell><strong>GROUP TOTAL</strong></Table.Summary.Cell>
          <Table.Summary.Cell><strong>{formatNumber(totalActual)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell><strong>{formatNumber(totalSubmitted)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell><strong>{formatNumber(totalKgs)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell><strong>{formatCurrency(totalAmount)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell><strong>{formatCurrency(totalMorm)}</strong></Table.Summary.Cell>
          <Table.Summary.Cell><Tag color={variance > 0 ? 'green' : 'red'}>{variance.toFixed(1)}%</Tag></Table.Summary.Cell>
        </Table.Summary.Row>
      );
    }}
  />
  
  <Button 
    type="primary" 
    size="large" 
    icon={<CheckCircleOutlined />}
    onClick={handleFinalSubmit}
    disabled={draftStatus !== 'draft'}
  >
    Submit Final Allocation for "{selectedGroupName}"
  </Button>
  
</Card>
```

### Tab 4: Comparison Reports

**Purpose**: Visual comparison across all GROUPS

```jsx
<Card title="All Groups Budget Comparison Report">
  
  {/* Filters */}
  <Space style={{ marginBottom: 16 }}>
    <Select value={viewType} onChange={setViewType}>
      <Option value="by-group">By Sales Rep Group</Option>
      <Option value="by-pg">By Product Group</Option>
    </Select>
    
    <Select value={comparisonType} onChange={setComparisonType}>
      <Option value="vs-actual">vs 2025 Actual</Option>
      <Option value="vs-rep">vs Rep Submitted</Option>
    </Select>
  </Space>
  
  {/* Comparison Table */}
  <Table
    dataSource={comparisonData}
    columns={[
      { title: 'Sales Rep', dataIndex: 'sales_rep' },
      { title: 'Product Group', dataIndex: 'product_group' },
      { title: '2025 Actual', dataIndex: 'actual_2025', render: formatNumber },
      { title: 'Rep Submitted', dataIndex: 'rep_submitted', render: formatNumber },
      { title: 'Mgmt Allocated', dataIndex: 'mgmt_allocated', render: formatNumber },
      { 
        title: 'Variance vs Actual',
        dataIndex: 'variance_vs_actual',
        render: (val) => <Tag color={val.includes('+') ? 'green' : 'red'}>{val}</Tag>
      },
      { 
        title: 'Variance vs Rep',
        dataIndex: 'variance_vs_rep',
        render: (val) => <Tag color={val.includes('-') ? 'orange' : 'blue'}>{val}</Tag>
      }
    ]}
  />
  
  {/* Export Button */}
  <Button icon={<DownloadOutlined />} onClick={handleExportExcel}>
    Export to Excel
  </Button>
  
</Card>
```

---

## 🔐 PERMISSIONS & ACCESS CONTROL

**New Permission**: `budget:allocation:manage`

**Role Assignment**:
- **Grant to**: Finance Manager, Division Manager, CEO
- **Deny to**: Sales Reps, regular users

**Backend Middleware** (copy from budget-draft.js):
```javascript
router.post('/save-draft', 
  requireAuth,
  requirePermission('budget:allocation:manage'),
  requireDivisionScope,
  async (req, res) => {
    // ... implementation
  }
);
```

**Frontend Check**:
```javascript
const canManageAllocation = user.permissions.includes('budget:allocation:manage');

if (!canManageAllocation) {
  return <Alert message="Access Denied" type="error" />;
}
```

---

## ⚙️ CONFIGURATION

**Environment Variables**: (None needed - reuse existing database config)

**Feature Flags**: (Optional)
```javascript
const FEATURE_FLAGS = {
  BUDGET_ALLOCATION_ENABLED: true,
  ALLOW_RETROACTIVE_ALLOCATION: false,  // Prevent allocating past years
  AUTO_APPROVE_THRESHOLD: null          // Future: auto-approve if within X% of rep submission
};
```

---

## 🧪 TESTING STRATEGY

### Unit Tests

**Backend Tests** (Jest):
```javascript
describe('Sales Rep GROUP Allocation API', () => {
  test('should get sales rep groups', async () => {
    const response = await request(app)
      .get('/api/sales-rep-group-allocation/groups?divisionCode=FP');
    
    expect(response.status).toBe(200);
    expect(response.body.groups).toHaveLength(14);  // 14 FP groups
    expect(response.body.groups[0]).toHaveProperty('group_name');
    expect(response.body.groups[0]).toHaveProperty('member_count');
  });
  
  test('should load aggregated data for group', async () => {
    const response = await request(app)
      .post('/api/sales-rep-group-allocation/load-data')
      .send({
        divisionCode: 'FP',
        budgetYear: 2026,
        salesRepGroupId: 2,  // "Riad & Nidal"
        salesRepGroupName: 'Riad & Nidal'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.groupMembers).toContain('Riad Al Zier');
    expect(response.body.productGroups).toHaveLength(13);  // 13 PGs
    // Verify aggregation: values should be SUM of all group members
  });
  
  test('should save draft allocation for GROUP', async () => {
    const response = await request(app)
      .post('/api/sales-rep-group-allocation/save-draft')
      .send({
        division: 'FP',
        budgetYear: 2026,
        salesRepGroupId: 2,
        salesRepGroupName: 'Riad & Nidal',
        budgetData: [
          { pgcombine: 'Commercial Items Plain', yearly_kgs: 1320000, actual_prev_year: 1250000, rep_submitted: 1380000 }
        ],
        monthlyPercentages: { "1": 8.33, "2": 8.33, "3": 8.33, "4": 8.33, "5": 8.33, "6": 8.33, "7": 8.34, "8": 8.34, "9": 8.33, "10": 8.33, "11": 8.33, "12": 8.33 }
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.recordsSaved).toBe(12);  // 1 PG × 12 months
  });
  
  test('should prevent duplicate allocation', async () => {
    // Save draft twice, should update instead of creating duplicates
  });
  
  test('should calculate Amount/MoRM correctly using pricing', async () => {
    // Verify: amount = qty_kgs × pricing.asp_round
    // Verify: morm = qty_kgs × pricing.morm_round
  });
});
```

### Integration Tests

**Test Scenarios**:
1. ✅ Load data for GROUP with actuals + rep budgets (aggregated)
2. ✅ Load data for GROUP where some members have no submitted budget
3. ✅ Save draft → Load draft → Verify data matches
4. ✅ Save draft → Submit final → Verify status changes to 'approved'
5. ✅ Multiple saves should UPDATE existing draft (no duplicates)
6. ✅ Monthly distribution calculation (verify sum = yearly total)
7. ✅ Permission check: unauthorized user cannot access
8. ✅ Verify aggregation: GROUP totals = SUM of all member totals

### Manual Testing Checklist

- [ ] Select GROUP → Verify member list displayed
- [ ] Verify Actual 2025 = SUM of all members' actuals
- [ ] Verify Rep Submitted = SUM of all members' submitted budgets
- [ ] Enter yearly KGS → Verify Amount/MoRM auto-calculated
- [ ] Save draft → Reload page → Draft persists
- [ ] Change monthly percentages → Verify monthly KGS recalculates
- [ ] Submit final → Verify cannot edit anymore
- [ ] Compare actual vs allocated → Verify variance calculations
- [ ] View All Groups summary → Verify allocation status for each
- [ ] Export to Excel → Verify formatting

---

## 📦 IMPLEMENTATION PHASES (WITH NEW TABLE)

**Total Timeline**: 3-4 weeks

### ✅ Phase 1: Backend Foundation (Week 1)

**Tasks**:
1. **Database Migration** - Create new table:
   ```sql
   -- server/migrations/400_create_sales_rep_group_budget_allocation.sql
   CREATE TABLE fp_sales_rep_group_budget_allocation (...);
   ```
2. Create new route file: `server/routes/sales-rep-group-allocation.js`
   - Copy patterns from `budget-draft.js`
   - Use GROUP-level queries with member aggregation
3. Implement 5 endpoints:
   - GET `/groups` - List sales rep groups
   - POST `/load-data` - Load aggregated data for group
   - POST `/save-draft` - Save GROUP-level draft
   - POST `/submit-final` - Approve allocation
   - GET `/summary` - All groups overview
4. Add permission: `budget:group-allocation:manage` in auth middleware
5. Write unit tests

**Estimated Time**: 5-7 days

---

### ✅ Phase 2: Frontend - Main Allocation UI (Week 2)

**Tasks**:
1. Create `SalesRepGroupAllocationTab.jsx` in `src/components/MasterData/AEBF/`
2. Implement:
   - **GROUP selector** (dropdown with member counts)
   - Group members display (info panel)
   - 3-column comparison table (Actual | Rep Submitted | Management Decision)
   - Editable KGS input with auto Amount/MoRM calculation
   - All Groups summary table (status overview)
3. Add API integration (axios calls)
4. Add visual indicators (colors for variance)

**Estimated Time**: 5-7 days

---

### ✅ Phase 3: Frontend - Tabs 2-4 (Week 3)

**Tasks**:
1. **Tab 2**: Monthly Distribution
   - Template selector (equal, custom)
   - Monthly percentage inputs
   - Real-time KGS recalculation per PG
2. **Tab 3**: Summary & Submission per GROUP
   - Summary table with variance columns
   - Final submission button with confirmation
3. **Tab 4**: Comparison Reports
   - Filter by GROUP / product group
   - Variance calculations (vs actual, vs submitted)
   - Excel export functionality

**Estimated Time**: 5-7 days

---

### ✅ Phase 4: Testing & Deployment (Week 4)

**Tasks**:
1. Integration testing (all tabs + API)
2. Verify GROUP aggregation accuracy
3. Permission testing (role-based access)
4. UAT with Finance team
5. Bug fixes
6. Documentation (user guide)
7. Deploy to production

**Estimated Time**: 5-7 days

---

## 🚀 DEPLOYMENT CHECKLIST

### Pre-Deployment

- [ ] Database migration tested (new table created)
- [ ] Backend tests passing (100% coverage on new endpoints)
- [ ] Frontend tests passing
- [ ] Permission configured in auth system: `budget:group-allocation:manage`
- [ ] UAT sign-off from Finance Manager

### Deployment Steps

1. [ ] Run database migration:
   ```sql
   -- Create new table
   CREATE TABLE fp_sales_rep_group_budget_allocation (...);
   ```
2. [ ] Deploy backend code (new route file)
3. [ ] Deploy frontend code (new tab component)
4. [ ] Update permissions in database:
   ```sql
   INSERT INTO permissions (permission_key, permission_name, description)
   VALUES ('budget:group-allocation:manage', 'Manage Group Budget Allocation', 'Allocate budgets to sales rep groups');
   
   -- Grant to Finance Manager role
   INSERT INTO role_permissions (role_id, permission_id)
   VALUES ((SELECT id FROM roles WHERE role_name='Finance Manager'), 
           (SELECT id FROM permissions WHERE permission_key='budget:group-allocation:manage'));
   ```
5. [ ] Test in production (smoke test)
6. [ ] Train users (Finance team)

### Post-Deployment

- [ ] Monitor error logs for 48 hours
- [ ] Collect user feedback
- [ ] Address any issues
- [ ] Document lessons learned

---

## 📈 FUTURE ENHANCEMENTS (Post-MVP)

### Phase 2 Features (Future Roadmap)

1. **AI-Powered Suggestions**
   - ML model suggests GROUP budget based on historical trends
   - "Smart allocation" button: auto-fill based on group's growth rate

2. **Bulk Operations**
   - Allocate multiple GROUPS at once
   - Apply percentage increase across all groups: "Give everyone +10% vs actual"

3. **Advanced Reporting**
   - Pivot tables: compare all GROUPS side-by-side
   - Charts: visual budget trends (Chart.js/ECharts)
   - PDF export for management review

4. **Drill-down to Member Level**
   - After GROUP allocation, optionally drill into member breakdown
   - Management sees how group total is split among members (read-only reference)

5. **Budget Revision**
   - Mid-year budget adjustments at GROUP level
   - Track revision history (v1, v2, v3...)

---

## 🎯 SUCCESS METRICS

**KPIs to Track**:
1. ✅ Time saved: Allocate all 14 FP groups in < 2 hours
2. ✅ Accuracy: Zero duplicate entries (UNIQUE constraint guarantees this)
3. ✅ User adoption: 100% of Finance team using system by Week 2
4. ✅ System performance: Page load < 2 seconds
5. ✅ Error rate: < 1% failed submissions

---

## 🐛 KNOWN LIMITATIONS & EDGE CASES

### Current Limitations

1. **Group must have members**
   - Empty groups won't show any actuals or submitted data
   - Workaround: Use SalesRepGroups UI to add members first

2. **Product group must have pricing data**
   - If pgcombine not in fp_product_group_pricing_rounding, Amount/MoRM = 0
   - Workaround: Warn user to update pricing master first

3. **Single year allocation only**
   - Cannot allocate multiple years at once
   - Must repeat process each year

### Edge Cases to Handle

- [ ] GROUP has actuals but members didn't submit 2026 budget → Show actuals only
- [ ] GROUP members submitted budget but have zero 2025 actuals → Show submitted only
- [ ] New member added to group mid-year → Actuals might not include them
- [ ] Negative variance > 50% → Show alert: "Large decrease from actual"
- [ ] Total monthly percentage ≠ 100% → Block submission until corrected

---

## 📚 REFERENCES

### Related Documents

- [BUDGET-UNIFIED-MIGRATION-RECAP.md](BUDGET-UNIFIED-MIGRATION-RECAP.md) - Migration strategy
- [AEBF_FLOW_REVIEW.md](AEBF_FLOW_REVIEW.md) - Division workflow patterns

### Code References (Key Patterns to Reuse)

- **Server**: `server/routes/budget-draft.js`
  - `save-divisional-draft` endpoint pattern
  - `submit-divisional-final` endpoint pattern
- **Server**: `server/services/DataFilteringHelper.js`
  - `loadSalesRepGroups(divisionCode)` - GROUP loading with cache
  - `buildSalesRepGroupSQL()` - CASE WHEN for raw→group mapping
- **Frontend**: `src/components/MasterData/AEBF/BudgetTab.jsx`
  - Divisional budget UI patterns
  - Recap functionality with group aggregation
- **Frontend**: `src/components/MasterData/SalesRep/SalesRepGroups.jsx`
  - GROUP CRUD operations

### Database Tables

- `fp_sales_rep_group_budget_allocation` - **NEW TABLE** for management allocations
- `sales_rep_groups` + `sales_rep_group_members` - GROUP definitions
- `fp_actualcommon` - Source for 2025 actuals (aggregate by GROUP)
- `fp_budget_unified` - Source for rep submitted budgets (aggregate by GROUP)
- `fp_product_group_pricing_rounding` - Source for ASP/MORM pricing

---

## ✅ FEASIBILITY ASSESSMENT (FINAL)

### 🟢 CONFIRMED FEASIBLE

After deep audit, this feature **IS DOABLE** with the GROUP-level approach:

| Aspect | Assessment | Notes |
|--------|------------|-------|
| **Database** | ✅ Feasible | New table `fp_sales_rep_group_budget_allocation` needed |
| **Sales Rep Groups** | ✅ Verified | 14 FP groups exist with member mappings |
| **Product Groups** | ✅ Verified | 13 fixed pgcombine values available |
| **Pricing Data** | ✅ Available | `fp_product_group_pricing_rounding` has 2025 data |
| **Aggregation** | ✅ Pattern exists | `DataFilteringHelper.buildSalesRepGroupSQL()` |
| **Frontend Pattern** | ✅ Reusable | `BudgetTab.jsx` recap functionality |
| **Estimated Effort** | 3-4 weeks | Backend + Frontend + Testing |

### Key Risks Mitigated

1. ~~UNIQUE constraint issue~~ → Solved: New table with GROUP-level constraint
2. ~~Raw sales rep complexity~~ → Solved: Use GROUPS as allocation dimension
3. ~~Customer-level granularity~~ → N/A: Allocate at GROUP + PG level

### Data Volume (Small!)

- **FP Division**: 14 groups × 13 PGs × 12 months = **2,184 rows/year**
- Compared to customer-level: 1,584+ rows for current SALES_REP budgets

---

## ✅ APPROVAL SIGN-OFF

**Prepared by**: GitHub Copilot  
**Date**: 2024-12-15  
**Version**: 3.0 (GROUP-LEVEL ALLOCATION)

**Key Change from v2**: Now allocates to SALES REP GROUPS (not individual reps)

**Awaiting Approval**:
- [ ] Finance Manager
- [ ] IT Manager
- [ ] Division Manager

**Next Steps After Approval**:
1. Create feature branch: `feature/sales-rep-group-allocation`
2. Run migration: create `fp_sales_rep_group_budget_allocation` table
3. Start Phase 1: Backend GROUP-level endpoints (Week 1)
4. Schedule UAT session with Finance team

---

**END OF DOCUMENT v3.0**
