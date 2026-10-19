/**
 * Authentication middleware for API routes.
 *
 * Provides helper functions for verifying JWT tokens
 * inside API route handlers.
 */
import { NextRequest } from "next/server";
import { verifyToken, TokenPayload } from "@/lib/jwt";

export type AuthInfo = TokenPayload;

/**
 * Extract auth info from the request cookie (access_token).
 * This function returns a Promise because JWT verification is async.
 * Returns null if no valid auth cookie is present or token is expired.
 */
export async function getAuthFromRequest(req: NextRequest): Promise<AuthInfo | null> {
  const token = req.cookies.get("access_token")?.value;
  if (token) {
    const payload = await verifyToken(token);
    if (payload && payload.type === "access") return payload;
  }

  // Fallback to refresh_token if access_token is expired or missing
  const refreshToken = req.cookies.get("refresh_token")?.value;
  if (refreshToken) {
    const refreshPayload = await verifyToken(refreshToken);
    if (refreshPayload && refreshPayload.type === "refresh") {
      return {
        id: refreshPayload.id,
        email: refreshPayload.email,
        phone: refreshPayload.phone,
        role: refreshPayload.role,
        name: refreshPayload.name,
      };
    }
  }

  return null;
}

/**
 * Extract and verify a JWT Bearer token from the Authorization header.
 * Useful for mobile apps or external API clients that don't use cookies.
 * Returns the decoded payload or null.
 */
export async function verifyBearerToken(req: NextRequest): Promise<AuthInfo | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  const token = authHeader.slice(7);
  const payload = await verifyToken(token);
  
  if (!payload || payload.type !== "access") return null;
  return payload;
}

/**
 * Require authentication — throws if not authenticated.
 */
export async function requireAuth(req: NextRequest): Promise<AuthInfo> {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    throw new Error("Unauthorized");
  }
  return auth;
}
