/**
 * POST /api/auth/logout
 * Thin route handler — delegates to auth controller.
 */
import { NextRequest } from "next/server";
import { logout } from "@/backend/controller/auth.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const POST = withErrorHandler((req: NextRequest) => logout());
