# Custom Category Group Overrides — Implementation Plan

**Date:** 2026-04-15  
**Goal:** Allow users to create custom category groups (e.g. "LDPE-PCR") and assign individual Oracle items into them, so they appear alongside native Oracle groups with full aggregated data.

---

## Current State (What Already Works)

### Schema ✅
- **`mes_item_category_groups`** — has `is_custom BOOLEAN`, `display_name TEXT` columns (migration 041)  
- **`mes_item_group_overrides`** — stores item-to-custom-group assignments:  
  `(category_id, override_group_name, item_key, original_catlinedesc)` with UNIQUE on `(category_id, item_key)`

### CRUD Endpoints ✅
| Method | Route | Status |
|--------|-------|--------|
| POST | `/custom-categories/:id/custom-group` | ✅ Creates group row |
| GET | `/custom-categories/:id/custom-group/:groupId/items` | ✅ Lists assigned items |
| PUT | `/custom-categories/:id/custom-group/:groupId/items` | ✅ Bulk assign items |
| DELETE | `/custom-categories/:id/custom-group/:groupId` | ✅ Soft-delete + remove overrides |

### Frontend UI ✅
- Create Custom Group input + button inside Configure Category Groups modal
- Sidebar shows custom groups with orange dashed border + "Custom" tag
- Assign (➕) and Delete (🗑) buttons on custom group cards
- Assignment modal with checkbox table + save

---

## What's Broken / Missing

### BUG-1: Profile aggregation ignores overrides (Critical)

**File:** `items.js` → `GET /custom-categories/:id/profile`  
**Problem:** Profile queries aggregate from `fp_actualrmdata WHERE catlinedesc = ANY($catlinedescList)`. Custom groups like "LDPE-PCR" don't exist in Oracle data, so the aggregation returns zero rows — custom groups show as empty ghosts with "0 groups · 0 items".

**Impact:** The entire feature is non-functional at the data display level.

### BUG-2: Category-group detail fails for custom groups

**File:** `items.js` → `GET /custom-categories/:id/category-group/:catlinedesc/detail`  
**Problem:** The detail endpoint queries `fp_actualrmdata WHERE catlinedesc = $1`. For custom groups, this returns nothing. Click a custom group → detail shows zero items.

### BUG-3: Bulk group save destroys custom groups

**File:** `items.js` → `PUT /custom-categories/:id/groups`  
**Problem:** Line `UPDATE mes_item_category_groups SET is_active=false WHERE category_id=$1` deactivates ALL groups — including custom ones. Then it only re-inserts Oracle groups from the checkbox list. Custom groups and their override data become orphaned.

### BUG-4: Assignment modal shows item groups, not items

**File:** `CustomCategories.jsx` → `openAssignCustomGroup()`  
**Problem:** The modal loads `profile.data.groups[].item_groups` (item group level) but the override table stores `item_key` (individual item level). A user assigns "PE-P" (an item group) but the backend expects item codes like "BXXOTLDPE-P". The granularity is wrong.

### BUG-5: No original_catlinedesc tracking

**File:** `items.js` → PUT assign endpoint  
**Problem:** When inserting overrides, `original_catlinedesc` is always set to `null`. This means we lose track of which Oracle catlinedesc the item came from, which matters when items are "moved" between groups and need to be restorable.

### GAP-1: Available-groups endpoint excludes custom groups

**File:** `items.js` → `GET /custom-categories/:id/available-groups`  
**Problem:** Only queries `fp_actualrmdata` for Oracle groups. Custom groups (already created) don't appear in the Configure Category Groups modal since they're not in the available list.

---

## Implementation Plan

### Sprint 1 — Fix BUG-3: Protect custom groups during bulk save

**Risk:** High — data loss if user reconfigures groups  
**Effort:** Small (2 lines)

**Change** in `PUT /custom-categories/:id/groups`:
```sql
-- BEFORE (destroys custom groups):
UPDATE mes_item_category_groups SET is_active=false WHERE category_id=$1

-- AFTER (preserves custom groups):
UPDATE mes_item_category_groups SET is_active=false WHERE category_id=$1 AND is_custom = false
```

