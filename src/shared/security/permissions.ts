export const PERMISSIONS = {
  // Appointments
  APPOINTMENTS_READ: "appointments:read",
  APPOINTMENTS_CREATE: "appointments:create",
  APPOINTMENTS_UPDATE: "appointments:update",
  APPOINTMENTS_DELETE: "appointments:delete",

  // Booking
  BOOKING_READ: "booking:read",
  BOOKING_CREATE: "booking:create",
  BOOKING_UPDATE: "booking:update",
  BOOKING_DELETE: "booking:delete",

  // Records
  RECORDS_READ: "records:read",
  RECORDS_CREATE: "records:create",
  RECORDS_UPDATE: "records:update",
  RECORDS_DELETE: "records:delete",

  // Prescriptions
  PRESCRIPTION_READ: "prescription:read",
  PRESCRIPTION_CREATE: "prescription:create",
  PRESCRIPTION_UPDATE: "prescription:update",
  PRESCRIPTION_DELETE: "prescription:delete",

  // Consultations
  CONSULTATION_READ: "consultation:read",
  CONSULTATION_CREATE: "consultation:create",
  CONSULTATION_UPDATE: "consultation:update",
  CONSULTATION_DELETE: "consultation:delete",
  CONSULTATION_PDF: "consultation:pdf",

  // Messages
  MESSAGES_READ: "messages:read",
  MESSAGES_CREATE: "messages:create",
  MESSAGES_UPDATE: "messages:update",
  MESSAGES_DELETE: "messages:delete",

  // Orders
  ORDERS_READ: "orders:read",
  ORDERS_CREATE: "orders:create",
  ORDERS_UPDATE: "orders:update",
  ORDERS_DELETE: "orders:delete",

  // Profiles
  PROFILE_READ: "profile:read",
  PROFILE_UPDATE: "profile:update",

  // Doctors
  DOCTOR_READ: "doctor:read",
  DOCTOR_UPDATE: "doctor:update",

  // Patients
  PATIENTS_READ: "patients:read",
  PATIENTS_CREATE: "patients:create",
  PATIENTS_UPDATE: "patients:update",
  PATIENTS_DELETE: "patients:delete",

  // Module Access
  PRO_ACCESS: "pro:access",
  ADMIN_ACCESS: "admin:access",

  // Assistants (doctor-managed)
  ASSISTANTS_READ: "assistants:read",
  ASSISTANTS_MANAGE: "assistants:manage",

  // Checkout / Payment
  CHECKOUT_CREATE: "checkout:create",
  PAYMENT_READ: "payment:read",
  PAYMENT_UPDATE: "payment:update",

  // AI Chat
  AI_CHAT_USE: "ai-chat:use",

  // Notifications
  NOTIFICATIONS_READ: "notifications:read",
  NOTIFICATIONS_UPDATE: "notifications:update",
  NOTIFICATIONS_DELETE: "notifications:delete",

  // Favorites (patient bookmarking practitioners)
  FAVORITES_READ: "favorites:read",
  FAVORITES_CREATE: "favorites:create",
  FAVORITES_DELETE: "favorites:delete",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];