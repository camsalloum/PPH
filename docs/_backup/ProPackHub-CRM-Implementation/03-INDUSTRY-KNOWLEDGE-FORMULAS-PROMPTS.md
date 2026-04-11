# ProPackHub - CRM Master Plan (Part 3)
## Flexible Packaging Specifics, Structure Builder & Agent Prompts

**Continued from:** PROPACKHUB_CRM_MASTER_PLAN_PART2.md

---

## FLEXIBLE PACKAGING INDUSTRY SPECIFICS

### Understanding Flexible Packaging - Essential Knowledge

Before implementing the CRM, agents must understand the flexible packaging industry:

#### Product Types

| Product Type | Description | Key Specs |
|--------------|-------------|-----------|
| **Pouches** | Stand-up, 3-side seal, center seal, retort | Seal strength, barrier, dimensions |
| **Roll Stock** | VFFS, HFFS, flow wrap, form-fill-seal | Web handling, registration, tension |
| **Bags** | Shopping bags, heavy-duty, industrial | Capacity, drop test, handles |
| **Labels** | Shrink sleeves, pressure-sensitive, IML | Shrinkage %, adhesive, conformability |
| **Wrappers** | Candy twist, flow wrap, overwrap | Twist retention, machinability |
| **Lidding** | Peelable, non-peelable, easy-open | Peel force, seal window |

#### Common Structures (Layer Combinations)

```
DUPLEX (2-layer):
├── PET 12μ / PE 50μ           → Basic pouch
├── BOPP 20μ / CPP 25μ          → Snack packaging
└── Paper / PE 15μ              → Eco-friendly

TRIPLEX (3-layer):
├── PET 12μ / ALU 7μ / PE 70μ   → High barrier (coffee, pharma)
├── PET 12μ / METPET 12μ / PE 50μ → Medium barrier (snacks)
├── BOPP 20μ / METBOPP / CPP 30μ  → Cost-effective barrier
└── NY 15μ / PE 50μ / PE 50μ     → Puncture resistant

QUADPLEX (4-layer):
├── PET 12μ / ALU 9μ / NY 15μ / PE 70μ → Retort pouches
└── PET 12μ / EVOH / NY 15μ / PE 100μ  → Ultra-high barrier

PENTAPLEX+ (5+ layers):
└── PET / Print / ALU / NY / CPP → Premium applications
```

#### Material Properties Reference

| Material | Code | Density (g/cm³) | Typical Thickness | Key Properties |
|----------|------|-----------------|-------------------|----------------|
| PET | Polyethylene Terephthalate | 1.40 | 12μ | Clarity, printability, tensile |
| BOPP | Biaxially Oriented PP | 0.91 | 18-25μ | Moisture barrier, stiffness |
| CPP | Cast Polypropylene | 0.90 | 25-70μ | Sealant, retort capable |
| LDPE | Low Density PE | 0.92 | 30-100μ | Flexibility, seal |
| LLDPE | Linear Low Density PE | 0.92 | 30-100μ | Puncture resistance, seal |
| HDPE | High Density PE | 0.95 | 15-30μ | Stiffness, crinkle |
| Nylon (PA) | Polyamide | 1.14 | 15-25μ | Puncture, flex-crack, barrier |
| EVOH | Ethylene Vinyl Alcohol | 1.19 | 5-15μ | Oxygen barrier (best) |
| Aluminum | ALU Foil | 2.70 | 6-12μ | Total barrier, no light |
| Metallized PET | METPET | 1.45 | 12μ | Barrier, appearance |
| Metallized BOPP | METBOPP | 0.95 | 18-20μ | Moisture barrier, cost |
| Paper | Kraft/Coated | 0.70-1.0 | 40-120gsm | Eco-friendly, printable |

#### Barrier Properties (Critical for Food/Pharma)

| Test | Unit | Measures | Typical Values |
|------|------|----------|----------------|
| **OTR** | cc/m²/day | Oxygen Transmission Rate | <1 (high barrier), 1-10 (medium), >10 (low) |
| **WVTR** | g/m²/day | Water Vapor Transmission | <1 (high barrier), 1-5 (medium), >5 (low) |
| **Haze** | % | Clarity | <3% (clear), 3-10% (hazy) |
| **Gloss** | GU @ 60° | Shine | >80 (high gloss), 40-80 (satin), <40 (matte) |
| **COF** | μ (static/kinetic) | Friction | 0.1-0.3 (slip), 0.3-0.5 (medium), >0.5 (grip) |

---

## COMPLETE STRUCTURE BUILDER MODULE

### Interactive Layer Configuration UI

