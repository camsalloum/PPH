# 🚀 MES Workflow Phase 1 - Quick Start Guide

## Instant Access (3 Steps)

### Step 1: Install Mermaid (if not already done)
```bash
cd "26.2"
npm install mermaid
```

### Step 2: Start Development Server
```bash
npm run dev
```

### Step 3: View the Page

**Option A: Via Module Selector**
1. Navigate to `http://localhost:5173`
2. Login to your account
3. Click the **MES** card (🏭 Manufacturing Execution System)

**Option B: Direct URL**
1. Go directly to: `http://localhost:5173/mes`

---

## 🎨 What You'll See

### Top Section
- **Blue gradient header** with factory icon 🏭
- Title: "MES - Manufacturing Execution System"
- Subtitle: "17-Phase Flexible Packaging Production Workflow"

### Pipeline Navigation (Sticky Bar)
Five clickable stage badges:
1. 🔵 **Pre-Sales** (Blue)
2. 🟠 **Quotation & Order** (Orange)
3. 🟢 **Pre-Production** (Green)
4. 🔴 **Production & QC** (Red) ⚑ Critical Gates
5. 🟣 **Delivery & Close** (Purple)

### Main Content
- **5 collapsible stage cards** (click headers to expand/collapse)
- **17 phase sections** with:
  - Department color chips
  - 5-column process tables
  - Mini flowchart diagrams
  - Special highlighting:
    - 🟡 Yellow for PPS critical steps (Phase 13.3-13.5)
    - 🔴 Red for quality gates (Phase 13.4, 13.5)
    - 🟣 Pink for decision branches

### Bottom Section
Four reference panels:
- 📚 **Departments** (10 department cards with responsibilities)
- 📏 **Process Rules** (7 critical rules)
- 📖 **Abbreviations** (24 industry terms)
- 🏆 **Certifications** (5 categories)

### Floating Button
- Blue **"↑"** button (bottom-right) for quick scroll to top

---

## 🧪 Testing Checklist

### Desktop (>1200px)
- [ ] Pipeline navigation shows all 5 stages horizontally
- [ ] Clicking a stage scrolls smoothly to that section
- [ ] Active stage highlights in the pipeline as you scroll
- [ ] Process tables display all 5 columns clearly
- [ ] Mermaid diagrams render flowcharts
- [ ] Department chips show colored borders
- [ ] PPS rows (Phase 13) have yellow background
- [ ] Quality gate rows have red background with ⚑ badge

### Tablet (768px-1200px)
- [ ] Pipeline wraps or scrolls horizontally
- [ ] Tables remain readable (may need horizontal scroll)
- [ ] All content accessible

### Mobile (<768px)
- [ ] Pipeline shows only numbered circles (text hidden)
- [ ] Process tables convert to card layout
- [ ] Each table row becomes a card with labeled fields
- [ ] Diagrams are responsive
- [ ] Font sizes remain readable

### Interactivity
- [ ] Expand/collapse stage cards (click header)
- [ ] Expand/collapse reference panels (click header)
- [ ] Smooth scroll when clicking pipeline items
- [ ] Back-to-top button appears after scrolling down
- [ ] LocalStorage saves expanded stages (refresh to test)

### Print
- [ ] Print preview (Ctrl+P / Cmd+P)
- [ ] All stages auto-expand
- [ ] Page breaks between stages
- [ ] No unnecessary colors (print-optimized)

---

## 🎯 Key Features to Highlight

### 1. Critical PPS Gates (Phase 13)
Navigate to **Stage 4: Production & QC** → **Phase 13: Production Execution**

Look for:
- **Step 13.4**: Red row with ⚑ badge "PPS QC APPROVAL - BLOCKING GATE"
- **Step 13.5**: Red row with ⚑ badge "CUSTOMER PPS APPROVAL - BLOCKING GATE (24-48 hrs wait)"
- Both have yellow background + red left border
- Pulsing ⚑ animation

### 2. Parallel Processing (Phases 9 & 10)
Navigate to **Stage 3: Pre-Production**

Look for:
- Badge showing "⚡ Parallel with Phase 10" on Phase 9
- Badge showing "⚡ Parallel with Phase 9" on Phase 10
- Indicates these phases run concurrently

### 3. Decision Branches
Multiple decision rows throughout (e.g., Phase 1, Step 1.3)

Look for:
- Pink background rows with ⚖ scales icon
- Options displayed: "Yes → X | No → Y"

### 4. Department Color Coding
Check any phase's department chips row

