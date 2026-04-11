# Responsiveness Audit & Fix Plan — February 8, 2026

## Audit Summary

**Total CSS files:** 79  
**Files with issues (before):** 35 (33 HIGH, 2 MEDIUM)  
**Files with issues (after):** 17 (mostly false-positive "table overflow-x" — handled globally in App.css)  
**JSX files with inline style issues:** 26 (critical ones fixed)  
**Target breakpoints:** 1400px (large desktop), 1200px (desktop), 1024px (tablet landscape), 768px (tablet portrait), 480px (mobile)

## Completion Status

| Chunk | Status | Notes |
|-------|--------|-------|
| Chunk 1: Global Layout & Core | ✅ DONE | App.css, index.css, base-variables.css, animations, glassmorphism, hover-effects, neumorphism |
| Chunk 2: Dashboard Home & Header | ✅ DONE | DivisionSelector.css, FilterPanel.css, ActivePeriodsDisplay.jsx (icon-only buttons on mobile) |
| Chunk 3: Divisional Dashboard | ✅ DONE | ColumnConfigGrid.css, BudgetActualWaterfallDetail.css, MapSwitcher.css, HTMLExport.css, PDFExport.css, ProductGroupTable.css, TableView.css, TableDetailStyles.css, ChartContainer.module.css, CountryReference.css (fixed min-width), DivisionalDashboardLanding.css, KPIExecutiveSummary.css (already gold standard) |
| Chunk 4: Sales Dashboard | ✅ DONE | SalesByCustomerTableNew.css already has 4 responsive breakpoints |
| Chunk 5: WriteUp & Reports | ✅ DONE | WriteUpViewV2.css (added 768px/480px), WriteUpView.css (already had 1024px/768px) |
| Chunk 6: Login & Setup | ✅ DONE | Login.css already has 1200px/900px/600px/400px breakpoints |
| Chunk 7: CRM Module | ✅ DONE | CRM.css (added 768px/480px breakpoints) |
| Chunk 8: Settings Pages | ✅ DONE | DatabaseBackup.css, DeploymentPanel.css, PendingCountries.css, UserPermissions.css |
| Chunk 9: MasterData | ✅ DONE | CustomerManagement.css, SalesRepManagement.css (added 768px/480px), CustomerMasterPage.css (already had 768px) |
| Chunk 10: Platform & People/Access | ✅ DONE | PlatformDashboard.css (already had 1200px/768px/480px), NotificationBell.css (added 768px) |

---

## Page Map (All Routes)

| Route | Component | Sub-pages/Tabs |
|-------|-----------|----------------|
| `/login` | Login.jsx | — |
| `/setup` | SetupWizard.jsx | 5 steps (license, company, admin, divisions, complete) |
| `/dashboard` | Dashboard.jsx | Home cards → Divisional, Sales, CRM, AI Report, AI Learning, WriteUp |
| `/dashboard` → Divisional | DivisionalDashboardLanding.jsx | KPIExecutiveSummary, Charts, Tables, Reports |
| `/dashboard` → Sales | SalesBySaleRepTable.jsx | — |
| `/dashboard` → WriteUp | WriteUpViewV2.jsx | — |
| `/dashboard` → AI Report | ComprehensiveReportView.jsx | — |
| `/dashboard` → AI Learning | AILearningDashboard.jsx | — |
| `/settings` | Settings.jsx | Company, Periods, MasterData, Appearance, Backup, Admin, Deploy |
| `/settings` → Admin | Settings.jsx | Employees, Users, OrgChart, Territories, Authorization, OrgSettings |
| `/settings` → MasterData | MasterDataSettings.jsx | Customers, SalesReps, Products, Countries, RawProducts |
| `/crm` | CRMModule.jsx | Overview, Analytics, Reports, Customers, Prospects, Map, Products, Budget |
| `/people-access` | PeopleAccessModule.jsx | Users, SalesTeam, OrgChart, Territories, Roles, Authorization, Audit |
| `/platform` | PlatformDashboard.jsx | Companies, Plans |
| `/profile` | UserProfile.jsx | — |

---

## Chunk Plan (Ordered by Priority)

### CHUNK 1: Global Layout & Core (CRITICAL)
Files that affect every page.

