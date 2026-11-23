import { NextRequest } from "next/server";
import { getMyWeeklyController } from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getMyWeeklyController(req);
}
