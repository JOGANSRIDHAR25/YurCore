import { NextRequest } from "next/server";
import { adminUpdateAssistantStatusController } from "@/backend/controller/assistant.controller";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  return adminUpdateAssistantStatusController(req, context);
}