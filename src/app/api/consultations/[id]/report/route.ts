import { NextRequest } from "next/server";
import { getConsultationReportController } from "@/backend/controller/consultation.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  return getConsultationReportController(req, context);
}
