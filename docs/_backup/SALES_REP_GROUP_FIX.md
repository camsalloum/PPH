# Sales Rep Group Duplication Issue - Analysis & Fix

## Problem Description

When renaming a sales rep group (e.g., from "Sojy & Hisham & direct sales" to "Sojy & direct sales"), both the old and new group names appear in the Sales Dashboard, causing incorrect data filtering.

## Root Cause

The bug was in `server/routes/database.js` in the POST `/sales-rep-groups-universal` endpoint:

### Original Buggy Code:
```javascript
// If renaming, update the group name
if (originalGroupName && originalGroupName !== groupName) {
  await client.query(
    'UPDATE sales_rep_groups SET group_name = $1, updated_at = NOW() WHERE group_name = $2 AND division = $3',
    [groupName, originalGroupName, divKey]
  );
}

// Upsert the group (THIS COULD CREATE A DUPLICATE!)
const groupResult = await client.query(`
  INSERT INTO sales_rep_groups (group_name, division)
  VALUES ($1, $2)
  ON CONFLICT (group_name, division) DO UPDATE SET updated_at = NOW()
  RETURNING id
`, [groupName, divKey]);
```

### The Issue:
1. The UPDATE statement tries to rename the group
2. Then the INSERT ... ON CONFLICT tries to upsert with the new name
3. If the UPDATE fails or if there's already a group with the new name, you end up with BOTH groups
4. The unique constraint is on `(group_name, division)`, so if the UPDATE didn't work, the INSERT creates a new group

## The Fix

### Code Changes in `server/routes/database.js`:

```javascript
let groupId;

// If renaming, delete the old group and create new one
if (originalGroupName && originalGroupName !== groupName) {
  // Get the old group ID first
  const oldGroupResult = await client.query(
    'SELECT id FROM sales_rep_groups WHERE group_name = $1 AND division = $2',
    [originalGroupName, divKey]
  );
  
  if (oldGroupResult.rows.length > 0) {
    groupId = oldGroupResult.rows[0].id;
    
    // Update the group name using the ID (more reliable)
    await client.query(
      'UPDATE sales_rep_groups SET group_name = $1, updated_at = NOW() WHERE id = $2',
      [groupName, groupId]
    );
    logger.info('Renamed sales rep group', { division: divKey, from: originalGroupName, to: groupName, groupId });
  } else {
    // Old group doesn't exist, create new one
    const newGroupResult = await client.query(`
      INSERT INTO sales_rep_groups (group_name, division)
      VALUES ($1, $2)
      RETURNING id
    `, [groupName, divKey]);
    groupId = newGroupResult.rows[0].id;
  }
} else {
  // Not renaming, just upsert the group
  const groupResult = await client.query(`
    INSERT INTO sales_rep_groups (group_name, division)
    VALUES ($1, $2)
    ON CONFLICT (group_name, division) DO UPDATE SET updated_at = NOW()
    RETURNING id
  `, [groupName, divKey]);
  groupId = groupResult.rows[0].id;
}
```

### Key Improvements:
1. **Use ID instead of name** for UPDATE - more reliable
2. **Get the group ID first** before updating
3. **Separate logic** for rename vs create/update
4. **No duplicate INSERT** after rename

## Cleanup Script

Created `scripts/fix-duplicate-sales-rep-groups.js` to:
1. Find all duplicate groups (case-insensitive comparison)
2. Merge members from all duplicates into the oldest group
3. Update all references in `fp_actualcommon`, `fp_customer_unified`, and `fp_budget_customer_unified`
4. Delete the duplicate groups

### To Run the Cleanup:
```bash
node scripts/fix-duplicate-sales-rep-groups.js
```

## Database Schema

The `sales_rep_groups` table has:
- **Unique constraint**: `(group_name, division)` - prevents exact duplicates
- **But**: Case-sensitive, so "Sojy & Hisham" and "sojy & hisham" would be different

The issue wasn't the constraint, but the logic that created a new group instead of properly renaming the existing one.

## Testing

After applying the fix:
1. Go to Master Data > Sales Rep Management > Groups
2. Edit a group and change its name
3. Save
4. Verify only ONE group exists with the new name
5. Check Sales Dashboard - should show only the new group name
6. Verify data filtering works correctly

## Prevention

The fix ensures:
- Renames use the group ID, not the name (more reliable)
- No duplicate INSERT after a rename
- Proper transaction handling with BEGIN/COMMIT
- Better logging with group IDs for debugging
