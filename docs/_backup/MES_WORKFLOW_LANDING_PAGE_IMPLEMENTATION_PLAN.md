# MES Workflow Landing Page - Implementation Plan

## Executive Summary
Create a **QuickBooks-inspired workflow landing page** for the MES (Manufacturing Execution System) module visualizing the complete **17-phase flexible packaging production workflow** from Customer Inquiry to Post-Delivery & Feedback.

**Design Source**: v4 specifications in `MES_Research_Notes.md` + reference implementation in `FP_OPW.html`

---

## 1. Design Specifications

### 1.1 QuickBooks-Inspired Layout Components

#### A. **Pipeline Navigation Bar** (Horizontal, Sticky Top)
- **Location**: Fixed at top below topbar (z-index: 200)
- **Structure**: 5 major stage groups with clickable phase circles
- **Visual**: Phase number circles with connecting arrows (▶)
- **Interaction**: Click to jump directly to any phase, smooth scroll

```jsx
// Example structure from FP_OPW.html
<nav className="pipeline">
  <a className="pipe-item" href="#stage1">
    <span className="pipe-num" style={{background: 'var(--sales)'}}>1</span> Pre-Sales
  </a>
  <span className="pipe-arrow">&#9658;</span>
  {/* ... more stages */}
</nav>
```

#### B. **Collapsible Stage Cards** (Main Content Area)
Each of 17 phases displayed as expandable cards containing:

1. **Stage Header**
   - Phase number + name
   - Subtitle showing mini-workflow: "Inquiry → Registration → Tech Review → MOQ → Material Check"
   - Department chips (color-coded)
   - Expand/collapse toggle

2. **Stage Body** (when expanded)
   - **Department Row**: Color-coded chips showing all involved departments
   - **5-Column Process Table**:
     | Icon | Step | Department | Key Actions | Forms / Documents |
     |------|------|------------|-------------|-------------------|
     | 📧   | 1.1 Customer Inquiry | Sales | Receive inquiry... | RFQ |
   
   - **Decision Rows**: Pink background for branch points (e.g., "New Customer? Yes → Registration | No → Tech Review")
   - **Mini Mermaid Diagram**: Flowchart showing that specific phase's flow

3. **Visual Treatments**
   - **Quality Gate Rows**: Red badge with ⚑ symbol for gates (e.g., "🛡️ PPS/FAI Approval - QC")
   - **PPS Critical Steps**: Yellow background for Phase 13 steps 13.4-13.6 (mandatory blocking gates)
   - **Parallel Processing**: Phases 9 & 10 shown side-by-side with "⚡ Runs in Parallel" indicator

#### C. **Reference Panels** (Bottom of Page)
Four collapsible sections:
1. **Departments** (10 cards with roles, responsibilities, current personnel)
2. **Process Rules** (7 critical rules with descriptions)
3. **Abbreviations** (24 terms with full definitions)
4. **Certifications** (5 categories with certificate details)

---

## 2. Complete 17-Phase Workflow Data Structure

### Phase Grouping (5 Major Stages)
1. **Stage 1: Pre-Sales** (Phases 1-5)
2. **Stage 2: Quotation & Order** (Phases 6-8)
3. **Stage 3: Pre-Production** (Phases 9-10, parallel)
4. **Stage 4: Production & QC** (Phases 11-14, includes critical PPS gates)
5. **Stage 5: Delivery & Close** (Phases 15-17)

### JSON Schema for Workflow Data

```typescript
interface Phase {
  phaseNumber: number;
  phaseName: string;
  stage: number; // Which of 5 major stages
  departments: string[]; // ["Sales", "QC", etc.]
  steps: Step[];
  qualityGates: QualityGate[];
  parallelWith?: number; // e.g., Phase 9 parallelWith: 10
  criticalPath: boolean;
  blocking: boolean; // Has mandatory blocking gates
  estimatedDuration: string; // "1-2 hours", "24-48 hours"
  miniDiagram: string; // Mermaid.js markdown syntax
}

interface Step {
  stepId: string; // "1.1", "13.4"
  stepName: string;
  icon: string; // Unicode emoji or icon name
  department: string;
  keyActions: string;
  forms: string[]; // ["RFQ", "CSE"]
  isPPS: boolean; // Yellow highlight if true
  isDecision: boolean; // Pink highlight if true
  decisionOptions?: {
    option: string;
    consequence: string;
  }[];
}

interface QualityGate {
  gateNumber: number; // 1-8
  name: string;
  phase: number;
  blocking: boolean;
  failureAction: string;
  tests: string[];
  icon: string; // "⚑" for gates
}
```

### Sample Phase Data (Phase 13 - Production Execution)

