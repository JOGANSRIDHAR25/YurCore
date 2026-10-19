import "server-only";

import { SignJWT, jwtVerify } from "jose";
import { serverEnv } from "@/shared/config/env";

const NAV_SESSION_SECRET = new TextEncoder().encode(
  serverEnv.JWT_SECRET || "meyveda-secret-key-at-least-32-chars-long",
);

/**
 * Keys of every in-app navigation context. Adding a new one here is what
 * makes it valid to POST/GET — this is the allowlist that keeps the cookie
 * name (and JWT audience) from being attacker-controlled.
 */
export const NAV_CONTEXT_KEYS = [
  "patient",
  "emr",
  "prescribe",
  "prescriptions",
  "video",
  "records-family",
  "doctor",
] as const;

export type NavContextKey = (typeof NAV_CONTEXT_KEYS)[number];

export function isNavContextKey(value: unknown): value is NavContextKey {
  return (
    typeof value === "string" &&
    (NAV_CONTEXT_KEYS as readonly string[]).includes(value)
  );
}

export function navContextCookieName(key: NavContextKey): string {
  return `nav_${key}`;
}

/**
 * Signs an arbitrary small payload (ids the next page needs — a patient id,
 * an appointment id, etc.) into a short-lived JWT so it can travel as an
 * httpOnly cookie instead of a URL query/path parameter. Scoped to the
 * authenticated user's id so a copied/leaked cookie can't be replayed under
 * a different session.
 */
export async function signNavContext(
  userId: string,
  data: Record<string, unknown>,
): Promise<string> {
  return await new SignJWT({ userId, data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h")
    .sign(NAV_SESSION_SECRET);
}

export async function verifyNavContext(
  token: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const { payload } = await jwtVerify(token, NAV_SESSION_SECRET);
    const claims = payload as unknown as { userId: string; data: Record<string, unknown> };

    if (claims.userId !== userId) {
      return null;
    }

    return claims.data;
  } catch {
    return null;
  }
}
