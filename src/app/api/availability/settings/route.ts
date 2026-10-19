import { NextRequest } from "next/server";
import { updateMySettingsController } from "@/backend/controller/availability.controller";

export async function PUT(req: NextRequest) {
  return updateMySettingsController(req);
}
