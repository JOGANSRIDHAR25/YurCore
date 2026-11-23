"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";
import type { DateOverride } from "@/shared/availability/schedule";

export type SlotView = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  mode: "video" | "clinic";
  fee: number;
  status: string;
};

export type ScheduleRow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  breaks: { start: string; end: string }[];
  opTimings: { start: string; end: string }[];
  clinicId: string | null;
  isActive: boolean;
};

export function usePractitionerAvailableDates(practitionerId: string | undefined) {
  return useQuery<string[]>(
    async () => {
      if (!practitionerId) return [];
      const response = await apiClient<{ data: string[] }>("/api/availability/dates", {
        params: { practitionerId },
      });
      return response.data;
    },
    [practitionerId]
  );
}

export function usePractitionerSlots(practitionerId: string | undefined, date: string) {
  return useQuery<SlotView[]>(
    async () => {
      if (!practitionerId || !date) return [];
      const response = await apiClient<{ data: SlotView[] }>("/api/availability/slots", {
        params: { practitionerId, date },
      });
      return response.data;
    },
    [practitionerId, date]
  );
}

export function usePractitionerSchedules(practitionerId: string | undefined) {
  return useQuery<ScheduleRow[]>(
    async () => {
      if (!practitionerId) return [];
      const response = await apiClient<{ data: ScheduleRow[] }>("/api/availability/schedule");
      return response.data;
    },
    [practitionerId]
  );
}

export function useBlockedDates(practitionerId: string | undefined) {
  return useQuery<{ id: string; date: string; reason: string }[]>(
    async () => {
      if (!practitionerId) return [];
      const response = await apiClient<{ data: { id: string; date: string; reason: string }[] }>("/api/availability/blocked-dates");
      return response.data;
    },
    [practitionerId]
  );
}

export type ScheduleInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  breaks?: { start: string; end: string }[];
  opTimings?: { start: string; end: string }[];
  isActive: boolean;
};

export async function updatePractitionerSchedule(_practitionerId: string, schedules: ScheduleInput[]): Promise<void> {
  await apiClient("/api/availability/schedule", {
    method: "PUT",
    body: JSON.stringify({ schedules }),
  });
}

export async function updatePractitionerSettings(
  _practitionerId: string,
  settings: { baseVideoFee: number; baseClinicFee: number; slotDurationMin: number; bufferMin: number }
): Promise<void> {
  await apiClient("/api/availability/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

// ── Per-date calendar overrides (holiday/leave/custom hours) ──────────────
export type CalendarAvailabilityRow = {
  date: string; // YYYY-MM-DD
  working_start: string;
  working_end: string;
  breaks: { start: string; end: string }[];
  op_timings: { start: string; end: string }[];
  slots: unknown[];
  is_holiday: boolean;
  is_leave: boolean;
};

export function useCalendarAvailability(
  practitionerId: string | undefined,
  startDate: string,
  endDate: string
) {
  return useQuery<CalendarAvailabilityRow[]>(
    async () => {
      if (!practitionerId) return [];
      const response = await apiClient<{
        success: boolean;
        data: CalendarAvailabilityRow[];
        }>("/api/availability/calendar", {
        method: "GET",
        params: {
        startDate,
        endDate,
        },
        });
        return response.data;
      },
      [practitionerId, startDate, endDate]
    );
  }

export async function updateCalendarAvailability(
  _practitionerId: string,
  updates: CalendarAvailabilityRow[]
): Promise<void> {
  await apiClient("/api/availability/calendar", {
    method: "PUT",
    body: JSON.stringify({ availabilityData: updates, updates }),
  });
}
// ── Availability state: setup gate + "Accepting bookings" switch ─────────
export type AvailabilityState = {
  acceptingBookings: boolean;
  configured: boolean;
  bookable: boolean;
  upcomingCount: number;
};

export type DoctorAppointment = {
  id: string;
  patientId: string | null;
  patientName: string;
  familyMemberName: string | null;
  date: string;
  time: string;
  durationMin: number;
  mode: string;
  status: string;
  reason: string | null;
};

export type ConflictingAppointment = DoctorAppointment & { conflictReason: string };

export type CancellationResult = { cancelled: number; emailed: number; failed: number };

export type WeeklyDay = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breaks: { start: string; end: string }[];
  opTimings: { start: string; end: string }[];
  isActive: boolean;
};

export type AvailabilityChange = {
  dates?: DateOverride[];
  clearDates?: string[];
  weekly?: WeeklyDay[];
};

export function useAvailabilityState(enabled: boolean) {
  return useQuery<AvailabilityState | null>(
    async () => {
      if (!enabled) return null;
      const response = await apiClient<{ data: AvailabilityState }>("/api/availability/state");
      return response.data;
    },
    [enabled]
  );
}

export async function setAcceptingBookings(input: {
  accepting: boolean;
  cancelUpcoming?: boolean;
  cancelReason?: string;
}): Promise<{ cancellation: CancellationResult }> {
  const response = await apiClient<{ data: { cancellation: CancellationResult } }>("/api/availability/state", {
    method: "PUT",
    body: JSON.stringify(input),
  });
  return response.data;
}

export function useWeeklySchedule(enabled: boolean) {
  return useQuery<WeeklyDay[]>(
    async () => {
      if (!enabled) return [];
      const response = await apiClient<{ data: WeeklyDay[] }>("/api/availability/weekly");
      return response.data;
    },
    [enabled]
  );
}

export function useDoctorAppointments(enabled: boolean, startDate: string, endDate: string) {
  return useQuery<DoctorAppointment[]>(
    async () => {
      if (!enabled) return [];
      const response = await apiClient<{ data: DoctorAppointment[] }>("/api/availability/appointments", {
        params: { startDate, endDate },
      });
      return response.data;
    },
    [enabled, startDate, endDate]
  );
}

export async function fetchUpcomingAppointments(): Promise<DoctorAppointment[]> {
  const start = new Date();
  const end = new Date();
  end.setDate(end.getDate() + 365);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const response = await apiClient<{ data: DoctorAppointment[] }>("/api/availability/appointments", {
    params: { startDate: iso(start), endDate: iso(end) },
  });
  return response.data;
}

export async function previewAvailabilityChange(change: AvailabilityChange): Promise<ConflictingAppointment[]> {
  const response = await apiClient<{ data: ConflictingAppointment[] }>("/api/availability/preview", {
    method: "POST",
    body: JSON.stringify({ change }),
  });
  return response.data;
}

export async function saveAvailabilityChange(input: {
  change: AvailabilityChange;
  cancelConflicts?: boolean;
  cancelReason?: string;
  actionLabel?: string;
}): Promise<{ cancellation: CancellationResult }> {
  const response = await apiClient<{ data: { cancellation: CancellationResult } }>("/api/availability/save", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}
