import { NextRequest } from "next/server";
import { BookingController } from "@/backend/controller/booking.controller";

export async function GET(request: NextRequest) {
  return BookingController.getAppointments(request);
}

export async function POST(request: NextRequest) {
  return BookingController.bookAppointment(request);
}