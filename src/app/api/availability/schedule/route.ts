import { NextRequest } from "next/server";
import { getMySchedulesController, updateMySchedulesController } from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getMySchedulesController(req);
}

export async function PUT(req: NextRequest) {
  return updateMySchedulesController(req);
}
