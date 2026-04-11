# ProPackHub - Phase 8: Artwork Management

**Implementation Phase:** 8 (Weeks 43-46)  
**Priority:** Medium  
**Dependencies:** Products (01), Customers (01), Production (05)

---

## TABLE OF CONTENTS

1. [Artwork Master](#1-artwork-master)
2. [Version Control](#2-version-control)
3. [Approval Workflow](#3-approval-workflow)
4. [Color Management](#4-color-management)
5. [Preflight & Validation](#5-preflight--validation)
6. [Cylinder/Plate Management](#6-cylinderplate-management)
7. [API Specifications](#7-api-specifications)

---

## 1. ARTWORK MASTER

### 1.1 Artwork Registry

```sql
-- Artwork Master
CREATE TABLE artworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_code VARCHAR(50) UNIQUE NOT NULL,  -- ART-2025-0001
  
  -- Basic Info
  artwork_name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  brand_name VARCHAR(255),
  
  -- Product Link
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_name VARCHAR(255),
  
  -- Design Details
  design_type VARCHAR(100),
  -- label, pouch_front, pouch_back, pouch_full, wrapper, lidding,
  -- shrink_sleeve, tube_laminate, sachet
  
  -- Dimensions
  repeat_length DECIMAL(10,3),  -- mm
  repeat_width DECIMAL(10,3),   -- mm
  bleed_size DECIMAL(10,3),     -- mm
  
  -- Colors
  color_count INT,
  print_type VARCHAR(50),  -- surface, reverse, combination
  print_process VARCHAR(50),  -- flexo, gravure, digital
  
  -- Structure Reference
  structure_id UUID,  -- Link to product structure
  substrate_for_print VARCHAR(100),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, approved, production_ready, 
  -- on_hold, obsolete, superseded
  
  -- Current Active Version
  current_version_id UUID,  -- FK added after version table created
  current_version_number VARCHAR(20),
  
  -- Cylinder/Plate
  has_cylinder BOOLEAN DEFAULT false,
  has_plate BOOLEAN DEFAULT false,
  
  -- Important Dates
  first_approved_date DATE,
  last_revision_date DATE,
  
  -- Tags
  tags TEXT[],
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_artwork_customer ON artworks(customer_id);
CREATE INDEX idx_artwork_product ON artworks(product_id);
CREATE INDEX idx_artwork_status ON artworks(status);

-- Artwork Categories/Tags
CREATE TABLE artwork_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code VARCHAR(50) UNIQUE NOT NULL,
  category_name VARCHAR(255) NOT NULL,
  parent_category_id UUID REFERENCES artwork_categories(id),
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

INSERT INTO artwork_categories (category_code, category_name) VALUES
('SNACKS', 'Snack Foods'),
('DAIRY', 'Dairy Products'),
('BEVERAGES', 'Beverages'),
('CONFECTIONERY', 'Confectionery'),
('PERSONAL-CARE', 'Personal Care'),
('PHARMACEUTICALS', 'Pharmaceuticals'),
('HOUSEHOLD', 'Household Products'),
('INDUSTRIAL', 'Industrial Products');

-- Artwork-Category Links
CREATE TABLE artwork_category_links (
  artwork_id UUID REFERENCES artworks(id) ON DELETE CASCADE,
  category_id UUID REFERENCES artwork_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (artwork_id, category_id)
);
```

---

## 2. VERSION CONTROL

### 2.1 Artwork Versions

```sql
-- Artwork Versions
CREATE TABLE artwork_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_id UUID REFERENCES artworks(id) ON DELETE CASCADE,
  
  -- Version
  version_number VARCHAR(20) NOT NULL,  -- "1.0", "1.1", "2.0"
  major_version INT NOT NULL DEFAULT 1,
  minor_version INT NOT NULL DEFAULT 0,
  
  -- Version Info
  version_name VARCHAR(255),
  revision_notes TEXT,
  
  -- Change Type
  change_type VARCHAR(100),
  -- new, color_change, text_change, layout_change, design_change,
  -- barcode_update, regulatory_update, customer_request
  
  -- Files
  source_file_url TEXT,  -- AI, PSD, CDR
  source_file_format VARCHAR(20),
  pdf_file_url TEXT,     -- Print-ready PDF
  thumbnail_url TEXT,    -- Preview image
  
  -- Technical Specs
  file_size_mb DECIMAL(10,2),
  resolution_dpi INT,
  color_mode VARCHAR(20),  -- CMYK, RGB
  
  -- Dimensions
  artboard_width DECIMAL(10,3),
  artboard_height DECIMAL(10,3),
  
  -- Color Details
  color_separations JSONB,
  -- [
  --   {name: "Cyan", type: "process", angle: 15, screen: 175},
  --   {name: "Magenta", type: "process", angle: 75, screen: 175},
  --   {name: "PMS 485 C", type: "spot", pantone: "485 C"}
  -- ]
  
  -- Barcodes
  barcodes JSONB,
  -- [
  --   {type: "EAN-13", value: "6291234567890", x: 10, y: 50, bwr: 0.08},
  --   {type: "QR", content: "https://..."}
  -- ]
  
  -- Text Content (for searchability)
  text_content JSONB,
  -- {
  --   product_name: "Crispy Chips Original",
  --   net_weight: "150g",
  --   ingredients: "...",
  --   nutritional_info: {...}
  -- }
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, submitted, under_review, changes_requested, 
  -- approved, production, superseded, rejected
  
  -- Approval
  approval_id UUID,  -- FK added after approval table
  
  -- Created By (Designer)
  created_by UUID,
  designer_name VARCHAR(255),
  designer_company VARCHAR(255),  -- If outsourced
  
  -- Dates
  submitted_date TIMESTAMP,
  approved_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(artwork_id, major_version, minor_version)
);

CREATE INDEX idx_version_artwork ON artwork_versions(artwork_id);
CREATE INDEX idx_version_status ON artwork_versions(status);

-- Add FK back to artworks
ALTER TABLE artworks 
ADD CONSTRAINT fk_current_version 
FOREIGN KEY (current_version_id) REFERENCES artwork_versions(id);

-- Version Comparison History
CREATE TABLE artwork_version_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  artwork_id UUID REFERENCES artworks(id),
  version_from_id UUID REFERENCES artwork_versions(id),
  version_to_id UUID REFERENCES artwork_versions(id),
  
  -- Changes
  changes_summary TEXT,
  changes_detail JSONB,
  -- [
  --   {area: "Front Panel", type: "text_change", description: "Updated net weight from 100g to 150g"},
  --   {area: "Back Panel", type: "barcode_update", description: "Changed EAN from ... to ..."}
  -- ]
  
  -- Visual Comparison
  diff_image_url TEXT,  -- Image showing differences highlighted
  
  compared_by UUID,
  compared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Artwork Files (multiple files per version)
CREATE TABLE artwork_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_version_id UUID REFERENCES artwork_versions(id) ON DELETE CASCADE,
  
  file_type VARCHAR(50) NOT NULL,
  -- source, pdf, preview, proof, separation, trap, step_repeat
  
  file_name VARCHAR(255) NOT NULL,
  file_url TEXT NOT NULL,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  
  -- For proofs
  proof_number INT,
  proof_date DATE,
  
  -- Color separations
  separation_name VARCHAR(100),
  
  notes TEXT,
  
  uploaded_by UUID,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. APPROVAL WORKFLOW

### 3.1 Multi-Stage Approval

```sql
-- Approval Workflow Configuration
CREATE TABLE artwork_approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_code VARCHAR(50) UNIQUE NOT NULL,
  workflow_name VARCHAR(255) NOT NULL,
  
  -- Applicability
  applicable_to VARCHAR(100),  -- all, customer_specific, product_group
  customer_id UUID REFERENCES customers(id),
  product_group_id UUID,
  
  -- Stages
  stages JSONB NOT NULL,
  -- [
  --   {
  --     order: 1,
  --     name: "Internal Design Review",
  --     approval_type: "internal",
  --     role: "design_manager",
  --     required: true,
  --     auto_skip_if: null
  --   },
  --   {
  --     order: 2,
  --     name: "Sales Approval",
  --     approval_type: "internal",
  --     role: "sales_rep",
  --     required: true
  --   },
  --   {
  --     order: 3,
  --     name: "Customer Approval",
  --     approval_type: "customer",
  --     required: true,
  --     reminder_days: 3
  --   },
  --   {
  --     order: 4,
  --     name: "Pre-Production Check",
  --     approval_type: "internal",
  --     role: "prepress",
  --     required: true
  --   }
  -- ]
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default workflow seed
INSERT INTO artwork_approval_workflows (workflow_code, workflow_name, applicable_to, stages) VALUES
('DEFAULT', 'Standard Artwork Approval', 'all', '[
  {"order": 1, "name": "Internal Design Review", "approval_type": "internal", "role": "design_manager", "required": true},
  {"order": 2, "name": "Sales Approval", "approval_type": "internal", "role": "sales_rep", "required": true},
  {"order": 3, "name": "Customer Approval", "approval_type": "customer", "required": true, "reminder_days": 3},
  {"order": 4, "name": "Pre-Production Check", "approval_type": "internal", "role": "prepress", "required": true}
]');

-- Artwork Approvals
CREATE TABLE artwork_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_number VARCHAR(50) UNIQUE NOT NULL,  -- AA-2025-0001
  
  artwork_id UUID REFERENCES artworks(id),
  version_id UUID REFERENCES artwork_versions(id),
  
  -- Workflow
  workflow_id UUID REFERENCES artwork_approval_workflows(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, in_progress, approved, rejected, cancelled
  
  current_stage INT DEFAULT 1,
  
  -- Dates
  initiated_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_date TIMESTAMP,
  
  -- Final Decision
  final_decision VARCHAR(50),  -- approved, rejected
  final_decision_by UUID,
  final_decision_date TIMESTAMP,
  
  notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add FK to artwork_versions
ALTER TABLE artwork_versions 
ADD CONSTRAINT fk_approval 
FOREIGN KEY (approval_id) REFERENCES artwork_approvals(id);

-- Approval Stage Records
CREATE TABLE artwork_approval_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id UUID REFERENCES artwork_approvals(id) ON DELETE CASCADE,
  
  -- Stage
  stage_order INT NOT NULL,
  stage_name VARCHAR(255) NOT NULL,
  approval_type VARCHAR(50),  -- internal, customer
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, in_progress, approved, rejected, skipped
  
  -- Approver
  assigned_to UUID,
  assigned_to_name VARCHAR(255),
  assigned_to_email VARCHAR(255),  -- For customer approvals
  
  -- Response
  responded_by UUID,
  responded_by_name VARCHAR(255),
  responded_at TIMESTAMP,
  decision VARCHAR(50),  -- approved, rejected, changes_requested
  
  -- Comments
  comments TEXT,
  
  -- Attachments (marked-up PDF, etc.)
  attachments JSONB DEFAULT '[]',
  
  -- Customer Token (for external approval link)
  customer_token VARCHAR(100) UNIQUE,
  token_expires_at TIMESTAMP,
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT false,
  reminder_sent_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(approval_id, stage_order)
);

-- Approval Comments/Annotations
CREATE TABLE artwork_approval_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_stage_id UUID REFERENCES artwork_approval_stages(id) ON DELETE CASCADE,
  
  -- Commenter
  commenter_type VARCHAR(50),  -- internal, customer
  commenter_id UUID,
  commenter_name VARCHAR(255),
  
  -- Comment
  comment_text TEXT NOT NULL,
  
  -- Position on artwork (for annotation)
  is_annotation BOOLEAN DEFAULT false,
  annotation_x DECIMAL(10,2),  -- percentage from left
  annotation_y DECIMAL(10,2),  -- percentage from top
  annotation_page INT DEFAULT 1,
  
  -- Reply to
  parent_comment_id UUID REFERENCES artwork_approval_comments(id),
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Approval Links (for external approval without login)
CREATE TABLE customer_approval_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  approval_stage_id UUID REFERENCES artwork_approval_stages(id),
  
  token VARCHAR(100) UNIQUE NOT NULL,
  
  -- Customer Info
  customer_id UUID REFERENCES customers(id),
  contact_id UUID REFERENCES customer_contacts(id),
  email VARCHAR(255),
  
  -- Access Control
  can_download BOOLEAN DEFAULT true,
  can_comment BOOLEAN DEFAULT true,
  can_approve BOOLEAN DEFAULT true,
  
  -- Tracking
  first_accessed_at TIMESTAMP,
  last_accessed_at TIMESTAMP,
  access_count INT DEFAULT 0,
  ip_addresses TEXT[],
  
  -- Expiry
  expires_at TIMESTAMP NOT NULL,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 4. COLOR MANAGEMENT

### 4.1 Color Library

```sql
-- Color Library (Master)
CREATE TABLE color_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  color_code VARCHAR(50) UNIQUE NOT NULL,
  color_name VARCHAR(255) NOT NULL,
  
  -- Color Type
  color_type VARCHAR(50) NOT NULL,
  -- process (CMYK), spot (Pantone), special (metallic, fluorescent)
  
  -- CMYK Values (for process or conversion)
  cyan DECIMAL(5,2),
  magenta DECIMAL(5,2),
  yellow DECIMAL(5,2),
  black DECIMAL(5,2),
  
  -- Pantone Reference
  pantone_code VARCHAR(50),
  pantone_library VARCHAR(100),  -- "Pantone Solid Coated", "Pantone Extended Gamut"
  
  -- LAB Values
  lab_l DECIMAL(8,4),
  lab_a DECIMAL(8,4),
  lab_b DECIMAL(8,4),
  
  -- RGB (for display)
  rgb_r INT,
  rgb_g INT,
  rgb_b INT,
  hex_code VARCHAR(7),
  
  -- Ink Information
  ink_vendor VARCHAR(255),
  ink_series VARCHAR(100),
  ink_code VARCHAR(100),
  
  -- Gravure/Flexo Details
  anilox_bcm DECIMAL(6,2),  -- Billion Cubic Microns
  anilox_lpi INT,
  
  -- Screen Details
  screen_angle DECIMAL(5,2),
  screen_ruling INT,  -- LPI
  
  -- Usage
  is_customer_specific BOOLEAN DEFAULT false,
  customer_id UUID REFERENCES customers(id),
  
  notes TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_color_pantone ON color_library(pantone_code);
CREATE INDEX idx_color_customer ON color_library(customer_id);

-- Seed common Pantone colors
INSERT INTO color_library (color_code, color_name, color_type, pantone_code, pantone_library, hex_code) VALUES
('PMS-485', 'Pantone 485 C (Red)', 'spot', '485 C', 'Pantone Solid Coated', '#DA291C'),
('PMS-286', 'Pantone 286 C (Blue)', 'spot', '286 C', 'Pantone Solid Coated', '#0032A0'),
('PMS-349', 'Pantone 349 C (Green)', 'spot', '349 C', 'Pantone Solid Coated', '#046A38'),
('PMS-109', 'Pantone 109 C (Yellow)', 'spot', '109 C', 'Pantone Solid Coated', '#FFD100'),
('PMS-2685', 'Pantone 2685 C (Purple)', 'spot', '2685 C', 'Pantone Solid Coated', '#56278C'),
('PROC-C', 'Process Cyan', 'process', NULL, NULL, '#00AEEF'),
('PROC-M', 'Process Magenta', 'process', NULL, NULL, '#EC008C'),
('PROC-Y', 'Process Yellow', 'process', NULL, NULL, '#FFF200'),
('PROC-K', 'Process Black', 'process', NULL, NULL, '#000000'),
('SPL-SILVER', 'Metallic Silver', 'special', NULL, NULL, '#C0C0C0'),
('SPL-GOLD', 'Metallic Gold', 'special', NULL, NULL, '#FFD700');

-- Artwork Colors (colors used in each artwork)
CREATE TABLE artwork_colors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artwork_version_id UUID REFERENCES artwork_versions(id) ON DELETE CASCADE,
  
  color_order INT NOT NULL,  -- Print sequence
  
  -- Color Reference
  color_id UUID REFERENCES color_library(id),
  color_code VARCHAR(50),
  color_name VARCHAR(255),
  
  -- Separation Details
  separation_name VARCHAR(100),  -- Name in file
  
  -- Screen Details
  screen_angle DECIMAL(5,2),
  screen_ruling INT,
  dot_shape VARCHAR(50),  -- round, elliptical, square
  
  -- Coverage
  coverage_percentage DECIMAL(5,2),  -- Estimated ink coverage
  
  -- Trapping
  trap_color_ids UUID[],  -- Colors this color traps with
  trap_width DECIMAL(6,4),  -- mm
  
  -- Special
  is_varnish BOOLEAN DEFAULT false,
  is_white_underprint BOOLEAN DEFAULT false,
  
  UNIQUE(artwork_version_id, color_order)
);

-- Color Drawdowns/Standards
CREATE TABLE color_drawdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawdown_code VARCHAR(50) UNIQUE NOT NULL,  -- DD-2025-0001
  
  color_id UUID REFERENCES color_library(id),
  
  -- Customer/Product
  customer_id UUID REFERENCES customers(id),
  product_id UUID REFERENCES products(id),
  artwork_id UUID REFERENCES artworks(id),
  
  -- Substrate
  substrate VARCHAR(255),
  substrate_color VARCHAR(100),
  
  -- Measurements
  delta_e DECIMAL(6,3),  -- Color difference from standard
  density DECIMAL(6,3),
  
  lab_l DECIMAL(8,4),
  lab_a DECIMAL(8,4),
  lab_b DECIMAL(8,4),
  
  -- Standard Type
  standard_type VARCHAR(50),  -- master, production, customer_approved
  
  -- Physical Sample
  has_physical_sample BOOLEAN DEFAULT true,
  sample_location VARCHAR(255),
  
  -- Validity
  valid_from DATE,
  valid_until DATE,
  
  -- Approval
  approved_by UUID,
  approved_date DATE,
  customer_approved BOOLEAN DEFAULT false,
  customer_approved_date DATE,
  
  notes TEXT,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. PREFLIGHT & VALIDATION

### 5.1 Preflight Check System

```sql
-- Preflight Profiles
CREATE TABLE preflight_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_code VARCHAR(50) UNIQUE NOT NULL,
  profile_name VARCHAR(255) NOT NULL,
  
  -- Applicability
  print_process VARCHAR(50),  -- flexo, gravure, digital, all
  
  -- Check Rules
  checks JSONB NOT NULL,
  -- [
  --   {
  --     category: "Resolution",
  --     check: "minimum_resolution",
  --     value: 300,
  --     unit: "dpi",
  --     severity: "error"
  --   },
  --   {
  --     category: "Color",
  --     check: "color_mode",
  --     expected: "CMYK",
  --     severity: "error"
  --   },
  --   {
  --     category: "Color",
  --     check: "spot_color_naming",
  --     pattern: "^PANTONE.*",
  --     severity: "warning"
  --   },
  --   {
  --     category: "Text",
  --     check: "minimum_font_size",
  --     value: 6,
  --     unit: "pt",
  --     severity: "warning"
  --   },
  --   {
  --     category: "Text",
  --     check: "fonts_embedded",
  --     value: true,
  --     severity: "error"
  --   },
  --   {
  --     category: "Barcode",
  --     check: "barcode_quality",
  --     min_grade: "C",
  --     severity: "error"
  --   },
  --   {
  --     category: "Bleed",
  --     check: "minimum_bleed",
  --     value: 3,
  --     unit: "mm",
  --     severity: "warning"
  --   },
  --   {
  --     category: "Overprint",
  --     check: "black_overprint",
  --     expected: true,
  --     severity: "info"
  --   }
  -- ]
  
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default profile
INSERT INTO preflight_profiles (profile_code, profile_name, print_process, checks, is_default) VALUES
('FLEXO-STD', 'Standard Flexo Preflight', 'flexo', '[
  {"category": "Resolution", "check": "minimum_resolution", "value": 300, "unit": "dpi", "severity": "error"},
  {"category": "Color", "check": "color_mode", "expected": "CMYK", "severity": "error"},
  {"category": "Color", "check": "max_ink_coverage", "value": 280, "unit": "%", "severity": "warning"},
  {"category": "Text", "check": "minimum_font_size", "value": 6, "unit": "pt", "severity": "warning"},
  {"category": "Text", "check": "minimum_line_weight", "value": 0.25, "unit": "pt", "severity": "warning"},
  {"category": "Barcode", "check": "barcode_bwr", "min": 0.05, "max": 0.12, "severity": "error"},
  {"category": "Bleed", "check": "minimum_bleed", "value": 3, "unit": "mm", "severity": "warning"}
]', true),
('GRAVURE-STD', 'Standard Gravure Preflight', 'gravure', '[
  {"category": "Resolution", "check": "minimum_resolution", "value": 400, "unit": "dpi", "severity": "error"},
  {"category": "Color", "check": "color_mode", "expected": "CMYK", "severity": "error"},
  {"category": "Color", "check": "max_ink_coverage", "value": 320, "unit": "%", "severity": "warning"},
  {"category": "Text", "check": "minimum_font_size", "value": 5, "unit": "pt", "severity": "warning"},
  {"category": "Bleed", "check": "minimum_bleed", "value": 5, "unit": "mm", "severity": "warning"}
]', false);

-- Preflight Results
CREATE TABLE preflight_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  artwork_version_id UUID REFERENCES artwork_versions(id),
  profile_id UUID REFERENCES preflight_profiles(id),
  
  -- File Checked
  file_checked VARCHAR(255),
  file_url TEXT,
  
  -- Overall Result
  status VARCHAR(50),  -- passed, passed_with_warnings, failed
  
  error_count INT DEFAULT 0,
  warning_count INT DEFAULT 0,
  info_count INT DEFAULT 0,
  
  -- Detailed Results
  results JSONB NOT NULL,
  -- [
  --   {
  --     category: "Resolution",
  --     check: "minimum_resolution",
  --     status: "pass",
  --     expected: "300 dpi",
  --     actual: "400 dpi"
  --   },
  --   {
  --     category: "Text",
  --     check: "minimum_font_size",
  --     status: "warning",
  --     expected: "6 pt",
  --     actual: "5 pt",
  --     location: "Back panel, ingredients text"
  --   }
  -- ]
  
  -- Execution
  executed_by UUID,
  executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_time_ms INT,
  
  notes TEXT
);

-- Barcode Verification
CREATE TABLE barcode_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  artwork_version_id UUID REFERENCES artwork_versions(id),
  
  -- Barcode Info
  barcode_type VARCHAR(50),  -- EAN-13, UPC-A, Code-128, QR, DataMatrix
  barcode_value VARCHAR(255),
  
  -- Position
  position_x DECIMAL(10,2),
  position_y DECIMAL(10,2),
  page_number INT DEFAULT 1,
  
  -- Size
  module_width DECIMAL(10,4),  -- X dimension in mm
  bar_height DECIMAL(10,2),
  
  -- BWR (Bar Width Reduction for flexo)
  bwr_applied DECIMAL(6,4),  -- mm
  
  -- Verification Results
  grade VARCHAR(5),  -- A, B, C, D, F or 4.0, 3.5, etc.
  overall_pass BOOLEAN,
  
  detailed_grades JSONB,
  -- {
  --   edge_contrast: "A",
  --   modulation: "B",
  --   defects: "A",
  --   decodability: "A",
  --   minimum_reflectance: "A"
  -- }
  
  -- Issues
  issues TEXT[],
  
  verified_by UUID,
  verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. CYLINDER/PLATE MANAGEMENT

### 6.1 Print Cylinders (Gravure)

```sql
-- Print Cylinders (for Gravure)
CREATE TABLE print_cylinders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_code VARCHAR(50) UNIQUE NOT NULL,  -- CYL-2025-0001
  
  -- Type
  cylinder_type VARCHAR(50),  -- print, coating
  
  -- Artwork Link
  artwork_id UUID REFERENCES artworks(id),
  artwork_version_id UUID REFERENCES artwork_versions(id),
  color_sequence INT,  -- Which color this cylinder is for
  color_name VARCHAR(100),
  
  -- Specifications
  face_length DECIMAL(10,3),  -- mm
  circumference DECIMAL(10,3),  -- mm
  repeat_length DECIMAL(10,3),
  
  -- Cylinder Physical
  base_cylinder_id VARCHAR(100),  -- Physical cylinder identifier
  base_diameter DECIMAL(10,3),
  wall_thickness DECIMAL(10,3),
  
  -- Engraving
  engraving_type VARCHAR(50),  -- electromechanical, laser
  screen_ruling INT,  -- LPI/CPcm
  screen_angle DECIMAL(5,2),
  cell_depth DECIMAL(10,4),  -- microns
  stylus_angle DECIMAL(5,2),
  
  -- Chrome
  chrome_thickness DECIMAL(10,4),  -- microns
  
  -- Vendor
  engraver_vendor VARCHAR(255),
  engraving_date DATE,
  
  -- Location
  storage_location VARCHAR(255),
  
  -- Condition
  condition VARCHAR(50),  -- new, good, worn, damaged, scrap
  impressions_count INT DEFAULT 0,
  max_impressions INT,
  
  -- Costs
  engraving_cost DECIMAL(12,2),
  rechrome_cost DECIMAL(12,2),
  
  -- Status
  status VARCHAR(50) DEFAULT 'in_production',
  -- in_production, on_machine, in_storage, at_engraver, scrapped
  
  -- Dates
  first_used_date DATE,
  last_used_date DATE,
  last_rechrome_date DATE,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cylinder_artwork ON print_cylinders(artwork_id);
CREATE INDEX idx_cylinder_status ON print_cylinders(status);

-- Cylinder Sets (group of cylinders for one job)
CREATE TABLE cylinder_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_code VARCHAR(50) UNIQUE NOT NULL,  -- SET-2025-0001
  
  artwork_id UUID REFERENCES artworks(id),
  artwork_version_id UUID REFERENCES artwork_versions(id),
  
  -- Set Details
  set_name VARCHAR(255),
  color_count INT,
  
  -- Cylinders in Set
  cylinder_ids UUID[],  -- Array of cylinder IDs in sequence
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',
  -- active, inactive, obsolete
  
  -- Location
  storage_location VARCHAR(255),
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Print Plates (for Flexo)
CREATE TABLE print_plates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_code VARCHAR(50) UNIQUE NOT NULL,  -- PLT-2025-0001
  
  -- Type
  plate_type VARCHAR(50),  -- photopolymer, digital
  plate_material VARCHAR(100),  -- DuPont Cyrel, Flint nyloflex, etc.
  
  -- Artwork Link
  artwork_id UUID REFERENCES artworks(id),
  artwork_version_id UUID REFERENCES artwork_versions(id),
  color_sequence INT,
  color_name VARCHAR(100),
  
  -- Dimensions
  plate_width DECIMAL(10,3),  -- mm
  plate_length DECIMAL(10,3),  -- mm
  thickness DECIMAL(6,3),  -- mm
  relief_depth DECIMAL(6,3),  -- mm
  
  -- Screen
  screen_ruling INT,  -- LPI
  min_dot DECIMAL(5,2),  -- %
  max_dot DECIMAL(5,2),  -- %
  
  -- Mounting
  mounting_tape_thickness DECIMAL(6,3),
  total_mounted_thickness DECIMAL(6,3),
  
  -- Vendor
  plate_vendor VARCHAR(255),
  production_date DATE,
  
  -- Location
  storage_location VARCHAR(255),
  
  -- Condition
  condition VARCHAR(50),  -- new, good, worn, damaged, scrap
  impressions_count INT DEFAULT 0,
  max_impressions INT,
  
  -- Cost
  plate_cost DECIMAL(12,2),
  
  -- Status
  status VARCHAR(50) DEFAULT 'in_storage',
  -- in_storage, on_press, at_vendor, scrapped
  
  -- Dates
  first_used_date DATE,
  last_used_date DATE,
  
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_plate_artwork ON print_plates(artwork_id);

-- Cylinder/Plate Usage Log
CREATE TABLE print_tooling_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  tooling_type VARCHAR(50) NOT NULL,  -- cylinder, plate
  tooling_id UUID NOT NULL,  -- cylinder_id or plate_id
  
  -- Production Reference
  work_order_id UUID REFERENCES work_orders(id),
  production_date DATE,
  machine_id UUID REFERENCES machines(id),
  
  -- Usage
  impressions_run INT,
  meters_printed DECIMAL(12,2),
  
  -- Condition After
  condition_after VARCHAR(50),
  
  -- Issues
  issues_noted TEXT,
  wear_observed BOOLEAN DEFAULT false,
  
  logged_by UUID,
  logged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. API SPECIFICATIONS

### Artwork Routes

```
=== ARTWORK MASTER ===
POST   /artworks                           Create artwork
GET    /artworks                           List artworks (with filters)
GET    /artworks/:id                       Get artwork details
PUT    /artworks/:id                       Update artwork
DELETE /artworks/:id                       Archive artwork
GET    /artworks/by-customer/:customerId   Get artworks by customer
GET    /artworks/by-product/:productId     Get artworks by product

=== VERSIONS ===
POST   /artworks/:id/versions              Create new version
GET    /artworks/:id/versions              List all versions
GET    /artwork-versions/:id               Get version details
GET    /artwork-versions/:id/files         Get version files
POST   /artwork-versions/:id/upload        Upload files
GET    /artwork-versions/:id/compare/:id2  Compare two versions

=== APPROVAL WORKFLOW ===
POST   /artwork-approvals                  Initiate approval
GET    /artwork-approvals                  List pending approvals
GET    /artwork-approvals/:id              Get approval details
POST   /artwork-approvals/:id/stages/:stageId/respond  Submit response
GET    /approval-link/:token               Customer approval page (public)
POST   /approval-link/:token/respond       Customer response (public)

=== COLORS ===
GET    /colors                             List color library
POST   /colors                             Add color
GET    /colors/:id                         Get color details
GET    /artwork-versions/:id/colors        Get artwork colors
POST   /color-drawdowns                    Create drawdown standard

=== PREFLIGHT ===
POST   /preflight/check                    Run preflight check
GET    /preflight/profiles                 List profiles
GET    /preflight/results/:versionId       Get preflight results
POST   /barcode/verify                     Verify barcode

=== CYLINDERS & PLATES ===
POST   /cylinders                          Register cylinder
GET    /cylinders                          List cylinders
GET    /cylinders/:id                      Get cylinder details
PUT    /cylinders/:id                      Update cylinder
POST   /cylinder-sets                      Create cylinder set
POST   /plates                             Register plate
GET    /plates                             List plates
GET    /plates/:id                         Get plate details
POST   /tooling-usage                      Log usage
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Artwork Management module for ProPackHub:

CONTEXT:
- Flexible packaging uses complex multi-color printing
- Artworks require version control and customer approval
- Gravure uses cylinders, Flexo uses plates
- Barcodes must meet quality standards

ARTWORK MODULE:
1. Artwork Master
   - Link to customer & product
   - Track current active version
   - Categories and tags

2. Version Control
   - Major/minor versioning
   - Multiple file types (source, PDF, proofs)
   - Change tracking between versions

3. Approval Workflow
   - Multi-stage (Design → Sales → Customer → Prepress)
   - External customer approval via secure link
   - Annotations and comments

4. Color Management
   - Pantone/spot color library
   - CMYK process colors
   - Color drawdowns/standards

5. Preflight
   - Automated checks (resolution, colors, fonts)
   - Barcode verification
   - BWR validation for flexo

6. Tooling
   - Gravure cylinder tracking
   - Flexo plate management
   - Usage and condition logging

DATABASE: Use schemas from 08-ARTWORK-MANAGEMENT.md
```

---

*Continues to 09-FINANCIAL-INTEGRATION.md...*