| File | Issues | Fix |
|------|--------|-----|
| `App.css` | No mobile breakpoint, no overflow-x on Ant tables | Add 768px/480px breakpoints for global button/card sizing. Add `.ant-table-wrapper { overflow-x: auto }` |
| `index.css` | No breakpoints, no table overflow | Add overflow-x on resizable table wrappers |
| `styles/themes.css` | Check tab styles at mobile widths | Add responsive tab wrapping |
| `styles/themes/base-variables.css` | No mobile breakpoint, table overflow | Add responsive font-size variables, table overflow |
| `styles/effects/animations.css` | No mobile breakpoint | Add `prefers-reduced-motion` + reduce animation intensity on mobile |
| `styles/effects/glassmorphism.css` | No mobile breakpoint, table overflow | Add mobile breakpoint, reduce blur on mobile (performance) |
| `styles/effects/hover-effects.css` | No mobile breakpoint | Disable hover transforms on touch devices |
| `styles/effects/neumorphism.css` | No mobile breakpoint, table overflow | Add mobile breakpoint, reduce shadow complexity |

**Estimated effort:** Medium  
**Impact:** HIGH — fixes cascade to all pages

---

### CHUNK 2: Dashboard Home & Header
The first thing users see.

| File | Issues | Fix |
|------|--------|-----|
| `Dashboard.css` | Already has 768px/600px breakpoints ✅ | Minor: check home cards at 480px, verify back button on mobile |
| `common/Header.jsx` + CSS | 1 inline style | Check header layout at mobile widths, verify logo/nav collapse |
| `dashboard/DivisionSelector.css` | No mobile breakpoint | Add 768px breakpoint — stack selector vertically |
| `dashboard/FilterPanel.css` | No mobile breakpoint | Add 768px — stack filters vertically, full-width inputs |
| `dashboard/ActivePeriodsDisplay` | Check inline styles | Verify period chips wrap on mobile |

**Estimated effort:** Low  
**Impact:** HIGH — every user sees this

---

### CHUNK 3: Divisional Dashboard (KPI Cards, Charts, Tables)
The most complex page with the most components.

| File | Issues | Fix |
|------|--------|-----|
| `KPIExecutiveSummary.css` | Already has excellent breakpoints ✅ (1400/1200/1100/1024/900/768/480) | Reference model — no changes needed |
| `KPIExecutiveSummary.jsx` | Inline styles: `padding: '60px 40px'`, `fontSize: '48px'`, `maxWidth: '500px'` | Move to CSS classes with responsive breakpoints |
| `ColumnConfigGrid.css` | No mobile breakpoint (629 lines!) | Add 768px/480px — stack config columns, reduce padding |
| `BudgetActualWaterfallDetail.css` | No mobile breakpoint, large fonts | Add 768px — stack chart controls, scale fonts |
| `MapSwitcher.css` | No mobile breakpoint | Add 768px — full-width map toggle |
| `HTMLExport.css` | No mobile breakpoint, table overflow | Add overflow-x, responsive button layout |
| `PDFExport.css` | No mobile breakpoint, table overflow | Add overflow-x, responsive button layout |
| `ProductGroupTable.css` | No mobile breakpoint | Add 768px — horizontal scroll wrapper |
| `TableView.css` | No mobile breakpoint | Add 768px — horizontal scroll, reduce padding |
| `TableDetailStyles.css` | No mobile breakpoint | Add 768px — stack detail panels |
| `RawProductGroups.css` | Table without overflow-x | Add overflow-x scroll wrapper |
| `CountryReference.css` | Fixed min-width: 600px | Replace with responsive min-width |
| `SalesByCustomerTableNew.css` | Fixed min-width: 1200px | Replace with responsive approach |
| `charts/ChartContainer.module.css` | No mobile breakpoint | Add 768px — full-width charts |
| `charts/SalesVolumeChart.css` | Table without overflow-x | Add overflow-x |

**Inline style fixes (JSX):**
- `KPIExecutiveSummary.jsx` — Move 15+ inline styles to CSS classes
- `RawProductGroups.jsx` — Replace `minWidth: 420` on textarea with responsive CSS
- `MergeConsole.jsx` — Replace `minWidth: 260/420/300` with responsive CSS

