/**
 * Application-wide constants.
 */

// AYUSH discipline metadata for the UI
export const DISCIPLINES = [
  {
    id: "Ayurveda",
    label: "Ayurveda",
    icon: "🌿",
    tagline: "Herbal remedies & body constitution balance",
    color: "oklch(0.29 0.09 158)",
    bg: "bg-emerald-50",
    count: "1,240+",
  },
  {
    id: "Yoga",
    label: "Yoga",
    icon: "🧘",
    tagline: "Therapeutic yoga & pranayama sessions",
    color: "oklch(0.52 0.06 158)",
    bg: "bg-teal-50",
    count: "830+",
  },
  {
    id: "Naturopathy",
    label: "Naturopathy",
    icon: "☀️",
    tagline: "Natural healing & lifestyle correction",
    color: "oklch(0.78 0.12 87)",
    bg: "bg-amber-50",
    count: "460+",
  },
  {
    id: "Unani",
    label: "Unani",
    icon: "⚗️",
    tagline: "Greco-Arabic medicine & humoral balance",
    color: "oklch(0.64 0.10 43)",
    bg: "bg-orange-50",
    count: "310+",
  },
  {
    id: "Siddha",
    label: "Siddha",
    icon: "🔮",
    tagline: "South Indian classical medicine tradition",
    color: "oklch(0.48 0.07 280)",
    bg: "bg-purple-50",
    count: "220+",
  },
  {
    id: "Homeopathy",
    label: "Homeopathy",
    icon: "💧",
    tagline: "Potentised micro-dose remedies",
    color: "oklch(0.48 0.09 220)",
    bg: "bg-blue-50",
    count: "680+",
  },
] as const;

// Auth
export const AUTH_COOKIE_NAME = "mv_auth";
export const AUTH_STORAGE_KEY = "mv_user";
export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Roles
export const ROLES = {
  PATIENT: "patient",
  PRACTITIONER: "practitioner",
  DOCTOR: "doctor",
  ADMIN: "admin",
  INTERN_STAFF: "intern_staff",
} as const;