```javascript
const phases = [
  // ... Phases 1-12 ...
  {
    phaseNumber: 13,
    phaseName: "Production Execution",
    stage: 4,
    departments: ["Production", "QC"],
    steps: [
      {
        stepId: "13.1",
        stepName: "Setup & Material Loading",
        icon: "⚙️",
        department: "Production",
        keyActions: "Mount plates/cylinders, load material rolls, thread through machine, initial settings",
        forms: ["Job Card"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "13.2",
        stepName: "Trial Run & Adjustments",
        icon: "🔧",
        department: "Production",
        keyActions: "Run 50-100 meters trial, check registration, color density, tension, adjust iteratively",
        forms: [],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "13.3",
        stepName: "PPS Manufacturing (Pre-Production Sample)",
        icon: "🧪",
        department: "Production",
        keyActions: "Run 100-500 pieces at final parameters, collect samples from start/middle/end",
        forms: ["PPS Report"],
        isPPS: true, // YELLOW HIGHLIGHTING STARTS
        isDecision: false
      },
      {
        stepId: "13.4",
        stepName: "PPS QC Approval - BLOCKING GATE ⚑",
        icon: "🛡️",
        department: "QC",
        keyActions: "Visual inspection, color matching (ΔE < 2.0), registration (±0.5mm), tensile/seal strength, dimensional accuracy",
        forms: ["IPrQC", "ILmQC", "ISlQC", "IHSQC", "FAI Report"],
        isPPS: true,
        isDecision: true,
        decisionOptions: [
          { option: "Approve", consequence: "Proceed to Step 13.5 (Customer PPS Approval)" },
          { option: "Reject", consequence: "Return to Step 13.2 (re-run trial and new PPS)" }
        ]
      },
      {
        stepId: "13.5",
        stepName: "Customer PPS Approval - BLOCKING GATE ⚑ (24-48 hrs wait)",
        icon: "✅",
        department: "Sales",
        keyActions: "Send PPS samples to customer, wait for testing and approval",
        forms: [],
        isPPS: true, // YELLOW HIGHLIGHTING ENDS
        isDecision: true,
        decisionOptions: [
          { option: "Customer Approves", consequence: "Proceed to Step 13.6 (Full Production)" },
          { option: "Customer Rejects", consequence: "Return to Step 13.2 (re-run trial and new PPS)" }
        ]
      },
      {
        stepId: "13.6",
        stepName: "Full Production Run",
        icon: "▶️",
        department: "Production",
        keyActions: "Start full quantity production at approved parameters, continuous monitoring",
        forms: ["Job Card"],
        isPPS: false,
        isDecision: false
      },
      {
        stepId: "13.7",
        stepName: "In-Process QC Monitoring (every 30-60 mins)",
        icon: "👁️",
        department: "QC",
        keyActions: "Check registration, color density, tension, thickness, visual defects throughout run",
        forms: ["IPrQC", "ILmQC", "ISlQC", "IHSQC"],
        isPPS: false,
        isDecision: false
      }
    ],
    qualityGates: [
      {
        gateNumber: 5,
        name: "PPS/FAI Approval - QC",
        phase: 13,
        blocking: true,
        failureAction: "Re-run PPS (return to trial run and adjustments)",
        tests: [
          "Visual inspection",
          "Color matching (ΔE < 2.0)",
          "Registration (±0.5mm)",
          "Tensile strength",
          "Seal strength",
          "Dimensional accuracy (±2-5%)",
          "Functional testing (zipper/spout/valve)"
        ],
        icon: "⚑"
      },
      {
        gateNumber: 6,
        name: "PPS/FAI Approval - Customer",
        phase: 13,
        blocking: true,
        failureAction: "Re-run PPS (return to trial run and adjustments)",
        tests: [
          "Customer visual inspection",
          "Customer functional testing",
          "Customer lab testing (barrier properties if applicable)"
        ],
        icon: "⚑"
      },
      {
        gateNumber: 7,
        name: "In-Process Monitoring",
        phase: 13,
        blocking: false,
        failureAction: "Alert & Adjust (stop machine if critical, adjust parameters, quarantine defective material, resume after corrections)",
        tests: [
          "Print registration (±0.5mm)",
          "Color density (ΔE < 2.0)",
          "Web tension",
          "Thickness",
          "Visual defects"
        ],
        icon: "⚑"
      }
    ],
    parallelWith: null,
    criticalPath: true,
    blocking: true, // MOST CRITICAL PHASE
    estimatedDuration: "2-4 hrs setup + 1-2 hrs trial + PPS + 24-48 hrs customer wait + hours/days production",
    miniDiagram: `
flowchart TD
    A["Setup<br/>2-4 hrs"]
    B["Trial Run<br/>1-2 hrs"]
    C["PPS Manufacturing<br/>100-500 pcs"]
    D{"QC Approval<br/>⚑ GATE"}
    E{"Customer Approval<br/>⚑ GATE<br/>24-48 hrs"}
    F["Full Production<br/>Run"]
    G["In-Process<br/>QC Monitoring"]
    X["Re-run PPS"]

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

    style D fill:#ffcccb
    style E fill:#ffcccb
    style C fill:#fff9c4
    style D fill:#fff9c4
    style E fill:#fff9c4
`
  },
  // ... Phases 14-17 ...
];
```

---

## 3. Department Color Coding System

