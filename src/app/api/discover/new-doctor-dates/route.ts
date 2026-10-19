import { NextRequest } from "next/server";
import { getNewDoctorAvailableDatesController } from "@/backend/controller/discover.controller";

export async function GET(req: NextRequest) {
  return getNewDoctorAvailableDatesController(req);
}
