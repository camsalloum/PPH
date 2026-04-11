# ProPackHub - CRM Master Plan (Part 2)
## QC Analysis, Costing Engine & Quotation System

**Continued from:** PROPACKHUB_CRM_MASTER_PLAN.md

---

## PHASE 3: SAMPLE & QC WORKFLOW (Weeks 11-16)

### Week 11-13: QC Analysis Module

#### 3.1 QC Analysis Tables

```sql
-- QC Analysis Records
CREATE TABLE qc_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_number VARCHAR(50) UNIQUE NOT NULL,  -- QC-2025-0001
  
  -- Reference
  sample_id UUID REFERENCES sample_requests(id) NOT NULL,
  
  -- Assignment
  analyst_id UUID NOT NULL,
  analyst_name VARCHAR(255),
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, in_progress, completed, reviewed, approved
  
  -- Dates
  received_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_date TIMESTAMP,
  completed_date TIMESTAMP,
  
  -- Overall Assessment
  overall_result VARCHAR(20),  -- PASS, FAIL, CONDITIONAL
  
  -- Summary
  summary TEXT,
  
  -- Review
  reviewed_by UUID,
  reviewed_at TIMESTAMP,
  review_notes TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- QC Test Results
CREATE TABLE qc_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES qc_analyses(id) ON DELETE CASCADE,
  
  -- Test Definition
  test_category VARCHAR(100) NOT NULL,  -- Physical, Barrier, Print, Seal, etc.
  test_name VARCHAR(100) NOT NULL,
  test_method VARCHAR(100),  -- ASTM D882, ISO 527, etc.
  
  -- Specification
  specification_min DECIMAL(18,4),
  specification_max DECIMAL(18,4),
  specification_target DECIMAL(18,4),
  unit VARCHAR(50),
  
  -- Results (multiple readings supported)
  readings JSONB,  -- [12.5, 12.3, 12.8, 12.4, 12.6]
  average_value DECIMAL(18,4),
  std_deviation DECIMAL(18,4),
  
  -- Assessment
  result_status VARCHAR(20),  -- PASS, FAIL, MARGINAL
  
  -- Notes
  notes TEXT,
  
  -- Metadata
  tested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tested_by UUID
);

-- Standard Test Library (reusable test definitions)
CREATE TABLE test_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Test Info
  test_code VARCHAR(50) UNIQUE NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  test_category VARCHAR(100) NOT NULL,
  
  -- Method
  test_method VARCHAR(100),
  test_method_description TEXT,
  
  -- Standard Parameters (can be overridden per sample)
  default_min DECIMAL(18,4),
  default_max DECIMAL(18,4),
  default_unit VARCHAR(50),
  
  -- Applicable Product Groups
  applicable_product_groups TEXT[],
  
  -- Instructions
  procedure TEXT,
  equipment_required TEXT[],
  
  is_active BOOLEAN DEFAULT true
);

-- Seed common flexible packaging tests
INSERT INTO test_library (test_code, test_name, test_category, test_method, default_unit, applicable_product_groups) VALUES
-- Physical Tests
('THICK-001', 'Total Thickness', 'Physical', 'ASTM D374', 'micron', ARRAY['ALL']),
('TENSILE-MD', 'Tensile Strength (MD)', 'Physical', 'ASTM D882', 'MPa', ARRAY['ALL']),
('TENSILE-TD', 'Tensile Strength (TD)', 'Physical', 'ASTM D882', 'MPa', ARRAY['ALL']),
('ELONG-MD', 'Elongation at Break (MD)', 'Physical', 'ASTM D882', '%', ARRAY['ALL']),
('ELONG-TD', 'Elongation at Break (TD)', 'Physical', 'ASTM D882', '%', ARRAY['ALL']),
('DART-001', 'Dart Impact Strength', 'Physical', 'ASTM D1709', 'g', ARRAY['POUCH', 'BAG']),
('TEAR-MD', 'Tear Resistance (MD)', 'Physical', 'ASTM D1922', 'g', ARRAY['ALL']),
('TEAR-TD', 'Tear Resistance (TD)', 'Physical', 'ASTM D1922', 'g', ARRAY['ALL']),

-- Barrier Tests
('OTR-001', 'Oxygen Transmission Rate', 'Barrier', 'ASTM D3985', 'cc/m²/day', ARRAY['ALL']),
('WVTR-001', 'Water Vapor Transmission Rate', 'Barrier', 'ASTM F1249', 'g/m²/day', ARRAY['ALL']),

-- Seal Tests
('SEAL-001', 'Seal Strength', 'Seal', 'ASTM F88', 'N/15mm', ARRAY['POUCH', 'BAG']),
('BURST-001', 'Burst Pressure', 'Seal', 'ASTM F1140', 'kPa', ARRAY['POUCH']),
('LEAK-001', 'Leak Test', 'Seal', 'ASTM F2095', 'Pass/Fail', ARRAY['POUCH', 'BAG']),

-- Print Tests
('PRINT-ADH', 'Print Adhesion', 'Print', 'ASTM D3359', 'Rating', ARRAY['ALL']),
('PRINT-RUB', 'Print Rub Resistance', 'Print', 'ASTM D5264', 'Cycles', ARRAY['ALL']),
('COLOR-DE', 'Color Delta E', 'Print', 'ISO 12647', 'ΔE', ARRAY['ALL']),

-- Optical Tests  
('COF-001', 'Coefficient of Friction', 'Optical', 'ASTM D1894', 'μ', ARRAY['ALL']),
('HAZE-001', 'Haze', 'Optical', 'ASTM D1003', '%', ARRAY['ALL']),
('GLOSS-001', 'Gloss @ 60°', 'Optical', 'ASTM D2457', 'GU', ARRAY['ALL']);

-- QC Recommendations
CREATE TABLE qc_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES qc_analyses(id) ON DELETE CASCADE,
  
  recommendation_type VARCHAR(50),  -- material, structure, process, printing
  priority VARCHAR(20),  -- high, medium, low
  
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  
  -- Impact
  expected_improvement TEXT,
  cost_impact VARCHAR(50),  -- increases, decreases, neutral
  
  -- For costing
  affects_costing BOOLEAN DEFAULT false,
  suggested_material_changes JSONB,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.2 QC Workflow API Endpoints

```javascript
// QC Analysis Routes
POST   /api/qc/analyses                    // Create analysis from sample
GET    /api/qc/analyses                    // List all (with filters)
GET    /api/qc/analyses/:id                // Get analysis details
PUT    /api/qc/analyses/:id                // Update analysis

