import { NextRequest } from "next/server";
import { BookingController } from "@/backend/controller/booking.controller";

export async function POST(request: NextRequest) {
  return BookingController.submitRating(request);
}