```sql
-- Structure Templates (Pre-defined common structures)
CREATE TABLE structure_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code VARCHAR(50) UNIQUE NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  
  -- Classification
  product_group_id UUID REFERENCES product_groups(id),
  application VARCHAR(100),  -- Food, Pharma, Industrial
  barrier_level VARCHAR(50), -- High, Medium, Low, None
  
  -- Structure definition
  layer_count INT NOT NULL,
  structure_notation VARCHAR(255),  -- "PET12/INK/ALU7/ADH/PE70"
  layers JSONB NOT NULL,
  -- [
  --   {layer: 1, function: "Print Surface", material: "PET", thickness: 12, treatment: "Corona"},
  --   {layer: 2, function: "Print", material: "INK", gsm: 3},
  --   {layer: 3, function: "Barrier", material: "ALU", thickness: 7},
  --   {layer: 4, function: "Adhesive", material: "SF-ADH", gsm: 2.5},
  --   {layer: 5, function: "Sealant", material: "PE", thickness: 70}
  -- ]
  
  -- Calculated properties
  total_thickness_micron DECIMAL(8,2),
  total_gsm DECIMAL(8,2),
  
  -- Expected properties
  expected_otr DECIMAL(10,4),
  expected_wvtr DECIMAL(10,4),
  
  -- Costing
  material_cost_per_sqm DECIMAL(10,4),
  
  -- Metadata
  is_standard BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed common structures
INSERT INTO structure_templates (template_code, template_name, application, barrier_level, layer_count, structure_notation, layers) VALUES
-- 2-Layer Structures
('STR-2L-001', 'Basic Laminate - PET/PE', 'Snacks, Dry Foods', 'Low', 2, 'PET12/PE50', 
 '[{"layer":1,"function":"Print","material":"PET","thickness":12},{"layer":2,"function":"Sealant","material":"PE","thickness":50}]'),

('STR-2L-002', 'BOPP/CPP Standard', 'Biscuits, Chips', 'Low', 2, 'BOPP20/CPP25',
 '[{"layer":1,"function":"Print","material":"BOPP","thickness":20},{"layer":2,"function":"Sealant","material":"CPP","thickness":25}]'),

-- 3-Layer Structures
('STR-3L-001', 'High Barrier - PET/ALU/PE', 'Coffee, Pharma', 'High', 3, 'PET12/ALU7/PE70',
 '[{"layer":1,"function":"Print","material":"PET","thickness":12},{"layer":2,"function":"Barrier","material":"ALU","thickness":7},{"layer":3,"function":"Sealant","material":"PE","thickness":70}]'),

('STR-3L-002', 'Medium Barrier - PET/METPET/PE', 'Snacks, Nuts', 'Medium', 3, 'PET12/METPET12/PE50',
 '[{"layer":1,"function":"Print","material":"PET","thickness":12},{"layer":2,"function":"Barrier","material":"METPET","thickness":12},{"layer":3,"function":"Sealant","material":"PE","thickness":50}]'),

('STR-3L-003', 'Puncture Resistant - NY/PE/PE', 'Cheese, Meat', 'Medium', 3, 'NY15/PE50/PE50',
 '[{"layer":1,"function":"Abuse","material":"NY","thickness":15},{"layer":2,"function":"Bulk","material":"PE","thickness":50},{"layer":3,"function":"Sealant","material":"PE","thickness":50}]'),

-- 4-Layer Structures
('STR-4L-001', 'Retort Pouch - PET/ALU/NY/CPP', 'Ready Meals', 'High', 4, 'PET12/ALU9/NY15/CPP70',
 '[{"layer":1,"function":"Print","material":"PET","thickness":12},{"layer":2,"function":"Barrier","material":"ALU","thickness":9},{"layer":3,"function":"Abuse","material":"NY","thickness":15},{"layer":4,"function":"Sealant","material":"CPP","thickness":70}]');


-- Material Compatibility Matrix
CREATE TABLE material_compatibility (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_1 VARCHAR(50) NOT NULL,
  material_2 VARCHAR(50) NOT NULL,
  is_compatible BOOLEAN NOT NULL,
  requires_treatment BOOLEAN DEFAULT false,
  recommended_adhesive VARCHAR(50),
  notes TEXT,
  UNIQUE(material_1, material_2)
);

-- Seed compatibility data
INSERT INTO material_compatibility (material_1, material_2, is_compatible, requires_treatment, recommended_adhesive, notes) VALUES
('PET', 'PE', true, true, 'SF-ADH', 'Corona treatment required on PET'),
('PET', 'ALU', true, true, 'SB-ADH', 'Corona on PET, primer on ALU'),
('ALU', 'PE', true, false, 'SF-ADH', 'Direct lamination possible'),
('ALU', 'NY', true, true, 'SB-ADH', 'Both surfaces need treatment'),
('NY', 'PE', true, true, 'SF-ADH', 'Corona on NY'),
('BOPP', 'CPP', true, true, 'SF-ADH', 'Corona on BOPP'),
('BOPP', 'METBOPP', false, false, NULL, 'Same material - use adhesive lamination'),
('PET', 'METPET', true, true, 'SF-ADH', 'Corona on PET side of METPET');
```

