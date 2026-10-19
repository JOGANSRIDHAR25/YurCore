import { NextRequest, NextResponse } from "next/server";
import { ConsultationService } from "../service/consultation.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getDetailedConsultationsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const familyMemberId = req.nextUrl.searchParams.get("familyMemberId");
    const data = await ConsultationService.getDetailedConsultations(authUser, familyMemberId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getDetailedConsultationsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getPatientRecordStatsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await ConsultationService.getPatientRecordStats(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getPatientRecordStatsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getConsultationReportController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const data = await ConsultationService.getConsultationReportData(authUser, id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getConsultationReportController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getConsultationInvoiceController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const data = await ConsultationService.getConsultationInvoiceData(authUser, id);
    return NextResponse.json({ success: true, data: data.invoice });
  } catch (error: unknown) {
    console.error("getConsultationInvoiceController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function saveCompleteConsultationController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();
    const result = await ConsultationService.saveCompleteConsultation(authUser, body);

    // Records who actually prescribed the medicines — the logged-in doctor, or
    // an assistant acting on the doctor's behalf (authUser.role distinguishes them).
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "create_prescription",
      module: "prescriptions",
      recordId: result.prescriptionId,
      patientId: result.patientId,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        consultationId: result.consultationId,
        medicines: (body.medicines || []).map((m: any) => ({ name: m.name, dose: m.dose, frequency: m.frequency, duration: m.duration })),
        diagnosis: body.diagnosis,
      },
    });

    // The same save also writes the patient's clinical record (EMR note: chief
    // complaint, diagnosis, assessment, plan) and updates their height/weight/
    // blood group/address — logged separately so it shows under "patients",
    // not hidden inside the prescription event.
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "update_patient_record",
      module: "patients",
      recordId: result.patientId,
      patientId: result.patientId,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
      metadata: {
        consultationId: result.consultationId,
        chiefComplaints: body.chiefComplaints,
        diagnosis: body.diagnosis,
        diseaseStage: body.diseaseStage,
        severity: body.severity,
        dosha: body.dosha,
        vikriti: body.vikriti,
        vitals: body.vitals,
        bloodGroup: body.bloodGroup,
        address: body.address,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("saveCompleteConsultationController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getUpcomingCallsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await ConsultationService.getUpcomingCalls(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getUpcomingCallsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getPatientIntakeDetailsController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const appointmentId = req.nextUrl.searchParams.get("appointmentId");
    const data = await ConsultationService.getPatientIntakeDetails(authUser, id, appointmentId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getPatientIntakeDetailsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}