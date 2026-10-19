import { NextRequest } from "next/server";
import { getMonthCountsController } from "@/backend/controller/queue.controller";

export async function GET(req: NextRequest) {
  return getMonthCountsController(req);
}
