export const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  DOCTOR: "doctor",     // Can map to "practitioner"
  ASSISTANT: "assistant", // Doctor-delegated access, shares the linked doctor's /pro data
  PATIENT: "patient",
  STAFF: "staff",       // E.g. intern_staff
  PHARMACY: "pharmacy",
  GUEST: "guest",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];