// My Workload
GET    /api/qc/my-assignments              // Analyst's pending work
GET    /api/qc/my-completed                // Analyst's completed work

// Test Results
POST   /api/qc/analyses/:id/results        // Add test result
PUT    /api/qc/analyses/:id/results/:rid   // Update test result
DELETE /api/qc/analyses/:id/results/:rid   // Delete test result

// Workflow Actions
POST   /api/qc/analyses/:id/start          // Start analysis
POST   /api/qc/analyses/:id/complete       // Complete analysis
POST   /api/qc/analyses/:id/review         // Submit for review
POST   /api/qc/analyses/:id/approve        // Approve analysis

// Recommendations
POST   /api/qc/analyses/:id/recommendations  // Add recommendation
GET    /api/qc/analyses/:id/recommendations  // Get recommendations

// Reports
GET    /api/qc/analyses/:id/report         // Generate QC report PDF

// Test Library
GET    /api/qc/test-library                // List all tests
GET    /api/qc/test-library/:category      // Tests by category
POST   /api/qc/test-library                // Add new test (admin)
```

---

## PHASE 4: COSTING & QUOTATION ENGINE (Weeks 17-22)

### Week 14-16: Cost Estimation Engine

#### 4.1 Material Master & Pricing

```sql
-- Raw Material Master
CREATE TABLE raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code VARCHAR(50) UNIQUE NOT NULL,
  material_name VARCHAR(255) NOT NULL,
  
  -- Classification
  material_category VARCHAR(100) NOT NULL,  -- Film, Adhesive, Ink, Solvent, etc.
  material_type VARCHAR(100),  -- PET, BOPP, PE, Polyurethane, etc.
  material_subtype VARCHAR(100),  -- Plain, Metallized, Coated, etc.
  
  -- Physical Properties
  density DECIMAL(8,4),  -- g/cm³
  standard_thickness_micron DECIMAL(8,2),
  
  -- Supplier Info
  primary_supplier VARCHAR(255),
  lead_time_days INT,
  moq_kg DECIMAL(10,2),
  
  -- Pricing
  standard_cost_per_kg DECIMAL(10,4),
  last_purchase_price DECIMAL(10,4),
  price_effective_date DATE,
  price_valid_until DATE,
  
  -- Price History (for trending)
  price_history JSONB DEFAULT '[]',
  
  -- Flags
  is_active BOOLEAN DEFAULT true,
  is_hazardous BOOLEAN DEFAULT false,
  requires_cold_storage BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed common flexible packaging materials
INSERT INTO raw_materials (material_code, material_name, material_category, material_type, density, standard_cost_per_kg) VALUES
-- Films
('PET-12', 'PET Film 12 micron', 'Film', 'PET', 1.40, 2.50),
('PET-12M', 'Metallized PET 12 micron', 'Film', 'PET', 1.45, 3.20),
('BOPP-20', 'BOPP Film 20 micron', 'Film', 'BOPP', 0.91, 1.80),
('BOPP-20M', 'Metallized BOPP 20 micron', 'Film', 'BOPP', 0.95, 2.50),
('NY-15', 'Nylon Film 15 micron', 'Film', 'PA', 1.14, 4.50),
('PE-50', 'LDPE Sealant 50 micron', 'Film', 'PE', 0.92, 1.60),
('PE-70', 'LDPE Sealant 70 micron', 'Film', 'PE', 0.92, 1.60),
('LLDPE-50', 'LLDPE Sealant 50 micron', 'Film', 'PE', 0.92, 1.70),
('CPP-25', 'CPP Film 25 micron', 'Film', 'PP', 0.90, 1.90),
('CPP-30', 'CPP Film 30 micron', 'Film', 'PP', 0.90, 1.90),
('ALU-7', 'Aluminum Foil 7 micron', 'Film', 'ALU', 2.70, 8.50),
('ALU-9', 'Aluminum Foil 9 micron', 'Film', 'ALU', 2.70, 8.50),

-- Adhesives
('ADH-SF', 'Solvent-Free Adhesive', 'Adhesive', 'Polyurethane', 1.10, 6.00),
('ADH-SB', 'Solvent-Based Adhesive', 'Adhesive', 'Polyurethane', 1.05, 5.00),
('ADH-WB', 'Water-Based Adhesive', 'Adhesive', 'Acrylic', 1.02, 3.50),

-- Inks
('INK-NC', 'NC Ink Base', 'Ink', 'Nitrocellulose', 1.00, 12.00),
('INK-PU', 'PU Ink Base', 'Ink', 'Polyurethane', 1.00, 15.00),
('INK-WB', 'Water-Based Ink', 'Ink', 'Acrylic', 1.00, 10.00);

