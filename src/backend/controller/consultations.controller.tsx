/**
 * Consultations controller — handles PDF generation.
 */
import { SITE_NAME } from "@/shared/config/site";
import { NextRequest, NextResponse } from "next/server";
import { renderToStream } from "@react-pdf/renderer";
import { ConsultationPdfDocument } from "@/components/consultation-report/ConsultationPdfDocument";
import { InvoicePdfDocument } from "@/components/consultation-report/InvoicePdfDocument";
import { ConsultationService } from "../service/consultation.service";
import { sendInvoiceEmail } from "../service/consultation-email.helper";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { auditRequest } from "@/shared/security/audit-log";

/**
 * GET /api/consultations/[id]/pdf — Generate consultation PDF.
 */
export async function generatePdf(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // 1. Authenticate and fetch consultation data (ownership-checked)
  let data: any;
  try {
    const authUser = await requireAuth(req);
    data = await ConsultationService.getConsultationReportData(authUser, id);
    // Access to a clinical record is itself an auditable event.
    auditRequest(req, authUser, {
      action: "download_consultation_report",
      module: "health_records",
      recordId: id,
      patientId: data?.patient_id ?? undefined,
    });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to load consultation";
    return new Response(message, { status: statusCode });
  }

  // 2. Render PDF to Node stream
  const pdfStream = await renderToStream(<ConsultationPdfDocument data={data} />);

  // 3. Convert Node stream to Web ReadableStream for Next.js App Router Response
  const webStream = new ReadableStream({
    start(controller) {
      pdfStream.on("data", (chunk) => controller.enqueue(chunk));
      pdfStream.on("end", () => controller.close());
      pdfStream.on("error", (err) => controller.error(err));
    },
  });

  // 4. Construct safe filename
  const patientName =
    (data.patients as any)?.full_name?.replace(/[^a-zA-Z0-9]/g, "_") || "Patient";
  const dateStr = data.created_at
    ? new Date(data.created_at).toISOString().split("T")[0]
    : "Date";
  const filename = `${SITE_NAME}_Consultation_${patientName}_${dateStr}.pdf`;

  // 5. Return PDF
  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

/**
 * GET /api/consultations/[id]/invoice — Generate bill invoice PDF.
 */
export async function generateInvoicePdf(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let data: any;
  try {
    const authUser = await requireAuth(req);
    data = await ConsultationService.getConsultationInvoiceData(authUser, id);
    auditRequest(req, authUser, {
      action: "download_invoice",
      module: "health_records",
      recordId: id,
      patientId: data?.patient_id ?? undefined,
    });
  } catch (error: unknown) {
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to load consultation";
    return new Response(message, { status: statusCode });
  }

  const pdfStream = await renderToStream(<InvoicePdfDocument data={data} />);

  const webStream = new ReadableStream({
    start(controller) {
      pdfStream.on("data", (chunk) => controller.enqueue(chunk));
      pdfStream.on("end", () => controller.close());
      pdfStream.on("error", (err) => controller.error(err));
    },
  });

  const patientName =
    (data.patients as any)?.full_name?.replace(/[^a-zA-Z0-9]/g, "_") || "Patient";
  const dateStr = data.created_at
    ? new Date(data.created_at).toISOString().split("T")[0]
    : "Date";
  const filename = `${SITE_NAME}_Invoice_${patientName}_${dateStr}.pdf`;

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}

/**
 * POST /api/consultations/[id]/invoice/send — Email the invoice PDF to the patient.
 */
export async function sendInvoiceEmailController(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const authUser = await requireAuth(req);
    const data = await ConsultationService.getConsultationInvoiceData(authUser, id);
    await sendInvoiceEmail(data);
    return NextResponse.json({ success: true, message: "Invoice email sent" });
  } catch (error: unknown) {
    console.error("sendInvoiceEmailController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Failed to send invoice email";
    return NextResponse.json({ success: false, error: message }, { status: statusCode });
  }
}