```javascript
const departmentConfig = {
  Sales: {
    color: "#1976d2", // Blue
    bgColor: "#e3f2fd",
    colorVar: "--sales",
    bgVar: "--sales-bg",
    responsibilities: [
      "RFQ handling",
      "Quotation",
      "PO/SO processing",
      "PPS approval coordination",
      "Customer complaints"
    ],
    icon: "👥"
  },
  QC: {
    color: "#d32f2f", // Red (quality focus)
    bgColor: "#ffebee",
    colorVar: "--qc",
    bgVar: "--qc-bg",
    responsibilities: [
      "Sample evaluation (CSE)",
      "TDS creation",
      "Material QC",
      "Plate QC",
      "Ink approval",
      "PPS/FAI testing",
      "In-process QC",
      "Final QC",
      "COA/COC generation"
    ],
    icon: "🛡️"
  },
  Prepress: {
    color: "#7b1fa2", // Purple (creative)
    bgColor: "#f3e5f5",
    colorVar: "--prepress",
    bgVar: "--prepress-bg",
    responsibilities: [
      "Artwork creation/editing",
      "Color separation",
      "Digital proofing",
      "Plate file generation",
      "Engraving coordination",
      "Plate storage"
    ],
    icon: "🎨"
  },
  Estimation: {
    color: "#f57c00", // Orange (costing)
    bgColor: "#fff3e0",
    colorVar: "--estimation",
    bgVar: "--estimation-bg",
    responsibilities: [
      "Cost calculation (9 components)",
      "Pricing strategy",
      "MOQ analysis",
      "Change order impact"
    ],
    icon: "🧮"
  },
  Procurement: {
    color: "#388e3c", // Green (supply)
    bgColor: "#e8f5e9",
    colorVar: "--procurement",
    bgVar: "--procurement-bg",
    responsibilities: [
      "MRP execution",
      "Stock management",
      "Purchasing",
      "GRN processing",
      "FIFO enforcement",
      "Material issuance"
    ],
    icon: "🛒"
  },
  Production: {
    color: "#f57c00", // Orange (manufacturing)
    bgColor: "#fff3e0",
    colorVar: "--production",
    bgVar: "--production-bg",
    responsibilities: [
      "Production scheduling",
      "Job card generation",
      "Machine setup",
      "PPS manufacturing",
      "Full run execution",
      "Waste tracking",
      "Plate cleaning"
    ],
    icon: "⚙️"
  },
  "Ink Head": {
    color: "#e91e63", // Pink (ink colors)
    bgColor: "#fce4ec",
    colorVar: "--inkhead",
    bgVar: "--inkhead-bg",
    responsibilities: [
      "Ink formulation",
      "Color matching (Pantone/CMYK)",
      "Viscosity testing",
      "Recipe documentation"
    ],
    icon: "🧪"
  },
  Maintenance: {
    color: "#5e35b1", // Indigo (technical)
    bgColor: "#ede7f6",
    colorVar: "--maintenance",
    bgVar: "--maintenance-bg",
    responsibilities: [
      "Preventive maintenance",
      "Breakdown response",
      "Equipment calibration",
      "Spare parts management"
    ],
    icon: "🔧"
  },
  Accounts: {
    color: "#00897b", // Teal (finance)
    bgColor: "#e0f2f1",
    colorVar: "--accounts",
    bgVar: "--accounts-bg",
    responsibilities: [
      "Credit check",
      "Payment terms",
      "PI generation",
      "Invoicing",
      "Collections",
      "Job costing"
    ],
    icon: "💰"
  },
  Logistics: {
    color: "#6a1b9a", // Violet (movement)
    bgColor: "#f3e5f5",
    colorVar: "--logistics",
    bgVar: "--logistics-bg",
    responsibilities: [
      "FG inventory",
      "Packaging materials",
      "DN generation",
      "Carrier coordination",
      "Shipping",
      "Delivery tracking",
      "RMA processing"
    ],
    icon: "🚚"
  }
};
```

---

## 4. React Component Architecture

### Component Hierarchy

```
MES_Module/
├── WorkflowLandingPage.jsx (Main Container)
│   ├── Topbar.jsx (Company logo, title)
│   ├── PipelineNavigation.jsx (Horizontal stage bar)
│   ├── StageCardsContainer.jsx (Scrollable main area)
│   │   └── StageCard.jsx (One per stage, repeats for 5 stages)
│   │       ├── StageHeader.jsx (Number, name, subtitle, toggle)
│   │       ├── DepartmentChips.jsx (Color-coded dept badges)
│   │       ├── ProcessTable.jsx (5-column table)
│   │       │   ├── ProcessRow.jsx (Regular step)
│   │       │   ├── DecisionRow.jsx (Pink decision branch)
│   │       │   ├── PPSRow.jsx (Yellow PPS critical step)
│   │       │   └── QualityGateRow.jsx (Red gate with ⚑)
│   │       └── MiniWorkflowDiagram.jsx (Mermaid.js integration)
│   └── ReferencePanels.jsx (Bottom collapsible sections)
│       ├── DepartmentsPanel.jsx (10 department cards)
│       ├── ProcessRulesPanel.jsx (7 rules)
│       ├── AbbreviationsPanel.jsx (24 terms)
│       └── CertificationsPanel.jsx (5 categories)
└── BackToTopButton.jsx (Fixed bottom-right scroll button)
```

### Component Specifications

#### **WorkflowLandingPage.jsx**
```jsx
import React, { useState, useEffect } from 'react';
import { workflowData } from './data/workflowData';
import PipelineNavigation from './PipelineNavigation';
import StageCardsContainer from './StageCardsContainer';
import ReferencePanels from './ReferencePanels';
import './WorkflowLandingPage.css';

const WorkflowLandingPage = () => {
  const [expandedStages, setExpandedStages] = useState([1, 2, 3, 4, 5]); // All expanded by default
  const [activeStage, setActiveStage] = useState(1);

  useEffect(() => {
    // Intersection Observer for pipeline navigation highlight
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const stageNum = parseInt(entry.target.id.replace('stage', ''));
            setActiveStage(stageNum);
          }
        });
      },
      { threshold: 0.5 }
    );

    document.querySelectorAll('.stage').forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const toggleStage = (stageNum) => {
    setExpandedStages(prev =>
      prev.includes(stageNum)
        ? prev.filter(s => s !== stageNum)
        : [...prev, stageNum]
    );
  };

  return (
    <div className="workflow-landing-page">
      <PipelineNavigation 
        stages={[1, 2, 3, 4, 5]} 
        activeStage={activeStage}
        stageNames={["Pre-Sales", "Quotation & Order", "Pre-Production", "Production & QC", "Delivery & Close"]}
      />
      
      <StageCardsContainer 
        workflowData={workflowData}
        expandedStages={expandedStages}
        onToggleStage={toggleStage}
      />
      
      <ReferencePanels />
    </div>
  );
};

export default WorkflowLandingPage;
```

#### **PipelineNavigation.jsx**
```jsx
import React from 'react';
import './PipelineNavigation.css';

const PipelineNavigation = ({ stages, activeStage, stageNames }) => {
  const scrollToStage = (stageNum) => {
    document.getElementById(`stage${stageNum}`)?.scrollIntoView({ 
      behavior: 'smooth',
      block: 'start'
    });
  };

  return (
    <nav className="pipeline">
      {stages.map((stageNum, index) => (
        <React.Fragment key={stageNum}>
          <a 
            className={`pipe-item ${activeStage === stageNum ? 'active' : ''}`}
            onClick={() => scrollToStage(stageNum)}
          >
            <span 
              className="pipe-num" 
              style={{ background: `var(--stage-${stageNum}-color)` }}
            >
              {stageNum}
            </span>
            {stageNames[index]}
          </a>
          {index < stages.length - 1 && (
            <span className="pipe-arrow">&#9658;</span>
          )}
        </React.Fragment>
      ))}
      
      <a className="pipe-item pipe-ref" onClick={() => scrollToStage('dept-ref')}>
        &#128203; Departments
      </a>
      <a className="pipe-item" onClick={() => scrollToStage('abbr-ref')}>
        &#128209; Abbreviations
      </a>
    </nav>
  );
};

export default PipelineNavigation;
```