-- Process Cost Rates
CREATE TABLE process_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_code VARCHAR(50) UNIQUE NOT NULL,
  process_name VARCHAR(255) NOT NULL,
  
  -- Type
  process_type VARCHAR(100),  -- Printing, Lamination, Slitting, Pouch Making, etc.
  
  -- Costing
  hourly_rate DECIMAL(10,2),  -- Machine hour rate
  setup_cost DECIMAL(10,2),   -- Per job setup
  min_order_charge DECIMAL(10,2),
  
  -- Capacity
  standard_speed DECIMAL(10,2),  -- meters/min or pcs/min
  speed_unit VARCHAR(20),
  
  -- Waste factors
  setup_waste_pct DECIMAL(5,2) DEFAULT 3.00,
  running_waste_pct DECIMAL(5,2) DEFAULT 2.00,
  
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO process_rates (process_code, process_name, process_type, hourly_rate, setup_cost, standard_speed, speed_unit) VALUES
('PRINT-FLEXO', 'Flexographic Printing', 'Printing', 150.00, 200.00, 150, 'm/min'),
('PRINT-GRAVURE', 'Gravure Printing', 'Printing', 200.00, 500.00, 200, 'm/min'),
('LAM-DRY', 'Dry Lamination', 'Lamination', 120.00, 100.00, 180, 'm/min'),
('LAM-SF', 'Solventless Lamination', 'Lamination', 130.00, 80.00, 250, 'm/min'),
('LAM-EXT', 'Extrusion Lamination', 'Lamination', 180.00, 150.00, 200, 'm/min'),
('SLIT-001', 'Slitting & Rewinding', 'Slitting', 80.00, 50.00, 300, 'm/min'),
('POUCH-3S', '3-Side Seal Pouch Making', 'Pouch Making', 100.00, 80.00, 80, 'pcs/min'),
('POUCH-STAND', 'Stand-Up Pouch Making', 'Pouch Making', 120.00, 120.00, 50, 'pcs/min'),
('POUCH-ZIPPER', 'Zipper Pouch Making', 'Pouch Making', 140.00, 150.00, 40, 'pcs/min');

-- Overhead & Margin Settings
CREATE TABLE costing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  setting_category VARCHAR(100) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value DECIMAL(10,4) NOT NULL,
  setting_unit VARCHAR(50),
  description TEXT,
  
  UNIQUE(setting_category, setting_key)
);

INSERT INTO costing_settings (setting_category, setting_key, setting_value, setting_unit, description) VALUES
('overhead', 'factory_overhead_pct', 15.00, '%', 'Factory overhead as % of direct cost'),
('overhead', 'admin_overhead_pct', 5.00, '%', 'Admin overhead as % of direct cost'),
('margin', 'default_margin_pct', 20.00, '%', 'Default profit margin'),
('margin', 'min_margin_pct', 10.00, '%', 'Minimum allowed margin'),
('waste', 'cylinder_amortization_runs', 3.00, 'runs', 'Number of runs to amortize cylinder'),
('waste', 'plate_amortization_runs', 1.00, 'runs', 'Number of runs to amortize plates'),
('packaging', 'core_cost_per_kg', 0.50, 'USD/kg', 'Paper core cost'),
('packaging', 'pallet_cost', 15.00, 'USD', 'Cost per pallet'),
('packaging', 'shrink_wrap_per_pallet', 2.00, 'USD', 'Shrink wrap per pallet');
```

#### 4.2 Cost Estimation Tables

```sql
-- Cost Estimations
CREATE TABLE cost_estimations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimation_number VARCHAR(50) UNIQUE NOT NULL,  -- EST-2025-0001
  
  -- References
  sample_id UUID REFERENCES sample_requests(id),
  inquiry_id UUID REFERENCES inquiries(id),
  product_id UUID REFERENCES products(id),
  customer_id UUID REFERENCES customers(id),
  
  -- Product Info (snapshot)
  product_description TEXT,
  structure_snapshot JSONB,  -- Full structure at time of estimation
  
  -- Dimensions
  width_mm DECIMAL(10,2) NOT NULL,
  length_mm DECIMAL(10,2),
  gusset_mm DECIMAL(10,2),
  
  -- Quantity Scenarios
  quantity_scenarios JSONB NOT NULL,
  -- [
  --   {qty: 5000, unit: 'KG', is_primary: true},
  --   {qty: 10000, unit: 'KG', is_primary: false},
  --   {qty: 25000, unit: 'KG', is_primary: false}
  -- ]
  
  -- Calculated Values (per primary quantity)
  total_material_cost DECIMAL(18,4),
  total_ink_cost DECIMAL(18,4),
  total_adhesive_cost DECIMAL(18,4),
  total_process_cost DECIMAL(18,4),
  total_setup_cost DECIMAL(18,4),
  total_wastage_cost DECIMAL(18,4),
  total_overhead DECIMAL(18,4),
  total_packaging_cost DECIMAL(18,4),
  total_direct_cost DECIMAL(18,4),
  
  -- Per Unit Costs
  cost_per_kg DECIMAL(10,4),
  cost_per_sqm DECIMAL(10,4),
  cost_per_piece DECIMAL(10,6),
  
  -- Pricing
  suggested_price_per_kg DECIMAL(10,4),
  margin_pct DECIMAL(5,2),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_review, approved, converted_to_quote, expired
  
  -- Validity
  valid_until DATE,
  
  -- Approval
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- Notes
  notes TEXT,
  internal_notes TEXT,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cost Breakdown Details
CREATE TABLE cost_breakdown (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimation_id UUID REFERENCES cost_estimations(id) ON DELETE CASCADE,
  
  -- Category
  cost_category VARCHAR(100) NOT NULL,
  -- material, ink, adhesive, process, setup, cylinder, plate, waste, overhead, packaging
  
  -- Item Details
  item_code VARCHAR(100),
  item_description VARCHAR(255) NOT NULL,
  
  -- Calculation
  quantity DECIMAL(18,4),
  unit VARCHAR(50),
  rate DECIMAL(18,4),
  rate_unit VARCHAR(50),
  
  amount DECIMAL(18,4) NOT NULL,
  
  -- For quantity breaks
  quantity_scenario INT DEFAULT 1,  -- 1, 2, 3 for different qty scenarios
  
  -- Calculation method
  calculation_notes TEXT,
  
  display_order INT
);

