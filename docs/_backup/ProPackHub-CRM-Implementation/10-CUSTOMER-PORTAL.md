# ProPackHub - Phase 10: Customer Portal

**Implementation Phase:** 10 (Weeks 51-54)  
**Priority:** Medium  
**Dependencies:** All previous phases

---

## TABLE OF CONTENTS

1. [Portal Architecture](#1-portal-architecture)
2. [Customer Authentication](#2-customer-authentication)
3. [Order Tracking](#3-order-tracking)
4. [Sample Approval](#4-sample-approval)
5. [Document Center](#5-document-center)
6. [Complaint Management](#6-complaint-management)
7. [API Specifications](#7-api-specifications)

---

## 1. PORTAL ARCHITECTURE

### 1.1 Multi-Tenant Portal Setup

```sql
-- Portal Configuration (per tenant)
CREATE TABLE portal_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Branding
  portal_name VARCHAR(255) DEFAULT 'Customer Portal',
  logo_url TEXT,
  favicon_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#1890ff',
  secondary_color VARCHAR(7) DEFAULT '#52c41a',
  
  -- Custom Domain (optional)
  custom_domain VARCHAR(255),
  ssl_enabled BOOLEAN DEFAULT true,
  
  -- Features Enabled
  features JSONB DEFAULT '{
    "order_tracking": true,
    "sample_approval": true,
    "artwork_approval": true,
    "document_download": true,
    "complaints": true,
    "reorder": true,
    "quotation_request": true,
    "invoice_view": true,
    "payment_history": true
  }',
  
  -- Notifications
  notification_settings JSONB DEFAULT '{
    "order_updates": true,
    "shipment_tracking": true,
    "invoice_ready": true,
    "sample_ready": true,
    "document_uploaded": true
  }',
  
  -- Self-Registration
  allow_self_registration BOOLEAN DEFAULT false,
  registration_requires_approval BOOLEAN DEFAULT true,
  
  -- Terms
  terms_of_use TEXT,
  privacy_policy TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Portal Announcements
CREATE TABLE portal_announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  title VARCHAR(255) NOT NULL,
  content TEXT,
  
  -- Display
  display_type VARCHAR(50) DEFAULT 'banner',
  -- banner, popup, sidebar
  
  priority VARCHAR(20) DEFAULT 'normal',
  -- low, normal, high, urgent
  
  -- Targeting
  target_all BOOLEAN DEFAULT true,
  target_customer_ids UUID[],
  
  -- Schedule
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 2. CUSTOMER AUTHENTICATION

### 2.1 Portal Users

```sql
-- Portal Users (customers' staff)
CREATE TABLE portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to Customer
  customer_id UUID REFERENCES customers(id) NOT NULL,
  contact_id UUID REFERENCES customer_contacts(id),
  
  -- User Info
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  job_title VARCHAR(255),
  phone VARCHAR(50),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, active, suspended, deactivated
  
  email_verified BOOLEAN DEFAULT false,
  email_verified_at TIMESTAMP,
  
  -- Activation
  activation_token VARCHAR(255),
  activation_expires TIMESTAMP,
  
  -- Password Reset
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  
  -- Permissions
  permissions JSONB DEFAULT '{
    "view_orders": true,
    "view_invoices": true,
    "view_statements": false,
    "approve_samples": false,
    "approve_artworks": false,
    "submit_complaints": true,
    "request_quotes": true,
    "download_documents": true,
    "manage_users": false
  }',
  
  -- Role
  role VARCHAR(50) DEFAULT 'viewer',
  -- admin (can manage other portal users), approver, viewer
  
  -- Notifications
  notification_preferences JSONB DEFAULT '{
    "email_order_updates": true,
    "email_shipment_tracking": true,
    "email_invoice_ready": true,
    "email_sample_ready": true
  }',
  
  -- Session
  last_login TIMESTAMP,
  last_login_ip VARCHAR(45),
  login_count INT DEFAULT 0,
  
  -- MFA
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret VARCHAR(255),
  
  created_by UUID,  -- Internal user who created this
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portal_user_customer ON portal_users(customer_id);
CREATE INDEX idx_portal_user_email ON portal_users(email);

-- Portal Sessions
CREATE TABLE portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID REFERENCES portal_users(id) ON DELETE CASCADE,
  
  session_token VARCHAR(255) UNIQUE NOT NULL,
  
  -- Session Info
  ip_address VARCHAR(45),
  user_agent TEXT,
  device_type VARCHAR(50),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Status
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_portal_session_token ON portal_sessions(session_token);
CREATE INDEX idx_portal_session_user ON portal_sessions(user_id);

-- Portal Activity Log
CREATE TABLE portal_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  user_id UUID REFERENCES portal_users(id),
  customer_id UUID REFERENCES customers(id),
  
  -- Activity
  activity_type VARCHAR(100) NOT NULL,
  -- login, logout, view_order, download_document, submit_complaint,
  -- approve_sample, approve_artwork, request_quote, view_invoice
  
  activity_description TEXT,
  
  -- Reference
  reference_type VARCHAR(50),
  reference_id UUID,
  
  -- Request Info
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_portal_activity_user ON portal_activity_log(user_id);
CREATE INDEX idx_portal_activity_customer ON portal_activity_log(customer_id);
CREATE INDEX idx_portal_activity_date ON portal_activity_log(created_at);

-- Portal User Invitations
CREATE TABLE portal_user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  customer_id UUID REFERENCES customers(id),
  
  email VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  
  role VARCHAR(50) DEFAULT 'viewer',
  permissions JSONB,
  
  -- Invitation
  invitation_token VARCHAR(255) UNIQUE,
  expires_at TIMESTAMP,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, accepted, expired, cancelled
  
  accepted_at TIMESTAMP,
  accepted_user_id UUID REFERENCES portal_users(id),
  
  invited_by UUID,  -- Internal user
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. ORDER TRACKING

### 3.1 Order Visibility

```sql
-- Orders for Portal (view)
CREATE VIEW portal_orders AS
SELECT 
  po.id,
  po.order_number,
  po.customer_id,
  c.company_name as customer_name,
  po.customer_po_number,
  p.product_code,
  p.product_name,
  po.quantity_ordered,
  po.quantity_unit,
  po.confirmed_delivery_date,
  po.status,
  po.payment_terms,
  -- Calculate progress
  COALESCE(
    (SELECT SUM(quantity_produced) FROM work_orders WHERE production_order_id = po.id),
    0
  ) as quantity_produced,
  COALESCE(
    (SELECT SUM(quantity_shipped) FROM shipments WHERE production_order_id = po.id),
    0
  ) as quantity_shipped,
  po.created_at as order_date
FROM production_orders po
JOIN customers c ON c.id = po.customer_id
JOIN products p ON p.id = po.product_id
WHERE po.status NOT IN ('cancelled', 'draft');

-- Order Status Timeline
CREATE TABLE order_status_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  order_id UUID,  -- production_order_id or sales_order_id
  order_type VARCHAR(50) DEFAULT 'production_order',
  
  -- Status Change
  status VARCHAR(50) NOT NULL,
  status_label VARCHAR(255),  -- Human-readable for portal
  
  -- Details
  description TEXT,
  
  -- Visibility
  visible_to_customer BOOLEAN DEFAULT true,
  
  -- Timestamp
  occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Who/What triggered
  triggered_by VARCHAR(100),  -- system, user name
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_order_timeline ON order_status_timeline(order_id, order_type);

-- Shipment Tracking (for portal)
CREATE VIEW portal_shipments AS
SELECT 
  s.id,
  s.shipment_number,
  s.production_order_id,
  po.order_number,
  po.customer_id,
  po.customer_po_number,
  s.shipment_date,
  s.delivery_date,
  s.quantity_shipped,
  s.shipping_method,
  s.carrier_name,
  s.tracking_number,
  s.tracking_url,
  s.status,
  -- Delivery Address
  s.delivery_address
FROM shipments s
JOIN production_orders po ON po.id = s.production_order_id;

-- Customer Notifications Queue
CREATE TABLE customer_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  customer_id UUID REFERENCES customers(id),
  portal_user_id UUID REFERENCES portal_users(id),
  
  -- Notification
  notification_type VARCHAR(100) NOT NULL,
  -- order_confirmed, order_in_production, order_ready, 
  -- shipment_dispatched, shipment_delivered, invoice_ready,
  -- sample_ready, artwork_pending_approval, document_uploaded
  
  title VARCHAR(255) NOT NULL,
  message TEXT,
  
  -- Reference
  reference_type VARCHAR(50),
  reference_id UUID,
  reference_url TEXT,  -- Deep link in portal
  
  -- Delivery
  channels JSONB DEFAULT '{"portal": true, "email": false}',
  
  -- Status
  portal_read BOOLEAN DEFAULT false,
  portal_read_at TIMESTAMP,
  email_sent BOOLEAN DEFAULT false,
  email_sent_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_notification_customer ON customer_notifications(customer_id);
CREATE INDEX idx_notification_user ON customer_notifications(portal_user_id);
```

---

## 4. SAMPLE APPROVAL

### 4.1 Sample Workflow for Portal

```sql
-- Sample Approval Requests (for portal)
CREATE VIEW portal_sample_approvals AS
SELECT 
  s.id,
  s.sample_number,
  s.customer_id,
  c.company_name as customer_name,
  p.product_code,
  p.product_name,
  s.sample_type,
  s.structure_description,
  s.status,
  s.submitted_date,
  s.required_by_date,
  -- Approval details
  sa.approval_status,
  sa.customer_feedback,
  sa.approved_by_portal_user_id,
  sa.approved_at
FROM samples s
JOIN customers c ON c.id = s.customer_id
JOIN products p ON p.id = s.product_id
LEFT JOIN sample_approvals sa ON sa.sample_id = s.id
WHERE s.status IN ('pending_customer_approval', 'approved', 'rejected', 'conditionally_approved');

-- Sample Approvals (customer response)
CREATE TABLE sample_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  sample_id UUID REFERENCES samples(id),
  
  -- Approval
  approval_status VARCHAR(50) NOT NULL,
  -- approved, rejected, conditionally_approved, changes_requested
  
  -- Feedback
  customer_feedback TEXT,
  
  -- Conditions (if conditionally approved)
  conditions TEXT,
  
  -- Rating
  overall_rating INT,  -- 1-5
  rating_breakdown JSONB,
  -- {print_quality: 5, color_match: 4, barrier_properties: 5}
  
  -- Attachments (customer can upload marked-up samples)
  attachments JSONB DEFAULT '[]',
  
  -- Portal User
  approved_by_portal_user_id UUID REFERENCES portal_users(id),
  approved_by_name VARCHAR(255),
  approved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Digital Signature
  digital_signature TEXT,
  signature_ip VARCHAR(45),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sample Approval Comments
CREATE TABLE sample_approval_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  sample_id UUID REFERENCES samples(id),
  
  -- Commenter
  commenter_type VARCHAR(50),  -- customer, internal
  portal_user_id UUID REFERENCES portal_users(id),
  internal_user_id UUID,
  commenter_name VARCHAR(255),
  
  -- Comment
  comment_text TEXT NOT NULL,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. DOCUMENT CENTER

### 5.1 Customer Documents

```sql
-- Customer Documents (accessible via portal)
CREATE TABLE customer_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  customer_id UUID REFERENCES customers(id),
  
  -- Document Info
  document_type VARCHAR(100) NOT NULL,
  -- coa, tds, msds, invoice, packing_list, commercial_invoice,
  -- artwork_proof, quality_report, certification, contract
  
  document_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- File
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  
  -- Reference
  reference_type VARCHAR(50),
  reference_id UUID,
  reference_number VARCHAR(100),  -- Order number, invoice number, etc.
  
  -- Product/Lot
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  lot_number VARCHAR(50),
  
  -- Validity
  issue_date DATE,
  expiry_date DATE,
  
  -- Visibility
  visible_in_portal BOOLEAN DEFAULT true,
  
  -- Download Tracking
  download_count INT DEFAULT 0,
  last_downloaded_at TIMESTAMP,
  last_downloaded_by UUID,
  
  -- Notification
  customer_notified BOOLEAN DEFAULT false,
  notified_at TIMESTAMP,
  
  uploaded_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_doc ON customer_documents(customer_id);
CREATE INDEX idx_customer_doc_type ON customer_documents(document_type);
CREATE INDEX idx_customer_doc_ref ON customer_documents(reference_type, reference_id);

-- Document Download Log
CREATE TABLE document_download_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  document_id UUID REFERENCES customer_documents(id),
  
  -- Who
  portal_user_id UUID REFERENCES portal_users(id),
  portal_user_email VARCHAR(255),
  
  -- When/How
  downloaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  -- What
  document_name VARCHAR(255),
  document_type VARCHAR(100)
);

-- Technical Data Sheets (TDS) - structured
CREATE TABLE technical_data_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tds_code VARCHAR(50) UNIQUE NOT NULL,  -- TDS-2025-0001
  
  -- Product
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_name VARCHAR(255),
  
  -- Structure
  structure_summary TEXT,
  structure_detail JSONB,
  
  -- Properties
  properties JSONB,
  -- {
  --   total_thickness: {value: 89, unit: "μ", tolerance: "±5"},
  --   OTR: {value: "<2.0", unit: "cc/m²/day", condition: "23°C, 0% RH"},
  --   WVTR: {value: "<1.0", unit: "g/m²/day", condition: "38°C, 90% RH"},
  --   tensile_md: {value: ">25", unit: "MPa"},
  --   tensile_td: {value: ">20", unit: "MPa"},
  --   elongation_md: {value: ">300", unit: "%"},
  --   cof: {value: "0.15-0.25", sides: "both"}
  -- }
  
  -- Application
  applications TEXT[],
  recommended_uses TEXT,
  storage_conditions TEXT,
  shelf_life VARCHAR(100),
  
  -- Compliance
  compliance_statements TEXT[],
  
  -- PDF
  pdf_url TEXT,
  
  -- Version
  version INT DEFAULT 1,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  approved_by UUID,
  approved_date DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- MSDS/SDS (Material Safety Data Sheet)
CREATE TABLE safety_data_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sds_code VARCHAR(50) UNIQUE NOT NULL,
  
  -- Product/Material
  product_id UUID REFERENCES products(id),
  material_id UUID,
  item_name VARCHAR(255),
  
  -- GHS Classification
  ghs_classification JSONB,
  hazard_statements TEXT[],
  precautionary_statements TEXT[],
  
  -- Sections (16-section SDS)
  sections JSONB,
  -- {
  --   section_1: {title: "Identification", content: "..."},
  --   section_2: {title: "Hazard Identification", content: "..."},
  --   ...
  -- }
  
  -- PDF
  pdf_url TEXT,
  
  -- Version
  version INT DEFAULT 1,
  revision_date DATE,
  
  -- Language
  language VARCHAR(10) DEFAULT 'en',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. COMPLAINT MANAGEMENT

### 6.1 Customer Complaints via Portal

```sql
-- Customer Complaints
CREATE TABLE customer_complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_number VARCHAR(50) UNIQUE NOT NULL,  -- CMP-2025-0001
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Submitted by
  portal_user_id UUID REFERENCES portal_users(id),
  submitted_by_name VARCHAR(255),
  submitted_by_email VARCHAR(255),
  
  -- Complaint Type
  complaint_type VARCHAR(100) NOT NULL,
  -- quality, delivery, documentation, pricing, service, other
  
  complaint_category VARCHAR(100),
  -- For quality: print_defect, seal_failure, contamination, wrong_specs, etc.
  -- For delivery: late_delivery, short_shipment, damage, wrong_product
  
  -- Reference
  order_number VARCHAR(100),
  invoice_number VARCHAR(100),
  lot_numbers TEXT[],
  product_codes TEXT[],
  
  -- Details
  subject VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  
  -- Impact
  quantity_affected DECIMAL(18,4),
  quantity_unit VARCHAR(20),
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  -- [{name: "photo1.jpg", url: "...", type: "image/jpeg", size: 123456}]
  
  -- Priority (set by system/internal)
  priority VARCHAR(20) DEFAULT 'medium',
  -- low, medium, high, critical
  
  -- Status
  status VARCHAR(50) DEFAULT 'submitted',
  -- submitted, acknowledged, under_investigation, resolved, 
  -- closed, rejected, escalated
  
  -- Internal Assignment
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  assigned_at TIMESTAMP,
  
  -- Acknowledgment
  acknowledged_at TIMESTAMP,
  acknowledged_by UUID,
  
  -- Resolution
  resolution_type VARCHAR(100),
  -- credit_note, replacement, rework, no_action, rejected_not_valid
  
  resolution_summary TEXT,
  resolved_at TIMESTAMP,
  resolved_by UUID,
  
  -- Customer Feedback on Resolution
  customer_satisfied BOOLEAN,
  customer_feedback TEXT,
  feedback_rating INT,  -- 1-5
  
  -- Closure
  closed_at TIMESTAMP,
  closed_by UUID,
  
  -- SLA
  target_response_date TIMESTAMP,
  target_resolution_date TIMESTAMP,
  sla_breached BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_complaint_customer ON customer_complaints(customer_id);
CREATE INDEX idx_complaint_status ON customer_complaints(status);
CREATE INDEX idx_complaint_date ON customer_complaints(created_at);

-- Complaint Communications
CREATE TABLE complaint_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  complaint_id UUID REFERENCES customer_complaints(id) ON DELETE CASCADE,
  
  -- Sender
  sender_type VARCHAR(50) NOT NULL,  -- customer, internal
  portal_user_id UUID REFERENCES portal_users(id),
  internal_user_id UUID,
  sender_name VARCHAR(255),
  
  -- Message
  message TEXT NOT NULL,
  
  -- Visibility
  visible_to_customer BOOLEAN DEFAULT true,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complaint Root Cause & Corrective Actions (internal)
CREATE TABLE complaint_investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  complaint_id UUID REFERENCES customer_complaints(id),
  
  -- Investigation
  investigation_summary TEXT,
  root_cause TEXT,
  root_cause_category VARCHAR(100),
  -- human_error, machine_issue, material_defect, process_deviation, design_flaw
  
  -- 5-Why Analysis
  five_why_analysis JSONB,
  -- [
  --   {why: 1, question: "Why did seal fail?", answer: "Insufficient seal pressure"},
  --   {why: 2, question: "Why insufficient pressure?", answer: "Machine setting drift"},
  --   ...
  -- ]
  
  -- Corrective Actions
  corrective_actions JSONB,
  -- [
  --   {action: "Recalibrate machine", responsible: "...", due_date: "...", status: "completed"},
  --   {action: "Add pressure check to SOP", responsible: "...", due_date: "...", status: "pending"}
  -- ]
  
  -- Preventive Actions
  preventive_actions JSONB,
  
  -- Cost
  total_cost_of_complaint DECIMAL(12,2),
  cost_breakdown JSONB,
  -- {material: 500, labor: 200, freight: 150, credit_issued: 1000}
  
  investigated_by UUID,
  investigation_date TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Complaint SLA Configuration
CREATE TABLE complaint_sla_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  complaint_type VARCHAR(100),
  priority VARCHAR(20),
  
  -- SLA Times (in hours)
  acknowledgment_hours INT DEFAULT 4,
  initial_response_hours INT DEFAULT 24,
  resolution_hours INT DEFAULT 72,
  
  -- Escalation
  escalation_after_hours INT DEFAULT 48,
  escalate_to VARCHAR(255),
  
  is_active BOOLEAN DEFAULT true
);

INSERT INTO complaint_sla_config (complaint_type, priority, acknowledgment_hours, initial_response_hours, resolution_hours) VALUES
('quality', 'critical', 2, 8, 48),
('quality', 'high', 4, 24, 72),
('quality', 'medium', 8, 48, 120),
('delivery', 'high', 4, 24, 48),
('delivery', 'medium', 8, 48, 96);
```

---

## 7. API SPECIFICATIONS

### Portal Routes

```
=== AUTHENTICATION ===
POST   /portal/auth/login                  Login
POST   /portal/auth/logout                 Logout
POST   /portal/auth/forgot-password        Request password reset
POST   /portal/auth/reset-password         Reset password
GET    /portal/auth/me                     Get current user
PUT    /portal/auth/me                     Update profile
PUT    /portal/auth/change-password        Change password
POST   /portal/auth/verify-email           Verify email with token

=== ORDERS ===
GET    /portal/orders                      List customer orders
GET    /portal/orders/:id                  Get order details
GET    /portal/orders/:id/timeline         Get order status timeline
GET    /portal/orders/:id/documents        Get order documents

=== SHIPMENTS ===
GET    /portal/shipments                   List shipments
GET    /portal/shipments/:id               Get shipment details
GET    /portal/shipments/:id/tracking      Get tracking info

=== SAMPLES ===
GET    /portal/samples                     List samples pending approval
GET    /portal/samples/:id                 Get sample details
POST   /portal/samples/:id/approve         Approve sample
POST   /portal/samples/:id/reject          Reject sample
POST   /portal/samples/:id/comments        Add comment

=== ARTWORKS ===
GET    /portal/artworks                    List artworks pending approval
GET    /portal/artworks/:id                Get artwork details
POST   /portal/artworks/:id/approve        Approve artwork
POST   /portal/artworks/:id/reject         Reject with feedback
POST   /portal/artworks/:id/comments       Add annotation/comment

=== DOCUMENTS ===
GET    /portal/documents                   List available documents
GET    /portal/documents/:id               Get document details
GET    /portal/documents/:id/download      Download document
GET    /portal/documents/by-type/:type     Get documents by type (coa, tds, etc.)

=== INVOICES ===
GET    /portal/invoices                    List invoices
GET    /portal/invoices/:id                Get invoice details
GET    /portal/invoices/:id/pdf            Download invoice PDF
GET    /portal/statements                  Get account statements

=== COMPLAINTS ===
POST   /portal/complaints                  Submit complaint
GET    /portal/complaints                  List my complaints
GET    /portal/complaints/:id              Get complaint details
POST   /portal/complaints/:id/message      Add message
POST   /portal/complaints/:id/feedback     Submit resolution feedback

=== QUOTATIONS ===
POST   /portal/quote-requests              Request quotation
GET    /portal/quote-requests              List quote requests
GET    /portal/quotations                  List received quotations

=== NOTIFICATIONS ===
GET    /portal/notifications               Get notifications
PUT    /portal/notifications/:id/read      Mark as read
PUT    /portal/notifications/read-all      Mark all as read

=== USER MANAGEMENT (Admin only) ===
GET    /portal/users                       List portal users for my company
POST   /portal/users/invite                Invite new user
PUT    /portal/users/:id                   Update user
DELETE /portal/users/:id                   Deactivate user
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Customer Portal module for ProPackHub:

CONTEXT:
- Customers need self-service access
- Must be multi-tenant aware
- Mobile-friendly responsive design
- Secure authentication required

PORTAL FEATURES:
1. Authentication
   - Customer user registration
   - Password reset
   - Role-based permissions
   - Activity logging

2. Order Tracking
   - Real-time order status
   - Status timeline
   - Shipment tracking
   - Document access

3. Sample/Artwork Approval
   - View pending samples
   - Approve/reject with feedback
   - Digital signature capture
   - Comment threads

4. Document Center
   - COA downloads by lot
   - TDS per product
   - MSDS/SDS sheets
   - Invoice history

5. Complaint Management
   - Submit complaints online
   - Attach photos/files
   - Track resolution
   - Provide feedback

DATABASE: Use schemas from 10-CUSTOMER-PORTAL.md
FRONTEND: React with Ant Design, responsive
```

---

*Continues to 11-REPORTS-ANALYTICS.md...*
