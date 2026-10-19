import { NextRequest } from "next/server";
import { getAnalyticsController } from "@/backend/controller/analytics.controller";

export async function GET(req: NextRequest) {
  return getAnalyticsController(req);
}