-- Pricing Tiers (for quantity breaks in quotes)
CREATE TABLE pricing_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimation_id UUID REFERENCES cost_estimations(id) ON DELETE CASCADE,
  
  tier_number INT NOT NULL,
  min_quantity DECIMAL(18,2) NOT NULL,
  max_quantity DECIMAL(18,2),
  quantity_unit VARCHAR(20) NOT NULL,
  
  cost_per_unit DECIMAL(10,4) NOT NULL,
  price_per_unit DECIMAL(10,4) NOT NULL,
  margin_pct DECIMAL(5,2),
  
  lead_time_days INT,
  
  UNIQUE(estimation_id, tier_number)
);
```

#### 4.3 Cost Calculation Engine (Service)

```javascript
// server/services/CostingEngine.js

class CostingEngine {
  /**
   * Calculate complete cost for a flexible packaging product
   */
  async calculateCost(params) {
    const {
      structure,      // Array of layers
      dimensions,     // {width_mm, length_mm, gusset_mm}
      printing,       // {type, colors, repeat_length}
      features,       // {zipper, spout, valve, etc.}
      quantities,     // Array of quantities to calculate
      processType     // 'roll_stock' or 'pouches'
    } = params;

    const results = [];

    for (const qty of quantities) {
      const breakdown = [];
      
      // 1. Material Cost
      const materialCost = await this.calculateMaterialCost(
        structure, dimensions, qty, breakdown
      );
      
      // 2. Ink Cost
      const inkCost = await this.calculateInkCost(
        printing, dimensions, qty, breakdown
      );
      
      // 3. Adhesive Cost (for laminated structures)
      const adhesiveCost = await this.calculateAdhesiveCost(
        structure, dimensions, qty, breakdown
      );
      
      // 4. Process Costs
      const processCost = await this.calculateProcessCost(
        processType, printing, structure.length, qty, breakdown
      );
      
      // 5. Setup Costs (cylinders, plates, etc.)
      const setupCost = await this.calculateSetupCost(
        printing, features, breakdown
      );
      
      // 6. Feature Costs (zipper, spout, etc.)
      const featureCost = await this.calculateFeatureCost(
        features, qty, breakdown
      );
      
      // 7. Wastage
      const wasteCost = await this.calculateWastage(
        materialCost + inkCost + adhesiveCost,
        processType,
        qty,
        breakdown
      );
      
      // 8. Packaging Cost
      const packagingCost = await this.calculatePackaging(
        qty, processType, breakdown
      );
      
      // 9. Overhead
      const directCost = materialCost + inkCost + adhesiveCost + 
                         processCost + setupCost + featureCost + 
                         wasteCost + packagingCost;
      const overhead = await this.calculateOverhead(directCost, breakdown);
      
      // 10. Final Calculations
      const totalCost = directCost + overhead;
      const sqm = (dimensions.width_mm * dimensions.length_mm) / 1000000;
      
      results.push({
        quantity: qty,
        breakdown,
        totals: {
          material: materialCost,
          ink: inkCost,
          adhesive: adhesiveCost,
          process: processCost,
          setup: setupCost,
          features: featureCost,
          waste: wasteCost,
          packaging: packagingCost,
          overhead: overhead,
          totalCost: totalCost,
          costPerKg: totalCost / qty,
          costPerSqm: totalCost / (qty / this.calculateGSM(structure) * sqm),
          costPerPiece: processType === 'pouches' 
            ? totalCost / this.calculatePiecesFromKg(qty, structure, dimensions)
            : null
        }
      });
    }

    return results;
  }

  async calculateMaterialCost(structure, dimensions, qty, breakdown) {
    let totalMaterialCost = 0;

    for (const layer of structure) {
      const material = await this.getMaterial(layer.material_code);
      
      // GSM = thickness (micron) × density
      const gsm = layer.thickness_micron * material.density;
      
      // Material required (kg) = GSM × area (m²) 
      const areaPerKg = 1000 / gsm;  // m² per kg
      const materialKg = qty;  // Assuming qty is in kg of finished product
      
      // Actually, we need to calculate based on structure contribution
      const layerCost = materialKg * (gsm / this.totalGSM(structure)) * material.standard_cost_per_kg;
      
      breakdown.push({
        category: 'material',
        item_code: material.material_code,
        item_description: `${material.material_name} - Layer ${layer.layer_number}`,
        quantity: materialKg * (gsm / this.totalGSM(structure)),
        unit: 'kg',
        rate: material.standard_cost_per_kg,
        rate_unit: 'USD/kg',
        amount: layerCost
      });
      
      totalMaterialCost += layerCost;
    }

    return totalMaterialCost;
  }

  async calculateInkCost(printing, dimensions, qty, breakdown) {
    if (!printing || printing.colors === 0) return 0;

    // Ink consumption: approximately 2-4 gsm per color depending on coverage
    const inkGsmPerColor = 2.5;
    const inkCostPerKg = 15.00;  // Average ink cost
    
    const totalInkGsm = printing.colors * inkGsmPerColor;
    const inkKg = qty * (totalInkGsm / 1000);  // Simplified calculation
    const inkCost = inkKg * inkCostPerKg;

    breakdown.push({
      category: 'ink',
      item_description: `Printing Ink - ${printing.colors} colors`,
      quantity: inkKg,
      unit: 'kg',
      rate: inkCostPerKg,
      rate_unit: 'USD/kg',
      amount: inkCost
    });

    return inkCost;
  }

  // ... Additional calculation methods ...
}

