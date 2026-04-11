# ProPackHub - Phase 9: Financial Integration

**Implementation Phase:** 9 (Weeks 47-50)  
**Priority:** High  
**Dependencies:** Quotations (02), Production Orders (02), Delivery (05)

---

## TABLE OF CONTENTS

1. [Invoicing System](#1-invoicing-system)
2. [Payment Tracking](#2-payment-tracking)
3. [Accounts Receivable](#3-accounts-receivable)
4. [Credit Management](#4-credit-management)
5. [Accounting Integration](#5-accounting-integration)
6. [Financial Reports](#6-financial-reports)
7. [API Specifications](#7-api-specifications)

---

## 1. INVOICING SYSTEM

### 1.1 Invoice Generation

```sql
-- Invoice Master
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,  -- INV-2025-0001
  
  -- Type
  invoice_type VARCHAR(50) DEFAULT 'standard',
  -- standard, proforma, credit_note, debit_note, advance
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_code VARCHAR(50),
  customer_name VARCHAR(255),
  billing_address JSONB,
  shipping_address JSONB,
  
  -- Reference Documents
  sales_order_id UUID,
  delivery_note_id UUID,
  production_order_id UUID REFERENCES production_orders(id),
  quotation_id UUID,
  
  -- Dates
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  delivery_date DATE,
  
  -- Currency
  currency_code VARCHAR(3) DEFAULT 'AED',
  exchange_rate DECIMAL(12,6) DEFAULT 1,
  
  -- Amounts (in invoice currency)
  subtotal DECIMAL(18,4),
  discount_amount DECIMAL(18,4) DEFAULT 0,
  discount_percentage DECIMAL(5,2),
  
  -- Tax
  tax_type VARCHAR(50),  -- VAT, GST, exempt
  tax_percentage DECIMAL(5,2) DEFAULT 5,
  tax_amount DECIMAL(18,4),
  
  -- Totals
  total_amount DECIMAL(18,4),
  total_in_base_currency DECIMAL(18,4),  -- For reporting
  
  -- Amounts (calculated)
  paid_amount DECIMAL(18,4) DEFAULT 0,
  balance_due DECIMAL(18,4) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, approved, sent, partially_paid, paid, overdue, cancelled, bad_debt
  
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  -- unpaid, partial, paid, written_off
  
  -- Payment Terms
  payment_terms VARCHAR(100),  -- "Net 30", "Net 60", "COD"
  payment_terms_days INT,
  
  -- Bank Details
  bank_details JSONB,
  
  -- Tax Registration
  customer_tax_number VARCHAR(100),
  company_tax_number VARCHAR(100),
  
  -- Notes
  internal_notes TEXT,
  customer_notes TEXT,  -- Appears on invoice
  terms_conditions TEXT,
  
  -- PDF
  pdf_url TEXT,
  
  -- Sent
  sent_date TIMESTAMP,
  sent_to_emails TEXT[],
  
  -- Approval
  approved_by UUID,
  approved_date TIMESTAMP,
  
  -- Cancellation
  cancelled_by UUID,
  cancelled_date TIMESTAMP,
  cancellation_reason TEXT,
  
  -- For Credit Notes
  original_invoice_id UUID REFERENCES invoices(id),
  credit_reason TEXT,
  
  -- Sync
  synced_to_accounting BOOLEAN DEFAULT false,
  accounting_reference VARCHAR(100),
  last_sync_date TIMESTAMP,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_invoice_customer ON invoices(customer_id);
CREATE INDEX idx_invoice_date ON invoices(invoice_date);
CREATE INDEX idx_invoice_status ON invoices(status);
CREATE INDEX idx_invoice_due ON invoices(due_date);

-- Invoice Line Items
CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  
  -- Product
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_name VARCHAR(255),
  description TEXT,
  
  -- Lot/Batch Reference
  lot_number VARCHAR(50),
  batch_number VARCHAR(50),
  
  -- Quantity
  quantity DECIMAL(18,4) NOT NULL,
  unit VARCHAR(20),  -- kg, pcs, rolls, meters
  
  -- Pricing
  unit_price DECIMAL(18,4),
  line_total DECIMAL(18,4),
  
  -- Discount
  discount_percentage DECIMAL(5,2) DEFAULT 0,
  discount_amount DECIMAL(18,4) DEFAULT 0,
  net_amount DECIMAL(18,4),
  
  -- Tax
  tax_code VARCHAR(20),
  tax_percentage DECIMAL(5,2),
  tax_amount DECIMAL(18,4),
  
  -- Reference
  delivery_note_item_id UUID,
  sales_order_item_id UUID,
  
  UNIQUE(invoice_id, line_number)
);

-- Invoice Terms & Conditions Templates
CREATE TABLE invoice_terms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(255),
  
  terms_text TEXT NOT NULL,
  
  -- Applicability
  is_default BOOLEAN DEFAULT false,
  applicable_to VARCHAR(100),  -- all, domestic, export
  
  is_active BOOLEAN DEFAULT true
);

INSERT INTO invoice_terms_templates (template_code, template_name, terms_text, is_default) VALUES
('STD-DOMESTIC', 'Standard Domestic Terms', 
'1. Payment is due within the specified terms from invoice date.
2. Late payments will incur interest at 1.5% per month.
3. All disputes must be raised within 7 days of invoice date.
4. Goods remain property of seller until full payment is received.', true),
('EXPORT', 'Export Terms',
'1. Payment as per agreed Letter of Credit / TT terms.
2. Title passes upon receipt of full payment.
3. Any disputes subject to arbitration in Dubai, UAE.');

-- Recurring Invoice Templates
CREATE TABLE recurring_invoice_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Frequency
  frequency VARCHAR(20),  -- weekly, monthly, quarterly, yearly
  frequency_interval INT DEFAULT 1,  -- Every N periods
  
  -- Schedule
  next_invoice_date DATE,
  end_date DATE,
  
  -- Template Details
  line_items JSONB,
  payment_terms_days INT,
  notes TEXT,
  
  -- Auto-send
  auto_send BOOLEAN DEFAULT false,
  send_to_emails TEXT[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. PAYMENT TRACKING

### 2.1 Payment Records

```sql
-- Payments Received
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_number VARCHAR(50) UNIQUE NOT NULL,  -- PAY-2025-0001
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Payment Details
  payment_date DATE DEFAULT CURRENT_DATE,
  payment_method VARCHAR(50),
  -- cash, cheque, bank_transfer, credit_card, LC, online
  
  -- Amount
  currency_code VARCHAR(3),
  amount DECIMAL(18,4) NOT NULL,
  exchange_rate DECIMAL(12,6) DEFAULT 1,
  amount_in_base_currency DECIMAL(18,4),
  
  -- Reference
  reference_number VARCHAR(100),  -- Cheque no, transaction ID
  bank_name VARCHAR(255),
  
  -- For Cheques
  cheque_number VARCHAR(50),
  cheque_date DATE,
  cheque_status VARCHAR(50),  -- received, deposited, cleared, bounced
  
  -- For Bank Transfer
  bank_reference VARCHAR(100),
  
  -- For LC
  lc_number VARCHAR(100),
  lc_expiry DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'received',
  -- received, deposited, cleared, bounced, returned, refunded
  
  -- Allocation
  allocated_amount DECIMAL(18,4) DEFAULT 0,
  unallocated_amount DECIMAL(18,4) GENERATED ALWAYS AS (amount - allocated_amount) STORED,
  
  -- Notes
  notes TEXT,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  -- Sync
  synced_to_accounting BOOLEAN DEFAULT false,
  accounting_reference VARCHAR(100),
  
  received_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_customer ON payments(customer_id);
CREATE INDEX idx_payment_date ON payments(payment_date);
CREATE INDEX idx_payment_status ON payments(status);

-- Payment Allocations (link payments to invoices)
CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  payment_id UUID REFERENCES payments(id),
  invoice_id UUID REFERENCES invoices(id),
  
  -- Allocation
  allocated_amount DECIMAL(18,4) NOT NULL,
  allocation_date DATE DEFAULT CURRENT_DATE,
  
  -- Write-off
  write_off_amount DECIMAL(18,4) DEFAULT 0,
  write_off_reason TEXT,
  
  allocated_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(payment_id, invoice_id)
);

-- Auto-update invoice paid_amount on allocation
CREATE OR REPLACE FUNCTION update_invoice_paid_amount()
RETURNS TRIGGER AS $$
BEGIN
  -- Update invoice
  UPDATE invoices SET
    paid_amount = (
      SELECT COALESCE(SUM(allocated_amount + write_off_amount), 0)
      FROM payment_allocations WHERE invoice_id = NEW.invoice_id
    ),
    payment_status = CASE
      WHEN paid_amount >= total_amount THEN 'paid'
      WHEN paid_amount > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    status = CASE
      WHEN paid_amount >= total_amount THEN 'paid'
      WHEN paid_amount > 0 AND status NOT IN ('cancelled', 'bad_debt') THEN 'partially_paid'
      ELSE status
    END
  WHERE id = NEW.invoice_id;
  
  -- Update payment allocated_amount
  UPDATE payments SET
    allocated_amount = (
      SELECT COALESCE(SUM(allocated_amount), 0)
      FROM payment_allocations WHERE payment_id = NEW.payment_id
    )
  WHERE id = NEW.payment_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_invoice_payment
AFTER INSERT OR UPDATE ON payment_allocations
FOR EACH ROW EXECUTE FUNCTION update_invoice_paid_amount();

-- Advance Payments
CREATE TABLE advance_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_number VARCHAR(50) UNIQUE NOT NULL,  -- ADV-2025-0001
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Reference
  quotation_id UUID,
  sales_order_id UUID,
  
  -- Amount
  currency_code VARCHAR(3),
  amount DECIMAL(18,4) NOT NULL,
  exchange_rate DECIMAL(12,6) DEFAULT 1,
  
  -- Receipt
  payment_date DATE,
  payment_method VARCHAR(50),
  reference_number VARCHAR(100),
  
  -- Status
  status VARCHAR(50) DEFAULT 'received',
  -- received, utilized, partially_utilized, refunded
  
  utilized_amount DECIMAL(18,4) DEFAULT 0,
  balance DECIMAL(18,4) GENERATED ALWAYS AS (amount - utilized_amount) STORED,
  
  -- Utilization
  utilized_against_invoices JSONB DEFAULT '[]',
  -- [{invoice_id: "...", invoice_number: "INV-...", amount: 1000}]
  
  notes TEXT,
  
  received_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. ACCOUNTS RECEIVABLE

### 3.1 AR Management

```sql
-- Customer Ledger (running balance view)
CREATE VIEW customer_ledger AS
SELECT 
  c.id as customer_id,
  c.customer_code,
  c.company_name,
  COALESCE(inv.total_invoiced, 0) as total_invoiced,
  COALESCE(cn.total_credit_notes, 0) as total_credit_notes,
  COALESCE(pay.total_payments, 0) as total_payments,
  COALESCE(inv.total_invoiced, 0) - COALESCE(cn.total_credit_notes, 0) - COALESCE(pay.total_payments, 0) as balance_due,
  adv.advance_balance
FROM customers c
LEFT JOIN (
  SELECT customer_id, SUM(total_amount) as total_invoiced
  FROM invoices WHERE invoice_type = 'standard' AND status NOT IN ('cancelled', 'draft')
  GROUP BY customer_id
) inv ON inv.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(total_amount) as total_credit_notes
  FROM invoices WHERE invoice_type = 'credit_note' AND status NOT IN ('cancelled', 'draft')
  GROUP BY customer_id
) cn ON cn.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) as total_payments
  FROM payments WHERE status IN ('received', 'deposited', 'cleared')
  GROUP BY customer_id
) pay ON pay.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(balance) as advance_balance
  FROM advance_payments WHERE status IN ('received', 'partially_utilized')
  GROUP BY customer_id
) adv ON adv.customer_id = c.id;

-- AR Aging View
CREATE VIEW ar_aging AS
SELECT 
  i.customer_id,
  c.customer_code,
  c.company_name,
  i.invoice_number,
  i.invoice_date,
  i.due_date,
  i.total_amount,
  i.balance_due,
  CASE
    WHEN CURRENT_DATE <= i.due_date THEN 'current'
    WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
    WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
    WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
    ELSE '90+'
  END as aging_bucket,
  CURRENT_DATE - i.due_date as days_overdue
FROM invoices i
JOIN customers c ON c.id = i.customer_id
WHERE i.status NOT IN ('cancelled', 'draft', 'paid')
  AND i.balance_due > 0;

-- AR Aging Summary View
CREATE VIEW ar_aging_summary AS
SELECT 
  customer_id,
  customer_code,
  company_name,
  SUM(CASE WHEN aging_bucket = 'current' THEN balance_due ELSE 0 END) as current_amount,
  SUM(CASE WHEN aging_bucket = '1-30' THEN balance_due ELSE 0 END) as days_1_30,
  SUM(CASE WHEN aging_bucket = '31-60' THEN balance_due ELSE 0 END) as days_31_60,
  SUM(CASE WHEN aging_bucket = '61-90' THEN balance_due ELSE 0 END) as days_61_90,
  SUM(CASE WHEN aging_bucket = '90+' THEN balance_due ELSE 0 END) as days_90_plus,
  SUM(balance_due) as total_outstanding
FROM ar_aging
GROUP BY customer_id, customer_code, company_name;

-- Collection Notes
CREATE TABLE collection_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  customer_id UUID REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  
  -- Contact
  contact_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  contact_method VARCHAR(50),  -- phone, email, visit, letter
  contact_person VARCHAR(255),
  
  -- Notes
  notes TEXT NOT NULL,
  
  -- Commitment
  payment_promised BOOLEAN DEFAULT false,
  promised_amount DECIMAL(18,4),
  promised_date DATE,
  
  -- Follow-up
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_notes TEXT,
  
  -- Outcome
  outcome VARCHAR(100),
  -- promise_to_pay, dispute, no_response, partial_payment, paid
  
  recorded_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Statement of Account
CREATE TABLE account_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number VARCHAR(50) UNIQUE NOT NULL,  -- SOA-2025-0001
  
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Period
  period_from DATE,
  period_to DATE,
  
  -- Balances
  opening_balance DECIMAL(18,4),
  total_invoices DECIMAL(18,4),
  total_credits DECIMAL(18,4),
  total_payments DECIMAL(18,4),
  closing_balance DECIMAL(18,4),
  
  -- Details
  transactions JSONB,
  -- [
  --   {date: "2025-01-05", type: "invoice", ref: "INV-001", debit: 5000, credit: 0, balance: 5000},
  --   {date: "2025-01-15", type: "payment", ref: "PAY-001", debit: 0, credit: 2000, balance: 3000}
  -- ]
  
  -- PDF
  pdf_url TEXT,
  
  -- Sent
  sent_date TIMESTAMP,
  sent_to_emails TEXT[],
  
  generated_by UUID,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. CREDIT MANAGEMENT

### 4.1 Credit Control

```sql
-- Customer Credit Terms
CREATE TABLE customer_credit_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) UNIQUE,
  
  -- Credit Limit
  credit_limit DECIMAL(18,4),
  credit_limit_currency VARCHAR(3) DEFAULT 'AED',
  
  -- Payment Terms
  payment_terms_code VARCHAR(50),  -- NET30, NET60, COD
  payment_terms_days INT,
  
  -- Credit Status
  credit_status VARCHAR(50) DEFAULT 'active',
  -- active, on_hold, suspended, cash_only
  
  -- Risk Rating
  risk_rating VARCHAR(20),  -- low, medium, high
  risk_score INT,  -- 0-100
  
  -- Approval
  credit_approved_by UUID,
  credit_approved_date DATE,
  next_review_date DATE,
  
  -- History
  last_payment_date DATE,
  avg_payment_days INT,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit Limit Checks View
CREATE VIEW customer_credit_status AS
SELECT 
  c.id as customer_id,
  c.customer_code,
  c.company_name,
  cct.credit_limit,
  cct.credit_status,
  cct.payment_terms_days,
  COALESCE(ar.total_outstanding, 0) as outstanding_balance,
  cct.credit_limit - COALESCE(ar.total_outstanding, 0) as available_credit,
  CASE
    WHEN cct.credit_limit IS NULL THEN 'unlimited'
    WHEN COALESCE(ar.total_outstanding, 0) >= cct.credit_limit THEN 'exceeded'
    WHEN COALESCE(ar.total_outstanding, 0) >= cct.credit_limit * 0.9 THEN 'near_limit'
    ELSE 'ok'
  END as credit_check_status
FROM customers c
LEFT JOIN customer_credit_terms cct ON cct.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(balance_due) as total_outstanding
  FROM invoices WHERE status NOT IN ('cancelled', 'draft', 'paid')
  GROUP BY customer_id
) ar ON ar.customer_id = c.id;

-- Credit Applications
CREATE TABLE credit_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_number VARCHAR(50) UNIQUE NOT NULL,  -- CA-2025-0001
  
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Request
  requested_limit DECIMAL(18,4),
  requested_terms_days INT,
  business_justification TEXT,
  
  -- Financial Info
  trade_references JSONB,
  bank_references JSONB,
  financial_statements_url TEXT,
  
  -- Assessment
  current_limit DECIMAL(18,4),
  current_outstanding DECIMAL(18,4),
  avg_monthly_purchases DECIMAL(18,4),
  
  -- Decision
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, under_review, approved, rejected, more_info_needed
  
  approved_limit DECIMAL(18,4),
  approved_terms_days INT,
  
  decision_by UUID,
  decision_date TIMESTAMP,
  decision_notes TEXT,
  
  submitted_by UUID,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Credit Hold Log
CREATE TABLE credit_hold_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  customer_id UUID REFERENCES customers(id),
  
  -- Action
  action VARCHAR(50),  -- placed_on_hold, removed_from_hold, limit_change
  reason TEXT,
  
  -- Previous/New Values
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  previous_limit DECIMAL(18,4),
  new_limit DECIMAL(18,4),
  
  -- Reference
  reference_type VARCHAR(50),  -- invoice, order
  reference_id UUID,
  
  performed_by UUID,
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. ACCOUNTING INTEGRATION

### 5.1 Chart of Accounts Mapping

```sql
-- Chart of Accounts Mapping
CREATE TABLE coa_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mapping_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- ProPackHub Entity
  entity_type VARCHAR(100) NOT NULL,
  -- sales_revenue, cost_of_goods, accounts_receivable, advance_received,
  -- vat_output, vat_input, discount_given, bad_debt_expense
  
  -- Accounting System
  accounting_system VARCHAR(100),  -- quickbooks, sage, tally, zoho, sap
  
  -- Account Mapping
  gl_account_code VARCHAR(50),
  gl_account_name VARCHAR(255),
  
  -- Dimensions (for advanced systems)
  cost_center VARCHAR(50),
  department VARCHAR(50),
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed common mappings
INSERT INTO coa_mapping (mapping_code, entity_type, gl_account_code, gl_account_name) VALUES
('AR-TRADE', 'accounts_receivable', '1200', 'Trade Receivables'),
('REV-SALES', 'sales_revenue', '4000', 'Sales Revenue'),
('REV-SALES-EXPORT', 'sales_revenue_export', '4010', 'Export Sales'),
('VAT-OUTPUT', 'vat_output', '2200', 'VAT Payable'),
('ADV-RECEIVED', 'advance_received', '2300', 'Customer Advances'),
('COGS', 'cost_of_goods', '5000', 'Cost of Goods Sold'),
('BAD-DEBT', 'bad_debt_expense', '6500', 'Bad Debt Expense');

-- Accounting Transactions (journal entries ready for export)
CREATE TABLE accounting_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number VARCHAR(50) UNIQUE NOT NULL,  -- JE-2025-0001
  
  -- Source
  source_type VARCHAR(50) NOT NULL,  -- invoice, payment, credit_note, adjustment
  source_id UUID NOT NULL,
  source_reference VARCHAR(100),
  
  -- Date
  transaction_date DATE NOT NULL,
  
  -- Description
  description TEXT,
  
  -- Lines
  lines JSONB NOT NULL,
  -- [
  --   {account_code: "1200", account_name: "AR", debit: 5250, credit: 0, description: "Invoice INV-001"},
  --   {account_code: "4000", account_name: "Sales", debit: 0, credit: 5000, description: "Sales revenue"},
  --   {account_code: "2200", account_name: "VAT", debit: 0, credit: 250, description: "VAT 5%"}
  -- ]
  
  -- Totals
  total_debit DECIMAL(18,4),
  total_credit DECIMAL(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, synced, failed, cancelled
  
  -- Sync
  synced_at TIMESTAMP,
  sync_reference VARCHAR(100),  -- Accounting system's transaction ID
  sync_error TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Auto-create accounting transaction on invoice approval
CREATE OR REPLACE FUNCTION create_invoice_accounting_entry()
RETURNS TRIGGER AS $$
DECLARE
  v_lines JSONB;
  v_transaction_number VARCHAR(50);
BEGIN
  IF NEW.status = 'approved' AND OLD.status != 'approved' THEN
    -- Generate transaction number
    v_transaction_number := 'JE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                           LPAD(nextval('je_seq')::TEXT, 6, '0');
    
    -- Build journal entry lines
    v_lines := json_build_array(
      json_build_object(
        'account_code', '1200',
        'account_name', 'Trade Receivables',
        'debit', NEW.total_amount,
        'credit', 0,
        'description', 'AR - ' || NEW.invoice_number
      ),
      json_build_object(
        'account_code', '4000',
        'account_name', 'Sales Revenue',
        'debit', 0,
        'credit', NEW.subtotal - NEW.discount_amount,
        'description', 'Sales - ' || NEW.invoice_number
      ),
      json_build_object(
        'account_code', '2200',
        'account_name', 'VAT Payable',
        'debit', 0,
        'credit', NEW.tax_amount,
        'description', 'VAT - ' || NEW.invoice_number
      )
    );
    
    INSERT INTO accounting_transactions (
      transaction_number, source_type, source_id, source_reference,
      transaction_date, description, lines, total_debit, total_credit
    ) VALUES (
      v_transaction_number, 'invoice', NEW.id, NEW.invoice_number,
      NEW.invoice_date, 'Invoice: ' || NEW.invoice_number || ' - ' || NEW.customer_name,
      v_lines, NEW.total_amount, NEW.total_amount
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Accounting Sync Log
CREATE TABLE accounting_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  sync_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  sync_type VARCHAR(50),  -- manual, scheduled, real_time
  
  records_processed INT,
  records_success INT,
  records_failed INT,
  
  errors JSONB,
  
  initiated_by UUID,
  completed_at TIMESTAMP
);

-- Accounting System Configuration
CREATE TABLE accounting_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  system_name VARCHAR(100) NOT NULL,  -- quickbooks, zoho, sage
  
  -- Connection
  api_endpoint TEXT,
  api_key_encrypted TEXT,
  client_id VARCHAR(255),
  client_secret_encrypted TEXT,
  
  -- OAuth
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMP,
  
  -- Settings
  sync_mode VARCHAR(50),  -- real_time, batch, manual
  sync_frequency VARCHAR(50),  -- hourly, daily
  auto_sync_enabled BOOLEAN DEFAULT false,
  
  -- Entity Mapping
  entity_sync_config JSONB,
  -- {
  --   invoices: {enabled: true, direction: "outbound"},
  --   payments: {enabled: true, direction: "inbound"},
  --   customers: {enabled: true, direction: "bidirectional"}
  -- }
  
  -- Status
  is_connected BOOLEAN DEFAULT false,
  last_connection_test TIMESTAMP,
  last_sync_date TIMESTAMP,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. FINANCIAL REPORTS

### 6.1 Report Views

```sql
-- Monthly Revenue Summary
CREATE VIEW monthly_revenue_summary AS
SELECT 
  DATE_TRUNC('month', invoice_date) as month,
  COUNT(*) as invoice_count,
  SUM(subtotal) as gross_sales,
  SUM(discount_amount) as total_discounts,
  SUM(subtotal - discount_amount) as net_sales,
  SUM(tax_amount) as total_tax,
  SUM(total_amount) as total_billed,
  SUM(paid_amount) as total_collected,
  SUM(balance_due) as outstanding
FROM invoices
WHERE status NOT IN ('cancelled', 'draft')
  AND invoice_type = 'standard'
GROUP BY DATE_TRUNC('month', invoice_date)
ORDER BY month DESC;

-- Customer Revenue Analysis
CREATE VIEW customer_revenue_analysis AS
SELECT 
  c.id as customer_id,
  c.customer_code,
  c.company_name,
  c.classification,
  COUNT(DISTINCT i.id) as invoice_count,
  SUM(i.total_amount) as total_revenue,
  AVG(i.total_amount) as avg_invoice_value,
  MIN(i.invoice_date) as first_invoice_date,
  MAX(i.invoice_date) as last_invoice_date,
  SUM(i.balance_due) as current_outstanding,
  EXTRACT(DAY FROM AVG(
    CASE WHEN i.paid_amount >= i.total_amount 
    THEN (
      SELECT MIN(p.payment_date) - i.invoice_date
      FROM payment_allocations pa
      JOIN payments p ON p.id = pa.payment_id
      WHERE pa.invoice_id = i.id
    )
    ELSE NULL END
  )) as avg_payment_days
FROM customers c
LEFT JOIN invoices i ON i.customer_id = c.id AND i.status NOT IN ('cancelled', 'draft')
GROUP BY c.id, c.customer_code, c.company_name, c.classification;

-- DSO (Days Sales Outstanding)
CREATE VIEW dso_report AS
WITH revenue_data AS (
  SELECT 
    DATE_TRUNC('month', invoice_date) as month,
    SUM(total_amount) as total_sales
  FROM invoices
  WHERE status NOT IN ('cancelled', 'draft')
    AND invoice_type = 'standard'
    AND invoice_date >= CURRENT_DATE - INTERVAL '12 months'
  GROUP BY DATE_TRUNC('month', invoice_date)
),
ar_data AS (
  SELECT 
    DATE_TRUNC('month', invoice_date) as month,
    SUM(balance_due) as month_end_ar
  FROM invoices
  WHERE status NOT IN ('cancelled', 'draft')
  GROUP BY DATE_TRUNC('month', invoice_date)
)
SELECT 
  r.month,
  r.total_sales,
  ar.month_end_ar,
  CASE 
    WHEN r.total_sales > 0 
    THEN ROUND((ar.month_end_ar / r.total_sales) * 30, 1)
    ELSE 0 
  END as dso_days
FROM revenue_data r
LEFT JOIN ar_data ar ON ar.month = r.month
ORDER BY r.month DESC;

-- Product Revenue Analysis
CREATE VIEW product_revenue_analysis AS
SELECT 
  p.id as product_id,
  p.product_code,
  p.product_name,
  pg.group_name as product_group,
  COUNT(DISTINCT ii.invoice_id) as times_sold,
  SUM(ii.quantity) as total_quantity,
  SUM(ii.net_amount) as total_revenue,
  AVG(ii.unit_price) as avg_unit_price
FROM products p
JOIN invoice_items ii ON ii.product_id = p.id
JOIN invoices i ON i.id = ii.invoice_id AND i.status NOT IN ('cancelled', 'draft')
LEFT JOIN product_groups pg ON pg.id = p.product_group_id
GROUP BY p.id, p.product_code, p.product_name, pg.group_name
ORDER BY total_revenue DESC;

-- Cash Flow Forecast View
CREATE VIEW cash_flow_forecast AS
SELECT 
  week_number,
  week_start,
  week_end,
  expected_collections,
  invoices_due
FROM (
  -- Next 8 weeks
  SELECT 
    n as week_number,
    CURRENT_DATE + (n * 7) as week_start,
    CURRENT_DATE + ((n + 1) * 7 - 1) as week_end,
    (
      SELECT COALESCE(SUM(balance_due), 0)
      FROM invoices
      WHERE due_date BETWEEN CURRENT_DATE + (n * 7) AND CURRENT_DATE + ((n + 1) * 7 - 1)
        AND status NOT IN ('cancelled', 'draft', 'paid')
    ) as expected_collections,
    (
      SELECT COUNT(*)
      FROM invoices
      WHERE due_date BETWEEN CURRENT_DATE + (n * 7) AND CURRENT_DATE + ((n + 1) * 7 - 1)
        AND status NOT IN ('cancelled', 'draft', 'paid')
    ) as invoices_due
  FROM generate_series(0, 7) as n
) weeks;
```

---

## 7. API SPECIFICATIONS

### Financial Routes

```
=== INVOICES ===
POST   /invoices                           Create invoice
GET    /invoices                           List invoices (filters: status, customer, date range)
GET    /invoices/:id                       Get invoice details
PUT    /invoices/:id                       Update draft invoice
POST   /invoices/:id/approve               Approve invoice
POST   /invoices/:id/send                  Email invoice to customer
GET    /invoices/:id/pdf                   Download PDF
POST   /invoices/:id/credit-note           Create credit note
DELETE /invoices/:id                       Cancel invoice

=== PAYMENTS ===
POST   /payments                           Record payment
GET    /payments                           List payments
GET    /payments/:id                       Get payment details
POST   /payments/:id/allocate              Allocate to invoices
POST   /payments/:id/bounce                Mark cheque as bounced
GET    /payments/unallocated               Get unallocated payments

=== ACCOUNTS RECEIVABLE ===
GET    /ar/aging                           AR aging report
GET    /ar/aging/summary                   AR aging summary by customer
GET    /ar/customer/:id/ledger             Customer ledger
POST   /ar/statements                      Generate statement
POST   /ar/statements/:id/send             Email statement
GET    /ar/collection-notes                List collection notes
POST   /ar/collection-notes                Add collection note

=== CREDIT ===
GET    /credit/customers                   List customer credit status
GET    /credit/customers/:id               Get customer credit details
PUT    /credit/customers/:id               Update credit terms
POST   /credit/applications                Submit credit application
GET    /credit/applications                List applications
PUT    /credit/applications/:id            Process application
POST   /credit/hold/:customerId            Place customer on hold
DELETE /credit/hold/:customerId            Remove from hold

=== ACCOUNTING INTEGRATION ===
GET    /accounting/config                  Get integration config
PUT    /accounting/config                  Update config
POST   /accounting/sync                    Trigger manual sync
GET    /accounting/transactions            List pending transactions
POST   /accounting/transactions/:id/sync   Sync single transaction
GET    /accounting/coa-mapping             Get COA mappings
PUT    /accounting/coa-mapping             Update mappings

=== REPORTS ===
GET    /reports/revenue/monthly            Monthly revenue summary
GET    /reports/revenue/customer           Revenue by customer
GET    /reports/revenue/product            Revenue by product
GET    /reports/dso                        DSO trend
GET    /reports/cash-forecast              Cash flow forecast
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Financial Integration module for ProPackHub:

CONTEXT:
- CRM needs invoicing tied to production orders
- Payments must be tracked and allocated
- AR aging critical for cash flow
- Integration with accounting systems needed

FINANCIAL MODULE:
1. Invoicing
   - Generate from production orders
   - Support proforma, standard, credit notes
   - Auto-calculate taxes
   - PDF generation

2. Payment Tracking
   - Multiple payment methods
   - Allocate to invoices
   - Cheque management
   - Advance payment utilization

3. Accounts Receivable
   - AR aging by customer
   - Statement generation
   - Collection notes
   - DSO tracking

4. Credit Management
   - Credit limits per customer
   - Credit checks before orders
   - Credit hold functionality
   - Credit applications

5. Accounting Integration
   - Chart of accounts mapping
   - Journal entry generation
   - Sync with QuickBooks/Sage/Zoho
   - Configurable sync modes

DATABASE: Use schemas from 09-FINANCIAL-INTEGRATION.md
```

---

*Continues to 10-CUSTOMER-PORTAL.md...*
