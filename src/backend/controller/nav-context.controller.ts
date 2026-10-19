import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import {
  isNavContextKey,
  navContextCookieName,
  signNavContext,
  verifyNavContext,
} from "@/lib/nav-session";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

function getStatusCode(error: unknown): number {
  if (error instanceof AppError) return error.statusCode;
  return 400;
}

/**
 * Generic short-lived, httpOnly, per-user navigation context. Lets a page
 * hand the next page an id (patient, appointment, etc.) without putting it
 * in the URL — the sender POSTs it here, then navigates to a clean route
 * that reads it back with GET.
 */
export class NavContextController {
  static async create(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);
      const body = (await request.json()) as { key?: string; data?: Record<string, unknown> };

      if (!isNavContextKey(body.key)) {
        throw new AppError("Invalid navigation context key", 400);
      }

      if (!body.data || typeof body.data !== "object") {
        throw new AppError("data is required", 400);
      }

      const token = await signNavContext(authUser.id, body.data);
      const cookieStore = await cookies();

      cookieStore.set(navContextCookieName(body.key), token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 2 * 60 * 60,
      });

      return NextResponse.json({ success: true });
    } catch (error: unknown) {
      console.error("NavContextController.create error:", error);
      return NextResponse.json(
        { success: false, error: getErrorMessage(error) },
        { status: getStatusCode(error) },
      );
    }
  }

  static async get(request: NextRequest) {
    try {
      const authUser = await requireAuth(request);
      const key = request.nextUrl.searchParams.get("key");

      if (!isNavContextKey(key)) {
        throw new AppError("Invalid navigation context key", 400);
      }

      const cookieStore = await cookies();
      const token = cookieStore.get(navContextCookieName(key))?.value;

      // No token (page opened directly, not deep-linked) or an expired one
      // is the normal steady state, not a server error — respond 200 with
      // null data so callers can treat it as "nothing set" without every
      // direct page load logging a spurious 404.
      const data = token ? await verifyNavContext(token, authUser.id) : null;

      return NextResponse.json({ success: true, data });
    } catch (error: unknown) {
      console.error("NavContextController.get error:", error);
      return NextResponse.json(
        { success: false, error: getErrorMessage(error) },
        { status: getStatusCode(error) },
      );
    }
  }
}
