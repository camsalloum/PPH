# Admin / Settings — Full Audit & Fix Plan

> **Date:** February 20, 2026  
> **Scope:** Settings page, People & Access module, Employee/User management, Org Chart, Permissions, Authorization, CRM sync  

---

## Architecture Overview

### Two Admin Systems (Duplicate)

| System | Route | Components |
|--------|-------|------------|
| **Settings > Admin tab** | `/settings` | EmployeesManagement, UserPermissions, OrganizationSettings, AuthorizationRules, TerritoriesManagement |
| **People & Access Module** | `/people-access/*` | UnifiedUserEmployee, SalesTeamManager, EnhancedOrgChart, RolesPermissions, AuthorizationRulesManager, AuditLog |

### Role System

| Role | Who Has It | Access Level |
|------|-----------|--------------|
| `admin` | Camille | Full access — all tabs, all data, all endpoints |
| `manager` | All sales reps (Riad, Sofiane, Christopher, Sojy, Rahil, Narek) | Sales rep level — own customers only |
| `sales_manager` | (unused) | Full access (if assigned) |
| `sales_coordinator` | (unused) | Full access (if assigned) |
| `user` | Default fallback | Minimal — Periods + Appearance tabs only |

### Key Backend Files

| File | Purpose |
|------|---------|
| `server/services/employeeService.js` | Employee CRUD, org chart, designations, departments, branches |
| `server/services/userService.js` | User CRUD, role management, preferences |
| `server/services/authService.js` | Login, registration, JWT, password management |
| `server/services/permissionService.js` | Fine-grained permission catalog + per-user permissions |
| `server/routes/auth.js` | Auth endpoints + user CRUD + role CRUD |
| `server/routes/employees.js` | Employee endpoints + designation/department/branch CRUD |
| `server/routes/permissions.js` | Permission catalog + user permission management |
| `server/routes/authorization.js` | Approval workflow rules |

---

## BUGS FOUND

### Critical (Pages Broken)

#### B1 — Wrong `localStorage` Key in 2 Components
- **Files:** `src/components/settings/AuthorizationRules.jsx` (6 calls), `src/components/settings/TerritoriesManagement.jsx` (5 calls)
- **Bug:** Uses `localStorage.getItem('token')` instead of `'auth_token'`
- **Impact:** Every API call sends `Bearer undefined` → 401 errors. **Both tabs are completely non-functional.**

#### B2 — Authorization Rules Frontend/Backend Schema Mismatch
- **File:** `src/components/settings/AuthorizationRules.jsx`
- **Bug:** Frontend sends `{transaction, based_on, value, approving_role, approving_user, applicable_to_role}` but backend (`server/routes/authorization.js`) expects `{name, transactionType, basedOn, conditionOperator, conditionValue, approvingRoleId, approvingEmployeeId, ...}`
- **Impact:** Create/Update authorization rules silently fails — field names don't match.

#### B3 — `updateEmployee()` Missing Fields
- **File:** `server/services/employeeService.js`
- **Bug:** `updateEmployee()` does not persist: `group_members`, `user_id`, `company_email`, `cell_number`, `emergency_contact`, `current_address`
- **Compare:** `createEmployee()` does handle `group_members` and `user_id`
- **Impact:** Editing a group employee **loses their member list**. Contact tab edits are **silently discarded** on save.

---

### Logic / Permission Bugs

#### B4 — Employee Designation Change Doesn't Sync User Role
- **File:** `src/components/settings/EmployeesManagement.jsx` → `PUT /api/employees/:id`
- **Bug:** When you change an employee's designation (e.g., from "Sales Executive" to "Department Manager"), only the `employees.designation_id` column is updated. The linked `users.role` is NOT updated.
- **Note:** `userService.updateUser()` does have designation→role sync, but `employeeService.updateEmployee()` does not call it.
- **Impact:** Employee's job title and their system access permissions become desynchronized.

#### B5 — `designations.access_level` Column Missing from Migration + Service
- **Files:** `server/migrations/011_create_employee_hierarchy_tables.sql`, `server/services/employeeService.js`
- **Bug:** The `designations` table CREATE statement has no `access_level` column. The `createDesignation()` service method doesn't insert it. The `registerUser()` function queries `designations.access_level` but it's always NULL.
- **Fallback:** Code does `|| 'user'`, so all new users get role `'user'` regardless of their designation.
- **Impact:** The designation→role mapping is fundamentally broken unless the column was manually added to the DB.

#### B6 — No Hierarchy Level Validation
- **File:** `server/services/employeeService.js`
- **Bug:** Neither `createEmployee()` nor `updateEmployee()` validates that `reports_to` (manager) has a higher designation level than the employee.
- **Impact:** A CEO (level 8) can be set to report to a Sales Coordinator (level 2). Org chart becomes nonsensical.

#### B7 — `RolesPermissions.jsx` Uses Wrong API Paths
- **File:** `src/components/people/RolesPermissions.jsx`
- **Bug:** Fetches from `/api/roles`, `/api/permissions`, `/api/users` — actual routes are `/api/auth/roles`, `/api/permissions/catalog`, `/api/auth/users`
- **Impact:** People > Roles & Permissions tab fails to load any data.

---

### Architecture / Sync Issues