#### **ProcessTable.jsx** (5-Column Table with Special Rows)
```jsx
import React from 'react';
import ProcessRow from './ProcessRow';
import DecisionRow from './DecisionRow';
import PPSRow from './PPSRow';
import QualityGateRow from './QualityGateRow';
import './ProcessTable.css';

const ProcessTable = ({ steps, qualityGates, departments }) => {
  return (
    <table className="flow-table">
      <thead>
        <tr>
          <th></th>
          <th>Step</th>
          <th>Department</th>
          <th>Key Actions</th>
          <th>Forms / Documents</th>
        </tr>
      </thead>
      <tbody>
        {steps.map(step => {
          if (step.isDecision) {
            return <DecisionRow key={step.stepId} step={step} />;
          }
          if (step.isPPS || qualityGates.some(g => g.stepId === step.stepId)) {
            return <PPSRow key={step.stepId} step={step} qualityGate={qualityGates.find(g => g.stepId === step.stepId)} />;
          }
          return <ProcessRow key={step.stepId} step={step} />;
        })}
      </tbody>
    </table>
  );
};

export default ProcessTable;
```

#### **MiniWorkflowDiagram.jsx** (Mermaid.js Integration)
```jsx
import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
  flowchart: {
    curve: 'basis',
    padding: 20
  }
});

const MiniWorkflowDiagram = ({ diagramDefinition, phaseId }) => {
  const containerRef = useRef(null);
  const [error, setError] = React.useState(null);

  useEffect(() => {
    if (containerRef.current && diagramDefinition) {
      try {
        const id = `mermaid-diagram-${phaseId}`;
        mermaid.render(id, diagramDefinition, (svgCode) => {
          containerRef.current.innerHTML = svgCode;
        });
      } catch (err) {
        console.error('Mermaid diagram error:', err);
        setError('Failed to render diagram');
      }
    }
  }, [diagramDefinition, phaseId]);

  if (error) {
    return <div className="diagram-error">{error}</div>;
  }

  return (
    <div className="chart-box">
      <div ref={containerRef} className="mermaid-diagram" />
    </div>
  );
};

export default MiniWorkflowDiagram;
```

---

## 5. CSS Custom Properties & Styling

### CSS Variables (Department Colors)

```css
:root {
  /* Department Colors */
  --sales: #1976d2;
  --sales-bg: #e3f2fd;
  --qc: #d32f2f;
  --qc-bg: #ffebee;
  --prepress: #7b1fa2;
  --prepress-bg: #f3e5f5;
  --estimation: #f57c00;
  --estimation-bg: #fff3e0;
  --procurement: #388e3c;
  --procurement-bg: #e8f5e9;
  --production: #f57c00;
  --production-bg: #fff3e0;
  --inkhead: #e91e63;
  --inkhead-bg: #fce4ec;
  --maintenance: #5e35b1;
  --maintenance-bg: #ede7f6;
  --accounts: #00897b;
  --accounts-bg: #e0f2f1;
  --logistics: #6a1b9a;
  --logistics-bg: #f3e5f5;

  /* Stage Colors */
  --stage-1-color: #0d47a1; /* Pre-Sales */
  --stage-2-color: #f57c00; /* Quotation & Order */
  --stage-3-color: #388e3c; /* Pre-Production */
  --stage-4-color: #d32f2f; /* Production & QC */
  --stage-5-color: #6a1b9a; /* Delivery & Close */

  /* UI Colors */
  --decision-bg: #fce4ec; /* Pink for decision rows */
  --pps-bg: #fff9c4; /* Yellow for PPS critical steps */
  --gate-bg: #ffcccb; /* Light red for quality gates */
  --gate-icon-color: #d32f2f; /* Red for ⚑ icon */
}
```

### Key CSS Classes

