import { NextRequest } from "next/server";
import { getAuthUser } from "./get-auth-user";
import { AuthUser } from "./auth.types";

/**
 * Requires a valid authenticated user.
 * Wraps getAuthUser for semantic clarity.
 */
export async function requireAuth(req: NextRequest): Promise<AuthUser> {
  return await getAuthUser(req);
}
