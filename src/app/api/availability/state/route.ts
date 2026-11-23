import { NextRequest } from "next/server";
import {
  getMyAvailabilityStateController,
  updateMyAvailabilityStateController,
} from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getMyAvailabilityStateController(req);
}

export async function PUT(req: NextRequest) {
  return updateMyAvailabilityStateController(req);
}