```css
/* Pipeline Navigation */
.pipeline {
  position: sticky;
  top: 60px; /* Below topbar */
  background: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  z-index: 200;
  display: flex;
  align-items: center;
  padding: 12px 24px;
  gap: 12px;
  overflow-x: auto;
}

.pipe-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f5f5f5;
  border-radius: 8px;
  text-decoration: none;
  color: #333;
  font-weight: 500;
  transition: all 0.3s;
  cursor: pointer;
}

.pipe-item.active {
  background: linear-gradient(135deg, #1976d2, #42a5f5);
  color: white;
  box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);
}

.pipe-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 700;
  font-size: 16px;
}

.pipe-arrow {
  color: #1976d2;
  font-size: 20px;
}

/* Stage Cards */
.stage {
  margin: 24px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
  overflow: hidden;
  transition: all 0.3s;
}

.stage-head {
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  cursor: pointer;
  transition: all 0.3s;
}

.stage-head:hover {
  filter: brightness(1.1);
}

.snum {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(255,255,255,0.3);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}

.stage-info h2 {
  margin: 0;
  color: white;
  font-size: 24px;
}

.sub {
  color: rgba(255,255,255,0.9);
  font-size: 14px;
  margin-top: 4px;
}

/* Department Chips */
.dept-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.chip {
  padding: 6px 12px;
  border-radius: 16px;
  font-size: 13px;
  font-weight: 500;
}

/* Process Table */
.flow-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 20px;
}

.flow-table th {
  background: #f5f5f5;
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #ddd;
}

.flow-table td {
  padding: 16px 12px;
  border-bottom: 1px solid #eee;
  vertical-align: top;
}

.step-icon {
  font-size: 24px;
  text-align: center;
  width: 50px;
}

.step-name {
  font-weight: 600;
  color: #333;
  min-width: 200px;
}

.step-dept {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 8px;
}

.form-badge {
  display: inline-block;
  background: #e3f2fd;
  color: #1976d2;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-right: 8px;
  margin-bottom: 4px;
}

/* Special Row Types */
.decision-row {
  background: var(--decision-bg);
  border-left: 4px solid #e91e63;
}

.pps-row {
  background: var(--pps-bg);
  border-left: 4px solid #fbc02d;
}

.gate-row {
  background: var(--gate-bg);
  border-left: 4px solid var(--gate-icon-color);
  font-weight: 600;
}

.gate-icon {
  color: var(--gate-icon-color);
  font-size: 20px;
}

/* Mermaid Diagram */
.chart-box {
  background: #fafafa;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 20px;
  margin-top: 20px;
  overflow-x: auto;
}

.mermaid-diagram {
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Responsive Design */
@media (max-width: 768px) {
  .pipeline {
    padding: 8px 12px;
    gap: 6px;
  }
  
  .pipe-item {
    padding: 6px 12px;
    font-size: 12px;
  }
  
  .pipe-num {
    width: 24px;
    height: 24px;
    font-size: 12px;
  }
  
  .stage {
    margin: 12px;
  }
  
  .flow-table {
    font-size: 14px;
  }
  
  .flow-table th,
  .flow-table td {
    padding: 8px 6px;
  }
  
  /* Convert table to cards on mobile */
  .flow-table thead {
    display: none;
  }
  
  .flow-table tbody tr {
    display: block;
    margin-bottom: 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 12px;
  }
  
  .flow-table tbody td {
    display: block;
    text-align: left;
    border: none;
    padding: 8px 0;
  }
  
  .flow-table tbody td:before {
    content: attr(data-label);
    font-weight: 600;
    display: block;
    margin-bottom: 4px;
    color: #666;
  }
}

@media print {
  .pipeline {
    position: static;
  }
  
  .stage.collapsed .stage-body {
    display: block !important;
  }
  
  .stage-toggle {
    display: none;
  }
  
  @page {
    margin: 1cm;
  }
}
```

---

## 6. Routing & Navigation

### React Router Configuration

```jsx
// src/routes.jsx
import { Routes, Route } from 'react-router-dom';
import WorkflowLandingPage from './components/MES/WorkflowLandingPage';
import ProductionOrderDetail from './components/MES/ProductionOrderDetail';
import QualityGateDashboard from './components/MES/QualityGateDashboard';
import DepartmentDetail from './components/MES/DepartmentDetail';

const MESRoutes = () => (
  <Routes>
    <Route path="/mes" element={<MESModuleLanding />}>
      <Route index element={<Navigate to="workflow" />} />
      <Route path="workflow" element={<WorkflowLandingPage />} />
      <Route path="workflow/:phaseId" element={<WorkflowLandingPage />} />
      <Route path="workflow/:phaseId/:stepId" element={<WorkflowLandingPage />} />
      <Route path="production-orders" element={<ProductionOrderList />} />
      <Route path="production-orders/:orderId" element={<ProductionOrderDetail />} />
      <Route path="quality-gates" element={<QualityGateDashboard />} />
      <Route path="quality-gates/:gateNumber" element={<QualityGateDetail />} />
      <Route path="departments" element={<DepartmentDirectory />} />
      <Route path="departments/:departmentName" element={<DepartmentDetail />} />
      <Route path="certifications" element={<CertificationTracker />} />
      <Route path="reports" element={<MESReports />} />
    </Route>
  </Routes>
);
```

### Deep Linking Support

```jsx
// WorkflowLandingPage.jsx - Handle URL params
import { useParams, useLocation } from 'react-router-dom';

const WorkflowLandingPage = () => {
  const { phaseId, stepId } = useParams();
  const location = useLocation();

  useEffect(() => {
    if (phaseId) {
      // Expand the stage containing this phase
      const phase = workflowData.phases.find(p => p.phaseNumber === parseInt(phaseId));
      if (phase) {
        setExpandedStages(prev => [...new Set([...prev, phase.stage])]);
        
        // Scroll to phase after render
        setTimeout(() => {
          const element = document.getElementById(`phase-${phaseId}`);
          element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          
          // Highlight specific step if stepId provided
          if (stepId) {
            const stepElement = document.querySelector(`[data-step-id="${stepId}"]`);
            stepElement?.classList.add('highlighted-step');
            setTimeout(() => stepElement?.classList.remove('highlighted-step'), 3000);
          }
        }, 100);
      }
    }
  }, [phaseId, stepId]);

  // ... rest of component
};
```

---

## 7. API Integration

### Backend API Endpoints

```typescript
// API Routes for MES Module

// Workflow Definition
GET /api/mes/workflow
  Response: { phases: Phase[], gates: QualityGate[], departments: Department[] }

GET /api/mes/workflow/:phaseId
  Response: { phase: Phase, relatedOrders: ProductionOrder[] }

// Production Orders
GET /api/mes/production-orders?status=&customer=&dateFrom=&dateTo=
  Response: { orders: ProductionOrder[], totalCount: number }

GET /api/mes/production-orders/:orderId
  Response: { 
    order: ProductionOrder, 
    timeline: PhaseEvent[], 
    currentPhase: number,
    blockedAtGate: QualityGate | null
  }

POST /api/mes/production-orders
  Body: { quotationId, customerId, productSpec, quantity, requiredDate }
  Response: { orderId: string, orderNumber: string }

// Phase Tracking
POST /api/mes/production-orders/:orderId/phases/:phaseId/start
  Response: { startedAt: Date, estimatedCompletion: Date }

POST /api/mes/production-orders/:orderId/phases/:phaseId/complete
  Body: { actualDuration: number, notes: string }
  Response: { completedAt: Date, nextPhase: number | null }

// Quality Gates
GET /api/mes/quality-gates?orderId=&gateNumber=&status=
  Response: { gates: QualityGateSubmission[], blockingOrders: number }

POST /api/mes/quality-gates/:gateNumber/submit
  Body: { 
    orderId: string,
    testResults: { testName: string, result: any, pass: boolean }[],
    attachments: File[]
  }
  Response: { submissionId: string, requiresApproval: boolean }

POST /api/mes/quality-gates/:gateNumber/approve
  Body: { submissionId: string, approverComments: string }
  Response: { approved: boolean, unblockOrder: boolean }

POST /api/mes/quality-gates/:gateNumber/reject
  Body: { submissionId: string, rejectionReason: string, correctiveAction: string }
  Response: { returnToPhase: number, actionRequired: string }

// Departments
GET /api/mes/departments
  Response: { departments: Department[], currentWorkload: WorkloadMetrics[] }

GET /api/mes/departments/:departmentName/workload
  Response: {
    activeOrders: number,
    pendingActions: Action[],
    utilization: number,
    averageLeadTime: number
  }

// Real-time Events (WebSocket)
WS /api/mes/events
  Events:
    - phase_started: { orderId, phaseId, startedBy }
    - phase_completed: { orderId, phaseId, duration }
    - quality_gate_submitted: { orderId, gateNumber }
    - quality_gate_approved: { orderId, gateNumber }
    - quality_gate_rejected: { orderId, gateNumber, returnToPhase }
    - in_process_alert: { orderId, phaseId, alertType, severity }
```

