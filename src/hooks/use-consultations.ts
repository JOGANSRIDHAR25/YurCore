"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export async function fetchDetailedConsultations(familyMemberId?: string | null): Promise<any[]> {
  const query = familyMemberId ? `?familyMemberId=${encodeURIComponent(familyMemberId)}` : "";
  const response = await apiClient<{ data: any[] }>(`/api/consultations/detailed${query}`);
  return response.data;
}

/** Consultation/prescription totals for the account owner and their family members. */
export function usePatientRecordStats(patientId: string | undefined) {
  return useQuery<{ consultations: number; prescriptions: number }>(
    async () => {
      if (!patientId) return { consultations: 0, prescriptions: 0 };
      const response = await apiClient<{ data: { consultations: number; prescriptions: number } }>("/api/consultations/stats");
      return response.data;
    },
    [patientId]
  );
}

export function usePatientUpcomingCalls(patientId: string | undefined) {
  return useQuery<any[]>(
    async () => {
      if (!patientId) return [];
      const response = await apiClient<{ data: any[] }>("/api/consultations/upcoming-calls");
      return response.data;
    },
    [patientId]
  );
}

export function usePractitionerUpcomingCalls(practitionerId: string | undefined) {
  return useQuery<any[]>(
    async () => {
      if (!practitionerId) return [];
      const response = await apiClient<{ data: any[] }>("/api/consultations/upcoming-calls");
      return response.data;
    },
    [practitionerId]
  );
}