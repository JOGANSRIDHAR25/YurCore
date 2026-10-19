import { NextRequest } from "next/server";
import { onboardAssistant } from "@/backend/controller/assistant.controller";

export async function POST(req: NextRequest) {
  return onboardAssistant(req);
}