Also ensure the re-insert upsert sets `is_custom = false`:
```sql
INSERT INTO mes_item_category_groups (category_id, catlinedesc, is_active, is_custom)
VALUES ($1, $2, true, false)
ON CONFLICT (category_id, catlinedesc) DO UPDATE SET
  is_active = true,
  is_custom = CASE WHEN mes_item_category_groups.is_custom THEN true ELSE false END,
  updated_at = NOW()
```

### Sprint 2 — Fix BUG-4: Redesign assignment modal for item-level granularity

**Risk:** Medium — UX change  
**Effort:** Medium (backend + frontend)

#### 2a. New backend endpoint: List assignable items for a category

**Route:** `GET /custom-categories/:id/assignable-items`  
**Purpose:** Returns all individual items in the category (from all Oracle catlinedesc groups) that the user can assign to a custom group.

```sql
SELECT
  LOWER(TRIM(r.mainitem)) AS item_key,
  r.mainitem,
  r.maindescription,
  TRIM(r.catlinedesc) AS catlinedesc,
  TRIM(r.itemgroup) AS itemgroup,
  COALESCE(r.mainitemstock, 0) AS stock_qty,
  o.override_group_name AS current_override
FROM fp_actualrmdata r
LEFT JOIN mes_item_group_overrides o
  ON o.category_id = $1
  AND o.item_key = LOWER(TRIM(r.mainitem))
WHERE TRIM(r.catlinedesc) = ANY($2)   -- catlinedescList for this category
ORDER BY r.mainitem ASC
```

**Response shape:**
```json
{
  "data": [
    {
      "item_key": "bxxotldpe-p",
      "mainitem": "BXXOTLDPE-P",
      "maindescription": "LDPE - PE-P",
      "catlinedesc": "LDPE",
      "itemgroup": "rLDPE",
      "stock_qty": 12500,
      "current_override": null   // or "LDPE-PCR" if already assigned
    }
  ]
}
```

Optional: Add `?search=` query param with ILIKE on mainitem/maindescription for filtering.

#### 2b. Frontend: Replace item-group table with item-level table

In `openAssignCustomGroup()`:
- Call new `GET /assignable-items` endpoint instead of profile
- Show table columns: Assign (checkbox), Item Code, Description, Oracle Group (catlinedesc), Item Group, Stock Qty, Current Override
- Items already in a different custom group show a warning icon
- Pre-check items already assigned to this group

#### 2c. Fix BUG-5: Track original_catlinedesc

In `PUT /custom-categories/:id/custom-group/:groupId/items`:
- Accept `{ items: [{ item_key, original_catlinedesc }] }` instead of flat `item_keys` array
- Or better: have the backend look up each item's catlinedesc from `fp_actualrmdata`:

```sql
INSERT INTO mes_item_group_overrides (category_id, override_group_name, item_key, original_catlinedesc)
SELECT $1, $2, i.item_key, TRIM(r.catlinedesc)
FROM unnest($3::text[]) AS i(item_key)
LEFT JOIN fp_actualrmdata r ON LOWER(TRIM(r.mainitem)) = i.item_key
ON CONFLICT (category_id, item_key) DO UPDATE SET
  override_group_name = EXCLUDED.override_group_name,
  original_catlinedesc = EXCLUDED.original_catlinedesc,
  updated_at = NOW()
```

### Sprint 3 — Fix BUG-1: Profile aggregation with override support (Critical)

**Risk:** High — core data flow  
**Effort:** Large (query rewrite)

#### Approach: "Effective catlinedesc" CTE

For the profile endpoint, build an effective mapping that replaces `catlinedesc` for overridden items:

**Step 1:** After getting `selectedGroups`, separate Oracle vs. custom groups:

```javascript
const oracleGroups = selectedGroups.filter(g => !g.is_custom);
const customGroups = selectedGroups.filter(g => g.is_custom);
const oracleDescList = oracleGroups.map(g => g.catlinedesc);
const customGroupNames = customGroups.map(g => g.catlinedesc);
```

**Step 2:** Replace the `groupAgg` query with a CTE that merges Oracle + override data:

