
import { NextRequest, NextResponse } from "next/server";
import { RegistryService } from "../service/registry.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

export async function getRegistryPatientsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await RegistryService.getMyPatients(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getRegistryPatientsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: statusCode });
  }
}

export async function getRegistryPatientFamilyController(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await requireAuth(req);
    const { id } = await context.params;
    const data = await RegistryService.getPatientFamily(authUser, id);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getRegistryPatientFamilyController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: statusCode });
  }
}