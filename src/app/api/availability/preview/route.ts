import { NextRequest } from "next/server";
import { previewAvailabilityChangeController } from "@/backend/controller/availability.controller";

export async function POST(req: NextRequest) {
  return previewAvailabilityChangeController(req);
}
