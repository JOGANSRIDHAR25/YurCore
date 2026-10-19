/**
 * POST /api/auth/login
 *
 * Thin route handler — delegates to auth controller.
 */
import { NextRequest } from "next/server";
import { login } from "@/backend/controller/auth.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const POST = withErrorHandler((req: NextRequest) => login(req));
