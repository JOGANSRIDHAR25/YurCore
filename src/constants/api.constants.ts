/**
 * API-related constants.
 */

// HTTP Status Codes (commonly used)
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// API route paths
export const API_ROUTES = {
  AUTH_LOGIN: "/api/auth/login",
  AUTH_JWT_SIGN: "/api/auth/jwt-sign",
  AI_CHAT: "/api/ai-chat",
  ONBOARDING_PATIENT: "/api/onboarding/patient",
  SLOTS: "/api/slots",
  CONSULTATION_PDF: (id: string) => `/api/consultations/${id}/pdf`,
} as const;
