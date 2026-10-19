import { NextRequest } from "next/server";
import { getMessageController, sendMessageController } from "@/backend/controller/message.controller";

export async function GET(req: NextRequest) {
  return getMessageController(req);
}

export async function POST(req: NextRequest) {
  return sendMessageController(req);
}
