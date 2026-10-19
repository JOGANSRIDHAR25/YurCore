# YurCore Backend Development Guide

This guide explains how to write structured, secure, and clean server-side code in YurCore using the MVC pattern.

---

## 1. Directory Structure

All backend layers are located in `src/backend/`:

```
src/backend/
├── controllers/    # Parses requests, runs validations, checks authorization
├── services/       # Implements core business logic & calculates values
├── repositories/   # Performs direct database select/insert/update queries
├── validation/     # Zod input schemas for validation checks
├── dto/            # Data Transfer Objects
├── types/          # Backend models
└── errors/         # Custom server error classes (e.g. ForbiddenError)
```

---

## 2. Controllers

Controllers are responsible for parsing Next.js request contexts, validating parameters, checking auth contexts, and returning standard JSON structures.

Example (`src/backend/controllers/appointment.controller.ts`):
```typescript
import { NextRequest } from "next/server";
import { AppointmentService } from "../services/appointment.service";
import { cancelAppointmentSchema } from "../validation/appointment.schema";
import { requireAuth } from "@/shared/auth/require-auth";
import { apiSuccess, apiError } from "@/shared/api/api-response";

export async function cancelAppointmentController(req: NextRequest) {
  // 1. Authenticate user context
  const auth = await requireAuth(req);

  // 2. Read and validate request body
  const body = await req.json();
  const parsed = cancelAppointmentSchema.safeParse(body);

  if (!parsed.success) {
    return apiError("Validation error", 400, "VALIDATION_FAILED", parsed.error.format());
  }

  // 3. Delegate to business service layer
  await AppointmentService.cancelAppointment(parsed.data.appointmentId, parsed.data.reason);

  return apiSuccess(null, "Appointment cancelled successfully");
}
```

---

## 3. Services

Services handle workflows, permission choices, data mapping, and coordinate updates across multiple repositories.

Example (`src/backend/services/appointment.service.ts`):
```typescript
import { AppointmentRepository } from "../repositories/appointment.repository";

export class AppointmentService {
  static async cancelAppointment(appointmentId: string, reason: string): Promise<void> {
    // Implement any relevant business checks here (e.g., cannot cancel within 2 hours of slot)
    
    // Call the database repository layer
    await AppointmentRepository.cancelAppointment(appointmentId, reason);
  }
}
```

---

## 4. Repositories

Repositories are the only files allowed to run Supabase database queries. They use server-side supabase connections.

Example (`src/backend/repositories/appointment.repository.ts`):
```typescript
import { createClient } from "@/shared/db/supabase.server";

export class AppointmentRepository {
  static async cancelAppointment(appointmentId: string, reason: string): Promise<void> {
    const supabase = await createClient();
    
    const { error } = await supabase
      .from("appointments")
      .update({
        status: "cancelled",
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
      })
      .eq("id", appointmentId);
      
    if (error) {
      console.error("Database query failed:", error);
      throw new Error("Failed to update appointment record in database");
    }
  }
}
```

---

## 5. Input Validation

Always validate inputs inside controllers before triggering services. Write schema definitions in `src/backend/validation/`.

Example (`src/backend/validation/appointment.schema.ts`):
```typescript
import { z } from "zod";

export const cancelAppointmentSchema = z.object({
  appointmentId: z.string().uuid("Invalid Appointment ID format"),
  reason: z.string().min(5, "Reason must be at least 5 characters long"),
});
```
