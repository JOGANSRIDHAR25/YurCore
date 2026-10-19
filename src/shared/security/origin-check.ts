import "server-only";

import { NextRequest } from "next/server";
import { SECURITY_CONFIG } from "./config";

/**
 * Verifies that the Origin and Host headers match the allowed origins config.
 * Rejects cross-origin state-changing actions.
 */
export function verifyOrigin(req: NextRequest): void {
  const origin = req.headers.get("origin");
  if (!origin) {
    return; // Non-CORS requests (e.g. standard browser navigations or server-to-server) might not send Origin.
  }

  const allowedOrigins = SECURITY_CONFIG.cors.allowedOrigins as unknown as string[];

  // Normalize origin values (strip trailing slashes)
  const cleanOrigin = origin.replace(/\/$/, "");
  const isAllowed = allowedOrigins.some((allowed) => allowed.replace(/\/$/, "") === cleanOrigin);

  if (!isAllowed) {
    throw new Error(`CORS validation failed: Origin "${origin}" is not allowed.`);
  }
}
