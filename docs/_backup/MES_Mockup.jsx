import { useState } from "react";

// ── Palette & tokens ─────────────────────────────────────────────────────────
const T = {
  bg:       "#0d1117",
  bgPanel:  "#13191f",
  bgCard:   "#1a2230",
  bgHover:  "#1f2b3a",
  border:   "#253040",
  borderLit:"#2e4060",
  amber:    "#f0a500",
  amberDim: "#7a5200",
  amberGlow:"rgba(240,165,0,0.12)",
  teal:     "#00c9b1",
  tealDim:  "#005a52",
  tealGlow: "rgba(0,201,177,0.10)",
  red:      "#ff4d4d",
  redGlow:  "rgba(255,77,77,0.10)",
  textHi:   "#e2eaf5",
  textMid:  "#8fa3bb",
  textLow:  "#4a5f78",
  mono:     "'JetBrains Mono', 'Fira Code', monospace",
  sans:     "'DM Sans', system-ui, sans-serif",
};

const DEPTS = {
  sales:       { label: "Sales",        hex: "#38bdf8", dim: "#0c4a6e" },
  qc:          { label: "QC",           hex: "#f87171", dim: "#7f1d1d" },
  prepress:    { label: "Prepress",     hex: "#c084fc", dim: "#4a1d96" },
  estimation:  { label: "Estimation",   hex: "#34d399", dim: "#064e3b" },
  procurement: { label: "Procurement",  hex: "#fb923c", dim: "#7c2d12" },
  production:  { label: "Production",   hex: "#a78bfa", dim: "#3b0764" },
  inkhead:     { label: "Ink Head",     hex: "#f472b6", dim: "#831843" },
  maintenance: { label: "Maintenance",  hex: "#94a3b8", dim: "#1e293b" },
  accounts:    { label: "Accounts",     hex: "#4ade80", dim: "#14532d" },
  logistics:   { label: "Logistics",    hex: "#22d3ee", dim: "#164e63" },
};

const STAGES = [
  { id: "presales",      label: "PRE-SALES",          tag: "01", color: T.teal,
    boxes: [
      { id:"p01", code:"P01", label:"Customer Inquiry",     depts:["sales"],                phase:1  },
      { id:"p02", code:"P02", label:"Registration & Credit",depts:["sales","accounts"],     phase:2  },
      { id:"p03", code:"P03", label:"Tech Spec Review",     depts:["qc","sales"],           phase:3  },
      { id:"p04", code:"P04", label:"MOQ Verification",     depts:["sales","production"],   phase:4  },
      { id:"p05", code:"P05", label:"Material Availability",depts:["procurement"],          phase:5  },
    ]
  },
  { id: "quotation",     label: "QUOTATION & ORDER",   tag: "02", color: T.amber,
    boxes: [
      { id:"p06", code:"P06", label:"Cost Estimation",      depts:["estimation","accounts"],phase:6  },
      { id:"p07", code:"P07", label:"Quotation & Negotiation",depts:["sales"],             phase:7  },
      { id:"p08", code:"P08", label:"PO / SO Generation",   depts:["sales","accounts"],    phase:8  },
    ]
  },
  { id: "preproduction", label: "PRE-PRODUCTION",      tag: "03", color: "#c084fc", parallel: true,
    rows: [
      [{ id:"p09", code:"P09", label:"Material Procurement",depts:["procurement"],          phase:9  }],
      [{ id:"p10", code:"P10", label:"Artwork & Plate Prep",depts:["prepress"],             phase:10 }],
    ]
  },
  { id: "production",    label: "PRODUCTION & QC",     tag: "04", color: T.red,   critical: true,
    boxes: [
      { id:"p11", code:"P11", label:"Production Planning",  depts:["production"],           phase:11 },
      { id:"p12", code:"P12", label:"Ink Preparation",      depts:["inkhead","production"], phase:12 },
      { id:"p13", code:"P13", label:"Production Execution", depts:["production","qc"],      phase:13, gate:true },
      { id:"p14", code:"P14", label:"Final QC & Packaging", depts:["qc","production"],      phase:14, gate:true },
    ]
  },
  { id: "delivery",      label: "DELIVERY & CLOSE",    tag: "05", color: T.teal,
    boxes: [
      { id:"p15", code:"P15", label:"Invoicing",            depts:["accounts"],             phase:15 },
      { id:"p16", code:"P16", label:"Delivery & Logistics", depts:["logistics"],            phase:16 },
      { id:"p17", code:"P17", label:"Post-Delivery Feedback",depts:["sales","qc"],          phase:17 },
    ]
  },
];

