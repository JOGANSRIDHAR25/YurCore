"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";
import type { DinacharTask } from "@/lib/types";

export function useDinacharyaTasks(patientId: string | undefined) {
  return useQuery<DinacharTask[]>(
    async () => {
      if (!patientId) return [];
      const response = await apiClient<{ data: DinacharTask[] }>("/api/dinacharya");
      return response.data;
    },
    [patientId]
  );
}

export async function toggleDinacharyaTaskApi(taskId: string, done: boolean) {
  return await apiClient("/api/dinacharya", {
    method: "POST",
    body: JSON.stringify({ taskId, done }),
  });
}
