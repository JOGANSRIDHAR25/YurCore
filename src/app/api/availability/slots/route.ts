import { NextRequest } from "next/server";
import { getSlotsController } from "@/backend/controller/availability.controller";

export async function GET(req: NextRequest) {
  return getSlotsController(req);
}
