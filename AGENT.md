# AGENT.md — ProPackHub / PEBI
> **⚠️ READ THIS ENTIRE FILE BEFORE WRITING ANY CODE.**
> **This applies to ALL agents: Claude, Cursor, Windsurf, Copilot, Aider, and any other tool.**
> **Last Updated:** 2026-03-28
>
> **Copilot users:** Module-specific context auto-loads via `.github/instructions/` when you touch relevant files.
> Use `/session-manager` skill for guided session start/end. See `.github/copilot-instructions.md` for the compact version.

---

## 1. SESSION START PROTOCOL (mandatory — every session, every agent)

Do these steps IN ORDER before anything else:

1. **Read `docs/PROJECT_CONTEXT.md`** — understand the stack, folder structure, and key decisions
2. **Read the last 5 entries of `docs/SESSION_LOG.md`** — know what was recently done
3. **Read `docs/TECH_DEBT.md`** — know what known issues exist before touching files
4. **Respond with a 3-bullet summary:**
   - What the project is and its current state
   - What was last worked on (from session log)
   - Your proposed plan for today's task
5. **Wait for approval before writing any code**

> Exception: If the task is a simple, safe, isolated fix (e.g., fix a typo, change a color), you may proceed — but still read the 3 docs first.

---

## 2. SESSION END PROTOCOL (mandatory — every session, every agent)

Before closing any session:

1. **Append one row to `docs/SESSION_LOG.md`** using this format:
   ```
   | DATE | AGENT NAME | What was done (1 sentence) | Files created/modified | New tech debt if any |
   ```
2. **Update `docs/TECH_DEBT.md`** if any shortcut was taken or new issue discovered
3. **Update `docs/API_CONTRACTS.md`** if any new endpoint was created or modified
4. **State out loud:** "Session complete. [X] files changed. Session log updated."

---

## 3. PRE-CODE CHECKLIST (answer before writing any function or component)

You MUST answer all 6 questions before writing code. State your answers in chat.

- [ ] **Existing utility check**: Is there already a function/component in `/src/services/`, `/src/utils/`, or `/src/hooks/` that does part of this? If yes, reuse it.
- [ ] **File size check**: Will this file exceed 300 lines? If yes, name the sub-files NOW before starting.
- [ ] **Responsibility check**: Does this file/function do ONE thing? If it does 2+ things, split it.
- [ ] **Reusability check**: Will this logic be needed in more than one place? If yes, put it in a service/util, not inline.
- [ ] **Type check**: What are the TypeScript / PropTypes for inputs and outputs? Define them first.
- [ ] **Debt check**: Does `docs/TECH_DEBT.md` list any issue in the file I'm about to touch? If yes, note it.

If you cannot answer all 6, stop and ask before proceeding.

---

## 4. HARD CODING RULES (violations must be flagged, not silently broken)

### D1 — No Unused Imports
After any edit, re-read the import block. Delete everything not referenced in the file.
```jsx
// ❌ Bad: leftover imports from a refactor
import { Modal, Tabs, Paragraph, FundOutlined } from '...'; // none of these used

// ✅ Good: only what is actually used
import { Modal } from 'antd';
```

### D2 — No Dead State
If you remove the UI that uses a state variable, remove the `useState` too.
```jsx
// ❌ Bad: declared but never read anywhere
const [editingId, setEditingId] = useState(null);
```

### D3 — No Copy-Paste Without Diffing
If you duplicate a component or logic block, immediately extract the shared part. Two files must never be ~80% identical.
```
Before copy-pasting, ask: "Should this be a shared component or service instead?"
```

### D4 — No Hardcoded Strings
Verify every key/path/name against the actual codebase before using it.
```jsx
// ❌ Bad: will cause 401 silently
localStorage.getItem('token')

// ✅ Good: the actual key used across this codebase
localStorage.getItem('auth_token')
```

### D5 — No Magic Numbers
Every number that has a meaning must be a named constant.
```jsx
// ❌ Bad
if (score > 85) { ... }

// ✅ Good
const CHURN_RISK_THRESHOLD = 85;
if (score > CHURN_RISK_THRESHOLD) { ... }
```

