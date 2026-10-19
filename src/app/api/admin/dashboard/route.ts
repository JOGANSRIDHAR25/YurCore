import { NextRequest } from "next/server";
import { getDashboardStatsController } from "@/backend/controller/admin.controller";

export async function GET(req: NextRequest) {
  return getDashboardStatsController(req);
}
