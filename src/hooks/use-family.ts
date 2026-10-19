"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export type FamilyMemberRow = {
  id: string;
  patientId: string | null;
  name: string;
  relationship: string;
  dob: string;
  age: number;
  gender: string;
  abhaId: string | null;
  phone: string;
  bloodGroup: string;
  height: number | null;
  weight: number | null;
};

export function useFamilyMembers(patientId: string | undefined) {
  return useQuery<FamilyMemberRow[]>(
    async () => {
      if (!patientId) return [];
      const response = await apiClient<{ data: FamilyMemberRow[] }>("/api/family");
      return response.data;
    },
    [patientId]
  );
}

export async function addFamilyMemberApi(member: { fullName: string; relationship: string; dob: string; gender: string; phone?: string; bloodGroup?: string; height?: number; weight?: number; }) {
  return await apiClient("/api/family", {
    method: "POST",
    body: JSON.stringify({ action: "addFamilyMember", payload: { member } }),
  });
}

export async function updateFamilyMemberApi(id: string, member: { fullName: string; relationship: string; dob: string; gender: string; phone?: string; bloodGroup?: string; height?: number; weight?: number; }) {
  return await apiClient("/api/family", {
    method: "POST",
    body: JSON.stringify({ action: "updateFamilyMember", payload: { id, member } }),
  });
}

export async function deleteFamilyMemberApi(id: string) {
  return await apiClient("/api/family", {
    method: "POST",
    body: JSON.stringify({ action: "deleteFamilyMember", payload: { id } }),
  });
}