import { NextRequest } from "next/server";
import { getDetailedConsultationsController } from "@/backend/controller/consultation.controller";

export async function GET(req: NextRequest) {
  return getDetailedConsultationsController(req);
}
