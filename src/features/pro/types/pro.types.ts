/**
 * Practitioner portal (Pro) types.
 */
import type { QueueStatus } from "@/types/common.types";
import type { MissedBy } from "@/shared/appointments/attendance";

export type ScheduleRow = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  breaks: { start: string; end: string }[];
  opTimings: { start: string; end: string }[];
  clinicId: string | null;
  isActive: boolean;
};

export type FollowUpRow = {
  id: string;
  patientName: string;
  patientInitials: string;
  recommendedDate: string;
  isBooked: boolean;
  nudgeSent: boolean;
  patientAge: number;
};

export type AnalyticsData = {
  totalConsultations: number;
  totalPatients: number;
  completedThisMonth: number;
  totalRevenue: number;
  revenueThisMonth: number;
  avgRating: number;
  totalRatings: number;
  avgDuration: number;
  monthlyConsults: { month: string; count: number }[];
};

export type QueuePatient = {
  id: string;
  appointmentId: string;
  name: string;
  relationship?: string | null;
  age: number;
  time: string;
  mode: "video" | "clinic";
  status: QueueStatus;
  /** For a missed appointment: who didn't show up. */
  missedBy?: MissedBy | null;
  /** Missed in-clinic visit where the patient had arrived but left before being seen. */
  patientLeft?: boolean;
  waitMins: number;
  reason: string;
  abha: string | null;
};