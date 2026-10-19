import { AuthUser } from "./auth.types";
import { Permission } from "../security/permissions";
import { ForbiddenError } from "@/shared/api/api-error";

/**
 * Checks if the authenticated user has the required permission.
 * Throws ForbiddenError if the permission is missing.
 */
export function requirePermission(user: AuthUser, requiredPermissions: Permission | Permission[]): void {
  const permissionsToCheck = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  
  const hasPermission = permissionsToCheck.every(permission => user.permissions.includes(permission));
  
  if (!hasPermission) {
    throw new ForbiddenError(`Insufficient permissions. Required: ${permissionsToCheck.join(", ")}`);
  }
}
