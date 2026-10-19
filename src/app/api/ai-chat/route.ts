/**
 * GET + POST /api/ai-chat
 *
 * Thin route handler — delegates to AI chat controller.
 */
import { NextRequest } from "next/server";
import { getStatus, handleAction } from "@/backend/controller/ai-chat.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler(() => getStatus());
export const POST = withErrorHandler((req: NextRequest) => handleAction(req));
