# ProPackHub — Coding Rules & Development Strategy

> **Purpose**: This document is the single source of truth for how code must be written in this project.  
> **When to use**: Reference BEFORE writing any new component, endpoint, CSS class, or query.  
> **Who enforces it**: The AI assistant (Copilot) must treat every rule here as a hard constraint.

---

## Table of Contents

1. [Core Discipline Rules](#1-core-discipline-rules)
2. [React & Component Rules](#2-react--component-rules)
3. [Ant Design 5 Rules](#3-ant-design-5-rules)
4. [CSS Rules](#4-css-rules)
5. [Backend & API Rules](#5-backend--api-rules)
6. [PostgreSQL & Query Rules](#6-postgresql--query-rules)
7. [Authentication & Authorization Rules](#7-authentication--authorization-rules)
8. [Performance Rules](#8-performance-rules)
9. [Error Handling Rules](#9-error-handling-rules)
10. [Code Hygiene Rules](#10-code-hygiene-rules)
11. [Business Logic Rules](#11-business-logic-rules)
12. [File & Structure Rules](#12-file--structure-rules)
13. [Pre-Commit Checklist](#13-pre-commit-checklist)

---

## 1. Core Discipline Rules

These are the root-cause rules. Every bug in the CRM audit traced back to violating one of these.

| # | Rule | Violation Example (what happened) |
|---|------|----------------------------------|
| D1 | **Never leave unused imports.** After any refactor, re-read the import block and delete anything not referenced in the file. | `FundOutlined`, `FormOutlined`, `SortAscendingOutlined`, `Tabs`, `Paragraph` left behind |
| D2 | **Never leave dead state.** If you remove the UI that uses a state variable, remove the `useState` declaration too. | `editingId`, `statusFilter`, `setSearchParams` declared but never read |
| D3 | **Never copy-paste without diffing.** When duplicating a component or CSS block, immediately diff the two copies. Extract shared logic into a single source. | AdminCRMDashboard and CRMDashboard are ~80% identical. Active Customers modal was copy-pasted with `localStorage.getItem('token')` instead of `'auth_token'` |
| D4 | **Verify every hardcoded string against the actual codebase.** localStorage keys, API paths, role names, column names — grep them first. | `'token'` vs actual key `'auth_token'` caused 401 |
| D5 | **Think in edge cases before writing.** For any filter/comparison: what happens at year boundary? What if a customer was active in month 7 but not month 1-2? | "New customer" detection only checked same months in prior year, missing customers active in other months |
| D6 | **One truth, one place.** If logic is shared, extract it. Don't duplicate across admin/non-admin dashboards, or across different endpoints. | Dashboard duplication, role-check patterns scattered |

---

## 2. React & Component Rules

### R1 — Component Structure (top-to-bottom order)
```jsx
// 1. React imports
import React, { useState, useEffect, useCallback, useMemo } from 'react';
// 2. Library imports (antd, recharts, etc.)
import { Card, Table, Modal, Tag, Space, Spin, Button } from 'antd';
// 3. Icon imports (separate line)
import { UserOutlined, ShoppingOutlined } from '@ant-design/icons';
// 4. Local imports (components, utils, CSS)
import MyComponent from './MyComponent';
import './MyModule.css';

// 5. Constants (outside component)
const PAGE_SIZE = 20;
const STATUS_OPTIONS = ['active', 'inactive'];

const MyComponent = () => {
  // 6. Hooks: App.useApp(), useNavigate(), useParams() — always first
  const { message, modal, notification } = App.useApp();
  const navigate = useNavigate();

  // 7. State declarations (grouped by purpose)
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);

  // 8. Derived/computed values (useMemo)
  const filteredData = useMemo(() => /* ... */, [data, filter]);

  // 9. Callbacks (useCallback)
  const handleClick = useCallback(() => /* ... */, [deps]);

  // 10. Effects (useEffect) — after all state and callbacks
  useEffect(() => { /* fetch */ }, [dependency]);

  // 11. Helper functions (non-hook, non-callback — only if not extractable)

  // 12. Column definitions (for Table — defined as const, not inline)
  const columns = [ /* ... */ ];

  // 13. Return JSX
  return ( /* ... */ );
};

export default MyComponent;
```

### R2 — Keys
```jsx
// ❌ NEVER: key={index}
{items.map((item, index) => <Card key={index} />)}

// ✅ ALWAYS: Use a stable, unique identifier
{items.map(item => <Card key={item.id} />)}
// If no ID exists, derive one:
{items.map(item => <Card key={`${item.name}-${item.date}`} />)}
```

### R3 — State
- Only declare `useState` if the value is **read** somewhere in the component.
- If a value is only written (setter called) but never read, it's dead — remove it.
- If a value can be derived from other state, use `useMemo` instead of `useState` + `useEffect`.
- Group related state into objects when they always change together.

### R4 — Effects
```jsx
// ❌ NEVER: Fetch with no cleanup or dependency awareness
useEffect(() => {
  fetch('/api/data').then(r => r.json()).then(setData);
}, []); // What if component unmounts mid-fetch?

// ✅ ALWAYS: Abort controller + dependency array
useEffect(() => {
  const controller = new AbortController();
  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/data', { signal: controller.signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      if (err.name !== 'AbortError') {
        message.error('Failed to load data');
        console.error('fetchData:', err);
      }
    } finally {
      setLoading(false);
    }
  };
  fetchData();
  return () => controller.abort();
}, [relevantDep]);
```

### R5 — Shared Logic Extraction
When two components share >30% logic (like AdminCRMDashboard and CRMDashboard):
1. Extract shared logic into a **custom hook** (`useDashboardData`, `useDashboardActions`).
2. Extract shared UI into a **shared component** (`DashboardCore`, `KPICards`).
3. Each variant only contains its **unique** additions.

### R6 — Prop Drilling Prevention
- If a value is needed 3+ levels deep, use React Context or pass via a shared hook.
- Auth token, user role, user info → always from context, never from `localStorage` directly in components (except the auth wrapper itself).

---

## 3. Ant Design 5 Rules

### A1 — Message / Notification / Modal (CRITICAL)
```jsx
// ❌ NEVER: Static import (causes "not in App context" warning)
import { message } from 'antd';
message.success('Done');

// ✅ ALWAYS: Use App.useApp() hook
import { App } from 'antd';
const MyComponent = () => {
  const { message, modal, notification } = App.useApp();
  // Now safe:
  message.success('Done');
  modal.confirm({ title: 'Sure?', onOk: () => {} });
};
```
> **Why**: Antd 5 provides `message`, `modal`, `notification` through the `App` context. Static imports create a separate DOM container that doesn't inherit theme/locale.

### A2 — Deprecated Props (Antd 5.x)
| Deprecated | Replacement | Component |
|-----------|-------------|-----------|
| `destroyOnClose` | `destroyOnHidden` | Modal, Drawer |
| `visible` | `open` | Modal, Drawer, Popover, Tooltip, Dropdown |
| `onVisibleChange` | `onOpenChange` | Popover, Tooltip, Dropdown |
| `dropdownClassName` | `popupClassName` | Select, TreeSelect, Cascader |
| `bordered` | `variant="borderless"` | Input, Select |
| `ghost` (on Collapse) | Use `styles` prop | Collapse |

**Rule**: Before using any Antd prop, check the Antd 5 migration changelog. If unsure, check the browser console for deprecation warnings after first render.

### A3 — Table
```jsx
// ❌ NEVER: Inline column definitions (re-created every render)
<Table columns={[{ title: 'Name', dataIndex: 'name' }]} />

// ✅ ALWAYS: Define columns outside render or useMemo
const columns = useMemo(() => [
  { title: 'Name', dataIndex: 'name', key: 'name' },
], [dependencyIfAny]);

// ❌ NEVER: Missing rowKey
<Table dataSource={data} />

// ✅ ALWAYS: Explicit rowKey
<Table dataSource={data} rowKey="id" />
// Or if no unique field:
<Table dataSource={data} rowKey={(record) => `${record.name}-${record.date}`} />
```

### A4 — Form
- Always use `Form.useForm()` hook for programmatic control.
- Always set `initialValues` on `<Form>`, never on individual `<Form.Item>`.
- Use `form.setFieldsValue()` for dynamic updates, not state + controlled inputs.

---

## 4. CSS Rules

### C1 — Naming Convention
```css
/* Module prefix for all classes */
.crm-card-header { }
.crm-table-wrapper { }
.presale-pipeline-stage { }
.budget-input-cell { }

/* ❌ NEVER: Generic names that can collide */
.card-header { }
.wrapper { }
.active { }
```

### C2 — No Duplicate Selectors
Before adding a new CSS rule:
1. **Search** for the selector name in the file first (Ctrl+F).
2. If it exists, **add to the existing block** — don't create a new one.
3. When refactoring, remove the **old** block entirely, don't leave an empty copy.

### C3 — Dead CSS Removal
When removing a component or feature:
1. Grep the CSS file for all classes used by that component.
2. Check if any other component uses those classes.
3. If not, delete them.

### C4 — Organization
```css
/* ==========================================
   MODULE NAME — Section Description
   ========================================== */

/* --- Layout / Container --- */
.crm-dashboard-container { }

/* --- Cards / Panels --- */
.crm-kpi-card { }

/* --- Tables --- */
.crm-table-wrapper { }

/* --- Modals --- */
.crm-modal-header { }

/* --- Animations --- */
.crm-animate-in { }

/* --- Responsive --- */
@media (max-width: 768px) { }
```

### C5 — Inline Styles
```jsx
// ❌ Avoid for anything reusable
<div style={{ padding: 16, marginBottom: 8, borderRadius: 4 }}>

// ✅ OK only for truly dynamic values
<div style={{ width: `${percentage}%` }}>

// ✅ Prefer CSS classes
<div className="crm-card-content">
```

---

## 5. Backend & API Rules

### B1 — Route Structure
```
server/routes/{module}/index.js    — Main routes
server/routes/{module}/helpers.js  — Shared helpers/queries (if needed)
```

### B2 — Endpoint Naming
```
GET    /api/{module}/resource          — List
GET    /api/{module}/resource/:id      — Get one
POST   /api/{module}/resource          — Create
PUT    /api/{module}/resource/:id      — Update
DELETE /api/{module}/resource/:id      — Delete
GET    /api/{module}/resource/stats    — Aggregations/dashboard
```

### B3 — Response Format
```js
// ✅ Consistent response shape
res.json({ success: true, data: rows });
res.json({ success: true, data: rows, meta: { total, page, pageSize } });
res.json({ success: false, error: 'Human-readable message' });

// ❌ NEVER: Inconsistent shapes
res.json(rows);           // No wrapper
res.json({ rows: data }); // Different key name
res.send('error');        // String response for errors
```

### B4 — Input Validation
```js
// ✅ ALWAYS validate at the top of the handler
router.get('/resource', authenticateToken, async (req, res) => {
  const year = parseInt(req.query.year);
  if (!year || year < 2020 || year > 2030) {
    return res.status(400).json({ success: false, error: 'Invalid year' });
  }
  // ... proceed
});
```

### B5 — Error Responses
```js
// Map errors to correct HTTP status codes:
// 400 — Bad input (missing/invalid params)
// 401 — Not authenticated (no token, expired token)
// 403 — Forbidden (authenticated but lacks permission)
// 404 — Resource not found
// 500 — Server error (catch blocks)

// ❌ NEVER: 403 for "you're not an admin" when the user has a valid role
// that should see scoped data. Use scoping instead.

// ✅ ALWAYS: Scope data, don't block access entirely
if (isAdmin) {
  // return all data
} else {
  // filter to user's group/scope
}
```

---

## 6. PostgreSQL & Query Rules

### Q1 — Parameterized Queries
```js
// ❌ NEVER: String interpolation for user values
const q = `SELECT * FROM users WHERE name = '${name}'`; // SQL INJECTION

// ✅ ALWAYS: Parameterized
const q = `SELECT * FROM users WHERE name = $1`;
const result = await pool.query(q, [name]);

// ✅ OK: Interpolation ONLY for validated/controlled values (year numbers, column names from whitelist)
const allowedColumns = ['year', 'month_no', 'division'];
if (!allowedColumns.includes(sortBy)) throw new Error('Invalid sort');
const q = `SELECT * FROM fp_actualcommon ORDER BY ${sortBy}`;
```

### Q2 — CTE Structure for Complex Queries
```sql
-- ✅ Use CTEs for readability
WITH 
  base_data AS (
    SELECT ... FROM fp_actualcommon WHERE year = $1
  ),
  aggregated AS (
    SELECT customer_name, SUM(net_amount) as total
    FROM base_data GROUP BY customer_name
  )
SELECT * FROM aggregated ORDER BY total DESC;
```

### Q3 — Year/Period Comparison Logic (CRITICAL — the "new customer" bug rule)
```sql
-- When determining "new vs returning" customers:
-- ❌ NEVER: Compare same months only
WHERE year = prev_year AND month_no IN (1,2)  -- Misses customer active in month 7

-- ✅ ALWAYS: Check the ENTIRE previous year for existence
WHERE year = prev_year  -- No month filter for existence check
-- The "new" definition: Zero transactions in ALL of previous year, regardless of current period
```

### Q4 — Always COALESCE Aggregations
```sql
-- ❌ Returns NULL if no rows
SELECT SUM(amount) as total FROM ... WHERE 1=0

-- ✅ Returns 0
SELECT COALESCE(SUM(amount), 0) as total FROM ...
```

### Q5 — LIMIT Results for Drill-Down Endpoints
Drill-down/modal endpoints should have sensible limits (e.g., `LIMIT 500`) and communicate when data is truncated:
```js
const LIMIT = 500;
const result = await pool.query(`... LIMIT ${LIMIT + 1}`);
const truncated = result.rows.length > LIMIT;
const data = result.rows.slice(0, LIMIT);
res.json({ success: true, data, truncated });
```

---

## 7. Authentication & Authorization Rules

### Auth1 — Token Storage Key
The app stores the auth token as `auth_token` in localStorage.
```js
// ❌ NEVER assume the key name
localStorage.getItem('token')
localStorage.getItem('jwt')
localStorage.getItem('accessToken')

// ✅ ALWAYS: Use the actual key
localStorage.getItem('auth_token')

// ✅ BETTER: Use a constant
// In src/utils/constants.js:
export const AUTH_TOKEN_KEY = 'auth_token';
// Then:
localStorage.getItem(AUTH_TOKEN_KEY);
```

### Auth2 — Role-Based Access (Scoping, Not Blocking)
```js
// ❌ NEVER: Block non-admins from data they should see (even if scoped)
if (req.user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

// ✅ ALWAYS: Scope data based on role
// Admin has full access; other manager roles require designation_level >= 6
function hasFullAccess(user) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const MANAGER_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];
  return MANAGER_ROLES.includes(user.role) && (Number(user.designation_level) || 0) >= 6;
}
const isFullAccess = hasFullAccess(req.user);

if (isFullAccess) {
  // Return all data (or filtered by optional params)
} else {
  // Resolve user's group and scope to it
  const group = await resolveUserGroup(req.user);
  // Add WHERE clause restricting to user's group
}
```

### Auth3 — Authorization Check Pattern
When adding auth to a new endpoint:
1. Who should see ALL data? → `admin` role, or manager-role users with `designation_level >= 6`
2. Who should see SCOPED data? → Everyone else with valid auth
3. Who should see NOTHING? → Only unauthenticated (handled by `authenticateToken`)
4. Write the scoping logic. Test with admin user AND at least one non-admin.

### Auth4 — Frontend Fetch Pattern
```js
// ✅ Standard authenticated fetch
const fetchData = async () => {
  try {
    const token = localStorage.getItem('auth_token');
    const res = await fetch('/api/endpoint', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Request failed');
    return json.data;
  } catch (err) {
    message.error(err.message);
    console.error('fetchData:', err);
  }
};
```

---

## 8. Performance Rules

### P1 — Caching Pattern
```js
// ✅ Standard in-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 45_000; // 45 seconds

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Cache key must include ALL parameters that affect the result:
// ✅ `dash|${year}|${period}|${division}|${groupId}`
// ❌ `dashboard` (ignores filters — serves stale/wrong data)
```

### P2 — Materialized Views for Expensive Subqueries
If the same subquery appears in 3+ endpoints:
1. Create a materialized view.
2. Refresh on server start + on a timer (5 min default).
3. Replace all inline subquery references.

### P3 — Pagination
Any endpoint that can return >100 rows MUST support pagination:
```js
const page = parseInt(req.query.page) || 1;
const pageSize = Math.min(parseInt(req.query.pageSize) || 20, 100);
const offset = (page - 1) * pageSize;

// Get total count (only if needed for UI, otherwise skip)
const countResult = await pool.query(`SELECT COUNT(*) FROM ...`);
const total = parseInt(countResult.rows[0].count);

// Get page data
const dataResult = await pool.query(`... LIMIT $1 OFFSET $2`, [pageSize, offset]);
res.json({ success: true, data: dataResult.rows, meta: { total, page, pageSize } });
```

### P4 — Frontend Table Performance
- For tables with >200 rows: enable `virtual` scroll or implement server-side pagination.
- Never load thousands of records into an Antd Table without `virtual` mode.
- Use `useMemo` for column definitions and `useCallback` for handlers.

---

## 9. Error Handling Rules

### E1 — Backend: Every Route Gets a Try/Catch
```js
router.get('/endpoint', authenticateToken, async (req, res) => {
  try {
    // ... logic
  } catch (err) {
    console.error('GET /endpoint:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});
```

### E2 — Frontend: Never Swallow Errors
```js
// ❌ NEVER: Silent catch
try { await fetch(...) } catch (e) { /* nothing */ }

// ✅ ALWAYS: Log + notify user
try {
  await fetch(...)
} catch (err) {
  console.error('FeatureName.action:', err);
  message.error('Failed to load data');
}
```

### E3 — Null Safety
```js
// ❌ Crashes if data is null/undefined
data.map(item => item.name)

// ✅ Safe
(data || []).map(item => item?.name || 'Unknown')

// ✅ For API responses
const items = json?.data || [];
```

---

## 10. Code Hygiene Rules

### H1 — Import Audit After Every Change
After modifying any file:
1. Scan the import block.
2. For each import, verify it's used in the file body.
3. Remove any that aren't. **No exceptions.**

### H2 — State Audit After Every Refactor
After removing UI elements or changing functionality:
1. Search the file for every `useState`, `useRef`, `useCallback`, `useMemo`.
2. For each, verify the variable AND setter are both used.
3. Remove any that aren't.

### H3 — Console Statements
```js
// ✅ OK in catch blocks (for debugging)
console.error('fetchCustomers:', err);

// ❌ NEVER in production: Debug logging
console.log('data:', data);
console.log('here');
console.log('TODO: remove this');
```

### H4 — Magic Numbers and Strings
```js
// ❌ NEVER: Magic values scattered in code
if (role === 'admin' || role === 'sales_manager' || role === 'sales_coordinator')
setTimeout(refresh, 300000);
if (page_size > 100)

// ✅ ALWAYS: Named constants + level check for manager access
const MANAGER_ROLES = ['manager', 'sales_manager', 'sales_coordinator'];
const hasFullAccess = (u) => u?.role === 'admin' || (MANAGER_ROLES.includes(u?.role) && (u?.designation_level || 0) >= 6);
const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_PAGE_SIZE = 100;
```

### H5 — No Dead Code
- Commented-out code blocks must be deleted, not left "for reference".
- If you think you might need it, that's what git history is for.
- Empty functions, empty CSS rules, placeholder TODO comments — delete all.

---

## 11. Business Logic Rules

### BL1 — Question Every Assumption
Before implementing any business logic (e.g., "new customer", "active customer", "growth rate"):
1. **Define it**: Write the exact business definition in a comment above the query/function.
2. **Edge cases**: What if the customer was active in month 7 but not month 1? What if they have zero transactions? What if the year just started?
3. **Verify with data**: Run a diagnostic query to validate the logic produces expected results against real data before calling it done.

```sql
-- Business definition: "New customer" = a customer who has transactions
-- in the current period but ZERO transactions in the entire previous year.
-- NOT limited to the same months in the previous year.
```

### BL2 — Year Boundary Logic
Fiscal Year runs Jan–Dec. When comparing periods:
- **YTD**: Month 1 through current month
- **Same period last year**: Same months BUT existence checks span the full year
- **FY**: All 12 months
- **Quarter boundaries**: Q1=1-3, Q2=4-6, Q3=7-9, Q4=10-12

### BL3 — Data Integrity
- Always handle the case where `fp_customer_unified` has no matching record (customer_id not found).
- Always handle NULL `sales_rep_group_id` — fall back to name-based matching.
- Always `TRIM()` and `LOWER()` when comparing customer names across tables.

---

## 12. File & Structure Rules

### F1 — Module Directory Structure
```
src/components/{ModuleName}/
  {ModuleName}Module.jsx          — Routes/layout wrapper
  {ModuleName}Dashboard.jsx       — Main dashboard
  {ModuleName}List.jsx            — List view
  {ModuleName}Detail.jsx          — Detail view
  {ModuleName}Form.jsx            — Create/edit form
  hooks/
    use{ModuleName}Data.js        — Data fetching hooks
    use{ModuleName}Actions.js     — Mutation hooks
  components/
    {SubComponent}.jsx            — Shared sub-components
  {ModuleName}.css                — All styles for the module
```

### F2 — Backend Route File Size
If a route file exceeds ~500 lines:
- Extract helpers to `helpers.js` in the same directory.
- Extract complex query builders to `queries.js`.
- Keep the route handlers thin — they should validate input, call a function, return response.

### F3 — New Module Checklist
When creating a new module (e.g., Presale):
- [ ] Create directory structure per F1
- [ ] Create CSS file with module prefix
- [ ] Create backend route file with proper auth middleware
- [ ] Add routes to server router registration
- [ ] Add frontend routes to App.jsx / router config
- [ ] Test with admin AND non-admin user
- [ ] Check browser console for warnings
- [ ] Build passes cleanly

---

## 13. Pre-Commit Checklist

Run through this **every time** before considering work complete:

### Frontend
- [ ] No unused imports (scan import block manually)
- [ ] No dead state variables (`useState` where value is never read)
- [ ] No `key={index}` — use stable unique IDs
- [ ] `App.useApp()` for message/modal/notification (never static import)
- [ ] No deprecated Antd props (`visible` → `open`, `destroyOnClose` → `destroyOnHidden`)
- [ ] `rowKey` set on every `<Table>`
- [ ] No hardcoded `'token'` — use `'auth_token'`
- [ ] Every `fetch` has error handling (try/catch + user notification)
- [ ] No `console.log` debug statements (only `console.error` in catch blocks)

### Backend
- [ ] Every route has try/catch with 500 response
- [ ] Input params validated at top of handler
- [ ] Role-based access uses scoping, not blocking
- [ ] Cache keys include ALL variable parameters
- [ ] Parameterized queries for all user input
- [ ] `COALESCE` on all aggregation results
- [ ] Response format follows `{ success, data, [meta] }` shape

### CSS
- [ ] No duplicate selectors (search before adding)
- [ ] No empty rule blocks
- [ ] All class names have module prefix
- [ ] Removed CSS for deleted components

### Build
- [ ] `npx vite build` passes with zero errors
- [ ] No new console warnings in browser
- [ ] Test with at least admin + one non-admin role

---

## Prompt Addendum — What to Tell the AI

When starting new work, include this in your prompt or system instructions:

> **Before writing any code, re-read `docs/CODING_RULES.md` in the workspace.**
> Apply ALL rules from that document. Specifically:
> - Use `App.useApp()` for antd message/modal/notification
> - Use `'auth_token'` for localStorage key
> - Set `rowKey` on every Table
> - Use stable keys, never `key={index}`
> - Remove unused imports before finishing
> - Remove dead state before finishing
> - Scope data by role, don't block with 403
> - Add try/catch to every route
> - Run a final import/state audit on every modified file
> - COALESCE all SQL aggregations
> - Test business logic edge cases with diagnostic queries

---

## Tech Stack Reference

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React | 18.3.1 |
| Build | Vite | 7.3.0 |
| UI Library | Ant Design | 5.25.1 |
| Icons | @ant-design/icons | 6.0.0 |
| Charts | Recharts | 3.6.0 |
| Routing | react-router-dom | 7.6.3 |
| Backend | Node.js + Express | - |
| Database | PostgreSQL | - |
| Auth | JWT (Bearer token) | - |
| Auth token key | `auth_token` | in localStorage |
| Server port | 3001 | - |
| Frontend port | 3000 | (Vite dev) |
| Full-access roles | `admin` always; `manager`/`sales_manager`/`sales_coordinator` only if `designation_level >= 6` | Field trips, approval queues, rep selector |

---

*Last updated: 2026-03-18*
*Authored after CRM audit that found: 10 static message violations, 5 unused imports, 3 dead state vars, 5 duplicate CSS selectors, 1 deprecated prop, 1 wrong localStorage key, 1 wrong business logic definition.*
*Updated 2026-03-18: Role-based access now requires designation_level >= 6 for non-admin manager roles (field visit planner auth fix).*
