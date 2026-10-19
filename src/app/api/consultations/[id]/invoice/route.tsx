/**
 * GET /api/consultations/[id]/invoice
 *
 * Thin route handler — delegates to consultations controller.
 */
import { NextRequest } from "next/server";
import { generateInvoicePdf } from "@/backend/controller/consultations.controller";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        return await generateInvoicePdf(req, context);
    } catch (error) {
        console.error("Error generating invoice PDF:", error);
        return new Response("Failed to generate invoice PDF", { status: 500 });
    }
}