module.exports = new CostingEngine();
```

### Week 17-19: Quotation Generator

```sql
-- Quotations
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number VARCHAR(50) UNIQUE NOT NULL,  -- QT-2025-0001
  quote_version INT DEFAULT 1,
  parent_quote_id UUID REFERENCES quotations(id),  -- For revisions
  
  -- Customer
  customer_id UUID REFERENCES customers(id) NOT NULL,
  contact_id UUID REFERENCES customer_contacts(id),
  
  -- References
  inquiry_id UUID REFERENCES inquiries(id),
  sample_id UUID REFERENCES sample_requests(id),
  estimation_id UUID REFERENCES cost_estimations(id),
  
  -- Dates
  quote_date DATE DEFAULT CURRENT_DATE,
  valid_until DATE NOT NULL,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',
  -- draft, pending_approval, sent, under_negotiation, accepted, rejected, expired, superseded
  
  -- Totals
  subtotal DECIMAL(18,2),
  discount_amount DECIMAL(18,2) DEFAULT 0,
  discount_pct DECIMAL(5,2) DEFAULT 0,
  tax_amount DECIMAL(18,2) DEFAULT 0,
  total_amount DECIMAL(18,2),
  
  currency_code VARCHAR(3) DEFAULT 'USD',
  exchange_rate DECIMAL(10,6) DEFAULT 1,
  
  -- Terms
  payment_terms VARCHAR(100),
  delivery_terms VARCHAR(100),  -- Ex-Works, FOB, CIF, etc.
  lead_time_days INT,
  moq_kg DECIMAL(18,2),
  moq_pcs INT,
  
  -- Validity
  price_validity_days INT DEFAULT 30,
  
  -- Document
  notes_to_customer TEXT,
  internal_notes TEXT,
  terms_and_conditions TEXT,
  
  -- PDF
  pdf_url TEXT,
  pdf_generated_at TIMESTAMP,
  
  -- Sent tracking
  sent_at TIMESTAMP,
  sent_by UUID,
  sent_to_emails TEXT[],
  opened_at TIMESTAMP,  -- Email tracking
  
  -- Approval (internal)
  requires_approval BOOLEAN DEFAULT false,
  approval_status VARCHAR(50),  -- pending, approved, rejected
  approved_by UUID,
  approved_at TIMESTAMP,
  approval_notes TEXT,
  
  -- Customer Response
  customer_response_date TIMESTAMP,
  customer_response_notes TEXT,
  
  -- Won/Lost
  won_date TIMESTAMP,
  lost_reason VARCHAR(255),
  competitor_name VARCHAR(255),
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quotation Line Items
CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  
  -- Product
  product_id UUID REFERENCES products(id),
  product_code VARCHAR(50),
  product_description TEXT NOT NULL,
  
  -- Specifications
  structure_summary VARCHAR(255),  -- "PET12/Ink/ALU7/PE70"
  dimensions VARCHAR(100),         -- "200mm x 300mm"
  specifications JSONB,
  
  -- Quantity & Pricing
  quantity DECIMAL(18,2) NOT NULL,
  quantity_unit VARCHAR(20) NOT NULL,  -- KG, PCS, ROLLS
  
  unit_price DECIMAL(10,4) NOT NULL,
  unit_price_unit VARCHAR(20),  -- per KG, per 1000 PCS
  
  -- Alternative quantities/prices (shown as table)
  price_breaks JSONB,
  -- [
  --   {min_qty: 1000, max_qty: 4999, price: 5.50},
  --   {min_qty: 5000, max_qty: 9999, price: 5.20},
  --   {min_qty: 10000, max_qty: null, price: 4.90}
  -- ]
  
  -- Totals
  line_total DECIMAL(18,2),
  
  -- Lead time for this specific item
  lead_time_days INT,
  
  -- Notes
  notes TEXT,
  
  UNIQUE(quotation_id, line_number)
);

-- Quotation History (for revisions)
CREATE TABLE quotation_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  
  version_number INT NOT NULL,
  revision_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- What changed
  change_summary TEXT NOT NULL,
  changes_detail JSONB,  -- Detailed field-by-field changes
  
  -- Snapshot of quote at this version
  quote_snapshot JSONB,
  
  revised_by UUID,
  
  UNIQUE(quotation_id, version_number)
);
```

### Week 20-21: Negotiation & Approval Workflow

```sql
-- Negotiations
CREATE TABLE negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES quotations(id) ON DELETE CASCADE,
  
  negotiation_round INT NOT NULL DEFAULT 1,
  negotiation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Participants
  our_participant_id UUID,
  our_participant_name VARCHAR(255),
  customer_participant VARCHAR(255),
  
  -- Type
  negotiation_type VARCHAR(50),  -- call, meeting, email, whatsapp
  
  -- Discussion Points
  discussion_summary TEXT,
  
  -- Customer Requests
  requested_changes JSONB,
  -- [
  --   {type: 'price', current: 5.50, requested: 5.00, notes: 'Competitor quoted 5.10'},
  --   {type: 'quantity', current: 5000, requested: 3000, notes: 'Trial order first'},
  --   {type: 'payment', current: 'Net 30', requested: 'Net 60'}
  -- ]
  
  -- Our Response
  our_response JSONB,
  -- [
  --   {type: 'price', approved: 5.20, notes: 'Best price for 10000+ kg'},
  --   {type: 'quantity', approved: 3000, notes: 'MOQ exception for trial'}
  -- ]
  
  -- Outcome
  outcome VARCHAR(50),  -- positive, neutral, stalled, negative
  next_steps TEXT,
  next_action_date DATE,
  
  -- Attachments
  attachments JSONB DEFAULT '[]',
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Customer Approvals (when customer accepts quote)
CREATE TABLE customer_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID REFERENCES quotations(id) NOT NULL,
  
  approval_type VARCHAR(50),  -- verbal, email, po_received, signed_quote
  approval_date TIMESTAMP NOT NULL,
  
  -- Who approved
  customer_contact_id UUID REFERENCES customer_contacts(id),
  approver_name VARCHAR(255),
  approver_email VARCHAR(255),
  approver_phone VARCHAR(50),
  
  -- Order details
  approved_quantity DECIMAL(18,2),
  approved_amount DECIMAL(18,2),
  
  -- PO Details
  customer_po_number VARCHAR(100),
  customer_po_date DATE,
  customer_po_file_url TEXT,
  
  -- Terms confirmed
  confirmed_delivery_date DATE,
  confirmed_payment_terms VARCHAR(100),
  special_instructions TEXT,
  
  -- Verification
  verified_by UUID,
  verified_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## PHASE 5: PRODUCTION INTEGRATION (Weeks 23-28)

