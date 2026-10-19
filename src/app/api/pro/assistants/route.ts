import { NextRequest } from "next/server";
import { listMyAssistants } from "@/backend/controller/assistant.controller";

export async function GET(req: NextRequest) {
  return listMyAssistants(req);
}