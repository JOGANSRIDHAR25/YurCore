import { NextRequest } from "next/server";
import { BookingController } from "@/backend/controller/booking.controller";
export async function PATCH(request: NextRequest) {
  return BookingController.cancelAppointment(request);
}