### React Query Integration

```jsx
// src/hooks/useMESData.js
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mesAPI } from '../api/mesAPI';

export const useWorkflowData = () => {
  return useQuery({
    queryKey: ['mes', 'workflow'],
    queryFn: mesAPI.getWorkflow,
    staleTime: 1000 * 60 * 60, // 1 hour (workflow definition doesn't change often)
  });
};

export const useProductionOrders = (filters) => {
  return useQuery({
    queryKey: ['mes', 'production-orders', filters],
    queryFn: () => mesAPI.getProductionOrders(filters),
    staleTime: 1000 * 30, // 30 seconds
  });
};

export const usePhaseCompletion = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ orderId, phaseId, data }) => 
      mesAPI.completePhase(orderId, phaseId, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['mes', 'production-orders']);
    },
  });
};

export const useQualityGateApproval = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ gateNumber, submissionId, comments }) =>
      mesAPI.approveQualityGate(gateNumber, submissionId, comments),
    onSuccess: () => {
      queryClient.invalidateQueries(['mes', 'quality-gates']);
      queryClient.invalidateQueries(['mes', 'production-orders']);
    },
  });
};

// WebSocket Hook for Real-time Updates
export const useMESEvents = (orderId) => {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:5000/api/mes/events');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Invalidate queries based on event type
      if (data.orderId === orderId || !orderId) {
        switch (data.type) {
          case 'phase_started':
          case 'phase_completed':
            queryClient.invalidateQueries(['mes', 'production-orders', data.orderId]);
            break;
          case 'quality_gate_approved':
          case 'quality_gate_rejected':
            queryClient.invalidateQueries(['mes', 'quality-gates']);
            queryClient.invalidateQueries(['mes', 'production-orders', data.orderId]);
            break;
        }
      }
    };
    
    return () => ws.close();
  }, [orderId, queryClient]);
};
```

---

## 8. Implementation Roadmap (6 Phases, 12 Weeks)

### **Phase 1: Static Workflow Visualization** (Weeks 1-2)

**Goal**: Create static version of workflow landing page with all 17 phases visible

**Deliverables**:
- [ ] Create `WorkflowLandingPage.jsx` with basic structure
- [ ] Implement `PipelineNavigation.jsx` (horizontal stage bar, click navigation)
- [ ] Implement `StageCard.jsx` with expand/collapse functionality
- [ ] Create `ProcessTable.jsx` with 5-column layout
- [ ] Add `DepartmentChips.jsx` with color coding
- [ ] Implement special row types: `DecisionRow`, `PPSRow`, `QualityGateRow`
- [ ] Create CSS with department color variables and responsive breakpoints
- [ ] Add `MiniWorkflowDiagram.jsx` with Mermaid.js integration
- [ ] Create `ReferencePanels.jsx` with collapsible sections
- [ ] Test print layout

**Data**: Hard-code `workflowData.js` with all 17 phases as shown in examples above

**Success Criteria**:
✅ All 17 phases visible with correct departments and steps  
✅ Pipeline navigation scrolls to correct stage  
✅ Expand/collapse works smoothly  
✅ Decision rows have pink background  
✅ PPS rows (Phase 13 steps 13.4-13.6) have yellow background  
✅ Quality gate rows show red ⚑ badge  
✅ Mermaid diagrams render correctly  
✅ Mobile layout converts tables to cards  
✅ Print layout shows all expanded phases  

---

### **Phase 2: React Architecture & State Management** (Weeks 3-4)

**Goal**: Convert static components to proper React architecture with state management

**Deliverables**:
- [ ] Set up React Router for MES module routes
- [ ] Implement URL param handling (`/mes/workflow/:phaseId/:stepId`)
- [ ] Add deep linking support with scroll-to-phase functionality
- [ ] Create TypeScript interfaces for all data structures
- [ ] Add PropTypes validation to all components
- [ ] Implement Intersection Observer for pipeline navigation active state
- [ ] Add localStorage for expanded/collapsed stage preferences
- [ ] Create `BackToTopButton.jsx` with smooth scroll
- [ ] Add keyboard navigation support (Tab, Enter, Arrow keys)
- [ ] Implement ARIA labels for accessibility

**State Management**:
```jsx
const [expandedStages, setExpandedStages] = useState([1, 2, 3, 4, 5]);
const [activeStage, setActiveStage] = useState(1);
const [highlightedStep, setHighlightedStep] = useState(null);
```

**Success Criteria**:
✅ URL `/mes/workflow/13/13.4` highlights Phase 13, Step 13.4  
✅ Intersection Observer updates active stage in pipeline  
✅ Expanded stages persist across page refreshes  
✅ Keyboard navigation works (Tab through steps, Enter to expand/collapse)  
✅ TypeScript types catch prop errors  
✅ Accessibility audit passes (axe-core)  

