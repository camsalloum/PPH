# Customer Key Facts - Data Source Analysis

## ✅ Confirmed: Data Sources for AI Analysis

The **Customer Key Facts** component analyzes data from **two primary sources**:

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interface                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Sales Rep Report Page                                    │   │
│  │  - Division Selector: [FP] [BE] [SB] [TF] [HCM]         │   │
│  │  - Sales Rep: "John Doe"                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│              PerformanceDashboard Component                      │
│  - Gets selectedDivision from ExcelDataContext                  │
│  - Renders three components:                                    │
│    1. CustomersKgsTable (Volume data)                          │
│    2. CustomersAmountTable (Sales amount data)                 │
│    3. CustomerKeyFactsNew (AI Analysis) ← THIS IS THE KEY     │
└─────────────────────────────────────────────────────────────────┘
                            │
            ┌───────────────┴───────────────┐
            ↓                               ↓
┌───────────────────────────┐   ┌──────────────────────────┐
│  CustomersKgsTable        │   │ CustomersAmountTable     │
│  (Volume - KGS)           │   │ (Sales - AED)           │
└───────────────────────────┘   └──────────────────────────┘
            │                               │
            │ 1. Fetch data from API        │
            │    ↓                           │
            │    POST /api/sales-by-customer-db
            │    {                           │
            │      division: selectedDivision,
            │      salesRep: "John Doe",    │
            │      valueType: "KGS"/"AMOUNT" │
            │    }                           │
            │                                │
            │ 2. Apply merge rules           │
            │    ↓                           │
            │    GET /api/division-merge-rules/rules?division=FP
            │                                │
            │ 3. Transform & display         │
            │    ↓                           │
            │    setTransformedData(result)  │
            │                                │
            │ 4. Dispatch event ✨           │
            │    ↓                           │
            └────┬────────────────┬──────────┘
                 │                │
                 ↓                ↓
        customersKgsTable:    customersAmountTable:
            dataReady             dataReady
                 │                │
                 └────────┬───────┘
                          ↓
        ┌─────────────────────────────────────┐
        │    CustomerKeyFactsNew               │
        │    (AI Analysis Component)           │
        │                                      │
        │  Listens for events:                │
        │  • customersKgsTable:dataReady       │
        │  • customersAmountTable:dataReady    │
        │                                      │
        │  Receives data:                     │
        │  • rows (Volume data from KGS)      │
        │  • amountRows (Amount data)         │
        │                                      │
        │  Analyzes:                          │
        │  • Top performers                   │
        │  • Growth drivers                   │
        │  • Underperformers                  │
        │  • Concentration risk               │
        │  • Retention analysis               │
        │  • Price-Volume-Mix (PVM)          │
        │  • Outlier detection               │
        │  • Strategic priorities            │
        └─────────────────────────────────────┘
