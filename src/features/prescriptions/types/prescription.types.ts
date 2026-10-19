/**
 * Prescription-related types.
 */

export type PrescriptionView = {
  id: string;
  date: string;
  doctorName: string;
  doctorInitials: string;
  specialty: string;
  status: string;
  dietaryAdvice: string;
  lifestyleAdvice: string;
  physicalActivity: string;
  followUpDate: string | null;
  chiefComplaint: string;
  assessment: string;
  items: {
    name: string;
    dose: string;
    frequency: string;
    anupana: string;
    durationDays: number;
    instructions: string;
  }[];
  isDetailed?: boolean;
  _raw?: any;
};
