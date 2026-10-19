import { NextRequest } from "next/server";
import { BookingDraftController } from "@/backend/controller/booking-draft.controller";

export async function POST(request: NextRequest) {
  return BookingDraftController.create(request);
}

export async function GET(request: NextRequest) {
  return BookingDraftController.get(request);
}
