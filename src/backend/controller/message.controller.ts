import { NextRequest, NextResponse } from "next/server";
import { MessageService } from "../service/message.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Internal server error";
}

export async function getMessageController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const consultationId = req.nextUrl.searchParams.get("consultationId") ?? "";
    const data = await MessageService.getMessages(authUser, consultationId);
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("getMessageController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 500;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function sendMessageController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();
    await MessageService.sendMessage(authUser, body.consultationId, body.content ?? "", body.attachment, body.replyToId);
    return NextResponse.json({ success: true, message: "Message sent successfully" }, { status: 201 });
  } catch (error: unknown) {
    console.error("sendMessageController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}

export async function createAttachmentUploadController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const body = await req.json();
    const data = await MessageService.createAttachmentUpload(
      authUser,
      body.consultationId,
      body.fileName,
      body.fileType,
      Number(body.fileSize)
    );
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    console.error("createAttachmentUploadController error:", error);
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    return NextResponse.json({ success: false, error: getErrorMessage(error) }, { status: statusCode });
  }
}