---

### **Phase 3: API Integration & Real Data** (Weeks 5-6)

**Goal**: Connect to backend APIs for real-time production order tracking

**Deliverables**:
- [ ] Create `mesAPI.js` service layer with all endpoints
- [ ] Set up React Query with proper cache configuration
- [ ] Implement `useWorkflowData` hook
- [ ] Implement `useProductionOrders` hook with filters
- [ ] Create WebSocket connection for real-time events
- [ ] Add loading skeletons for data fetching
- [ ] Implement error handling and retry logic
- [ ] Create `ProductionOrderList.jsx` page
- [ ] Create `ProductionOrderDetail.jsx` page with phase tracking
- [ ] Add toast notifications for events (phase completed, gate approved)

**Backend Coordination**:
- Work with backend team to implement `production_orders` table
- Create `phase_events` table for tracking timeline
- Implement `quality_gate_submissions` table
- Set up WebSocket server for real-time updates

**Success Criteria**:
✅ Workflow data loads from API  
✅ Production orders display with current phase indicator  
✅ Phase completion updates via WebSocket  
✅ Quality gate status updates in real-time  
✅ Loading states show skeleton UI  
✅ API errors display user-friendly messages  
✅ Retry logic handles network failures  

---

### **Phase 4: Interactive Features & User Actions** (Weeks 7-8)

**Goal**: Add all interactive features for users to track and manage production

**Deliverables**:
- [ ] Implement "Start Phase" button with confirmation dialog
- [ ] Implement "Complete Phase" button with notes/duration input
- [ ] Create `QualityGateSubmissionForm.jsx` with test results input
- [ ] Implement "Approve Gate" workflow (QC manager)
- [ ] Implement "Reject Gate" workflow with corrective action selection
- [ ] Create `DepartmentWorkloadDashboard.jsx`
- [ ] Implement search functionality (find phase by name/department/form)
- [ ] Add filters for production orders (status, customer, date range)
- [ ] Create breadcrumbs navigation
- [ ] Add "Export to PDF" functionality for workflow documentation
- [ ] Implement user permissions (Production Manager, QC Manager, Operator)

**User Testing**: Conduct usability testing with 3-5 production managers

**Success Criteria**:
✅ Users can start/complete phases for their orders  
✅ QC can submit test results and approve/reject gates  
✅ Production managers see real-time workload metrics  
✅ Search finds phases quickly  
✅ PDF export generates clean documentation  
✅ Permissions restrict actions appropriately  
✅ Users report workflow is intuitive (>4/5 rating)  

---

### **Phase 5: Integration with Existing Modules** (Weeks 9-10)

**Goal**: Connect MES with CRM and MIS modules for seamless data flow

**Deliverables**:
- [ ] Link CRM quotations to MES production orders
- [ ] Implement "Create Production Order from Quotation" button in CRM
- [ ] Reuse `CostingCalculator` component from CRM Phase 3
- [ ] Pull customer details from CRM customer master
- [ ] Link TDS from product catalog to production order
- [ ] Generate invoice in Accounts module when Phase 15 completes
- [ ] Create MES metrics dashboard widgets for MIS home page:
  - OEE (Overall Equipment Effectiveness)
  - Yield percentage
  - On-time delivery rate
  - Quality gate pass rate
  - Average cycle time
- [ ] Implement material library integration (pull specs from inventory)
- [ ] Add plate library (reuse existing plates for repeat orders)
- [ ] Create Change Order workflow (mid-production specification changes)

**Data Migration**: Migrate any manual/Excel-based production tracking into system

**Success Criteria**:
✅ Quotation → Production Order flow has no duplicate data entry  
✅ Customer details auto-populate from CRM  
✅ MIS dashboard shows live MES metrics  
✅ Material specs pulled from inventory automatically  
✅ Repeat orders skip artwork phase by reusing plates  
✅ Invoice auto-generated on Phase 15 completion  
✅ Change orders track price/timeline impact  

---

### **Phase 6: Testing, Refinement & Deployment** (Weeks 11-12)

**Goal**: Complete all testing, optimize performance, deploy to production

**Deliverables**:

**Testing**:
- [ ] Unit tests for all components (Jest + React Testing Library, >80% coverage)
- [ ] Integration tests for API calls (MSW mocks)
- [ ] E2E tests for critical workflows (Playwright):
  - Navigate workflow → expand phase → complete step → verify update
  - Submit quality gate → approve → verify order unblocked
  - Create production order → track through all phases → complete
- [ ] Visual regression tests (Percy/Chromatic)
- [ ] Performance optimization:
  - Code splitting for MES module (lazy loading)
  - Memoize expensive calculations (useMemo, React.memo)
  - Virtual scrolling for large order lists
  - Image optimization for Mermaid diagrams (SVG)
- [ ] Accessibility audit (axe-core, WAVE, manual screen reader testing)
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile testing (iOS Safari, Chrome Android)

**Performance Targets**:
- Initial load: < 2 seconds
- Lighthouse score: > 90
- Animation FPS: 60
- Bundle size: < 500KB for MES module

**Documentation**:
- [ ] User guide with screenshots
- [ ] Admin guide for configuration
- [ ] API documentation (OpenAPI/Swagger)
- [ ] Training videos (screen recordings with voiceover)

**Deployment**:
- [ ] Staging environment UAT (users test for 1 week)
- [ ] Fix bugs from UAT feedback
- [ ] Production deployment with monitoring
- [ ] Set up error tracking (Sentry)
- [ ] Create dashboard for system health metrics

**User Acceptance Testing**: Production managers sign-off required

**Success Criteria**:
✅ All unit tests passing (>80% coverage)  
✅ All E2E tests passing  
✅ Performance targets met (load < 2s, Lighthouse > 90)  
✅ Accessibility compliant (WCAG AA)  
✅ Users trained (100% of production managers)  
✅ Deployed to production successfully  
✅ No critical bugs in first week  
✅ Users report satisfaction (>4/5 rating)  

