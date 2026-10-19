import { NextRequest } from "next/server";
import { createAttachmentUploadController } from "@/backend/controller/message.controller";

export async function POST(req: NextRequest) {
  return createAttachmentUploadController(req);
}
