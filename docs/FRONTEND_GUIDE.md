# YurCore Frontend Development Guide

This guide describes how to build frontend modules inside YurCore, keeping them clean, robust, and separated from backend logic.

---

## 1. Feature Folder Structure

All frontend modules sit inside `src/features/{module}/`. For example, for the `appointments` feature:

```
src/features/appointments/
├── components/
│   └── AppointmentsPage.tsx       # Main page layout and UI sections
├── hooks/
│   └── useAppointments.ts         # Hook coordinates state, loaders, and triggers
├── services/
│   └── appointments-api.client.ts # HTTP API client using shared apiClient helper
├── types/
│   └── appointment.types.ts       # Domain interface/type declarations
└── validation/
    └── appointment-form.schema.ts # Zod validation schema for client forms
```

---

## 2. Page Routing Wrapper

Every routing page under `src/app/` must be a **thin wrapper** that loads the main feature page component.

Example (`src/app/(portal)/appointments/page.tsx`):
```typescript
import { AppointmentsPageComponent } from "@/features/appointments/components/AppointmentsPage";

export default function AppointmentsPage() {
  return <AppointmentsPageComponent />;
}
```

---

## 3. Creating a Frontend API Client

Use the shared `apiClient` utility from `@/shared/api/api-client` rather than raw `fetch`. It has built-in content-type mappings, error handling, and parses JSON responses automatically.

Example (`src/features/appointments/services/appointments-api.client.ts`):
```typescript
import { apiClient } from "@/shared/api/api-client";
import type { AppointmentRow } from "../types/appointment.types";

export class AppointmentsApiClient {
  static async getAppointments(): Promise<AppointmentRow[]> {
    const json = await apiClient<{ success: boolean; data: AppointmentRow[] }>("/api/appointments");
    return json.data;
  }

  static async cancelAppointment(appointmentId: string, reason: string): Promise<void> {
    await apiClient("/api/appointments", {
      method: "POST",
      body: JSON.stringify({ appointmentId, reason }),
    });
  }
}
```

---

## 4. Writing a Custom Feature Hook

Coordinate state inside hooks to prevent polluting the component file. Use the custom `useQuery` global helper or create specialized hook flows.

Example (`src/features/appointments/hooks/useAppointments.ts`):
```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import { AppointmentsApiClient } from "../services/appointments-api.client";
import type { AppointmentRow } from "../types/appointment.types";

export function useAppointments(patientId: string | undefined) {
  const [data, setData] = useState<AppointmentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    if (!patientId) {
      setData([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    AppointmentsApiClient.getAppointments()
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => {
        setError(err?.message ?? "Failed to fetch appointments");
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const cancelAppointment = useCallback(async (id: string, reason: string) => {
    await AppointmentsApiClient.cancelAppointment(id, reason);
    fetch(); // Refetch active list after action
  }, [fetch]);

  return { data, loading, error, refetch: fetch, cancelAppointment };
}
```

---

## 5. UI Page Implementation

Features UI components should reside entirely under `components/` inside the feature folder. Render states cleanly based on hook outputs:

```typescript
"use client";

import { useAuth } from "@/contexts/auth-context";
import { useAppointments } from "../hooks/useAppointments";

export function AppointmentsPageComponent() {
  const { user } = useAuth();
  const { data: appointments, loading, cancelAppointment } = useAppointments(user?.id);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {appointments?.map((appt) => (
        <div key={appt.id}>
          <p>{appt.doctor} - {appt.date}</p>
          <button onClick={() => cancelAppointment(appt.id, "User requested")}>Cancel</button>
        </div>
      ))}
    </div>
  );
}
```
