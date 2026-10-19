"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

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