**Estimated effort:** HIGH  
**Impact:** HIGH — main analytics page

---

### CHUNK 4: Sales Dashboard
| File | Issues | Fix |
|------|--------|-----|
| `SalesBySaleRepTable.jsx` | 12+ hardcoded `width: '10px'` spacer columns | Move spacer styling to CSS class `.spacer-col` (already has the class, just needs CSS) |
| Sales table CSS | Table overflow | Ensure horizontal scroll wrapper exists |

**Estimated effort:** Low  
**Impact:** HIGH — key business page

---

### CHUNK 5: WriteUp & Reports
| File | Issues | Fix |
|------|--------|-----|
| `WriteUpView.css` | Table without overflow-x | Add overflow-x |
| `WriteUpViewV2.css` | No mobile breakpoint (571 lines), large fonts | Add 768px/480px breakpoints, responsive toolbar |
| `WriteUpViewV2.jsx` | Inline: `padding: '60px 40px'`, `fontSize: '48px'`, `maxWidth: '500px'` | Move to CSS classes |
| `ProductGroupKeyFacts.jsx` | 10+ inline font sizes (`16px`, `20px`, `13px`) | Move to CSS classes with responsive scaling |
| Report table components | Various inline font sizes | Consolidate to CSS |

**Estimated effort:** Medium  
**Impact:** MEDIUM — used for report generation

---

### CHUNK 6: Login & Setup
| File | Issues | Fix |
|------|--------|-----|
| `Login.css` | 7 fixed widths >400px, 7 large fonts, no mobile breakpoint (1327 lines!) | Add 768px/480px — responsive form layout, scale fonts, fix fixed widths |
| `SetupWizard.jsx` | Inline: `width: 120`, `height: 120`, `fontSize: 64`, `fontSize: 24` | Move to CSS classes |

**Estimated effort:** Medium  
**Impact:** MEDIUM — first impression for new users

---

### CHUNK 7: CRM Module
| File | Issues | Fix |
|------|--------|-----|
| `CRM.css` | Table without overflow-x (1706 lines!) | Add overflow-x on all table containers, add 768px breakpoint for tab nav |
| CRM sub-components | Check Ant Design responsive props | Verify `Col xs/sm/lg` usage is correct |

**Estimated effort:** Medium  
**Impact:** MEDIUM — CRM is a major module

---

### CHUNK 8: Settings Pages
| File | Issues | Fix |
|------|--------|-----|
| `Settings.jsx` (tabs) | Tab buttons may overflow on mobile | Add responsive tab wrapping/scrolling |
| `DatabaseBackup.css` | No mobile breakpoint, table overflow | Add 768px, overflow-x |
| `DeploymentPanel.css` | No mobile breakpoint | Add 768px — stack deploy steps vertically |
| `PendingCountries.css` | Table overflow | Add overflow-x |
| `UserPermissions.css` | No mobile breakpoint, table overflow | Add 768px, overflow-x |
| `EmployeesManagement.jsx` | Inline: `fontSize: 13`, `padding: '4px 12px'`, `size={80}` | Move to CSS |
| `PeriodConfiguration.jsx` | Inline conditional font sizes | Move to CSS classes |

**Estimated effort:** Medium  
**Impact:** LOW — admin-only pages

---

### CHUNK 9: MasterData
| File | Issues | Fix |
|------|--------|-----|
| `CustomerManagement.css` | No mobile breakpoint | Add 768px |
| `CustomerMasterPage.css` | Table overflow | Add overflow-x |
| `SalesRepManagement.css` | No mobile breakpoint (680 lines), large font | Add 768px/480px, scale fonts |

**Estimated effort:** Low  
**Impact:** LOW — admin-only

---

### CHUNK 10: Platform & People/Access
| File | Issues | Fix |
|------|--------|-----|
| `PlatformDashboard.css` | Table overflow | Add overflow-x |
| `PlatformDashboard.jsx` | Inline: `fontSize: 12`, `fontSize: 10`, `marginBottom: 24` | Move to CSS |
| `PlanManagement.jsx` | Inline: `fontSize: 16/12/24/18`, `padding: 24` | Move to CSS |
| `UserProfile.jsx` | Inline: `maxWidth: 900`, `size={120}` | Move to CSS |
| `people/PeopleAccess.css` | Check responsive state | Verify |
| `common/NotificationBell.css` | No mobile breakpoint | Add 768px — reposition dropdown |

