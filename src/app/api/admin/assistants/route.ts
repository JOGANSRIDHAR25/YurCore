import { NextRequest } from "next/server";
import { adminListAssistants, adminCreateAssistant } from "@/backend/controller/assistant.controller";

export async function GET(req: NextRequest) {
  return adminListAssistants(req);
}

export async function POST(req: NextRequest) {
  return adminCreateAssistant(req);
}