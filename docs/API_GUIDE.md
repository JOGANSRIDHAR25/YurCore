# YurCore API Development Guide

This guide details how to construct Next.js API Routes, wrap exceptions safely, and handle request structures.

---

## 1. Directory Structure

API routes must reside under `src/app/api/` and must only consist of a single `route.ts` file containing request handlers:

```
src/app/api/
├── appointments/
│   └── route.ts         # Handles GET /api/appointments and POST /api/appointments
├── auth/
│   ├── login/
│   │   └── route.ts     # Handles POST /api/auth/login
│   └── logout/
│       └── route.ts     # Handles POST /api/auth/logout
└── consultations/
    └── [id]/
        └── pdf/
            └── route.tsx # Handles PDF streaming downloads
```

---

## 2. API Routes Must Be Thin Wrappers

Never place database queries, Zod schema definitions, or heavy business logic directly inside `route.ts` files. They must delegate directly to Controllers.

Example (`src/app/api/appointments/route.ts`):
```typescript
import { NextRequest } from "next/server";
import { getAppointmentsController, cancelAppointmentController } from "@/backend/controllers/appointment.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

// Handle GET requests (Delegates to Controller with global error wrapper)
export const GET = withErrorHandler(async (req: NextRequest) => {
  return getAppointmentsController(req);
});

// Handle POST requests
export const POST = withErrorHandler(async (req: NextRequest) => {
  return cancelAppointmentController(req);
});
```

---

## 3. Response Formats

All API responses must follow a consistent JSON envelope defined by `ApiResponse<T>` in `src/shared/api/api-response.ts`.

### Success Response (HTTP 200/201)
```json
{
  "success": true,
  "message": "Action completed successfully",
  "data": {
    "records": []
  }
}
```

### Error Response (HTTP 4xx/5xx)
```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "VALIDATION_FAILED",
    "details": {
      "reason": "Invalid email format"
    }
  }
}
```

---

## 4. Safe Error Handling

API routes are wrapped in `withErrorHandler` from `@/backend/middleware/error.middleware`. This middleware automatically catches server exceptions and returns standard JSON error responses.

*   If an exception is a custom structured error class (like `ForbiddenError`), it formats the appropriate HTTP status code.
*   If an exception is a generic database crash or coding error, it logs the stack trace internally and returns a safe `500 Internal Server Error` message, protecting internal systems from data leaks.
