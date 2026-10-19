import { NextRequest } from "next/server";
import { getAvailableDatesController } from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getAvailableDatesController(req);
}
