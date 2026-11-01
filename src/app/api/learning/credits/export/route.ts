import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/shared/api/api-error";
import { requireAuth } from "@/shared/auth/require-auth";
import { LearningProfileService } from "@/backend/service/learning-profile.service";

/** Credit ledger export for the signed-in practitioner: ?format=csv|pdf&year=2026&type=cme */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req);
    const sp = req.nextUrl.searchParams;
    const filter = { year: Number(sp.get("year")) || null, type: sp.get("type") };
    const name = `learning-credits-${filter.year ?? "all"}`;
    if (sp.get("format") === "pdf") {
      const pdf = await LearningProfileService.creditsPdf(user, filter);
      return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"`, "Cache-Control": "no-store" } });
    }
    const csv = await LearningProfileService.creditsCsv(user, filter);
    return new NextResponse(`﻿${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    console.error("[learning] credits export failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not export your credits. Please try again." }, { status: 500 });
  }
}
