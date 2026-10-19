import { NextRequest } from "next/server";
import { getMyBlockedDatesController } from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getMyBlockedDatesController(req);
}
