import { NextRequest, NextResponse } from "next/server";
import { AnalyticsService } from "../service/analytics.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

export async function getAnalyticsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await AnalyticsService.getPractitionerAnalytics(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getAnalyticsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ success: false, error: message }, { status: statusCode });
  }
}
