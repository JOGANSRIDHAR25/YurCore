/**
 * GET + POST /api/slots
 *
 * Thin route handler — delegates to slots controller.
 */
import { NextRequest } from "next/server";
import { getSlots, createSlots } from "@/backend/controller/slots.controller";
import { withErrorHandler } from "@/backend/middleware/error.middleware";

export const GET = withErrorHandler((req: NextRequest) => getSlots(req));
export const POST = withErrorHandler((req: NextRequest) => createSlots(req));
