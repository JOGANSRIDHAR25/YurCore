import "server-only";

import { QueueRepository } from "../repo/queue.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";

async function resolveMyPractitionerId(authUser: AuthUser): Promise<string | null> {
  if (
    authUser.role !== "doctor" &&
    (authUser.role as string) !== "practitioner" &&
    authUser.role !== "assistant"
  ) {
    return null;
  }
  return QueueRepository.getPractitionerIdFromUserId(await resolveActingPractitionerUserId(authUser));
}

export class QueueService {
  static async getTodayQueue(authUser: AuthUser, dateStr?: string): Promise<any[]> {
    const practitionerId = await resolveMyPractitionerId(authUser);
    if (!practitionerId) return [];
    return QueueRepository.getTodayQueue(practitionerId, dateStr);
  }

  static async getMonthCounts(authUser: AuthUser, year: number, month: number): Promise<Record<string, number>> {
    const practitionerId = await resolveMyPractitionerId(authUser);
    if (!practitionerId) return {};
    return QueueRepository.getMonthCounts(practitionerId, year, month);
  }

  static async getUpcomingAppointments(authUser: AuthUser): Promise<any[]> {
    const practitionerId = await resolveMyPractitionerId(authUser);
    if (!practitionerId) return [];
    return QueueRepository.getUpcomingAppointments(practitionerId);
  }
}