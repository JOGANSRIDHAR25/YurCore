/**
 * GET /api/auth/check-account?email=
 * Thin route handler — delegates to auth controller.
 */
import { NextRequest } from "next/server";
import { checkAccount } from "@/backend/controller/auth.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler((req: NextRequest) => checkAccount(req));