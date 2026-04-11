// MES Workflow Data - 17-Phase Flexible Packaging Production Process
// Based on MES_Research_Notes.md v4 specifications

export const departmentConfig = {
  Sales: {
    color: "#1976d2",
    bgColor: "#e3f2fd",
    icon: "👥",
    responsibilities: ["RFQ handling", "Quotation", "PO/SO processing", "PPS approval coordination"]
  },
  QC: {
    color: "#d32f2f",
    bgColor: "#ffebee",
    icon: "🛡️",
    responsibilities: ["Sample evaluation", "TDS creation", "Material QC", "PPS/FAI testing", "Final QC"]
  },
  Prepress: {
    color: "#7b1fa2",
    bgColor: "#f3e5f5",
    icon: "🎨",
    responsibilities: ["Artwork creation", "Color separation", "Plate file generation"]
  },
  Estimation: {
    color: "#f57c00",
    bgColor: "#fff3e0",
    icon: "🧮",
    responsibilities: ["Cost calculation", "Pricing strategy", "MOQ analysis"]
  },
  Procurement: {
    color: "#388e3c",
    bgColor: "#e8f5e9",
    icon: "🛒",
    responsibilities: ["MRP execution", "Stock management", "Purchasing", "FIFO enforcement"]
  },
  Production: {
    color: "#ff6f00",
    bgColor: "#fff3e0",
    icon: "⚙️",
    responsibilities: ["Production scheduling", "Job card generation", "PPS manufacturing", "Full run execution"]
  },
  "Ink Head": {
    color: "#e91e63",
    bgColor: "#fce4ec",
    icon: "🧪",
    responsibilities: ["Ink formulation", "Color matching", "Viscosity testing"]
  },
  Maintenance: {
    color: "#5e35b1",
    bgColor: "#ede7f6",
    icon: "🔧",
    responsibilities: ["Preventive maintenance", "Breakdown response", "Equipment calibration"]
  },
  Accounts: {
    color: "#00897b",
    bgColor: "#e0f2f1",
    icon: "💰",
    responsibilities: ["Credit check", "Payment terms", "PI generation", "Invoicing"]
  },
  Logistics: {
    color: "#6a1b9a",
    bgColor: "#f3e5f5",
    icon: "🚚",
    responsibilities: ["FG inventory", "DN generation", "Shipping", "Delivery tracking"]
  }
};

export const stageGroups = [
  {
    stageNumber: 1,
    stageName: "Pre-Sales",
    subtitle: "Inquiry → Registration → Tech Review → MOQ → Material Check",
    color: "#0d47a1",
    phases: [1, 2, 3, 4, 5]
  },
  {
    stageNumber: 2,
    stageName: "Quotation & Order",
    subtitle: "Costing → Quotation → PO/SO Generation",
    color: "#f57c00",
    phases: [6, 7, 8]
  },
  {
    stageNumber: 3,
    stageName: "Pre-Production",
    subtitle: "Material Procurement ⚡ Artwork & Plates (Parallel)",
    color: "#388e3c",
    phases: [9, 10]
  },
  {
    stageNumber: 4,
    stageName: "Production & QC",
    subtitle: "Planning → Ink Prep → Production → Final QC ⚑ CRITICAL GATES",
    color: "#d32f2f",
    phases: [11, 12, 13, 14]
  },
  {
    stageNumber: 5,
    stageName: "Delivery & Close",
    subtitle: "Invoicing → Shipping → Feedback",
    color: "#6a1b9a",
    phases: [15, 16, 17]
  }
];