#### A1 — Duplicate Admin UI
- Settings > Admin tab and People & Access Module implement the same features with **different components**, different bugs, and different behavior.
- **Recommendation:** Keep Settings > Admin (it's more complete and uses correct auth). Deprecate or remove People & Access module.

#### A2 — CRM `sales_rep_groups` ↔ Employee Hierarchy Not Synchronized
- `sales_rep_groups` (FP database) and `employees.group_members` (auth database) are separate.
- The "Synchronize" button in EmployeesManagement does a one-time import; subsequent changes to sales_rep_groups never propagate.
- `updateEmployee()` doesn't even persist `group_members` (B3), so it can't be manually fixed either.

#### A3 — Employee Contact Fields Not Persisted
- Form sends `company_email`, `cell_number`, `emergency_contact`, `current_address` on the Contact tab.
- `updateEmployee()` only updates `personal_email` and `phone`.
- **Impact:** User fills out Contact tab, clicks Save, data is silently lost.

---

### UX Issues

#### U1 — Misleading Comment in App.jsx
- Line 135: `{/* Settings Route (Admin only) */}` but the route has no `requiredRole="admin"`.
- Route is intentionally open (non-admins see Periods + Appearance tabs), but the comment is wrong.

#### U2 — Admin Reset Password Returns Plaintext
- `POST /api/auth/admin-reset-password/:userId` returns `{ newPassword: "..." }` in the response body.
- Security concern — generated password should be shown once in the UI modal only.

#### U3 — No "Has User Account" Indicator on Employee List
- Employee table shows name, designation, department, status — but no indication of whether the employee has a linked system user account.
- Makes it hard to know who can log in.

#### U4 — Org Chart Accessible from Two Places
- Settings > Admin > Org Chart (uses EmployeesManagement's inline view)
- People > Org Chart (uses EnhancedOrgChart with level-based horizontal layout)
- Different implementations, potentially showing different data.

---

## FIX PLAN

### Phase 1 — Critical Fixes (Pages Broken)

| # | Task | Files | Effort |
|---|------|-------|--------|
| F1 | Fix `'token'` → `'auth_token'` in AuthorizationRules.jsx (6 places) + TerritoriesManagement.jsx (5 places) | 2 frontend files | Small |
| F2 | Fix AuthorizationRules.jsx to use correct backend field names (`transactionType`, `basedOn`, `conditionValue`, `approvingRoleId`, etc.) | 1 frontend file | Medium |
| F3 | Add missing fields to `updateEmployee()`: `group_members`, `user_id`, `company_email`, `cell_number`, `emergency_contact`, `current_address` | 1 backend file | Small |

### Phase 2 — Logic Fixes

| # | Task | Files | Effort |
|---|------|-------|--------|
| F4 | When employee designation changes, auto-update linked user's role (call userService from employeeService or add trigger) | employeeService.js | Medium |
| F5 | Add `access_level` column to designations: update migration, `createDesignation()`, `updateDesignation()`, and add to Designations form in OrganizationSettings.jsx | 1 migration + 1 service + 1 frontend | Medium |
| F6 | Add hierarchy level validation: `reports_to` employee must have `designation.level` > current employee's `designation.level` | employeeService.js | Small |
| F7 | Fix RolesPermissions.jsx API paths: `/api/roles` → `/api/auth/roles`, `/api/permissions` → `/api/permissions/catalog`, `/api/users` → `/api/auth/users` | 1 frontend file | Small |

### Phase 3 — Architecture Decisions

| # | Task | Files | Effort |
|---|------|-------|--------|
| F8 | Decide: keep Settings > Admin OR People module. Recommend keeping Settings, removing `/people-access` route | App.jsx, people/ folder | Decision + Medium |
| F9 | Add periodic sync (or live query) between `sales_rep_groups` ↔ `employees.group_members` | employeeService.js or CRM index.js | Large |

### Phase 4 — UX Polish

| # | Task | Files | Effort |
|---|------|-------|--------|
| F10 | Fix misleading comment in App.jsx (`Admin only` → `All users, admin tabs gated`) | App.jsx | Trivial |
| F11 | Stop returning plaintext password in admin-reset-password response | auth.js | Small |
| F12 | Add "Linked User" badge/column to employee list table | EmployeesManagement.jsx | Small |

---

## Data Model Reference

### Employee Fields (from `employees` table)

```
id, employee_code, user_id (FK→users), 
first_name, middle_name, last_name, full_name (generated),
gender, date_of_birth, date_of_joining, date_of_leaving,
personal_email, company_email, phone, cell_number,
photo_url, designation_id (FK→designations), department_id (FK→departments),
branch_id (FK→branches), employment_type, reports_to (FK→employees),
status, group_members (JSONB), emergency_contact, current_address
```

### Designation Levels (Org Chart Hierarchy)

| Level | Label | Color | Example |
|-------|-------|-------|---------|
| 8 | C-Level | Red | CEO |
| 7 | Executive | Orange | General Manager |
| 6 | Sr. Management | Blue | Department Manager |
| 5 | Mid Management | Green | Team Lead |
| 4 | Jr. Management | Purple | Senior Sales Executive |
| 3 | Sr. Professional | Teal | Sales Executive |
| 2 | Professional | Pink | Sales Coordinator, Sales Rep |
| 1 | Entry | Gray | (Junior roles) |

### Permission System

- **Permission catalog** in `permissions` table: `key`, `label`, `group_name`, `scope` (global/division)
- **User permissions** in `user_permissions`: `user_id`, `permission_key`, `division_code`, `allowed`, `granted_by`
- **Admin** users implicitly have all permissions
- **Audit trail** in `permission_audit_log`
- **Permission groups:** Navigation, Dashboard, Sales, Divisional, Periods, Export, AEBF, Maintenance, Settings, User Management
