---
description: "Auto-loaded for every file. Points the agent to the canonical project map and the manual memory-update rule."
applyTo: ["**"]
---
# Project Map — Read-First Rule

**At session start:**
- Read `docs/PROJECT_MAP.md` BEFORE doing anything else. It is the canonical A→Z map of the system: architecture, MES, PDF parser, Material Specs, Item Master & Costing flow, full code-quality audit, and the **Live Issues Board (§13)**.
- Then read `docs/PROJECT_CONTEXT.md`, last 5 entries of `docs/SESSION_LOG.md`, `docs/TECH_DEBT.md`.

**During the session:**
- Do NOT auto-update `docs/PROJECT_MAP.md`, `SESSION_LOG.md`, or memory files after every change. The owner explicitly opted out of auto-updates.

**Memory updates are MANUAL.** Only when the owner says **"update memory"** (or "update the project map", "update session log") do this:
1. Append one row to `docs/SESSION_LOG.md` (date | agent | what | files | new tech debt).
2. Surgically edit affected sections of `docs/PROJECT_MAP.md` — especially §13 Live Issues Board.
3. Update `docs/TECH_DEBT.md` if a shortcut was taken or new issue surfaced.
4. Update `docs/API_CONTRACTS.md` if any endpoint changed.
5. Update `/memories/repo/project-map-*.md` if top-line facts changed.
6. State: "Memory updated. [N] files changed."

**Hard rules echoed for safety** (full list in `AGENT.md`):
- Use `server/database/config.js` — never `server/config/database.js`.
- Use `server/utils/logger.js` (Winston) — never `console.*`.
- Parameterise SQL; whitelist division codes.
- Never hardcode `http://localhost:3001` — use `src/config/api.js`.
- localStorage key is `auth_token`, never `token`.
