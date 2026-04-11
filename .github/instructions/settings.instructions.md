---
description: "Use when working on company settings, period configuration, appearance, email config, database backup, admin panels, or country/timezone management."
applyTo: ["src/components/settings/**", "server/routes/settings.js", "server/routes/countries.js", "server/routes/permissions.js", "server/routes/backup.js"]
---
# Settings Module Context

## Structure
- **15 frontend components** in `src/components/settings/`
- **Key component**: `Settings.jsx` — top-level tabbed container with: Company Info, Period Configuration, Master Data, Appearance, Outlook Email, Database Backup, Admin, Deploy to VPS

## Company Settings Model
- Table: `company_settings` in `ip_auth_database` (via `authPool`)
- Schema: `setting_key` (VARCHAR) + `setting_value` (JSONB) — key-value store
- Key settings: `company_name`, `company_logo`, `company_currency`, `company_country`, `company_timezone`
- API: `GET /api/settings/company` returns flat object, `POST /api/settings/company` upserts multiple keys

## Country/Timezone
- Countries table: `master_countries` in `ip_auth_database` — includes `timezone` column (IANA, e.g., `Asia/Dubai`)
- Aliases table: `country_aliases` (alias_name → country_id)
- API: `GET /api/countries/list` — returns countries with timezone
- Company timezone: IANA validated server-side (rejects invalid timezones with 400)
- Timezone formatting: `src/utils/companyTime.js` — `formatCompanyTime(value, timezone, withZone)`
- Searchable timezone input with datalist suggestions in Company Info form

## Tab Persistence (sessionStorage)
- `pph.settings.activeTab` — main settings tab
- `pph.settings.adminSubTab` — admin sub-tab (default: 'employees')
- `pph.masterData.activeTab` — master data sub-tab
- `pph.productGroup.activeTab` — product group sub-tab (with access-level fallback)

## Key Patterns
- Save operations refresh data in-place — no `window.location.reload()`
- Sync completion triggers targeted data refresh (fetchData, fetchStats, fetchLastSync) — no full-page reload
- Country selection auto-fills timezone from DB mapping
- Manual timezone override allowed (searchable text input with datalist)