### Structure Builder React Component Spec

```javascript
// src/components/CRM/StructureBuilder/StructureBuilder.jsx

/**
 * Interactive Structure Builder Component
 * 
 * Features:
 * - Drag-and-drop layer arrangement
 * - Material selection with auto-suggestions
 * - Real-time GSM and thickness calculation
 * - Compatibility warnings
 * - Barrier property estimation
 * - Cost calculation
 * 
 * Props:
 * - initialStructure: Existing structure to edit
 * - onStructureChange: Callback with structure data
 * - productGroup: Product group for context
 * - readOnly: View-only mode
 */

const StructureBuilder = ({ initialStructure, onStructureChange, productGroup, readOnly }) => {
  // Component implementation
};

/**
 * Layer Card Component
 * Represents single layer in structure
 */
const LayerCard = ({ layer, index, onUpdate, onDelete, onMoveUp, onMoveDown }) => {
  // Displays: Layer number, Function, Material dropdown, Thickness input
  // Shows: GSM calculation, Cost per sqm
};

/**
 * Structure Summary Panel
 * Shows calculated totals
 */
const StructureSummary = ({ layers }) => {
  // Displays:
  // - Total Thickness (μ)
  // - Total GSM
  // - Structure Notation (PET12/ALU7/PE70)
  // - Estimated OTR
  // - Estimated WVTR
  // - Material Cost/sqm
  // - Yield (sqm/kg)
};

/**
 * Template Selector
 * Quick selection of pre-defined structures
 */
const TemplateSelector = ({ productGroup, onSelect }) => {
  // Shows common structures for product group
  // User can select and modify
};
```

---

## COMPLETE COSTING FORMULAS

### Flexible Packaging Cost Calculation Engine

