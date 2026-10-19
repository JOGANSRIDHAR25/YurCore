"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export function useAppointments(patientId: string | undefined) {
  return useQuery<any[]>(
    async () => {
      if (!patientId) return [];
      const response = await apiClient<{ data: any[] }>("/api/appointments");
      return response.data;
    },
    [patientId]
  );
}
