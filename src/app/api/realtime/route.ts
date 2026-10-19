import { NextRequest } from "next/server";
import { getRealtimeTopicsController } from "@/backend/controller/realtime.controller";

export async function GET(req: NextRequest) {
  return getRealtimeTopicsController(req);
}
