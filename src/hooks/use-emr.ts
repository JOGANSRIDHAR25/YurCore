"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";
import type { HealthRecord } from "@/lib/types";

export function useHealthRecords(patientId: string | undefined) {
  return useQuery<HealthRecord[]>(
    async () => {
      if (!patientId) return [];
      const response = await apiClient<{ data: HealthRecord[] }>("/api/emr");
      return response.data;
    },
    [patientId]
  );
}

export async function savePatientVitalsApi(vitals: any) {
  return await apiClient("/api/emr", {
    method: "POST",
    body: JSON.stringify({ action: "savePatientVitals", payload: { vitals } }),
  });
}

export async function addPatientProblemApi(problem: { code: string; name: string; status: "active" | "controlled" | "resolved" }) {
  return await apiClient("/api/emr", {
    method: "POST",
    body: JSON.stringify({ action: "addPatientProblem", payload: { problem } }),
  });
}

export async function removePatientProblemApi(code: string) {
  return await apiClient("/api/emr", {
    method: "POST",
    body: JSON.stringify({ action: "removePatientProblem", payload: { code } }),
  });
}

export async function savePatientNoteApi(noteText: string) {
  return await apiClient("/api/emr", {
    method: "POST",
    body: JSON.stringify({ action: "savePatientNote", payload: { noteText } }),
  });
}
