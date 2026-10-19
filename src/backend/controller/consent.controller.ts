import { NextRequest, NextResponse } from "next/server";
import { ConsentService } from "../service/consent.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";
import { auditRequest } from "@/shared/security/audit-log";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getConsentController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await ConsentService.getConsentGrants(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getConsentController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: statusCode }
    );
  }
}

export async function revokeConsentController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    await ConsentService.revokeConsent(authUser, id);
    auditRequest(req, authUser, { action: "revoke_consent", module: "consents", recordId: id });
    return NextResponse.json({ success: true, message: "Consent revoked successfully" });
  } catch (error: unknown) {
    console.error("revokeConsentController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json(
      { success: false, error: getErrorMessage(error) },
      { status: statusCode }
    );
  }
}
