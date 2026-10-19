"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export function useNewDoctorProfile(userId: string | undefined) {
  return useQuery<any | null>(
    () => (userId ? apiClient<{ data: any }>("/api/auth/onboard-doctor").then((r) => r.data) : Promise.resolve(null)),
    [userId]
  );
}