```javascript
// server/services/FlexPackCostingEngine.js

class FlexPackCostingEngine {
  
  /**
   * MASTER COST CALCULATION
   * 
   * Total Cost = Material + Ink + Adhesive + Process + Setup + Features + Waste + Overhead + Packaging + Freight
   */
  
  // ============================================================
  // 1. MATERIAL COST CALCULATION
  // ============================================================
  
  calculateMaterialCost(structure, orderQtyKg) {
    /**
     * For each layer:
     * GSM = Thickness (μ) × Density (g/cm³)
     * Layer Weight % = Layer GSM / Total GSM
     * Layer Qty (kg) = Order Qty × Layer Weight %
     * Layer Cost = Layer Qty × Material Price/kg
     */
    
    let totalGSM = 0;
    const layerData = [];
    
    // First pass: calculate GSM for each layer
    for (const layer of structure.layers) {
      const material = this.getMaterial(layer.material_code);
      const gsm = layer.thickness * material.density;
      totalGSM += gsm;
      layerData.push({ ...layer, gsm, material });
    }
    
    // Second pass: calculate cost
    let totalMaterialCost = 0;
    const breakdown = [];
    
    for (const layer of layerData) {
      const weightPct = layer.gsm / totalGSM;
      const layerQty = orderQtyKg * weightPct;
      const layerCost = layerQty * layer.material.price_per_kg;
      
      breakdown.push({
        category: 'material',
        description: `${layer.material.name} - Layer ${layer.layer_number}`,
        quantity: layerQty,
        unit: 'kg',
        rate: layer.material.price_per_kg,
        amount: layerCost
      });
      
      totalMaterialCost += layerCost;
    }
    
    return { total: totalMaterialCost, breakdown, totalGSM };
  }
  
  // ============================================================
  // 2. INK COST CALCULATION
  // ============================================================
  
  calculateInkCost(printing, orderQtyKg, totalGSM) {
    /**
     * Ink Coverage Factors:
     * - Solid: 4-5 GSM per color
     * - 50% coverage: 2-2.5 GSM per color
     * - Line/text only: 1-1.5 GSM per color
     * 
     * Ink Cost = (Order Qty × Ink GSM / Total GSM) × Ink Price/kg
     */
    
    if (!printing || printing.colors === 0) {
      return { total: 0, breakdown: [] };
    }
    
    const INK_GSM_PER_COLOR = {
      'solid': 4.5,
      'heavy': 3.5,
      'medium': 2.5,
      'light': 1.5
    };
    
    const inkGsmPerColor = INK_GSM_PER_COLOR[printing.coverage || 'medium'];
    const totalInkGsm = printing.colors * inkGsmPerColor;
    
    // Convert GSM to kg
    const sqmPerKg = 1000 / totalGSM;
    const totalSqm = orderQtyKg * sqmPerKg;
    const inkKg = (totalInkGsm * totalSqm) / 1000;
    
    const inkPricePerKg = this.getInkPrice(printing.ink_type);
    const inkCost = inkKg * inkPricePerKg;
    
    return {
      total: inkCost,
      breakdown: [{
        category: 'ink',
        description: `${printing.ink_type} Ink - ${printing.colors} colors`,
        quantity: inkKg,
        unit: 'kg',
        rate: inkPricePerKg,
        amount: inkCost
      }]
    };
  }
  
  // ============================================================
  // 3. ADHESIVE COST CALCULATION
  // ============================================================
  
  calculateAdhesiveCost(structure, orderQtyKg, totalGSM) {
    /**
     * Adhesive GSM typically:
     * - Solvent-free: 1.5-2.5 GSM per bond line
     * - Solvent-based: 2.0-3.0 GSM per bond line
     * - Water-based: 2.5-4.0 GSM per bond line
     * 
     * Number of bond lines = Number of layers - 1
     */
    
    const bondLines = structure.layers.length - 1;
    if (bondLines <= 0) {
      return { total: 0, breakdown: [] };
    }
    
    const ADHESIVE_GSM = {
      'SF': 2.0,   // Solvent-free
      'SB': 2.5,   // Solvent-based
      'WB': 3.0,   // Water-based
      'EXT': 0     // Extrusion (no adhesive)
    };
    
    const adhesiveType = structure.adhesive_type || 'SF';
    const adhesiveGsm = ADHESIVE_GSM[adhesiveType] * bondLines;
    
    const sqmPerKg = 1000 / totalGSM;
    const totalSqm = orderQtyKg * sqmPerKg;
    const adhesiveKg = (adhesiveGsm * totalSqm) / 1000;
    
    const adhesivePricePerKg = this.getAdhesivePrice(adhesiveType);
    const adhesiveCost = adhesiveKg * adhesivePricePerKg;
    
    return {
      total: adhesiveCost,
      breakdown: [{
        category: 'adhesive',
        description: `${adhesiveType} Adhesive - ${bondLines} bond lines`,
        quantity: adhesiveKg,
        unit: 'kg',
        rate: adhesivePricePerKg,
        amount: adhesiveCost
      }]
    };
  }
  
  // ============================================================
  // 4. PROCESS COST CALCULATION
  // ============================================================
  
  calculateProcessCost(processes, orderQtyKg, dimensions) {
    /**
     * Process cost = Machine Hours × Hourly Rate
     * 
     * Machine Hours = (Order Length in meters) / (Line Speed m/min × 60 × Efficiency)
     * 
     * Efficiency factors:
     * - Short runs (<5000m): 60-70%
     * - Medium runs (5000-20000m): 75-85%
     * - Long runs (>20000m): 85-95%
     */
    
    const breakdown = [];
    let totalProcessCost = 0;
    
    for (const process of processes) {
      const processRate = this.getProcessRate(process.process_code);
      
      // Calculate run length
      const runLengthM = this.calculateRunLength(orderQtyKg, dimensions);
      const efficiency = this.getEfficiency(runLengthM);
      
      const machineHours = runLengthM / (processRate.speed_mpm * 60 * efficiency);
      const processCost = machineHours * processRate.hourly_rate;
      
      breakdown.push({
        category: 'process',
        description: processRate.process_name,
        quantity: machineHours,
        unit: 'hours',
        rate: processRate.hourly_rate,
        amount: processCost
      });
      
      totalProcessCost += processCost;
    }
    
    return { total: totalProcessCost, breakdown };
  }
  
  // ============================================================
  // 5. SETUP COSTS (Cylinders, Plates)
  // ============================================================
  
  calculateSetupCost(printing, features, amortizationRuns = 3) {
    /**
     * Cylinder costs (Gravure):
     * - Base cylinder + Copper + Chrome + Engraving
     * - Amortized over X runs (typically 3-5)
     * 
     * Plate costs (Flexo):
     * - Plate material + Imaging
     * - Per color per repeat
     */
    
    const breakdown = [];
    let totalSetupCost = 0;
    
    if (printing.type === 'gravure') {
      // Gravure cylinders
      const cylinderCostPerColor = 500;  // USD average
      const totalCylinderCost = printing.colors * cylinderCostPerColor;
      const amortizedCost = totalCylinderCost / amortizationRuns;
      
      breakdown.push({
        category: 'setup',
        description: `Gravure Cylinders - ${printing.colors} colors (amortized/${amortizationRuns} runs)`,
        quantity: printing.colors,
        unit: 'cylinders',
        rate: cylinderCostPerColor / amortizationRuns,
        amount: amortizedCost
      });
      
      totalSetupCost += amortizedCost;
      
    } else if (printing.type === 'flexo') {
      // Flexo plates
      const plateCostPerColor = 150;  // USD average per plate set
      const totalPlateCost = printing.colors * plateCostPerColor;
      
      breakdown.push({
        category: 'setup',
        description: `Flexo Plates - ${printing.colors} colors`,
        quantity: printing.colors,
        unit: 'plate sets',
        rate: plateCostPerColor,
        amount: totalPlateCost
      });
      
      totalSetupCost += totalPlateCost;
    }
    
    // Die/tooling for pouches
    if (features.pouch_type) {
      const dieCost = this.getDieCost(features.pouch_type);
      breakdown.push({
        category: 'setup',
        description: `Pouch Die - ${features.pouch_type}`,
        quantity: 1,
        unit: 'die',
        rate: dieCost / amortizationRuns,
        amount: dieCost / amortizationRuns
      });
      totalSetupCost += dieCost / amortizationRuns;
    }
    
    return { total: totalSetupCost, breakdown };
  }
  
  // ============================================================
  // 6. FEATURE COSTS (Zipper, Spout, Valve, etc.)
  // ============================================================
  
  calculateFeatureCost(features, quantity, quantityUnit) {
    /**
     * Features are typically priced per piece or per meter
     */
    
    const FEATURE_COSTS = {
      'zipper_plastic': { cost: 0.02, unit: 'pcs', description: 'Plastic Zipper' },
      'zipper_press_to_close': { cost: 0.03, unit: 'pcs', description: 'Press-to-Close Zipper' },
      'slider_zipper': { cost: 0.08, unit: 'pcs', description: 'Slider Zipper' },
      'spout_13mm': { cost: 0.05, unit: 'pcs', description: 'Spout 13mm' },
      'spout_16mm': { cost: 0.06, unit: 'pcs', description: 'Spout 16mm' },
      'spout_with_cap': { cost: 0.10, unit: 'pcs', description: 'Spout with Cap' },
      'valve': { cost: 0.04, unit: 'pcs', description: 'Degassing Valve' },
      'tear_notch': { cost: 0.00, unit: 'pcs', description: 'Tear Notch (included)' },
      'hang_hole': { cost: 0.00, unit: 'pcs', description: 'Hang Hole (included)' },
      'euro_slot': { cost: 0.01, unit: 'pcs', description: 'Euro Slot' }
    };
    
    const breakdown = [];
    let totalFeatureCost = 0;
    
    for (const [feature, enabled] of Object.entries(features)) {
      if (enabled && FEATURE_COSTS[feature]) {
        const featureData = FEATURE_COSTS[feature];
        const featureQty = quantityUnit === 'pcs' ? quantity : this.kgToPcs(quantity);
        const cost = featureQty * featureData.cost;
        
        breakdown.push({
          category: 'features',
          description: featureData.description,
          quantity: featureQty,
          unit: featureData.unit,
          rate: featureData.cost,
          amount: cost
        });
        
        totalFeatureCost += cost;
      }
    }
    
    return { total: totalFeatureCost, breakdown };
  }
  
  // ============================================================
  // 7. WASTAGE CALCULATION
  // ============================================================
  
  calculateWastage(materialCost, process, orderQty) {
    /**
     * Wastage factors:
     * - Setup waste: 3-5% (higher for complex jobs)
     * - Running waste: 1-3%
     * - Slitting waste: 1-2%
     * - Pouch making waste: 2-4%
     * 
     * Total waste typically: 5-15% depending on complexity
     */
    
    const WASTE_FACTORS = {
      'printing_gravure': 0.05,
      'printing_flexo': 0.04,
      'lamination': 0.02,
      'slitting': 0.015,
      'pouch_making': 0.03,
      'label_converting': 0.04
    };
    
    let totalWastePct = 0.02;  // Base waste
    
    for (const proc of process) {
      totalWastePct += WASTE_FACTORS[proc] || 0.02;
    }
    
    // Adjust for order size (smaller orders = higher waste %)
    if (orderQty < 500) totalWastePct += 0.05;
    else if (orderQty < 1000) totalWastePct += 0.03;
    else if (orderQty < 3000) totalWastePct += 0.01;
    
    const wasteCost = materialCost * totalWastePct;
    
    return {
      total: wasteCost,
      wastePct: totalWastePct * 100,
      breakdown: [{
        category: 'waste',
        description: `Process Wastage (${(totalWastePct * 100).toFixed(1)}%)`,
        quantity: totalWastePct * 100,
        unit: '%',
        rate: materialCost / 100,
        amount: wasteCost
      }]
    };
  }
  
  // ============================================================
  // 8. OVERHEAD CALCULATION
  // ============================================================
  
  calculateOverhead(directCost) {
    /**
     * Overhead factors:
     * - Factory overhead: 10-15%
     * - Admin overhead: 3-5%
     * - Sales overhead: 2-5%
     */
    
    const factoryOverheadPct = 0.12;
    const adminOverheadPct = 0.04;
    
    const overhead = directCost * (factoryOverheadPct + adminOverheadPct);
    
    return {
      total: overhead,
      breakdown: [
        {
          category: 'overhead',
          description: 'Factory Overhead',
          quantity: factoryOverheadPct * 100,
          unit: '%',
          amount: directCost * factoryOverheadPct
        },
        {
          category: 'overhead',
          description: 'Admin Overhead',
          quantity: adminOverheadPct * 100,
          unit: '%',
          amount: directCost * adminOverheadPct
        }
      ]
    };
  }
  
  // ============================================================
  // 9. PACKAGING & FREIGHT
  // ============================================================
  
  calculatePackagingFreight(orderQtyKg, deliveryLocation) {
    /**
     * Packaging:
     * - Core: 0.5 USD/kg (paper cores)
     * - Pallet: 15 USD per pallet
     * - Shrink wrap: 2 USD per pallet
     * - Box: varies by pouch size
     */
    
    const breakdown = [];
    
    // Cores
    const coreCost = orderQtyKg * 0.02;  // ~2% of weight as cores
    breakdown.push({
      category: 'packaging',
      description: 'Paper Cores',
      amount: coreCost
    });
    
    // Pallets (assume 500kg per pallet)
    const palletCount = Math.ceil(orderQtyKg / 500);
    const palletCost = palletCount * 17;  // pallet + wrap
    breakdown.push({
      category: 'packaging',
      description: `Pallets (${palletCount})`,
      amount: palletCost
    });
    
    // Freight estimate
    const freightPerKg = this.getFreightRate(deliveryLocation);
    const freightCost = orderQtyKg * freightPerKg;
    breakdown.push({
      category: 'freight',
      description: `Freight to ${deliveryLocation}`,
      quantity: orderQtyKg,
      unit: 'kg',
      rate: freightPerKg,
      amount: freightCost
    });
    
    return {
      total: coreCost + palletCost + freightCost,
      breakdown
    };
  }
  
  // ============================================================
  // MAIN CALCULATION FUNCTION
  // ============================================================
  
  async calculateTotalCost(params) {
    const {
      structure,
      printing,
      dimensions,
      features,
      orderQtyKg,
      deliveryLocation,
      marginPct = 20
    } = params;
    
    // 1. Material
    const material = this.calculateMaterialCost(structure, orderQtyKg);
    
    // 2. Ink
    const ink = this.calculateInkCost(printing, orderQtyKg, material.totalGSM);
    
    // 3. Adhesive
    const adhesive = this.calculateAdhesiveCost(structure, orderQtyKg, material.totalGSM);
    
    // 4. Process
    const processes = this.getProcessesForProduct(structure, printing, features);
    const process = this.calculateProcessCost(processes, orderQtyKg, dimensions);
    
    // 5. Setup
    const setup = this.calculateSetupCost(printing, features);
    
    // 6. Features
    const featuresCost = this.calculateFeatureCost(features, orderQtyKg, 'kg');
    
    // 7. Wastage
    const materialAndConsumables = material.total + ink.total + adhesive.total;
    const waste = this.calculateWastage(materialAndConsumables, processes, orderQtyKg);
    
    // 8. Subtotal (direct cost)
    const directCost = material.total + ink.total + adhesive.total + 
                       process.total + setup.total + featuresCost.total + waste.total;
    
    // 9. Overhead
    const overhead = this.calculateOverhead(directCost);
    
    // 10. Packaging & Freight
    const packagingFreight = this.calculatePackagingFreight(orderQtyKg, deliveryLocation);
    
    // TOTAL COST
    const totalCost = directCost + overhead.total + packagingFreight.total;
    
    // PRICING
    const margin = totalCost * (marginPct / 100);
    const sellingPrice = totalCost + margin;
    
    // Per-unit calculations
    const sqmPerKg = 1000 / material.totalGSM;
    const totalSqm = orderQtyKg * sqmPerKg;
    
    return {
      summary: {
        orderQtyKg,
        totalGSM: material.totalGSM,
        totalSqm,
        totalCost,
        costPerKg: totalCost / orderQtyKg,
        costPerSqm: totalCost / totalSqm,
        marginPct,
        sellingPrice,
        pricePerKg: sellingPrice / orderQtyKg,
        pricePerSqm: sellingPrice / totalSqm
      },
      breakdown: {
        material: material.breakdown,
        ink: ink.breakdown,
        adhesive: adhesive.breakdown,
        process: process.breakdown,
        setup: setup.breakdown,
        features: featuresCost.breakdown,
        waste: waste.breakdown,
        overhead: overhead.breakdown,
        packaging: packagingFreight.breakdown
      },
      categoryTotals: {
        material: material.total,
        ink: ink.total,
        adhesive: adhesive.total,
        process: process.total,
        setup: setup.total,
        features: featuresCost.total,
        waste: waste.total,
        overhead: overhead.total,
        packagingFreight: packagingFreight.total
      }
    };
  }
}

module.exports = FlexPackCostingEngine;
```

