import "server-only";

import { NextRequest } from "next/server";

/**
 * Validates CSRF for state-changing requests.
 * In a standard Next.js application using HttpOnly Lax/Strict cookies,
 * checking that the Origin matches the Host is a highly effective, standard check.
 * This helper verifies that the Origin header matches the host site URL.
 */
export function verifyCsrf(req: NextRequest): void {
  const method = req.method;
  const stateChangingMethods = ["POST", "PUT", "PATCH", "DELETE"];

  if (!stateChangingMethods.includes(method)) {
    return; // Safe methods do not require CSRF verification
  }

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  const referer = req.headers.get("referer");

  // Derive target origin from host header
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const expectedOrigin = `${proto}://${host}`;

  if (origin) {
    if (origin !== expectedOrigin) {
      throw new Error(`CSRF validation failed: Origin mismatch. Got: ${origin}, expected: ${expectedOrigin}`);
    }
  } else if (referer) {
    // Fallback to referer check if origin is missing (some old browsers or proxies)
    const refererUrl = new URL(referer);
    const refererOrigin = `${refererUrl.protocol}//${refererUrl.host}`;
    if (refererOrigin !== expectedOrigin) {
      throw new Error(`CSRF validation failed: Referer mismatch. Got: ${refererOrigin}, expected: ${expectedOrigin}`);
    }
  } else {
    // If both origin and referer are missing on a state-changing method, reject
    throw new Error("CSRF validation failed: Missing both Origin and Referer headers");
  }
}
