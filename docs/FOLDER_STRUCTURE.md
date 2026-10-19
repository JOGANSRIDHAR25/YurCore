# YurCore Codebase Folder Structure

Welcome to the YurCore codebase! This guide is designed to help junior developers navigate our project architecture easily. 

We separate files strictly by responsibility to keep the system organized, secure, and maintainable.

---

## Workspace Root Overview

At the root level, you will find configuration files for TypeScript, Next.js, and Vitest, along with the `src/` folder:

```
src/
├── app/                          # Next.js App Router (Routing and API wrappers)
├── backend/                      # BackendMVC architecture layer
├── features/                     # Frontend feature modules
├── shared/                       # Shared server-side configs and security helpers
├── components/                   # Shared UI component primitives
├── hooks/                        # Shared global React hooks
├── contexts/                     # React Context providers (auth-context)
├── constants/                    # Application configuration variables
├── styles/                       # Global Tailwind CSS and typography stylings
└── test/                         # Testing setups and mocks
```

---

## Folder Meanings & Responsibilities

### 1. `src/app/`
*   **Purpose**: Next.js route entry files only.
*   **Contents**: `page.tsx` (routing endpoints) and API `route.ts` handlers.
*   **Rule**: **No heavy UI layout, business logic, or raw database queries go here.** Page files must only serve as thin entry wrappers that render feature components. API route files must be thin wrappers (max ~15 lines) that parse requests and delegate to backend controllers.

### 2. `src/features/`
*   **Purpose**: Frontend module code organized by domain.
*   **Contents**:
    *   `components/`: Page UI components and sub-sections.
    *   `hooks/`: Feature-specific React hooks (e.g. data fetching, pagination).
    *   `services/`: Frontend API clients calling backend API routes (using the shared `apiClient` helper).
    *   `types/`: Domain-specific TypeScript declarations.
    *   `validation/`: Client-side form Zod validation schemas.

### 3. `src/backend/`
*   **Purpose**: The Backend Layer (MVC architecture).
*   **Contents**:
    *   `controllers/`: Requests/responses handler. Reads input, checks validation schemas, enforces roles/permissions, calls services.
    *   `services/`: Core business logic, computations, and permission verification.
    *   `repositories/`: Database query layer. **Only this layer is permitted to execute select/insert/update/delete database queries.**
    *   `validation/`: Zod validation schemas for request bodies, query params, and route parameters.
    *   `dto/`: Data Transfer Objects for typing backend payloads.
    *   `types/`: Backend-only TypeScript models.
    *   `errors/`: Customized server error classes.
    *   `middleware/`: Server-side HTTP middleware (e.g., error catching).

### 4. `src/shared/`
*   **Purpose**: Shared utilities, security wrappers, and database clients.
*   **Contents**:
    *   `auth/`: Security authentication helpers (`requireAuth`, `requireRole`, `requirePermission`, `getAuthUser`).
    *   `security/`: Security protection protocols (CSRF validation, CORS origin verification, Rate limiting, Audit logs, HTTP response headers).
    *   `db/`: Centralized Supabase Server and Admin clients, and static DB type declarations.
    *   `api/`: Standardized apiSuccess and apiError response utilities.
    *   `config/`: Validated environment variables and static security limits.
    *   `utils/`: Logger instances and error wrappers.

### 5. `src/components/`
*   **Purpose**: Reusable UI components used across multiple modules.
*   **Contents**: Card components, Badges, Modals, Forms, Tables, and layout headers/sidebars.

### 6. `src/hooks/`
*   **Purpose**: Shared global React hooks (like `useQuery` for fetch requests).

### 7. `src/contexts/`
*   **Purpose**: React context providers (e.g. `auth-context.tsx` for managing client-side session states).

---

## Key Development Rules

1.  **Strict Client/Server Separation**: Server-side files must use `import "server-only";` at the top. Never import files from `src/backend` or `src/shared` (except client config) into client-side components.
2.  **No Direct DB Queries in UI**: Never write raw Supabase query scripts or select calls in UI pages. All queries must run through a Repository on the backend and be exposed via an API route.
3.  **Validate All Writing Endpoints**: Every POST, PATCH, PUT, and DELETE API route must validate the body using Zod schemas before performing database writes.
