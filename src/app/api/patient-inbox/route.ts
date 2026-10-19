import { NextRequest } from "next/server";
import { getPatientInboxController } from "@/backend/controller/patient-inbox.controller";

export async function GET(req: NextRequest) {
  return getPatientInboxController(req);
}