---

## 9. Critical Success Factors

### 9.1 Must-Have Features (P0)
1. **17-Phase Complete Workflow**: All phases visible with correct departments, steps, forms
2. **Pipeline Navigation**: Horizontal sticky bar with phase jumping
3. **PPS Critical Gates Highlighting**: Yellow background for Phase 13 steps 13.4-13.6
4. **Quality Gate Blocking**: Production cannot proceed past gates 5 & 6 without approval
5. **Department Color Coding**: Consistent across all components
6. **Mermaid.js Diagrams**: Mini flowcharts for each phase
7. **Responsive Design**: Mobile-friendly card layout
8. **Real-time Updates**: WebSocket for phase completion and gate approvals

### 9.2 Important Features (P1)
1. **Deep Linking**: URL params for direct phase/step access
2. **Production Order Tracking**: List and detail pages
3. **Department Workload**: Dashboard showing current load
4. **Search Functionality**: Find phases by keyword
5. **PDF Export**: Print-friendly documentation
6. **Change Order Workflow**: Mid-production specification changes
7. **User Permissions**: Role-based access control

### 9.3 Nice-to-Have Features (P2)
1. **Gantt Chart View**: Timeline visualization of all orders
2. **Drag-and-Drop Scheduling**: Reorder production queue
3. **Automated Alerts**: Email/SMS for critical gates
4. **Mobile App**: Native iOS/Android for floor managers
5. **Voice Commands**: Hands-free operation in production floor
6. **AR Visualization**: Augmented reality for machine setup

---

## 10. Technology Stack Summary

### Frontend
- **Framework**: React 18.3.1
- **Build Tool**: Vite 7.3.0
- **Routing**: React Router v6
- **State Management**: React Query (TanStack Query v5)
- **Diagrams**: Mermaid.js (embedded local library)
- **Styling**: CSS Modules + CSS Custom Properties
- **Icons**: Unicode emojis + SVG icons
- **Animation**: CSS transitions (no Framer Motion needed for this page)

### Backend (Assumed)
- **Database**: PostgreSQL 14+ (production_orders, phase_events, quality_gate_submissions tables)
- **Caching**: Redis (optional, for workload metrics)
- **WebSocket**: Socket.io or native WebSockets
- **API**: RESTful + WebSocket events

### Testing
- **Unit**: Jest + React Testing Library
- **Integration**: MSW (Mock Service Worker)
- **E2E**: Playwright
- **Visual Regression**: Percy or Chromatic
- **Performance**: Lighthouse
- **Accessibility**: axe-core, WAVE

### DevOps
- **Monitoring**: Sentry (error tracking)
- **Logging**: Winston or Pino
- **CI/CD**: GitHub Actions or GitLab CI

---

## 11. Next Steps

### Immediate Actions (This Week)
1. **Get Approval**: Present this plan to stakeholders for sign-off
2. **Create Epic**: Break down into Jira/Linear tickets for 6 phases
3. **Set Up Repo Structure**: Create `src/components/MES/` folder structure
4. **Install Dependencies**: `npm install react-router-dom @tanstack/react-query mermaid`
5. **Create Data File**: `src/data/workflowData.js` with all 17 phases
6. **Start Phase 1**: Build static workflow page with dummy data

### Week 1 Sprint Goals
- [ ] `WorkflowLandingPage.jsx` basic structure
- [ ] `PipelineNavigation.jsx` with click navigation
- [ ] `StageCard.jsx` with expand/collapse
- [ ] `ProcessTable.jsx` rendering Phase 1 (5 phases as test)
- [ ] CSS variables for 10 department colors
- [ ] Mermaid.js diagram rendering one phase successfully

### Communication Plan
- **Daily Standup**: Share progress on MES module
- **Weekly Demo**: Show completed components to production managers
- **Bi-weekly Review**: Get feedback from QC team on quality gate flows
- **Monthly Stakeholder Review**: Present progress to management

---

## 12. Risk Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Mermaid.js rendering fails on complex diagrams | High | Medium | Test all 17 diagrams in Phase 1, have fallback to static images |
| Backend API delays Phase 3 | High | Medium | Continue with Phase 1-2 using mock data, coordinate with backend team weekly |
| Users find workflow too complex | High | Low | Conduct user testing in Phase 4, iterate based on feedback |
| Performance issues with 17 phases | Medium | Medium | Implement virtual scrolling, lazy load diagrams outside viewport |
| Mobile layout doesn't fit workflow | Medium | Low | Test on multiple devices in Phase 1, use card layout as fallback |
| Quality gate approval process unclear | Medium | Medium | Work closely with QC managers in Phase 4 to refine workflow |

---

## 13. Conclusion

This implementation plan provides a complete roadmap for building a **QuickBooks-inspired MES workflow landing page** that visualizes the entire **17-phase flexible packaging production workflow**.

**Key Highlights**:
- ✅ **Based on v4 specifications** from existing documentation + FP_OPW.html reference
- ✅ **Complete 17-phase workflow** with departments, steps, forms, quality gates
- ✅ **QuickBooks-inspired UI**: Pipeline navigation + collapsible cards + process tables + mini diagrams
- ✅ **Critical PPS gates highlighted**: Yellow background for mandatory blocking steps
- ✅ **Department color coding**: 10 departments with consistent visual identity
- ✅ **Responsive design**: Mobile-friendly card layout
- ✅ **Real-time updates**: WebSocket for live tracking
- ✅ **6-phase implementation**: 12 weeks to production-ready system

**Ready to Start**: All specifications defined, data structures documented, component architecture designed. Can begin Phase 1 immediately.

---

**Document Version**: 1.0  
**Last Updated**: February 10, 2026  
**Author**: AI Assistant  
**Reviewed By**: [To be filled]  
**Approved By**: [To be filled]