---

## AGENT IMPLEMENTATION PROMPTS

Use these prompts to instruct coding agents to implement each module:

### Prompt 1: Multi-Tenant Setup

```
Create multi-tenant infrastructure for ProPackHub flexible packaging SaaS:

CONTEXT:
- This is a SaaS platform that will be sold to multiple packaging companies
- First tenant is "Interplast" with subdomain interplast.propackhub.com
- Using PostgreSQL with schema-per-tenant approach

DATABASE:
1. Create system.tenants table (tenant_id, tenant_code, subdomain, company_name, subscription_tier, etc.)
2. Create system.subscriptions table for billing
3. Create tenant schema template with all CRM tables

MIDDLEWARE:
1. Tenant resolver middleware that extracts subdomain from request
2. Sets PostgreSQL search_path to tenant schema
3. Caches tenant info in Redis

AUTHENTICATION:
1. JWT tokens must include tenant_id claim
2. Refresh tokens scoped to tenant
3. Users can only access their tenant's data

FILES TO CREATE:
- server/middleware/tenantResolver.js
- server/services/TenantService.js
- server/migrations/000_create_system_schema.sql
- server/scripts/provision-tenant.js

Use existing authentication patterns from current codebase.
```

### Prompt 2: Customer Master CRM

```
Create Customer Master module for ProPackHub CRM:

CONTEXT:
- This extends the existing customer analytics (fp_customer_* tables)
- Needs full CRM capabilities: contacts, addresses, interactions
- Flexible packaging customers may be food companies, pharma, FMCG

DATABASE TABLES:
1. customers (customer_code, company_name, industry, sales_rep, credit_limit, rating)
2. customer_contacts (name, role, email, can_approve_samples, can_place_orders)
3. customer_addresses (billing, shipping, plant locations)
4. customer_interactions (calls, meetings, emails, visits)

API ROUTES:
- Full CRUD for customers
- Contact management
- Address management
- Interaction logging
- Timeline view
- Search with full-text

FRONTEND COMPONENTS:
- CustomerList with search, filters, pagination
- CustomerDetail with tabs (Info, Contacts, Addresses, Timeline, Analytics)
- CustomerForm for create/edit
- ContactManager component
- InteractionLogger component

Link with existing:
- fp_customer_behavior_history
- fp_customer_segments
- users table (sales rep assignment)
```

