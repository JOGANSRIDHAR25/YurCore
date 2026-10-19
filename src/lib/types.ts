/**
 * Shared type definitions.
 *
 * @deprecated Import from feature-specific type files or `@/types/` instead.
 * This file is kept for backward compatibility during migration.
 */

// Re-export from canonical locations
export type { Practitioner } from "@/features/doctor/types/doctor.types";
export type { DinacharTask } from "@/features/dinacharya/types/dinacharya.types";
export type { AYUSHDiscipline, QueueStatus, ChatMessage, SocialHistory, MedicalHistory } from "@/types/common.types";
export type { QueuePatient } from "@/features/pro/types/pro.types";

// Types that are still unique to this file (kept for backward compat)
export interface Appointment {
  id: string;
  doctor: Practitioner;
  date: string;
  time: string;
  mode: "video" | "clinic";
  status: "upcoming" | "completed" | "cancelled";
  patientName: string;
}

export interface HealthRecord {
  id: string;
  date: string;
  type: "consultation" | "prescription" | "lab" | "tracker";
  title: string;
  doctor?: string;
  discipline?: AYUSHDiscipline;
  summary: string;
}

export type IntakeTab = "intake" | "vitals" | "medical-history" | "history" | "care-team" | "reports";

export type VitalsRecord = {
  date: string; doctor: string; doctorInitials: string; isYou?: boolean;
  bpSys: number; bpDia: number; pulse: number; temp: number;
  spo2: number; rr: number; weight: number; height: number;
};

export type VisitRecord = {
  id: string;
  date: string; time: string; duration: string;
  mode: "video" | "clinic";
  doctor: string; specialty: string; doctorInitials: string; isYou?: boolean;
  chiefComplaint: string;
  soap: { S: string; O: string; A: string; P: string };
  diagnosis: string;
  vitals: { bpSys: number; bpDia: number; pulse: number; temp: number; spo2: number; rr: number; weight: number; height: number } | null;
  medications: { name: string; dose: string; frequency: string; anupana: string; system: string }[];
  investigations: string[];
  referrals: { specialty: string; urgency: string }[];
  followUpDate: string | null;
  followUpInstructions: string;
  type: "initial" | "follow-up" | "review" | "urgent";
};

// Import Practitioner for the Appointment interface above
import type { Practitioner } from "@/features/doctor/types/doctor.types";
import type { AYUSHDiscipline } from "@/types/common.types";
