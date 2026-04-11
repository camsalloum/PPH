# ProPackHub - Phase 11: Reports & Analytics

**Implementation Phase:** 11 (Weeks 55-58)  
**Priority:** High  
**Dependencies:** All previous phases

---

## TABLE OF CONTENTS

1. [Sales Reports](#1-sales-reports)
2. [Customer Analytics](#2-customer-analytics)
3. [Production Reports](#3-production-reports)
4. [Quality Analytics](#4-quality-analytics)
5. [Financial Reports](#5-financial-reports)
6. [Inventory Reports](#6-inventory-reports)
7. [Executive Dashboard](#7-executive-dashboard)
8. [Report Configuration](#8-report-configuration)

---

## 1. SALES REPORTS

### 1.1 Sales Analytics Views

```sql
-- Monthly Sales by Product Group
CREATE VIEW report_monthly_sales_by_product_group AS
SELECT 
  DATE_TRUNC('month', i.invoice_date) as month,
  pg.id as product_group_id,
  pg.group_code,
  pg.group_name,
  COUNT(DISTINCT i.id) as invoice_count,
  COUNT(DISTINCT i.customer_id) as customer_count,
  SUM(ii.quantity) as total_quantity,
  SUM(ii.net_amount) as total_revenue,
  AVG(ii.unit_price) as avg_unit_price
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
JOIN products p ON p.id = ii.product_id
JOIN product_groups pg ON pg.id = p.product_group_id
WHERE i.status NOT IN ('cancelled', 'draft')
  AND i.invoice_type = 'standard'
GROUP BY DATE_TRUNC('month', i.invoice_date), pg.id, pg.group_code, pg.group_name
ORDER BY month DESC, total_revenue DESC;

-- Sales by Sales Rep
CREATE VIEW report_sales_by_rep AS
SELECT 
  sr.id as sales_rep_id,
  sr.rep_code,
  sr.rep_name,
  DATE_TRUNC('month', i.invoice_date) as month,
  COUNT(DISTINCT i.id) as invoice_count,
  COUNT(DISTINCT i.customer_id) as customer_count,
  SUM(i.total_amount) as total_sales,
  SUM(i.paid_amount) as total_collected,
  SUM(i.balance_due) as outstanding
FROM invoices i
JOIN customers c ON c.id = i.customer_id
JOIN sales_reps sr ON sr.id = c.sales_rep_id
WHERE i.status NOT IN ('cancelled', 'draft')
  AND i.invoice_type = 'standard'
GROUP BY sr.id, sr.rep_code, sr.rep_name, DATE_TRUNC('month', i.invoice_date)
ORDER BY month DESC, total_sales DESC;

-- Sales by Country/Region
CREATE VIEW report_sales_by_region AS
SELECT 
  c.country,
  c.region,
  DATE_TRUNC('month', i.invoice_date) as month,
  COUNT(DISTINCT i.id) as invoice_count,
  COUNT(DISTINCT c.id) as customer_count,
  SUM(i.total_amount) as total_sales
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.status NOT IN ('cancelled', 'draft')
  AND i.invoice_type = 'standard'
GROUP BY c.country, c.region, DATE_TRUNC('month', i.invoice_date)
ORDER BY month DESC, total_sales DESC;

-- Sales Pipeline (Quotations)
CREATE VIEW report_sales_pipeline AS
SELECT 
  q.status,
  COUNT(*) as count,
  SUM(q.total_value) as total_value,
  AVG(q.total_value) as avg_value,
  AVG(EXTRACT(DAY FROM (q.valid_until - q.quotation_date))) as avg_validity_days
FROM quotations q
WHERE q.quotation_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY q.status;

-- Quotation Conversion Rate
CREATE VIEW report_quotation_conversion AS
SELECT 
  DATE_TRUNC('month', q.quotation_date) as month,
  COUNT(*) as total_quotations,
  COUNT(*) FILTER (WHERE q.status = 'accepted') as accepted,
  COUNT(*) FILTER (WHERE q.status = 'rejected') as rejected,
  COUNT(*) FILTER (WHERE q.status = 'expired') as expired,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE q.status = 'accepted') / NULLIF(COUNT(*), 0),
    2
  ) as conversion_rate_pct,
  SUM(q.total_value) FILTER (WHERE q.status = 'accepted') as accepted_value
FROM quotations q
GROUP BY DATE_TRUNC('month', q.quotation_date)
ORDER BY month DESC;

-- Top Products by Revenue
CREATE VIEW report_top_products AS
SELECT 
  p.id as product_id,
  p.product_code,
  p.product_name,
  pg.group_name as product_group,
  COUNT(DISTINCT ii.invoice_id) as times_sold,
  SUM(ii.quantity) as total_quantity,
  ii.unit as quantity_unit,
  SUM(ii.net_amount) as total_revenue,
  AVG(ii.unit_price) as avg_unit_price,
  RANK() OVER (ORDER BY SUM(ii.net_amount) DESC) as revenue_rank
FROM products p
JOIN invoice_items ii ON ii.product_id = p.id
JOIN invoices i ON i.id = ii.invoice_id AND i.status NOT IN ('cancelled', 'draft')
LEFT JOIN product_groups pg ON pg.id = p.product_group_id
WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '12 months'
GROUP BY p.id, p.product_code, p.product_name, pg.group_name, ii.unit
ORDER BY total_revenue DESC
LIMIT 50;

-- New vs Repeat Customer Revenue
CREATE VIEW report_new_vs_repeat_revenue AS
SELECT 
  DATE_TRUNC('month', i.invoice_date) as month,
  SUM(CASE 
    WHEN i.invoice_date <= c.first_order_date + INTERVAL '30 days' 
    THEN i.total_amount ELSE 0 
  END) as new_customer_revenue,
  SUM(CASE 
    WHEN i.invoice_date > c.first_order_date + INTERVAL '30 days' 
    THEN i.total_amount ELSE 0 
  END) as repeat_customer_revenue,
  COUNT(DISTINCT CASE 
    WHEN i.invoice_date <= c.first_order_date + INTERVAL '30 days' 
    THEN c.id 
  END) as new_customers,
  COUNT(DISTINCT CASE 
    WHEN i.invoice_date > c.first_order_date + INTERVAL '30 days' 
    THEN c.id 
  END) as repeat_customers
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.status NOT IN ('cancelled', 'draft')
  AND i.invoice_type = 'standard'
GROUP BY DATE_TRUNC('month', i.invoice_date)
ORDER BY month DESC;
```

---

## 2. CUSTOMER ANALYTICS

### 2.1 Customer Performance

```sql
-- Customer Profitability
CREATE VIEW report_customer_profitability AS
SELECT 
  c.id as customer_id,
  c.customer_code,
  c.company_name,
  c.classification,
  -- Revenue
  COALESCE(rev.total_revenue, 0) as total_revenue,
  COALESCE(rev.invoice_count, 0) as invoice_count,
  -- Costs (from production orders)
  COALESCE(costs.total_cost, 0) as total_cost,
  -- Gross Profit
  COALESCE(rev.total_revenue, 0) - COALESCE(costs.total_cost, 0) as gross_profit,
  -- Margin
  CASE 
    WHEN COALESCE(rev.total_revenue, 0) > 0 
    THEN ROUND(100.0 * (rev.total_revenue - COALESCE(costs.total_cost, 0)) / rev.total_revenue, 2)
    ELSE 0 
  END as gross_margin_pct,
  -- AR
  COALESCE(ar.outstanding, 0) as outstanding_ar,
  COALESCE(ar.avg_payment_days, 0) as avg_payment_days
FROM customers c
LEFT JOIN (
  SELECT customer_id, SUM(total_amount) as total_revenue, COUNT(*) as invoice_count
  FROM invoices WHERE status NOT IN ('cancelled', 'draft') AND invoice_type = 'standard'
  GROUP BY customer_id
) rev ON rev.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(actual_total_cost) as total_cost
  FROM production_orders WHERE status != 'cancelled'
  GROUP BY customer_id
) costs ON costs.customer_id = c.id
LEFT JOIN (
  SELECT 
    customer_id, 
    SUM(balance_due) as outstanding,
    AVG(CASE WHEN paid_amount >= total_amount THEN due_date - invoice_date END) as avg_payment_days
  FROM invoices WHERE status NOT IN ('cancelled', 'draft')
  GROUP BY customer_id
) ar ON ar.customer_id = c.id
WHERE c.is_active = true
ORDER BY gross_profit DESC;

-- Customer RFM Analysis (Recency, Frequency, Monetary)
CREATE VIEW report_customer_rfm AS
WITH customer_metrics AS (
  SELECT 
    c.id as customer_id,
    c.customer_code,
    c.company_name,
    -- Recency: days since last order
    EXTRACT(DAY FROM (CURRENT_DATE - MAX(i.invoice_date))) as recency_days,
    -- Frequency: number of orders in last 12 months
    COUNT(DISTINCT i.id) as frequency,
    -- Monetary: total spend in last 12 months
    COALESCE(SUM(i.total_amount), 0) as monetary
  FROM customers c
  LEFT JOIN invoices i ON i.customer_id = c.id 
    AND i.status NOT IN ('cancelled', 'draft')
    AND i.invoice_date >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY c.id, c.customer_code, c.company_name
),
rfm_scores AS (
  SELECT 
    *,
    NTILE(5) OVER (ORDER BY recency_days DESC) as r_score,  -- Lower recency = better
    NTILE(5) OVER (ORDER BY frequency) as f_score,
    NTILE(5) OVER (ORDER BY monetary) as m_score
  FROM customer_metrics
  WHERE frequency > 0
)
SELECT 
  *,
  r_score + f_score + m_score as rfm_total,
  CASE
    WHEN r_score >= 4 AND f_score >= 4 AND m_score >= 4 THEN 'Champion'
    WHEN r_score >= 3 AND f_score >= 3 AND m_score >= 3 THEN 'Loyal'
    WHEN r_score >= 4 AND f_score <= 2 THEN 'New Customer'
    WHEN r_score <= 2 AND f_score >= 3 THEN 'At Risk'
    WHEN r_score <= 2 AND f_score <= 2 AND m_score >= 3 THEN 'Cant Lose'
    WHEN r_score <= 2 AND f_score <= 2 THEN 'Lost'
    ELSE 'Potential'
  END as customer_segment
FROM rfm_scores
ORDER BY rfm_total DESC;

-- Customer Lifetime Value (CLV)
CREATE VIEW report_customer_clv AS
WITH customer_history AS (
  SELECT 
    c.id as customer_id,
    c.customer_code,
    c.company_name,
    MIN(i.invoice_date) as first_purchase,
    MAX(i.invoice_date) as last_purchase,
    COUNT(DISTINCT DATE_TRUNC('month', i.invoice_date)) as active_months,
    SUM(i.total_amount) as total_revenue,
    AVG(i.total_amount) as avg_order_value,
    COUNT(*) as order_count
  FROM customers c
  JOIN invoices i ON i.customer_id = c.id AND i.status NOT IN ('cancelled', 'draft')
  GROUP BY c.id, c.customer_code, c.company_name
)
SELECT 
  *,
  CASE 
    WHEN active_months > 0 
    THEN ROUND(total_revenue / active_months, 2) 
    ELSE 0 
  END as monthly_value,
  -- Simple CLV = Avg Monthly Value * 24 months (projected)
  CASE 
    WHEN active_months > 0 
    THEN ROUND((total_revenue / active_months) * 24, 2) 
    ELSE 0 
  END as projected_clv_24m
FROM customer_history
ORDER BY projected_clv_24m DESC;

-- Customer Churn Risk
CREATE VIEW report_churn_risk AS
SELECT 
  c.id as customer_id,
  c.customer_code,
  c.company_name,
  c.classification,
  MAX(i.invoice_date) as last_order_date,
  EXTRACT(DAY FROM (CURRENT_DATE - MAX(i.invoice_date))) as days_since_last_order,
  COUNT(*) FILTER (WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '12 months') as orders_last_12m,
  COUNT(*) FILTER (WHERE i.invoice_date >= CURRENT_DATE - INTERVAL '6 months') as orders_last_6m,
  AVG(i.total_amount) as avg_order_value,
  CASE
    WHEN MAX(i.invoice_date) IS NULL THEN 'Never Ordered'
    WHEN CURRENT_DATE - MAX(i.invoice_date) > 180 THEN 'High Risk'
    WHEN CURRENT_DATE - MAX(i.invoice_date) > 90 THEN 'Medium Risk'
    WHEN CURRENT_DATE - MAX(i.invoice_date) > 60 THEN 'Low Risk'
    ELSE 'Active'
  END as churn_risk_level
FROM customers c
LEFT JOIN invoices i ON i.customer_id = c.id AND i.status NOT IN ('cancelled', 'draft')
WHERE c.is_active = true
GROUP BY c.id, c.customer_code, c.company_name, c.classification
ORDER BY days_since_last_order DESC NULLS FIRST;
```

---

## 3. PRODUCTION REPORTS

### 3.1 Production Analytics

```sql
-- Machine Utilization
CREATE VIEW report_machine_utilization AS
SELECT 
  m.id as machine_id,
  m.machine_code,
  m.machine_name,
  m.process_type,
  DATE_TRUNC('week', pl.log_date) as week,
  -- Available hours (assuming 24/7 operation)
  24 * 7 as available_hours,
  -- Running hours
  COALESCE(SUM(EXTRACT(EPOCH FROM (pl.end_time - pl.start_time)) / 3600), 0) as running_hours,
  -- Downtime hours
  COALESCE(SUM(dl.downtime_minutes) / 60, 0) as downtime_hours,
  -- OEE Components
  ROUND(100.0 * SUM(EXTRACT(EPOCH FROM (pl.end_time - pl.start_time)) / 3600) / (24 * 7), 2) as availability_pct,
  -- Performance (actual vs theoretical output)
  ROUND(100.0 * SUM(pl.quantity_produced) / NULLIF(SUM(pl.quantity_expected), 0), 2) as performance_pct,
  -- Quality
  ROUND(100.0 * (SUM(pl.quantity_produced) - COALESCE(SUM(pl.quantity_rejected), 0)) / NULLIF(SUM(pl.quantity_produced), 0), 2) as quality_pct
FROM machines m
LEFT JOIN production_logs pl ON pl.machine_id = m.id
LEFT JOIN downtime_logs dl ON dl.machine_id = m.id AND dl.log_date = pl.log_date
GROUP BY m.id, m.machine_code, m.machine_name, m.process_type, DATE_TRUNC('week', pl.log_date)
ORDER BY week DESC;

-- Overall Equipment Effectiveness (OEE)
CREATE VIEW report_oee_summary AS
SELECT 
  m.id as machine_id,
  m.machine_code,
  m.machine_name,
  DATE_TRUNC('month', pl.log_date) as month,
  ROUND(AVG(
    (EXTRACT(EPOCH FROM (pl.end_time - pl.start_time)) / 3600) / 24 * 100
  ), 2) as availability,
  ROUND(AVG(
    100.0 * pl.quantity_produced / NULLIF(pl.quantity_expected, 0)
  ), 2) as performance,
  ROUND(AVG(
    100.0 * (pl.quantity_produced - COALESCE(pl.quantity_rejected, 0)) / NULLIF(pl.quantity_produced, 0)
  ), 2) as quality,
  -- OEE = Availability x Performance x Quality
  ROUND(
    AVG((EXTRACT(EPOCH FROM (pl.end_time - pl.start_time)) / 3600) / 24) *
    AVG(pl.quantity_produced / NULLIF(pl.quantity_expected, 0)) *
    AVG((pl.quantity_produced - COALESCE(pl.quantity_rejected, 0)) / NULLIF(pl.quantity_produced, 0)) * 100
  , 2) as oee
FROM machines m
JOIN production_logs pl ON pl.machine_id = m.id
GROUP BY m.id, m.machine_code, m.machine_name, DATE_TRUNC('month', pl.log_date)
ORDER BY month DESC, m.machine_code;

-- Production Order Status Summary
CREATE VIEW report_production_order_status AS
SELECT 
  DATE_TRUNC('month', po.created_at) as month,
  po.status,
  COUNT(*) as order_count,
  SUM(po.quantity_ordered) as total_quantity,
  SUM(po.estimated_total_cost) as estimated_cost,
  SUM(po.actual_total_cost) as actual_cost,
  -- On-time delivery
  COUNT(*) FILTER (
    WHERE po.status = 'delivered' 
    AND po.actual_delivery_date <= po.confirmed_delivery_date
  ) as on_time_count,
  -- Late delivery
  COUNT(*) FILTER (
    WHERE po.status = 'delivered' 
    AND po.actual_delivery_date > po.confirmed_delivery_date
  ) as late_count
FROM production_orders po
GROUP BY DATE_TRUNC('month', po.created_at), po.status
ORDER BY month DESC;

-- On-Time Delivery Rate
CREATE VIEW report_otd AS
SELECT 
  DATE_TRUNC('month', po.actual_delivery_date) as month,
  COUNT(*) as total_delivered,
  COUNT(*) FILTER (WHERE po.actual_delivery_date <= po.confirmed_delivery_date) as on_time,
  COUNT(*) FILTER (WHERE po.actual_delivery_date > po.confirmed_delivery_date) as late,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE po.actual_delivery_date <= po.confirmed_delivery_date) / COUNT(*)
  , 2) as otd_rate
FROM production_orders po
WHERE po.status = 'delivered'
  AND po.actual_delivery_date IS NOT NULL
GROUP BY DATE_TRUNC('month', po.actual_delivery_date)
ORDER BY month DESC;

-- Work Order Efficiency
CREATE VIEW report_work_order_efficiency AS
SELECT 
  DATE_TRUNC('week', wo.actual_start_date) as week,
  COUNT(*) as work_orders_completed,
  AVG(EXTRACT(DAY FROM (wo.actual_end_date - wo.actual_start_date))) as avg_lead_time_days,
  ROUND(AVG(100.0 * wo.actual_output_qty / wo.planned_output_qty), 2) as avg_yield_pct,
  ROUND(AVG(100.0 * wo.actual_waste / wo.planned_output_qty), 2) as avg_waste_pct,
  SUM(wo.actual_waste) as total_waste
FROM work_orders wo
WHERE wo.status = 'completed'
GROUP BY DATE_TRUNC('week', wo.actual_start_date)
ORDER BY week DESC;
```

---

## 4. QUALITY ANALYTICS

### 4.1 Quality Reports

```sql
-- Quality Rejection Analysis
CREATE VIEW report_quality_rejections AS
SELECT 
  DATE_TRUNC('month', qr.rejection_date) as month,
  qr.rejection_category,
  qr.defect_type,
  COUNT(*) as rejection_count,
  SUM(qr.quantity_rejected) as total_quantity,
  qr.quantity_unit,
  SUM(qr.cost_of_rejection) as total_cost,
  -- Top products affected
  MODE() WITHIN GROUP (ORDER BY qr.product_code) as most_affected_product
FROM quality_rejections qr
GROUP BY DATE_TRUNC('month', qr.rejection_date), qr.rejection_category, qr.defect_type, qr.quantity_unit
ORDER BY month DESC, total_cost DESC;

-- First Pass Yield by Product Group
CREATE VIEW report_first_pass_yield AS
SELECT 
  pg.group_name as product_group,
  DATE_TRUNC('month', wo.actual_end_date) as month,
  SUM(wo.planned_output_qty) as planned_qty,
  SUM(wo.actual_output_qty) as actual_qty,
  SUM(wo.actual_waste) as waste_qty,
  ROUND(100.0 * SUM(wo.actual_output_qty - wo.actual_waste) / NULLIF(SUM(wo.planned_output_qty), 0), 2) as fpy_pct
FROM work_orders wo
JOIN production_orders po ON po.id = wo.production_order_id
JOIN products p ON p.id = po.product_id
JOIN product_groups pg ON pg.id = p.product_group_id
WHERE wo.status = 'completed'
GROUP BY pg.group_name, DATE_TRUNC('month', wo.actual_end_date)
ORDER BY month DESC;

-- Complaint Analysis
CREATE VIEW report_complaint_analysis AS
SELECT 
  DATE_TRUNC('month', cc.created_at) as month,
  cc.complaint_type,
  cc.complaint_category,
  COUNT(*) as complaint_count,
  COUNT(*) FILTER (WHERE cc.status = 'resolved') as resolved_count,
  AVG(EXTRACT(DAY FROM (cc.resolved_at - cc.created_at))) as avg_resolution_days,
  COUNT(*) FILTER (WHERE cc.sla_breached) as sla_breached_count,
  COUNT(*) FILTER (WHERE cc.customer_satisfied) as satisfied_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE cc.customer_satisfied) / NULLIF(COUNT(*) FILTER (WHERE cc.customer_feedback IS NOT NULL), 0), 2) as csat_pct
FROM customer_complaints cc
GROUP BY DATE_TRUNC('month', cc.created_at), cc.complaint_type, cc.complaint_category
ORDER BY month DESC, complaint_count DESC;

-- Supplier Quality Performance
CREATE VIEW report_supplier_quality AS
SELECT 
  s.id as supplier_id,
  s.company_name as supplier_name,
  COUNT(DISTINCT gi.grn_id) as deliveries,
  SUM(gi.quantity_received) as total_received,
  SUM(gi.quantity_accepted) as total_accepted,
  SUM(gi.quantity_rejected) as total_rejected,
  ROUND(100.0 * SUM(gi.quantity_accepted) / NULLIF(SUM(gi.quantity_received), 0), 2) as acceptance_rate,
  COUNT(DISTINCT sn.id) as ncr_count,
  AVG(sp.quality_score) as avg_quality_score
FROM suppliers s
LEFT JOIN grn_items gi ON gi.supplier_id = s.id
LEFT JOIN supplier_ncrs sn ON sn.supplier_id = s.id
LEFT JOIN supplier_performance sp ON sp.supplier_id = s.id
GROUP BY s.id, s.company_name
ORDER BY acceptance_rate DESC;

-- QC Test Results Summary
CREATE VIEW report_qc_test_summary AS
SELECT 
  qc.test_type,
  qc.test_code,
  DATE_TRUNC('month', qc.test_date) as month,
  COUNT(*) as tests_performed,
  COUNT(*) FILTER (WHERE qc.result_status = 'pass') as pass_count,
  COUNT(*) FILTER (WHERE qc.result_status = 'fail') as fail_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE qc.result_status = 'pass') / COUNT(*), 2) as pass_rate,
  AVG(qc.result_value) as avg_result,
  STDDEV(qc.result_value) as result_stddev
FROM qc_test_results qc
GROUP BY qc.test_type, qc.test_code, DATE_TRUNC('month', qc.test_date)
ORDER BY month DESC;
```

---

## 5. FINANCIAL REPORTS

### 5.1 Financial Analytics

```sql
-- Revenue Trend
CREATE VIEW report_revenue_trend AS
SELECT 
  DATE_TRUNC('month', invoice_date) as month,
  SUM(subtotal) as gross_revenue,
  SUM(discount_amount) as discounts,
  SUM(subtotal - discount_amount) as net_revenue,
  SUM(tax_amount) as tax_collected,
  SUM(total_amount) as total_billed,
  SUM(paid_amount) as collected,
  SUM(balance_due) as outstanding,
  LAG(SUM(total_amount)) OVER (ORDER BY DATE_TRUNC('month', invoice_date)) as prev_month_revenue,
  ROUND(100.0 * (SUM(total_amount) - LAG(SUM(total_amount)) OVER (ORDER BY DATE_TRUNC('month', invoice_date))) 
    / NULLIF(LAG(SUM(total_amount)) OVER (ORDER BY DATE_TRUNC('month', invoice_date)), 0), 2) as mom_growth_pct
FROM invoices
WHERE status NOT IN ('cancelled', 'draft') AND invoice_type = 'standard'
GROUP BY DATE_TRUNC('month', invoice_date)
ORDER BY month DESC;

-- Gross Margin Analysis
CREATE VIEW report_gross_margin AS
SELECT 
  DATE_TRUNC('month', i.invoice_date) as month,
  pg.group_name as product_group,
  SUM(ii.net_amount) as revenue,
  SUM(po.actual_total_cost * (ii.quantity / po.quantity_ordered)) as cost,
  SUM(ii.net_amount) - SUM(po.actual_total_cost * (ii.quantity / po.quantity_ordered)) as gross_profit,
  ROUND(100.0 * (SUM(ii.net_amount) - SUM(po.actual_total_cost * (ii.quantity / po.quantity_ordered))) 
    / NULLIF(SUM(ii.net_amount), 0), 2) as gross_margin_pct
FROM invoices i
JOIN invoice_items ii ON ii.invoice_id = i.id
JOIN products p ON p.id = ii.product_id
JOIN product_groups pg ON pg.id = p.product_group_id
LEFT JOIN production_orders po ON po.product_id = p.id AND po.customer_id = i.customer_id
WHERE i.status NOT IN ('cancelled', 'draft')
GROUP BY DATE_TRUNC('month', i.invoice_date), pg.group_name
ORDER BY month DESC, gross_profit DESC;

-- DSO Trend (Days Sales Outstanding)
CREATE VIEW report_dso_trend AS
WITH monthly_data AS (
  SELECT 
    DATE_TRUNC('month', invoice_date) as month,
    SUM(total_amount) as monthly_sales
  FROM invoices
  WHERE status NOT IN ('cancelled', 'draft') AND invoice_type = 'standard'
  GROUP BY DATE_TRUNC('month', invoice_date)
),
ar_balances AS (
  SELECT 
    DATE_TRUNC('month', invoice_date) as month,
    SUM(balance_due) as ar_balance
  FROM invoices
  WHERE status NOT IN ('cancelled', 'draft', 'paid')
  GROUP BY DATE_TRUNC('month', invoice_date)
)
SELECT 
  m.month,
  m.monthly_sales,
  ar.ar_balance,
  ROUND((ar.ar_balance / NULLIF(m.monthly_sales, 0)) * 30, 1) as dso_days
FROM monthly_data m
LEFT JOIN ar_balances ar ON ar.month = m.month
ORDER BY m.month DESC;

-- Payment Collection Trend
CREATE VIEW report_collection_trend AS
SELECT 
  DATE_TRUNC('month', payment_date) as month,
  payment_method,
  COUNT(*) as payment_count,
  SUM(amount) as total_collected,
  AVG(amount) as avg_payment
FROM payments
WHERE status IN ('received', 'cleared')
GROUP BY DATE_TRUNC('month', payment_date), payment_method
ORDER BY month DESC;

-- Credit Exposure
CREATE VIEW report_credit_exposure AS
SELECT 
  c.id as customer_id,
  c.customer_code,
  c.company_name,
  cct.credit_limit,
  COALESCE(SUM(i.balance_due), 0) as current_exposure,
  cct.credit_limit - COALESCE(SUM(i.balance_due), 0) as available_credit,
  ROUND(100.0 * COALESCE(SUM(i.balance_due), 0) / NULLIF(cct.credit_limit, 0), 2) as utilization_pct,
  cct.credit_status
FROM customers c
LEFT JOIN customer_credit_terms cct ON cct.customer_id = c.id
LEFT JOIN invoices i ON i.customer_id = c.id AND i.status NOT IN ('cancelled', 'draft', 'paid')
GROUP BY c.id, c.customer_code, c.company_name, cct.credit_limit, cct.credit_status
HAVING cct.credit_limit IS NOT NULL
ORDER BY utilization_pct DESC;
```

---

## 6. INVENTORY REPORTS

### 6.1 Inventory Analytics

```sql
-- Raw Material Stock Status
CREATE VIEW report_rm_stock_status AS
SELECT 
  rm.id as material_id,
  rm.material_code,
  rm.material_name,
  rm.category,
  rmi.warehouse_id,
  w.warehouse_name,
  SUM(rmi.quantity_on_hand) as qty_on_hand,
  SUM(rmi.quantity_reserved) as qty_reserved,
  SUM(rmi.quantity_on_hand - rmi.quantity_reserved) as qty_available,
  rm.unit_of_measure,
  rm.reorder_level,
  rm.reorder_quantity,
  CASE 
    WHEN SUM(rmi.quantity_on_hand) <= rm.reorder_level THEN 'Reorder'
    WHEN SUM(rmi.quantity_on_hand) <= rm.reorder_level * 1.5 THEN 'Low'
    ELSE 'OK'
  END as stock_status
FROM raw_materials rm
LEFT JOIN raw_material_inventory rmi ON rmi.material_id = rm.id
LEFT JOIN warehouses w ON w.id = rmi.warehouse_id
GROUP BY rm.id, rm.material_code, rm.material_name, rm.category, 
         rmi.warehouse_id, w.warehouse_name, rm.unit_of_measure, rm.reorder_level, rm.reorder_quantity
ORDER BY stock_status, rm.material_code;

-- Finished Goods Stock
CREATE VIEW report_fg_stock AS
SELECT 
  p.id as product_id,
  p.product_code,
  p.product_name,
  pg.group_name as product_group,
  fgi.warehouse_id,
  w.warehouse_name,
  SUM(fgi.quantity_on_hand) as qty_on_hand,
  SUM(fgi.quantity_reserved) as qty_reserved,
  SUM(fgi.quantity_on_hand - fgi.quantity_reserved) as qty_available,
  fgi.unit
FROM products p
LEFT JOIN finished_goods_inventory fgi ON fgi.product_id = p.id
LEFT JOIN warehouses w ON w.id = fgi.warehouse_id
LEFT JOIN product_groups pg ON pg.id = p.product_group_id
GROUP BY p.id, p.product_code, p.product_name, pg.group_name, fgi.warehouse_id, w.warehouse_name, fgi.unit
ORDER BY p.product_code;

-- Material Consumption vs Budget
CREATE VIEW report_material_consumption AS
SELECT 
  DATE_TRUNC('month', mi.issue_date) as month,
  rm.material_code,
  rm.material_name,
  rm.category,
  SUM(mi.quantity_issued) as actual_consumption,
  SUM(mri.quantity_required) as planned_consumption,
  ROUND(100.0 * SUM(mi.quantity_issued) / NULLIF(SUM(mri.quantity_required), 0), 2) as consumption_efficiency,
  SUM(mi.quantity_issued * rmi.unit_cost) as actual_cost
FROM material_issues mi
JOIN raw_materials rm ON rm.id = mi.material_id
LEFT JOIN material_requisition_items mri ON mri.id = mi.requisition_item_id
LEFT JOIN raw_material_inventory rmi ON rmi.material_id = rm.id
GROUP BY DATE_TRUNC('month', mi.issue_date), rm.material_code, rm.material_name, rm.category
ORDER BY month DESC;

-- Slow Moving Inventory
CREATE VIEW report_slow_moving_inventory AS
SELECT 
  'raw_material' as inventory_type,
  rm.material_code as item_code,
  rm.material_name as item_name,
  SUM(rmi.quantity_on_hand) as qty_on_hand,
  rm.unit_of_measure as unit,
  SUM(rmi.quantity_on_hand * rmi.unit_cost) as inventory_value,
  MAX(mi.issue_date) as last_movement_date,
  CURRENT_DATE - MAX(mi.issue_date) as days_since_movement
FROM raw_materials rm
JOIN raw_material_inventory rmi ON rmi.material_id = rm.id
LEFT JOIN material_issues mi ON mi.material_id = rm.id
GROUP BY rm.material_code, rm.material_name, rm.unit_of_measure
HAVING CURRENT_DATE - MAX(mi.issue_date) > 90 OR MAX(mi.issue_date) IS NULL

UNION ALL

SELECT 
  'finished_goods' as inventory_type,
  p.product_code as item_code,
  p.product_name as item_name,
  SUM(fgi.quantity_on_hand) as qty_on_hand,
  fgi.unit,
  SUM(fgi.quantity_on_hand * fgi.unit_cost) as inventory_value,
  MAX(sm.movement_date) as last_movement_date,
  CURRENT_DATE - MAX(sm.movement_date) as days_since_movement
FROM products p
JOIN finished_goods_inventory fgi ON fgi.product_id = p.id
LEFT JOIN stock_movements sm ON sm.product_id = p.id AND sm.movement_type = 'dispatch'
GROUP BY p.product_code, p.product_name, fgi.unit
HAVING CURRENT_DATE - MAX(sm.movement_date) > 90 OR MAX(sm.movement_date) IS NULL
ORDER BY days_since_movement DESC NULLS FIRST;

-- Inventory Turnover
CREATE VIEW report_inventory_turnover AS
SELECT 
  DATE_TRUNC('month', CURRENT_DATE) as month,
  -- Raw Materials
  (
    SELECT SUM(quantity_on_hand * unit_cost) 
    FROM raw_material_inventory
  ) as rm_inventory_value,
  (
    SELECT SUM(quantity_issued * rmi.unit_cost)
    FROM material_issues mi
    JOIN raw_material_inventory rmi ON rmi.material_id = mi.material_id
    WHERE mi.issue_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months'
  ) / 12 as rm_monthly_consumption,
  -- Finished Goods
  (
    SELECT SUM(quantity_on_hand * unit_cost) 
    FROM finished_goods_inventory
  ) as fg_inventory_value,
  (
    SELECT SUM(ii.quantity * ii.unit_price)
    FROM invoice_items ii
    JOIN invoices i ON i.id = ii.invoice_id
    WHERE i.invoice_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '12 months'
  ) / 12 as fg_monthly_sales;
```

---

## 7. EXECUTIVE DASHBOARD

### 7.1 KPI Summary

```sql
-- Executive KPI Dashboard
CREATE VIEW report_executive_kpis AS
SELECT 
  -- Revenue
  (SELECT SUM(total_amount) FROM invoices 
   WHERE status NOT IN ('cancelled', 'draft') 
   AND invoice_date >= DATE_TRUNC('month', CURRENT_DATE)) as mtd_revenue,
  
  (SELECT SUM(total_amount) FROM invoices 
   WHERE status NOT IN ('cancelled', 'draft') 
   AND invoice_date >= DATE_TRUNC('year', CURRENT_DATE)) as ytd_revenue,
  
  -- Orders
  (SELECT COUNT(*) FROM production_orders 
   WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as mtd_orders,
  
  (SELECT COUNT(*) FROM production_orders 
   WHERE status = 'in_production') as orders_in_production,
  
  -- AR
  (SELECT SUM(balance_due) FROM invoices 
   WHERE status NOT IN ('cancelled', 'draft', 'paid')) as total_ar,
  
  (SELECT SUM(balance_due) FROM invoices 
   WHERE due_date < CURRENT_DATE 
   AND status NOT IN ('cancelled', 'draft', 'paid')) as overdue_ar,
  
  -- Quality
  (SELECT COUNT(*) FROM customer_complaints 
   WHERE status = 'submitted' 
   AND created_at >= DATE_TRUNC('month', CURRENT_DATE)) as open_complaints,
  
  -- Quotations
  (SELECT COUNT(*) FROM quotations 
   WHERE status = 'pending' 
   AND quotation_date >= DATE_TRUNC('month', CURRENT_DATE)) as pending_quotations,
  
  (SELECT SUM(total_value) FROM quotations 
   WHERE status = 'pending') as quotation_pipeline_value;

-- Dashboard Widgets Configuration
CREATE TABLE dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  widget_code VARCHAR(50) UNIQUE NOT NULL,
  widget_name VARCHAR(255) NOT NULL,
  
  -- Widget Type
  widget_type VARCHAR(50),
  -- kpi_card, line_chart, bar_chart, pie_chart, table, gauge
  
  -- Data Source
  data_source VARCHAR(255),  -- View or API endpoint
  data_query TEXT,
  
  -- Display
  default_size JSONB,  -- {width: 4, height: 2}
  chart_config JSONB,
  
  -- Refresh
  refresh_interval_seconds INT DEFAULT 300,
  
  -- Permissions
  required_role VARCHAR(50),
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Dashboard Layout
CREATE TABLE user_dashboard_layouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  layout_name VARCHAR(255) DEFAULT 'Default',
  
  -- Widget positions
  widgets JSONB NOT NULL,
  -- [
  --   {widget_id: "...", position: {x: 0, y: 0}, size: {w: 4, h: 2}},
  --   {widget_id: "...", position: {x: 4, y: 0}, size: {w: 4, h: 2}}
  -- ]
  
  is_default BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 8. REPORT CONFIGURATION

### 8.1 Report Builder

```sql
-- Saved Reports
CREATE TABLE saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_code VARCHAR(50) UNIQUE NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  
  -- Category
  category VARCHAR(100),
  -- sales, production, quality, financial, inventory, customer
  
  -- Type
  report_type VARCHAR(50),
  -- standard, custom, scheduled
  
  -- Definition
  base_view VARCHAR(255),  -- Database view to query
  columns JSONB,
  -- [{field: "customer_name", header: "Customer", width: 200, sortable: true}]
  
  filters JSONB,
  -- [{field: "invoice_date", operator: "between", label: "Date Range"}]
  
  default_filters JSONB,
  -- {invoice_date: {from: "2025-01-01", to: "2025-12-31"}}
  
  group_by TEXT[],
  order_by TEXT[],
  
  -- Chart (if applicable)
  chart_type VARCHAR(50),
  chart_config JSONB,
  
  -- Export Options
  export_formats TEXT[] DEFAULT ARRAY['xlsx', 'pdf', 'csv'],
  
  -- Permissions
  visibility VARCHAR(50) DEFAULT 'private',
  -- private, shared, public
  
  allowed_roles TEXT[],
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scheduled Reports
CREATE TABLE scheduled_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  report_id UUID REFERENCES saved_reports(id),
  
  -- Schedule
  schedule_type VARCHAR(50),
  -- daily, weekly, monthly, quarterly
  
  schedule_config JSONB,
  -- {day_of_week: 1, time: "08:00", timezone: "Asia/Dubai"}
  
  -- Parameters
  parameters JSONB,
  
  -- Recipients
  recipients JSONB,
  -- [{email: "...", name: "...", format: "xlsx"}]
  
  -- Output
  output_format VARCHAR(20) DEFAULT 'xlsx',
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMP,
  next_run TIMESTAMP,
  last_status VARCHAR(50),
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Report Execution Log
CREATE TABLE report_execution_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  report_id UUID REFERENCES saved_reports(id),
  scheduled_report_id UUID REFERENCES scheduled_reports(id),
  
  -- Execution
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  executed_by UUID,
  
  -- Parameters
  parameters_used JSONB,
  
  -- Result
  status VARCHAR(50),  -- success, failed, timeout
  execution_time_ms INT,
  row_count INT,
  
  -- Output
  output_url TEXT,
  output_format VARCHAR(20),
  
  error_message TEXT
);
```

---

## API SPECIFICATIONS

### Reports Routes

```
=== SALES REPORTS ===
GET    /reports/sales/monthly              Monthly sales summary
GET    /reports/sales/by-product-group     Sales by product group
GET    /reports/sales/by-rep               Sales by sales rep
GET    /reports/sales/by-region            Sales by country/region
GET    /reports/sales/pipeline             Quotation pipeline
GET    /reports/sales/conversion           Quotation conversion rate
GET    /reports/sales/top-products         Top products by revenue

=== CUSTOMER REPORTS ===
GET    /reports/customers/profitability    Customer profitability
GET    /reports/customers/rfm              RFM analysis
GET    /reports/customers/clv              Customer lifetime value
GET    /reports/customers/churn-risk       Churn risk analysis

=== PRODUCTION REPORTS ===
GET    /reports/production/utilization     Machine utilization
GET    /reports/production/oee             OEE summary
GET    /reports/production/orders          Order status summary
GET    /reports/production/otd             On-time delivery rate
GET    /reports/production/efficiency      Work order efficiency

=== QUALITY REPORTS ===
GET    /reports/quality/rejections         Rejection analysis
GET    /reports/quality/fpy                First pass yield
GET    /reports/quality/complaints         Complaint analysis
GET    /reports/quality/supplier           Supplier quality

=== FINANCIAL REPORTS ===
GET    /reports/financial/revenue          Revenue trend
GET    /reports/financial/margin           Gross margin analysis
GET    /reports/financial/dso              DSO trend
GET    /reports/financial/collections      Payment collection
GET    /reports/financial/ar-aging         AR aging report

=== INVENTORY REPORTS ===
GET    /reports/inventory/rm-stock         RM stock status
GET    /reports/inventory/fg-stock         FG stock status
GET    /reports/inventory/consumption      Material consumption
GET    /reports/inventory/slow-moving      Slow moving inventory

=== DASHBOARD ===
GET    /dashboard/kpis                     Executive KPIs
GET    /dashboard/widgets                  Available widgets
GET    /dashboard/layout                   User's dashboard layout
PUT    /dashboard/layout                   Save dashboard layout

=== REPORT BUILDER ===
GET    /reports                            List saved reports
POST   /reports                            Create custom report
GET    /reports/:id                        Get report definition
PUT    /reports/:id                        Update report
DELETE /reports/:id                        Delete report
POST   /reports/:id/execute                Execute report
GET    /reports/:id/export/:format         Export report

=== SCHEDULED REPORTS ===
GET    /reports/scheduled                  List scheduled reports
POST   /reports/scheduled                  Create schedule
PUT    /reports/scheduled/:id              Update schedule
DELETE /reports/scheduled/:id              Delete schedule
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Reports & Analytics module for ProPackHub:

CONTEXT:
- Need comprehensive business intelligence
- Real-time dashboards for executives
- Drill-down capabilities
- Export to Excel/PDF

REPORTS MODULE:
1. Sales Analytics
   - Revenue trends
   - Product group performance
   - Sales rep performance
   - Pipeline analysis
   - Conversion rates

2. Customer Analytics
   - Profitability analysis
   - RFM segmentation
   - CLV calculation
   - Churn prediction

3. Production Reports
   - Machine utilization (OEE)
   - Order status tracking
   - On-time delivery
   - Work order efficiency

4. Quality Reports
   - Rejection analysis
   - First pass yield
   - Complaint tracking
   - Supplier quality

5. Financial Reports
   - Revenue/margin
   - AR aging
   - DSO tracking
   - Collection trends

6. Executive Dashboard
   - KPI cards
   - Interactive charts
   - Customizable layout

DATABASE: Use views from 11-REPORTS-ANALYTICS.md
VISUALIZATION: ECharts or Chart.js
```

---

**Phase 11 completes the ProPackHub CRM Implementation documentation.**

---

## COMPLETE IMPLEMENTATION ROADMAP

| Phase | Module | Weeks | Priority |
|-------|--------|-------|----------|
| 01 | Foundation & Multi-tenant CRM | 1-6 | Critical |
| 02 | QC, Costing & Quotation | 7-14 | Critical |
| 03 | Industry Knowledge & Formulas | 15-18 | High |
| 04 | Completeness Checklist | - | - |
| 05 | Production & Inventory | 19-26 | Critical |
| 06 | Supplier & Procurement | 27-32 | High |
| 07 | Compliance & Certifications | 33-38 | Medium-High |
| 08 | Artwork Management | 39-44 | Medium |
| 09 | Financial Integration | 45-50 | High |
| 10 | Customer Portal | 51-54 | Medium |
| 11 | Reports & Analytics | 55-58 | High |

**Total Implementation: ~58 weeks (14 months)**

---

*End of ProPackHub CRM Implementation Documentation*
