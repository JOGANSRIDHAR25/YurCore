import { NextRequest } from "next/server";
import { getAuthFromRequest as getRawAuth } from "@/backend/middleware/auth.middleware";
import { AuthUser } from "./auth.types";
import { Role, ROLES } from "../security/roles";
import { ROLE_PERMISSIONS } from "../security/role-permissions";
import { AuthenticationError } from "@/shared/api/api-error";

/**
 * Extracts and strictly validates the authenticated user from the request.
 * Returns the AuthUser object including their resolved permissions.
 * Throws AuthenticationError if not logged in.
 */
export async function getAuthUser(req: NextRequest): Promise<AuthUser> {
  const rawAuth = await getRawAuth(req);
  
  if (!rawAuth || !rawAuth.id || !rawAuth.role) {
    throw new AuthenticationError();
  }

  let role = rawAuth.role as Role;
  if ((role as string) === "practitioner") {
    role = ROLES.DOCTOR;
  }
  const permissions = ROLE_PERMISSIONS[role] || [];

  return {
    id: rawAuth.id,
    email: rawAuth.email || "",
    role,
    name: rawAuth.name,
    permissions,
  };
}

/**
 * Safe version that returns null instead of throwing, useful for optional auth.
 */
export async function getOptionalAuthUser(req: NextRequest): Promise<AuthUser | null> {
  try {
    return await getAuthUser(req);
  } catch (err) {
    if (err instanceof AuthenticationError) return null;
    throw err;
  }
}
