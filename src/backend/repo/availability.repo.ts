import "server-only";

import { createClient } from "@/shared/db/supabase.server";

export type TimeRange = {
  start: string;
  end: string;
};

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
  breaks: TimeRange[];
  opTimings: TimeRange[];
  clinicId: string | null;
  isActive: boolean;
};

export type ScheduleInput = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  breaks?: TimeRange[];
  opTimings?: TimeRange[];
  isActive: boolean;
};

export type PractitionerSettingsInput = {
  baseVideoFee: number;
  baseClinicFee: number;
  slotDurationMin: number;
  bufferMin: number;
};

export type CalendarAvailabilityRow = {
  id?: string;
  practitioner_id?: string;
  date: string;
  working_start: string | null;
  working_end: string | null;
  breaks: TimeRange[];
  op_timings?: TimeRange[];
  slots: { start: string; end: string; enabled: boolean }[];
  is_holiday: boolean;
  is_leave: boolean;
};

export type BlockedDateRow = {
  id: string;
  date: string;
  reason: string;
};

type ScheduleSource = {
  start_time: string;
  end_time: string;
  break_start: string | null;
  break_end: string | null;
  breaks: TimeRange[];
  op_timings: TimeRange[];
};

type CandidateSlot = {
  start_time: string;
  end_time: string;
  mode: "video" | "clinic";
  fee: number;
};