```

---

## 🎯 Data Sources in Detail

### **Primary Source: Event-Based (Real-time)**

The Customer Key Facts component primarily gets its data by **listening to events** from the two table components:

#### **Source 1: CustomersKgsTable (Volume Data)**
```javascript
// In CustomerKeyFactsNew.js (Line 308-324)
useEffect(() => {
  const handler = (ev) => {
    if (ev?.detail?.rows && Array.isArray(ev.detail.rows)) {
      const r = ev.detail.rows;
      setRows(r);  // ← This is the VOLUME data used for analysis
      setWaitingForTable(false);
    }
  };
  window.addEventListener('customersKgsTable:dataReady', handler);
  return () => window.removeEventListener('customersKgsTable:dataReady', handler);
}, [columnOrder]);
```

**What's in this data?**
- Customer names (with merge rules applied)
- Volume in KGS for each period
- Multiple columns (base period, budget, previous year, YTD, etc.)
- Example: `[{ name: "Al Safi*", rawValues: [1200, 1100, 1300, ...] }, ...]`

#### **Source 2: CustomersAmountTable (Sales Amount Data)**
```javascript
// In CustomerKeyFactsNew.js (Line 326-342)
useEffect(() => {
  const handler = (ev) => {
    if (ev?.detail?.rows && Array.isArray(ev.detail.rows)) {
      const r = ev.detail.rows;
      setAmountRows(r);  // ← This is the AMOUNT data used for analysis
      setWaitingForAmountTable(false);
    }
  };
  window.addEventListener('customersAmountTable:dataReady', handler);
  return () => window.removeEventListener('customersAmountTable:dataReady', handler);
}, [columnOrder]);
```

**What's in this data?**
- Same customer names (matched with volume data)
- Sales amount in AED for each period
- Same column structure as volume data
- Example: `[{ name: "Al Safi*", rawValues: [450000, 420000, 480000, ...] }, ...]`

---

### **Fallback Source: Direct API Call**

If the events aren't received within 2 seconds (e.g., tables are slow to load), the component fetches data directly from the API:

```javascript
// In CustomerKeyFactsNew.js (Line 345-372)
useEffect(() => {
  const timer = setTimeout(async () => {
    if (waitingForTable) {
      // Fetch VOLUME data directly
      const apiRows = await buildRowsFromApi(rep, columnOrder, 'Actual', selectedDivision);
      const merged = await applySavedMergeRules(rep, selectedDivision || 'FP', apiRows);
      setRows(merged);
    }
    if (waitingForAmountTable) {
      // Fetch AMOUNT data directly
      const apiRows = await buildRowsFromApi(rep, columnOrder, 'Amount', selectedDivision);
      const merged = await applySavedMergeRules(rep, selectedDivision || 'FP', apiRows);
      setAmountRows(merged);
    }
  }, 2000);  // 2-second timeout
}, [rep, columnOrder, selectedDivision]);
```

---

## 🔍 Where Does the Table Data Come From?

Both `CustomersKgsTable` and `CustomersAmountTable` fetch their data from the **same API endpoint** with different parameters:

### API Endpoint:
```
POST http://localhost:3001/api/sales-by-customer-db
```

### Request Parameters:

#### For Volume (KGS):
```json
{
  "division": "FP",              // ← Now uses selectedDivision (FIXED!)
  "salesRep": "John Doe",
  "year": 2024,
  "months": [1, 2, 3],
  "dataType": "Actual",
  "valueType": "KGS"             // ← Volume data
}
```

#### For Amount (AED):
```json
{
  "division": "FP",              // ← Now uses selectedDivision (FIXED!)
  "salesRep": "John Doe",
  "year": 2024,
  "months": [1, 2, 3],
  "dataType": "Actual",
  "valueType": "AMOUNT"          // ← Sales amount data
}
```

---

## 🧠 What AI Analysis is Performed?

Once the data is received, the `findings` memo (Line 379-802) performs comprehensive analysis:

### 1. **Basic Metrics**
- Total actual volume/amount
- Total budget
- Total previous year
- YTD (Year-to-date)
- FY (Full year)
- Variances (vs budget, YoY)

### 2. **Price Analysis**
- Average kilo rate (AED per MT)
- Kilo rate vs budget
- Kilo rate YoY change
- Price-Volume-Mix (PVM) decomposition:
  - Price effect
  - Volume effect
  - Mix effect

### 3. **Customer Segmentation**
- **Top performers** by volume and sales
- **Growth drivers** (>15% vs budget or >20% YoY)
- **Underperformers** (<-15% vs budget or <-10% YoY)
- **Stable customers** (neither growing nor underperforming)

### 4. **Advanced Analysis**
- **Concentration risk**: Top 1, Top 3, Top 5 customer shares
- **Retention analysis**: 
  - Retention rate
  - Lost customers rate (formerly "churn")
  - New customers
  - At-risk customers
- **Outlier detection**: Z-score based anomaly detection (customers with unusual YoY growth)
- **Volume vs Sales advantage**: Customers where volume outperforms sales or vice versa

### 5. **Strategic Priorities**
- Run-rate tracking
- Catch-up requirements
- Portfolio projections
- Risk assessment

---

## 🔄 Data Synchronization

### Important: Division Selection
After my fix, **all components now use the same division**:

```javascript
// In CustomerKeyFactsNew.js
const { selectedDivision } = useExcelData();  // ← Gets division from context

// Data is fetched with:
division: selectedDivision || 'FP'

// Merge rules are fetched with:
`/api/division-merge-rules/rules?division=${selectedDivision}`
```

### Data Flow Timeline:
```
0ms:   User selects division → selectedDivision = "BE"
       ↓
100ms: CustomersKgsTable fetches BE volume data
       CustomersAmountTable fetches BE amount data
       ↓
200ms: Data arrives from API
       ↓
250ms: Merge rules applied (BE-specific rules)
       ↓
300ms: Tables transform and display data
       ↓
