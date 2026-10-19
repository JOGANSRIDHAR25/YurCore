import { NextRequest } from "next/server";

import {
  getCalendarAvailabilityController,
  updateCalendarAvailabilityController,
} from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getCalendarAvailabilityController(req);
}

export async function PUT(req: NextRequest) {
  return updateCalendarAvailabilityController(req);
}