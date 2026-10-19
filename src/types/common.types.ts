/**
 * Common shared types used across multiple features.
 *
 * @deprecated Prefer importing from feature-specific type files.
 *             These are kept here for backward compatibility.
 */

export type AYUSHDiscipline =
  | "Ayurveda"
  | "Yoga"
  | "Naturopathy"
  | "Unani"
  | "Siddha"
  | "Homeopathy";

export type QueueStatus = "waiting" | "checked-in" | "in-session" | "awaiting-notes" | "completed" | "missed";

export type IntakeTab = "intake" | "vitals" | "medical-history" | "history" | "care-team" | "reports";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  timestamp: Date;
}

export interface SocialHistory {
  occupation: string;
  marital: string;
  tobacco: string;
  alcohol: string;
  diet: string;
  exercise: string;
  notes?: string;
}

export interface MedicalHistory {
  allergies: any[];
  medications: any[];
  pmh: any[];
  surgeries: any[];
  family: any[];
  social: SocialHistory;
  immunizations: any[];
}
