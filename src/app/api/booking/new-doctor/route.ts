import { NextRequest } from "next/server";
import { bookNewDoctorAppointmentController } from "@/backend/controller/discover.controller";

export async function POST(req: NextRequest) {
  return bookNewDoctorAppointmentController(req);
}
