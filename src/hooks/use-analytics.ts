"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export type AnalyticsData = {
  totalConsultations: number;
  totalPatients: number;
  completedThisMonth: number;
  totalRevenue: number;
  revenueThisMonth: number;
  avgRating: number;
  totalRatings: number;
  avgDuration: number;
  monthlyConsults: { month: string; count: number }[];
};

export function usePractitionerAnalytics(practitionerId: string | undefined) {
  return useQuery<AnalyticsData | null>(
    async () => {
      if (!practitionerId) return null;
      const response = await apiClient<{ data: AnalyticsData }>("/api/analytics");
      return response.data;
    },
    [practitionerId]
  );
}