# AI Learning Analytics Platform: Comprehensive Roadmap

## Division, Sales Rep, Customer & Product Group Intelligence

**Document Version:** 2.2  
**Date:** December 27, 2025  
**Purpose:** Deep technical analysis and implementation roadmap for transforming the IPD 10-12 platform into a true AI-powered analytics system  
**Classification:** AI-Powered Divisional Intelligence & Decision Support Platform

---

## 🚀 IMPLEMENTATION STATUS TRACKER

> **Last Updated:** December 27, 2025 (Phase 1-7 + Advanced AI Engines Completed)

### Overall Progress: ~85% Complete

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1: Foundation** | ✅ Done | Database tables + DataCaptureService |
| **Phase 2: Division & Product Learning** | ✅ Done | Seasonality, dynamic thresholds, predictions |
| **Phase 3: Customer Intelligence** | ✅ Done | Churn prediction, CLV, segmentation, anomaly detection |
| **Phase 4: Sales Rep Intelligence** | ✅ Done | Clustering, patterns, coaching recommendations |
| **Phase 5: Recommendations Engine** | ✅ Done | Recommendations + AI insights integrated into reports |
| **Phase 6: Frontend UI** | ✅ Done | AI Report tab + AI Learning Dashboard complete |
| **Phase 5.5: AI Report Integration** | ✅ Done | Learned data displayed in AI reports |
| **Phase 7: P&L Intelligence** | ✅ Done | Margin learning, cost anomalies, profit prediction |
| **Phase 7.5: Causality Engine** | ✅ Done | Cross-domain "why" analysis |
| **Phase 7.6: Prescriptive Engine** | ✅ Done | Action recommendations, what-if simulation |
| **Phase 8: Supply Chain Intelligence** | ⏳ Not Started | Inventory, demand forecasting |
| **Phase 9: Financial Health** | ⏳ Not Started | Cash flow, credit risk |

### Latest Session Accomplishments (December 27, 2025)

**Data Capture Fixed & Working:**
- [x] Fixed all column name mismatches in DataCaptureService.js
- [x] Fixed product metrics table schema (`avg_price` → `avg_selling_price`)
- [x] Backfilled 72 months of historical data (2020-2025)
- [x] Captured 1,040 product snapshots
- [x] 51 sales reps clustered into 5 categories
- [x] 563 customers segmented into 6 segments
- [x] 30 high-risk churn customers identified

**AI Report Integration:**
- [x] DivisionReportAIService now imports learning services
- [x] Risk alerts include AI churn predictions (marked with `aiGenerated: true`)
- [x] Sales rep evaluation shows AI cluster assignments
- [x] Customer insights show AI segment distribution
- [x] Seasonality alerts for low-season periods
- [x] Added `getAllClusters()` method to SalesRepLearningService
- [x] Added `getHighRiskCustomers()` fix to CustomerLearningService

### Detailed Implementation Checklist

#### ✅ COMPLETED (December 27, 2025)

**Phase 1 - Foundation:**
- [x] **AI Report Tab** - `src/components/writeup/ComprehensiveReportView.jsx`
- [x] **DivisionReportAIService.js** - Core report generation engine
- [x] **Report API Routes** - `/api/report-ai/*` endpoints
- [x] **Executive Summary** - Health score 0-10, component scores
- [x] **P&L Analysis Display** - Wide-format table reading, calculated metrics
- [x] **Sales Rep Evaluation** - Top/bottom performers, achievement %
- [x] **Customer Insights** - Pareto analysis, growth/decline detection
- [x] **Product Performance** - Revenue/volume rankings, ASP
- [x] **Budget Tracking** - Achievement %, gap, run-rate projections
- [x] **Geographic Analysis** - Country distribution, concentration
- [x] **Risk Identification** - Concentration, margin, dependency risks
- [x] **Basic Recommendations** - Priority-ranked action items
- [x] **Basic Feedback** - Thumbs up/down on insights
- [x] **Export PDF/Word** - html2pdf.js integration
- [x] **Database Migration** - `server/migrations/ai_learning_tables.sql` (46 tables created)
- [x] **DataCaptureService.js** - Division, sales rep, customer, product metrics capture
- [x] **Historical Backfill** - Backfill endpoint for historical data capture

**Phase 2 - Division Learning:**
- [x] **DivisionLearningService.js** - Division profile learning
- [x] `{div}_division_behavior_history` table - Monthly snapshots
- [x] `{div}_learned_seasonality` table + detection algorithm
- [x] `{div}_division_predictions` table + forecast model
- [x] `{div}_learned_thresholds` table + dynamic optimization
- [x] Division profile API - `/api/ai-learning/:div/profile`
- [x] Seasonality API - `/api/ai-learning/:div/seasonality`
- [x] Thresholds API - `/api/ai-learning/:div/thresholds`
- [x] Predictions API - `/api/ai-learning/:div/predict`

**Phase 3 - Customer Intelligence:**
- [x] **CustomerLearningService.js** - Behavior analysis
- [x] `{div}_customer_behavior_history` table
- [x] `{div}_customer_segments` table + RFM-based segmentation
- [x] `{div}_customer_churn_predictions` table + risk scoring
- [x] `{div}_customer_lifetime_value` table + CLV calculation
- [x] `{div}_customer_anomalies` table + z-score detection
- [x] Churn prediction API - `/api/ai-learning/:div/customers/churn`
- [x] High-risk customers API - `/api/ai-learning/:div/customers/high-risk`
- [x] Customer segmentation API - `/api/ai-learning/:div/customers/segment`
- [x] CLV API - `/api/ai-learning/:div/customers/clv`

**Phase 4 - Sales Rep Intelligence:**
- [x] **SalesRepLearningService.js** - Rep analysis
- [x] `{div}_salesrep_behavior_history` table - 1,194 records
- [x] `{div}_salesrep_clusters` table + performance clustering - 51 reps clustered
- [x] `{div}_salesrep_learned_patterns` table - 107 patterns learned
- [x] `{div}_salesrep_coaching_history` table (structure ready, coaching generation works)
- [x] Clustering API - `/api/ai-learning/:div/salesreps/cluster`
- [x] Pattern learning API - `/api/ai-learning/:div/salesreps/patterns`
- [x] Rep profile API - `/api/ai-learning/:div/salesreps/:rep/profile`
- [x] Coaching API - `/api/ai-learning/:div/salesreps/:rep/coaching`

**Phase 5 - Recommendations:**
- [x] `{div}_ai_recommendations` table (structure ready)
- [x] `{div}_recommendation_feedback` table
- [x] `{div}_insight_feedback` table
- [x] Recommendation recording API
- [x] Outcome tracking API

**API Routes Created:**
- [x] `/api/ai-learning/:division/capture` - Capture metrics for period
- [x] `/api/ai-learning/:division/backfill` - Historical backfill
- [x] `/api/ai-learning/:division/learn/all` - Run full learning cycle
- [x] `/api/ai-learning/:division/status` - Learning status

#### ⏳ PENDING IMPLEMENTATION

**Auto-Learning System (Completed Dec 27):**
- [x] `AutoLearningService.js` - Automatic learning trigger service
- [x] `LearningScheduler.js` - Daily scheduler (2 AM default)
- [x] `/api/ai-learning/:div/auto/run` - Manual trigger API
- [x] `/api/ai-learning/:div/auto/status` - Learning status API
- [x] **Frontend Dashboard** - `AILearningDashboard.jsx` component ✅
- [x] **Admin "Run Learning" Button** - In dashboard component ✅
- [x] **Churn Alert Components** - `ChurnAlertBanner.jsx` + `ChurnAlertsList.jsx` ✅

**Advanced AI Engines (Completed Dec 27):**
- [x] `PLLearningService.js` - P&L Intelligence (margin trends, cost anomalies, profitability prediction) ✅
- [x] `CausalityEngine.js` - Cross-domain "why" analysis (sales drivers, churn causes, correlations) ✅
- [x] `PrescriptiveEngine.js` - Decision simulation & action recommendations ✅
- [x] API routes for P&L (`/api/ai-learning/:div/pl/*`)
- [x] API routes for Causality (`/api/ai-learning/:div/causality/*`)
- [x] API routes for Prescriptive (`/api/ai-learning/:div/prescriptive/*`)
- [x] Integration into AutoLearningService (tasks 11-13)

**Product Intelligence (Not Yet Implemented):**
- [ ] `ProductLearningService.js` - Does not exist yet
- [ ] `{div}_product_lifecycle` table - Empty, needs lifecycle classification logic
- [ ] Product lifecycle stage detection (introduction/growth/mature/decline)

**Coaching History Persistence:**
- [ ] Save coaching recommendations to `{div}_salesrep_coaching_history`
- [ ] Track coaching outcomes over time

**AI Recommendations Storage:**
- [ ] Populate `{div}_ai_recommendations` from generated insights
- [ ] Track recommendation acceptance/rejection

**Phase 8 - Supply Chain Intelligence:**
- [ ] `SupplyChainLearningService.js`
- [ ] `{div}_inventory_intelligence` table
- [ ] `{div}_production_optimization` table
- [ ] `{div}_raw_material_forecast` table

**Phase 9 - Financial Health:**
- [ ] `FinancialHealthService.js`
- [ ] Cash flow prediction model
- [ ] Credit risk scoring model
- [ ] True profitability (ABC costing)

