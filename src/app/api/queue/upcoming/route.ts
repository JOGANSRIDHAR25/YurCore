import { NextRequest } from "next/server";
import { getUpcomingAppointmentsController } from "@/backend/controller/queue.controller";

export async function GET(req: NextRequest) {
  return getUpcomingAppointmentsController(req);
}