export const workflowPhases = [
  // ==================== STAGE 1: PRE-SALES ====================
  {
    phaseNumber: 1,
    phaseName: "Customer Inquiry",
    stage: 1,
    departments: ["Sales"],
    estimatedDuration: "30 mins - 2 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "1.1",
        stepName: "Customer Inquiry (RFQ)",
        icon: "📧",
        department: "Sales",
        keyActions: "Receive inquiry via email/phone/visit. Document product type (LAM/LID/WAL), size, quantity, design requirements.",
        forms: ["RFQ"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "1.2",
        stepName: "Sample Analysis",
        icon: "🔍",
        department: "QC",
        keyActions: "If physical sample provided, analyze structure, material layers, thickness, printing details, barrier properties.",
        forms: ["CSE (Customer Sample Evaluation)"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "1.3",
        stepName: "New Customer Decision",
        icon: "⚖",
        department: "Sales",
        keyActions: "Check if customer exists in system",
        forms: [],
        isPPS: false,
        isDecision: true,
        decisionOptions: [
          { option: "New Customer", consequence: "Proceed to Phase 2 (Registration & Credit Check)" },
          { option: "Existing Customer", consequence: "Skip to Phase 3 (Tech Spec Review)" }
        ]
      }
    ],
    miniDiagram: `flowchart LR
    A["📧 RFQ<br/>Received"]
    B["🔍 Sample<br/>Analysis"]
    C{"New<br/>Customer?"}
    D["✅ Proceed to<br/>Registration"]
    E["⏭ Skip to<br/>Tech Review"]
    
    A --> B
    B --> C
    C -->|Yes| D
    C -->|No| E`
  },

  {
    phaseNumber: 2,
    phaseName: "Registration & Credit Check",
    stage: 1,
    departments: ["Sales", "Accounts"],
    estimatedDuration: "2-4 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "2.1",
        stepName: "Customer Registration",
        icon: "📝",
        department: "Sales",
        keyActions: "Collect company details, contact persons, shipping/billing addresses, GST/tax info, business references.",
        forms: ["Customer Registration Form"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "2.2",
        stepName: "Credit Limit Check",
        icon: "💳",
        department: "Accounts",
        keyActions: "Request credit application, verify financial stability, set credit limit & payment terms (advance/30/45/60 days).",
        forms: ["Credit Application"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📝 Register<br/>Customer"]
    B["💳 Credit<br/>Check"]
    C["✅ Approved"]
    
    A --> B
    B --> C`
  },

  {
    phaseNumber: 3,
    phaseName: "Technical Specification Review",
    stage: 1,
    departments: ["QC", "Prepress"],
    estimatedDuration: "1-3 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "3.1",
        stepName: "TDS Creation/Review",
        icon: "📋",
        department: "QC",
        keyActions: "Create Technical Data Sheet documenting film structure, material specs, barrier properties, printing colors, finish requirements.",
        forms: ["TDS (Technical Data Sheet)"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "3.2",
        stepName: "Artwork Feasibility",
        icon: "🎨",
        department: "Prepress",
        keyActions: "Review artwork/design files, check color count, resolution, bleed, registration marks, trap requirements.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "3.3",
        stepName: "Plate Count Estimation",
        icon: "🔢",
        department: "Prepress",
        keyActions: "Determine number of printing plates/cylinders needed (depends on colors, repeat length).",
        forms: [],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📋 TDS<br/>Creation"]
    B["🎨 Artwork<br/>Feasibility"]
    C["🔢 Plate<br/>Count"]
    D["✅ Tech<br/>Approved"]
    
    A --> B
    B --> C
    C --> D`
  },

  {
    phaseNumber: 4,
    phaseName: "MOQ Verification",
    stage: 1,
    departments: ["Sales", "Production"],
    estimatedDuration: "30 mins",
    criticalPath: true,
    steps: [
      {
        stepId: "4.1",
        stepName: "MOQ Check",
        icon: "📊",
        department: "Sales",
        keyActions: "Compare customer quantity vs. MOQ for product type (LAM: 2000-5000 kg, LID: 5000-10000 pcs, WAL/Pouch: 10000-50000 pcs). Consider cylinder cost amortization.",
        forms: [],
        isPPS: false,
        isDecision: true,
        decisionOptions: [
          { option: "Quantity >= MOQ", consequence: "Proceed to Phase 5 (Material Availability)" },
          { option: "Quantity < MOQ", consequence: "Negotiate higher quantity OR Quote higher price to cover setup costs OR Reject order" }
        ]
      }
    ],
    miniDiagram: `flowchart TD
    A["📊 Check<br/>Quantity"]
    B{"Quantity<br/>>= MOQ?"}
    C["✅ Proceed"]
    D["💬 Negotiate<br/>or Reject"]
    
    A --> B
    B -->|Yes| C
    B -->|No| D`
  },

  {
    phaseNumber: 5,
    phaseName: "Material Availability Check",
    stage: 1,
    departments: ["Procurement"],
    estimatedDuration: "1-2 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "5.1",
        stepName: "Stock Verification",
        icon: "📦",
        department: "Procurement",
        keyActions: "Check inventory for required films, adhesives, inks. Verify sufficient stock for order quantity. Check FIFO compliance.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "5.2",
        stepName: "Material Decision",
        icon: "⚖",
        department: "Procurement",
        keyActions: "Determine if materials are available or need ordering",
        forms: [],
        isPPS: false,
        isDecision: true,
        decisionOptions: [
          { option: "In Stock", consequence: "Proceed to Phase 6 (Cost Estimation)" },
          { option: "Need to Order", consequence: "Get supplier lead time → Add to quotation lead time → Proceed to Phase 6" }
        ]
      }
    ],
    miniDiagram: `flowchart TD
    A["📦 Check<br/>Stock"]
    B{"Material<br/>Available?"}
    C["✅ In Stock<br/>Proceed"]
    D["📞 Get Lead<br/>Time"]
    E["✅ Proceed<br/>with Lead Time"]
    
    A --> B
    B -->|Yes| C
    B -->|No| D
    D --> E`
  },

  // ==================== STAGE 2: QUOTATION & ORDER ====================
  {
    phaseNumber: 6,
    phaseName: "Cost Estimation",
    stage: 2,
    departments: ["Estimation"],
    estimatedDuration: "2-6 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "6.1",
        stepName: "Calculate Material Cost",
        icon: "💵",
        department: "Estimation",
        keyActions: "Calculate raw material cost (Film + Adhesive + Ink + Additives) with waste %.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "6.2",
        stepName: "Calculate Conversion Cost",
        icon: "⚙️",
        department: "Estimation",
        keyActions: "Calculate machine runtime cost (setup + run time × machine rate/hour).",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "6.3",
        stepName: "Add Cylinder/Plate Cost",
        icon: "🎯",
        department: "Estimation",
        keyActions: "Include engraving cost if new artwork (amortize over MOQ).",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "6.4",
        stepName: "Add Overheads & Profit",
        icon: "📈",
        department: "Estimation",
        keyActions: "Add labor (5-10%), utilities (3-5%), overheads (10-15%), profit margin (8-20%).",
        forms: ["Costing Sheet"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["💵 Material"]
    B["⚙️ Conversion"]
    C["🎯 Cylinder"]
    D["📈 OH + Profit"]
    E["✅ Total Cost"]
    
    A --> B
    B --> C
    C --> D
    D --> E`
  },

  {
    phaseNumber: 7,
    phaseName: "Quotation & Negotiation",
    stage: 2,
    departments: ["Sales", "Estimation"],
    estimatedDuration: "2-4 hours (+ negotiation time)",
    criticalPath: true,
    steps: [
      {
        stepId: "7.1",
        stepName: "Generate Quotation",
        icon: "📄",
        department: "Sales",
        keyActions: "Create quotation document with item details, price per unit/kg, lead time, payment terms, validity (30-90 days).",
        forms: ["Quotation"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "7.2",
        stepName: "Send to Customer",
        icon: "📧",
        department: "Sales",
        keyActions: "Email quotation, follow up for confirmation.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "7.3",
        stepName: "Customer Response",
        icon: "⚖",
        department: "Sales",
        keyActions: "Wait for customer acceptance or negotiation request",
        forms: [],
        isPPS: false,
        isDecision: true,
        decisionOptions: [
          { option: "Accepted", consequence: "Proceed to Phase 8 (PO/SO Generation)" },
          { option: "Negotiate Price", consequence: "Revise costing → Resend quotation → Loop" },
          { option: "Rejected", consequence: "Mark as Lost → End process" }
        ]
      }
    ],
    miniDiagram: `flowchart TD
    A["📄 Generate<br/>Quotation"]
    B["📧 Send to<br/>Customer"]
    C{"Customer<br/>Response"}
    D["✅ Accepted<br/>Proceed"]
    E["💬 Negotiate"]
    F["❌ Lost"]
    
    A --> B
    B --> C
    C -->|Accept| D
    C -->|Negotiate| E
    C -->|Reject| F
    E --> A`
  },

  {
    phaseNumber: 8,
    phaseName: "PO/SO Generation",
    stage: 2,
    departments: ["Sales", "Accounts"],
    estimatedDuration: "1-2 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "8.1",
        stepName: "Receive Customer PO",
        icon: "📥",
        department: "Sales",
        keyActions: "Receive signed Purchase Order from customer, verify details match quotation.",
        forms: ["Customer PO"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "8.2",
        stepName: "Generate Sales Order",
        icon: "📝",
        department: "Sales",
        keyActions: "Create internal Sales Order (SO) with SO number, assign to production planner.",
        forms: ["Sales Order (SO)"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "8.3",
        stepName: "Generate Proforma Invoice",
        icon: "💰",
        department: "Accounts",
        keyActions: "If payment terms require advance, generate PI for advance amount.",
        forms: ["Proforma Invoice (PI)"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📥 Receive<br/>PO"]
    B["📝 Create<br/>SO"]
    C["💰 Generate<br/>PI"]
    D["✅ Order<br/>Confirmed"]
    
    A --> B
    B --> C
    C --> D`
  },

  // ==================== STAGE 3: PRE-PRODUCTION (Parallel Phases 9 & 10) ====================
  {
    phaseNumber: 9,
    phaseName: "Material Procurement",
    stage: 3,
    departments: ["Procurement"],
    estimatedDuration: "3-7 days (supplier lead time)",
    parallelWith: 10,
    criticalPath: true,
    steps: [
      {
        stepId: "9.1",
        stepName: "MRP Generation",
        icon: "📊",
        department: "Procurement",
        keyActions: "Generate Material Requirement Planning from SO, calculate exact quantities with waste %.",
        forms: ["MRP Report"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "9.2",
        stepName: "Create Purchase Requisition",
        icon: "📝",
        department: "Procurement",
        keyActions: "Create PR for shortfall materials, get approval from management.",
        forms: ["PR (Purchase Requisition)"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "9.3",
        stepName: "Issue Purchase Orders",
        icon: "📤",
        department: "Procurement",
        keyActions: "Send PO to approved suppliers, track delivery dates.",
        forms: ["Supplier PO"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "9.4",
        stepName: "Goods Receipt & QC",
        icon: "📦",
        department: "Procurement",
        keyActions: "Receive materials, generate GRN, QC inspection for visual defects, thickness, COA verification. Store with FIFO.",
        forms: ["GRN (Goods Receipt Note)", "COA (Certificate of Analysis)"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📊 MRP"]
    B["📝 PR"]
    C["📤 Supplier<br/>PO"]
    D["📦 GRN +<br/>QC"]
    E["✅ Material<br/>Ready"]
    
    A --> B
    B --> C
    C --> D
    D --> E`
  },

  {
    phaseNumber: 10,
    phaseName: "Artwork & Plate Preparation",
    stage: 3,
    departments: ["Prepress"],
    estimatedDuration: "3-7 days (engraving lead time)",
    parallelWith: 9,
    criticalPath: true,
    steps: [
      {
        stepId: "10.1",
        stepName: "Artwork Creation/Editing",
        icon: "🎨",
        department: "Prepress",
        keyActions: "Create final artwork in Adobe Illustrator, adjust dimensions, add registration marks, bleed, trap.",
        forms: ["Artwork File (AI/PDF)"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "10.2",
        stepName: "Customer Artwork Approval",
        icon: "✅",
        department: "Prepress",
        keyActions: "Send digital proof to customer for approval.",
        forms: ["Digital Proof"],
        isPPS: false,
        isDecision: true,
        decisionOptions: [
          { option: "Approved", consequence: "Proceed to Step 10.3 (Plate File Generation)" },
          { option: "Revisions Requested", consequence: "Return to Step 10.1 (Edit artwork) → Loop" }
        ]
      },
      {
        stepId: "10.3",
        stepName: "Plate File Generation",
        icon: "🖨",
        department: "Prepress",
        keyActions: "Separate colors (CMYK or spot), generate plate files for gravure/flexo, calculate repeat length.",
        forms: ["Plate Files"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "10.4",
        stepName: "Cylinder/Plate Engraving",
        icon: "⚙️",
        department: "Prepress",
        keyActions: "Send files to engraving vendor/in-house, engrave cylinders/plates, return to factory.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "10.5",
        stepName: "Plate QC & Storage",
        icon: "🛡️",
        department: "Prepress",
        keyActions: "Inspect cylinders/plates for defects, measure dimensions, store in plate library with SO reference.",
        forms: [],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart TD
    A["🎨 Create<br/>Artwork"]
    B{"Customer<br/>Approval?"}
    C["🖨 Plate<br/>Files"]
    D["⚙️ Engraving"]
    E["🛡️ Plate<br/>QC"]
    F["✅ Ready"]
    
    A --> B
    B -->|Yes| C
    B -->|No| A
    C --> D
    D --> E
    E --> F`
  },

  // ==================== STAGE 4: PRODUCTION & QC ====================
  {
    phaseNumber: 11,
    phaseName: "Production Planning & Scheduling",
    stage: 4,
    departments: ["Production"],
    estimatedDuration: "2-4 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "11.1",
        stepName: "Generate Work Order",
        icon: "📋",
        department: "Production",
        keyActions: "Create WO from SO, assign job number, specify machine, crew, planned start/end dates.",
        forms: ["Work Order (WO)"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "11.2",
        stepName: "Job Scheduling",
        icon: "📅",
        department: "Production",
        keyActions: "Sequence jobs by machine availability, material readiness, delivery urgency, setup similarity.",
        forms: ["Job Card"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "11.3",
        stepName: "Material Issuance",
        icon: "📦",
        department: "Production",
        keyActions: "Pull materials from warehouse (FIFO), issue to production floor with material issue slip.",
        forms: ["Material Issue Slip"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📋 Work<br/>Order"]
    B["📅 Schedule<br/>Job"]
    C["📦 Issue<br/>Material"]
    D["✅ Ready<br/>for Setup"]
    
    A --> B
    B --> C
    C --> D`
  },

  {
    phaseNumber: 12,
    phaseName: "Ink Preparation",
    stage: 4,
    departments: ["Ink Head"],
    estimatedDuration: "2-4 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "12.1",
        stepName: "Ink Color Matching",
        icon: "🎨",
        department: "Ink Head",
        keyActions: "Match customer Pantone/CMYK colors, prepare ink batches, adjust viscosity (15-20 seconds Zahn Cup).",
        forms: ["Ink Recipe"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "12.2",
        stepName: "Ink Approval",
        icon: "✅",
        department: "Ink Head",
        keyActions: "QC verifies color match (Delta E < 2.0), viscosity, pH. Approve for production.",
        forms: [],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["🎨 Mix Ink"]
    B["🧪 Test<br/>Viscosity"]
    C["✅ QC<br/>Approve"]
    D["✅ Ready"]
    
    A --> B
    B --> C
    C --> D`
  },

  {
    phaseNumber: 13,
    phaseName: "Production Execution ⚑ CRITICAL BLOCKING GATES",
    stage: 4,
    departments: ["Production", "QC"],
    estimatedDuration: "4-8 hours setup + trial + 24-48 hours customer PPS wait + production run time",
    criticalPath: true,
    blocking: true,
    steps: [
      {
        stepId: "13.1",
        stepName: "Machine Setup & Material Loading",
        icon: "⚙️",
        department: "Production",
        keyActions: "Mount plates/cylinders, load material rolls (proper tension), thread through machine zones, set initial parameters (speed, temp, pressure).",
        forms: ["Job Card"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "13.2",
        stepName: "Trial Run & Adjustments",
        icon: "🔧",
        department: "Production",
        keyActions: "Run 50-100 meters trial, check registration (±0.5mm), color density (ΔE < 2.0), tension, lamination bond. Adjust iteratively.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "13.3",
        stepName: "PPS Manufacturing (Pre-Production Sample)",
        icon: "🧪",
        department: "Production",
        keyActions: "Run 100-500 pieces at final approved parameters, collect samples from start/middle/end of run.",
        forms: ["PPS Report"],
        isPPS: true,
        isDecision: false
      },
      {
        stepId: "13.4",
        stepName: "⚑ PPS QC Approval - BLOCKING GATE",
        icon: "🛡️",
        department: "QC",
        keyActions: "MANDATORY QC INSPECTION: Visual check, color matching (ΔE < 2.0), registration (±0.5mm), tensile/seal strength, dimensional accuracy (±2-5%), functional tests (zipper/spout/valve).",
        forms: ["IPrQC (In-Process Print QC)", "ILmQC (Lamination QC)", "ISlQC (Slitting QC)", "IHSQC (Heat Seal QC)", "FAI Report"],
        isPPS: true,
        isDecision: true,
        isQualityGate: true,
        gateNumber: 5,
        decisionOptions: [
          { option: "QC APPROVED", consequence: "✅ Proceed to Step 13.5 (Customer PPS Approval)" },
          { option: "QC REJECTED", consequence: "❌ STOP PRODUCTION → Return to Step 13.2 (Re-run trial & new PPS)" }
        ]
      },
      {
        stepId: "13.5",
        stepName: "⚑ Customer PPS Approval - BLOCKING GATE (24-48 hrs wait)",
        icon: "✅",
        department: "Sales",
        keyActions: "MANDATORY CUSTOMER APPROVAL: Send PPS samples via courier, customer tests visual appearance, functional performance, barrier properties (lab tests if required). PRODUCTION CANNOT START WITHOUT THIS APPROVAL.",
        forms: [],
        isPPS: true,
        isDecision: true,
        isQualityGate: true,
        gateNumber: 6,
        decisionOptions: [
          { option: "CUSTOMER APPROVED", consequence: "✅ Proceed to Step 13.6 (Full Production Run) - CLEARED TO MANUFACTURE" },
          { option: "CUSTOMER REJECTED", consequence: "❌ STOP PRODUCTION → Return to Step 13.2 (Re-run trial & new PPS) + Investigate root cause" }
        ]
      },
      {
        stepId: "13.6",
        stepName: "Full Production Run",
        icon: "▶️",
        department: "Production",
        keyActions: "START FULL QUANTITY PRODUCTION at approved parameters. Continuous monitoring of speed, tension, temperature, registration.",
        forms: ["Job Card"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "13.7",
        stepName: "In-Process QC Monitoring (every 30-60 mins)",
        icon: "👁️",
        department: "QC",
        keyActions: "Regular checks during full run: registration (±0.5mm), color density (ΔE < 2.0), tension, thickness, visual defects. Alert if deviation.",
        forms: ["IPrQC", "ILmQC", "ISlQC", "IHSQC"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart TD
    A["⚙️ Setup<br/>2-4 hrs"]
    B["🔧 Trial Run<br/>1-2 hrs"]
    C["🧪 PPS<br/>Manufacturing"]
    D{"🛡️ QC<br/>Approval<br/>⚑ GATE 5"}
    E{"✅ Customer<br/>Approval<br/>⚑ GATE 6<br/>24-48 hrs"}
    F["▶️ Full<br/>Production"]
    G["👁️ In-Process<br/>QC"]
    X["❌ Re-run<br/>PPS"]

    A --> B
    B --> C
    C --> D
    D -->|Approve| E
    D -.->|Reject| X
    E -->|Approve| F
    E -.->|Reject| X
    X --> B
    F --> G
    G --> F

    style D fill:#ffcccb,stroke:#d32f2f,stroke-width:3px
    style E fill:#ffcccb,stroke:#d32f2f,stroke-width:3px
    style C fill:#fff9c4,stroke:#fbc02d,stroke-width:2px
    style D fill:#fff9c4,stroke:#fbc02d,stroke-width:2px
    style E fill:#fff9c4,stroke:#fbc02d,stroke-width:2px`
  },

  {
    phaseNumber: 14,
    phaseName: "Final QC & Packaging",
    stage: 4,
    departments: ["QC", "Production"],
    estimatedDuration: "2-4 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "14.1",
        stepName: "Final QC Inspection",
        icon: "🛡️",
        department: "QC",
        keyActions: "Inspect finished goods: visual defects, dimensional accuracy, seal strength, functional tests. Sample 5-10% of batch (AQL standards).",
        forms: ["Final QC Report"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "14.2",
        stepName: "COA/COC Generation",
        icon: "📄",
        department: "QC",
        keyActions: "Generate Certificate of Analysis (COA) or Certificate of Conformance (COC) with test results.",
        forms: ["COA", "COC"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "14.3",
        stepName: "Packaging & Labeling",
        icon: "📦",
        department: "Production",
        keyActions: "Pack finished goods in cartons/pallets, apply labels (SO number, batch, quantity, date), shrink-wrap pallets.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "14.4",
        stepName: "Move to FG Warehouse",
        icon: "🏭",
        department: "Production",
        keyActions: "Transfer to finished goods warehouse, update inventory system.",
        forms: ["FG Transfer Note"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["🛡️ Final<br/>QC"]
    B["📄 COA/COC"]
    C["📦 Packaging"]
    D["🏭 FG<br/>Warehouse"]
    E["✅ Ready to<br/>Ship"]
    
    A --> B
    B --> C
    C --> D
    D --> E`
  },

  // ==================== STAGE 5: DELIVERY & CLOSE ====================
  {
    phaseNumber: 15,
    phaseName: "Invoicing",
    stage: 5,
    departments: ["Accounts"],
    estimatedDuration: "1-2 hours",
    criticalPath: true,
    steps: [
      {
        stepId: "15.1",
        stepName: "Final Costing & Variance Analysis",
        icon: "💰",
        department: "Accounts",
        keyActions: "Calculate actual job cost (material consumed, machine hours, labor, waste), compare vs. estimated, analyze variance.",
        forms: ["Job Costing Report"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "15.2",
        stepName: "Generate Tax Invoice",
        icon: "🧾",
        department: "Accounts",
        keyActions: "Create tax invoice with GST/VAT, reference SO/DN, payment terms, bank details.",
        forms: ["Tax Invoice"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "15.3",
        stepName: "Send Invoice to Customer",
        icon: "📧",
        department: "Accounts",
        keyActions: "Email invoice copy, add to accounts receivable, schedule follow-ups.",
        forms: [],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["💰 Job<br/>Costing"]
    B["🧾 Generate<br/>Invoice"]
    C["📧 Send to<br/>Customer"]
    D["✅ Billed"]
    
    A --> B
    B --> C
    C --> D`
  },

  {
    phaseNumber: 16,
    phaseName: "Delivery & Logistics",
    stage: 5,
    departments: ["Logistics"],
    estimatedDuration: "4-48 hours (depends on distance)",
    criticalPath: true,
    steps: [
      {
        stepId: "16.1",
        stepName: "Generate Delivery Note",
        icon: "📋",
        department: "Logistics",
        keyActions: "Create DN with SO reference, item details, quantity, vehicle details.",
        forms: ["Delivery Note (DN)", "E-way Bill"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "16.2",
        stepName: "Coordinate Shipping",
        icon: "🚚",
        department: "Logistics",
        keyActions: "Arrange transport (own vehicles or third-party), load goods, seal truck, dispatch.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "16.3",
        stepName: "Track Delivery",
        icon: "📍",
        department: "Logistics",
        keyActions: "Track vehicle location, update customer, confirm delivery receipt.",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "16.4",
        stepName: "Customer Sign-Off",
        icon: "✍️",
        department: "Logistics",
        keyActions: "Obtain signed DN copy from customer, return to office for records.",
        forms: ["Signed DN"],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📋 DN +<br/>E-way Bill"]
    B["🚚 Dispatch"]
    C["📍 Track"]
    D["✍️ Customer<br/>Sign-Off"]
    E["✅ Delivered"]
    
    A --> B
    B --> C
    C --> D
    D --> E`
  },

  {
    phaseNumber: 17,
    phaseName: "Post-Delivery & Feedback",
    stage: 5,
    departments: ["Sales", "QC"],
    estimatedDuration: "1-7 days",
    criticalPath: false,
    steps: [
      {
        stepId: "17.1",
        stepName: "Customer Feedback Collection",
        icon: "📞",
        department: "Sales",
        keyActions: "Follow up after 2-3 days, ask about product performance, printing quality, delivery experience.",
        forms: ["Customer Feedback Form"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "17.2",
        stepName: "Handle Complaints/RMA",
        icon: "⚠️",
        department: "Sales",
        keyActions: "If issues reported, investigate root cause, initiate RMA (Return Material Authorization), offer replacement/credit.",
        forms: ["RMA Form", "Complaint Log"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "17.3",
        stepName: "Close Order",
        icon: "✅",
        department: "Sales",
        keyActions: "Mark SO as complete, archive job files, update customer history for repeat order reference.",
        forms: [],
        isPPS: false,
        isDecision: false
      }
    ],
    miniDiagram: `flowchart LR
    A["📞 Feedback<br/>Call"]
    B{"Issues?"}
    C["⚠️ Handle<br/>RMA"]
    D["✅ Close<br/>Order"]
    
    A --> B
    B -->|No| D
    B -->|Yes| C
    C --> D`
  }
];

// Process Rules
export const processRules = [
  {
    ruleNumber: 1,
    ruleName: "Artwork Before Plates",
    description: "Customer artwork must be approved BEFORE sending plate files for engraving. Changes after engraving incur re-engraving charges.",
    enforcement: "MANDATORY"
  },
  {
    ruleNumber: 2,
    ruleName: "PPS/FAI is Non-Negotiable",
    description: "Phase 13 PPS approval (QC + Customer) is MANDATORY for ALL orders (new & repeat). NO EXCEPTIONS. Full production CANNOT start without both approvals.",
    enforcement: "MANDATORY"
  },
  {
    ruleNumber: 3,
    ruleName: "Parallel Processing (Phases 9 & 10)",
    description: "Material procurement and artwork/plate preparation run concurrently to save time. Production planning starts only when BOTH are complete.",
    enforcement: "RECOMMENDED"
  },
  {
    ruleNumber: 4,
    ruleName: "Repeat Order Shortcut",
    description: "For repeat orders with same artwork: Skip Phases 3, 10 (reuse existing plates from plate library). Still require PPS approval in Phase 13.",
    enforcement: "ALLOWED"
  },
  {
    ruleNumber: 5,
    ruleName: "FIFO Material Usage",
    description: "Materials MUST be issued following First-In-First-Out to prevent expiry/degradation. Check batch dates during Phase 9.4 and 11.3.",
    enforcement: "MANDATORY"
  },
  {
    ruleNumber: 6,
    ruleName: "Change Orders",
    description: "Mid-production changes (quantity, color, size) trigger Change Order workflow: Re-costing → Customer approval → Job Card update → Restart affected phases.",
    enforcement: "MANDATORY"
  },
  {
    ruleNumber: 7,
    ruleName: "Job Sequencing Optimization",
    description: "Schedule similar jobs consecutively to minimize machine changeovers (e.g., same color family, similar material gauge). Use Phase 11.2 for optimal sequencing.",
    enforcement: "RECOMMENDED"
  }
];

// Abbreviations/Glossary
export const abbreviations = [
  { term: "RFQ", fullForm: "Request for Quotation", description: "Customer inquiry document" },
  { term: "CSE", fullForm: "Customer Sample Evaluation", description: "QC analysis of physical sample" },
  { term: "TDS", fullForm: "Technical Data Sheet", description: "Product specification document" },
  { term: "MOQ", fullForm: "Minimum Order Quantity", description: "Smallest quantity economically viable" },
  { term: "PI", fullForm: "Proforma Invoice", description: "Advance payment request" },
  { term: "PO", fullForm: "Purchase Order", description: "Customer's order confirmation" },
  { term: "SO", fullForm: "Sales Order", description: "Internal production order" },
  { term: "MRP", fullForm: "Material Requirement Planning", description: "Material calculation sheet" },
  { term: "PR", fullForm: "Purchase Requisition", description: "Internal purchase request" },
  { term: "GRN", fullForm: "Goods Receipt Note", description: "Material received confirmation" },
  { term: "COA", fullForm: "Certificate of Analysis", description: "Material test certificate" },
  { term: "FIFO", fullForm: "First In First Out", description: "Inventory rotation method" },
  { term: "WO", fullForm: "Work Order", description: "Production instruction document" },
  { term: "JC", fullForm: "Job Card", description: "Shop floor job tracking sheet" },
  { term: "PPS", fullForm: "Pre-Production Sample", description: "Trial run sample for approval" },
  { term: "FAI", fullForm: "First Article Inspection", description: "Initial product verification (same as PPS)" },
  { term: "IPrQC", fullForm: "In-Process Print QC", description: "Print quality check form" },
  { term: "ILmQC", fullForm: "In-Process Lamination QC", description: "Lamination bond check form" },
  { term: "ISlQC", fullForm: "In-Process Slitting QC", description: "Cutting/width check form" },
  { term: "IHSQC", fullForm: "In-Process Heat Seal QC", description: "Seal strength check form" },
  { term: "COC", fullForm: "Certificate of Conformance", description: "Product compliance certificate" },
  { term: "DN", fullForm: "Delivery Note", description: "Shipping document" },
  { term: "RMA", fullForm: "Return Material Authorization", description: "Product return approval" },
  { term: "GMP", fullForm: "Good Manufacturing Practices", description: "Quality standards" }
];

// Industry Certifications
export const certifications = [
  {
    category: "Food Safety",
    certifications: ["BRC (British Retail Consortium)", "FSSC 22000", "ISO 22000", "FDA Compliance"],
    relevance: "Required for food contact packaging (LAM, LID, WAL)"
  },
  {
    category: "Quality Management",
    certifications: ["ISO 9001:2015", "Six Sigma", "Lean Manufacturing"],
    relevance: "General quality systems"
  },
  {
    category: "Environmental",
    certifications: ["ISO 14001", "FSC/PEFC (Forest Stewardship)", "Recyclable/Compostable Claims"],
    relevance: "Sustainability and environmental compliance"
  },
  {
    category: "Product Safety",
    certifications: ["Reach Compliance (EU)", "RoHS Compliance", "California Prop 65"],
    relevance: "Chemical safety for specific markets"
  },
  {
    category: "Customer-Specific",
    certifications: ["Walmart SQEP", "Amazon APASS", "Customer Audits"],
    relevance: "Retailer-mandated audits"
  }
];

export default {
  departmentConfig,
  stageGroups,
  workflowPhases,
  processRules,
  abbreviations,
  certifications
};