### D6 — One Truth, One Place
Shared logic must be extracted. Never duplicate business logic across admin/non-admin views, across routes, or across components.

### D7 — No Avoidable Horizontal Scroll
Desktop UIs must fit available width without horizontal scrolling by default.

Before adding `scroll.x` or any horizontal scrollbar in tables/cards:
1. Leave at least one low-priority text column flexible (no fixed width)
2. Tighten numeric/action column widths first
3. Use ellipsis or wrapping for long labels/tags
4. Hide non-critical columns on smaller breakpoints

Only keep horizontal scroll when the data is genuinely wide and no reasonable responsive layout exists.

---

## 5. REACT COMPONENT RULES

### Component File Structure (always in this order)
```jsx
// 1. React imports
import React, { useState, useEffect, useCallback, useMemo } from 'react';
// 2. Library imports (antd, recharts, etc.)
import { Card, Table, Button, Modal } from 'antd';
// 3. Icon imports
import { UserOutlined } from '@ant-design/icons';
// 4. Local imports
import myService from '../../services/myService';
import './MyComponent.css';

// 5. Constants (outside component, at file top)
const PAGE_SIZE = 20;

// 6. Component
const MyComponent = () => {
  // Hooks first (App.useApp, useNavigate, useParams)
  const { message } = App.useApp();
  // State
  const [data, setData] = useState([]);
  // Derived values (useMemo)
  const filtered = useMemo(() => ..., [data]);
  // Callbacks (useCallback)
  const handleClick = useCallback(() => ..., []);
  // Effects (after state + callbacks)
  useEffect(() => { ... }, []);
  // Column definitions (not inline in JSX)
  const columns = [...];
  // Return
  return ( ... );
};

export default MyComponent;
```

### Key Rules
- **Never use `key={index}`** — always use a stable unique ID
- **Column definitions** go in a `const columns = [...]` above the return, never inline in `<Table>`
- **`App.useApp()`** for `message`, `modal`, `notification` — never use the standalone hooks directly
- **No business logic in `.jsx` files** — fetch calls and data transformations go in `src/services/`
- **File size limit: 300 lines** for components. Split larger files into sub-components.

---

## 6. BACKEND / API RULES

### B1 — Single Database Config
**Always** use `server/database/config.js`. It contains `authPool`, `getDivisionPool`, and proper connection pooling. Never use `server/config/database.js` — it is incomplete.

### B2 — Division Whitelist (CRITICAL — prevents SQL injection)
```javascript
// ALWAYS validate division before using in any query
const VALID_DIVISIONS = ['FP', 'HC'];
if (!VALID_DIVISIONS.includes(req.params.division?.toUpperCase())) {
  return res.status(400).json({ error: 'Invalid division' });
}
```

### B3 — No console.log
Always use the winston logger:
```javascript
const logger = require('../utils/logger');
logger.info('message');
logger.error('message', { error: err.message });
// Never: console.log(), console.error()
```

### B4 — Route Structure
```javascript
// Every protected route must have auth middleware
router.get('/my-route', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  try {
    // ... logic
    res.json({ data: result });
  } catch (error) {
    logger.error('Route error:', { error: error.message });
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

### B5 — No Frontend Hardcoded URLs
```javascript
// ❌ Bad — in any frontend component
const res = await axios.get('http://localhost:3001/api/customers');

// ✅ Good — always use the config
import { API_BASE } from '../../config/api';
const res = await axios.get(`${API_BASE}/api/customers`);
```

---

## 7. CSS RULES

- Use module-scoped CSS files (`MyComponent.css`) — never global styles for component-specific rules
- Use Ant Design design tokens for colors, spacing, and typography — never raw hex values for UI colors
- Class names: `kebab-case` always
- No `!important` unless fighting a third-party library and there is absolutely no other way
- No inline `style={{}}` for anything other than dynamic values (e.g., computed widths)

---

## 8. DATABASE / QUERY RULES

- Always use parameterized queries — never string concatenation in SQL
- Always include `tenant_id` filter in every multi-tenant query
- Index audit: before adding a new query pattern to a production route, check if the columns are indexed
- Never run raw schema changes without a migration script in `server/scripts/`

---

## 9. ERROR HANDLING RULES

```javascript
// Backend — every async route handler must have try/catch
try {
  const result = await someDbCall();
  res.json({ success: true, data: result });
} catch (error) {
  logger.error('Context of what failed:', { error: error.message, stack: error.stack });
  res.status(500).json({ error: 'Operation failed' }); // never expose stack to client
}

