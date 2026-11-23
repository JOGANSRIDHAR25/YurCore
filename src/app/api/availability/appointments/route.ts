import { NextRequest } from "next/server";
import { getMyAppointmentsController } from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getMyAppointmentsController(req);
}
