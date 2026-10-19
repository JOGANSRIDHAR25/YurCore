import "server-only";

import {
  AvailabilityRepository,
  type SlotView,
  type ScheduleRow,
  type ScheduleInput,
  type CalendarAvailabilityRow,
  type PractitionerSettingsInput,
} from "../repo/availability.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";
import { ForbiddenError } from "@/shared/api/api-error";

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
  userId: string,
  startDate: string,
  endDate: string,
): Promise<CalendarAvailabilityRow[]> {
  if (!startDate || !endDate) {
    return [];
  }

  const practitionerId =
    await AvailabilityRepository.getPractitionerIdFromUserId(
      userId,
    );

  if (!practitionerId) {
    throw new ForbiddenError(
      "Practitioner profile not found",
    );
  }

  return AvailabilityRepository.getCalendarAvailability(
    practitionerId,
    startDate,
    endDate,
  );
}

static async updateCalendarAvailability(
  userId: string,
  availabilityData: CalendarAvailabilityRow[],
): Promise<void> {
  const practitionerId =
    await AvailabilityRepository.getPractitionerIdFromUserId(
      userId,
    );

  if (!practitionerId) {
    throw new ForbiddenError(
      "Practitioner profile not found",
    );
  }

  await AvailabilityRepository.updateCalendarAvailability(
    practitionerId,
    availabilityData,
  );
}
}
