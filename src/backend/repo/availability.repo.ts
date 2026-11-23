import "server-only";

import { createClient } from "@/shared/db/supabase.server";
import {
  resolveDayPlan,
  checkTimeAgainstPlan,
  toIsoDate,
  type DateOverride,
  type WeeklyDay,
} from "@/shared/availability/schedule";

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

export type AvailabilityState = {
  acceptingBookings: boolean;
  configured: boolean;
  /** Patients can see and book this doctor. */
  bookable: boolean;
};

export type UpcomingAppointment = {
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
    const state = await this.getAvailabilityState(practitionerId);
    if (!state.bookable) return [];

    const today = toIsoDate(new Date());
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 89);
    const { weekly, overrides } = await this.loadScheduleInputs(
      practitionerId,
      today,
      toIsoDate(horizon),
    );

    const dates: string[] = [];
    for (let index = 0; index < 90; index += 1) {
      const current = new Date();
      current.setDate(current.getDate() + index);
      const isoDate = toIsoDate(current);
      if (resolveDayPlan(isoDate, overrides.get(isoDate), weekly).available) {
        dates.push(isoDate);
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

    let schedule: ScheduleSource | null = null;

    const state = await this.getAvailabilityState(practitionerId);
    if (state.bookable) {
      const { weekly, overrides } = await this.loadScheduleInputs(practitionerId, date, date);
      const plan = resolveDayPlan(date, overrides.get(date), weekly);
      if (plan.available) {
        schedule = {
          start_time: plan.start,
          end_time: plan.end,
          break_start: null,
          break_end: null,
          breaks: plan.breaks,
          op_timings: plan.opTimings,
        };
      }
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

  /* ---------------------------------------------------------------------- */
  /*                Availability state (setup gate + bookings switch)        */
  /* ---------------------------------------------------------------------- */

  static async getAvailabilityState(practitionerId: string): Promise<AvailabilityState> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("practitioners")
      .select("*")
      .eq("id", practitionerId)
      .maybeSingle();

    if (error || !data) {
      if (error) console.error("[AvailabilityRepository] State fetch failed:", error.message);
      return { acceptingBookings: false, configured: false, bookable: false };
    }
    return availabilityStateFromRow(data);
  }

  static async setAcceptingBookings(practitionerId: string, accepting: boolean): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("practitioners")
      .update({ accepting_bookings: accepting })
      .eq("id", practitionerId);
    if (error) {
      console.error("[AvailabilityRepository] accepting_bookings update failed:", error.message);
      throw new Error(
        "Could not update booking status. Make sure the 'practitioner availability state' migration has been applied.",
      );
    }
  }

  static async markAvailabilityConfigured(practitionerId: string): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase
      .from("practitioners")
      .update({ availability_configured_at: new Date().toISOString() })
      .eq("id", practitionerId)
      .is("availability_configured_at", null);
    // Column not created yet (migration pending): every doctor is treated as
    // configured in that case, so there's nothing to record.
    if (error && (error.code === "42703" || error.code === "PGRST204")) {
      console.warn("[AvailabilityRepository] availability_configured_at column missing — run the availability state migration.");
      return;
    }
    if (error) {
      console.error("[AvailabilityRepository] availability_configured_at update failed:", error.message);
      throw new Error(
        "Could not mark availability as set up. Make sure the 'practitioner availability state' migration has been applied.",
      );
    }
  }

  /* ---------------------------------------------------------------------- */
  /*                         Schedule inputs + guards                         */
  /* ---------------------------------------------------------------------- */

  static async loadScheduleInputs(
    practitionerId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ weekly: WeeklyDay[]; overrides: Map<string, DateOverride> }> {
    const supabase = await createClient();
    const [{ data: weeklyRows, error: weeklyError }, { data: calendarRows, error: calendarError }] =
      await Promise.all([
        supabase
          .from("availability_schedules")
          .select("day_of_week, start_time, end_time, break_start, break_end, breaks, op_timings, is_active")
          .eq("practitioner_id", practitionerId),
        supabase
          .from("calendar_availability")
          .select("date, working_start, working_end, breaks, op_timings, is_holiday, is_leave")
          .eq("practitioner_id", practitionerId)
          .gte("date", startDate)
          .lte("date", endDate),
      ]);

    if (weeklyError) console.error("[AvailabilityRepository] Weekly schedule fetch failed:", weeklyError.message);
    if (calendarError) console.error("[AvailabilityRepository] Calendar fetch failed:", calendarError.message);

    const weekly: WeeklyDay[] = (weeklyRows ?? []).map((row: any) => {
      const breaks: TimeRange[] = Array.isArray(row.breaks) ? [...row.breaks] : [];
      if (row.break_start && row.break_end && !breaks.some((b) => b.start?.slice(0, 5) === row.break_start.slice(0, 5))) {
        breaks.push({ start: row.break_start, end: row.break_end });
      }
      return {
        dayOfWeek: row.day_of_week,
        startTime: row.start_time ?? "",
        endTime: row.end_time ?? "",
        breaks,
        opTimings: Array.isArray(row.op_timings) ? row.op_timings : [],
        isActive: row.is_active ?? true,
      };
    });

    const overrides = new Map<string, DateOverride>();
    (calendarRows ?? []).forEach((row: any) => {
      overrides.set(row.date, {
        date: row.date,
        working_start: row.working_start,
        working_end: row.working_end,
        breaks: Array.isArray(row.breaks) ? row.breaks : [],
        op_timings: Array.isArray(row.op_timings) ? row.op_timings : [],
        is_holiday: row.is_holiday ?? false,
        is_leave: row.is_leave ?? false,
      });
    });

    return { weekly, overrides };
  }

  /**
   * Last line of defence at booking time: the doctor must be live and the
   * requested time must still be inside their hours for that date (a slot row
   * may have been generated before the doctor took leave or changed hours).
   */
  static async assertBookable(practitionerId: string, date: string, time: string): Promise<void> {
    const state = await this.getAvailabilityState(practitionerId);
    if (!state.bookable) {
      throw new Error("This doctor is not accepting bookings right now. Please choose another doctor or try later.");
    }
    const [{ weekly, overrides }, duration] = await Promise.all([
      this.loadScheduleInputs(practitionerId, date, date),
      this.getSlotDuration(practitionerId),
    ]);
    const plan = resolveDayPlan(date, overrides.get(date), weekly);
    if (!checkTimeAgainstPlan(plan, time, duration).ok) {
      throw new Error("Slot is no longer available — the doctor has changed their availability for this day.");
    }
  }

  static async getSlotDuration(practitionerId: string): Promise<number> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("practitioners")
      .select("slot_duration_min")
      .eq("id", practitionerId)
      .maybeSingle();
    return data?.slot_duration_min || 20;
  }

  /** Upserts only the given weekdays, leaving the others untouched. */
  static async upsertWeeklyDays(practitionerId: string, days: WeeklyDay[]): Promise<void> {
    if (days.length === 0) return;
    const supabase = await createClient();
    const dayNumbers = days.map((d) => d.dayOfWeek);

    const { error: deleteError } = await supabase
      .from("availability_schedules")
      .delete()
      .eq("practitioner_id", practitionerId)
      .in("day_of_week", dayNumbers);
    if (deleteError) {
      console.error("[AvailabilityRepository] Weekly day delete failed:", deleteError.message);
      throw deleteError;
    }

    const { error } = await supabase.from("availability_schedules").insert(
      days.map((d) => ({
        practitioner_id: practitionerId,
        day_of_week: d.dayOfWeek,
        start_time: d.startTime || null,
        end_time: d.endTime || null,
        break_start: null,
        break_end: null,
        breaks: d.breaks ?? [],
        op_timings: d.opTimings ?? [],
        is_active: d.isActive,
      })),
    );
    if (error) {
      console.error("[AvailabilityRepository] Weekly day insert failed:", error.message);
      throw error;
    }
  }

  /** Removes date overrides so those dates fall back to the weekly schedule. */
  static async deleteCalendarOverrides(practitionerId: string, dates: string[]): Promise<void> {
    if (dates.length === 0) return;
    const supabase = await createClient();
    const { error } = await supabase
      .from("calendar_availability")
      .delete()
      .eq("practitioner_id", practitionerId)
      .in("date", dates);
    if (error) {
      console.error("[AvailabilityRepository] Calendar override delete failed:", error.message);
      throw error;
    }
  }

  /**
   * Drops not-yet-booked slot rows so they are regenerated from the new
   * schedule on the next fetch. Pass `dates` to limit it, or omit for all
   * future dates.
   */
  static async purgeOpenSlots(practitionerId: string, dates?: string[]): Promise<void> {
    const supabase = await createClient();
    let query = supabase
      .from("slots")
      .delete()
      .eq("practitioner_id", practitionerId)
      .eq("status", "open");
    query = dates ? query.in("slot_date", dates) : query.gte("slot_date", toIsoDate(new Date()));
    const { error } = await query;
    if (error) console.error("[AvailabilityRepository] Open slot purge failed:", error.message);
  }

  /* ---------------------------------------------------------------------- */
  /*                         Doctor's own appointments                        */
  /* ---------------------------------------------------------------------- */

  static async getActiveAppointments(
    practitionerId: string,
    startDate: string,
    endDate?: string,
  ): Promise<UpcomingAppointment[]> {
    const supabase = await createClient();
    let query = supabase
      .from("appointments")
      .select(`
        id, patient_id, scheduled_date, scheduled_time, duration_min, mode, status, reason_for_visit,
        patient:patients ( full_name ),
        family_member:family_members ( full_name )
      `)
      .or(`practitioner_id.eq.${practitionerId},doctor_profile_id.eq.${practitionerId}`)
      .not("status", "in", '("cancelled","completed","no_show")')
      .gte("scheduled_date", startDate)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true });
    if (endDate) query = query.lte("scheduled_date", endDate);

    const [{ data, error }, fallbackDuration] = await Promise.all([query, this.getSlotDuration(practitionerId)]);
    if (error) {
      console.error("[AvailabilityRepository] Appointment fetch failed:", error.message);
      throw new Error("Failed to load appointments");
    }

    const seen = new Set<string>();
    return (data ?? [])
      .filter((row: any) => (seen.has(row.id) ? false : (seen.add(row.id), true)))
      .map((row: any) => {
        const patient = Array.isArray(row.patient) ? row.patient[0] : row.patient;
        const member = Array.isArray(row.family_member) ? row.family_member[0] : row.family_member;
        return {
          id: row.id,
          patientId: row.patient_id ?? null,
          patientName: member?.full_name || patient?.full_name || "Patient",
          familyMemberName: member?.full_name ?? null,
          date: row.scheduled_date,
          time: (row.scheduled_time ?? "").slice(0, 5),
          durationMin: row.duration_min || fallbackDuration,
          mode: row.mode ?? "clinic",
          status: row.status,
          reason: row.reason_for_visit ?? null,
        };
      });
  }

  static async getPractitionerContact(
    practitionerId: string,
  ): Promise<{ name: string; email: string | null; userId: string | null }> {
    const supabase = await createClient();
    const { data } = await supabase
      .from("practitioners")
      .select("full_name, user_id, user:users!practitioners_user_id_fkey ( email )")
      .eq("id", practitionerId)
      .maybeSingle();
    const user: any = data ? (Array.isArray((data as any).user) ? (data as any).user[0] : (data as any).user) : null;
    return { name: data?.full_name || "Doctor", email: user?.email ?? null, userId: data?.user_id ?? null };
  }

  /** In-app notification for the patient (or the family account owner). */
  static async notifyUser(
    userId: string,
    title: string,
    body: string,
    appointmentId: string,
  ): Promise<void> {
    const supabase = await createClient();
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      channel: "in_app",
      title,
      body,
      type: "appointment_cancelled",
      reference_id: appointmentId,
      reference_type: "appointment",
      is_read: false,
    });
    if (error) console.error("[AvailabilityRepository] Notification insert failed:", error.message);
  }

  static async getPatientUserId(patientId: string): Promise<string | null> {
    const supabase = await createClient();
    const { data } = await supabase.from("patients").select("user_id").eq("id", patientId).maybeSingle();
    if (data?.user_id) return data.user_id;
    const { data: family } = await supabase
      .from("family_members")
      .select("owner_patient_id")
      .eq("patient_id", patientId)
      .limit(1)
      .maybeSingle();
    if (!family?.owner_patient_id) return null;
    const { data: owner } = await supabase
      .from("patients")
      .select("user_id")
      .eq("id", family.owner_patient_id)
      .maybeSingle();
    return owner?.user_id ?? null;
  }
}

/**
 * Columns may be missing until the migration is applied — treat a missing
 * column as "live" so existing doctors don't disappear in the meantime.
 */
export function availabilityStateFromRow(row: Record<string, unknown>): AvailabilityState {
  const acceptingBookings = row.accepting_bookings !== false;
  const configured = !("availability_configured_at" in row) || row.availability_configured_at !== null;
  return { acceptingBookings, configured, bookable: acceptingBookings && configured };
}
