import "server-only";

import {
  AvailabilityRepository,
  type SlotView,
  type ScheduleRow,
  type ScheduleInput,
  type CalendarAvailabilityRow,
  type PractitionerSettingsInput,
  type AvailabilityState,
  type UpcomingAppointment,
} from "../repo/availability.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { AppError, ForbiddenError, ValidationError } from "@/shared/api/api-error";
import { AppointmentsRepository } from "../repo/appointments.repo";
import { EmailService } from "./email.service";
import {
  addDays,
  checkTimeAgainstPlan,
  formatTime12,
  resolveDayPlan,
  toIsoDate,
  validateHours,
  WEEKDAY_LABELS,
  DEFAULT_WEEKLY_SCHEDULE,
  type DateOverride,
  type WeeklyDay,
} from "@/shared/availability/schedule";

/** What the doctor wants to change. Everything is optional. */
export type AvailabilityChange = {
  /** Date overrides to create/replace (custom hours or leave). */
  dates?: DateOverride[];
  /** Dates whose override should be removed (they follow the weekly schedule again). */
  clearDates?: string[];
  /** Weekdays to create/replace in the weekly schedule. */
  weekly?: WeeklyDay[];
};

export type ConflictingAppointment = UpcomingAppointment & { conflictReason: string };

export type CancellationResult = { cancelled: number; emailed: number; failed: number };

const CONFLICT_WINDOW_DAYS = 180;

function displayDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function rebookUrl(): string | undefined {
  const base = (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  return base ? `${base}/discover` : undefined;
}

function normaliseChange(change: AvailabilityChange): Required<AvailabilityChange> {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dates = (change.dates ?? []).map((d) => ({
    date: d.date,
    working_start: d.working_start || null,
    working_end: d.working_end || null,
    breaks: Array.isArray(d.breaks) ? d.breaks : [],
    op_timings: Array.isArray(d.op_timings) ? d.op_timings : [],
    is_holiday: Boolean(d.is_holiday),
    is_leave: Boolean(d.is_leave),
  }));
  const weekly = (change.weekly ?? []).map((w) => ({
    dayOfWeek: Number(w.dayOfWeek),
    startTime: w.startTime ?? "",
    endTime: w.endTime ?? "",
    breaks: Array.isArray(w.breaks) ? w.breaks : [],
    opTimings: Array.isArray(w.opTimings) ? w.opTimings : [],
    isActive: Boolean(w.isActive),
  }));
  const clearDates = (change.clearDates ?? []).filter((d) => datePattern.test(d));

  for (const d of dates) {
    if (!datePattern.test(d.date)) throw new ValidationError(`Invalid date: ${d.date}`);
    if (d.is_leave || d.is_holiday) continue;
    const error = validateHours(d.working_start ?? "", d.working_end ?? "", d.breaks, d.op_timings);
    if (error) throw new ValidationError(`${displayDate(d.date)}: ${error}`);
  }
  for (const w of weekly) {
    if (!(w.dayOfWeek >= 0 && w.dayOfWeek <= 6)) throw new ValidationError("Invalid weekday");
    if (!w.isActive) continue;
    const error = validateHours(w.startTime, w.endTime, w.breaks, w.opTimings);
    if (error) throw new ValidationError(`${WEEKDAY_LABELS[w.dayOfWeek]}: ${error}`);
  }
  return { dates, weekly, clearDates };
}

async function assertPractitioner(authUser: AuthUser): Promise<string> {
  if (
    authUser.role !== "doctor" &&
    (authUser.role as string) !== "practitioner" &&
    authUser.role !== "assistant"
  ) {
    throw new ForbiddenError("Only practitioners can manage their availability");
  }
  const practitionerId = await AvailabilityRepository.getPractitionerIdFromUserId(
    await resolveActingPractitionerUserId(authUser)
  );
  if (!practitionerId) {
    throw new ForbiddenError("Practitioner profile not found");
  }
  return practitionerId;
}

export class AvailabilityService {
  static async getAvailableDates(practitionerIdParam: string): Promise<string[]> {
    if (!practitionerIdParam) return [];
    const practitionerId = await AvailabilityRepository.resolvePractitionerId(practitionerIdParam);
    return AvailabilityRepository.getAvailableDatesForPractitioner(practitionerId);
  }

  static async getSlots(practitionerIdParam: string, date: string): Promise<SlotView[]> {
    if (!practitionerIdParam || !date) return [];
    const practitionerId = await AvailabilityRepository.resolvePractitionerId(practitionerIdParam);
    return AvailabilityRepository.getSlotsForPractitioner(practitionerId, date);
  }

  static async getMySchedules(authUser: AuthUser): Promise<ScheduleRow[]> {
    const practitionerId = await assertPractitioner(authUser);
    return AvailabilityRepository.getSchedules(practitionerId);
  }

  static async updateMySchedules(authUser: AuthUser, schedules: ScheduleInput[]): Promise<void> {
    const practitionerId = await assertPractitioner(authUser);
    await AvailabilityRepository.replaceSchedules(practitionerId, schedules);
  }

  static async updateMySettings(authUser: AuthUser, settings: PractitionerSettingsInput): Promise<void> {
    const practitionerId = await assertPractitioner(authUser);
    await AvailabilityRepository.updateSettings(practitionerId, settings);
  }

  static async getMyBlockedDates(authUser: AuthUser): Promise<{ id: string; date: string; reason: string }[]> {
    const practitionerId = await assertPractitioner(authUser);
    return AvailabilityRepository.getBlockedDates(practitionerId);
  }
  static async getCalendarAvailability(
  authUser: AuthUser,
  startDate: string,
  endDate: string,
): Promise<CalendarAvailabilityRow[]> {
  if (!startDate || !endDate) {
    return [];
  }

  // Doctors act on their own calendar; approved assistants on their linked doctor's.
  const practitionerId = await assertPractitioner(authUser);

  return AvailabilityRepository.getCalendarAvailability(
    practitionerId,
    startDate,
    endDate,
  );
}

static async updateCalendarAvailability(
  authUser: AuthUser,
  availabilityData: CalendarAvailabilityRow[],
): Promise<void> {
  const practitionerId = await assertPractitioner(authUser);

  await AvailabilityRepository.updateCalendarAvailability(
    practitionerId,
    availabilityData,
  );
}

  /* ---------------------------------------------------------------------- */
  /*            Setup gate, bookings switch and conflict-aware saves          */
  /* ---------------------------------------------------------------------- */

  static async getMyState(authUser: AuthUser): Promise<AvailabilityState & { upcomingCount: number }> {
    const practitionerId = await assertPractitioner(authUser);
    const [state, upcoming] = await Promise.all([
      AvailabilityRepository.getAvailabilityState(practitionerId),
      AvailabilityRepository.getActiveAppointments(practitionerId, toIsoDate(new Date())),
    ]);
    return { ...state, upcomingCount: upcoming.length };
  }

  static async getMyWeekly(authUser: AuthUser): Promise<WeeklyDay[]> {
    const practitionerId = await assertPractitioner(authUser);
    const today = toIsoDate(new Date());
    const { weekly } = await AvailabilityRepository.loadScheduleInputs(practitionerId, today, today);
    return weekly;
  }

  static async getMyAppointments(
    authUser: AuthUser,
    startDate: string,
    endDate?: string,
  ): Promise<UpcomingAppointment[]> {
    const practitionerId = await assertPractitioner(authUser);
    return AvailabilityRepository.getActiveAppointments(practitionerId, startDate, endDate);
  }

  /** Appointments that would no longer fit if `change` were saved. Read-only. */
  static async previewChange(authUser: AuthUser, change: AvailabilityChange): Promise<ConflictingAppointment[]> {
    const practitionerId = await assertPractitioner(authUser);
    return this.findConflicts(practitionerId, normaliseChange(change));
  }

  private static async findConflicts(
    practitionerId: string,
    change: Required<AvailabilityChange>,
  ): Promise<ConflictingAppointment[]> {
    const today = toIsoDate(new Date());
    const until = addDays(today, CONFLICT_WINDOW_DAYS);
    const [{ weekly, overrides }, appointments] = await Promise.all([
      AvailabilityRepository.loadScheduleInputs(practitionerId, today, until),
      AvailabilityRepository.getActiveAppointments(practitionerId, today, until),
    ]);

    const nextWeekly = [
      ...weekly.filter((w) => !change.weekly.some((c) => c.dayOfWeek === w.dayOfWeek)),
      ...change.weekly,
    ];
    // A first weekly edit replaces the built-in default, so the other days
    // must come from the default too — otherwise they'd suddenly read "off".
    if (weekly.length === 0 && change.weekly.length > 0) {
      for (const d of DEFAULT_WEEKLY_SCHEDULE) {
        if (!nextWeekly.some((w) => w.dayOfWeek === d.dayOfWeek)) nextWeekly.push(d);
      }
    }
    const nextOverrides = new Map(overrides);
    change.clearDates.forEach((d) => nextOverrides.delete(d));
    change.dates.forEach((d) => nextOverrides.set(d.date, d));

    const conflicts: ConflictingAppointment[] = [];
    for (const appt of appointments) {
      const plan = resolveDayPlan(appt.date, nextOverrides.get(appt.date), nextWeekly);
      const fit = checkTimeAgainstPlan(plan, appt.time, appt.durationMin);
      if (!fit.ok) conflicts.push({ ...appt, conflictReason: fit.reason });
    }
    return conflicts;
  }

  /**
   * Saves an availability change. If it would leave booked appointments
   * outside the doctor's hours, the doctor must explicitly confirm
   * (`cancelConflicts`) — those appointments are then cancelled and the
   * patients emailed + notified in the app.
   */
  static async saveChange(
    authUser: AuthUser,
    rawChange: AvailabilityChange,
    options: { cancelConflicts?: boolean; cancelReason?: string; actionLabel?: string },
  ): Promise<{ cancellation: CancellationResult; state: AvailabilityState }> {
    const practitionerId = await assertPractitioner(authUser);
    const change = normaliseChange(rawChange);
    const conflicts = await this.findConflicts(practitionerId, change);

    if (conflicts.length > 0 && !options.cancelConflicts) {
      throw new AppError(
        `${conflicts.length} booked appointment(s) fall outside the new availability. Review and confirm cancelling them first.`,
        409,
      );
    }

    // First weekly edit: materialise the default for the untouched days.
    const currentWeekly = (await AvailabilityRepository.loadScheduleInputs(practitionerId, toIsoDate(new Date()), toIsoDate(new Date()))).weekly;
    if (currentWeekly.length === 0 && change.weekly.length > 0) {
      for (const d of DEFAULT_WEEKLY_SCHEDULE) {
        if (!change.weekly.some((w) => w.dayOfWeek === d.dayOfWeek)) change.weekly.push(d);
      }
    }

    await AvailabilityRepository.upsertWeeklyDays(practitionerId, change.weekly);
    await AvailabilityRepository.deleteCalendarOverrides(
      practitionerId,
      change.clearDates.filter((d) => !change.dates.some((x) => x.date === d)),
    );
    if (change.dates.length > 0) {
      await AvailabilityRepository.updateCalendarAvailability(
        practitionerId,
        change.dates.map((d) => ({ ...d, slots: [] })),
      );
    }

    const cancellation = await this.cancelByPractitioner(
      practitionerId,
      conflicts,
      options.cancelReason,
      options.actionLabel ?? "You updated your availability",
    );

    await AvailabilityRepository.purgeOpenSlots(practitionerId);
    await AvailabilityRepository.markAvailabilityConfigured(practitionerId);

    return { cancellation, state: await AvailabilityRepository.getAvailabilityState(practitionerId) };
  }

  /**
   * The one "Accepting bookings" switch (dashboard + Availability page).
   * Off = hidden from patients, no new bookings. Existing appointments are
   * kept unless the doctor chooses to cancel them.
   */
  static async setAcceptingBookings(
    authUser: AuthUser,
    input: { accepting: boolean; cancelUpcoming?: boolean; cancelReason?: string },
  ): Promise<{ cancellation: CancellationResult; state: AvailabilityState }> {
    const practitionerId = await assertPractitioner(authUser);
    await AvailabilityRepository.setAcceptingBookings(practitionerId, input.accepting);

    let cancellation: CancellationResult = { cancelled: 0, emailed: 0, failed: 0 };
    if (!input.accepting) {
      await AvailabilityRepository.purgeOpenSlots(practitionerId);
      if (input.cancelUpcoming) {
        const upcoming = await AvailabilityRepository.getActiveAppointments(practitionerId, toIsoDate(new Date()));
        cancellation = await this.cancelByPractitioner(
          practitionerId,
          upcoming.map((a) => ({ ...a, conflictReason: "Doctor not accepting bookings" })),
          input.cancelReason,
          "You stopped accepting bookings",
        );
      }
    }
    return { cancellation, state: await AvailabilityRepository.getAvailabilityState(practitionerId) };
  }

  private static async cancelByPractitioner(
    practitionerId: string,
    appointments: ConflictingAppointment[],
    reason: string | undefined,
    actionLabel: string,
  ): Promise<CancellationResult> {
    const result: CancellationResult = { cancelled: 0, emailed: 0, failed: 0 };
    if (appointments.length === 0) return result;

    const doctor = await AvailabilityRepository.getPractitionerContact(practitionerId);
    const patientReason = reason?.trim() || "";
    const storedReason = `Cancelled by doctor: ${patientReason || appointments[0].conflictReason}`;
    const summary: { patientName: string; date: string; time: string; mode: string; emailed: boolean }[] = [];

    for (const appt of appointments) {
      const emailDetails = await AppointmentsRepository.getAppointmentEmailDetails(appt.id);
      try {
        await AppointmentsRepository.cancelAppointment(appt.id, storedReason);
      } catch (error) {
        console.error("[AvailabilityService] Cancel failed for", appt.id, error);
        result.failed += 1;
        continue;
      }
      result.cancelled += 1;

      const date = displayDate(appt.date);
      const time = formatTime12(appt.time);
      let emailed = false;

      if (emailDetails) {
        emailed = await EmailService.sendAppointmentCancelledByPractitioner(emailDetails.patientEmail, {
          patientName: emailDetails.patientName,
          familyMemberName: emailDetails.familyMemberName,
          practitionerName: doctor.name,
          date,
          time,
          mode: appt.mode,
          reason: patientReason || undefined,
          rebookUrl: rebookUrl(),
        });
      }
      if (emailed) result.emailed += 1;

      if (appt.patientId) {
        const userId = await AvailabilityRepository.getPatientUserId(appt.patientId);
        if (userId) {
          const forWhom = appt.familyMemberName ? `${appt.familyMemberName}'s appointment` : "Your appointment";
          await AvailabilityRepository.notifyUser(
            userId,
            "Appointment cancelled by doctor",
            `${forWhom} with Dr. ${doctor.name} on ${date} at ${time} was cancelled because the doctor is unavailable.${patientReason ? ` Message: ${patientReason}` : ""} Please book another slot.`,
            appt.id,
          );
        }
      }

      summary.push({ patientName: appt.patientName, date, time, mode: appt.mode, emailed });
    }

    if (doctor.email) {
      await EmailService.sendPractitionerCancellationSummary(doctor.email, {
        practitionerName: doctor.name,
        action: actionLabel,
        reason: patientReason || undefined,
        appointments: summary,
      });
    }
    return result;
  }
}