### Prompt 3: Product Catalog & TDS

```
Create Product Catalog and TDS module for ProPackHub:

CONTEXT:
- Extends existing pgcombine product groups
- Flexible packaging products have multi-layer structures
- Each product group needs a TDS (Technical Data Sheet) template

STRUCTURE BUILDER:
- Interactive layer configuration
- Drag-drop layer arrangement
- Material selection with database lookup
- Auto-calculate GSM, thickness, barrier properties
- Structure notation generator (PET12/ALU7/PE70)

TDS TEMPLATES:
- One template per product group (Pouch, Roll Stock, Label, Bag)
- Sections: Structure, Printing, Physical Properties, Barrier, Machine Settings
- PDF generation with company branding
- Version control

DATABASE:
- product_groups (extend from pgcombine)
- products (customer-specific products)
- product_layers (layer-by-layer structure)
- tds_templates (per product group)
- tds_documents (generated TDS)
- structure_templates (pre-defined common structures)
- material_compatibility (which materials can laminate together)

SEED DATA:
- Common structures (duplex, triplex, quadplex)
- Material library (PET, BOPP, PE, ALU, NY, EVOH, etc.)
- Compatibility matrix
```

### Prompt 4: Sample & QC Module

```
Create Sample Request and QC Analysis module for ProPackHub:

CONTEXT:
- Flexible packaging workflow: Customer requests sample → Internal approval → Production → QC Testing → Customer approval
- QC tests are specific to packaging: OTR, WVTR, tensile, seal strength, etc.

SAMPLE WORKFLOW:
1. Sales creates sample request with structure/specs
2. Technical team reviews feasibility
3. Internal approval
4. Production creates sample
5. QC analyst assigned
6. QC performs tests (from test library)
7. QC adds recommendations
8. Sample sent to customer
9. Customer feedback recorded

QC TEST LIBRARY:
- Standard tests with methods (ASTM, ISO)
- Physical: Thickness, Tensile, Elongation, Dart, Tear
- Barrier: OTR, WVTR
- Seal: Seal strength, Burst, Leak
- Print: Adhesion, Rub resistance, Color ΔE
- Optical: Haze, Gloss, COF

DATABASE:
- sample_requests
- sample_specifications
- qc_analyses
- qc_test_results
- qc_recommendations
- test_library (reusable test definitions)

FRONTEND:
- SampleRequestForm with StructureBuilder
- SampleWorkflowTracker (Kanban view)
- QCAnalysisForm
- TestResultEntry with multiple readings
- QCReportGenerator
```

