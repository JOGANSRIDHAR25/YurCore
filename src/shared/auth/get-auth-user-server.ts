import "server-only";
import { cookies } from "next/headers";
import { verifyToken } from "@/lib/jwt";
import { AuthUser } from "./auth.types";
import { Role } from "../security/roles";
import { ROLE_PERMISSIONS } from "../security/role-permissions";
import { AuthenticationError } from "@/shared/api/api-error";

/**
 * Cookie-based auth resolution for Server Components / Server Actions,
 * where there is no NextRequest to pass to getAuthUser(). Reads the same
 * access_token cookie that auth.middleware.ts reads for API routes.
 */
export async function getAuthUserFromCookies(): Promise<AuthUser> {
  const cookieStore = await cookies();
  const token = cookieStore.get("access_token")?.value;
  if (!token) {
    throw new AuthenticationError();
  }

  const payload = await verifyToken(token);
  if (!payload || payload.type !== "access") {
    throw new AuthenticationError();
  }

  const role = payload.role as Role;
  const permissions = ROLE_PERMISSIONS[role] || [];

  return {
    id: payload.id,
    email: payload.email || "",
    role,
    name: payload.name,
    permissions,
  };
}
