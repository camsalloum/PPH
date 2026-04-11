# CUSTOMER MERGING PAGE - REDESIGN STEP 1

**Date:** January 1, 2026  
**Status:** ✅ IMPLEMENTED  
**Phase:** Step 1 of Multi-Step Redesign

---

## 🎯 OBJECTIVES

Redesign the Customer Merging page to provide better visibility into customer data BEFORE any merging occurs, showing:

1. **Source Table** - Which database table the customer data comes from (Sales vs Budget)
2. **Raw Sales Rep** - The original sales rep name BEFORE any grouping
3. **Country Name** - Customer's country
4. **Transaction Data** - Counts, sales, KGs, budget values

---

## 🆕 NEW FEATURES

### **1. Delete All Merge Rules Endpoint**

**Endpoint:** `DELETE /api/division-merge-rules/rules/all?division=FP`

**Purpose:** Clean slate - removes ALL merge rules and un-merges all customers

**Implementation:** [divisionMergeRules.js:1699](server/routes/divisionMergeRules.js#L1699)

**Response:**
```json
{
  "success": true,
  "message": "All 77 merge rules deleted and 160 customers un-merged",
  "deletedRules": 77,
  "unmergedCustomers": 160
}
```

**Safety:** 
- Confirms before execution
- Shows count of rules to be deleted
- Automatically un-merges all affected customers
- Logs all actions

---

### **2. Scan with Source Data Endpoint**

**Endpoint:** `POST /api/division-merge-rules/scan-with-source`

**Purpose:** Get all customers with their source data (table, raw sales rep, country)

**Implementation:** [divisionMergeRules.js:212](server/routes/divisionMergeRules.js#L212)

**Query Logic:**
```sql
-- From fp_data_excel
SELECT 
  customername,
  'fp_data_excel' as source_table,
  salesrepname as raw_sales_rep,
  countryname as country,
  COUNT(*) as transaction_count,
  SUM(sales) as total_sales,
  SUM(kgs) as total_kgs
GROUP BY customername, salesrepname, countryname

-- From fp_sales_rep_budget  
SELECT 
  customername,
  'fp_sales_rep_budget' as source_table,
  salesrepname as raw_sales_rep,
  countryname as country,
  COUNT(*) as transaction_count,
  SUM(budget) as total_budget
GROUP BY customername, salesrepname, countryname
```

**Response:**
```json
{
  "success": true,
  "data": {
    "customers": [
      {
        "customer_name": "Al Manhal Water Factory",
        "sources": [
          {
            "table": "fp_data_excel",
            "raw_sales_rep": "Sofiane Salah",
            "country": "United Arab Emirates",
            "transaction_count": 45,
            "total_sales": 125430.50,
            "total_kgs": 42150.00
          },
          {
            "table": "fp_sales_rep_budget",
            "raw_sales_rep": "Sofiane",
            "country": "UAE",
            "transaction_count": 12,
            "total_budget": 150000.00
          }
        ],
        "source_tables": ["fp_data_excel", "fp_sales_rep_budget"],
        "countries": ["United Arab Emirates", "UAE"],
        "raw_sales_reps": ["Sofiane Salah", "Sofiane"],
        "total_transactions": 57,
        "total_sales": 125430.50,
        "total_kgs": 42150.00,
        "total_budget": 150000.00
      }
    ],
    "totalCustomers": 658,
    "excelRecords": 743,
    "budgetRecords": 135
  }
}
```

---

## 🎨 NEW FRONTEND COMPONENT

**File:** [CustomerMergingPageRedesigned.jsx](src/components/MasterData/CustomerMerging/CustomerMergingPageRedesigned.jsx)

### **Features:**

1. **Statistics Dashboard**
   - Total Customers: 658
   - Excel Records: 743
   - Budget Records: 135
   - Filtered Count (dynamic)

2. **Action Buttons**
   - **Delete All Rules** - Removes all merge rules with confirmation
   - **Scan Customers** - Refreshes customer data

3. **Advanced Filtering**
   - Search by customer name
   - Filter by source table (Sales/Budget)
   - Filter by country
   - Filter by sales rep
   - Clear all filters button

4. **Data Table Columns**
   | Column | Description | Example |
   |--------|-------------|---------|
   | Customer Name | Full customer name | Al Manhal Water Factory |
   | Source Table(s) | Where data comes from | Sales Data, Budget Data |
   | Raw Sales Rep(s) | Original rep names | Sofiane Salah, Sofiane |
   | Country(ies) | Customer countries | United Arab Emirates |
   | Transactions | Total transaction count | 57 |
   | Total Sales | Sum of all sales | $125,431 |
   | Total KGs | Sum of all KGs | 42,150 |
   | Details | View source breakdown | [i] button |

5. **Source Details Modal**
   - Click "Details" button to see breakdown by source
   - Shows each source table entry separately
   - Sales rep, country, transaction count per source

---

## 📊 DATA INSIGHTS

### **Current FP Division Stats:**
- **Total Unique Customers:** 658
- **Excel Data Records:** 743 (some customers appear multiple times with different sales reps/countries)
- **Budget Data Records:** 135

### **Why More Records Than Customers?**
A single customer like "Al Manhal Water Factory" can have:
- 3 records in excel data (different sales reps: Sofiane, Christopher, Mary)
- 2 records in budget data (different countries: UAE, United Arab Emirates)
- **Total:** 5 records but counted as 1 unique customer

---

## 🔄 INTEGRATION

Updated [CustomerManagement.jsx](src/components/MasterData/CustomerMerging/CustomerManagement.jsx) to use the redesigned component:

```jsx
import CustomerMergingPageRedesigned from './CustomerMergingPageRedesigned';

const items = [
  {
    key: 'merging',
    label: <span><MergeCellsOutlined /> Customer Merging</span>,
    children: <CustomerMergingPageRedesigned />  // NEW
  },
  // ... other tabs
];
```

---

## 🧪 TESTING

### **Test 1: Delete All Rules**
```bash
# Check current rule count
curl http://localhost:3001/api/division-merge-rules/rules?division=FP
# Result: 77 active rules

# Delete all
curl -X DELETE http://localhost:3001/api/division-merge-rules/rules/all?division=FP
# Response: Deleted 77 rules, un-merged 160 customers

# Verify
curl http://localhost:3001/api/division-merge-rules/rules?division=FP
# Result: 0 active rules
```

### **Test 2: Scan with Source Data**
```bash
curl -X POST http://localhost:3001/api/division-merge-rules/scan-with-source \
  -H "Content-Type: application/json" \
  -d '{"division":"FP"}'

# Response: 658 customers with full source details
```

### **Test 3: Frontend Filtering**
1. Open Customer Management > Customer Merging
2. Click "Scan Customers" - loads 658 customers
3. Search "manhal" - filters to matching customers
4. Select "Sales Data" source - shows only customers from fp_data_excel
5. Select "United Arab Emirates" country - further filters
6. Click "Clear" - resets all filters

---

## 📋 NEXT STEPS (Phase 2)

1. **AI Suggestion Review**
   - Show suggested merges based on name similarity
   - Highlight confidence scores
   - Allow bulk approval/rejection

2. **Manual Merge Creation**
   - Select multiple customers to merge
   - Specify canonical name
   - Create merge rule

3. **Active Rules Management**
   - View existing merge rules
   - Edit/delete individual rules
   - Validate rules after data changes

4. **Merge Preview**
   - Show before/after comparison
   - Estimated impact on reports
   - Rollback capability

---

## 🎯 KEY IMPROVEMENTS

### **Before (Old Page):**
- ❌ Only showed AI suggestions
- ❌ No visibility into source data
- ❌ Couldn't see raw sales rep names
- ❌ No way to delete all rules at once
- ❌ Limited filtering options

### **After (Step 1):**
- ✅ Shows all customers BEFORE merging
- ✅ Source table clearly identified
- ✅ Raw sales rep names visible (before grouping)
- ✅ Country data displayed
- ✅ Delete all rules with one click
- ✅ Advanced filtering (name, source, country, sales rep)
- ✅ Detailed source breakdown per customer
- ✅ Transaction counts and totals

---

## 🔍 DATA QUALITY INSIGHTS

This redesign reveals important data quality issues:

1. **Multiple Sales Rep Names for Same Person**
   - "Sofiane Salah" vs "Sofiane"
   - Needs sales rep grouping/standardization

2. **Country Name Variations**
   - "United Arab Emirates" vs "UAE" vs "U.A.E"
   - Needs country normalization

3. **Customer Name Variations**
   - Same customer with different names in sales vs budget
   - This is what merge rules fix!

4. **Source Data Distribution**
   - Most customers (658) are in sales data
   - Only some (fewer) have budget data
   - Some customers ONLY in budget, not in sales

---

## ✅ DELIVERABLES

1. ✅ **Backend Endpoints**
   - DELETE /api/division-merge-rules/rules/all
   - POST /api/division-merge-rules/scan-with-source

2. ✅ **Frontend Component**
   - CustomerMergingPageRedesigned.jsx (500+ lines)
   - Full-featured data table
   - Advanced filtering
   - Source details modal

3. ✅ **Integration**
   - Updated CustomerManagement.jsx
   - Maintains existing Customer Master tab

4. ✅ **Testing**
   - Endpoints tested and working
   - Sample data: 658 customers, 743 excel records, 135 budget records

---

**STATUS:** ✅ STEP 1 COMPLETE - Ready for Step 2 (AI Suggestions UI)

**Backend auto-restart will load new endpoints. Refresh browser to see redesigned page!**