const PHASE_DETAILS = {
  1:  { duration:"1–2 days",  steps:["Receive inquiry via email/call","Log in CRM","Assign to Sales Rep","Initial requirement gathering"],       forms:["Inquiry Form"] },
  2:  { duration:"1–3 days",  steps:["Verify customer details","Credit assessment","Register in system","Assign customer code"],                  forms:["Customer Registration Form","Credit Check Form"] },
  3:  { duration:"2–4 days",  steps:["Review substrate & print specs","Check colour profiles","Confirm artwork requirements","Issue Tech Spec"], forms:["Tech Spec Sheet","QC Requirement Form"] },
  4:  { duration:"1 day",     steps:["Confirm MOQs","Verify packaging specs","Check production capacity","MOQ approval"],                        forms:["MOQ Verification Form"] },
  5:  { duration:"1–2 days",  steps:["Check material inventory","Identify suppliers","Lead time assessment","Material reservation"],              forms:["Material Availability Report"] },
  6:  { duration:"2–3 days",  steps:["Calculate raw material costs","Estimate machine time & labour","Calculate overheads","Prepare cost breakdown"], forms:["Cost Estimation Sheet","BOM Form"] },
  7:  { duration:"1–3 days",  steps:["Prepare quotation document","Send to customer","Negotiate pricing","Get approval"],                         forms:["Quotation Form","Approval Record"] },
  8:  { duration:"1–2 days",  steps:["Receive Purchase Order","Create Sales Order in ERP","Link to quotation","Confirm delivery date"],            forms:["PO Receipt","Sales Order Form"] },
  9:  { duration:"3–7 days",  steps:["Raise purchase requisitions","Get supplier quotes","Issue Purchase Orders","Receive & inspect materials"],  forms:["Purchase Requisition","GRN Form"] },
  10: { duration:"3–5 days",  steps:["Receive approved artwork","Colour separation & trapping","Plate making (CTP)","Plate inspection & store"],  forms:["Artwork Sign-off Form","Plate Register"] },
  11: { duration:"1–2 days",  steps:["Schedule jobs on production calendar","Allocate machines & operators","Issue Job Order","Confirm material readiness"], forms:["Job Order","Production Schedule"] },
  12: { duration:"4–8 hrs",   steps:["Calculate ink quantities","Prepare formulations","Colour matching (Pantone/CMYK)","First print approval"],  forms:["Ink Mixing Record","Colour Match Form"] },
  13: { duration:"1–5 days",  steps:["Machine setup & make-ready","⚑ PPS Gate: First Sample Approval","Print run execution","⚑ PPS Gate: In-process QC","Waste & efficiency log"], forms:["Make-Ready Sheet","PPS Approval Form","Production Log"] },
  14: { duration:"4–8 hrs",   steps:["100% visual inspection","Measure print quality","Package & label finished goods","Release for shipment"],   forms:["Final QC Report","Release Note"] },
  15: { duration:"1–2 days",  steps:["Generate invoice from SO","Apply payment terms","Send to customer","Record in accounts"],                    forms:["Tax Invoice","Delivery Note"] },
  16: { duration:"1–3 days",  steps:["Arrange transport","Prepare packing list","Dispatch & track shipment","Get proof of delivery"],              forms:["Packing List","POD","Delivery Challan"] },
  17: { duration:"1–2 days",  steps:["Confirm delivery with customer","Handle complaints","Collect feedback","Update CRM","Close job order"],      forms:["Customer Feedback Form","Job Closure Report"] },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
const allBoxes = (stage) => stage.parallel ? stage.rows.flat() : (stage.boxes || []);
const boxMatches = (box, dept) => dept === "all" || box.depts.includes(dept);

// ── Sub-components ────────────────────────────────────────────────────────────

const PhaseBox = ({ box, active, selected, onClick, stageColor }) => {
  const d0 = DEPTS[box.depts[0]];
  return (
    <button
      onClick={active ? onClick : undefined}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 14px",
        minWidth: 130,
        background: selected
          ? `linear-gradient(135deg, ${stageColor}22 0%, ${T.bgCard} 100%)`
          : active ? T.bgCard : T.bgPanel,
        border: `1px solid ${selected ? stageColor : active ? T.borderLit : T.border}`,
        borderLeft: `3px solid ${selected ? stageColor : active ? d0.hex : T.border}`,
        borderRadius: 6,
        cursor: active ? "pointer" : "default",
        opacity: active ? 1 : 0.3,
        transition: "all 0.15s ease",
        textAlign: "left",
        boxShadow: selected ? `0 0 20px ${stageColor}30` : active ? "0 2px 8px rgba(0,0,0,0.4)" : "none",
      }}
    >
      {/* Gate pip */}
      {box.gate && (
        <span style={{
          position: "absolute", top: -8, right: 8,
          fontFamily: T.mono, fontSize: 9, fontWeight: 700,
          background: T.red, color: "#fff",
          padding: "1px 5px", borderRadius: 3, letterSpacing: 1,
        }}>GATE</span>
      )}

      {/* Code badge */}
      <span style={{
        fontFamily: T.mono, fontSize: 10, fontWeight: 600,
        color: active ? stageColor : T.textLow, letterSpacing: 2,
      }}>{box.code}</span>

      {/* Label */}
      <span style={{
        fontFamily: T.sans, fontSize: 12, fontWeight: 600,
        color: active ? T.textHi : T.textLow, lineHeight: 1.3,
      }}>{box.label}</span>

      {/* Dept dots */}
      <div style={{ display: "flex", gap: 3, marginTop: 2 }}>
        {box.depts.slice(0, 3).map(dep => (
          <span key={dep} title={DEPTS[dep]?.label} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: active ? DEPTS[dep]?.hex : T.textLow,
          }} />
        ))}
      </div>
    </button>
  );
};

