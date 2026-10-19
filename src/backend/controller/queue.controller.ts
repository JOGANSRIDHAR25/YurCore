import { NextRequest, NextResponse } from "next/server";
import { QueueService } from "../service/queue.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getTodayQueueController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || undefined;
    const data = await QueueService.getTodayQueue(authUser, date);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getTodayQueueController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getMonthCountsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = parseInt(searchParams.get("year") || String(now.getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(now.getMonth() + 1), 10);
    const data = await QueueService.getMonthCounts(authUser, year, month);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getMonthCountsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function getUpcomingAppointmentsController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const data = await QueueService.getUpcomingAppointments(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getUpcomingAppointmentsController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}