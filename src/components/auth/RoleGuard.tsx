"use client";

import { useAuth } from "@/contexts/auth-context";
import { Role } from "@/shared/security/roles";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface RoleGuardProps {
  children: React.ReactNode;
  allowedRoles: Role | Role[];
  redirectTo?: string;
  fallback?: React.ReactNode;
}

export function RoleGuard({ children, allowedRoles, redirectTo, fallback = null }: RoleGuardProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isAllowed, setIsAllowed] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
      if (roles.includes(user.role as Role)) {
        setIsAllowed(true);
      } else if (redirectTo) {
        router.push(redirectTo);
      }
    }
  }, [user, loading, allowedRoles, router, redirectTo]);

  if (loading) {
    return null; // Or a subtle loading spinner
  }

  if (!isAllowed) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
