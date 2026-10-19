"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export type PatientProfile = {
  id: string;
  name: string;
  email: string;
  phone: string;
  dob: string;
  age: number;
  gender: string;
  city: string;
  pinCode: string;
  prakriti: string;
  wellnessGoals: string[];
  abhaId: string | null;
  abhaAddress: string | null;
  address?: string;
  avatarUrl?: string | null;
  signatureUrl?: string | null;
  linkedDoctorName?: string | null;
  experience?: number | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
  state?: string | null;
};

export function usePatientProfile(userId: string | undefined) {
  return useQuery<PatientProfile | null>(async () => {
    if (!userId) return null;
    const response = await apiClient<{ data: PatientProfile }>("/api/profile");
    return response.data;
  }, [userId]);
}