### Week 22-24: Production Order Handoff

```sql
-- Production Orders (created from approved quotes)
CREATE TABLE production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number VARCHAR(50) UNIQUE NOT NULL,  -- PO-2025-0001
  
  -- Source
  quotation_id UUID REFERENCES quotations(id),
  customer_approval_id UUID REFERENCES customer_approvals(id),
  
  -- Customer
  customer_id UUID REFERENCES customers(id) NOT NULL,
  customer_po_number VARCHAR(100),
  
  -- Product
  product_id UUID REFERENCES products(id),
  sample_id UUID REFERENCES sample_requests(id),
  tds_id UUID REFERENCES tds_documents(id),
  
  -- Order Details
  quantity DECIMAL(18,2) NOT NULL,
  quantity_unit VARCHAR(20) NOT NULL,
  
  -- Pricing
  unit_price DECIMAL(10,4),
  total_value DECIMAL(18,2),
  
  -- Dates
  order_date DATE DEFAULT CURRENT_DATE,
  required_date DATE NOT NULL,
  promised_date DATE,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  -- pending, confirmed, scheduled, in_production, quality_check, 
  -- ready_to_ship, partially_shipped, shipped, delivered, closed
  
  priority VARCHAR(20) DEFAULT 'normal',  -- urgent, high, normal, low
  
  -- Artwork
  artwork_status VARCHAR(50),  -- pending, received, approved
  artwork_files JSONB DEFAULT '[]',
  artwork_approved_by UUID,
  artwork_approved_at TIMESTAMP,
  
  -- Production Assignment
  assigned_to_bu VARCHAR(100),  -- Business unit (Interplast = FP)
  production_notes TEXT,
  
  -- Delivery
  delivery_address_id UUID REFERENCES customer_addresses(id),
  shipping_method VARCHAR(100),
  
  -- Completion
  actual_quantity_produced DECIMAL(18,2),
  production_completed_at TIMESTAMP,
  dispatched_at TIMESTAMP,
  delivered_at TIMESTAMP,
  
  created_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Production Status Log
CREATE TABLE production_status_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID REFERENCES production_orders(id) ON DELETE CASCADE,
  
  from_status VARCHAR(50),
  to_status VARCHAR(50) NOT NULL,
  
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  changed_by UUID,
  changed_by_name VARCHAR(255),
  
  notes TEXT,
  
  -- For tracking purposes
  quantity_at_change DECIMAL(18,2),
  stage_duration_hours DECIMAL(10,2)  -- How long in previous stage
);

-- Customer Feedback (post-delivery)
CREATE TABLE customer_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_order_id UUID REFERENCES production_orders(id),
  sample_id UUID REFERENCES sample_requests(id),
  
  feedback_date DATE DEFAULT CURRENT_DATE,
  feedback_type VARCHAR(50),  -- sample_approval, production_feedback, quality_issue
  
  -- Ratings (1-5)
  overall_rating INT,
  print_quality_rating INT,
  material_quality_rating INT,
  packaging_rating INT,
  delivery_rating INT,
  
  -- Assessment
  specifications_met BOOLEAN,
  
  -- Issues
  issues_reported TEXT,
  requested_changes TEXT,
  
  -- Approval
  approval_status VARCHAR(50),  -- approved, conditional, rejected
  approval_notes TEXT,
  
  -- Follow-up
  requires_follow_up BOOLEAN DEFAULT false,
  follow_up_notes TEXT,
  follow_up_completed BOOLEAN DEFAULT false,
  
  -- Who provided feedback
  feedback_by_name VARCHAR(255),
  feedback_by_contact VARCHAR(255),
  
  recorded_by UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

## PHASE 6: ANALYTICS & AI (Weeks 29-32)

### Enhanced Dashboard Views

```sql
-- Dashboard Widgets Configuration
CREATE TABLE dashboard_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  widget_code VARCHAR(50) UNIQUE NOT NULL,
  widget_name VARCHAR(255) NOT NULL,
  widget_type VARCHAR(50),  -- kpi, chart, table, funnel, calendar
  
  -- Data source
  data_source VARCHAR(100),  -- SQL view or API endpoint
  refresh_interval_seconds INT DEFAULT 300,
  
  -- Configuration
  config JSONB,
  
  -- Access
  allowed_roles TEXT[],
  
  is_active BOOLEAN DEFAULT true
);

-- CRM Funnel View
CREATE VIEW crm_pipeline_summary AS
SELECT 
  'leads' as stage,
  1 as stage_order,
  COUNT(*) as count,
  0 as value
FROM leads WHERE status NOT IN ('won', 'lost')
UNION ALL
SELECT 
  'inquiries' as stage,
  2 as stage_order,
  COUNT(*) as count,
  0 as value
FROM inquiries WHERE status NOT IN ('won', 'lost')
UNION ALL
SELECT 
  'samples' as stage,
  3 as stage_order,
  COUNT(*) as count,
  0 as value