const Connector = ({ vertical = false, color = T.textLow }) => (
  vertical
    ? <div style={{ display:"flex", flexDirection:"column", alignItems:"center", padding:"4px 0" }}>
        <div style={{ width:1, height:20, background: color, opacity:0.4 }} />
        <div style={{ width:0, height:0, borderLeft:"4px solid transparent", borderRight:"4px solid transparent", borderTop:`6px solid ${color}`, opacity:0.4 }} />
      </div>
    : <div style={{ display:"flex", alignItems:"center", padding:"0 4px", flexShrink:0 }}>
        <div style={{ width:20, height:1, background: color, opacity:0.4 }} />
        <div style={{ width:0, height:0, borderTop:"4px solid transparent", borderBottom:"4px solid transparent", borderLeft:`6px solid ${color}`, opacity:0.4 }} />
      </div>
);

const StageBlock = ({ stage, activeDept, selectedBox, onSelect }) => {
  const boxes = stage.parallel ? null : stage.boxes;
  const color = stage.color;

  return (
    <div style={{
      position: "relative",
      background: T.bgPanel,
      border: `1px solid ${stage.critical ? T.red+"55" : T.border}`,
      borderTop: `2px solid ${color}`,
      borderRadius: 8,
      padding: "20px 20px 16px",
      boxShadow: stage.critical ? `0 0 24px ${T.red}22` : "none",
    }}>
      {/* Stage label */}
      <div style={{ display:"flex", alignItems:"center", gap: 10, marginBottom: 14 }}>
        <span style={{
          fontFamily: T.mono, fontSize: 10, fontWeight: 700,
          color: "#000", background: color,
          padding: "2px 8px", borderRadius: 3, letterSpacing: 2,
        }}>{stage.tag}</span>
        <span style={{
          fontFamily: T.mono, fontSize: 11, fontWeight: 700,
          color: color, letterSpacing: 3,
        }}>{stage.label}</span>
        {stage.critical && (
          <span style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 700,
            color: T.red, border:`1px solid ${T.red}`, padding:"1px 6px", borderRadius: 3, letterSpacing: 2,
          }}>CRITICAL PATH</span>
        )}
        {stage.parallel && (
          <span style={{
            fontFamily: T.mono, fontSize: 9, fontWeight: 700,
            color: "#c084fc", border:"1px solid #c084fc55", padding:"1px 6px", borderRadius: 3, letterSpacing: 2,
          }}>PARALLEL</span>
        )}
      </div>

      {/* Boxes */}
      {stage.parallel ? (
        <div style={{ display:"flex", flexDirection:"column", gap: 8 }}>
          {stage.rows.map((row, ri) => (
            <div key={ri} style={{ display:"flex", alignItems:"center", gap:0 }}>
              {ri > 0 && (
                <span style={{
                  fontFamily: T.mono, fontSize: 9, color: "#c084fc",
                  padding: "0 10px", whiteSpace:"nowrap",
                }}>TRACK {ri+1}</span>
              )}
              {ri === 0 && (
                <span style={{
                  fontFamily: T.mono, fontSize: 9, color: "#c084fc",
                  padding: "0 10px", whiteSpace:"nowrap",
                }}>TRACK {ri+1}</span>
              )}
              {row.map((box, bi) => (
                <div key={box.id} style={{ display:"flex", alignItems:"center" }}>
                  <PhaseBox
                    box={box} active={boxMatches(box, activeDept)}
                    selected={selectedBox?.id === box.id} stageColor={color}
                    onClick={() => onSelect(box)}
                  />
                  {bi < row.length - 1 && <Connector color={color} />}
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display:"flex", alignItems:"center", flexWrap:"wrap", gap: 0 }}>
          {boxes.map((box, bi) => (
            <div key={box.id} style={{ display:"flex", alignItems:"center" }}>
              <PhaseBox
                box={box} active={boxMatches(box, activeDept)}
                selected={selectedBox?.id === box.id} stageColor={color}
                onClick={() => onSelect(box)}
              />
              {bi < boxes.length - 1 && <Connector color={color} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const DetailPanel = ({ box, onClose }) => {
  if (!box) return null;
  const d  = PHASE_DETAILS[box.phase];
  const d0 = DEPTS[box.depts[0]];
  const stage = STAGES.find(s => allBoxes(s).some(b => b.id === box.id));

  return (
    <div style={{
      borderTop: `1px solid ${T.border}`,
      background: T.bgPanel,
      padding: "20px 28px",
      display: "grid",
      gridTemplateColumns: "1fr 1fr 1fr",
      gap: 24,
    }}>
      {/* Column 1: Header */}
      <div style={{ display:"flex", flexDirection:"column", gap: 10 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 6, flexShrink: 0,
            background: `${stage?.color}22`, border:`1px solid ${stage?.color}44`,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontFamily: T.mono, fontWeight: 700, fontSize: 14, color: stage?.color,
          }}>{box.code}</div>
          <div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textLow, letterSpacing: 3, marginBottom: 3 }}>PHASE {box.phase} OF 17</div>
            <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 700, color: T.textHi }}>{box.label}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap: 6, flexWrap:"wrap" }}>
          {box.depts.map(dep => (
            <span key={dep} style={{
              fontFamily: T.mono, fontSize: 10, fontWeight: 600,
              color: DEPTS[dep].hex, background: DEPTS[dep].dim+"88",
              border: `1px solid ${DEPTS[dep].hex}44`,
              padding:"2px 8px", borderRadius: 4, letterSpacing: 1,
            }}>{DEPTS[dep].label}</span>
          ))}
        </div>
        <div style={{
          fontFamily: T.mono, fontSize: 11, color: T.amber,
          background: T.amberGlow, border:`1px solid ${T.amberDim}`,
          padding:"6px 10px", borderRadius: 4,
          display:"inline-flex", alignItems:"center", gap: 6,
        }}>
          <span>⏱</span> {d.duration}
        </div>
        <button onClick={onClose} style={{
          marginTop: "auto", alignSelf:"flex-start",
          fontFamily: T.mono, fontSize: 10, letterSpacing: 2,
          color: T.textMid, background:"transparent",
          border:`1px solid ${T.border}`, padding:"4px 10px", borderRadius: 4,
          cursor:"pointer",
        }}>✕ CLOSE</button>
      </div>

      {/* Column 2: Steps */}
      <div>
        <div style={{
          fontFamily: T.mono, fontSize: 10, fontWeight: 700,
          color: T.textLow, letterSpacing: 3, marginBottom: 10,
        }}>PROCESS STEPS</div>
        <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
          {d.steps.map((s, i) => (
            <div key={i} style={{
              display:"flex", gap: 8, alignItems:"flex-start",
              padding:"6px 10px", borderRadius: 4,
              background: s.startsWith("⚑") ? T.redGlow : T.bgCard,
              border: `1px solid ${s.startsWith("⚑") ? T.red+"44" : T.border}`,
            }}>
              <span style={{
                fontFamily: T.mono, fontSize: 9, fontWeight: 700,
                color: "#000", background: stage?.color,
                padding:"1px 5px", borderRadius: 3, flexShrink:0, lineHeight:"18px",
              }}>{String(i+1).padStart(2,"0")}</span>
              <span style={{ fontFamily: T.sans, fontSize: 12, color: s.startsWith("⚑") ? T.red : T.textMid, lineHeight: 1.4 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Column 3: Forms */}
      <div>
        <div style={{
          fontFamily: T.mono, fontSize: 10, fontWeight: 700,
          color: T.textLow, letterSpacing: 3, marginBottom: 10,
        }}>FORMS & DOCUMENTS</div>
        <div style={{ display:"flex", flexDirection:"column", gap: 6 }}>
          {d.forms.map((f, i) => (
            <div key={i} style={{
              display:"flex", alignItems:"center", gap: 10, padding:"8px 12px",
              background: T.bgCard, border:`1px solid ${T.borderLit}`,
              borderRadius: 4,
            }}>
              <span style={{ color: T.teal, fontSize: 14 }}>📋</span>
              <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 500, color: T.textHi }}>{f}</span>
              <span style={{
                marginLeft:"auto", fontFamily: T.mono, fontSize: 9,
                color: T.teal, border:`1px solid ${T.tealDim}`,
                padding:"1px 6px", borderRadius: 3, cursor:"pointer",
              }}>OPEN</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MES() {
  const [activeDept, setActiveDept] = useState("all");
  const [selectedBox, setSelectedBox] = useState(null);

  const switchDept = (k) => { setActiveDept(k); setSelectedBox(null); };
  const totalForDept = (key) => STAGES.flatMap(s => allBoxes(s)).filter(b => b.depts.includes(key)).length;

  return (
    <div style={{
      display:"flex", height:"100vh", overflow:"hidden",
      background: T.bg, color: T.textHi,
      fontFamily: T.sans,
      // subtle grid overlay
      backgroundImage: `linear-gradient(${T.border} 1px, transparent 1px), linear-gradient(90deg, ${T.border} 1px, transparent 1px)`,
      backgroundSize: "40px 40px",
    }}>

      {/* ─── SIDEBAR ─────────────────────────────────────────────────────── */}
      <aside style={{
        width: 200, flexShrink: 0, display:"flex", flexDirection:"column",
        background: T.bgPanel, borderRight:`1px solid ${T.border}`,
        overflow:"hidden",
      }}>
        {/* Branding */}
        <div style={{
          padding:"18px 16px 14px",
          borderBottom:`1px solid ${T.border}`,
        }}>
          <div style={{ fontFamily: T.mono, fontWeight: 700, fontSize: 13, color: T.amber, letterSpacing: 2 }}>PROPACKHUB</div>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textLow, letterSpacing: 2, marginTop: 2 }}>MES · FLEXIBLE PKG</div>
        </div>

        {/* Dept filter */}
        <div style={{ padding:"10px 12px 4px", fontFamily: T.mono, fontSize: 9, color: T.textLow, letterSpacing: 3 }}>
          DEPARTMENTS
        </div>
        <div style={{ overflowY:"auto", flex:1, padding:"4px 8px 12px" }}>
          {[["all", "All Phases", null, 17], ...Object.entries(DEPTS).map(([k, d]) => [k, d.label, d.hex, totalForDept(k)])].map(([key, label, hex, count]) => (
            <button
              key={key}
              onClick={() => switchDept(key)}
              style={{
                width:"100%", display:"flex", alignItems:"center", gap: 8,
                padding:"6px 8px", marginBottom: 1, borderRadius: 4,
                background: activeDept === key ? (hex ? `${hex}18` : T.bgHover) : "transparent",
                border: `1px solid ${activeDept === key ? (hex || T.amber) + "44" : "transparent"}`,
                cursor:"pointer", textAlign:"left",
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius:"50%", flexShrink:0,
                background: hex || T.amber,
                boxShadow: activeDept === key ? `0 0 6px ${hex || T.amber}` : "none",
              }} />
              <span style={{ fontFamily: T.sans, fontSize: 11, color: activeDept === key ? T.textHi : T.textMid, flex:1 }}>{label}</span>
              <span style={{
                fontFamily: T.mono, fontSize: 9,
                color: activeDept === key ? (hex || T.amber) : T.textLow,
              }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Legend */}
        <div style={{ padding:"10px 12px", borderTop:`1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.mono, fontSize: 9, color: T.textLow, letterSpacing: 3, marginBottom: 8 }}>LEGEND</div>
          {[
            [T.red, "GATE", "PPS Quality Gate"],
            ["#c084fc", "⚡", "Parallel Track"],
            [T.amber, "——›", "Process Flow"],
          ].map(([color, sym, desc]) => (
            <div key={desc} style={{ display:"flex", alignItems:"center", gap: 6, marginBottom: 5 }}>
              <span style={{ fontFamily: T.mono, fontSize: 9, color, minWidth: 28 }}>{sym}</span>
              <span style={{ fontFamily: T.sans, fontSize: 10, color: T.textLow }}>{desc}</span>
            </div>
          ))}
        </div>

        <div style={{ padding:"8px 12px 12px", borderTop:`1px solid ${T.border}` }}>
          <div style={{ fontFamily: T.mono, fontSize: 8, color: T.textLow, lineHeight: 1.7 }}>
            17 PHASES · 5 STAGES<br/>10 DEPTS · ISA-95 L3
          </div>
        </div>
      </aside>

      {/* ─── MAIN ────────────────────────────────────────────────────────── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Topbar */}
        <div style={{
          display:"flex", alignItems:"center", gap: 16,
          padding:"0 24px", height: 52, flexShrink: 0,
          background: T.bgPanel, borderBottom:`1px solid ${T.border}`,
        }}>
          <div style={{ flex:1 }}>
            <span style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 700, color: T.textHi }}>
              Manufacturing Execution System
            </span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textLow, marginLeft: 14, letterSpacing: 2 }}>
              FLEXIBLE PACKAGING · END-TO-END
            </span>
          </div>
          {activeDept !== "all" && (
            <div style={{
              display:"flex", alignItems:"center", gap: 6, padding:"4px 12px",
              background: `${DEPTS[activeDept]?.hex}18`, border:`1px solid ${DEPTS[activeDept]?.hex}44`,
              borderRadius: 20,
            }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background: DEPTS[activeDept]?.hex }} />
              <span style={{ fontFamily: T.mono, fontSize: 10, fontWeight: 700, color: DEPTS[activeDept]?.hex, letterSpacing: 1 }}>
                {DEPTS[activeDept]?.label.toUpperCase()}
              </span>
              <button onClick={() => switchDept("all")} style={{
                background:"transparent", border:"none", cursor:"pointer",
                color: T.textLow, fontSize: 11, lineHeight:1, padding:"0 0 0 4px",
              }}>✕</button>
            </div>
          )}

          {/* Status bar */}
          <div style={{ display:"flex", gap: 12, fontFamily: T.mono, fontSize: 9, color: T.textLow }}>
            {[["SYS", T.teal, "ONLINE"], ["ERR", T.red, "0"], ["JOBS", T.amber, "3"]].map(([lbl, col, val]) => (
              <div key={lbl} style={{ display:"flex", alignItems:"center", gap: 4 }}>
                <span style={{ color: col }}>●</span>
                <span>{lbl}: </span>
                <span style={{ color: T.textMid }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div style={{ flex:1, overflow:"auto", padding: 24, display:"flex", flexDirection:"column", gap: 12 }}>
          {STAGES.map((stage, si) => (
            <div key={stage.id} style={{ display:"flex", flexDirection:"column", gap: 0 }}>
              {si > 0 && (
                <div style={{ display:"flex", justifyContent:"center", padding:"4px 0" }}>
                  <Connector vertical color={STAGES[si-1].color} />
                </div>
              )}
              <StageBlock
                stage={stage} activeDept={activeDept}
                selectedBox={selectedBox} onSelect={setSelectedBox}
              />
            </div>
          ))}

          <div style={{ textAlign:"center", padding:"16px 0" }}>
            <span style={{
              fontFamily: T.mono, fontSize: 10, color: T.textLow, letterSpacing: 2,
              border:`1px dashed ${T.border}`, padding:"4px 14px", borderRadius: 20,
            }}>
              {activeDept !== "all"
                ? `FILTER ACTIVE — ${DEPTS[activeDept]?.label.toUpperCase()} PHASES HIGHLIGHTED`
                : "SELECT ANY PHASE BOX TO VIEW PROCESS DETAILS"}
            </span>
          </div>
        </div>

        {/* Detail panel */}
        {selectedBox && <DetailPanel box={selectedBox} onClose={() => setSelectedBox(null)} />}
      </div>
    </div>
  );
}
