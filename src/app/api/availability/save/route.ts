import { NextRequest } from "next/server";
import { saveAvailabilityChangeController } from "@/backend/controller/availability.controller";

export async function POST(req: NextRequest) {
  return saveAvailabilityChangeController(req);
}
