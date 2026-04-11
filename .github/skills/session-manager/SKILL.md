---
name: session-manager
description: "Manage agent session lifecycle: start briefing or end-of-session logging. Use when starting a new coding session to get project context, or when ending a session to update LIVE_STATE.md and SESSION_LOG.md. Invoke with /session-manager."
---
# Session Manager

Handles session start briefing and session end documentation for ProPackHub / PEBI.

## When to Use
- **Session start**: Get a quick briefing on current project state before coding
- **Session end**: Update live state, session log, and flag tech debt before closing

## Session Start Procedure

1. Read `docs/LIVE_STATE.md` — current module status, active work, hot tech debt, recent sessions
2. Summarize in 5 lines:
   - Line 1: What modules are active/stable
   - Line 2: What was last worked on (from LIVE_STATE "Last completed")
   - Line 3: Any blocked items
   - Line 4: Hot tech debt to watch (from LIVE_STATE)
   - Line 5: Ask user what they want to work on today
3. Check staleness: if LIVE_STATE "Last Updated" is more than 2 sessions behind SESSION_LOG, warn the user

## Session End Procedure

When the user is done coding, perform these steps:

### Step 1: Update `docs/LIVE_STATE.md`

Update these sections:
- **Last Updated** date → today
- **Module Status** table → update `Last Touched` and `Notes` for any module changed
- **Active Work** → move current work to "Last completed", clear or update "In progress"
- **Recent Sessions** → add today's row at top, remove oldest if more than 3
- **Hot Tech Debt** → add any new critical/high items, remove resolved ones

### Step 2: Append to `docs/SESSION_LOG.md`

Add one row to the log table using this format:

```
| DATE | AGENT | TASK SUMMARY | KEY FILES CHANGED | NEW TECH DEBT |
```

Use the [session end template](./references/session-end-template.md) for the exact format.

Rules:
- Keep to ONE row (single table cell per column, use commas for file lists)
- Task summary should be actionable (what was done, not what was attempted)
- List only files that were meaningfully changed (not just read)
- Tech debt column: "None" if no new issues, or TD-NNN references

### Step 3: Update `docs/TECH_DEBT.md` (if needed)

If any new technical debt was introduced or discovered:
1. Assign next available TD-NNN ID
2. Add to appropriate severity section (CRITICAL / HIGH / LOW)
3. Include file(s) affected and fix description

### Step 4: Update `docs/API_CONTRACTS.md` (if needed)

If any API endpoints were added, changed, or removed:
1. Add/update the endpoint entry in the relevant module section
2. Include method, path, request body, response format

## Staleness Detection

If `docs/LIVE_STATE.md` "Last Updated" date is more than 3 days older than today:
- ⚠️ Warn the user: "LIVE_STATE.md appears stale (last updated DATE). Consider running session-manager end to refresh it."
- Cross-reference `docs/SESSION_LOG.md` last entry date to confirm gap