```sql
WITH effective_rm AS (
  -- Oracle items NOT overridden to a different group
  SELECT
    r.*,
    TRIM(r.catlinedesc) AS effective_group
  FROM fp_actualrmdata r
  WHERE TRIM(r.catlinedesc) = ANY($1)              -- oracleDescList
    AND LOWER(TRIM(r.mainitem)) NOT IN (
      SELECT item_key FROM mes_item_group_overrides WHERE category_id = $CAT_ID
    )

  UNION ALL

  -- Overridden items mapped to their custom group
  SELECT
    r.*,
    o.override_group_name AS effective_group
  FROM fp_actualrmdata r
  JOIN mes_item_group_overrides o
    ON o.item_key = LOWER(TRIM(r.mainitem))
    AND o.category_id = $CAT_ID
  WHERE o.override_group_name = ANY($2)             -- customGroupNames
)
SELECT
  effective_group AS catlinedesc,
  COUNT(DISTINCT LOWER(TRIM(mainitem)))::INT AS item_count,
  COUNT(DISTINCT LOWER(TRIM(itemgroup)))::INT AS item_group_count,
  COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock ELSE 0 END), 0) AS stock_qty,
  COALESCE(SUM(CASE WHEN mainitemstock > 0 THEN mainitemstock * maincost ELSE 0 END), 0) AS stock_val,
  COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty ELSE 0 END), 0) AS order_qty,
  COALESCE(SUM(CASE WHEN pendingorderqty > 0 THEN pendingorderqty * purchaseprice ELSE 0 END), 0) AS order_val
FROM effective_rm
WHERE $SEARCH_CONDITION
GROUP BY effective_group
ORDER BY LOWER(effective_group) ASC
```

**Step 3:** Same CTE pattern applies to `itemGroupAgg`, `marketRows`, and `filteredItemRows` queries.

**Step 4:** Merge `groupMeta` into each returned group object (already done).

**Alternative (simpler, 2-pass):** Instead of a CTE, run the standard Oracle-only query first, then run a second query just for custom group items via override table, and merge client-side in Node. Less elegant but lower risk of breaking the existing Oracle flow.

#### Recommended: 2-pass approach

```
Pass 1: Run existing Oracle queries unchanged (only for Oracle groups)
Pass 2: For each custom group:
   SELECT r.* FROM fp_actualrmdata r
   JOIN mes_item_group_overrides o ON ...
   WHERE o.override_group_name = $customGroupName
   → aggregate in JS exactly like Oracle groups
Merge into groups array
```

**Advantages:**
- Zero risk to existing Oracle group aggregation
- Easier to test independently
- Custom groups can be feature-flagged

### Sprint 4 — Fix BUG-2: Category-group detail for custom groups

**Risk:** Medium  
**Effort:** Medium

#### In `GET /custom-categories/:id/category-group/:catlinedesc/detail`:

Add a check at the top:
```javascript
const { rows: grpMeta } = await pool.query(
  'SELECT is_custom FROM mes_item_category_groups WHERE category_id=$1 AND catlinedesc=$2 AND is_active=true',
  [catId, catlinedesc]
);
const isCustom = grpMeta[0]?.is_custom || false;
```

Then branch the main item query:

```javascript
let rmItemsSql;
let rmParams;

if (isCustom) {
  // Custom group: fetch items via overrides
  rmItemsSql = `
    SELECT r.*, LOWER(TRIM(r.mainitem)) AS item_key
    FROM fp_actualrmdata r
    JOIN mes_item_group_overrides o
      ON o.item_key = LOWER(TRIM(r.mainitem))
      AND o.category_id = $1
      AND o.override_group_name = $2
    WHERE $SEARCH_CONDITION
    ORDER BY mainitem ASC
  `;
  rmParams = [catId, catlinedesc, searchLike];
} else {
  // Oracle group: existing query
  rmItemsSql = `... existing catlinedesc = $1 query ...`;
  rmParams = [catlinedesc, searchLike];
}
```

The rest of the detail endpoint (prices, TDS, market refs) stays the same — it works on the result rows regardless of source.

### Sprint 5 — Fix GAP-1: Available-groups shows custom groups

**Risk:** Low  
**Effort:** Small

In `GET /custom-categories/:id/available-groups`, after the main Oracle query, append custom groups:

```javascript
// Existing Oracle groups query...
const { rows: groups } = await pool.query(`...`);

// Also include custom groups that are already active
const { rows: customGroups } = await pool.query(`
  SELECT
    catlinedesc,
    (SELECT COUNT(DISTINCT item_key) FROM mes_item_group_overrides WHERE category_id = $1 AND override_group_name = catlinedesc) AS item_count,
    0::NUMERIC AS stock_qty,
    id AS group_id,
    true AS is_selected,
    true AS is_custom
  FROM mes_item_category_groups
  WHERE category_id = $1 AND is_custom = true AND is_active = true
