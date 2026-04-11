# User Management Module - Complete Implementation

**Implementation Date:** December 25, 2025  
**Status:** In Progress  
**Version:** 1.0.0

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Phase 1: Unify Users & Employees](#phase-1-unify-users--employees)
4. [Phase 2: Sales Rep Groups & Hierarchy](#phase-2-sales-rep-groups--hierarchy)
5. [Phase 3: Enhanced Org Chart with Roles](#phase-3-enhanced-org-chart-with-roles)
6. [Phase 4: Role-Based Access on All Pages](#phase-4-role-based-access-on-all-pages)
7. [Phase 5: Authorization Workflow Enforcement](#phase-5-authorization-workflow-enforcement)
8. [Phase 6: Unified Admin Dashboard](#phase-6-unified-admin-dashboard)
9. [Phase 7: Territory-Based Data Access](#phase-7-territory-based-data-access)
10. [Phase 8: Self-Service & Profiles](#phase-8-self-service--profiles)
11. [Database Schema](#database-schema)
12. [API Reference](#api-reference)
13. [Frontend Components](#frontend-components)

---

## Overview

This document describes the complete implementation of the unified User Management Module for ProPackHub. The module consolidates user authentication, employee profiles, organizational hierarchy, territories, and authorization into a cohesive system.

### Goals

- **Unified Identity**: Every system user has a linked employee profile
- **Role-Based Access Control (RBAC)**: Fine-grained permissions at page/action level
- **Hierarchical Structure**: Org chart reflects reporting lines and roles
- **Territory Management**: Geographic assignments for sales teams
- **Authorization Workflows**: Approval limits based on designation/role
- **Audit Trail**: Complete log of permission changes

### Design Principles (Based on ERPNext/Odoo)

1. **User = Login credentials + System role**
2. **Employee = Full profile + Job designation**
3. **1:1 Link**: Every user should have exactly one employee profile
4. **Separation of Concerns**: System roles (admin, manager) vs Job titles (CEO, Sales Executive)
5. **Division-aware**: All entities support multi-division access

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         USER MANAGEMENT MODULE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────────────┐          ┌──────────────────┐                   │
│   │      USERS       │◄────────►│    EMPLOYEES     │                   │
│   │  (Login/Auth)    │   1:1    │   (Profiles)     │                   │
│   │                  │   Link   │                  │                   │
│   │  • email         │          │  • first_name    │                   │
│   │  • password_hash │          │  • last_name     │                   │
│   │  • role          │          │  • designation   │                   │
│   │  • is_active     │          │  • department    │                   │
│   └────────┬─────────┘          │  • reports_to    │                   │
│            │                    │  • photo_url     │                   │
│            │                    └────────┬─────────┘                   │
│            │                             │                             │
│            │ has                         │ has                         │
│            ▼                             ▼                             │
│   ┌──────────────────┐          ┌──────────────────┐                   │
│   │      ROLES       │          │   DESIGNATIONS   │                   │
│   │  (System Access) │          │   (Job Titles)   │                   │
│   │                  │          │                  │                   │
│   │  • admin         │          │  • CEO           │                   │
│   │  • sales_manager │          │  • Sales Manager │                   │
│   │  • sales_rep     │          │  • Sales Rep     │                   │
│   │  • viewer        │          │  • Accountant    │                   │
│   └────────┬─────────┘          └────────┬─────────┘                   │
│            │                             │                             │
│            │ grants                      │ determines                  │
│            ▼                             ▼                             │
│   ┌──────────────────┐          ┌──────────────────┐                   │
│   │   PERMISSIONS    │          │  AUTHORIZATION   │                   │
│   │  (Action-level)  │          │     RULES        │                   │
│   │                  │          │                  │                   │
│   │  • view_dashboard│          │  • Approve order │                   │
│   │  • edit_budget   │          │    if > $10000   │                   │
│   │  • delete_data   │          │  • Discount max  │                   │
│   └──────────────────┘          │    15% for SR    │                   │
│                                 └──────────────────┘                   │
│                                                                         │
│   ┌──────────────────┐          ┌──────────────────┐                   │
│   │   TERRITORIES    │◄────────►│  SALES PERSONS   │                   │
│   │   (Geography)    │  N:M     │  (Sales Team)    │                   │
│   │                  │          │                  │                   │
│   │  • Region        │          │  • hierarchy     │                   │
│   │  • Country       │          │  • commission    │                   │
│   │  • City          │          │  • targets       │                   │
│   └──────────────────┘          └──────────────────┘                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Unify Users & Employees

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Ensure every User (login account) has a linked Employee profile, creating a unified identity system.

### Database Changes

```sql
-- Migration: 012_unify_users_employees.sql

-- 1. Add unique constraint to prevent multiple employees per user
ALTER TABLE employees 
ADD CONSTRAINT IF NOT EXISTS unique_user_id UNIQUE (user_id);

-- 2. Add linkage status tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INT REFERENCES employees(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS requires_employee_profile BOOLEAN DEFAULT TRUE;

-- 3. Audit log for user-employee linkage
CREATE TABLE IF NOT EXISTS user_employee_link_log (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  employee_id INT REFERENCES employees(id),
  action VARCHAR(50), -- 'linked', 'unlinked', 'auto_created'
  performed_by INT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/users/:id/employee` | Get linked employee for user |
| POST | `/api/users/:id/link-employee` | Link user to existing employee |
| POST | `/api/users/:id/create-employee` | Auto-create employee from user |
| GET | `/api/employees/unlinked` | Get employees without user accounts |
| GET | `/api/users/unlinked` | Get users without employee profiles |

### Frontend Changes

- Added linkage status indicator in User Management
- "Create Employee Profile" button for unlinked users
- "Link to User" dropdown in Employee form
- Warning banner showing unlinked counts

---

## Phase 2: Sales Rep Groups & Hierarchy

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Implement full sales team structure with hierarchy, territories, and commissions per division.

### Database Changes

```sql
-- Sales person hierarchy per division
-- Uses existing sales_persons table with enhancements

ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id);
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE sales_persons ADD COLUMN IF NOT EXISTS is_group BOOLEAN DEFAULT FALSE;

-- Sales person territory assignments
CREATE TABLE IF NOT EXISTS sales_person_territories (
  id SERIAL PRIMARY KEY,
  sales_person_id INT NOT NULL REFERENCES sales_persons(id) ON DELETE CASCADE,
  territory_id INT NOT NULL REFERENCES territories(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(sales_person_id, territory_id)
);
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sales-persons` | List all sales persons (filterable) |
| POST | `/api/sales-persons` | Create sales person |
| GET | `/api/sales-persons/:id` | Get sales person details |
| PUT | `/api/sales-persons/:id` | Update sales person |
| DELETE | `/api/sales-persons/:id` | Delete sales person |
| GET | `/api/sales-persons/hierarchy` | Get sales team tree |
| POST | `/api/sales-persons/:id/territories` | Assign territories |

---

## Phase 3: Enhanced Org Chart with Roles

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Visual org chart showing roles, permissions, and territories for each employee.

### Features

- Role badges on org chart nodes (color-coded)
- Click to view employee details panel
- Filter by division, department, role
- Expand/collapse branches
- Export as PNG/PDF
- Zoom controls

### Component: `OrganizationChart.js` (Enhanced)

```jsx
// Key additions:
// - getRoleBadgeColor(role) - Returns color based on role
// - EmployeeDetailPanel - Slide-out panel with full details
// - FilterBar - Division/Department/Role filters
// - ExportButton - PNG/PDF export
```

---

## Phase 4: Role-Based Access on All Pages

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Enforce permissions across the entire application, both frontend and backend.

### Backend Middleware

```javascript
// middleware/requirePermission.js
const requirePermission = (permissionKey, options = {}) => {
  return async (req, res, next) => {
    // Check if user has permission (global or division-specific)
    // Returns 403 if not authorized
  };
};
```

### Frontend Component

```jsx
// components/common/PermissionGate.js
<PermissionGate permission="budget:edit" division="FP" fallback={<AccessDenied />}>
  <BudgetEditor />
</PermissionGate>
```

### Permission Mapping

| Page/Feature | Required Permission |
|--------------|---------------------|
| Dashboard | `dashboard:view` |
| Budget View | `budget:view` |
| Budget Edit | `budget:edit` |
| Actuals Upload | `actuals:upload` |
| Settings | `settings:view` |
| User Management | `users:manage` |

---

## Phase 5: Authorization Workflow Enforcement

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Enforce approval workflows for transactions exceeding limits.

### Workflow

1. User submits transaction (e.g., discount > 15%)
2. System checks authorization rules
3. If rule matched → Create approval request
4. Notify approver(s)
5. Approver approves/rejects
6. Transaction proceeds or is blocked

### Database Tables

- `authorization_rules` - Rule definitions
- `approval_requests` - Pending approvals
- `approval_history` - Completed approvals

---

## Phase 6: Unified Admin Dashboard

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Single "People & Access" module for all user management.

### New Menu Structure

```
Settings (General)
  ├── Company
  ├── Periods
  ├── Master Data
  └── Appearance

People & Access (New Module - Admin Only)
  ├── Users & Employees (Unified view)
  ├── Sales Teams
  ├── Organization Chart
  ├── Territories
  ├── Roles & Permissions
  ├── Authorization Rules
  └── Audit Log
```

---

## Phase 7: Territory-Based Data Access

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Filter data visibility based on assigned territories.

### Implementation

- Sales reps see only their territory data
- Managers see aggregate of team territories
- Admins see all data
- Territory filter applied at database query level

---

## Phase 8: Self-Service & Profiles

**Status:** ✅ Implemented  
**Date:** December 25, 2025

### Objective

Allow users to manage their own profile.

### Features

- View/edit personal info (name, phone, photo)
- View assigned territories (read-only)
- View permissions (read-only)
- View position in org chart
- Change password

---

## Database Schema

### Complete ERD

See: [Database Schema Diagram](./USER_MANAGEMENT_ERD.md)

### Key Tables

| Table | Purpose |
|-------|---------|
| `users` | Authentication/login |
| `employees` | Full employee profiles |
| `designations` | Job titles |
| `roles` | System roles |
| `permissions` | Permission definitions |
| `user_permissions` | Granted permissions per user |
| `territories` | Geographic hierarchy |
| `sales_persons` | Sales team hierarchy |
| `authorization_rules` | Approval rules |
| `approval_requests` | Pending approvals |

---

## API Reference

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/register` - Create user (admin)
- `GET /api/auth/me` - Current user info

### Users

- `GET /api/users` - List users
- `GET /api/users/:id` - Get user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Employees

- `GET /api/employees` - List employees
- `POST /api/employees` - Create employee
- `GET /api/employees/:id` - Get employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee
- `GET /api/employees/org-chart` - Get org chart data

### Permissions

- `GET /api/permissions/catalog` - All available permissions
- `GET /api/permissions/user/:id` - User's permissions
- `PUT /api/permissions/user/:id` - Update user permissions

### Territories

- `GET /api/territories` - List territories
- `POST /api/territories` - Create territory
- `GET /api/territories/tree` - Territory hierarchy

### Authorization

- `GET /api/authorization/rules` - List rules
- `POST /api/authorization/rules` - Create rule
- `GET /api/authorization/pending` - Pending approvals
- `POST /api/authorization/approve/:id` - Approve request
- `POST /api/authorization/reject/:id` - Reject request

---

## Frontend Components

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `PeopleAccessModule` | `src/components/people/` | Main module wrapper |
| `UnifiedUserEmployee` | `src/components/people/` | Combined user+employee view |
| `SalesTeamManager` | `src/components/people/` | Sales hierarchy management |
| `PermissionGate` | `src/components/common/` | Permission-based rendering |
| `ApprovalWorkflow` | `src/components/people/` | Approval request handling |
| `AuditLog` | `src/components/people/` | Permission change history |
| `MyProfile` | `src/components/people/` | Self-service profile |

---

## Migration Guide

### Running Migrations

```bash
# Run the new migration
node server/scripts/run-migration.js 012_unify_users_employees.sql
```

### Linking Existing Data

```bash
# Auto-link users to employees by email
node server/scripts/link-users-employees.js
```

---

## Testing

```bash
# Run user management tests
npm test -- --grep "User Management"
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-25 | Initial implementation of all 8 phases |