### Prompt 5: Cost Estimation Engine

```
Create Cost Estimation Engine for ProPackHub flexible packaging:

CONTEXT:
- Flexible packaging costing is complex with many components
- Must calculate: materials, ink, adhesive, process, setup, features, waste, overhead
- Provide quantity breaks for different order sizes

COSTING COMPONENTS (all formulas provided in Part 3 doc):
1. Material Cost - by layer based on thickness, density, price
2. Ink Cost - by coverage, colors, ink type
3. Adhesive Cost - by bond lines, adhesive type
4. Process Cost - machine hours × rate
5. Setup Cost - cylinders/plates amortized over runs
6. Feature Cost - zipper, spout, valve per piece
7. Wastage - % based on processes and order size
8. Overhead - factory + admin %
9. Packaging & Freight

PRICING:
- Calculate cost per kg, per sqm, per piece
- Apply margin to get selling price
- Generate quantity breaks (e.g., 1000kg, 5000kg, 10000kg)

DATABASE:
- raw_materials (material master with prices)
- process_rates (machine hourly rates)
- costing_settings (overhead %, waste %, etc.)
- cost_estimations (saved calculations)
- cost_breakdown (line-by-line details)
- pricing_tiers (quantity breaks)

USE: FlexPackCostingEngine class provided in Part 3 doc
```

