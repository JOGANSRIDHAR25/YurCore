import { NextRequest, NextResponse } from "next/server";

import { verifyToken } from "@/lib/jwt";
import type { TokenPayload } from "@/lib/jwt";
import { applySecurityHeaders } from "@/shared/security/security-headers";

import {
  DOCTOR_ROUTES,
  PATIENT_ROUTES,
  SHARED_AUTHENTICATED_ROUTES,
} from "@/shared/config/routes";

type AuthResult = {
  user: TokenPayload | null;
  hasToken: boolean;
  verificationFailed: boolean;
};

async function getAuth(
  req: NextRequest,
): Promise<AuthResult> {
  const token = req.cookies.get("access_token")?.value;

  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload && payload.type === "access") {
        return {
          user: payload,
          hasToken: true,
          verificationFailed: false,
        };
      }
    } catch {}
  }

  // Fallback to refresh_token if access_token is missing or expired
  const refreshToken = req.cookies.get("refresh_token")?.value;
  if (refreshToken) {
    try {
      const refreshPayload = await verifyToken(refreshToken);
      if (refreshPayload && refreshPayload.type === "refresh") {
        return {
          user: {
            id: refreshPayload.id,
            email: refreshPayload.email,
            phone: refreshPayload.phone,
            role: refreshPayload.role,
            name: refreshPayload.name,
          },
          hasToken: true,
          verificationFailed: false,
        };
      }
    } catch {}
  }

  return {
    user: null,
    hasToken: false,
    verificationFailed: false,
  };
}

function matchesRoute(
  pathname: string,
  routes: readonly string[],
): boolean {
  return routes.some(
    (route) =>
      pathname === route ||
      pathname.startsWith(`${route}/`),
  );
}

function isDoctorOrPractitioner(
  auth: TokenPayload,
): boolean {
  return (
    auth.role === "doctor" ||
    auth.role === "practitioner" ||
    auth.role === "assistant"
  );
}

function isAdminOrIntern(
  auth: TokenPayload,
): boolean {
  return (
    auth.role === "admin" ||
    auth.role === "super_admin"
  );
}

function getDashboardPath(
  auth: TokenPayload,
): string {
  if (isDoctorOrPractitioner(auth)) {
    return "/pro";
  }

  if (isAdminOrIntern(auth)) {
    return "/admin/dashboard";
  }

  return "/";
}

async function handleMiddleware(
  req: NextRequest,
): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  const authResult = await getAuth(req);
  const auth = authResult.user;

  /*
   * Important:
   * Do not redirect to /login when authentication
   * verification encounters an error.
   */
  if (authResult.verificationFailed) {
    console.warn(
      `[middleware] Authentication verification failed for ${pathname}. Allowing the request.`,
    );

    return NextResponse.next();
  }

  /*
   * Login / Onboarding pages:
   * Redirect only when a valid authenticated user exists.
   */
  if (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/onboarding" ||
    pathname.startsWith("/onboarding/")
  ) {
    if (auth) {
      return NextResponse.redirect(
        new URL(getDashboardPath(auth), req.url),
      );
    }

    return NextResponse.next();
  }

  /*
   * Admin routes
   */
  if (
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  ) {
    if (pathname === "/admin") {
      if (auth && isAdminOrIntern(auth)) {
        return NextResponse.redirect(
          new URL("/admin/dashboard", req.url),
        );
      }

      return NextResponse.next();
    }

    /*
     * No automatic login redirect.
     * Allow the page to handle missing authentication.
     */
    if (!auth) {
      return NextResponse.next();
    }

    if (!isAdminOrIntern(auth)) {
      return NextResponse.redirect(
        new URL(getDashboardPath(auth), req.url),
      );
    }

    if (auth.role === "intern_staff") {
      const allowedPaths = [
        "/admin/medicines",
        "/admin/hospitals",
        "/admin/content",
      ];

      const isAllowed = matchesRoute(
        pathname,
        allowedPaths,
      );

      if (!isAllowed) {
        return NextResponse.redirect(
          new URL("/admin/medicines", req.url),
        );
      }
    }

    return NextResponse.next();
  }

  /*
   * Shared authenticated routes:
   * /profile
   * /profile/abha
   * /profile/family
   * /ai-chat
   *
   * No automatic redirect to /login.
   */
  const isSharedRoute = matchesRoute(
    pathname,
    SHARED_AUTHENTICATED_ROUTES,
  );

  if (isSharedRoute) {
    return NextResponse.next();
  }

  /*
   * Practitioner routes
   */
  const isDoctorRoute = matchesRoute(
    pathname,
    DOCTOR_ROUTES,
  );

  if (isDoctorRoute) {
    /*
     * No automatic login redirect.
     */
    if (!auth) {
      return NextResponse.next();
    }

    if (!isDoctorOrPractitioner(auth)) {
      return NextResponse.redirect(
        new URL("/", req.url),
      );
    }

    return NextResponse.next();
  }

  /*
   * Patient routes
   */
  const isPatientRoute =
    pathname === "/" ||
    matchesRoute(pathname, PATIENT_ROUTES);

  if (isPatientRoute) {
    /*
     * Root "/": redirect unauthenticated users to /login.
     */
    if (pathname === "/" && !auth) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    if (!auth) {
      return NextResponse.next();
    }

    if (auth.role !== "patient") {
      return NextResponse.redirect(
        new URL(getDashboardPath(auth), req.url),
      );
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export async function middleware(
  req: NextRequest,
): Promise<NextResponse> {
  const response = await handleMiddleware(req);

  return applySecurityHeaders(response);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};