/**
 * GET /api/consultations/[id]/pdf
 *
 * Thin route handler — delegates to consultations controller.
 */
import { NextRequest } from "next/server";
import { generatePdf } from "@/backend/controller/consultations.controller";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    return await generatePdf(req, context);
  } catch (error) {
    console.error("Error generating PDF:", error);
    return new Response("Failed to generate PDF", { status: 500 });
  }
}
