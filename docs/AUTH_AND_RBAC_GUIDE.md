# YurCore Authentication & RBAC Guide

YurCore uses a Role-Based Access Control (RBAC) and Permission-Based Access Control (PBAC) mechanism to secure user actions.

---

## 1. Roles Definition

We define seven distinct user roles in `src/shared/security/roles.ts`:

1.  `SUPER_ADMIN`: Grants all permissions across the system.
2.  `ADMIN`: Standard administrator. Manages practitioners, patients, hospital locations, and system configuration.
3.  `DOCTOR` (Practitioner): Writes clinical entries, creates prescriptions, manages templates, and schedules.
4.  `PATIENT`: Views own records, books slots, orders formulations, and chats with the bot.
5.  `STAFF`: Receptionists/Interns who schedule appointments and update hospital registry states.
6.  `PHARMACY`: Views verified prescriptions to package and fulfill orders.
7.  `GUEST`: Public visitor profile with unauthenticated routes only.

---

## 2. Permission Mapping

Permissions are mapped in `src/shared/security/role-permissions.ts`. Key permission scopes include:

*   `appointments:read` / `appointments:create`
*   `records:read` / `records:create`
*   `prescription:read` / `prescription:create`
*   `consultation:pdf`
*   `ai-chat:use`
*   `admin:access`
*   `pro:access`

---

## 3. Server Authorization Checks

Always verify permissions inside backend controllers or services using the helpers defined in `src/shared/auth/`:

### A. Requiring Authenticated Sessions (`requireAuth`)
Authenticates the user's token. Throws a 401 exception if missing or expired.
```typescript
import { requireAuth } from "@/shared/auth/require-auth";

const authUser = await requireAuth(req);
console.log("Logged in user ID:", authUser.id);
```

### B. Checking Roles (`requireRole`)
Ensures the user possesses a specific role. Throws a 403 Forbidden exception if unauthorized.
```typescript
import { requireRole } from "@/shared/auth/require-role";
import { ROLES } from "@/shared/security/roles";

await requireRole(req, [ROLES.ADMIN, ROLES.SUPER_ADMIN]);
```

### C. Checking Permissions (`requirePermission`)
Checks the user's resolved permission list. Throws a 403 Forbidden exception if unauthorized.
```typescript
import { requirePermission } from "@/shared/auth/require-permission";
import { PERMISSIONS } from "@/shared/security/permissions";

await requirePermission(req, PERMISSIONS.CONSULTATION_PDF);
```

---

## 4. Frontend Guards (UX Only)

Frontend guards hide UI elements or block routes for user experience only. **Never rely on frontend guards for actual API security.**

*   `RoleGuard`: Wraps elements that require specific roles.
*   `PermissionGuard`: Wraps elements that require specific permissions.
*   `ProtectedRoute`: Directs unauthenticated browsers back to the login page.
