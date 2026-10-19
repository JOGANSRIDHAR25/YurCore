export const DOCTOR_ROUTES = [
  "/pro",
];

export const PATIENT_ROUTES = [
  "/discover",
  "/records",
  "/apothecary",
  "/doctor",
  "/booking",
  "/checkout",
  "/prescription",
  "/consent",
  "/orders",
  "/post-consult",
  "/appointments",
  "/dinacharya",
];

export const SHARED_AUTHENTICATED_ROUTES = [
  "/profile",
  "/ai-chat",
  "/notifications",
  "/messages",
  // Both the patient and the practitioner join the same video
  // consultation, so these can't be gated to a single role.
  "/consult",
  "/waiting-room",
];