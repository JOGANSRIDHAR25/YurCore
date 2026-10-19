import { NextRequest } from "next/server";
import { getTodayQueueController } from "@/backend/controller/queue.controller";

export async function GET(req: NextRequest) {
  return getTodayQueueController(req);
}