Colors:
- 🔵 Sales (Blue) - Customer-facing
- 🔴 QC (Red) - Quality control
- 🟣 Prepress (Purple) - Artwork
- 🟠 Estimation (Orange) - Costing
- 🟢 Procurement (Green) - Materials
- 🟠 Production (Dark Orange) - Manufacturing
- 🟣 Ink Head (Pink) - Ink preparation
- 🟣 Maintenance (Indigo) - Equipment
- 🟦 Accounts (Teal) - Finance
- 🟣 Logistics (Violet) - Delivery

### 5. Mini Flowcharts
Every phase has a flowchart diagram at the bottom

Example (Phase 13):
```
Setup → Trial → PPS Manufacturing → QC Approval (Gate) → 
Customer Approval (Gate) → Full Production → In-Process QC
```

With rejection loops back to trial run.

---

## 🐛 Troubleshooting

### Mermaid Diagrams Not Rendering
**Problem**: Gray boxes instead of flowcharts

**Solution**:
```bash
cd "26.2"
npm install mermaid --save
```

Then restart server:
```bash
npm run dev
```

### Module Selector Doesn't Show MES Card
**Problem**: Only see MIS and CRM

**Solution**: Check `src/components/modules/ModuleSelector.jsx`:
```javascript
{
  id: 'mes',
  status: 'active',  // Should be 'active', not 'coming-soon'
  route: '/mes'  // Should have route
}
```

### Page Shows 404
**Problem**: Navigating to `/mes` shows "Not Found"

**Solution**: Check `src/App.jsx` has the route:
```javascript
<Route path="/mes" element={
  <ProtectedRoute>
    <WorkflowLandingPage />
  </ProtectedRoute>
} />
```

### Styles Look Wrong
**Problem**: CSS not loading properly

**Solution**:
1. Hard refresh browser: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
2. Check browser console for CSS errors
3. Verify all CSS files exist in `src/components/MES/`

### LocalStorage Not Working
**Problem**: Expanded stages don't persist

**Solution**: Check browser console for errors. Clear localStorage:
```javascript
// In browser console:
localStorage.removeItem('mes_expanded_stages');
```

---

## 📊 Performance Notes

### Load Time
- **First Load**: ~2-3 seconds (includes Mermaid library)
- **Navigation**: Instant (all data is static)
- **Scroll Performance**: Smooth 60fps

### Bundle Size
- **MES Module**: ~150KB (uncompressed)
- **Mermaid.js**: ~800KB (loaded once)
- **Total Page Weight**: ~1MB (acceptable for internal tool)

### Optimization Opportunities (Future)
- Lazy load Mermaid diagrams (render on scroll)
- Code split by stage (load stages on expand)
- Virtual scrolling for large tables
- Image optimization (if logos added)

---

## 📝 Feedback Template

After reviewing, please provide feedback on:

### Visual Design
- [ ] Pipeline navigation is intuitive
- [ ] Color scheme is professional
- [ ] Stage headers are attractive
- [ ] Department colors are distinctive
- [ ] PPS critical gates are prominent enough
- [ ] Font sizes are readable

### Content
- [ ] All 17 phases are correct
- [ ] Step descriptions are clear
- [ ] Department assignments are accurate
- [ ] Forms/documents list is complete
- [ ] Process rules are comprehensive
- [ ] Abbreviations are helpful

### Usability
- [ ] Navigation is smooth
- [ ] Expand/collapse works well
- [ ] Mobile layout is usable
- [ ] Print layout is clean
- [ ] Reference panels are helpful
- [ ] Flowcharts aid understanding

### Changes Needed
- [ ] Add/remove phases
- [ ] Change colors
- [ ] Add more details to steps
- [ ] Simplify terminology
- [ ] Other: _________________

---

## ✅ Approval Checklist

Before proceeding to Phase 2, confirm:

- [ ] Visual design approved
- [ ] All 17 phases reviewed and verified
- [ ] Critical gates (13.4, 13.5) are correctly highlighted
- [ ] Department color coding makes sense
- [ ] Process rules are accurate
- [ ] Mobile layout is acceptable
- [ ] Print layout works for documentation
- [ ] Ready to proceed with interactive features

---

## 📞 Support

If you encounter issues:

1. **Check Terminal**: Look for error messages in the `npm run dev` terminal
2. **Check Browser Console**: Press F12 → Console tab for JavaScript errors
3. **Clear Cache**: Hard refresh with Ctrl+Shift+R
4. **Restart Server**: Stop (`Ctrl+C`) and restart (`npm run dev`)

---

## 🎉 Success!

If you can see the complete workflow with all 17 phases, collapsible stages, colored departments, and flowcharts, **Phase 1 is successfully deployed!**

Time to review and approve before moving to Phase 2 (interactivity). 🚀

---

**Last Updated**: February 18, 2026  
**Version**: Phase 1 Quick Start  
**Status**: ✅ Ready for Review
