# Customer Merge UI Cleanup - Complete Removal Plan

## Problem
Checkboxes and merge UI elements are still visible in the "Customers - Sales Kgs Comparison" table in the Sales Rep Report, violating the requirement that merging should ONLY happen in Master Data > Customer Merging page.

## Solution: Complete Removal of Merge UI from Non-Master Data Pages

---

## 1. Remove Merge UI from SalesBySaleRepTable.js

### File: `src/components/dashboard/SalesBySaleRepTable.js`

#### A. Remove MergedGroupsDisplay Component (Lines 13-135)
**DELETE LINES 13-135** - The entire `MergedGroupsDisplay` component

Replace with:
```javascript
// REMOVED: MergedGroupsDisplay component
// Customer merging is exclusively managed in: Master Data > Customer Merging
// This component only displays data with merge rules already applied from DB
```

#### B. Remove merge-related state variables (around line 1000-1050)
Find and **DELETE**:
```javascript
const [selectedCustomers, setSelectedCustomers] = useState(new Set());
const [editingGroup, setEditingGroup] = useState(null);
const [groupName, setGroupName] = useState('');
```

#### C. Remove enableMergeUI flag (Line 1033)
**DELETE**:
```javascript
const enableMergeUI = false;
```

#### D. Remove all merge-related handler functions
Search and **DELETE** these functions:
- `handleCustomerSelect`
- `handleGroupSave`
- `handleGroupCancel`
- `handleGroupEdit`
- `handleGroupDeleted`
- Any other functions related to customer selection/merging

#### E. Remove merge UI rendering (around lines 2048-2260)
**DELETE** all code blocks wrapped in:
```javascript
{enableMergeUI && ... }
```

This includes:
- Customer selection checkboxes
- "Save as Group" button
- Group editing forms
- MergedGroupsDisplay component rendering

---

## 2. Ensure CustomersKgsTable is Read-Only

### File: `src/components/reports/CustomersKgsTable.js`

#### Verify NO checkboxes in table rows (Line 835-836)
**Current (CORRECT)**:
```javascript
<tr key={customer.name} className="product-row">
  <td className="row-label product-name">{toProperCase(customer.name)}</td>
```

**Make sure there is NO**:
```javascript
// ❌ DON'T ADD THIS
<td><input type="checkbox" ... /></td>
```

---

## 3. Ensure CustomersAmountTable is Read-Only

### File: `src/components/reports/CustomersAmountTable.js`

#### Verify NO checkboxes in table rows (Line 236-244)
**Current (CORRECT)**:
```javascript
<tr key={idx}>
  <td style={{ ... }}>
    {toProperCase(String(customer.name || ''))}
  </td>
```

**Make sure there is NO**:
```javascript
// ❌ DON'T ADD THIS
<td><input type="checkbox" ... /></td>
```

---

## 4. Remove Legacy API Endpoints (Optional - for clean architecture)

### File: `server/server.js`

#### A. Remove old customer-merge-rules endpoints (Lines ~2755-2776)
**DELETE**:
```javascript
app.get('/api/customer-merge-rules', async (req, res) => { ... });
app.post('/api/customer-merge-rules/save', async (req, res) => { ... });
// Plus any other /api/customer-merge-rules/* endpoints
```

**Note**: These are superseded by the new division-based endpoints:
- `/api/division-merge-rules/*` (defined in `server/routes/divisionMergeRules.js`)

---

## 5. CSS Cleanup (if checkboxes persist)

### File: Check if using `src/components/reports/ProductGroupsKgsTable.css`

Search for any CSS rules that add checkboxes visually:
```css
/* Search for and remove any pseudo-elements creating checkboxes */
.product-row td:first-child::before {
  content: "☐"; /* Remove if found */
}

.row-label::before {
  content: "□"; /* Remove if found */
}
```

---

## 6. Verification Checklist

After implementing changes, verify:

- [ ] **Sales Rep Report**: No checkboxes visible in customer tables
- [ ] **Sales Rep Report**: No "merge" buttons or UI controls
- [ ] **Sales Rep Report**: Customers display correctly with merged names (asterisk *)
- [ ] **Master Data > Customer Merging**: All merge functionality still works
- [ ] **Master Data > Customer Merging**: Can create, edit, delete merge rules
- [ ] **Sales Rep Report**: Automatically reflects merge rules from Master Data

---

## 7. Testing Plan

### Test 1: Create Merge Rule in Master Data
1. Go to **Master Data > Customer Merging**
2. Create a manual merge rule (e.g., "Customer A" + "Customer B" → "Customer AB")
3. Verify rule appears in "Active Rules" tab

### Test 2: Verify Merge Applied in Reports
1. Go to **Sales by Sales Rep** (if applicable)
2. Go to **Sales Rep Report > Customers Performance Analysis**
3. Verify "Customer AB*" appears (with asterisk)
4. Verify "Customer A" and "Customer B" are no longer listed separately
5. Verify **NO checkboxes** or merge buttons visible

### Test 3: Edit Merge Rule
1. Go to **Master Data > Customer Merging**
2. Edit the "Customer AB" rule
3. Change merged name to "Customer ABC"
4. Verify change reflects in all reports

### Test 4: Delete Merge Rule
1. Go to **Master Data > Customer Merging**
2. Delete the "Customer ABC" rule
3. Verify "Customer A" and "Customer B" appear separately in reports again

---

## Expected Final State

### ✅ CORRECT Implementation:

```
┌─────────────────────────────────────────┐
│  Master Data > Customer Merging         │
│  ✅ CREATE merge rules                  │
│  ✅ EDIT merge rules                    │
│  ✅ DELETE merge rules                  │
│  ✅ AI suggestions                      │
│  ✅ Validation                          │
└─────────────────┬───────────────────────┘
                  │
                  │ Saves to DB
                  ▼
┌─────────────────────────────────────────┐
│  division_customer_merge_rules (DB)    │
│  📊 Single Source of Truth              │
└─────────────────┬───────────────────────┘
                  │
                  │ Read & Apply Rules
                  ▼
┌─────────────────────────────────────────┐
│  Sales Rep Reports & Tables             │
│  ✅ Display merged customers            │
│  ✅ Show asterisk (*) for merged        │
│  ❌ NO checkboxes                       │
│  ❌ NO merge buttons                    │
│  ❌ NO selection UI                     │
│  ❌ NO edit capabilities                │
└─────────────────────────────────────────┘
```

---

## Implementation Steps

1. **Backup your code** (git commit)
2. **Apply Section 1 changes** (SalesBySaleRepTable.js)
3. **Test basic functionality** (no errors in console)
4. **Apply Section 4 changes** (server.js - optional)
5. **Run full verification** (Checklist in Section 6)
6. **Test thoroughly** (Testing Plan in Section 7)

---

## If Checkboxes Still Appear

If checkboxes persist after cleanup:

1. **Inspect Element** in browser DevTools
2. Check which component/CSS is adding them
3. Look for:
   - `<input type="checkbox">`
   - CSS `::before` pseudo-elements
   - Parent component wrapping the table
4. Share findings and I'll provide targeted fix

---

## Contact Points

- **Merge Management**: `src/components/MasterData/CustomerMerging/CustomerMergingPage.js`
- **Backend Rules**: `server/routes/divisionMergeRules.js`
- **DB Service**: `server/database/DivisionMergeRulesService.js`
- **AI Engine**: `server/services/CustomerMergingAI.js`

All other files should be **read-only consumers** of merge rules.
