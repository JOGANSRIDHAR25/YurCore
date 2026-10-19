# YurCore System Architecture

YurCore is a multi-role digital health platform designed around a clean separation of concerns. This guide details how data, requests, and security boundaries interact across the frontend, backend, and database layers.

---

## High-Level Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (Browser)                            │
│                                                                        │
│  UI Page (app/) ──→ Feature Component ──→ Feature Hook ──→ Client API │
└──────────────────────────────────────────────────────────────┬─────────┘
                                                               │ Fetch (HTTP JSON)
                                                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Server)                             │
│                                                                        │
│  Next.js API Route ──→ Controller ──→ Service ──→ Repository           │
└──────────────────────────────────────────────────────────────┬─────────┘
                                                               │ Supabase Node SDK
                                                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          DATABASE (Supabase)                           │
│                                                                        │
│  PostgreSQL Schema & Tables ──→ Row-Level Security (RLS)               │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Core Layers & Responsibilities

### 1. The Presentation Layer (Frontend)
*   **Routing (`src/app/`)**: Maps URLs to page views. Page files are thin imports of feature components.
*   **Feature UI (`src/features/*/components/`)**: Renders layout, buttons, and form inputs. Reads data from feature hooks.
*   **Feature Hooks (`src/features/*/hooks/`)**: Wraps component state and handles fetch triggers, exposing loading, error, and refetch parameters.
*   **Frontend API Clients (`src/features/*/services/`)**: Makes fetch calls to local API endpoints using the shared `apiClient` helper.

### 2. The API & Business Layer (Backend)
*   **Next.js API Route (`src/app/api/`)**: Serves as thin wrappers delegating request context to Controllers.
*   **Backend Controllers (`src/backend/controllers/`)**: Reads incoming request queries, parameters, and bodies, validates them against Zod schemas, checks authorization roles, and formats JSON responses using standard success/error helpers.
*   **Backend Services (`src/backend/services/`)**: Implements workflows, decides access permissions, runs core calculations, and coordinates database repositories.
*   **Backend Repositories (`src/backend/repositories/`)**: Interfaces with the database. **This is the only layer allowed to run raw select, insert, update, or delete operations.**

### 3. The Data Layer (Database)
*   **Supabase PostgreSQL**: Stores tables, views, and indexes.
*   **Row-Level Security (RLS)**: Enforces table access rules directly on the database level, ensuring that even if backend checks fail, database constraints prevent cross-tenant data leaks.

---

## Standard Request-Response Flow

For every module action, requests trace this exact linear flow:

1.  **User Event**: User clicks a button in `AppointmentsPage.tsx`.
2.  **Hook Action**: The component calls `cancelAppointment()` from `useAppointments` hook.
3.  **Client Fetch**: The hook triggers the `AppointmentsApiClient.cancelAppointment()` service method.
4.  **HTTP Request**: A POST request is sent to `/api/appointments` with body `{ appointmentId, reason }`.
5.  **API Routing**: Next.js route wrapper receives the request and delegates to `cancelAppointmentController(req)`.
6.  **Validation & Security**: The controller runs Zod schema validations on the body, runs CORS origin/CSRF checks, and verifies session tokens via `requireAuth(req)`.
7.  **Business logic**: The controller calls `AppointmentService.cancelAppointment(appointmentId, reason)`.
8.  **Database Query**: The service calls `AppointmentRepository.cancelAppointment(appointmentId, reason)`, which gets the Supabase client and updates the record.
9.  **Response Return**: The repository completes, the service returns, and the controller wraps the success status in `apiSuccess()` to return a clean JSON payload.
10. **UI State Sync**: The client fetch completes, the hook triggers a `refetch()` to refresh UI lists, and the state updates.
