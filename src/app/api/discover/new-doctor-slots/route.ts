import { NextRequest } from "next/server";
import { getNewDoctorSlotsController } from "@/backend/controller/discover.controller";

export async function GET(req: NextRequest) {
  return getNewDoctorSlotsController(req);
}
