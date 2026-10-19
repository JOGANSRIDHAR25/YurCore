"use client";

import { useQuery } from "./useQuery";
import { apiClient } from "@/shared/api/api-client";

export type PrescriptionItemView = {
  name: string;
  dose: string;
  frequency: string;
  anupana: string;
  durationDays: number;
  instructions: string;
  form: string;
  timing: string;
};

export type PrescriptionView = {
  id: string;
  consultationId?: string;
  date: string;
  doctorName: string;
  doctorInitials: string;
  patientId?: string;
  patientName?: string;
  gender?: string;
  age?: number | string;
  phone?: string;
  specialty: string;
  status: string;
  dietaryAdvice: string;
  lifestyleAdvice: string;
  physicalActivity: string;
  followUpDate: string | null;
  chiefComplaint: string;
  assessment: string;
  items: PrescriptionItemView[];
  isDetailed?: boolean;
  /** Set when the patient is a family member: the account owner they belong to. */
  ownerPatient?: { id: string; name: string; gender: string; age: number | string; phone: string } | null;
  relationship?: string;
  _raw?: any;
};

async function fetchPrescriptions(): Promise<PrescriptionView[]> {
  const response = await apiClient<{ data: PrescriptionView[] }>("/api/prescription");
  return response.data;
}

export function usePatientPrescriptions(patientId: string | undefined) {
  return useQuery<PrescriptionView[]>(
    () => (patientId ? fetchPrescriptions() : Promise.resolve([])),
    [patientId]
  );
}

export function usePractitionerPrescriptions(practitionerId: string | undefined) {
  return useQuery<PrescriptionView[]>(
    () => (practitionerId ? fetchPrescriptions() : Promise.resolve([])),
    [practitionerId]
  );
}

export async function deletePrescription(prescriptionId: string): Promise<void> {
  await apiClient(`/api/prescription/${prescriptionId}`, { method: "DELETE" });
}