// Frontend — every API call must handle the error state
const [error, setError] = useState(null);
try {
  const data = await myService.getData();
  setData(data);
} catch (err) {
  setError(err.message);
  message.error('Failed to load data. Please try again.');
}
```

---

## 10. WHAT TO DO WHEN ASKED TO ADD A NEW FEATURE

Follow this sequence every time:

```
1. READ: Scan existing files in the relevant module folder first
2. CHECK: Look in docs/TECH_DEBT.md for any related debt
3. PLAN: Write a 3-bullet plan and wait for approval
4. TYPES FIRST: Define all TypeScript/PropTypes before implementation
5. SERVICE FIRST: Write the API service function before the component
6. COMPONENT: Build the UI component, importing from the service
7. REVIEW: Re-read the file — remove unused imports, dead state, magic numbers
8. LOG: Update docs/SESSION_LOG.md and docs/API_CONTRACTS.md
```

---

## 11. FILE SIZE ENFORCEMENT

| File Type | Soft Limit | Hard Limit | Action if Exceeded |
|-----------|-----------|------------|-------------------|
| React component (`.jsx`) | 200 lines | 300 lines | Split into sub-components in a subfolder |
| Service file (`.js`) | 150 lines | 250 lines | Split by domain (e.g., `crmService.js` → `crmListService.js` + `crmDetailService.js`) |
| Backend route file | 200 lines | 350 lines | Split into sub-routers |
| CSS file | 150 lines | 200 lines | Split into component-scoped files |

**If you are about to write a file that will exceed the hard limit, stop, state the split plan, and get approval first.**

---

## 12. AGENT ROLE GUIDE

Use the right mode for the right task. Tell the agent which role it is playing.

| Role | When to Use | What to Give It |
|------|-------------|-----------------|
| **Planner** | Designing a new feature or module | `docs/PROJECT_CONTEXT.md` + `docs/TECH_DEBT.md` only. No source files. Output: a plan. |
| **Builder** | Implementing an approved plan | `AGENT.md` + the 3-5 specific files being modified |
| **Reviewer** | After builder finishes | Only the diff / changed files. Output: list of rule violations. |
| **Debugger** | Fixing a broken feature | `docs/TECH_DEBT.md` + the specific broken file + error message |
| **Refactorer** | Cleaning up a messy file | `AGENT.md` rules + the file to refactor. No other context needed. |

---

## 13. STANDARD SESSION BOOTSTRAP PROMPT

Copy and use this at the start of every new agent session:

```
BOOTSTRAP — READ BEFORE ANYTHING ELSE.

1. Read AGENT.md at the project root completely.
2. Read docs/PROJECT_CONTEXT.md completely.
3. Read the last 5 rows of docs/SESSION_LOG.md.
4. Read docs/TECH_DEBT.md completely.

Then respond ONLY with:
- Bullet 1: Current project state in one sentence
- Bullet 2: What was last worked on
- Bullet 3: Any relevant tech debt touching today's task
- Bullet 4: Your proposed plan for today (no code yet)

Do NOT write any code until I reply "go" or "approved".

TODAY'S TASK: [describe your task here]
```

---

## 14. STANDARD FEATURE REQUEST PROMPT

Use this when asking an agent to build something:

```
FEATURE REQUEST

[Describe what you want built in 2-3 sentences]

