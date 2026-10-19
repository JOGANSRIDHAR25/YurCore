/**
 * POST /api/consultations/[id]/invoice/send
 *
 * Thin route handler — delegates to consultations controller.
 */
import { NextRequest } from "next/server";
import { sendInvoiceEmailController } from "@/backend/controller/consultations.controller";

export async function POST(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    return sendInvoiceEmailController(req, context);
}