function formatTime(time: string): string {
  if (!time) return "";

  const [hoursText = "0", minutes = "00"] = time.split(":");
  const hours = Number.parseInt(hoursText, 10);

  if (Number.isNaN(hours)) return time;

  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function timeToMinutes(time: string): number {
  if (!time) return 0;

  const match = time.match(/(\d+):(\d+)\s*(am|pm)?/i);
  if (!match) return 0;

  let hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const mod = match[3]?.toLowerCase();

  if (mod === "pm" && hours < 12) hours += 12;
  if (mod === "am" && hours === 12) hours = 0;

  return Number.isNaN(hours) || Number.isNaN(minutes)
    ? 0
    : hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const value = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:00`;
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getDatabaseDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const jsDay = new Date(year, month - 1, day).getDay();

  return jsDay === 0 ? 6 : jsDay - 1;
}

function addInterval(
  intervals: { start: number; end: number }[],
  startTime?: string | null,
  endTime?: string | null,
): void {
  if (!startTime || !endTime) return;

  const start = timeToMinutes(startTime);
  let end = timeToMinutes(endTime);

  if (end <= start) end += 1440;

  intervals.push({ start, end });
}

export class AvailabilityRepository {
  static async getPractitionerIdFromUserId(
    userId: string,
  ): Promise<string | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("practitioners")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error(
        "[AvailabilityRepository] Failed to resolve practitioner ID:",
        error.message,
      );
      return null;
    }

    return data?.id ?? null;
  }

  static async resolvePractitionerId(id: string): Promise<string> {
    return (await this.getPractitionerIdFromUserId(id)) ?? id;
  }

  static async getAvailableDatesForPractitioner(
    practitionerId: string,
  ): Promise<string[]> {
    const supabase = await createClient();

    const [
      { data: recurringData, error: recError },
      { data: calendarData, error: calError },
    ] = await Promise.all([
      supabase
        .from("availability_schedules")
        .select("day_of_week")
        .eq("practitioner_id", practitionerId)
        .eq("is_active", true),
      supabase
        .from("calendar_availability")
        .select("date, working_start, working_end, is_holiday, is_leave")
        .eq("practitioner_id", practitionerId),
    ]);

    if (recError) {
      console.error(
        "[AvailabilityRepository] Failed to fetch recurring schedules:",
        recError.message,
      );
    }

    if (calError) {
      console.error(
        "[AvailabilityRepository] Failed to fetch calendar availability:",
        calError.message,
      );
    }

    const activeDays = new Set(
      (recurringData ?? []).map((row: any) => row.day_of_week),
    );

    const calendarMap = new Map<string, any>();
    (calendarData ?? []).forEach((row: any) => {
      if (row.date) {
        calendarMap.set(row.date, row);
      }
    });

    const dates: string[] = [];
    const today = new Date();

    for (let index = 0; index < 90; index += 1) {
      const current = new Date(today);
      current.setDate(today.getDate() + index);
      const isoDate = toLocalIsoDate(current);

      const calEntry = calendarMap.get(isoDate);

      if (calEntry) {
        if (
          !calEntry.is_holiday &&
          !calEntry.is_leave &&
          calEntry.working_start &&
          calEntry.working_end
        ) {
          dates.push(isoDate);
        }
      } else {
        const jsDay = current.getDay();
        const databaseDay = jsDay === 0 ? 6 : jsDay - 1;

        if (activeDays.has(databaseDay) || activeDays.size === 0) {
          dates.push(isoDate);
        }
      }
    }

    return dates;
  }

  static async getSlotsForPractitioner(
    practitionerId: string,
    date: string,
  ): Promise<SlotView[]> {
    const supabase = await createClient();

    const { data: initialSlots, error: slotError } = await supabase
      .from("slots")
      .select("id, slot_date, start_time, end_time, mode, fee, status")
      .eq("practitioner_id", practitionerId)
      .eq("slot_date", date);

    if (slotError) {
      console.error(
        "[AvailabilityRepository] Failed to fetch slots:",
        slotError.message,
      );
      return [];
    }

    const dayOfWeek = getDatabaseDay(date);

    const [
      { data: calendarSchedule, error: calendarError },
      { data: recurringSchedule, error: recurringError },
    ] = await Promise.all([
      supabase
        .from("calendar_availability")
        .select(
          "working_start, working_end, breaks, op_timings, is_holiday, is_leave",
        )
        .eq("practitioner_id", practitionerId)
        .eq("date", date)
        .maybeSingle(),
      supabase
        .from("availability_schedules")
        .select(
          "start_time, end_time, break_start, break_end, breaks, op_timings, is_active",
        )
        .eq("practitioner_id", practitionerId)
        .eq("day_of_week", dayOfWeek)
        .maybeSingle(),
    ]);

    if (calendarError) {
      console.error(
        "[AvailabilityRepository] Calendar schedule fetch failed:",
        calendarError.message,
      );
    }

    if (recurringError) {
      console.error(
        "[AvailabilityRepository] Recurring schedule fetch failed:",
        recurringError.message,
      );
    }

    let schedule: ScheduleSource | null = null;

    if (calendarSchedule) {
      const unavailable =
        calendarSchedule.is_holiday ||
        calendarSchedule.is_leave ||
        !calendarSchedule.working_start ||
        !calendarSchedule.working_end;

      if (!unavailable) {
        schedule = {
          start_time: calendarSchedule.working_start,
          end_time: calendarSchedule.working_end,
          break_start: null,
          break_end: null,
          breaks: Array.isArray(calendarSchedule.breaks)
            ? calendarSchedule.breaks
            : [],
          op_timings: Array.isArray(calendarSchedule.op_timings)
            ? calendarSchedule.op_timings
            : [],
        };
      }
    } else if (
      recurringSchedule?.is_active &&
      recurringSchedule.start_time &&
      recurringSchedule.end_time
    ) {
      schedule = {
        start_time: recurringSchedule.start_time,
        end_time: recurringSchedule.end_time,
        break_start: recurringSchedule.break_start,
        break_end: recurringSchedule.break_end,
        breaks: Array.isArray(recurringSchedule.breaks)
          ? recurringSchedule.breaks
          : [],
        op_timings: Array.isArray(recurringSchedule.op_timings)
          ? recurringSchedule.op_timings
          : [],
      };
    } else {
      schedule = {
        start_time: "09:00:00",
        end_time: "17:00:00",
        break_start: "13:00:00",
        break_end: "14:00:00",
        breaks: [{ start: "13:00:00", end: "14:00:00" }],
        op_timings: [],
      };
    }

    if (!schedule) {
      const openSlotIds = (initialSlots ?? [])
        .filter((slot: any) => slot.status === "open")
        .map((slot: any) => slot.id);

      if (openSlotIds.length > 0) {
        const { error } = await supabase
          .from("slots")
          .delete()
          .in("id", openSlotIds);

        if (error) {
          console.error(
            "[AvailabilityRepository] Failed to delete stale slots:",
            error.message,
          );
        }
      }

      return [];
    }

    const { data: practitioner, error: practitionerError } = await supabase
      .from("practitioners")
      .select(
        "slot_duration_min, buffer_min, base_video_fee, base_clinic_fee",
      )
      .eq("id", practitionerId)
      .maybeSingle();

    if (practitionerError || !practitioner) {
      console.error(
        "[AvailabilityRepository] Practitioner settings fetch failed:",
        practitionerError?.message ?? "Practitioner not found",
      );
      return [];
    }

    const duration = practitioner.slot_duration_min || 20;
    const buffer = practitioner.buffer_min || 0;
    const videoFee = practitioner.base_video_fee || 0;
    const clinicFee = practitioner.base_clinic_fee || 0;

    const startMinutes = timeToMinutes(schedule.start_time);
    let endMinutes = timeToMinutes(schedule.end_time);

    if (endMinutes <= startMinutes) endMinutes += 1440;

    const blockedIntervals: { start: number; end: number }[] = [];

    addInterval(
      blockedIntervals,
      schedule.break_start,
      schedule.break_end,
    );

    schedule.breaks.forEach((range) => {
      addInterval(blockedIntervals, range.start, range.end);
    });

    schedule.op_timings.forEach((range) => {
      addInterval(blockedIntervals, range.start, range.end);
    });

    const [
      { data: prescriptions, error: prescriptionError },
      { data: appointmentsByPractitioner, error: appointmentError },
      { data: appointmentsByProfile, error: appointmentProfileError },
    ] = await Promise.all([
      supabase
        .from("prescriptions")
        .select("lifestyle_advice")
        .eq("practitioner_id", practitionerId)
        .like(
          "lifestyle_advice",
          `%[Upcoming Session Fixed: ${date} at %`,
        ),
      supabase
        .from("appointments")
        .select("scheduled_time")
        .eq("practitioner_id", practitionerId)
        .eq("scheduled_date", date)
        .neq("status", "cancelled"),
      // Appointments booked through the newer doctor-profile flow only set
      // `doctor_profile_id`, not `practitioner_id` — check both columns so a
      // slot booked through either path is correctly hidden here.
      supabase
        .from("appointments")
        .select("scheduled_time")
        .eq("doctor_profile_id", practitionerId)
        .eq("scheduled_date", date)
        .neq("status", "cancelled"),
    ]);

    if (appointmentProfileError) {
      console.error(
        "[AvailabilityRepository] Appointment (doctor profile) fetch failed:",
        appointmentProfileError.message,
      );
    }

    const appointments = [...(appointmentsByPractitioner ?? []), ...(appointmentsByProfile ?? [])];

    if (prescriptionError) {
      console.error(
        "[AvailabilityRepository] Upcoming session fetch failed:",
        prescriptionError.message,
      );
    }

    for (const prescription of prescriptions ?? []) {
      if (!prescription.lifestyle_advice) continue;

      const escapedDate = date.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(
        `\\[Upcoming Session Fixed: ${escapedDate} at (.*?)\\]`,
        "g",
      );

      let match: RegExpExecArray | null;

      while (
        (match = pattern.exec(prescription.lifestyle_advice)) !== null
      ) {
        const start = timeToMinutes(match[1]);
        blockedIntervals.push({ start, end: start + duration });
      }
    }

    if (appointmentError) {
      console.error(
        "[AvailabilityRepository] Appointment fetch failed:",
        appointmentError.message,
      );
    }

    const bookedTimes = new Set(
      (appointments ?? [])
        .map((row: any) => row.scheduled_time?.slice(0, 5))
        .filter((time: string | undefined): time is string =>
          Boolean(time),
        ),
    );

    const candidates: CandidateSlot[] = [];

    for (
      let current = startMinutes;
      current + duration <= endMinutes;
      current += duration + buffer
    ) {
      const slotStart = current;
      const slotEnd = current + duration;
      const startTime = minutesToTime(slotStart);
      const startHourMinute = startTime.slice(0, 5);

      const overlapsBlockedTime = blockedIntervals.some(
        ({ start, end }) => slotStart < end && slotEnd > start,
      );

      if (overlapsBlockedTime || bookedTimes.has(startHourMinute)) {
        continue;
      }

      const endTime = minutesToTime(slotEnd);

      if (videoFee > 0) {
        candidates.push({
          start_time: startTime,
          end_time: endTime,
          mode: "video",
          fee: videoFee,
        });
      }

      if (clinicFee > 0) {
        candidates.push({
          start_time: startTime,
          end_time: endTime,
          mode: "clinic",
          fee: clinicFee,
        });
      }
    }

    const existingKeys = new Set(
      (initialSlots ?? []).map(
        (slot: any) =>
          `${slot.start_time.slice(0, 5)}_${slot.mode}`,
      ),
    );

    const candidateKeys = new Set(
      candidates.map(
        (candidate) =>
          `${candidate.start_time.slice(0, 5)}_${candidate.mode}`,
      ),
    );

    const staleSlotIds = (initialSlots ?? [])
      .filter(
        (slot: any) =>
          slot.status === "open" &&
          !candidateKeys.has(
            `${slot.start_time.slice(0, 5)}_${slot.mode}`,
          ),
      )
      .map((slot: any) => slot.id);

    if (staleSlotIds.length > 0) {
      const { error } = await supabase
        .from("slots")
        .delete()
        .in("id", staleSlotIds);

      if (error) {
        console.error(
          "[AvailabilityRepository] Stale slot deletion failed:",
          error.message,
        );
        throw error;
      }
    }

    const slotsToInsert = candidates
      .filter(
        (candidate) =>
          !existingKeys.has(
            `${candidate.start_time.slice(0, 5)}_${candidate.mode}`,
          ),
      )
      .map((candidate) => ({
        practitioner_id: practitionerId,
        slot_date: date,
        start_time: candidate.start_time,
        end_time: candidate.end_time,
        mode: candidate.mode,
        fee: candidate.fee,
        status: "open",
      }));

    if (slotsToInsert.length > 0) {
      const { error } = await supabase
        .from("slots")
        .insert(slotsToInsert);

      if (error) {
        console.error(
          "[AvailabilityRepository] Slot generation failed:",
          error.message,
        );
        throw error;
      }
    }

    const { data: finalSlots, error: finalError } = await supabase
      .from("slots")
      .select("id, slot_date, start_time, end_time, mode, fee, status")
      .eq("practitioner_id", practitionerId)
      .eq("slot_date", date)
      .eq("status", "open")
      .order("start_time", { ascending: true });

    if (finalError) {
      console.error(
        "[AvailabilityRepository] Final slot fetch failed:",
        finalError.message,
      );
      return [];
    }

    return (finalSlots ?? []).map((slot: any) => ({
      id: slot.id,
      date: slot.slot_date,
      startTime: formatTime(slot.start_time),
      endTime: formatTime(slot.end_time),
      mode: slot.mode,
      fee: Math.round((slot.fee ?? 0) / 100),
      status: slot.status,
    }));
  }

  static async getSchedules(
    practitionerId: string,
  ): Promise<ScheduleRow[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("availability_schedules")
      .select("*")
      .eq("practitioner_id", practitionerId)
      .order("day_of_week", { ascending: true });

    if (error) {
      console.error(
        "[AvailabilityRepository] Schedule fetch failed:",
        error.message,
      );
      throw new Error("Failed to fetch practitioner schedules");
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      dayOfWeek: row.day_of_week,
      startTime: row.start_time ?? "",
      endTime: row.end_time ?? "",
      breakStart: row.break_start,
      breakEnd: row.break_end,
      breaks: Array.isArray(row.breaks) ? row.breaks : [],
      opTimings: Array.isArray(row.op_timings)
        ? row.op_timings
        : [],
      clinicId: row.clinic_id,
      isActive: row.is_active ?? true,
    }));
  }

  static async replaceSchedules(
    practitionerId: string,
    schedules: ScheduleInput[],
  ): Promise<void> {
    const supabase = await createClient();

    const { error: deleteError } = await supabase
      .from("availability_schedules")
      .delete()
      .eq("practitioner_id", practitionerId);

    if (deleteError) {
      console.error(
        "[AvailabilityRepository] Schedule deletion failed:",
        deleteError.message,
      );
      throw deleteError;
    }

    if (schedules.length === 0) return;

    const rows = schedules.map((schedule) => ({
      practitioner_id: practitionerId,
      day_of_week: schedule.dayOfWeek,
      start_time: schedule.startTime || null,
      end_time: schedule.endTime || null,
      break_start: schedule.breakStart || null,
      break_end: schedule.breakEnd || null,
      breaks: schedule.breaks ?? [],
      op_timings: schedule.opTimings ?? [],
      is_active: schedule.isActive,
    }));

    const { error: insertError } = await supabase
      .from("availability_schedules")
      .insert(rows);

    if (insertError) {
      console.error(
        "[AvailabilityRepository] Schedule insert failed:",
        insertError.message,
      );
      throw insertError;
    }
  }

  static async getCalendarAvailability(
    practitionerId: string,
    startDate: string,
    endDate: string,
  ): Promise<CalendarAvailabilityRow[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("calendar_availability")
      .select(
        "id, practitioner_id, date, working_start, working_end, breaks, op_timings, slots, is_holiday, is_leave",
      )
      .eq("practitioner_id", practitionerId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true });

    if (error) {
      console.error(
        "[AvailabilityRepository] Calendar fetch failed:",
        error.message,
      );
      throw new Error("Failed to fetch calendar availability");
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      practitioner_id: row.practitioner_id,
      date: row.date,
      working_start: row.working_start,
      working_end: row.working_end,
      breaks: Array.isArray(row.breaks) ? row.breaks : [],
      op_timings: Array.isArray(row.op_timings)
        ? row.op_timings
        : [],
      slots: Array.isArray(row.slots) ? row.slots : [],
      is_holiday: row.is_holiday ?? false,
      is_leave: row.is_leave ?? false,
    }));
  }

  static async updateCalendarAvailability(
    practitionerId: string,
    availability: CalendarAvailabilityRow[],
  ): Promise<void> {
    if (availability.length === 0) return;

    const supabase = await createClient();

    const rows = availability.map((day) => ({
      practitioner_id: practitionerId,
      date: day.date,
      working_start: day.working_start || null,
      working_end: day.working_end || null,
      breaks: day.breaks ?? [],
      op_timings: day.op_timings ?? [],
      slots: day.slots ?? [],
      is_holiday: day.is_holiday ?? false,
      is_leave: day.is_leave ?? false,
    }));

    const { error } = await supabase
      .from("calendar_availability")
      .upsert(rows, {
        onConflict: "practitioner_id,date",
      });

    if (error) {
      console.error(
        "[AvailabilityRepository] Calendar update failed:",
        error.message,
        error.details,
        error.hint,
      );
      throw error;
    }

  }

  static async updateSettings(
    practitionerId: string,
    settings: PractitionerSettingsInput,
  ): Promise<void> {
    const supabase = await createClient();

    const { error } = await supabase
      .from("practitioners")
      .update({
        base_video_fee: settings.baseVideoFee * 100,
        base_clinic_fee: settings.baseClinicFee * 100,
        slot_duration_min: settings.slotDurationMin,
        buffer_min: settings.bufferMin,
      })
      .eq("id", practitionerId);

    if (error) {
      console.error(
        "[AvailabilityRepository] Settings update failed:",
        error.message,
      );
      throw error;
    }
  }

  static async getBlockedDates(
    practitionerId: string,
  ): Promise<BlockedDateRow[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("blocked_dates")
      .select("id, block_date, reason")
      .eq("practitioner_id", practitionerId)
      .gte("block_date", toLocalIsoDate(new Date()))
      .order("block_date", { ascending: true });

    if (error) {
      console.error(
        "[AvailabilityRepository] Blocked date fetch failed:",
        error.message,
      );
      throw new Error("Failed to fetch blocked dates");
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      date: row.block_date,
      reason: row.reason ?? "",
    }));
  }
}