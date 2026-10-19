import "server-only";

import { AnalyticsRepository, type AnalyticsData } from "../repo/analytics.repo";
import { AuthUser } from "@/shared/auth/auth.types";
import { resolveActingPractitionerUserId } from "@/shared/auth/resolve-practitioner-context";

const EMPTY_ANALYTICS: AnalyticsData = {
  totalConsultations: 0,
  totalPatients: 0,
  completedThisMonth: 0,
  totalRevenue: 0,
  revenueThisMonth: 0,
  avgRating: 0,
  totalRatings: 0,
  avgDuration: 0,
  monthlyConsults: [],
};

export class AnalyticsService {
  static async getPractitionerAnalytics(authUser: AuthUser): Promise<AnalyticsData> {
    if (
      authUser.role !== "doctor" &&
      (authUser.role as string) !== "practitioner" &&
      authUser.role !== "assistant"
    ) {
      return EMPTY_ANALYTICS;
    }

    const practitionerId = await AnalyticsRepository.getPractitionerIdFromUserId(
      await resolveActingPractitionerUserId(authUser)
    );
    if (!practitionerId) return EMPTY_ANALYTICS;

    return AnalyticsRepository.getAnalyticsForPractitioner(practitionerId);
  }
}