import { NextRequest } from "next/server";
import { saveCompleteConsultationController } from "@/backend/controller/consultation.controller";

export async function POST(req: NextRequest) {
  return saveCompleteConsultationController(req);
}
