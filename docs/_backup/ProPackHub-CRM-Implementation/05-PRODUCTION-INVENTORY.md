# ProPackHub - Phase 5: Production & Inventory Management

**Implementation Phase:** 5 (Weeks 23-32)  
**Priority:** High  
**Dependencies:** Quotation (02), Product Catalog (01)

---

## TABLE OF CONTENTS

1. [Production Planning Module](#1-production-planning-module)
2. [Work Order Management](#2-work-order-management)
3. [Material Requisition](#3-material-requisition)
4. [Production Tracking](#4-production-tracking)
5. [Quality Gates](#5-quality-gates)
6. [Inventory Management](#6-inventory-management)
7. [Lot/Batch Tracking](#7-lotbatch-tracking)
8. [Stock Movements](#8-stock-movements)
9. [API Specifications](#9-api-specifications)

---

## 1. PRODUCTION PLANNING MODULE

### 1.1 Production Calendar & Scheduling

```sql
-- Production Calendar (Machine Availability)
CREATE TABLE production_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id UUID REFERENCES machines(id),
  calendar_date DATE NOT NULL,
  
  -- Shifts
  shift_1_available BOOLEAN DEFAULT true,
  shift_2_available BOOLEAN DEFAULT true,
  shift_3_available BOOLEAN DEFAULT false,
  
  -- Capacity (hours available)
  total_available_hours DECIMAL(5,2) DEFAULT 16.00,
  planned_hours DECIMAL(5,2) DEFAULT 0,
  remaining_hours DECIMAL(5,2) GENERATED ALWAYS AS (total_available_hours - planned_hours) STORED,
  
  -- Reasons for unavailability
  unavailable_reason VARCHAR(100),  -- Maintenance, Holiday, Breakdown
  notes TEXT,
  
  UNIQUE(machine_id, calendar_date)
);

-- Machines Master
CREATE TABLE machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code VARCHAR(50) UNIQUE NOT NULL,
  machine_name VARCHAR(255) NOT NULL,
  
  -- Classification
  machine_type VARCHAR(100) NOT NULL,  -- Printing, Lamination, Slitting, Pouch_Making, Extrusion
  machine_subtype VARCHAR(100),  -- Gravure, Flexo, Rotogravure, CI_Flexo
  
  -- Capabilities
  max_web_width_mm DECIMAL(10,2),
  min_web_width_mm DECIMAL(10,2),
  max_speed_mpm DECIMAL(10,2),
  number_of_colors INT,  -- For printing machines
  
  -- Location
  plant_code VARCHAR(50),
  department VARCHAR(100),
  
  -- Status
  status VARCHAR(50) DEFAULT 'operational',  -- operational, maintenance, breakdown, decommissioned
  
  -- Costing
  hourly_rate DECIMAL(10,2),
  setup_time_minutes INT DEFAULT 30,
  
  -- Maintenance
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed common flexible packaging machines
INSERT INTO machines (machine_code, machine_name, machine_type, machine_subtype, max_web_width_mm, max_speed_mpm, number_of_colors, hourly_rate) VALUES
('GRV-001', 'Gravure Press 1 (8-Color)', 'Printing', 'Gravure', 1050, 250, 8, 200.00),
('GRV-002', 'Gravure Press 2 (10-Color)', 'Printing', 'Gravure', 1300, 300, 10, 250.00),
('FLX-001', 'CI Flexo 1 (8-Color)', 'Printing', 'CI_Flexo', 1050, 350, 8, 180.00),
('LAM-001', 'Solventless Laminator 1', 'Lamination', 'Solventless', 1300, 400, NULL, 130.00),
('LAM-002', 'Dry Laminator 1', 'Lamination', 'Dry', 1050, 300, NULL, 120.00),
('SLT-001', 'Slitter Rewinder 1', 'Slitting', 'Duplex', 1300, 500, NULL, 80.00),
('SLT-002', 'Slitter Rewinder 2', 'Slitting', 'Duplex', 1050, 400, NULL, 80.00),
('PCH-001', 'Pouch Machine 1 (3-Side Seal)', 'Pouch_Making', '3_Side_Seal', 800, 120, NULL, 100.00),
('PCH-002', 'Pouch Machine 2 (Stand-Up)', 'Pouch_Making', 'Stand_Up', 600, 80, NULL, 120.00),
('PCH-003', 'Pouch Machine 3 (Zipper)', 'Pouch_Making', 'Zipper', 500, 60, NULL, 140.00);

-- Production Schedule
CREATE TABLE production_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_number VARCHAR(50) UNIQUE NOT NULL,  -- SCH-2025-0001
  
  -- Reference
  work_order_id UUID REFERENCES work_orders(id),
  production_order_id UUID REFERENCES production_orders(id),
  
  -- Machine Assignment
  machine_id UUID REFERENCES machines(id) NOT NULL,
  
  -- Scheduling
  scheduled_start TIMESTAMP NOT NULL,
  scheduled_end TIMESTAMP NOT NULL,
  scheduled_hours DECIMAL(8,2) NOT NULL,
  
  -- Actual
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  actual_hours DECIMAL(8,2),
  
  -- Status
  status VARCHAR(50) DEFAULT 'scheduled',
  -- scheduled, in_progress, paused, completed, cancelled
  
  -- Priority
  priority INT DEFAULT 5,  -- 1 = highest, 10 = lowest
  
  -- Crew
  operator_id UUID,
  operator_name VARCHAR(255),
  shift VARCHAR(20),  -- Shift_1, Shift_2, Shift_3
  
  -- Notes
  notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_schedule_machine_date ON production_schedule(machine_id, scheduled_start);
CREATE INDEX idx_schedule_status ON production_schedule(status);
```

---

## 2. WORK ORDER MANAGEMENT

### 2.1 Work Order Tables

```sql
-- Work Orders (derived from Production Orders)
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number VARCHAR(50) UNIQUE NOT NULL,  -- WO-2025-0001
  
  -- Source
  production_order_id UUID REFERENCES production_orders(id) NOT NULL,
  
  -- Product Info
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_name VARCHAR(255),
  structure_snapshot JSONB,  -- Full structure at time of WO creation
  
  -- Customer
  customer_id UUID REFERENCES customers(id),
  customer_name VARCHAR(255),
  
  -- Quantity
  ordered_qty DECIMAL(18,2) NOT NULL,
  ordered_qty_unit VARCHAR(20) NOT NULL,  -- KG, PCS, ROLLS
  produced_qty DECIMAL(18,2) DEFAULT 0,
  good_qty DECIMAL(18,2) DEFAULT 0,
  rejected_qty DECIMAL(18,2) DEFAULT 0,
  waste_qty DECIMAL(18,2) DEFAULT 0,
  
  -- Dimensions
  width_mm DECIMAL(10,2),
  length_mm DECIMAL(10,2),
  
  -- Timeline
  required_date DATE NOT NULL,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'created',
  -- created, materials_requested, materials_issued, ready_to_start, 
  -- printing, lamination, slitting, pouch_making, qc_pending, 
  -- qc_approved, packing, completed, closed
  
  current_stage VARCHAR(100),
  
  -- Priority
  priority VARCHAR(20) DEFAULT 'normal',  -- critical, high, normal, low
  rush_order BOOLEAN DEFAULT false,
  
  -- Artwork
  artwork_id UUID,
  artwork_version VARCHAR(50),
  artwork_approved BOOLEAN DEFAULT false,
  
  -- Cylinder/Plate
  cylinder_set_id UUID,
  plate_set_id UUID,
  cylinder_status VARCHAR(50),  -- new, reuse, repair_needed
  
  -- Process Routing
  routing JSONB,
  -- [
  --   {step: 1, process: "Printing", machine: "GRV-001", status: "pending"},
  --   {step: 2, process: "Lamination", machine: "LAM-001", status: "pending"},
  --   {step: 3, process: "Slitting", machine: "SLT-001", status: "pending"}
  -- ]
  
  -- Costing
  estimated_cost DECIMAL(18,2),
  actual_cost DECIMAL(18,2),
  
  -- Notes
  production_notes TEXT,
  special_instructions TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_wo_status ON work_orders(status);
CREATE INDEX idx_wo_customer ON work_orders(customer_id);
CREATE INDEX idx_wo_required_date ON work_orders(required_date);

-- Work Order Operations (each process step)
CREATE TABLE work_order_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  
  operation_number INT NOT NULL,
  operation_name VARCHAR(100) NOT NULL,  -- Printing, Lamination_1, Lamination_2, Slitting, Pouch_Making
  
  -- Machine
  machine_id UUID REFERENCES machines(id),
  machine_name VARCHAR(255),
  
  -- Scheduling
  scheduled_start TIMESTAMP,
  scheduled_end TIMESTAMP,
  estimated_hours DECIMAL(8,2),
  
  -- Actual
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  actual_hours DECIMAL(8,2),
  
  -- Production
  input_qty DECIMAL(18,2),
  output_qty DECIMAL(18,2),
  waste_qty DECIMAL(18,2),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, scheduled, in_progress, paused, completed, skipped
  
  -- Operator
  operator_id UUID,
  operator_name VARCHAR(255),
  
  -- Speed & Quality
  avg_speed_mpm DECIMAL(10,2),
  downtime_minutes INT DEFAULT 0,
  downtime_reason TEXT,
  
  -- Notes
  notes TEXT,
  
  UNIQUE(work_order_id, operation_number)
);

-- Work Order Status Log
CREATE TABLE work_order_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  from_stage VARCHAR(100),
  to_stage VARCHAR(100),
  
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by UUID,
  changed_by_name VARCHAR(255),
  
  notes TEXT,
  
  -- Metrics at change
  qty_at_change DECIMAL(18,2),
  waste_at_change DECIMAL(18,2)
);
```

---

## 3. MATERIAL REQUISITION

### 3.1 Bill of Materials & Requisition

```sql
-- Bill of Materials (BOM) for Work Order
CREATE TABLE work_order_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID REFERENCES work_orders(id) ON DELETE CASCADE,
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  material_type VARCHAR(100),  -- Film, Adhesive, Ink, Solvent
  
  -- Layer reference (for films)
  layer_number INT,
  layer_function VARCHAR(50),
  
  -- Quantity Required
  required_qty DECIMAL(18,4) NOT NULL,
  required_qty_unit VARCHAR(20) DEFAULT 'KG',
  
  -- With waste factor
  gross_qty DECIMAL(18,4),  -- required_qty × (1 + waste_factor)
  waste_factor_pct DECIMAL(5,2) DEFAULT 5.00,
  
  -- Issued
  issued_qty DECIMAL(18,4) DEFAULT 0,
  returned_qty DECIMAL(18,4) DEFAULT 0,
  consumed_qty DECIMAL(18,4) DEFAULT 0,
  
  -- Lot allocation
  allocated_lots JSONB DEFAULT '[]',
  -- [{lot_number: "LOT-2025-001", qty: 500, location: "WH-A1"}]
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, partially_issued, fully_issued, consumed, closed
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Material Requisition
CREATE TABLE material_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_number VARCHAR(50) UNIQUE NOT NULL,  -- MR-2025-0001
  
  -- Reference
  work_order_id UUID REFERENCES work_orders(id),
  
  -- Requester
  requested_by UUID NOT NULL,
  requested_by_name VARCHAR(255),
  requested_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Required Date
  required_date DATE NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, approved, partially_issued, fully_issued, cancelled
  
  -- Approval
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- Notes
  notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Material Requisition Items
CREATE TABLE material_requisition_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID REFERENCES material_requisitions(id) ON DELETE CASCADE,
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Quantity
  requested_qty DECIMAL(18,4) NOT NULL,
  approved_qty DECIMAL(18,4),
  issued_qty DECIMAL(18,4) DEFAULT 0,
  unit VARCHAR(20) DEFAULT 'KG',
  
  -- Warehouse
  from_warehouse VARCHAR(50),
  from_location VARCHAR(50),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  
  notes TEXT
);

-- Material Issue (from warehouse to production)
CREATE TABLE material_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number VARCHAR(50) UNIQUE NOT NULL,  -- MI-2025-0001
  
  -- Reference
  requisition_id UUID REFERENCES material_requisitions(id),
  work_order_id UUID REFERENCES work_orders(id),
  
  -- Issue Details
  issue_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  issued_by UUID NOT NULL,
  issued_by_name VARCHAR(255),
  
  -- Received by
  received_by UUID,
  received_by_name VARCHAR(255),
  
  -- Status
  status VARCHAR(50) DEFAULT 'issued',  -- issued, received, partial_return, returned
  
  notes TEXT
);

-- Material Issue Items
CREATE TABLE material_issue_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID REFERENCES material_issues(id) ON DELETE CASCADE,
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Lot Info
  lot_number VARCHAR(50),
  batch_number VARCHAR(50),
  expiry_date DATE,
  
  -- Quantity
  issued_qty DECIMAL(18,4) NOT NULL,
  unit VARCHAR(20) DEFAULT 'KG',
  
  -- Roll/Reel specific
  roll_id VARCHAR(50),
  roll_width_mm DECIMAL(10,2),
  roll_weight_kg DECIMAL(10,2),
  
  -- From Location
  warehouse_code VARCHAR(50),
  location_code VARCHAR(50),
  
  -- Cost
  unit_cost DECIMAL(10,4),
  total_cost DECIMAL(18,4)
);
```

---

## 4. PRODUCTION TRACKING

### 4.1 Real-time Production Logging

```sql
-- Production Log (per shift/batch)
CREATE TABLE production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  work_order_id UUID REFERENCES work_orders(id),
  operation_id UUID REFERENCES work_order_operations(id),
  machine_id UUID REFERENCES machines(id),
  
  -- Time Period
  log_date DATE NOT NULL,
  shift VARCHAR(20) NOT NULL,  -- Shift_1, Shift_2, Shift_3
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  
  -- Production
  output_qty DECIMAL(18,4) NOT NULL,
  output_unit VARCHAR(20) DEFAULT 'KG',
  output_meters DECIMAL(18,2),
  output_pcs INT,
  
  -- Waste
  waste_qty DECIMAL(18,4) DEFAULT 0,
  waste_reason VARCHAR(255),
  waste_category VARCHAR(50),  -- setup, running, splice, quality
  
  -- Performance
  avg_speed_mpm DECIMAL(10,2),
  max_speed_mpm DECIMAL(10,2),
  total_runtime_minutes INT,
  downtime_minutes INT DEFAULT 0,
  
  -- Quality Checks
  inline_qc_done BOOLEAN DEFAULT false,
  inline_qc_result VARCHAR(20),  -- pass, fail, conditional
  
  -- Operator
  operator_id UUID,
  operator_name VARCHAR(255),
  
  -- Notes
  notes TEXT,
  issues_faced TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_prodlog_wo ON production_logs(work_order_id);
CREATE INDEX idx_prodlog_date ON production_logs(log_date);
CREATE INDEX idx_prodlog_machine ON production_logs(machine_id, log_date);

-- Downtime Log
CREATE TABLE downtime_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  production_log_id UUID REFERENCES production_logs(id),
  work_order_id UUID REFERENCES work_orders(id),
  machine_id UUID REFERENCES machines(id),
  
  -- Time
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  duration_minutes INT,
  
  -- Classification
  downtime_type VARCHAR(50) NOT NULL,
  -- planned_maintenance, breakdown, material_shortage, operator_break, 
  -- quality_issue, changeover, setup, waiting_instruction, power_failure
  
  downtime_category VARCHAR(50),  -- planned, unplanned
  
  -- Details
  reason TEXT NOT NULL,
  root_cause TEXT,
  corrective_action TEXT,
  
  -- Impact
  production_loss_kg DECIMAL(10,2),
  
  -- Reported by
  reported_by UUID,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Roll/Reel Production (for tracking output rolls)
CREATE TABLE production_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_number VARCHAR(50) UNIQUE NOT NULL,  -- ROLL-2025-0001
  
  -- Source
  work_order_id UUID REFERENCES work_orders(id),
  operation_id UUID REFERENCES work_order_operations(id),
  production_log_id UUID REFERENCES production_logs(id),
  
  -- Product
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  
  -- Roll Specifications
  width_mm DECIMAL(10,2) NOT NULL,
  length_m DECIMAL(18,2),
  gross_weight_kg DECIMAL(10,2),
  net_weight_kg DECIMAL(10,2),
  core_weight_kg DECIMAL(10,2),
  core_id_mm DECIMAL(10,2),  -- Core inner diameter
  
  -- Quality
  quality_grade VARCHAR(20) DEFAULT 'A',  -- A, B, C, Reject
  qc_status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, rejected, on_hold
  
  -- Location
  current_location VARCHAR(100),  -- Machine, QC, Warehouse, Shipped
  warehouse_code VARCHAR(50),
  bin_location VARCHAR(50),
  
  -- Traceability
  parent_roll_id UUID REFERENCES production_rolls(id),  -- For slitting
  child_rolls JSONB DEFAULT '[]',  -- After slitting
  
  -- Lot Info
  lot_number VARCHAR(50),
  production_date DATE DEFAULT CURRENT_DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'produced',
  -- produced, in_qc, approved, in_stock, allocated, shipped, consumed
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rolls_wo ON production_rolls(work_order_id);
CREATE INDEX idx_rolls_product ON production_rolls(product_id);
CREATE INDEX idx_rolls_status ON production_rolls(status);
```

---

## 5. QUALITY GATES

### 5.1 In-Process Quality Checks

```sql
-- Quality Checkpoints (defined per process)
CREATE TABLE quality_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_code VARCHAR(50) UNIQUE NOT NULL,
  checkpoint_name VARCHAR(255) NOT NULL,
  
  -- When to check
  process_type VARCHAR(100) NOT NULL,  -- Printing, Lamination, Slitting, Pouch_Making
  check_frequency VARCHAR(50),  -- hourly, per_roll, per_shift, per_batch
  
  -- Parameters to check
  parameters JSONB NOT NULL,
  -- [
  --   {name: "Registration", type: "visual", accept_criteria: "Within marks"},
  --   {name: "Color Density", type: "measurement", min: 1.4, max: 1.6, unit: "OD"},
  --   {name: "Web Tension", type: "measurement", min: 2.0, max: 4.0, unit: "kg"}
  -- ]
  
  is_mandatory BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true
);

-- Seed common checkpoints
INSERT INTO quality_checkpoints (checkpoint_code, checkpoint_name, process_type, check_frequency, parameters) VALUES
('QCP-PRINT-001', 'Print Quality Check', 'Printing', 'hourly', 
 '[{"name":"Registration","type":"visual"},{"name":"Color Match","type":"visual"},{"name":"Ink Adhesion","type":"tape_test"},{"name":"Density","type":"measurement","min":1.3,"max":1.6}]'),
('QCP-LAM-001', 'Lamination Bond Check', 'Lamination', 'per_roll',
 '[{"name":"Bond Strength","type":"measurement","min":1.5,"unit":"N/15mm"},{"name":"Bubble/Tunnel","type":"visual"},{"name":"Coating Weight","type":"measurement"}]'),
('QCP-SLT-001', 'Slitting Quality Check', 'Slitting', 'per_roll',
 '[{"name":"Width","type":"measurement","tolerance":0.5},{"name":"Edge Quality","type":"visual"},{"name":"Tension","type":"measurement"}]'),
('QCP-PCH-001', 'Pouch Seal Check', 'Pouch_Making', 'hourly',
 '[{"name":"Seal Strength","type":"measurement","min":15,"unit":"N/15mm"},{"name":"Leak Test","type":"test"},{"name":"Dimensions","type":"measurement"}]');

-- In-Process Quality Records
CREATE TABLE inprocess_quality_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  work_order_id UUID REFERENCES work_orders(id),
  operation_id UUID REFERENCES work_order_operations(id),
  production_log_id UUID REFERENCES production_logs(id),
  roll_id UUID REFERENCES production_rolls(id),
  checkpoint_id UUID REFERENCES quality_checkpoints(id),
  
  -- Check Time
  check_datetime TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Results
  results JSONB NOT NULL,
  -- {
  --   "Registration": {"value": "OK", "status": "pass"},
  --   "Color Match": {"value": "Slight variation", "status": "marginal"},
  --   "Density": {"value": 1.45, "status": "pass"}
  -- }
  
  -- Overall
  overall_status VARCHAR(20) NOT NULL,  -- pass, fail, marginal
  
  -- Action taken
  action_taken VARCHAR(255),
  corrective_action TEXT,
  
  -- Inspector
  checked_by UUID NOT NULL,
  checked_by_name VARCHAR(255),
  
  -- Attachments
  photos JSONB DEFAULT '[]',
  
  notes TEXT
);

-- Quality Hold
CREATE TABLE quality_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_number VARCHAR(50) UNIQUE NOT NULL,  -- HOLD-2025-0001
  
  -- What's on hold
  work_order_id UUID REFERENCES work_orders(id),
  roll_id UUID REFERENCES production_rolls(id),
  
  -- Hold Details
  hold_reason TEXT NOT NULL,
  quality_issue VARCHAR(255),
  
  -- Quantity
  hold_qty DECIMAL(18,4),
  hold_unit VARCHAR(20),
  
  -- Status
  status VARCHAR(50) DEFAULT 'on_hold',  -- on_hold, under_review, released, rejected, reworked
  
  -- Decision
  decision VARCHAR(50),  -- release_as_is, rework, downgrade, reject
  decision_by UUID,
  decision_date TIMESTAMP,
  decision_notes TEXT,
  
  -- If rework
  rework_instructions TEXT,
  rework_completed BOOLEAN DEFAULT false,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. INVENTORY MANAGEMENT

### 6.1 Warehouse & Location Structure

```sql
-- Warehouses
CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_code VARCHAR(50) UNIQUE NOT NULL,
  warehouse_name VARCHAR(255) NOT NULL,
  
  -- Type
  warehouse_type VARCHAR(50),  -- raw_material, wip, finished_goods, consumables
  
  -- Location
  address TEXT,
  
  -- Climate Control
  is_climate_controlled BOOLEAN DEFAULT false,
  temperature_range VARCHAR(50),  -- "15-25°C"
  humidity_range VARCHAR(50),     -- "40-60% RH"
  
  -- Capacity
  total_capacity_sqm DECIMAL(10,2),
  
  is_active BOOLEAN DEFAULT true
);

INSERT INTO warehouses (warehouse_code, warehouse_name, warehouse_type) VALUES
('WH-RM', 'Raw Material Warehouse', 'raw_material'),
('WH-WIP', 'Work in Progress Store', 'wip'),
('WH-FG', 'Finished Goods Warehouse', 'finished_goods'),
('WH-CON', 'Consumables Store', 'consumables');

-- Warehouse Locations (Bins/Racks)
CREATE TABLE warehouse_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID REFERENCES warehouses(id),
  location_code VARCHAR(50) NOT NULL,
  
  -- Hierarchy: Zone > Aisle > Rack > Level > Bin
  zone VARCHAR(10),
  aisle VARCHAR(10),
  rack VARCHAR(10),
  level VARCHAR(10),
  bin VARCHAR(10),
  
  -- Type
  location_type VARCHAR(50),  -- rack, floor, cold_room, bulk
  
  -- Dimensions
  width_m DECIMAL(5,2),
  depth_m DECIMAL(5,2),
  height_m DECIMAL(5,2),
  max_weight_kg DECIMAL(10,2),
  
  -- Status
  is_occupied BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  UNIQUE(warehouse_id, location_code)
);

-- Raw Material Inventory
CREATE TABLE raw_material_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Material
  material_id UUID REFERENCES raw_materials(id),
  material_code VARCHAR(50),
  material_name VARCHAR(255),
  
  -- Location
  warehouse_id UUID REFERENCES warehouses(id),
  location_id UUID REFERENCES warehouse_locations(id),
  location_code VARCHAR(50),
  
  -- Lot Info
  lot_number VARCHAR(50) NOT NULL,
  batch_number VARCHAR(50),
  supplier_batch VARCHAR(50),
  
  -- Dates
  received_date DATE NOT NULL,
  manufacturing_date DATE,
  expiry_date DATE,
  
  -- Quantity
  received_qty DECIMAL(18,4) NOT NULL,
  current_qty DECIMAL(18,4) NOT NULL,
  reserved_qty DECIMAL(18,4) DEFAULT 0,
  available_qty DECIMAL(18,4) GENERATED ALWAYS AS (current_qty - reserved_qty) STORED,
  unit VARCHAR(20) DEFAULT 'KG',
  
  -- For Rolls/Reels
  roll_id VARCHAR(50),
  width_mm DECIMAL(10,2),
  length_m DECIMAL(18,2),
  core_id VARCHAR(50),
  
  -- Quality
  qc_status VARCHAR(50) DEFAULT 'approved',  -- pending, approved, rejected, on_hold
  coa_number VARCHAR(50),  -- Certificate of Analysis
  
  -- Cost
  unit_cost DECIMAL(10,4),
  total_value DECIMAL(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'in_stock',
  -- in_stock, reserved, issued, consumed, returned, expired, scrapped
  
  -- Supplier
  supplier_id UUID,
  po_number VARCHAR(50),
  grn_number VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_rm_inventory_material ON raw_material_inventory(material_id);
CREATE INDEX idx_rm_inventory_lot ON raw_material_inventory(lot_number);
CREATE INDEX idx_rm_inventory_status ON raw_material_inventory(status);

-- Finished Goods Inventory
CREATE TABLE finished_goods_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Product
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_name VARCHAR(255),
  
  -- Production Reference
  work_order_id UUID REFERENCES work_orders(id),
  production_roll_id UUID REFERENCES production_rolls(id),
  
  -- Location
  warehouse_id UUID REFERENCES warehouses(id),
  location_id UUID REFERENCES warehouse_locations(id),
  
  -- Lot Info
  lot_number VARCHAR(50) NOT NULL,
  production_date DATE,
  expiry_date DATE,
  
  -- Quantity
  quantity DECIMAL(18,4) NOT NULL,
  reserved_qty DECIMAL(18,4) DEFAULT 0,
  available_qty DECIMAL(18,4) GENERATED ALWAYS AS (quantity - reserved_qty) STORED,
  unit VARCHAR(20),  -- KG, PCS, ROLLS
  
  -- Roll Details (if applicable)
  roll_number VARCHAR(50),
  width_mm DECIMAL(10,2),
  length_m DECIMAL(18,2),
  weight_kg DECIMAL(10,2),
  
  -- Quality
  quality_grade VARCHAR(20) DEFAULT 'A',
  qc_status VARCHAR(50) DEFAULT 'approved',
  
  -- Customer Allocation
  customer_id UUID REFERENCES customers(id),
  sales_order_id UUID,
  
  -- Cost
  unit_cost DECIMAL(10,4),
  total_value DECIMAL(18,4),
  
  -- Status
  status VARCHAR(50) DEFAULT 'in_stock',
  -- in_stock, reserved, picked, packed, shipped
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_fg_inventory_product ON finished_goods_inventory(product_id);
CREATE INDEX idx_fg_inventory_customer ON finished_goods_inventory(customer_id);
```

---

## 7. LOT/BATCH TRACKING

### 7.1 Full Traceability

```sql
-- Lot Master (for complete traceability)
CREATE TABLE lot_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number VARCHAR(50) UNIQUE NOT NULL,
  
  -- Type
  lot_type VARCHAR(50) NOT NULL,  -- raw_material, wip, finished_goods
  
  -- Product/Material
  material_id UUID REFERENCES raw_materials(id),
  product_id UUID REFERENCES products(id),
  
  -- Production
  work_order_id UUID REFERENCES work_orders(id),
  production_date DATE,
  
  -- Supplier (for RM)
  supplier_id UUID,
  supplier_lot VARCHAR(50),
  
  -- Dates
  manufacturing_date DATE,
  expiry_date DATE,
  
  -- Total Quantity
  initial_qty DECIMAL(18,4),
  current_qty DECIMAL(18,4),
  unit VARCHAR(20),
  
  -- Quality
  qc_status VARCHAR(50),
  coa_id UUID,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',  -- active, depleted, expired, blocked
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Lot Transactions (for full traceability)
CREATE TABLE lot_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number VARCHAR(50) NOT NULL,
  
  -- Transaction Type
  transaction_type VARCHAR(50) NOT NULL,
  -- received, issued, returned, consumed, produced, transferred, adjusted, scrapped
  
  -- Quantity
  quantity DECIMAL(18,4) NOT NULL,
  balance_after DECIMAL(18,4),
  unit VARCHAR(20),
  
  -- Reference
  reference_type VARCHAR(50),  -- GRN, MR, MI, WO, SO, ADJ
  reference_number VARCHAR(50),
  reference_id UUID,
  
  -- From/To
  from_location VARCHAR(100),
  to_location VARCHAR(100),
  
  -- Work Order (for consumption)
  work_order_id UUID REFERENCES work_orders(id),
  
  -- Transaction Date
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- User
  created_by UUID,
  created_by_name VARCHAR(255),
  
  notes TEXT
);

CREATE INDEX idx_lot_trans_lot ON lot_transactions(lot_number);
CREATE INDEX idx_lot_trans_date ON lot_transactions(transaction_date);

-- Batch Traceability (links finished product to raw materials)
CREATE TABLE batch_traceability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Finished Product
  fg_lot_number VARCHAR(50) NOT NULL,
  product_id UUID REFERENCES products(id),
  work_order_id UUID REFERENCES work_orders(id),
  
  -- Raw Material Used
  rm_lot_number VARCHAR(50) NOT NULL,
  material_id UUID REFERENCES raw_materials(id),
  qty_used DECIMAL(18,4),
  
  -- Layer (for structure)
  layer_number INT,
  layer_name VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batch_trace_fg ON batch_traceability(fg_lot_number);
CREATE INDEX idx_batch_trace_rm ON batch_traceability(rm_lot_number);
```

---

## 8. STOCK MOVEMENTS

### 8.1 Stock Movement & Adjustments

```sql
-- Stock Movements
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_number VARCHAR(50) UNIQUE NOT NULL,  -- SM-2025-0001
  
  -- Type
  movement_type VARCHAR(50) NOT NULL,
  -- transfer, adjustment, scrap, return_to_supplier, return_from_customer
  
  -- From
  from_warehouse_id UUID REFERENCES warehouses(id),
  from_location_id UUID REFERENCES warehouse_locations(id),
  
  -- To
  to_warehouse_id UUID REFERENCES warehouses(id),
  to_location_id UUID REFERENCES warehouse_locations(id),
  
  -- Date
  movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, approved, completed, cancelled
  
  -- Approval
  requires_approval BOOLEAN DEFAULT false,
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- Reason
  reason TEXT,
  reference_document VARCHAR(100),
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock Movement Items
CREATE TABLE stock_movement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID REFERENCES stock_movements(id) ON DELETE CASCADE,
  
  -- Material/Product
  item_type VARCHAR(50),  -- raw_material, finished_goods
  material_id UUID REFERENCES raw_materials(id),
  product_id UUID REFERENCES products(id),
  
  -- Lot
  lot_number VARCHAR(50),
  
  -- Quantity
  quantity DECIMAL(18,4) NOT NULL,
  unit VARCHAR(20),
  
  -- Cost
  unit_cost DECIMAL(10,4),
  total_value DECIMAL(18,4),
  
  notes TEXT
);

-- Stock Adjustments
CREATE TABLE stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_number VARCHAR(50) UNIQUE NOT NULL,  -- ADJ-2025-0001
  
  -- Type
  adjustment_type VARCHAR(50) NOT NULL,
  -- physical_count, damage, expiry, write_off, correction
  
  -- Reference
  physical_count_id UUID,  -- If from stock count
  
  -- Date
  adjustment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Approval
  status VARCHAR(50) DEFAULT 'pending',
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- Reason
  reason TEXT NOT NULL,
  
  -- Total Impact
  total_adjustment_value DECIMAL(18,4),
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock Adjustment Items
CREATE TABLE stock_adjustment_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_id UUID REFERENCES stock_adjustments(id) ON DELETE CASCADE,
  
  -- Inventory Reference
  inventory_type VARCHAR(50),  -- raw_material, finished_goods
  inventory_id UUID,
  
  -- Material/Product
  material_id UUID REFERENCES raw_materials(id),
  product_id UUID REFERENCES products(id),
  
  lot_number VARCHAR(50),
  
  -- Quantity Change
  system_qty DECIMAL(18,4),
  actual_qty DECIMAL(18,4),
  adjustment_qty DECIMAL(18,4),  -- actual - system
  unit VARCHAR(20),
  
  -- Cost
  unit_cost DECIMAL(10,4),
  adjustment_value DECIMAL(18,4),
  
  reason TEXT
);

-- Reorder Points & Alerts
CREATE TABLE reorder_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES raw_materials(id) UNIQUE,
  
  -- Levels
  reorder_point DECIMAL(18,4) NOT NULL,  -- When to reorder
  reorder_qty DECIMAL(18,4) NOT NULL,    -- How much to order
  safety_stock DECIMAL(18,4),            -- Minimum to keep
  max_stock DECIMAL(18,4),               -- Maximum allowed
  
  -- Lead Time
  lead_time_days INT DEFAULT 14,
  
  -- Auto
  auto_reorder BOOLEAN DEFAULT false,
  preferred_supplier_id UUID,
  
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock Alerts
CREATE TABLE stock_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  alert_type VARCHAR(50) NOT NULL,
  -- low_stock, overstock, expiring_soon, expired, slow_moving
  
  -- Item
  material_id UUID REFERENCES raw_materials(id),
  product_id UUID REFERENCES products(id),
  lot_number VARCHAR(50),
  
  -- Details
  current_qty DECIMAL(18,4),
  threshold_qty DECIMAL(18,4),
  expiry_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'active',  -- active, acknowledged, resolved
  
  -- Action
  action_taken TEXT,
  resolved_by UUID,
  resolved_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. API SPECIFICATIONS

### Production & Inventory Routes

```
=== WORK ORDERS ===
POST   /work-orders                        Create from production order
GET    /work-orders                        List work orders
GET    /work-orders/:id                    Get work order details
PUT    /work-orders/:id                    Update work order
POST   /work-orders/:id/start              Start production
POST   /work-orders/:id/complete           Complete work order
GET    /work-orders/:id/bom                Get bill of materials
GET    /work-orders/:id/operations         Get operations list
PUT    /work-orders/:id/operations/:opId   Update operation status

=== SCHEDULING ===
GET    /scheduling/calendar                Get production calendar
POST   /scheduling/schedule                Create schedule entry
PUT    /scheduling/:id                     Update schedule
DELETE /scheduling/:id                     Remove from schedule
GET    /scheduling/machine/:machineId      Get machine schedule
GET    /scheduling/gantt                   Get Gantt chart data

=== MATERIAL REQUISITION ===
POST   /material-requisitions              Create requisition
GET    /material-requisitions              List requisitions
GET    /material-requisitions/:id          Get requisition details
POST   /material-requisitions/:id/approve  Approve requisition
POST   /material-issues                    Issue materials
GET    /material-issues/:id                Get issue details

=== PRODUCTION TRACKING ===
POST   /production-logs                    Log production
GET    /production-logs                    Get logs (with filters)
POST   /production-rolls                   Register produced roll
GET    /production-rolls/:id               Get roll details
POST   /downtime-logs                      Log downtime

=== QUALITY GATES ===
POST   /inprocess-qc                       Record QC check
GET    /inprocess-qc/work-order/:woId      Get QC records for WO
POST   /quality-holds                      Create hold
PUT    /quality-holds/:id/decision         Record decision

=== INVENTORY ===
GET    /inventory/raw-materials            List RM inventory
GET    /inventory/finished-goods           List FG inventory
GET    /inventory/stock-levels             Stock summary by material
POST   /inventory/movements                Create stock movement
POST   /inventory/adjustments              Create adjustment

=== LOT TRACKING ===
GET    /lots/:lotNumber                    Get lot details
GET    /lots/:lotNumber/transactions       Get lot history
GET    /lots/:lotNumber/traceability       Get full traceability
GET    /traceability/forward/:rmLot        Forward trace (RM → FG)
GET    /traceability/backward/:fgLot       Backward trace (FG → RM)

=== ALERTS ===
GET    /alerts/stock                       Get stock alerts
POST   /alerts/:id/acknowledge             Acknowledge alert
PUT    /reorder-settings/:materialId       Update reorder settings
```

---

## AGENT IMPLEMENTATION PROMPT

```
Create Production & Inventory modules for ProPackHub:

CONTEXT:
- Flexible packaging production: Printing → Lamination → Slitting → Pouch Making
- Must track rolls/reels through each process
- Full lot traceability from raw material to finished goods
- Real-time production logging per shift

PRODUCTION MODULE:
1. Work Order Management
   - Create from approved quotation/production order
   - Bill of Materials auto-generation
   - Operation routing per structure
   - Status tracking through stages

2. Production Scheduling
   - Machine calendar with capacity
   - Drag-drop scheduling (Gantt)
   - Shift-based planning

3. Production Tracking
   - Per-shift logging (output, waste, speed)
   - Roll registration with traceability
   - Downtime logging with reasons

4. Quality Gates
   - In-process QC checkpoints
   - Hold management
   - Release/reject workflow

INVENTORY MODULE:
1. Warehouse structure (zones, racks, bins)
2. Raw material inventory with lot tracking
3. Finished goods inventory
4. Stock movements (transfer, adjust, scrap)
5. Reorder alerts

DATABASE: Use schemas from 05-PRODUCTION-INVENTORY.md
```

---

*Continues to 06-SUPPLIER-PROCUREMENT.md for Supplier Management...*
