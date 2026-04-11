# Session End Template

## SESSION_LOG.md Entry Format

```
| YYYY-MM-DD | Agent Name | Brief summary of what was done (use semicolons to separate multiple items) | file1.jsx, file2.js, file3.sql (new) | TD-NNN: brief description OR None |
```

## Example

```
| 2026-03-28 | GitHub Copilot | Company timezone implementation: added timezone column to master_countries, extended company settings API, added country/timezone UI controls, formatted sync timestamps in company timezone; tab persistence for settings/master-data pages; removed forced reloads after sync | server/migrations/add-country-timezone-to-master-countries.js (new), server/routes/settings.js, server/routes/countries.js, src/components/settings/Settings.jsx, src/components/dashboard/RawMaterials.jsx, src/components/MasterData/AEBF/ActualTab.jsx, src/utils/companyTime.js (new), src/components/settings/MasterDataSettings.jsx, src/components/dashboard/ProductGroupMasterData.jsx | None |
```

## Rules

1. **One row only** — no matter how much was done. Use semicolons to separate tasks within the summary cell.
2. **Files**: Only list files that were meaningfully changed (created or edited). Mark new files with `(new)`.
3. **Tech Debt**: Reference existing TD-NNN IDs if they were discovered. Use "None" if clean.
4. **Agent Name**: Use the agent's actual name (e.g., "GitHub Copilot", "Claude", "Cursor").
5. **Be specific**: "Fixed login bug" is bad. "Fixed JWT refresh race condition in AuthContext.jsx" is good.

## LIVE_STATE.md Update Checklist

- [ ] Update "Last Updated" date
- [ ] Update module table rows that changed (Last Touched + Notes)
- [ ] Move current "In progress" to "Last completed"
- [ ] Update "Recent Sessions" (add new, keep only 3)
- [ ] Add/remove hot tech debt items if changed