FROM sample_requests WHERE status NOT IN ('customer_approved', 'customer_rejected')
UNION ALL
SELECT 
  'quotations' as stage,
  4 as stage_order,
  COUNT(*) as count,
  COALESCE(SUM(total_amount), 0) as value
FROM quotations WHERE status IN ('sent', 'under_negotiation')
UNION ALL
SELECT 
  'production' as stage,
  5 as stage_order,
  COUNT(*) as count,
  COALESCE(SUM(total_value), 0) as value
FROM production_orders WHERE status NOT IN ('shipped', 'delivered', 'closed')
ORDER BY stage_order;

-- Sales Rep Performance View
CREATE VIEW sales_rep_crm_performance AS
SELECT 
  u.id as sales_rep_id,
  u.full_name as sales_rep_name,
  
  -- Lead metrics
  COUNT(DISTINCT l.id) FILTER (WHERE l.created_at >= CURRENT_DATE - INTERVAL '30 days') as leads_30d,
  COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'won' AND l.created_at >= CURRENT_DATE - INTERVAL '30 days') as leads_won_30d,
  
  -- Quote metrics
  COUNT(DISTINCT q.id) FILTER (WHERE q.quote_date >= CURRENT_DATE - INTERVAL '30 days') as quotes_30d,
  COALESCE(SUM(q.total_amount) FILTER (WHERE q.quote_date >= CURRENT_DATE - INTERVAL '30 days'), 0) as quote_value_30d,
  
  -- Win rate
  ROUND(
    COUNT(DISTINCT q.id) FILTER (WHERE q.status = 'accepted')::DECIMAL / 
    NULLIF(COUNT(DISTINCT q.id) FILTER (WHERE q.status IN ('accepted', 'rejected')), 0) * 100,
    1
  ) as win_rate_pct,
  
  -- Active customers
  COUNT(DISTINCT c.id) FILTER (WHERE c.customer_type = 'active') as active_customers
  
FROM users u
LEFT JOIN leads l ON l.assigned_to = u.id
LEFT JOIN quotations q ON q.created_by = u.id
LEFT JOIN customers c ON c.sales_rep_id = u.id
WHERE u.role IN ('sales_rep', 'sales_manager')
GROUP BY u.id, u.full_name;
```

---

## API SPECIFICATIONS

### Complete API Route Map

```
BASE URL: https://api.propackhub.com/v1
AUTH: Bearer JWT Token
TENANT: Resolved from subdomain or X-Tenant-ID header

=== AUTHENTICATION ===
POST   /auth/login                         Login
POST   /auth/logout                        Logout
POST   /auth/refresh                       Refresh token
GET    /auth/me                            Current user info

=== CUSTOMERS ===
POST   /customers                          Create customer
GET    /customers                          List customers
GET    /customers/:id                      Get customer
PUT    /customers/:id                      Update customer
DELETE /customers/:id                      Deactivate customer
GET    /customers/:id/timeline             Customer activity timeline
GET    /customers/:id/analytics            Customer analytics

=== CONTACTS ===
POST   /customers/:id/contacts             Add contact
GET    /customers/:id/contacts             List contacts
PUT    /customers/:id/contacts/:cid        Update contact
DELETE /customers/:id/contacts/:cid        Remove contact

=== LEADS ===
POST   /leads                              Create lead
GET    /leads                              List leads
GET    /leads/:id                          Get lead
PUT    /leads/:id                          Update lead
POST   /leads/:id/convert                  Convert to customer
POST   /leads/:id/interactions             Log interaction

=== INQUIRIES ===
POST   /inquiries                          Create inquiry
GET    /inquiries                          List inquiries
GET    /inquiries/:id                      Get inquiry
PUT    /inquiries/:id                      Update inquiry
POST   /inquiries/:id/feasibility          Record feasibility

=== SAMPLES ===
POST   /samples                            Create sample request
GET    /samples                            List samples
GET    /samples/:id                        Get sample
PUT    /samples/:id                        Update sample
POST   /samples/:id/approve                Internal approval
POST   /samples/:id/assign-qc              Assign to QC
GET    /samples/:id/specifications         Get specifications
POST   /samples/:id/specifications         Add specification

=== QC ANALYSIS ===
POST   /qc/analyses                        Create analysis
GET    /qc/analyses                        List analyses
GET    /qc/analyses/:id                    Get analysis
POST   /qc/analyses/:id/results            Add test result
POST   /qc/analyses/:id/complete           Complete analysis
GET    /qc/my-assignments                  My pending work
GET    /qc/test-library                    Available tests

=== PRODUCTS ===
GET    /product-groups                     List product groups
GET    /products                           List products
POST   /products                           Create product
GET    /products/:id                       Get product
PUT    /products/:id                       Update product
GET    /products/:id/tds                   Get TDS

=== TDS ===
POST   /tds                                Create TDS
GET    /tds/:id                            Get TDS
PUT    /tds/:id                            Update TDS
GET    /tds/:id/pdf                        Download PDF

=== COSTING ===
POST   /estimations                        Create estimation
GET    /estimations                        List estimations
GET    /estimations/:id                    Get estimation
PUT    /estimations/:id                    Update estimation
POST   /estimations/:id/calculate          Recalculate costs
POST   /estimations/:id/approve            Approve estimation

=== MATERIALS ===
GET    /materials                          List raw materials
POST   /materials                          Add material
PUT    /materials/:id                      Update material
PUT    /materials/:id/price                Update price

=== QUOTATIONS ===
POST   /quotations                         Create quotation
GET    /quotations                         List quotations
GET    /quotations/:id                     Get quotation
PUT    /quotations/:id                     Update quotation
POST   /quotations/:id/send                Send to customer
POST   /quotations/:id/revise              Create revision
GET    /quotations/:id/pdf                 Download PDF

