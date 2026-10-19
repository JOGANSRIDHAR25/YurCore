import { NextRequest } from "next/server";
import { getUpcomingCallsController } from "@/backend/controller/consultation.controller";

export async function GET(req: NextRequest) {
  return getUpcomingCallsController(req);
}
