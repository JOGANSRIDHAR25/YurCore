import { NextRequest, NextResponse } from "next/server";
import { CommunityService } from "../service/community.service";
import { requireAuth } from "@/shared/auth/require-auth";
import { AppError } from "@/shared/api/api-error";

function fail(error: unknown, fallback: number) {
  console.error("community controller error:", error);
  const status = error instanceof AppError ? error.statusCode : fallback;
  const message = error instanceof Error ? error.message : "Internal server error";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function getCommunityController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const view = req.nextUrl.searchParams.get("view");
    const data = view === "messages" ? await CommunityService.listMessages(authUser) : await CommunityService.getState(authUser);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function postCommunityController(req: NextRequest) {
  try {
    const authUser = await requireAuth(req);
    const { action, payload = {} } = await req.json();

    let data: unknown = undefined;

    switch (action) {
      case "join":
        await CommunityService.join(authUser);
        break;
      case "leave":
        await CommunityService.leave(authUser);
        break;
      case "sendMessage":
        await CommunityService.sendMessage(authUser, payload.content, payload.replyToId, payload.attachment);
        break;
      case "react":
        await CommunityService.react(authUser, payload.messageId, payload.emoji);
        break;
      case "attachmentUpload":
        data = await CommunityService.createAttachmentUpload(authUser, payload.fileName, payload.fileType, Number(payload.fileSize));
        break;
      default:
        throw new AppError("Unknown action", 400);
    }
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return fail(error, 400);
  }
}
