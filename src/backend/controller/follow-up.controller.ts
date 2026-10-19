import { NextRequest, NextResponse } from "next/server";
import { FollowUpService } from "../service/follow-up.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getFollowUpController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await FollowUpService.getFollowUps(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getFollowUpController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function updateFollowUpController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();

    if (body.action === "nudge") {
      await FollowUpService.nudgeFollowUp(authUser, body.followUpId);
      return NextResponse.json({ success: true, message: "Nudge sent successfully" });
    }

    if (body.action === "updateDate") {
      await FollowUpService.updateFollowUpDate(authUser, body.followUpId, body.recommendedDate);
      return NextResponse.json({ success: true, message: "Follow-up date updated successfully" });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (error: unknown) {
    console.error("updateFollowUpController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}
