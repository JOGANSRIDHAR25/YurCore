import { NextRequest, NextResponse } from "next/server";
import { ProInboxService } from "../service/pro-inbox.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

export async function getProInboxController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await ProInboxService.getInbox(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getProInboxController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: statusCode });
  }
}