### Prompt 6: Quotation Generator

```
Create Quotation Generator for ProPackHub:

CONTEXT:
- Quotations based on cost estimations
- Must generate professional PDF quotes
- Support versioning and revisions
- Track sent/opened/responded

FEATURES:
1. Create quote from cost estimation
2. Multiple line items per quote
3. Quantity break pricing table
4. Terms and conditions
5. Validity period
6. PDF generation with company branding
7. Email sending with tracking
8. Version control for revisions
9. Win/Loss tracking

WORKFLOW:
- Draft → Internal Approval → Sent → Under Negotiation → Accepted/Rejected
- Record negotiations (calls, meetings)
- Create revision from existing quote
- Convert to Production Order on acceptance

FRONTEND:
- QuotationBuilder
- QuotationPreview (PDF preview)
- NegotiationLogger
- QuotationPipeline (Kanban)
- WinLossAnalytics
```

---

## FRONTEND COMPONENT SPECIFICATIONS

### Required UI Components

| Component | Location | Description |
|-----------|----------|-------------|
| `TenantSelector` | Login page | Company selection for multi-tenant |
| `CustomerList` | CRM | Searchable customer table |
| `CustomerDetail` | CRM | Tabbed customer view |
| `StructureBuilder` | Products | Layer configuration tool |
| `MaterialSelector` | Products | Material dropdown with search |
| `SampleWorkflow` | Samples | Kanban board for sample status |
| `QCTestForm` | QC | Test result entry with readings |
| `CostCalculator` | Costing | Interactive cost estimation |
| `QuoteBuilder` | Quotes | Quotation creation form |
| `QuotePDF` | Quotes | PDF preview and generation |
| `PipelineView` | Dashboard | CRM funnel visualization |

### Shared Component Patterns

```javascript
// Use Ant Design components (already in project)
import { Table, Form, Modal, Tabs, Card, Steps, Badge } from 'antd';

// Standard patterns:
// - List views: Table with search, filters, pagination
// - Detail views: Card with Tabs
// - Forms: Form.Item with validation
// - Workflows: Steps or Timeline
// - Status: Badge with color coding
```

---

## TESTING CHECKLIST

### Module Testing Requirements

| Module | Unit Tests | Integration | E2E |
|--------|------------|-------------|-----|
| Multi-Tenant | Schema isolation, tenant resolution | Cross-tenant access prevention | Login flow per tenant |
| Customer CRM | CRUD operations, validation | Contact linking, sales rep assignment | Full customer creation |
| Product Catalog | Structure calculation, GSM | TDS generation | Product → TDS flow |
| Sample/QC | Workflow transitions, test results | Sample → QC assignment | Full sample lifecycle |
| Costing | Each calculation function | Full cost calculation | Quote from sample |
| Quotation | CRUD, versioning | PDF generation, email | Quote to approval |

---

## DEPLOYMENT CHECKLIST

### Pre-Production Checklist

- [ ] Multi-tenant schema isolation verified
- [ ] Tenant provisioning script tested
- [ ] All database migrations created
- [ ] API authentication per tenant
- [ ] File storage per tenant (S3 prefixes)
- [ ] Email templates configured
- [ ] PDF templates with branding
- [ ] Performance tested (100+ concurrent users)
- [ ] Backup and recovery tested
- [ ] SSL certificates for *.propackhub.com

---

## DOCUMENT COMPLETION STATUS

| Part | Lines | Content |
|------|-------|---------|
| Part 1 | 983 | Platform overview, architecture, Phase 1-2 schemas |
| Part 2 | 1353 | Phase 3-6 schemas, QC, Costing tables, APIs |
| Part 3 | THIS | Industry knowledge, formulas, agent prompts, components |
| Quick Start | 250 | Executive summary |

**TOTAL: ~3500+ lines of comprehensive documentation**

---

This completes the ProPackHub CRM Master Plan.