**Remaining Advanced Services:**
- [ ] `ManufacturingIntelligenceService.js` - OEE, waste
- [ ] `FeedbackLearningService.js` - Self-improvement

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Analysis](#2-current-state-analysis)
3. [What is "Real AI" vs Rule-Based Analytics](#3-what-is-real-ai-vs-rule-based-analytics)
4. [Existing Data Architecture](#4-existing-data-architecture)
5. [Current Analytics Capabilities](#5-current-analytics-capabilities)
6. [AI Learning Gap Analysis](#6-ai-learning-gap-analysis)
7. [Proposed AI Tab: Division AI Analytics](#7-proposed-ai-tab-division-ai-analytics)
8. [Technical Implementation Plan](#8-technical-implementation-plan)
9. [Database Schema Design](#9-database-schema-design)
10. [Learning Services Architecture](#10-learning-services-architecture)
11. [Priority Matrix & Timeline](#11-priority-matrix--timeline)
  - 11.4 [Implementation-Ready MVP Tracks (Margin + Churn)](#114-implementation-ready-mvp-tracks-margin--churn)
12. [Risk Assessment](#12-risk-assessment)
13. [Success Metrics](#13-success-metrics)
14. [Coverage Scorecard & Gap Analysis](#14-coverage-scorecard--gap-analysis)
    - 14.3 [Critical Gaps: From Dashboard to True Intelligence](#143-critical-gaps-from-dashboard-to-true-intelligence)
      - Gap 1: Manufacturing Operations Intelligence
      - Gap 2: Cross-Domain Causality Engine
      - Gap 3: Prescriptive Intelligence (Action Layer)
      - Gap 4: Learning Feedback Loops
      - Gap 5: Risk & Early-Warning Intelligence
      - Gap 6: Unified Divisional "AI Brain" Layer
    - 14.4 [Gap Summary: Intelligence Maturity Matrix](#144-gap-summary-intelligence-maturity-matrix)
15. [Governance, Trust & Explainability](#15-governance-trust--explainability)
16. [Future Roadmap: Closed-Loop Control](#16-future-roadmap-closed-loop-control)
17. [Appendix: Quick Reference](#17-appendix-quick-reference)
18. [Conclusion](#18-conclusion)

---

## 1. Executive Summary

### Current Reality

The IPD 10-12 platform is a **sophisticated rule-based analytics system**, NOT a true AI system. While it provides valuable business intelligence through:

- **Write-Up V2 (Smart Analysis)** - Captures chart/table data and generates narrative reports using fixed templates
- **Product Group Key Facts** - Uses hardcoded thresholds (e.g., `-15%` underperformance) to categorize products
- **Customer Key Facts** - Applies static z-score detection and fixed business rules
- **KPI Executive Summary** - Displays calculated metrics with no learning capability

**The only true AI in the system is the Customer Merging AI** which:
- ✅ Learns from admin approve/reject decisions
- ✅ Uses gradient descent to optimize algorithm weights
- ✅ Stores training history and improves over time
- ✅ Has division-specific models

### Vision

Transform the platform into a **complete AI-powered analytics ecosystem** that:

1. **Learns from every interaction** - Dashboard views, period selections, export actions
2. **Predicts outcomes** - Churn risk, budget achievement probability, growth potential
3. **Recommends actions** - Which customers to focus on, which products need intervention
4. **Benchmarks intelligently** - Compares sales reps to "similar" top performers, not just averages
5. **Identifies hidden patterns** - Cross-customer, cross-product, seasonal, market-wide trends

---

## 2. Current State Analysis

### 2.1 Dashboard Architecture

```
Dashboard (Main)
├── Home View (3 cards)
│   ├── 📊 Divisional Dashboard → DivisionalDashboardLanding
│   ├── 👥 Sales Dashboard → SalesBySaleRepTable
│   └── ✍️ Write-Up → WriteUpViewV2 (Smart Analysis)
│
├── DivisionalDashboardLanding (12 sub-cards)
│   ├── PRIMARY: Divisional KPIs → KPIExecutiveSummary
│   ├── CHARTS:
│   │   ├── Sales & Volume Analysis → SalesVolumeDetail
│   │   ├── Margin Analysis → MarginAnalysisDetail
│   │   ├── Manufacturing Cost → ManufacturingCostDetail
│   │   ├── Below GP Expenses → BelowGPExpensesDetail
│   │   ├── Cost & Profitability Trend → CombinedTrendsDetail
│   │   └── Budget vs Actual Bridge → BudgetActualWaterfallDetail
│   └── TABLES:
│       ├── P&L Statement → PLFinancialDetail
│       ├── Product Groups → ProductGroupDetail
│       │   └── 📈 Product Group Key Facts (tab)
│       ├── Sales by Reps → SalesRepDetail
│       ├── Sales by Customers → SalesCustomerDetail
│       │   └── 📈 Customer Key Facts (tab)
│       └── Sales by Countries → SalesCountryDetail
│
└── SalesBySaleRepTable
    ├── Per-Rep Tabs
    │   ├── Tables Tab (4 sub-tabs)
    │   │   ├── Product Groups KGS Table
    │   │   ├── Product Groups Amount Table
    │   │   ├── Customers KGS Table
    │   │   └── Customers Amount Table
    │   ├── Product Group Key Facts Tab ⭐
    │   ├── Customer Key Facts Tab ⭐
    │   └── Report Tab → SalesRepReport
    └── HTML Export functionality
```

### 2.2 Data Flow

```
Data Sources:
┌─────────────────────────────────────────────────────────┐
│ PostgreSQL Database                                      │
├─────────────────────────────────────────────────────────┤
│ Actual/Estimate Data:                                    │
│   fp_data_excel, hc_data_excel                           │
│   Columns: salesrepname, productgroup, customername,     │
│            country, year, month, type, values_type,      │
│            values                                        │
├─────────────────────────────────────────────────────────┤
│ Budget Data (2025+):                                     │
│   fp_sales_rep_budget, hc_sales_rep_budget               │
├─────────────────────────────────────────────────────────┤
│ P&L Data:                                                │
│   fp_pl_data, hc_pl_data                                 │
├─────────────────────────────────────────────────────────┤
│ Master Data:                                             │
│   product_groups, customer_master, countries,            │
│   exchange_rates, sales_rep_groups, territories          │
├─────────────────────────────────────────────────────────┤
│ AI Learning (Customer Merging only):                     │
│   fp_ai_learning_data, fp_ai_model_weights,              │
│   fp_ai_training_history, fp_merge_rule_suggestions      │
└─────────────────────────────────────────────────────────┘
```

### 2.3 Key Components Analyzed

| Component | Lines | Primary Function | AI Score |
|-----------|-------|------------------|----------|
| `CustomerMergingAI.js` | 2028 | Fuzzy matching + ML weights | 9/10 ✅ |
| `AILearningService.js` | 876 | Gradient descent training | 9/10 ✅ |
| `ProductGroupKeyFacts.js` | 1157 | Rule-based analysis | 3/10 ❌ |
| `CustomerKeyFactsNew.js` | 1683 | Rule-based analysis | 3/10 ❌ |
| `WriteUpViewV2.js` | 382 | Template-based narratives | 2/10 ❌ |
| `KPIExecutiveSummary.js` | 1159 | Calculated metrics | 2/10 ❌ |
| `insightEngine.js` | 62 | Simple scoring | 2/10 ❌ |

---

## 3. What is "Real AI" vs Rule-Based Analytics

### 3.1 Characteristics of Real AI/ML Systems

| Characteristic | Description | Example |
|----------------|-------------|---------|
| **Learning from Data** | Adjusts behavior based on feedback | CustomerMergingAI learns from approve/reject |
| **Weight Optimization** | Uses gradient descent or similar | `learningRate: 0.01, L2 regularization` |
| **Training/Validation Split** | Separates data for learning and testing | 80/20 split in AILearningService |
| **Model Persistence** | Stores trained models for reuse | `ai_model_weights` table |
| **Continuous Improvement** | Performance improves with more data | Auto-retrains after 50 decisions |
| **Prediction Capability** | Forecasts future outcomes | Churn prediction, budget achievement |
| **Feature Engineering** | Extracts meaningful patterns | Phonetic blocking, n-gram matching |

### 3.2 What Rule-Based Systems Do (Current State)

| Pattern | Example in Current Code |
|---------|-------------------------|
| **Fixed Thresholds** | `UNDERPERF_VOL_PCT = -15` in ProductGroupKeyFacts |
| **Static Scoring** | `materialityScore = budgetShare * actualShare` |
| **Hardcoded Rules** | `if (zScore > 3) category = 'EXTREME'` |
| **No Feedback Loop** | Never learns if recommendations were useful |
| **No History** | Doesn't remember past patterns for same customer |
| **Static Weights** | `budgetWeight * 0.6 + actualContribution * 0.4` |

### 3.3 The AI Transformation Gap

```
Current State:                         Target State:
┌────────────────────┐                 ┌────────────────────┐
│ Fixed Thresholds   │ ───────────►   │ Learned Thresholds │
│ -15% = underperf   │                 │ Division-specific  │
└────────────────────┘                 └────────────────────┘

┌────────────────────┐                 ┌────────────────────┐
│ No Feedback Loop   │ ───────────►   │ Action Tracking    │
│ One-way insights   │                 │ Did user act on it?│
└────────────────────┘                 └────────────────────┘

┌────────────────────┐                 ┌────────────────────┐
│ Static Scoring     │ ───────────►   │ ML-Optimized       │
│ Hardcoded weights  │                 │ Gradient descent   │
└────────────────────┘                 └────────────────────┘

┌────────────────────┐                 ┌────────────────────┐
│ No History         │ ───────────►   │ Behavioral Memory  │
│ Each view fresh    │                 │ Customer patterns  │
└────────────────────┘                 └────────────────────┘

┌────────────────────┐                 ┌────────────────────┐
│ No Predictions     │ ───────────►   │ Predictive Models  │
│ Just current state │                 │ Churn, growth prob │
└────────────────────┘                 └────────────────────┘
```

---

## 4. Existing Data Architecture

### 4.1 Division Tables (FP as example)

```sql
-- Core Sales Data
fp_data_excel (
  id, salesrepname, productgroup, customername, country,
  year, month, type, values_type, values, created_at
)
-- ~500K+ rows per division

-- Budget Data (2025+)
fp_sales_rep_budget (
  id, salesrepname, productgroup, customername, country,
  year, month, values_type, values, created_at
)

-- P&L Data
fp_pl_data (
  id, row_name, year, month, data_type, value, created_at
)

-- Customer Merge Rules
fp_division_customer_merge_rules (
  id, merged_customer_name, original_customers, created_by, created_at
)

-- AI Learning (Customer Merging only)
fp_ai_learning_data (
  id, pair_id, customer1_id, customer1_name, customer2_id, customer2_name,
  decision, combined_score, levenshtein_score, jarowinkler_score,
  tokenset_score, ngram_score, corebrand_score, phonetic_score, suffix_score,
  decided_by, decided_at, features, processed_for_training
)

fp_ai_model_weights (
  id, model_version, is_active, levenshtein_weight, jarowinkler_weight,
  tokenset_weight, ngram_weight, corebrand_weight, phonetic_weight, suffix_weight,
  training_samples, validation_loss, created_at
)
```

### 4.2 Available Data for Learning

| Data Type | Volume | Frequency | Learning Potential |
|-----------|--------|-----------|-------------------|
| Sales Transactions | 500K+ rows | Monthly | ⭐⭐⭐⭐⭐ |
| Budget vs Actual | Multi-year | Annually | ⭐⭐⭐⭐⭐ |
| Customer History | 3+ years | Monthly | ⭐⭐⭐⭐⭐ |
| Sales Rep Performance | 3+ years | Monthly | ⭐⭐⭐⭐⭐ |
| Product Mix | 3+ years | Monthly | ⭐⭐⭐⭐⭐ |
| P&L Metrics | 3+ years | Monthly | ⭐⭐⭐⭐ |
| Geographic Distribution | 3+ years | Monthly | ⭐⭐⭐⭐ |
| Merge Decisions | 100s | Ongoing | ⭐⭐⭐⭐ (already used) |

---

## 5. Current Analytics Capabilities

### 5.1 Product Group Key Facts (Current)

**Location:** `src/components/reports/ProductGroupKeyFacts.js`

**What it Does:**
- Calculates materiality scores using `budgetShare × actualShare`
- Identifies "critical underperformers" using fixed thresholds
- Categorizes "growth drivers" using static rules
- Analyzes ASP (Average Selling Price) changes
- Calculates run-rate progress

**Hardcoded Thresholds:**
```javascript
const BUDGET_SHARE_MIN = 0.05;      // 5% minimum for focus
const CUM_BUDGET_TARGET = 0.70;     // 70% cumulative coverage
const MAX_FOCUS_ITEMS = 8;
const UNDERPERF_VOL_PCT = -15;      // Volume underperformance
const UNDERPERF_AMT_PCT = -15;      // Sales underperformance
const UNDERPERF_YOY_VOL = -10;      // YoY decline
const GROWTH_VOL_PCT = 10;          // Growth threshold
const GROWTH_AMT_PCT = 10;
const GROWTH_YOY_VOL = 15;
const ASP_DELTA_SHOW = 5;           // ASP change to highlight
const RUNRATE_WARN = 0.85;          // Run-rate warning
```

**AI Score: 3/10** ❌
- ❌ No learning from user actions
- ❌ No threshold optimization
- ❌ No prediction capability
- ❌ No feedback loop
- ❌ No historical pattern detection
- ✅ Sophisticated rule logic
- ✅ Multi-metric analysis
- ✅ Good data visualization

### 5.2 Customer Key Facts (Current)

**Location:** `src/components/reports/CustomerKeyFactsNew.js`

**What it Does:**
- Tiered outlier detection using z-scores
- Price-Volume-Mix (PVM) decomposition
- Run-rate analysis and catch-up calculations
- Top performer identification
- Customer growth tracking

**Hardcoded Thresholds:**
```javascript
const TOP_SHARE_MIN = 0.05;         // 5% share for focus
const CUM_SHARE_TARGET = 0.80;      // 80% coverage
const MAX_FOCUS = 10;
const UNDERPERF_VOL_PCT = -15;
const UNDERPERF_YOY_VOL = -10;
const GROWTH_VOL_PCT = 15;
const GROWTH_YOY_VOL = 20;
const RUNRATE_WARN = 0.85;
```

**Z-Score Tiers (Static):**
```javascript
if (zScore > 3) category = 'EXTREME';    // Always show
if (zScore > 2 && share >= 0.02) category = 'MATERIAL';
if (zScore > 2 && yoyRate > 200) category = 'EMERGING';
```

**AI Score: 3/10** ❌
- ❌ No learning from user focus patterns
- ❌ No churn prediction
- ❌ No customer affinity modeling
- ❌ No recommendation tracking
- ❌ Static z-score thresholds
- ✅ Good statistical analysis
- ✅ Multi-dimensional metrics
- ✅ Solid business logic

### 5.3 Write-Up V2 / Smart Analysis (Current)

**Location:** `src/components/writeup/WriteUpViewV2.js`

**What it Does:**
- Captures data from rendered charts (ECharts instances)
- Builds a "factPack" with KPIs
- Uses insightEngine.js to score insights
- Generates template-based narrative

**AI Score: 2/10** ❌
- ❌ Template-based text generation
- ❌ No NLP or LLM integration
- ❌ No learning from user edits
- ❌ Fixed narrative structure
- ✅ Smart DOM data capture
- ✅ Cross-chart data aggregation

---

## 6. AI Learning Gap Analysis

### 6.1 Missing Learning Loops

| Area | What's Missing | Impact |
|------|---------------|--------|
| **Product Group Analysis** | No tracking of which products user investigates | Can't prioritize products user cares about |
| **Customer Analysis** | No churn prediction model | Reactive, not proactive customer management |
| **Sales Rep Performance** | No learning of "what good looks like" | Generic benchmarks, not personalized coaching |
| **Budget Achievement** | No probability prediction | Just shows % complete, not likelihood |
| **Seasonal Patterns** | No seasonality detection | Same thresholds all year |
| **Cross-Entity Learning** | No customer-product affinity | Misses bundling opportunities |
| **Market Intelligence** | No industry-wide pattern detection | Division operates in isolation |

### 6.2 Feedback Loops to Implement

```
Current Flow (No Learning):
┌────────────┐    ┌─────────────┐    ┌────────────┐
│ Load Data  │ ─► │ Apply Rules │ ─► │ Show UI    │
└────────────┘    └─────────────┘    └────────────┘
                        ▼
                   (Dead End)

Target Flow (AI Learning):
┌────────────┐    ┌─────────────┐    ┌────────────┐
│ Load Data  │ ─► │ Apply AI    │ ─► │ Show UI    │
└────────────┘    └─────────────┘    └────────────┘
       ▲                                    │
       │          ┌─────────────┐           │
       └──────────│ Learn from  │◄──────────┘
                  │ Interactions │
                  └─────────────┘
                        │
                  ┌─────────────┐
                  │ Store in DB │
                  └─────────────┘
```

---

## 7. Proposed AI Tab: Division AI Analytics

### 7.1 New Tab Structure

Add a new major tab called **"🤖 AI Analytics"** to the Divisional Dashboard:

```
DivisionalDashboardLanding
├── [Existing 12 cards]
└── NEW: 🤖 AI Analytics → DivisionAIAnalytics
    ├── Division Overview Tab
    │   ├── AI-Learned Division Profile
    │   ├── Seasonality Patterns (learned)
    │   ├── Predicted vs Actual Trends
    │   └── Market Position Intelligence
    │
    ├── Sales Rep Intelligence Tab
    │   ├── Rep Performance Clusters
    │   ├── Rep Strengths/Weaknesses (learned)
    │   ├── Rep-to-Top-Performer Comparison
    │   ├── Coaching Recommendations
    │   └── Rep × Customer Affinity Matrix
    │
    ├── Customer Intelligence Tab
    │   ├── Customer Segment Clustering
    │   ├── Churn Risk Predictions
    │   ├── Customer Lifetime Value
    │   ├── Behavior Pattern Detection
    │   └── Cross-Sell Opportunities
    │
    ├── Product Intelligence Tab
    │   ├── Product Lifecycle Analysis
    │   ├── Learned Underperformance Thresholds
    │   ├── Product-Customer Affinity
    │   ├── Demand Forecasting
    │   └── Price Sensitivity Learning
    │
    └── Recommendations Tab
        ├── Priority Action Items
        ├── AI Confidence Levels
        ├── Recommendation History
        └── Feedback on Past Recommendations
```

### 7.2 Division Overview Intelligence

**Purpose:** Learn overall division behavior patterns and market position

**Features:**

1. **AI-Learned Division Profile**
   - Automatically characterizes division based on historical data
   - "FP Division: High seasonality Q4, mature product mix, 12% avg margin"
   - Learns to identify division's unique characteristics

2. **Seasonality Detection**
   - Uses time-series analysis to detect monthly/quarterly patterns
   - `seasonality_factor[month]` learned from 3+ years of data
   - Adjusts thresholds based on expected seasonal variation

3. **Predicted vs Actual Tracking**
   - ML model predicts next period based on patterns
   - Shows prediction accuracy over time
   - Learns and improves from prediction errors

4. **Market Intelligence**
   - Aggregated patterns across all sales reps
   - Industry trend detection (if multiple divisions show same pattern)
   - Geographic performance patterns

### 7.3 Sales Rep Intelligence

**Purpose:** Learn what makes top performers successful and transfer knowledge

**Features:**

1. **Performance Clustering**
   - K-means clustering of sales reps based on performance vectors
   - Identifies "archetypes": High-Volume/Low-Margin, Niche-Specialist, etc.
   - Learns natural groupings, not fixed categories

2. **Strengths/Weaknesses Learning**
   - Analyzes which product groups each rep excels at
   - Identifies customer types where rep performs best
   - Learns patterns: "Rep A strong with large customers, weak on new acquisition"

3. **Top Performer Comparison**
   - Compares each rep to "similar" top performers, not just division average
   - Uses learned similarity metrics (not just total sales)
   - Example: "Compared to similar reps in your cluster, your customer retention is 12% below benchmark"

4. **Coaching Recommendations**
   - AI generates specific, actionable recommendations
   - Tracks which recommendations were followed
   - Learns which recommendation types are most effective

5. **Rep × Customer Affinity**
   - Learns which rep-customer combinations are successful
   - Identifies potential customer reassignment opportunities
   - Matrix visualization of affinity scores

### 7.4 Customer Intelligence

**Purpose:** Predict customer behavior and identify risks/opportunities

**Features:**

1. **Customer Segmentation**
   - ML clustering based on behavior patterns
   - Segments: Loyal-Growing, At-Risk, High-Maintenance, Dormant
   - Learns segment transitions over time

2. **Churn Risk Prediction**
   - Binary classification model
   - Features: Recent order patterns, volume trends, payment behavior
   - Probability score with explainability

3. **Customer Lifetime Value**
   - Regression model predicting future value
   - Based on historical patterns and customer age
   - Confidence intervals

4. **Behavior Pattern Detection**
   - Anomaly detection for unusual ordering patterns
   - Seasonality learning per customer
   - Example: "Customer X ordering 40% more than their seasonal norm"

5. **Cross-Sell Opportunities**
   - Learns product affinities from customer purchase history
   - "Customers who buy Product A often also buy Product C"
   - Generates specific recommendations

### 7.5 Product Intelligence

**Purpose:** Learn product dynamics beyond static thresholds

**Features:**

1. **Lifecycle Analysis**
   - Classifies products: Growth, Mature, Declining
   - Learns lifecycle stage from volume/margin trends
   - Predicts when product will transition stages

2. **Dynamic Thresholds**
   - Learns division-specific "normal" variance
   - Example: If FP normally has ±20% variance, -15% isn't critical
   - Adjusts thresholds based on product maturity

3. **Product-Customer Affinity**
   - Which products are "sticky" for which customers
   - Identifies single-product dependency risks
   - Cross-sell opportunity detection

4. **Demand Forecasting**
   - Time-series prediction per product
   - Incorporates seasonality, trends, events
   - Confidence intervals for planning

5. **Price Sensitivity**
   - Learns price elasticity from historical data
   - Identifies products where price changes impact volume
   - Recommends optimal pricing strategies

### 7.6 Recommendations Engine

**Purpose:** Synthesize all learning into actionable priorities

**Features:**

1. **Priority Ranking**
   - AI ranks recommendations by expected business impact
   - Combines urgency, confidence, effort estimate
   - Refreshes daily or on-demand

2. **Confidence Levels**
   - Each recommendation shows AI confidence (%)
   - Explains factors driving the recommendation
   - Shows similar historical cases

3. **History Tracking**
   - Records all past recommendations
   - Tracks which were acted upon
   - Learns from outcomes

4. **Feedback Loop**
   - User can rate recommendations (helpful/not helpful)
   - System learns to improve future recommendations
   - Closes the loop for true AI learning

---

## 8. Technical Implementation Plan

### 8.1 New Services Architecture

```
server/services/
├── CustomerMergingAI.js          ✅ (Existing - Real AI)
├── AILearningService.js          ✅ (Existing - Real AI)
│
├── DivisionLearningService.js    🆕 (NEW)
│   ├── recordDivisionMetrics()
│   ├── learnSeasonality()
│   ├── predictNextPeriod()
│   └── getDivisionProfile()
│
├── SalesRepLearningService.js    🆕 (NEW)
│   ├── recordRepPerformance()
│   ├── clusterReps()
│   ├── learnRepStrengths()
│   ├── compareToTopPerformers()
│   └── generateCoachingRecommendations()
│
├── CustomerLearningService.js    🆕 (NEW)
│   ├── recordCustomerBehavior()
│   ├── clusterCustomers()
│   ├── predictChurnRisk()
│   ├── calculateLifetimeValue()
│   └── detectAnomalies()
│
├── ProductLearningService.js     🆕 (NEW)
│   ├── recordProductMetrics()
│   ├── classifyLifecycle()
│   ├── learnThresholds()
│   ├── forecastDemand()
│   └── learnPriceSensitivity()
│
├── RecommendationEngine.js       🆕 (NEW)
│   ├── generateRecommendations()
│   ├── rankByImpact()
│   ├── trackRecommendationHistory()
│   ├── recordFeedback()
│   └── learnFromOutcomes()
│
├── MarketIntelligenceService.js  🆕 (NEW)
│   ├── aggregateCrossDivision()
│   ├── detectMarketTrends()
│   └── benchmarkToMarket()
│
├── PLLearningService.js          🆕 (NEW) ⭐ PRIORITY 1
│   ├── learnCostPatterns()        // Learn cost behavior over time
│   ├── predictMarginErosion()     // Early warning on margin decline
│   ├── optimizeProductMix()       // Suggest optimal product mix for margin
│   ├── detectPLAnomalies()        // Unusual cost/revenue patterns
│   └── recommendCostActions()     // Actionable cost reduction suggestions
│
├── SupplyChainLearningService.js 🆕 (NEW) ⭐ PRIORITY 2
│   ├── optimizeInventoryLevels()  // ML-based inventory optimization
│   ├── predictProductionNeeds()   // Demand-driven production planning
│   ├── learnLeadTimes()           // Actual vs expected lead time learning
│   └── forecastRawMaterialDemand() // Raw material demand prediction
│
└── FinancialHealthService.js     🆕 (NEW) ⭐ PRIORITY 2
    ├── predictCashFlow()          // Cash flow forecasting
    ├── assessCreditRisk()         // Customer credit risk scoring
    ├── calculateTrueProfitability() // Full-cost profitability per entity
    └── optimizeWorkingCapital()   // Working capital recommendations
```

### 8.2 New Routes

```
server/routes/
├── ai-analytics.js               🆕 (NEW)
│   POST /api/ai-analytics/division/:division/record-view
│   GET  /api/ai-analytics/division/:division/profile
│   GET  /api/ai-analytics/division/:division/seasonality
│   GET  /api/ai-analytics/division/:division/predictions
│
├── sales-rep-ai.js               🆕 (NEW)
│   POST /api/sales-rep-ai/division/:division/record-performance
│   GET  /api/sales-rep-ai/division/:division/clusters
│   GET  /api/sales-rep-ai/division/:division/rep/:rep/strengths
│   GET  /api/sales-rep-ai/division/:division/rep/:rep/coaching
│   GET  /api/sales-rep-ai/division/:division/affinity-matrix
│
├── customer-ai.js                🆕 (NEW)
│   POST /api/customer-ai/division/:division/record-behavior
│   GET  /api/customer-ai/division/:division/segments
│   GET  /api/customer-ai/division/:division/churn-risks
│   GET  /api/customer-ai/division/:division/customer/:id/lifetime-value
│   GET  /api/customer-ai/division/:division/anomalies
│   GET  /api/customer-ai/division/:division/cross-sell
│
├── product-ai.js                 🆕 (NEW)
│   POST /api/product-ai/division/:division/record-metrics
│   GET  /api/product-ai/division/:division/lifecycles
│   GET  /api/product-ai/division/:division/learned-thresholds
│   GET  /api/product-ai/division/:division/forecasts
│   GET  /api/product-ai/division/:division/price-sensitivity
│
├── recommendations.js            🆕 (NEW)
│   GET  /api/recommendations/division/:division
│   POST /api/recommendations/:id/feedback
│   GET  /api/recommendations/division/:division/history
│
├── pl-ai.js                      🆕 (NEW) ⭐ PRIORITY 1
│   POST /api/pl-ai/division/:division/record-metrics
│   GET  /api/pl-ai/division/:division/cost-patterns
│   GET  /api/pl-ai/division/:division/margin-predictions
│   GET  /api/pl-ai/division/:division/anomalies
│   GET  /api/pl-ai/division/:division/product-mix-optimization
│   GET  /api/pl-ai/division/:division/cost-recommendations
│
├── supply-chain-ai.js            🆕 (NEW) ⭐ PRIORITY 2
│   GET  /api/supply-chain-ai/division/:division/inventory-optimization
│   GET  /api/supply-chain-ai/division/:division/production-forecast
│   GET  /api/supply-chain-ai/division/:division/lead-time-analysis
│   GET  /api/supply-chain-ai/division/:division/raw-material-demand
│
└── financial-health-ai.js        🆕 (NEW) ⭐ PRIORITY 2
  GET  /api/financial-health-ai/division/:division/cash-flow-prediction
  GET  /api/financial-health-ai/division/:division/credit-risk/:customer
  GET  /api/financial-health-ai/division/:division/profitability/:entity
  GET  /api/financial-health-ai/division/:division/working-capital
```

### 8.3 New Frontend Components

```
src/components/ai-analytics/
├── DivisionAIAnalytics.js        🆕 (Container)
├── DivisionOverview/
│   ├── AILearnedProfile.js
│   ├── SeasonalityChart.js
│   ├── PredictionAccuracy.js
│   └── MarketPosition.js
│
├── SalesRepIntelligence/
│   ├── RepClustersViz.js
│   ├── StrengthsWeaknesses.js
│   ├── TopPerformerComparison.js
│   ├── CoachingRecommendations.js
│   └── RepCustomerAffinity.js
│
├── CustomerIntelligence/
│   ├── CustomerSegments.js
│   ├── ChurnRiskDashboard.js
│   ├── LifetimeValueChart.js
│   ├── BehaviorAnomalies.js
│   └── CrossSellOpportunities.js
│
├── ProductIntelligence/
│   ├── LifecycleMatrix.js
│   ├── DynamicThresholds.js
│   ├── ProductAffinityMap.js
│   ├── DemandForecast.js
│   └── PriceSensitivityGraph.js
│
└── Recommendations/
    ├── PriorityActionItems.js
    ├── RecommendationCard.js
    ├── ConfidenceIndicator.js
    ├── FeedbackButtons.js
    └── RecommendationHistory.js
```

---

## 9. Database Schema Design

### 9.1 Division Learning Tables

```sql
-- Division behavioral history
CREATE TABLE {div}_division_behavior_history (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  total_margin_pct DECIMAL(8,4),
  customer_count INT,
  product_count INT,
  avg_order_value DECIMAL(14,2),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Learned seasonality patterns
CREATE TABLE {div}_learned_seasonality (
  id SERIAL PRIMARY KEY,
  month INT NOT NULL,
  seasonality_factor DECIMAL(8,4),    -- e.g., 1.2 = 20% above average
  confidence DECIMAL(5,4),
  samples_used INT,
  last_trained TIMESTAMP
);

-- Division predictions
CREATE TABLE {div}_division_predictions (
  id SERIAL PRIMARY KEY,
  prediction_type VARCHAR(50),         -- 'sales', 'volume', 'margin'
  target_year INT,
  target_month INT,
  predicted_value DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  error_pct DECIMAL(8,4),
  model_version INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.2 Sales Rep Learning Tables

```sql
-- Sales rep behavioral history
CREATE TABLE {div}_salesrep_behavior_history (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  customer_count INT,
  product_mix_count INT,
  avg_deal_size DECIMAL(14,2),
  new_customer_count INT,
  lost_customer_count INT,
  budget_achievement_pct DECIMAL(8,4),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rep clusters (learned groupings)
CREATE TABLE {div}_salesrep_clusters (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  cluster_id INT NOT NULL,
  cluster_name VARCHAR(100),           -- 'High Volume', 'Niche Specialist', etc.
  similarity_score DECIMAL(5,4),
  last_clustered TIMESTAMP
);

-- Rep learned patterns
CREATE TABLE {div}_salesrep_learned_patterns (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  pattern_type VARCHAR(50),            -- 'strength', 'weakness', 'tendency'
  pattern_key VARCHAR(100),            -- 'large_customers', 'product_group_X', etc.
  pattern_value DECIMAL(8,4),
  confidence DECIMAL(5,4),
  samples_used INT,
  last_updated TIMESTAMP
);

-- Rep coaching recommendations history
CREATE TABLE {div}_salesrep_coaching_history (
  id SERIAL PRIMARY KEY,
  salesrep_name VARCHAR(255) NOT NULL,
  recommendation_text TEXT NOT NULL,
  recommendation_type VARCHAR(50),
  priority INT,
  was_followed BOOLEAN,
  outcome_measured BOOLEAN,
  outcome_positive BOOLEAN,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  followed_at TIMESTAMP,
  measured_at TIMESTAMP
);
```

### 9.3 Customer Learning Tables

```sql
-- Customer behavioral history
CREATE TABLE {div}_customer_behavior_history (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  salesrep_name VARCHAR(255),
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  product_count INT,
  order_frequency DECIMAL(8,4),        -- Orders per period
  avg_order_size DECIMAL(14,2),
  days_since_last_order INT,
  payment_timeliness DECIMAL(8,4),     -- If available
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer segments (learned)
CREATE TABLE {div}_customer_segments (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  segment_id INT NOT NULL,
  segment_name VARCHAR(100),           -- 'Loyal-Growing', 'At-Risk', etc.
  segment_probability DECIMAL(5,4),
  last_segmented TIMESTAMP
);

-- Churn predictions
CREATE TABLE {div}_customer_churn_predictions (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  churn_probability DECIMAL(5,4),
  risk_level VARCHAR(20),              -- 'HIGH', 'MEDIUM', 'LOW'
  top_risk_factors JSONB,              -- ['declining_volume', 'no_orders_60d', ...]
  prediction_horizon_days INT,          -- e.g., 90 = churn within 90 days
  model_version INT,
  predicted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  actual_churned BOOLEAN,
  verified_at TIMESTAMP
);

-- Customer lifetime value
CREATE TABLE {div}_customer_lifetime_value (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  predicted_clv DECIMAL(18,2),
  clv_confidence_low DECIMAL(18,2),
  clv_confidence_high DECIMAL(18,2),
  customer_age_months INT,
  model_version INT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer anomalies
CREATE TABLE {div}_customer_anomalies (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  anomaly_type VARCHAR(50),            -- 'volume_spike', 'volume_drop', 'new_product', etc.
  anomaly_severity VARCHAR(20),
  expected_value DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  deviation_pct DECIMAL(8,4),
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by INT,
  acknowledged_at TIMESTAMP
);
```

### 9.4 Product Learning Tables

```sql
-- Product metrics history
CREATE TABLE {div}_product_metrics_history (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  total_sales DECIMAL(18,2),
  total_volume DECIMAL(18,2),
  avg_selling_price DECIMAL(12,4),
  customer_count INT,
  budget_variance_pct DECIMAL(8,4),
  yoy_growth_pct DECIMAL(8,4),
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product lifecycle classification
CREATE TABLE {div}_product_lifecycle (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  lifecycle_stage VARCHAR(50),          -- 'introduction', 'growth', 'mature', 'decline'
  stage_probability DECIMAL(5,4),
  months_in_stage INT,
  predicted_next_stage VARCHAR(50),
  transition_probability DECIMAL(5,4),
  model_version INT,
  classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Learned thresholds (division-specific)
CREATE TABLE {div}_learned_thresholds (
  id SERIAL PRIMARY KEY,
  threshold_type VARCHAR(50),           -- 'underperformance_volume', 'growth_trigger', etc.
  threshold_value DECIMAL(8,4),
  baseline_value DECIMAL(8,4),          -- Original hardcoded value
  confidence DECIMAL(5,4),
  samples_used INT,
  is_active BOOLEAN DEFAULT TRUE,
  learned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Product demand forecasts
CREATE TABLE {div}_product_forecasts (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  forecast_type VARCHAR(50),            -- 'volume', 'sales', 'margin'
  target_year INT,
  target_month INT,
  predicted_value DECIMAL(18,2),
  confidence_low DECIMAL(18,2),
  confidence_high DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  model_version INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price sensitivity analysis
CREATE TABLE {div}_price_sensitivity (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  elasticity_coefficient DECIMAL(8,4),  -- Negative = price sensitive
  confidence DECIMAL(5,4),
  data_points_used INT,
  optimal_price_point DECIMAL(12,4),
  last_analyzed TIMESTAMP
);
```

### 9.5 Recommendations Tables

```sql
-- AI Recommendations
CREATE TABLE {div}_ai_recommendations (
  id SERIAL PRIMARY KEY,
  recommendation_type VARCHAR(50),       -- 'customer_action', 'product_action', 'rep_coaching'
  entity_type VARCHAR(50),               -- 'customer', 'product_group', 'salesrep'
  entity_name VARCHAR(255),
  priority_score DECIMAL(8,4),
  confidence DECIMAL(5,4),
  recommendation_text TEXT NOT NULL,
  supporting_evidence JSONB,
  expected_impact_pct DECIMAL(8,4),
  effort_level VARCHAR(20),              -- 'LOW', 'MEDIUM', 'HIGH'
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  acted_upon BOOLEAN DEFAULT FALSE,
  acted_upon_at TIMESTAMP,
  acted_upon_by INT,
  outcome_measured BOOLEAN DEFAULT FALSE,
  outcome_positive BOOLEAN,
  outcome_notes TEXT,
  measured_at TIMESTAMP
);

-- Recommendation feedback
CREATE TABLE {div}_recommendation_feedback (
  id SERIAL PRIMARY KEY,
  recommendation_id INT REFERENCES {div}_ai_recommendations(id),
  feedback_type VARCHAR(20),             -- 'helpful', 'not_helpful', 'inaccurate', 'already_known'
  feedback_notes TEXT,
  given_by INT,
  given_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Model performance tracking
CREATE TABLE {div}_model_performance (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100),               -- 'churn_prediction', 'demand_forecast', etc.
  model_version INT,
  metric_name VARCHAR(50),               -- 'accuracy', 'precision', 'recall', 'mae', 'rmse'
  metric_value DECIMAL(8,4),
  evaluation_period_start DATE,
  evaluation_period_end DATE,
  sample_count INT,
  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.6 P&L Intelligence Tables ⭐ PRIORITY 1

```sql
-- P&L predictions and forecasts
CREATE TABLE {div}_pl_predictions (
  id SERIAL PRIMARY KEY,
  prediction_type VARCHAR(50),           -- 'revenue', 'cogs', 'gross_profit', 'ebitda', 'net_profit'
  target_year INT NOT NULL,
  target_month INT NOT NULL,
  predicted_value DECIMAL(18,2),
  confidence_low DECIMAL(18,2),
  confidence_high DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  error_pct DECIMAL(8,4),
  model_version INT,
  features_used JSONB,                   -- Which features drove this prediction
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- P&L anomalies detection
CREATE TABLE {div}_pl_anomalies (
  id SERIAL PRIMARY KEY,
  anomaly_type VARCHAR(50),              -- 'cost_spike', 'margin_erosion', 'revenue_drop', 'expense_outlier'
  pl_line_item VARCHAR(100),             -- 'Material Cost', 'Labor', 'Overhead', etc.
  year INT NOT NULL,
  month INT NOT NULL,
  expected_value DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  deviation_pct DECIMAL(8,4),
  z_score DECIMAL(8,4),
  severity VARCHAR(20),                  -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  root_cause_hypothesis TEXT,
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged BOOLEAN DEFAULT FALSE,
  acknowledged_by INT,
  resolution_notes TEXT
);

-- Margin intelligence (learned patterns)
CREATE TABLE {div}_margin_intelligence (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50),               -- 'product_group', 'customer', 'salesrep', 'country'
  entity_name VARCHAR(255),
  margin_trend VARCHAR(20),              -- 'improving', 'stable', 'eroding', 'volatile'
  avg_margin_pct DECIMAL(8,4),
  margin_volatility DECIMAL(8,4),
  primary_cost_driver VARCHAR(100),      -- 'material', 'labor', 'overhead', 'pricing'
  erosion_risk_score DECIMAL(5,4),       -- 0-1 probability of margin decline
  last_analyzed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  analysis_period_months INT DEFAULT 12
);

-- Cost optimization recommendations
CREATE TABLE {div}_cost_optimization_recommendations (
  id SERIAL PRIMARY KEY,
  recommendation_type VARCHAR(50),       -- 'material_substitution', 'process_improvement', 'pricing_adjustment', 'product_mix'
  target_area VARCHAR(100),              -- Which cost line item or product
  current_cost DECIMAL(18,2),
  potential_savings DECIMAL(18,2),
  savings_pct DECIMAL(8,4),
  implementation_effort VARCHAR(20),     -- 'LOW', 'MEDIUM', 'HIGH'
  confidence DECIMAL(5,4),
  recommendation_text TEXT NOT NULL,
  supporting_data JSONB,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  implemented BOOLEAN DEFAULT FALSE,
  implemented_at TIMESTAMP,
  actual_savings DECIMAL(18,2)
);

-- Product mix optimization
CREATE TABLE {div}_product_mix_optimization (
  id SERIAL PRIMARY KEY,
  scenario_name VARCHAR(100),
  current_mix JSONB,                     -- {product_group: percentage}
  optimized_mix JSONB,                   -- {product_group: percentage}
  current_margin_pct DECIMAL(8,4),
  optimized_margin_pct DECIMAL(8,4),
  margin_improvement_pct DECIMAL(8,4),
  constraints_applied JSONB,             -- e.g., min/max per product
  optimization_method VARCHAR(50),       -- 'linear_programming', 'gradient_based'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.7 Supply Chain Intelligence Tables ⭐ PRIORITY 2

```sql
-- Inventory intelligence
CREATE TABLE {div}_inventory_intelligence (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  current_inventory_level DECIMAL(18,2),
  optimal_inventory_level DECIMAL(18,2),
  reorder_point DECIMAL(18,2),
  safety_stock_level DECIMAL(18,2),
  days_of_supply INT,
  stockout_risk_score DECIMAL(5,4),      -- 0-1 probability
  overstock_risk_score DECIMAL(5,4),
  holding_cost_monthly DECIMAL(14,2),
  last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Production optimization
CREATE TABLE {div}_production_optimization (
  id SERIAL PRIMARY KEY,
  product_group VARCHAR(255) NOT NULL,
  forecast_period_start DATE,
  forecast_period_end DATE,
  predicted_demand DECIMAL(18,2),
  recommended_production DECIMAL(18,2),
  current_capacity_utilization DECIMAL(8,4),
  optimal_batch_size DECIMAL(18,2),
  lead_time_days INT,
  confidence DECIMAL(5,4),
  model_version INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Supplier intelligence (if supplier data becomes available)
CREATE TABLE {div}_supplier_intelligence (
  id SERIAL PRIMARY KEY,
  supplier_name VARCHAR(255),
  material_category VARCHAR(100),
  avg_lead_time_days DECIMAL(8,2),
  lead_time_volatility DECIMAL(8,2),
  quality_score DECIMAL(5,4),
  price_trend VARCHAR(20),               -- 'increasing', 'stable', 'decreasing'
  reliability_score DECIMAL(5,4),
  last_analyzed TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Raw material demand forecast
CREATE TABLE {div}_raw_material_forecast (
  id SERIAL PRIMARY KEY,
  material_category VARCHAR(100),
  forecast_year INT,
  forecast_month INT,
  predicted_demand DECIMAL(18,2),
  confidence_low DECIMAL(18,2),
  confidence_high DECIMAL(18,2),
  actual_demand DECIMAL(18,2),
  price_assumption DECIMAL(12,4),
  model_version INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 9.8 Financial Health Intelligence Tables ⭐ PRIORITY 2

```sql
-- Cash flow predictions
CREATE TABLE {div}_cash_flow_predictions (
  id SERIAL PRIMARY KEY,
  prediction_type VARCHAR(50),           -- 'inflow', 'outflow', 'net'
  target_year INT NOT NULL,
  target_month INT NOT NULL,
  predicted_value DECIMAL(18,2),
  confidence_low DECIMAL(18,2),
  confidence_high DECIMAL(18,2),
  actual_value DECIMAL(18,2),
  primary_drivers JSONB,                 -- What's driving the prediction
  model_version INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer credit risk scoring
CREATE TABLE {div}_credit_risk_scores (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  risk_score DECIMAL(5,4),               -- 0-1, higher = riskier
  risk_category VARCHAR(20),             -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
  payment_history_score DECIMAL(5,4),
  volume_trend_score DECIMAL(5,4),
  days_sales_outstanding DECIMAL(8,2),
  credit_limit_utilization DECIMAL(8,4),
  overdue_amount DECIMAL(18,2),
  recommended_credit_limit DECIMAL(18,2),
  recommended_payment_terms VARCHAR(50),
  last_assessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  model_version INT
);

-- Entity-level true profitability
CREATE TABLE {div}_profitability_intelligence (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(50),               -- 'customer', 'product_group', 'salesrep', 'country'
  entity_name VARCHAR(255),
  gross_revenue DECIMAL(18,2),
  direct_costs DECIMAL(18,2),
  allocated_overhead DECIMAL(18,2),
  true_profit DECIMAL(18,2),
  true_margin_pct DECIMAL(8,4),
  cost_to_serve DECIMAL(18,2),
  profitability_rank INT,
  profitability_tier VARCHAR(20),        -- 'A', 'B', 'C', 'D' or 'STAR', 'QUESTION', 'COW', 'DOG'
  period_year INT,
  period_month INT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Working capital optimization
CREATE TABLE {div}_working_capital_intelligence (
  id SERIAL PRIMARY KEY,
  metric_type VARCHAR(50),               -- 'dso', 'dio', 'dpo', 'ccc'
  current_value DECIMAL(8,2),
  optimal_value DECIMAL(8,2),
  industry_benchmark DECIMAL(8,2),
  improvement_potential_pct DECIMAL(8,4),
  cash_impact DECIMAL(18,2),             -- Cash released if optimized
  recommendations JSONB,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 10. Learning Services Architecture

### 10.1 Data Capture Points

```javascript
// Automatic data capture on every dashboard view
const capturePoints = {
  // Triggered when user loads KPI dashboard
  'kpi_view': {
    trigger: 'DivisionalDashboardLanding mount',
    captures: ['division', 'selected_periods', 'user_id', 'timestamp']
  },
  
  // Triggered when user views specific sales rep
  'salesrep_focus': {
    trigger: 'SalesBySaleRepTable tab change',
    captures: ['salesrep_name', 'time_spent', 'tabs_viewed', 'exports_done']
  },
  
  // Triggered when user examines customer details
  'customer_focus': {
    trigger: 'CustomerKeyFacts load',
    captures: ['customer_list', 'focus_duration', 'scroll_depth']
  },
  
  // Triggered when user exports data
  'export_action': {
    trigger: 'Any export button click',
    captures: ['export_type', 'data_scope', 'period_range']
  },
  
  // Triggered when user acknowledges an insight
  'insight_acknowledged': {
    trigger: 'Recommendation click/dismiss',
    captures: ['recommendation_id', 'action_taken', 'user_feedback']
  }
};
```

### 10.2 ML Model Specifications

```javascript
const models = {
  churnPrediction: {
    type: 'Binary Classification',
    algorithm: 'Gradient Boosting or Random Forest',
    features: [
      'months_since_last_order',
      'order_frequency_trend',
      'volume_trend_3m',
      'volume_trend_6m',
      'volume_vs_peak',
      'product_diversity',
      'payment_timeliness'
    ],
    target: 'churned_within_90_days',
    retraining: 'Monthly',
    minSamples: 100
  },
  
  demandForecast: {
    type: 'Time Series Regression',
    algorithm: 'ARIMA + XGBoost hybrid',
    features: [
      'historical_volume_12m',
      'seasonality_factors',
      'trend_component',
      'yoy_growth_pattern'
    ],
    target: 'next_month_volume',
    retraining: 'Monthly',
    minSamples: 24  // 2 years of data
  },
  
  customerSegmentation: {
    type: 'Clustering',
    algorithm: 'K-Means with silhouette optimization',
    features: [
      'total_lifetime_volume',
      'avg_monthly_volume',
      'volume_volatility',
      'product_diversity_score',
      'tenure_months',
      'growth_trend'
    ],
    k_range: [3, 7],
    retraining: 'Quarterly'
  },
  
  repClustering: {
    type: 'Clustering',
    algorithm: 'K-Means with PCA',
    features: [
      'avg_monthly_sales',
      'customer_count',
      'product_mix_score',
      'new_customer_rate',
      'retention_rate',
      'avg_deal_size',
      'budget_achievement_avg'
    ],
    k_range: [3, 5],
    retraining: 'Quarterly'
  },
  
  thresholdLearning: {
    type: 'Distribution Analysis',
    algorithm: 'Percentile-based optimization',
    method: `
      1. Collect all historical variances
      2. Calculate percentiles (5th, 10th, 25th, 75th, 90th, 95th)
      3. Set 'underperformance' at 10th percentile
      4. Set 'growth' at 90th percentile
      5. Adjust for seasonality
    `,
    retraining: 'Monthly'
  },

  // ⭐ PRIORITY 1: P&L Intelligence Models
  marginErosionPrediction: {
    type: 'Binary Classification + Regression',
    algorithm: 'XGBoost ensemble',
    features: [
      'material_cost_trend_3m',
      'labor_cost_trend_3m',
      'overhead_trend_3m',
      'volume_trend_3m',
      'asp_trend_3m',
      'product_mix_shift',
      'seasonality_factor',
      'yoy_margin_change'
    ],
    targets: {
      classification: 'margin_will_decline_next_month',
      regression: 'margin_change_pct'
    },
    retraining: 'Monthly',
    minSamples: 24
  },

  costPatternLearning: {
    type: 'Time Series Decomposition',
    algorithm: 'STL + Anomaly Detection',
    features: [
      'material_cost_history',
      'labor_cost_history',
      'overhead_cost_history',
      'production_volume_history'
    ],
    outputs: [
      'trend_component',
      'seasonal_component',
      'residual_component',
      'anomaly_flags'
    ],
    retraining: 'Monthly'
  },

  productMixOptimization: {
    type: 'Optimization',
    algorithm: 'Linear Programming with constraints',
    objective: 'Maximize weighted GP margin',
    constraints: [
      'min_volume_per_product',
      'max_volume_per_product',
      'production_capacity',
      'market_demand_limits'
    ],
    retraining: 'Quarterly'
  },

  // ⭐ PRIORITY 2: Supply Chain Models
  demandForecasting: {
    type: 'Time Series',
    algorithm: 'Prophet + XGBoost ensemble',
    features: [
      'historical_sales_24m',
      'seasonality_indices',
      'trend_component',
      'promotional_effects',
      'economic_indicators'
    ],
    target: 'next_3_months_demand',
    retraining: 'Monthly',
    minSamples: 24
  },

  inventoryOptimization: {
    type: 'Stochastic Optimization',
    algorithm: 'Safety stock calculation with demand uncertainty',
    features: [
      'demand_mean',
      'demand_std',
      'lead_time_mean',
      'lead_time_std',
      'service_level_target',
      'holding_cost',
      'stockout_cost'
    ],
    outputs: [
      'optimal_reorder_point',
      'optimal_order_quantity',
      'safety_stock_level'
    ],
    retraining: 'Monthly'
  },

  // ⭐ PRIORITY 2: Financial Health Models
  cashFlowPrediction: {
    type: 'Time Series Regression',
    algorithm: 'LSTM + XGBoost hybrid',
    features: [
      'historical_ar_aging',
      'historical_ap_aging',
      'sales_forecast',
      'payment_pattern_by_customer',
      'seasonal_cash_patterns'
    ],
    target: 'net_cash_flow_30_60_90_days',
    retraining: 'Weekly',
    minSamples: 52  // 1 year weekly
  },

  creditRiskScoring: {
    type: 'Binary Classification',
    algorithm: 'Logistic Regression + Random Forest ensemble',
    features: [
      'payment_history_score',
      'days_sales_outstanding',
      'order_frequency_trend',
      'volume_trend_6m',
      'overdue_percentage',
      'credit_limit_utilization',
      'tenure_months',
      'industry_risk_factor'
    ],
    target: 'payment_default_90_days',
    retraining: 'Monthly',
    minSamples: 50
  },

  profitabilityAnalysis: {
    type: 'Cost Allocation + Analysis',
    algorithm: 'Activity-Based Costing (ABC) model',
    method: `
      1. Identify cost pools (material, labor, overhead, selling, admin)
      2. Define cost drivers (volume, transactions, complexity)
      3. Allocate costs to entities (customer, product, rep)
      4. Calculate true margin after full cost allocation
      5. Rank and tier entities by profitability
    `,
    retraining: 'Monthly'
  }
};
```

### 10.3 Learning Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                      LEARNING PIPELINE                          │
└─────────────────────────────────────────────────────────────────┘

    ┌──────────────┐
    │  User Action │
    │  (View/Click)│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐     ┌──────────────┐
    │  Event Bus   │────►│  Capture     │
    │  (Frontend)  │     │  Service     │
    └──────────────┘     └──────┬───────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
    │ Behavior     │    │ Performance  │    │ Interaction  │
    │ History DB   │    │ History DB   │    │ History DB   │
    └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
           │                   │                   │
           └───────────────────┼───────────────────┘
                               │
                               ▼
                     ┌──────────────────┐
                     │ Training Trigger │
                     │ (Batch Job/CRON) │
                     └────────┬─────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Churn Model  │   │ Cluster Model│   │ Threshold    │
    │ Training     │   │ Training     │   │ Learning     │
    └──────┬───────┘   └──────┬───────┘   └──────┬───────┘
           │                  │                  │
           ▼                  ▼                  ▼
    ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
    │ Model        │   │ Model        │   │ Threshold    │
    │ Weights DB   │   │ Weights DB   │   │ Config DB    │
    └──────────────┘   └──────────────┘   └──────────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ Recommendation   │
                     │ Engine           │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ AI Analytics Tab │
                     │ (Frontend)       │
                     └──────────────────┘
```

---

## 11. Priority Matrix & Timeline

### 11.1 Implementation Phases

#### Phase 1: Foundation (Weeks 1-2)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create behavior history tables (all 4 areas) | 🔴 Critical | 2 days | None |
| Build data capture service | 🔴 Critical | 2 days | Tables |
| Implement capture hooks in frontend | 🔴 Critical | 2 days | Service |
| Basic AI Analytics tab shell | 🟡 High | 1 day | None |

#### Phase 2: Division & Product Learning (Weeks 3-4)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| DivisionLearningService | 🔴 Critical | 3 days | History tables |
| Seasonality detection algorithm | 🔴 Critical | 2 days | Service |
| Dynamic threshold learning | 🔴 Critical | 2 days | History data |
| ProductLearningService | 🟡 High | 3 days | History tables |
| Product lifecycle classification | 🟡 High | 2 days | Service |

#### Phase 3: Customer Intelligence (Weeks 5-6)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| CustomerLearningService | 🔴 Critical | 3 days | History tables |
| Churn prediction model | 🔴 Critical | 4 days | 3+ months history |
| Customer segmentation | 🟡 High | 2 days | Service |
| Anomaly detection | 🟡 High | 2 days | History data |
| CLV calculation | 🟢 Medium | 2 days | Service |

#### Phase 4: Sales Rep Intelligence (Weeks 7-8)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| SalesRepLearningService | 🔴 Critical | 3 days | History tables |
| Rep clustering algorithm | 🟡 High | 2 days | Service |
| Strengths/weaknesses learning | 🟡 High | 3 days | History data |
| Top performer comparison | 🟡 High | 2 days | Clustering |
| Coaching recommendations | 🟢 Medium | 3 days | All above |

#### Phase 5: Recommendations Engine (Weeks 9-10)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| RecommendationEngine service | 🔴 Critical | 4 days | All learning services |
| Priority ranking algorithm | 🔴 Critical | 2 days | Engine |
| Feedback loop implementation | 🔴 Critical | 2 days | Engine |
| History tracking | 🟡 High | 1 day | Engine |
| Outcome measurement | 🟡 High | 2 days | Feedback loop |

#### Phase 6: Frontend UI (Weeks 11-12)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| DivisionOverview components | 🟡 High | 3 days | Division service |
| SalesRepIntelligence components | 🟡 High | 3 days | Rep service |
| CustomerIntelligence components | 🟡 High | 3 days | Customer service |
| ProductIntelligence components | 🟡 High | 3 days | Product service |
| Recommendations dashboard | 🔴 Critical | 2 days | Engine |

#### ⭐ Phase 7: P&L Intelligence (Weeks 13-14)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create P&L intelligence tables | 🔴 Critical | 1 day | Database access |
| PLLearningService implementation | 🔴 Critical | 4 days | Tables + history data |
| Margin erosion prediction model | 🔴 Critical | 3 days | Service + 12+ months data |
| Cost pattern learning algorithm | 🟡 High | 2 days | Service |
| Product mix optimization | 🟡 High | 2 days | Margin predictions |
| P&L anomaly detection | 🟡 High | 2 days | Cost patterns |
| Frontend P&L dashboard | 🟡 High | 2 days | All P&L services |

#### ⭐ Phase 8: Supply Chain Intelligence (Weeks 15-16)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create supply chain tables | 🔴 Critical | 1 day | Database access |
| SupplyChainLearningService | 🔴 Critical | 4 days | Tables + production data |
| Demand forecasting model (Prophet) | 🔴 Critical | 3 days | 24+ months history |
| Lead time learning | 🟡 High | 2 days | Service |
| Inventory optimization | 🟡 High | 3 days | Demand forecast + lead times |
| Production planning recommendations | 🟡 High | 2 days | Inventory optimization |
| Frontend Supply Chain dashboard | 🟡 High | 2 days | All SC services |

#### ⭐ Phase 9: Financial Health Intelligence (Weeks 17-18)
| Task | Priority | Effort | Dependencies |
|------|----------|--------|--------------|
| Create financial health tables | 🔴 Critical | 1 day | Database access |
| FinancialHealthService | 🔴 Critical | 4 days | Tables + AR/AP data |
| Cash flow prediction model | 🔴 Critical | 3 days | Payment history |
| Credit risk scoring model | 🔴 Critical | 3 days | Customer payment patterns |
| True profitability calculation (ABC) | 🟡 High | 3 days | Cost allocation data |
| Working capital optimization | 🟡 High | 2 days | Cash flow + AR/AP |
| Frontend Financial Health dashboard | 🟡 High | 2 days | All FH services |

### 11.2 Effort Summary

| Phase | Weeks | Effort Days | Key Deliverable |
|-------|-------|-------------|-----------------|
| Foundation | 1-2 | 7 days | Data capture working |
| Division/Product | 3-4 | 12 days | Learned thresholds active |
| Customer | 5-6 | 13 days | Churn predictions live |
| Sales Rep | 7-8 | 13 days | Coaching recommendations |
| Recommendations | 9-10 | 11 days | Full recommendation engine |
| Frontend | 11-12 | 14 days | Complete AI Analytics tab |
| ⭐ P&L Intelligence | 13-14 | 16 days | Margin erosion predictions |
| ⭐ Supply Chain | 15-16 | 17 days | Demand forecasting + inventory |
| ⭐ Financial Health | 17-18 | 18 days | Cash flow + credit risk |
| **Total** | **18** | **121 days** | **Full AI Platform + Advanced Analytics** |

### 11.3 Implementation Priority Recommendations

Given the additional phases, consider these priority options:

| Option | Timeline | Scope | Best For |
|--------|----------|-------|----------|
| **Core Only** | 12 weeks | Phases 1-6 | MVP launch, early learning |
| **Core + P&L** | 14 weeks | Phases 1-7 | CFO/Finance focus |
| **Core + Churn + Margin** | 14 weeks | Phases 1-7 (focus Weeks 5-6 + 13-14) | Biggest ROI: retention + GP protection |
| **Core + Supply** | 16 weeks | Phases 1-8 | Operations/Production focus |
| **Full Platform** | 18 weeks | All phases | Complete AI transformation |

**Recommended Path:** Start with Core (Phases 1-6), then add P&L Intelligence (Phase 7) as it has highest business impact for margin management. Supply Chain and Financial Health can run in parallel afterward.

### 11.4 Implementation-Ready MVP Tracks (Margin + Churn)

This is the fastest way to deliver **real AI value** (learning + prediction + action + outcomes) using the data you already have.

**Execution sequence (practical build order):**
1) Create the track tables + basic backfill jobs (monthly features)
2) Implement the scoring endpoints (`GET churn-risks`, `GET margin-predictions`)
3) Implement recommendations + feedback (`POST feedback`)
4) Add a minimal UI panel for each track in AI Analytics
5) Run monthly retraining + weekly rescoring; track drift in `{div}_model_performance`

**Definition of Done (what makes it “real AI”):**
- Predictions are stored with timestamps + model version
- Outcomes are measurable (forecast error; churn verified/not)
- Recommendations have feedback and are used for retraining
- Confidence is shown and decays when the model is stale

---

#### Track A: Margin Protection (P&L Intelligence)

**Goal:** Predict margin erosion early, explain drivers, recommend actions with trade-offs.

**Inputs (available today):**
- Monthly P&L time series: `fp_pl_data`, `hc_pl_data`
- Monthly sales/volume/product mix: `{div}_data_excel`

**Tables (already defined in this doc):**
- `{div}_pl_predictions`
- `{div}_pl_anomalies`
- `{div}_margin_intelligence`
- `{div}_cost_optimization_recommendations`
- `{div}_product_mix_optimization`
- `{div}_model_performance`

**APIs (already defined in this doc):**
- `POST /api/pl-ai/division/:division/record-metrics`
- `GET  /api/pl-ai/division/:division/margin-predictions`
- `GET  /api/pl-ai/division/:division/anomalies`
- `GET  /api/pl-ai/division/:division/cost-recommendations`
- `GET  /api/pl-ai/division/:division/product-mix-optimization`

**Model (already defined in this doc):**
- `marginErosionPrediction` (classification + regression)
  - Outputs: `erosionRiskScore` and expected `margin_change_pct`

**Backtest + acceptance criteria:**
- Primary: recall on “margin decline events” (don’t miss erosions)
- Secondary: MAE on `margin_change_pct`
- Validate on rolling last 3 months

**First UI deliverable (minimum):**
- “Margin Protection” panel:
  - Next-month erosion risk (0–100)
  - Top 3 drivers (mix shift / cost trend / ASP trend)
  - Recommended actions (expected impact + confidence)
  - Buttons: acted / not relevant / wrong (+ optional notes)

---

#### Track B: Churn Prevention (Customer Intelligence)

**Goal:** Predict churn risk, explain why, recommend retention actions, learn what works.

**Inputs (available today):**
- Customer monthly sales/volume history: `{div}_data_excel`
- Derived features: recency, frequency, trend, product diversity

**Tables (already defined in this doc):**
- `{div}_customer_behavior_history`
- `{div}_customer_churn_predictions`
- `{div}_ai_recommendations`
- `{div}_recommendation_feedback`
- `{div}_model_performance`

**APIs (already defined in this doc):**
- `POST /api/customer-ai/division/:division/record-behavior`
- `GET  /api/customer-ai/division/:division/churn-risks`
- `GET  /api/recommendations/division/:division`
- `POST /api/recommendations/:id/feedback`

**Model (already defined in this doc):**
- `churnPrediction` (binary classification)
  - Target: `churned_within_90_days`

**Churn definition (must be explicit):**
- Start rule: churned if **no purchases for 90 days** (tune later)

**First UI deliverable (minimum):**
- “Churn Watchlist” card:
  - Top at-risk customers (risk %, confidence)
  - Top drivers (recency drop, trend down, diversity collapse)
  - Suggested action + owner (sales rep)
  - Buttons: action taken / not relevant / wrong (+ notes)

---

#### Shared “Real AI” Requirements (Both Tracks)

1) **Outcome measurement (non-negotiable):** store outcomes at 30/60/90 days; update `{div}_model_performance`.

2) **Explainability:** show top 3–5 drivers for any high-stakes insight; persist model version + training date in `ai_model_registry`.

3) **Confidence decay:** if model hasn’t trained in >30 days, reduce confidence shown to users.

4) **Feedback loop:** every recommendation must be actionable (accepted/rejected/ignored + reason).

---

## 12. Risk Assessment

### 12.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Insufficient historical data | Low | High | Start with 12+ months, use simpler models initially |
| Model accuracy too low | Medium | Medium | A/B test with rule-based, show confidence levels |
| Performance impact | Medium | Medium | Async training, caching, background jobs |
| Data quality issues | Medium | High | Validation layer, outlier handling |
| Complex state management | Medium | Medium | Use React Context + SWR for caching |

### 12.2 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User distrust of AI | Medium | High | Show explainability, confidence levels, allow feedback |
| Over-reliance on AI | Low | Medium | Keep manual override options, show uncertainty |
| Recommendations ignored | Medium | Medium | Track engagement, improve relevance over time |
| Training data bias | Medium | High | Regular bias audits, diverse training sets |

### 12.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Model drift over time | High | Medium | Scheduled retraining, drift detection |
| Database growth | Medium | Low | Retention policies, archiving strategy |
| Maintenance burden | Medium | Medium | Automated monitoring, alerting |

### 12.4 Governance Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Bias in sales rep evaluation | Medium | High | Regular fairness audits, diverse training data |
| Lack of decision traceability | Medium | High | Comprehensive audit logging |
| Unexplainable recommendations | Medium | High | Explainability framework (SHAP/LIME) |
| Compliance gaps | Low | High | Finance/HR audit trails, approval workflows |

---

## 13. Success Metrics

### 13.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Churn prediction accuracy | >75% | Precision/Recall on 90-day churn |
| Demand forecast MAPE | <15% | Mean Absolute Percentage Error |
| Recommendation engagement | >40% | % of recommendations acted upon |
| Threshold learning improvement | >20% | Reduction in false positive alerts |
| Model training time | <10 min | Per division, per model |
| ⭐ Margin erosion prediction | >70% | Recall on margin decline events |
| ⭐ Cash flow forecast accuracy | >80% | Within 10% of actual, 30-day horizon |
| ⭐ Credit risk classification | >75% | AUC-ROC on payment default |
| ⭐ Inventory optimization savings | >15% | Reduction in excess inventory costs |

### 13.2 Business Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to insight | -50% | Time to identify underperformers |
| Customer retention | +10% | Via early churn intervention |
| Budget achievement | +5% | Via better demand planning |
| Sales rep productivity | +15% | Via coaching recommendations |
| User satisfaction | >4/5 | Survey on AI usefulness |
| ⭐ Margin protection | +3-5% | Via early margin erosion alerts |
| ⭐ Stockout reduction | -25% | Via demand forecasting |
| ⭐ DSO improvement | -5 days | Via credit risk management |
| ⭐ True cost visibility | 100% | All products/customers costed |

### 13.3 Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| AI tab daily active users | >60% | Of total dashboard users |
| Recommendation feedback rate | >30% | Helpful/not helpful clicks |
| Feature usage breadth | >4/6 | Average features used per session |
| Return visits to AI tab | >3/week | Per user average |
| ⭐ Finance team adoption | >80% | P&L Intelligence usage |
| ⭐ Operations adoption | >70% | Supply Chain Intelligence usage |

---

## 14. Coverage Scorecard & Gap Analysis

### 14.1 Current Platform Coverage Assessment

Based on what a **complete divisional AI operating system** should deliver:

| Area | Coverage | Status | Key Gaps |
|------|----------|--------|----------|
| **P&L & Finance** | 85% | ✅ Strong | Real-time cost control |
| **Sales Rep Intelligence** | 90% | ✅ Excellent | Production capacity coupling |
| **Customer Analytics** | 85% | ✅ Strong | Constraint-adjusted profitability |
| **Product Group Learning** | 80% | ✅ Good | Cross-product cannibalization |
| **Supply Chain AI** | 70% | 🟡 Planned | Raw material volatility, supplier risk |
| **Manufacturing Optimization** | 45% | ⚠️ Gap | Machine-level constraints, OEE |
| **Closed-Loop Control** | 30% | ⚠️ Gap | Decision → Action → Feedback loop |
| **Governance & Trust** | 50% | 🟡 Partial | Formal explainability, audit trails |

**Overall Estimated Coverage:** ~72% of a complete Divisional AI System

### 14.2 What the Platform Is

> **Current:** AI-Powered Divisional Intelligence & Decision Support Platform
> 
> **Target:** Full Divisional Operating AI System with Closed-Loop Control

### 14.3 Critical Gaps: From Dashboard to True Intelligence

These are the missing layers that separate **dashboards** from **intelligence**. Without these, the system explains what happened but cannot think about why or what to do next.

---

#### ❌ Gap 1: Manufacturing Operations Intelligence (MAJOR GAP)

The platform is financially and commercially strong, but **manufacturing itself is mostly implicit**, not analyzed as a system.

**Missing Capabilities:**

| Capability | Why It Matters |
|------------|----------------|
| Machine-level efficiency (OEE) | Cannot optimize production without knowing true capacity |
| Downtime root-cause learning | Patterns in machine failures affect margin |
| Waste & yield intelligence | Scrap directly erodes GP margin |
| Batch-to-batch variability learning | Quality consistency affects customer satisfaction |
| Scrap → margin causality | Link production waste to financial impact |
| Changeover cost modeling | Small orders with frequent changeovers destroy margin |

**Key Question AI Cannot Answer Today:**
> "Why did margin drop if sales are up?"

**Future Service:** `ManufacturingIntelligenceService.js`
```javascript
// Priority: CRITICAL for margin understanding
analyzeOEE(),                    // Machine efficiency tracking
learnDowntimePatterns(),         // Root cause analysis
calculateScrapMarginImpact(),    // Waste → margin link
optimizeChangeoverSequence(),    // Reduce setup time losses
predictMaintenanceNeeds()        // Prevent unplanned downtime
```

**Required Integration:** ERP/MES systems for machine-level data

---

#### ❌ Gap 2: Cross-Domain Causality Engine (VERY IMPORTANT)

**Current State:** Finance, sales, customers are analyzed **in parallel**, not **causally linked**.

**The Problem:**
```
Sales ──────┐
             │──→ Separate insights, no causal chain
Finance ────┤
             │
Customers ──┘
```

**What's Missing - Causal Links:**

| Cause | → | Effect | AI Should Detect |
|-------|---|--------|------------------|
| Sales decisions | → | Production strain | Rush orders overload capacity |
| Production issues | → | Delivery delays | Late orders → customer churn |
| Small customers | → | Margin erosion | High cost-to-serve, low volume |
| Rush orders | → | Overtime + waste | Unplanned production kills margin |
| Low MOQs | → | Changeover losses | Setup time exceeds production time |
| Specific sales reps | → | Unprofitable mix | Some reps sell low-margin products |
| Certain materials | → | Yield problems | Some structures have higher scrap |

**The Difference:**
| Current | Target |
|---------|--------|
| "What happened" | "What caused it, and what to do next" |
| "Margin is down 3%" | "Margin is down 3% because Rep X sold 40% rush orders to small customers, causing 12% overtime and 8% scrap increase" |

**Future Service:** `CausalityEngine.js`
```javascript
// Priority: HIGH - connects all other services
buildCausalGraph(),              // Map cause → effect relationships
traceMarginErosionCauses(),      // Why did margin drop?
findRootCause(symptom),          // Drill from symptom to source
predictDownstreamImpact(action), // What happens if we do X?
generateCausalExplanation()      // Natural language causality
```

---

#### ❌ Gap 3: Prescriptive Intelligence (ACTION LAYER)

**Current State:** The system mostly:
- ✅ Explains (what happened)
- ✅ Scores (who/what is performing)
- ✅ Flags (alerts and warnings)

**What's Missing:** The system does NOT:
- ❌ Recommend actions with trade-offs
- ❌ Simulate decisions before execution
- ❌ Quantify impact of alternatives

**Missing Decision Examples:**

| Decision Scenario | AI Should Say |
|-------------------|---------------|
| Customer profitability | "If we drop Customer X, margin +2.1%, but revenue -$50K" |
| Sales rep focus | "If Rep A focuses on Customer X instead of Y, expected GP +$15K/month" |
| Production scheduling | "If production shifts SKU-123 to Line 2, throughput +15%, changeover -3 hrs/week" |
| Pricing | "If we increase price 5% on Product Group A, expect volume -8%, GP +$22K" |
| Customer acquisition | "Customer Z profile similar to churned customers, acquisition risk: HIGH" |

**Future Service:** `PrescriptiveEngine.js`
```javascript
// Priority: HIGH - turns insights into decisions
simulateDecision(action),        // What-if analysis
calculateTradeoffs(options),     // Compare alternatives
recommendWithConfidence(),       // Ranked suggestions
estimateImpact(timeHorizon),     // 30/60/90 day projections
explainRecommendation()          // Why this action?
```

---

#### ❌ Gap 4: Learning Feedback Loops (Self-Improving AI)

**What Works:** Customer merging has excellent feedback loops (rejections improve weights 👏)

**What's Missing:** This pattern is NOT applied across the whole division.

| Learning Area | Current State | Target State |
|---------------|---------------|--------------|
| Forecast error learning | ❌ None | Learn from forecast vs actual |
| Sales bias detection | ❌ None | Detect reps who consistently over/under-forecast |
| Planning accuracy scoring | ❌ None | Score and improve budget accuracy |
| Rep forecast penalties | ❌ None | Weight future forecasts by past accuracy |
| Model confidence decay | ❌ None | Reduce confidence when model hasn't been retrained |
| Recommendation outcomes | ❌ None | Track if recommendations worked |

**Key Principle:**
> Without feedback loops, AI does not learn - it just runs.

**Future Enhancement:** `FeedbackLearningService.js`
```javascript
// Priority: CRITICAL for continuous improvement
recordForecastVsActual(),        // Track prediction accuracy
calculateRepBiasScore(),         // Over/under-forecast patterns
decayModelConfidence(days),      // Confidence reduces without retraining
learnFromRecommendationOutcomes(), // Did suggestions work?
adjustWeightsFromFeedback()      // Auto-improve models
```

**Metrics to Track:**
```javascript
{
  forecastMAPE: { current: null, target: '<15%' },
  repBiasRange: { current: null, target: '±10%' },
  modelAgeDays: { threshold: 30, action: 'retrain' },
  recommendationSuccessRate: { current: null, target: '>60%' }
}
```

---

#### ❌ Gap 5: Risk & Early-Warning Intelligence

**Current State:** The system looks backward, not forward for risks.

**What Executives Actually Care About:**
> "What will break next?" - not "What broke last?"

**Missing Risk Indicators:**

| Risk Type | Description | Detection Method |
|-----------|-------------|------------------|
| **Margin cliff** | Sudden margin collapse risk | Trend acceleration + seasonality |
| **Customer dependency** | Revenue concentration | Top N customers % + churn risk |
| **Single-machine dependency** | Production bottleneck | One machine handles >40% of volume |
| **Sales concentration** | Rep dependency | Top 2 reps = 60% of sales |
| **Raw material volatility** | Cost shock exposure | Price volatility × usage volume |
| **Demand whiplash** | Boom/bust patterns | Order variability trending up |
| **Payment default cascade** | AR risk | Large customers with deteriorating DSO |

**Future Service:** `RiskIntelligenceService.js`
```javascript
// Priority: HIGH - executives need this
calculateConcentrationRisk(),    // Customer, rep, product, machine
predictMarginCliff(),            // Early warning on margin collapse
detectDemandWhiplash(),          // Volatility trending up
assessSupplyChainVulnerability(), // Single-source risks
generateRiskHeatmap(),           // Visual risk dashboard
alertOnThresholdBreach()         // Proactive notifications
```

**Risk Dashboard Output:**
```javascript
{
  overallRiskScore: 6.2, // out of 10
  criticalRisks: [
    { type: 'Customer Concentration', score: 8.1, 
      detail: 'Top 3 customers = 45% revenue, 2 have declining engagement' },
    { type: 'Machine Dependency', score: 7.5,
      detail: 'Line 3 handles 52% of high-margin products, maintenance overdue' }
  ],
  watchList: [
    { type: 'Margin Trend', score: 5.5,
      detail: 'GP margin declining 0.3% per month for 4 months' }
  ]
}
```

---

#### ❌ Gap 6: Unified Divisional "AI Brain" Layer

**Current State:** The architecture describes **modules**, not a **central intelligence layer**.

```
Current: Many Smart Tools (Parallel)
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Finance AI  │ │  Sales AI   │ │ Customer AI │
└─────────────┘ └─────────────┘ └─────────────┘
      ↓               ↓               ↓
   Insights        Insights        Insights
   (separate)      (separate)      (separate)
```

**Target: One Thinking System**
```
Target: Unified AI Brain
┌─────────────────────────────────────────────────┐
│           DIVISIONAL AI BRAIN                   │
│  ┌─────────────────────────────────────────┐   │
│  │         Canonical Division State        │   │
│  │  (unified view of all business facts)   │   │
│  └─────────────────────────────────────────┘   │
│           ↓           ↓           ↓            │
│  ┌─────────┐   ┌───────────┐   ┌─────────┐    │
│  │Reasoning│   │ Conflict  │   │ Memory  │    │
│  │ Engine  │   │Resolution │   │ (Years) │    │
│  └─────────┘   └───────────┘   └─────────┘    │
│           ↓           ↓           ↓            │
│     ┌─────────────────────────────────┐        │
│     │   Confidence-Scored Insights    │        │
│     │   with Natural Language Output  │        │
│     └─────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

**Missing Components:**

| Component | Purpose |
|-----------|---------|
| **Canonical Division State** | One source of truth for all business facts |
| **Confidence Scoring** | Every insight has a reliability score |
| **Conflict Resolution** | Sales wants X, Production wants Y - who wins? |
| **Long-term Memory** | Remember patterns from months/years ago |
| **Natural Language Layer** | Generate human-readable explanations |
| **Priority Arbiter** | Rank competing recommendations |

**Future Service:** `DivisionalBrain.js`
```javascript
// Priority: VISIONARY - the ultimate integration layer
buildDivisionState(),            // Unified fact base
resolveConflict(stakeholders),   // Balance competing objectives
scoreConfidence(insight),        // How reliable is this?
queryLongTermMemory(pattern),    // What happened last time?
generateNaturalLanguageSummary(), // Executive briefing
prioritizeRecommendations(),     // What matters most right now?
explainInContext(userRole)       // CFO vs Sales Manager view
```

**Example Output - Executive Briefing:**
```
📊 Division State: December 2025

Overall Health: 7.2/10 (↓ 0.3 from last month)

Top 3 Priorities (Confidence-Ranked):
1. [94%] Customer ABC showing churn signals - recommend retention call
2. [87%] Line 3 maintenance overdue - schedule before Jan 5 to avoid 
         unplanned downtime during peak season
3. [82%] Rep X's forecast accuracy declining - review pipeline quality

Conflicts Detected:
⚠️ Sales pushing for rush orders (+$50K) vs Production at 92% capacity
   Recommendation: Accept orders for products on Line 1/2 only
   Trade-off: Revenue +$35K, Overtime cost +$8K, Net benefit: +$27K
```

---

### 14.4 Gap Summary: Intelligence Maturity Matrix

| Gap | Severity | Current | Required For |
|-----|----------|---------|--------------|
| Manufacturing Intelligence | 🔴 Critical | 45% | Margin causality |
| Cross-Domain Causality | 🔴 Critical | 30% | Root cause analysis |
| Prescriptive Actions | 🟠 High | 35% | Decision support |
| Learning Feedback Loops | 🟠 High | 40% | Self-improvement |
| Risk & Early Warning | 🟠 High | 35% | Executive confidence |
| Unified AI Brain | 🟡 Vision | 20% | True intelligence |

**Bottom Line:**
> The current roadmap builds an excellent **AI-powered analytics platform**.
> 
> These 6 gaps, when addressed, transform it into a **thinking system** that can reason about the business, not just report on it.

---

## 15. Governance, Trust & Explainability

### 15.1 Explainability Framework

Every AI recommendation should include:

```javascript
{
  recommendation: "Increase focus on Customer XYZ",
  confidence: 0.85,
  explainability: {
    topFactors: [
      { factor: "Revenue growth 25% YoY", weight: 0.35 },
      { factor: "Low churn risk score", weight: 0.28 },
      { factor: "Expanding product adoption", weight: 0.22 }
    ],
    methodology: "Random Forest with SHAP values",
    dataRange: "Last 24 months",
    limitations: "Excludes external market factors"
  },
  auditTrail: {
    modelVersion: "customer_priority_v2.3",
    trainingDate: "2025-12-01",
    dataPoints: 15420
  }
}
```

### 15.2 Decision Traceability Requirements

| Requirement | Implementation |
|-------------|----------------|
| All recommendations logged | `{div}_ai_recommendations` table |
| User feedback and outcomes tracked | `{div}_recommendation_feedback` and `{div}_model_performance` tables |
| Decision audit trail (who decided what, why) | `ai_decision_audit` table |
| Model versions recorded | `ai_model_registry` table |
| Override reasons captured | Mandatory on rejection |
| Outcome measurement | 30/60/90 day follow-up |

### 15.3 Bias & Fairness Monitoring

For **Sales Rep Evaluation** (highest risk for bias):

| Check | Frequency | Action |
|-------|-----------|--------|
| Performance score distribution by tenure | Monthly | Flag if new reps consistently score lower |
| Recommendation distribution by region | Monthly | Ensure no geographic bias |
| Training data representation | Quarterly | Ensure diverse rep profiles in training |
| Outcome fairness | Quarterly | Verify recommendations lead to equal opportunity |

### 15.4 Audit Trail Tables

```sql
-- Decision audit trail
CREATE TABLE ai_decision_audit (
  id SERIAL PRIMARY KEY,
  decision_type VARCHAR(50),
  entity_type VARCHAR(30),
  entity_id VARCHAR(100),
  recommendation TEXT,
  confidence DECIMAL(3,2),
  user_action VARCHAR(20), -- 'accepted', 'rejected', 'modified', 'ignored'
  user_reason TEXT,
  outcome_measured BOOLEAN DEFAULT FALSE,
  outcome_date TIMESTAMP,
  outcome_result VARCHAR(50),
  model_version VARCHAR(20),
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Model version tracking
CREATE TABLE ai_model_registry (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(100),
  version VARCHAR(20),
  training_date TIMESTAMP,
  training_samples INTEGER,
  accuracy_score DECIMAL(4,3),
  is_active BOOLEAN DEFAULT TRUE,
  deployed_at TIMESTAMP,
  retired_at TIMESTAMP,
  config JSONB
);
```

---

## 16. Future Roadmap: Closed-Loop Control

### 16.1 Phase 10: Divisional Optimization Engine (Future)

To achieve true closed-loop AI control, a future phase would add:

| Component | Purpose |
|-----------|---------|
| **Global Objective Function** | Optimize across Sales, Manufacturing, Finance, Supply Chain |
| **Constraint Solver** | Respect capacity, budget, resource limits |
| **Conflict Resolution** | Balance competing priorities (margin vs volume) |
| **Scenario Simulator** | What-if analysis before decisions |
| **Auto-Execution** | Low-risk decisions execute automatically |

### 16.2 Integration Requirements

| System | Integration Purpose |
|--------|---------------------|
| ERP (SAP/Oracle) | Real-time cost, inventory, production data |
| MES | Machine-level constraints, OEE, changeover times |
| CRM | Customer interaction data, sales pipeline |
| HR System | Rep capacity, training status |
| BI Platform | Unified reporting and dashboards |

### 16.3 Maturity Roadmap

| Level | Description | Timeline | Coverage |
|-------|-------------|----------|----------|
| **Level 1** | Rule-Based Analytics | ✅ Current | 50% |
| **Level 2** | AI-Powered Insights | 🔄 This Roadmap | 75% |
| **Level 3** | Predictive Decision Support | After Phase 9 | 85% |
| **Level 4** | Prescriptive Recommendations | +6 months | 90% |
| **Level 5** | Autonomous Operations | +12 months | 95%+ |

---

## 17. Appendix: Quick Reference

### 17.1 Existing vs New AI Capabilities

| Capability | Current State | Target State |
|------------|---------------|--------------|
| Customer Matching | ✅ AI (learns from decisions) | ✅ Already excellent |
| Product Analysis | ❌ Fixed thresholds | ✅ Learned thresholds |
| Customer Analysis | ❌ Static z-scores | ✅ Churn prediction |
| Sales Rep Analysis | ❌ No learning | ✅ Clustering + coaching |
| Seasonality | ❌ Not detected | ✅ Auto-learned |
| Recommendations | ❌ None | ✅ Priority-ranked with feedback |
| Predictions | ❌ None | ✅ Multi-horizon forecasts |
| Market Intelligence | ❌ None | ✅ Cross-division patterns |
| ⭐ P&L Intelligence | ❌ None | ✅ Margin erosion prediction |
| ⭐ Cost Pattern Learning | ❌ None | ✅ Cost anomaly detection |
| ⭐ Product Mix Optimization | ❌ None | ✅ AI-driven mix recommendations |
| ⭐ Demand Forecasting | ❌ None | ✅ Prophet + XGBoost predictions |
| ⭐ Inventory Optimization | ❌ None | ✅ Safety stock learning |
| ⭐ Cash Flow Prediction | ❌ None | ✅ 30/60/90 day forecasts |
| ⭐ Credit Risk Scoring | ❌ None | ✅ ML-based risk assessment |
| ⭐ True Profitability | ❌ None | ✅ Activity-based costing |

### 17.2 Database Table Count Summary

| Area | New Tables per Division | Total (FP + HC) |
|------|------------------------|-----------------|
| Division Learning | 3 | 6 |
| Sales Rep Learning | 4 | 8 |
| Customer Learning | 5 | 10 |
| Product Learning | 5 | 10 |
| Recommendations | 3 | 6 |
| ⭐ P&L Intelligence | 5 | 10 |
| ⭐ Supply Chain Intelligence | 4 | 8 |
| ⭐ Financial Health Intelligence | 4 | 8 |
| **Total** | **33** | **66** |

### 17.3 Service Count Summary

| Service | Status | Priority | Key Methods |
|---------|--------|----------|-------------|
| CustomerMergingAI | ✅ Existing | - | scanWithTransitiveClustering, generateTopReasons |
| AILearningService | ✅ Existing | - | trainModel, getActiveWeights |
| DivisionLearningService | 🆕 New | P1 | learnSeasonality, predictNextPeriod |
| SalesRepLearningService | 🆕 New | P1 | clusterReps, generateCoachingRecommendations |
| CustomerLearningService | 🆕 New | P1 | predictChurnRisk, calculateLifetimeValue |
| ProductLearningService | 🆕 New | P1 | classifyLifecycle, learnThresholds |
| RecommendationEngine | 🆕 New | P1 | generateRecommendations, recordFeedback |
| MarketIntelligenceService | 🆕 New | P2 | aggregateCrossDivision |
| ⭐ PLLearningService | 🆕 New | **P1** | learnCostPatterns, predictMarginErosion, optimizeProductMix |
| ⭐ SupplyChainLearningService | 🆕 New | **P2** | optimizeInventoryLevels, predictProductionNeeds, learnLeadTimes |
| ⭐ FinancialHealthService | 🆕 New | **P2** | predictCashFlow, assessCreditRisk, calculateTrueProfitability |

### 17.4 ML Model Summary

| Model | Type | Algorithm | Retraining Frequency |
|-------|------|-----------|---------------------|
| Customer Churn | Classification | Random Forest | Monthly |
| Customer LTV | Regression | Gradient Boosting | Monthly |
| Demand Forecast | Time Series | ARIMA + XGBoost hybrid | Monthly |
| Threshold Learning | Distribution | Percentile-based | Monthly |
| Rep Clustering | Clustering | K-Means | Quarterly |
| ⭐ Margin Erosion | Classification + Regression | XGBoost Ensemble | Monthly |
| ⭐ Cost Pattern | Time Series | STL Decomposition | Monthly |
| ⭐ Product Mix | Optimization | Linear Programming | Quarterly |
| ⭐ Demand Forecasting | Time Series | Prophet + XGBoost | Monthly |
| ⭐ Inventory Optimization | Stochastic | Safety Stock Algorithm | Monthly |
| ⭐ Cash Flow | Time Series | LSTM + XGBoost | Weekly |
| ⭐ Credit Risk | Classification | Logistic + Random Forest | Monthly |
| ⭐ Profitability | Cost Allocation | Activity-Based Costing | Monthly |

---

## 18. Conclusion

This roadmap transforms the IPD 10-12 platform from a sophisticated **rule-based analytics tool** into a **true AI-powered business intelligence system**. The key transformation is adding **learning loops** at every level:

### Core Intelligence (Phases 1-6, Weeks 1-12)
1. **Division level** - Learn seasonality, predict trends
2. **Sales rep level** - Learn what makes top performers, coach others
3. **Customer level** - Predict churn, segment behavior, identify opportunities
4. **Product level** - Learn dynamic thresholds, forecast demand, optimize pricing
5. **Recommendations** - Synthesize all learning into prioritized, actionable insights

### ⭐ Advanced Intelligence (Phases 7-9, Weeks 13-18)
6. **P&L Intelligence** - Predict margin erosion before it happens, optimize product mix
7. **Supply Chain Intelligence** - Forecast demand, optimize inventory, plan production
8. **Financial Health Intelligence** - Predict cash flow, assess credit risk, calculate true profitability

### 🚀 Future: Closed-Loop Control (Phase 10+)
9. **Divisional Optimization Engine** - Global objective function, constraint solver, auto-execution
10. **Autonomous Operations** - Decision → Action → Feedback → Correction automated loop

The existing Customer Merging AI proves this architecture works. The same pattern (capture decisions → train model → improve weights → better predictions) can be applied across all business domains.

### Platform Maturity Journey

| Stage | Coverage | Status |
|-------|----------|--------|
| Rule-Based Analytics | 50% | ✅ Complete |
| AI-Powered Insights | 75% | 🔄 This Roadmap |
| Predictive Decision Support | 85% | 📋 Planned |
| Prescriptive Recommendations | 90% | 📋 Future |
| Autonomous Operations | 95%+ | 🎯 Vision |

### Value Proposition

| Intelligence Area | Business Impact |
|-------------------|-----------------|
| Division/Product Learning | 20-30% reduction in false alerts |
| Customer Intelligence | 15-25% improvement in retention |
| Sales Rep Intelligence | 10-20% productivity improvement through coaching |
| P&L Intelligence | 5-10% margin protection through early warning |
| Supply Chain | 15-25% reduction in stockouts and excess inventory |
| Financial Health | 10-20% improvement in cash collection |

**The result:** A dashboard that doesn't just show you what happened, but tells you **what will happen** and **what to do about it**.

---

*Document prepared for IPD 10-12 AI Analytics Platform development*  
*Version 2.0 - December 25, 2025*  
*Updated to include P&L, Supply Chain, Financial Health Intelligence, Coverage Analysis, and Governance Framework*  
*Source: Merged insights from Divisional_AI_Coverage_Analysis.md*