=== NEGOTIATIONS ===
POST   /quotations/:id/negotiations        Log negotiation
GET    /quotations/:id/negotiations        Get negotiations

=== APPROVALS ===
POST   /quotations/:id/customer-approval   Record approval
GET    /approvals/pending                  My pending approvals

=== PRODUCTION ORDERS ===
POST   /production-orders                  Create from quote
GET    /production-orders                  List orders
GET    /production-orders/:id              Get order
PUT    /production-orders/:id/status       Update status
POST   /production-orders/:id/feedback     Add feedback

=== DASHBOARD ===
GET    /dashboard/sales                    Sales dashboard
GET    /dashboard/pipeline                 CRM pipeline
GET    /dashboard/qc                       QC dashboard
GET    /dashboard/production               Production dashboard

=== REPORTS ===
GET    /reports/conversion-funnel          Lead to order funnel
GET    /reports/sample-turnaround          Sample TAT report
GET    /reports/quote-win-rate             Quote success rate
GET    /reports/sales-rep-performance      Sales rep metrics
```

---

## DEPLOYMENT STRATEGY

### SaaS Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ProPackHub Production                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  CDN/Edge   │────│  WAF/DDoS   │────│   Nginx     │         │
│  │ (CloudFlare)│    │ Protection  │    │   Proxy     │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│                                                │                 │
│                                       ┌────────┴────────┐       │
│                                       ▼                 ▼       │
│                              ┌─────────────┐   ┌─────────────┐  │
│                              │   App #1    │   │   App #2    │  │
│                              │  (Node.js)  │   │  (Node.js)  │  │
│                              └──────┬──────┘   └──────┬──────┘  │
│                                     │                 │         │
│                              ┌──────┴─────────────────┴──────┐  │
│                              │        Load Balancer          │  │
│                              └──────────────┬────────────────┘  │
│                                             │                   │
│         ┌───────────────────┬───────────────┼───────────────┐  │
│         ▼                   ▼               ▼               │  │
│  ┌─────────────┐    ┌─────────────┐  ┌─────────────┐       │  │
│  │  PostgreSQL │    │    Redis    │  │     S3      │       │  │
│  │  (Primary)  │    │   Cluster   │  │   Storage   │       │  │
│  └──────┬──────┘    └─────────────┘  └─────────────┘       │  │
│         │                                                    │  │
│         ▼                                                    │  │
│  ┌─────────────┐                                            │  │
│  │  PostgreSQL │                                            │  │
│  │  (Replica)  │                                            │  │
│  └─────────────┘                                            │  │
│                                                              │  │
└─────────────────────────────────────────────────────────────────┘
```

### Tenant Provisioning Script

```javascript
// scripts/provision-tenant.js

async function provisionTenant(tenantData) {
  const { tenantCode, companyName, adminEmail, adminName, subdomain } = tenantData;
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Create tenant record
    const tenantResult = await client.query(`
      INSERT INTO system.tenants (tenant_code, company_name, subdomain)
      VALUES ($1, $2, $3)
      RETURNING id
    `, [tenantCode, companyName, subdomain]);
    
    const tenantId = tenantResult.rows[0].id;
    
    // 2. Create tenant schema
    const schemaName = `tenant_${tenantCode}`;
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
    
    // 3. Run migrations for tenant schema
    await runTenantMigrations(client, schemaName);
    
    // 4. Create admin user
    const passwordHash = await bcrypt.hash(generateSecurePassword(), 10);
    await client.query(`
      INSERT INTO ${schemaName}.users (email, password_hash, full_name, role, is_admin)
      VALUES ($1, $2, $3, 'admin', true)
    `, [adminEmail, passwordHash, adminName]);
    
    // 5. Seed initial data (product groups, test library, etc.)
    await seedTenantData(client, schemaName);
    
    await client.query('COMMIT');
    
    // 6. Send welcome email with credentials
    await sendWelcomeEmail(adminEmail, subdomain, tempPassword);
    
    return { success: true, tenantId, subdomain };
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## IMPLEMENTATION TIMELINE SUMMARY

| Phase | Weeks | Modules | Deliverables |
|-------|-------|---------|--------------|
| **1** | 1-4 | Multi-Tenant, Customer Master | SaaS infrastructure, Customer CRM |
| **2** | 5-10 | Products, Leads, Inquiries, Samples | Full CRM pipeline |
| **3** | 11-16 | QC Analysis, Test Library | Quality workflow |
| **4** | 17-22 | Costing, Quotation, Negotiation | Pricing engine |
| **5** | 23-28 | Production Orders, Feedback | Order fulfillment |
| **6** | 29-32 | Dashboards, Analytics, AI | Business intelligence |

---

## CONCLUSION

This master plan provides a complete roadmap for building **ProPackHub** - a comprehensive SaaS platform for the flexible packaging industry. The plan:

1. **Leverages existing assets** (product groups, AI learning, sales rep structure)
2. **Follows industry best practices** from Odoo and ERPNext CRM modules
3. **Is specifically designed** for flexible packaging workflows
4. **Supports multi-tenant SaaS** from day one
5. **Prioritizes correctly** - CRM first, then TDS/Costing, then Production

### Recommended Starting Point

Based on your current state:

1. **Week 1-2:** Implement multi-tenant infrastructure
2. **Week 3-4:** Build Customer Master (extends existing customer analytics)
3. **Week 5-6:** Extend product groups to full Product Catalog with TDS templates
4. **Week 7-10:** Add Lead, Inquiry, Sample modules

By Week 10, you'll have a functional CRM that can be shown to potential customers.

---

**Document prepared for ProPackHub development team.**  
**First customer: Interplast Industries - FP Division**