`, [catId]);

res.json({ success: true, data: [...groups, ...customGroups] });
```

Frontend Configure modal: render custom groups distinctly (non-removable by checkbox, show as "Custom" tags).

### Sprint 6 — Frontend polish

**Effort:** Small

#### 6a. Configure modal: Show custom groups in a separate section
- Below the Oracle checkbox table, list custom groups with their assignment count
- Each shows a "Manage" button → opens the assignment modal
- "Delete" button with confirmation

#### 6b. Sidebar: Show override count
- For custom groups, show "X assigned items" instead of "X groups · Y items"
- Consider displaying the source Oracle groups: "from LDPE, HDPE"

#### 6c. Detail modal: Show override origin
- When viewing detail for a custom group, show each item's `original_catlinedesc` in a "Source" column
- This helps users understand where items came from

---

## Data Flow Diagram (End-to-End)

```
User creates "LDPE-PCR" custom group
  → POST /custom-group
  → INSERT into mes_item_category_groups (is_custom=true)

User assigns items (BXXOTLDPE-P, BXXOTLDPE-Q) to LDPE-PCR
  → PUT /custom-group/:id/items
  → DELETE + INSERT into mes_item_group_overrides

User loads category profile
  → GET /profile
  → Pass 1: Oracle groups → aggregate catlinedesc from fp_actualrmdata (exclude overridden items)
  → Pass 2: Custom groups → aggregate via override JOINs on fp_actualrmdata
  → Merge both into groups[] array with is_custom/group_id metadata
  → Frontend renders both Oracle + custom groups in sidebar

User clicks custom group in sidebar
  → GET /category-group/:catlinedesc/detail
  → Backend detects is_custom → queries via overrides
  → Returns item-level detail with prices, TDS, market refs
  → Frontend renders in fullscreen detail modal
```

---

## Edge Cases to Handle

| Case | Handling |
|------|----------|
| Item assigned to custom group is deleted from Oracle | Override stays; next profile load shows 0 stock / no match — acceptable |
| Same item in two custom groups | UNIQUE constraint prevents this — item can only be in 1 group |
| Custom group with same name as Oracle catlinedesc | CREATE endpoint already checks for name collisions |
| User removes Oracle group that has items overridden FROM it | Original items go to custom group; when custom group is deleted, items return to Oracle group via original_catlinedesc |
| Large category (1000+ items) in assignment modal | Add `?search=` filter + paginate (LIMIT/OFFSET or virtual scroll) |
| Oracle sync adds new catlinedesc values | No conflict — custom groups are separate with is_custom=true |

---

## Execution Order & Dependencies

```
Sprint 1 (Protect custom groups)       — Independent, quick fix, DO FIRST
Sprint 2 (Assignment modal redesign)   — Independent, backend + frontend
Sprint 3 (Profile aggregation)         — Core feature, depends on Sprint 1
Sprint 4 (Detail for custom groups)    — Depends on Sprint 3 pattern
Sprint 5 (Available-groups)            — Independent, small
Sprint 6 (Frontend polish)             — Last, depends on all above
```

**Recommended order:** 1 → 2 → 3 → 4 → 5 → 6

---

## Validation Checklist

After implementation, verify:

- [ ] Create custom group "LDPE-PCR" in Resins category → appears in sidebar with orange border
- [ ] Assign BXXOTLDPE-P to LDPE-PCR → assignment modal shows individual items, not item groups
- [ ] Refresh page → LDPE-PCR shows correct item count, stock qty, and prices
- [ ] Click LDPE-PCR in sidebar → right panel shows its item groups and items
- [ ] Click LDPE-PCR → fullscreen detail opens with assigned items + prices
- [ ] Original Oracle group (LDPE) no longer counts BXXOTLDPE-P in its total
- [ ] Reconfigure Oracle groups (uncheck/check) → custom groups survive unchanged
- [ ] Delete custom group → items return to original Oracle groups
- [ ] Assign same item to a different custom group → upsert replaces previous assignment
- [ ] Works for any category (Resins, Substrates, Adhesives, etc.)
- [ ] Backend syntax passes: `node --check server/routes/mes/master-data/items.js`
- [ ] Frontend builds: `npm run build`
