"use client";

import { useAuth } from "@/contexts/auth-context";
import { Permission } from "@/shared/security/permissions";
import { ROLE_PERMISSIONS } from "@/shared/security/role-permissions";
import { Role } from "@/shared/security/roles";
import { useEffect, useState } from "react";

interface PermissionGuardProps {
  children: React.ReactNode;
  requiredPermissions: Permission | Permission[];
  fallback?: React.ReactNode;
}

export function PermissionGuard({ children, requiredPermissions, fallback = null }: PermissionGuardProps) {
  const { user, loading } = useAuth();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const permissionsToCheck = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
      
      // Resolve user's permissions based on their role
      const userPermissions = ROLE_PERMISSIONS[user.role as Role] || [];
      
      const hasPermission = permissionsToCheck.every(permission => userPermissions.includes(permission));
      
      setIsAllowed(hasPermission);
    }
  }, [user, loading, requiredPermissions]);

  if (loading || !isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