Before writing any code:
1. Confirm you have read AGENT.md, docs/PROJECT_CONTEXT.md, and docs/TECH_DEBT.md
2. List the files you will create or modify
3. Answer the Pre-Code Checklist (Section 3 of AGENT.md)
4. State if any TECH_DEBT items are relevant

Wait for my approval before coding.
After completing, update docs/SESSION_LOG.md and docs/API_CONTRACTS.md.
```

---

## 15. STANDARD BUG FIX PROMPT

Use this when something is broken:

```
BUG FIX REQUEST

Problem: [Describe exactly what is wrong]
Where: [File or feature area]
Error message: [Paste the exact error if available]
Expected behavior: [What should happen]

Before fixing:
1. Read AGENT.md
2. Read docs/TECH_DEBT.md — is this a known issue?
3. State your diagnosis (root cause) before touching any code
4. State exactly which file(s) you will modify

Do NOT touch files outside the direct scope of this bug.
After fixing, append to docs/SESSION_LOG.md.
```

---

## 17. CURRENCY DISPLAY — MANDATORY PATTERN

> **⚠️ This trips up every new agent. Read carefully.**

### The Problem
`formatCurrency()` from `CurrencyContext` prepends `companyCurrency.symbol`.
For AED accounts, that symbol is `'د.إ'` (Arabic Unicode) — **not in the app's fonts → renders as `?.?`**.
**Never use `formatCurrency()` for display in components.**

### The Correct Pattern (copy exactly)

```jsx
// 1. Imports
import UAEDirhamSymbol from './UAEDirhamSymbol'; // adjust relative path
import { useCurrency } from '../../contexts/CurrencyContext';

// 2. Inside component (after hooks)
const { companyCurrency, isUAEDirham } = useCurrency();

// Symbol: SVG for AED, plain text for all other currencies
const CurrencySymbol = () =>
  isUAEDirham() ? (
    <UAEDirhamSymbol style={{ width: '0.9em', height: '0.9em', verticalAlign: '-0.1em' }} />
  ) : (
    <span style={{ marginRight: '0.05em' }}>{companyCurrency?.symbol || '$'}</span>
  );

// JSX value render (for table cells, KPI cards)
const renderCurrency = (value, decimals = 2) => {
  const n = Number(value) || 0;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
      <CurrencySymbol />
      {n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
};

// Compact JSX (for KPI cards: shows 1.2k, 3.4M)
const renderCurrencyCompact = (value) => {
  const n = Number(value) || 0;
  const fmt = Math.abs(n) >= 1_000_000 ? (n/1_000_000).toFixed(2)+'M'
            : Math.abs(n) >= 1_000     ? (n/1_000).toFixed(1)+'k'
            : n.toFixed(0);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '1px' }}>
      <CurrencySymbol />
      {fmt}
    </span>
  );
};

// String-only (for Recharts tooltips, CSV — no SVG possible)
const currencyStr = (value) => {
  const sym = isUAEDirham() ? 'AED' : (companyCurrency?.symbol || '$');
  return `${sym} ${(Number(value)||0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};
```

### Key File Locations
| File | Purpose |
|------|---------|
| `src/components/dashboard/UAEDirhamSymbol.jsx` | The SVG Dirham symbol component |
| `src/components/MasterData/AEBF/BudgetTab.jsx` | Reference implementation (lines ~48–75) |
| `src/contexts/CurrencyContext.jsx` | Exports: `companyCurrency`, `isUAEDirham()`, `getCurrencySymbol()` |

### Recharts Chart Colors
`fill="var(--color-primary)"` **does not resolve** inside Recharts SVG `fill` attributes.
Always use hardcoded hex: `fill="#1677ff"`, `fill="#13c2c2"` etc.

---


```
SESSION RETRO

The session is now complete. Do the following:

1. Append one row to docs/SESSION_LOG.md with today's work summary
2. Add any new tech debt discovered to docs/TECH_DEBT.md
3. Update docs/API_CONTRACTS.md if new endpoints were created
4. List any rules from AGENT.md that were violated and why
5. Suggest one improvement to AGENT.md if anything was unclear

Report with ✅ / ⚠️ markers for each item.
```