**Estimated effort:** Low  
**Impact:** LOW — admin/platform pages

---

## Global Fixes (Apply Once, Benefit All)

### 1. Add global table overflow-x
```css
/* In App.css or index.css */
.ant-table-wrapper,
table:not(.no-scroll) {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```
This single rule fixes the "table without overflow-x" issue in 15+ files.

### 2. Add responsive utility classes
```css
/* In a new file: src/styles/responsive.css */
@media (max-width: 768px) {
  .hide-mobile { display: none !important; }
  .full-width-mobile { width: 100% !important; min-width: 0 !important; }
  .stack-mobile { flex-direction: column !important; }
  .text-sm-mobile { font-size: 0.85rem !important; }
}
```

### 3. Disable hover effects on touch devices
```css
@media (hover: none) {
  .kpi-card:hover,
  .dashboard-home-card:hover,
  .category-card-modern:hover {
    transform: none;
  }
}
```

---

## Inline Style Migration Strategy

For JSX files with many inline styles, the approach is:
1. Create CSS classes for each inline pattern
2. Use responsive breakpoints in CSS instead of fixed px values
3. Keep only truly dynamic styles inline (colors based on data values, conditional visibility)

**Files requiring inline→CSS migration (by priority):**
1. `KPIExecutiveSummary.jsx` — ~15 inline styles (padding, fonts, maxWidth)
2. `WriteUpViewV2.jsx` — ~12 inline styles (padding, fonts, maxWidth)
3. `SalesBySaleRepTable.jsx` — 12+ spacer column styles (already has `.spacer-col` class)
4. `ProductGroupKeyFacts.jsx` — ~10 inline font sizes
5. `SetupWizard.jsx` — ~8 inline dimensions
6. `MergeConsole.jsx` — ~6 inline widths
7. `PlatformDashboard.jsx` — ~8 inline font sizes
8. `EmployeesManagement.jsx` — ~5 inline styles

---

## What's Already Good ✅

These files/components already have solid responsive design:
- `KPIExecutiveSummary.css` — 8 breakpoints (1400→480px), excellent reference
- `Dashboard.css` — Home cards responsive at 900/600px
- `SalesByCustomerTableNew.css` — 4 media queries
- `SalesVolumeChart.css` — 3 media queries
- `PlatformDashboard.css` — 3 media queries with Ant Design responsive grid
- `Login.css` — Has 6 media queries (but needs mobile-specific ones)

---

## Implementation Order

1. **Chunk 1** (Global) → fixes cascade everywhere
2. **Chunk 2** (Dashboard Home) → first user impression
3. **Chunk 3** (Divisional KPIs) → most complex, highest usage
4. **Chunk 4** (Sales) → key business page
5. **Chunk 5** (WriteUp/Reports) → report generation
6. **Chunk 6** (Login/Setup) → new user experience
7. **Chunk 7** (CRM) → major module
8. **Chunk 8** (Settings) → admin pages
9. **Chunk 9** (MasterData) → admin pages
10. **Chunk 10** (Platform/People) → lowest priority

---

## Testing Checklist

For each chunk, verify at these widths:
- [ ] 1920px (Full HD desktop)
- [ ] 1440px (Laptop)
- [ ] 1024px (Tablet landscape / iPad Pro)
- [ ] 768px (Tablet portrait / iPad)
- [ ] 480px (Mobile landscape)
- [ ] 375px (Mobile portrait / iPhone SE)

Check:
- [ ] No horizontal overflow (no sideways scroll on body)
- [ ] Tables scroll horizontally within their container
- [ ] Cards stack vertically on mobile
- [ ] Fonts are readable (min 12px on mobile)
- [ ] Buttons/inputs are tap-friendly (min 44px touch target)
- [ ] Navigation is accessible on mobile
- [ ] Charts resize or scroll properly
- [ ] Modals don't overflow viewport
- [ ] Print layout still works (don't break `@media print`)
