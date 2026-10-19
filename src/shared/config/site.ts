/**
 * Global site / brand configuration.
 * Change the website name here and it is reflected everywhere: pages, metadata,
 * emails, PDFs and download filenames. Never hard-code the brand name elsewhere.
 *
 * Safe to import from both client and server code (no secrets, no env access).
 * Supabase edge functions run on Deno and cannot import from src/, so they read
 * the same value from supabase/functions/_shared/site.ts — keep the two in sync.
 */

export const SITE_NAME = "YurCore";

/** The name split for the two-tone logo (first part green, second part copper). Must join to SITE_NAME. */
export const SITE_NAME_PARTS = ["Yur", "Core"] as const;

/** Single letter shown in the square logo badge. */
export const SITE_INITIAL = SITE_NAME.charAt(0);

/** Short code used as the prefix of order numbers (e.g. YC-260105-AB12) and as fallback initials. */
export const SITE_SHORT_CODE = "YC";

export const siteConfig = {
  name: SITE_NAME,
  tagline: "Reinvent You",
  supportEmail: "support@meyveda.in",
  legalEmail: "legal@meyveda.in",
} as const;
