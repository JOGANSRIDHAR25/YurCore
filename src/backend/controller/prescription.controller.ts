import { NextRequest, NextResponse } from "next/server";
import { PrescriptionService } from "../service/prescription.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { writeAuditLog } from "@/shared/security/audit-log";
import { getRequestIp, getRequestUserAgent } from "@/shared/security/request-meta";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getPrescriptionController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await PrescriptionService.getPrescriptions(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getPrescriptionController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function deletePrescriptionController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const { patientId } = await PrescriptionService.deletePrescription(authUser, id);
    await writeAuditLog({
      userId: authUser.id,
      role: authUser.role,
      action: "delete_prescription",
      module: "prescriptions",
      recordId: id,
      patientId,
      ipAddress: getRequestIp(req),
      userAgent: getRequestUserAgent(req),
    });
    return NextResponse.json({ success: true, message: "Prescription deleted successfully" });
  } catch (error: unknown) {
    console.error("deletePrescriptionController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}