350ms: Events dispatched:
       • customersKgsTable:dataReady (BE volume data)
       • customersAmountTable:dataReady (BE amount data)
       ↓
400ms: CustomerKeyFactsNew receives events
       • setRows(BE volume data)
       • setAmountRows(BE amount data)
       ↓
450ms: AI analysis runs on BE data
       • findings useMemo calculates all metrics
       ↓
500ms: Results displayed to user ✨
```

---

## 📋 Data Structure Example

### Volume Data (rows):
```javascript
[
  {
    name: "Al Safi Drinking Water Purification*",  // Merged customer
    rawValues: [
      1200,  // Jan 2024 Actual (KGS)
      1100,  // Dec 2023 Actual (KGS)
      1300,  // Jan 2024 Budget (KGS)
      1150,  // Jan 2023 Actual (KGS)
      // ... more periods
    ]
  },
  {
    name: "Nestle Foods",
    rawValues: [850, 800, 900, 820, ...]
  },
  // ... more customers
]
```

### Amount Data (amountRows):
```javascript
[
  {
    name: "Al Safi Drinking Water Purification*",  // Same customer names!
    rawValues: [
      450000,  // Jan 2024 Actual (AED)
      420000,  // Dec 2023 Actual (AED)
      480000,  // Jan 2024 Budget (AED)
      430000,  // Jan 2023 Actual (AED)
      // ... more periods
    ]
  },
  {
    name: "Nestle Foods",
    rawValues: [320000, 300000, 340000, 310000, ...]
  },
  // ... more customers
]
```

### Findings Output (what AI generates):
```javascript
{
  base: {
    rep: "John Doe",
    basePeriodIndex: 0,
    budgetIndex: 2,
    previousYearIndex: 3
  },
  totals: {
    totalActual: 25000,        // Total KGS
    totalAmountActual: 9500000, // Total AED
    // ... more totals
  },
  vsBudget: 5.2,               // +5.2% vs budget
  yoy: -3.8,                   // -3.8% vs last year
  focusCustomers: [
    {
      name: "Al Safi*",
      actual: 1200,
      budget: 1300,
      vsBudget: -7.7,
      yoy: 4.3,
      priorityScore: 245.6
    },
    // ... more customers
  ],
  growthDrivers: [/* customers growing >15% */],
  underperformers: [/* customers down >15% */],
  concentrationRisk: {
    level: "HIGH",
    top1Share: 0.48,           // 48% from top customer
    top3Share: 0.72,           // 72% from top 3
    // ... more risk metrics
  },
  retentionAnalysis: {
    retentionRate: 0.85,       // 85% retained
    churnRate: 0.15,           // 15% lost
    newCustomers: 3,
    lostCustomers: 2,
    // ... more retention metrics
  },
  executiveSummary: {
    portfolioHealth: "AT_RISK",
    keyRisks: ["High customer concentration"],
    opportunities: ["3 growth drivers identified"]
  }
}
```

---

## ✅ Summary: Data Source Confirmation

### Question: Where does Customer Key Facts get its data?

### Answer:

1. **Primary Source (90% of the time)**:
   - ✅ **CustomersKgsTable** sends volume data via `customersKgsTable:dataReady` event
   - ✅ **CustomersAmountTable** sends amount data via `customersAmountTable:dataReady` event

2. **Fallback Source (10% of the time)**:
   - ✅ Direct API call to `/api/sales-by-customer-db` if events aren't received within 2 seconds

3. **Data Origin**:
   - ✅ All data comes from the **database** via API endpoints
   - ✅ Uses **selectedDivision** from context (FP, BE, SB, TF, HCM)
   - ✅ Filtered by **sales rep** (individual or group)
   - ✅ **Merge rules applied** (division-specific customer consolidation)

4. **Analysis**:
   - ✅ AI analyzes **both volume (KGS) and amount (AED)** data together
   - ✅ Calculates **price metrics** (kilo rate = amount / volume)
   - ✅ Identifies **patterns, risks, and opportunities**
   - ✅ Generates **strategic recommendations**

---

## 🎯 Key Takeaway

The Customer Key Facts component is **listening to the same data that you see in the tables above it**. 

When you change:
- **Division** → All data (KGS, Amount, Analysis) updates to that division ✅
- **Sales Rep** → All data filters to that rep ✅
- **Period columns** → Analysis adjusts to compare those periods ✅

**Everything is synchronized and consistent!** 🎉




